<#  
    RelevamientoDiscosMant.ps1
    - Consulta la API de inventario
    - Por cada instancia ON-PREMISES (excluye AWS y DMZ), trae el estado de discos usando dbatools
    - Inserta los resultados en la tabla de destino
    - Estados: Saludable (>20%), Advertencia (10-20%), Critico (<10%)
    
    Requisitos: Install-Module dbatools -Scope CurrentUser
#>

# ========= CONFIGURACION =========
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlSchema   = "dbo"
$SqlTable    = "InventarioDiscosSnapshot"
$TimeoutSec  = 90

# ========= MODO DE PRUEBA =========
$TestMode = $false  # Cambiar a $true para pruebas
$TestLimit = 5      # Numero maximo de instancias a procesar en modo prueba

# ========= VERIFICAR DBATOOLS =========
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Host "dbatools no esta instalado. Instalando..." -ForegroundColor Yellow
    try {
        Install-Module dbatools -Scope CurrentUser -Force -AllowClobber
        Write-Host "[OK] dbatools instalado correctamente" -ForegroundColor Green
    } catch {
        Write-Error "No se pudo instalar dbatools: $($_.Exception.Message)"
        Write-Host "Ejecuta manualmente: Install-Module dbatools -Scope CurrentUser" -ForegroundColor Yellow
        exit 1
    }
}

Import-Module dbatools -ErrorAction Stop

# TLS y configuracion de certificados
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Configurar dbatools para ignorar certificados SSL
Set-DbatoolsConfig -FullName sql.connection.trustcert -Value $true -PassThru | Register-DbatoolsConfig
Set-DbatoolsConfig -FullName sql.connection.encrypt -Value $false -PassThru | Register-DbatoolsConfig

# ========= FUNCIONES =========

function Create-TableIfNotExists {
    $tableName = $SqlTable
    $schemaName = $SqlSchema
    
    # Usar here-string con comillas simples para evitar interpretacion de PowerShell
    $createSql = @'
IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name = 'InventarioDiscosSnapshot' AND s.name = 'dbo'
)
BEGIN
    CREATE TABLE [dbo].[InventarioDiscosSnapshot] (
        [Id]                   BIGINT IDENTITY(1,1) PRIMARY KEY,
        [InstanceName]         NVARCHAR(128)  NOT NULL,
        [Ambiente]             NVARCHAR(50)   NULL,
        [Hosting]              NVARCHAR(50)   NULL,
        [Servidor]             NVARCHAR(128)  NOT NULL,
        [Drive]                NVARCHAR(255)  NOT NULL,
        [TotalGB]              DECIMAL(18,2)  NULL,
        [LibreGB]              DECIMAL(18,2)  NULL,
        [PorcentajeLibre]      DECIMAL(5,2)   NULL,
        [Estado]               NVARCHAR(20)   NULL,
        [CaptureDate]          DATETIME2(0)   NOT NULL,
        [InsertedAtUtc]        DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
    
    CREATE INDEX IX_InventarioDiscosSnapshot_Instance_Capture ON [dbo].[InventarioDiscosSnapshot] ([InstanceName], [CaptureDate]);
    CREATE INDEX IX_InventarioDiscosSnapshot_Servidor_Drive ON [dbo].[InventarioDiscosSnapshot] ([Servidor], [Drive], [CaptureDate]);
    CREATE INDEX IX_InventarioDiscosSnapshot_Estado ON [dbo].[InventarioDiscosSnapshot] ([Estado], [CaptureDate]);
END
'@
    
    Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $createSql -EnableException | Out-Null
}

function Get-EstadoDisco {
    param([decimal]$porcentajeLibre)
    
    if ($porcentajeLibre -gt 20) {
        return "Saludable"
    } elseif ($porcentajeLibre -ge 10) {
        return "Advertencia"
    } else {
        return "Critico"
    }
}

# ========= MAIN =========

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Relevamiento Espacios en Disco" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
if ($TestMode) {
    Write-Host ""
    Write-Host "[!] MODO DE PRUEBA ACTIVADO" -ForegroundColor Yellow
    Write-Host "   Limite: $TestLimit instancias" -ForegroundColor Gray
}
Write-Host ""

# Iniciar cronometro
$startTime = Get-Date

# 1. Obtener inventario desde API
Write-Host "[1/4] Consultando API..." -ForegroundColor Cyan
try {
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method GET -Headers @{"Accept"="application/json"} -TimeoutSec 60
    Write-Host "      [OK] $($instances.Count) instancias obtenidas" -ForegroundColor Green
} catch {
    Write-Error "Error al consultar la API: $($_.Exception.Message)"
    exit 1
}

# 2. Filtrar instancias (solo ON-PREMISES: excluir AWS y DMZ)
Write-Host ""
Write-Host "[2/4] Aplicando filtros (solo ON-PREMISES)..." -ForegroundColor Cyan
$instancesFiltered = $instances | Where-Object {
    $name1 = [string]($_.NombreInstancia)
    $name2 = [string]($_.ServerName)
    $hosting = [string]($_.hostingSite)
    
    # Excluir DMZ
    $notDmz = ($name1 -notmatch '(?i)DMZ') -and ($name2 -notmatch '(?i)DMZ')
    
    # Excluir AWS
    $notAws = $hosting -notmatch '^(?i)aws$'
    
    $notDmz -and $notAws
}

# Aplicar filtros de modo de prueba
if ($TestMode) {
    $instancesFiltered = $instancesFiltered | Select-Object -First $TestLimit
    Write-Host "      [OK] $($instancesFiltered.Count) instancias ON-PREMISES a procesar (MODO PRUEBA)" -ForegroundColor Yellow
} else {
    Write-Host "      [OK] $($instancesFiltered.Count) instancias ON-PREMISES a procesar" -ForegroundColor Green
}

if ($instancesFiltered.Count -eq 0) {
    Write-Warning "No hay instancias para procesar despues del filtro"
    exit 0
}

# 3. Crear tabla si no existe
Write-Host ""
Write-Host "[3/4] Verificando tabla destino..." -ForegroundColor Cyan
Create-TableIfNotExists
$tableFullName = "$SqlServer" + "." + "$SqlDatabase" + "." + "$SqlSchema" + "." + "$SqlTable"
Write-Host "      [OK] Tabla lista: $tableFullName" -ForegroundColor Green

# 4. Procesar instancias
Write-Host ""
Write-Host "[4/4] Procesando instancias..." -ForegroundColor Cyan
Write-Host ""

$captureTime = [datetime]::UtcNow
$allResults = @()
$successCount = 0
$errorCount = 0

$counter = 0
foreach ($inst in $instancesFiltered) {
    $counter++
    
    $instanceName = if ($inst.NombreInstancia) { $inst.NombreInstancia } else { $inst.ServerName }
    $serverName = if ($inst.ServerName) { $inst.ServerName } else { $instanceName }
    $ambiente = $inst.ambiente
    $hosting = $inst.hostingSite
    
    if (-not $instanceName) {
        Write-Warning "[$counter/$($instancesFiltered.Count)] Instancia sin nombre - omitida"
        $errorCount++
        continue
    }
    
    Write-Host "[$counter/$($instancesFiltered.Count)] $instanceName" -NoNewline
    
    try {
        # Obtener informacion de discos usando dbatools
        $disks = Get-DbaDiskSpace -ComputerName $serverName -EnableException
        
        if (-not $disks -or $disks.Count -eq 0) {
            Write-Host " - Sin discos detectados" -ForegroundColor Gray
            $successCount++
            continue
        }
        
        $diskCount = 0
        foreach ($disk in $disks) {
            # Calcular porcentaje libre - usar .Byte para obtener el valor numerico
            $totalBytes = if ($disk.Capacity.Byte) { $disk.Capacity.Byte } else { [long]$disk.Capacity }
            $libreBytes = if ($disk.Free.Byte) { $disk.Free.Byte } else { [long]$disk.Free }
            
            $totalGB = [decimal]($totalBytes / 1GB)
            $libreGB = [decimal]($libreBytes / 1GB)
            $porcentajeLibre = if ($totalGB -gt 0) { [decimal](($libreGB / $totalGB) * 100) } else { 0 }
            
            # Determinar estado
            $estado = Get-EstadoDisco -porcentajeLibre $porcentajeLibre
            
            $allResults += [PSCustomObject]@{
                InstanceName     = $instanceName
                Ambiente         = if ($ambiente) { $ambiente } else { $null }
                Hosting          = if ($hosting) { $hosting } else { $null }
                Servidor         = $serverName
                Drive            = $disk.Name
                TotalGB          = [Math]::Round($totalGB, 2)
                LibreGB          = [Math]::Round($libreGB, 2)
                PorcentajeLibre  = [Math]::Round($porcentajeLibre, 2)
                Estado           = $estado
                CaptureDate      = $captureTime
            }
            $diskCount++
        }
        
        # Mostrar resumen con colores segun estado
        $criticos = ($disks | Where-Object { 
            $freeBytes = if ($_.Free.Byte) { $_.Free.Byte } else { [long]$_.Free }
            $capBytes = if ($_.Capacity.Byte) { $_.Capacity.Byte } else { [long]$_.Capacity }
            $pct = if ($capBytes -gt 0) { ($freeBytes / $capBytes) * 100 } else { 0 }
            $pct -lt 10 
        }).Count
        
        $advertencias = ($disks | Where-Object { 
            $freeBytes = if ($_.Free.Byte) { $_.Free.Byte } else { [long]$_.Free }
            $capBytes = if ($_.Capacity.Byte) { $_.Capacity.Byte } else { [long]$_.Capacity }
            $pct = if ($capBytes -gt 0) { ($freeBytes / $capBytes) * 100 } else { 0 }
            $pct -ge 10 -and $pct -le 20 
        }).Count
        
        if ($criticos -gt 0) {
            Write-Host " - $diskCount discos (" -NoNewline
            Write-Host "$criticos criticos" -NoNewline -ForegroundColor Red
            Write-Host ")"
        } elseif ($advertencias -gt 0) {
            Write-Host " - $diskCount discos (" -NoNewline
            Write-Host "$advertencias advertencias" -NoNewline -ForegroundColor Yellow
            Write-Host ")"
        } else {
            Write-Host " - $diskCount discos [OK]" -ForegroundColor Green
        }
        
        $successCount++
        
    } catch {
        Write-Host " - ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
    }
}

# 5. Insertar todos los datos
if ($allResults.Count -gt 0) {
    Write-Host ""
    Write-Host "Insertando $($allResults.Count) registros..." -NoNewline
    try {
        # Usar Write-DbaDataTable de dbatools
        $allResults | Write-DbaDataTable -SqlInstance $SqlServer -Database $SqlDatabase -Table "[$SqlSchema].[$SqlTable]" -AutoCreateTable:$false
        Write-Host " [OK]" -ForegroundColor Green
    } catch {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Error "Error al insertar datos: $($_.Exception.Message)"
    }
}

# 6. Resumen con estadisticas de estados
$estadoCritico = ($allResults | Where-Object { $_.Estado -eq "Critico" }).Count
$estadoAdvertencia = ($allResults | Where-Object { $_.Estado -eq "Advertencia" }).Count
$estadoSaludable = ($allResults | Where-Object { $_.Estado -eq "Saludable" }).Count

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " RESUMEN" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Instancias procesadas:  $successCount" -ForegroundColor Green
Write-Host "Instancias con error:   $errorCount" -ForegroundColor $(if ($errorCount -gt 0) {"Red"} else {"Green"})
Write-Host "Total discos insertados: $($allResults.Count)" -ForegroundColor Cyan
Write-Host ""
Write-Host "DISCOS POR ESTADO:" -ForegroundColor Cyan
Write-Host "  Criticos (<10%):      $estadoCritico" -ForegroundColor $(if ($estadoCritico -gt 0) {"Red"} else {"Green"})
Write-Host "  Advertencia (10-20%): $estadoAdvertencia" -ForegroundColor $(if ($estadoAdvertencia -gt 0) {"Yellow"} else {"Green"})
Write-Host "  Saludables (>20%):    $estadoSaludable" -ForegroundColor Green
Write-Host ""
Write-Host "Timestamp: $captureTime" -ForegroundColor Gray
Write-Host ""

# Calcular tiempo de ejecucion
$endTime = Get-Date
$duration = $endTime - $startTime
$durationFormatted = "{0:00}:{1:00}:{2:00}" -f $duration.Hours, $duration.Minutes, $duration.Seconds

Write-Host "Tiempo de ejecucion: $durationFormatted" -ForegroundColor Cyan
Write-Host ""

if ($TestMode) {
    Write-Host "[!] Ejecutado en MODO DE PRUEBA" -ForegroundColor Yellow
    Write-Host ""
}

if ($errorCount -eq 0) {
    Write-Host "[OK] Proceso completado exitosamente" -ForegroundColor Green
} elseif ($successCount -gt 0) {
    Write-Host "[!] Proceso completado con algunos errores" -ForegroundColor Yellow
} else {
    Write-Host "[ERROR] Proceso fallo" -ForegroundColor Red
}
