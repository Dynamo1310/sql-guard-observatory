# Relevamiento de Espacios en Disco

## 📋 Descripción

Script de PowerShell que releva el estado de los discos de las instancias SQL Server **ON-PREMISES** (excluye AWS y DMZ), consultando la API de inventario y usando `dbatools` para obtener información detallada de espacios en disco.

## 🚀 Uso Rápido

### 1. Ejecutar el relevamiento

```powershell
# Modo producción (todas las instancias ON-PREMISES)
.\RelevamientoDiscosMant.ps1

# Modo prueba (5 instancias)
# Editar el script: $TestMode = $true
.\RelevamientoDiscosMant.ps1
```

### 2. Crear la tabla manualmente (opcional)

El script crea automáticamente la tabla, pero si prefieres crearla manualmente:

```powershell
# Ejecutar el script SQL
sqlcmd -S SSPR17MON-01 -d SQLNova -i AlterInventarioDiscosSnapshotTable.sql
```

## 📊 Estados de Discos

| Estado | Criterio | Color |
|--------|----------|-------|
| 🟢 **Saludable** | > 20% libre | Verde |
| 🟡 **Advertencia** | 10-20% libre | Amarillo |
| 🔴 **Crítico** | < 10% libre | Rojo |

## 🔧 Configuración

Editar las variables en el script `RelevamientoDiscosMant.ps1`:

```powershell
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlTable    = "InventarioDiscosSnapshot"
$TestMode    = $false  # true para pruebas
$TestLimit   = 5       # Instancias en modo prueba
```

## 📈 Consultas SQL Útiles

### KPIs - Resumen por Estado

```sql
-- Obtener el último snapshot
DECLARE @UltimaCaptura DATETIME2 = (
    SELECT MAX(CaptureDate) 
    FROM dbo.InventarioDiscosSnapshot
)

-- Discos Críticos (< 10% libre)
SELECT COUNT(DISTINCT Servidor + Drive) AS DiscosCriticos
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = @UltimaCaptura
  AND Estado = 'Crítico'

-- Discos en Advertencia (10-20% libre)
SELECT COUNT(DISTINCT Servidor + Drive) AS DiscosAdvertencia
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = @UltimaCaptura
  AND Estado = 'Advertencia'

-- Discos Saludables (> 20% libre)
SELECT COUNT(DISTINCT Servidor + Drive) AS DiscosSaludables
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = @UltimaCaptura
  AND Estado = 'Saludable'
```

### KPIs - Query Completa para Dashboard

```sql
-- KPIs completos en una sola consulta
WITH UltimoSnapshot AS (
    SELECT *
    FROM dbo.InventarioDiscosSnapshot
    WHERE CaptureDate = (SELECT MAX(CaptureDate) FROM dbo.InventarioDiscosSnapshot)
)
SELECT 
    SUM(CASE WHEN Estado = 'Crítico' THEN 1 ELSE 0 END) AS DiscosCriticos,
    SUM(CASE WHEN Estado = 'Advertencia' THEN 1 ELSE 0 END) AS DiscosAdvertencia,
    SUM(CASE WHEN Estado = 'Saludable' THEN 1 ELSE 0 END) AS DiscosSaludables,
    COUNT(*) AS TotalDiscos,
    -- Porcentajes
    CAST(SUM(CASE WHEN Estado = 'Crítico' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS PorcentajeCriticos,
    CAST(SUM(CASE WHEN Estado = 'Advertencia' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS PorcentajeAdvertencia,
    CAST(SUM(CASE WHEN Estado = 'Saludable' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS PorcentajeSaludables
FROM UltimoSnapshot
```

### Detalle por Disco - Para Tabla

```sql
-- Detalle de todos los discos del último snapshot
SELECT 
    Servidor,
    Drive,
    TotalGB,
    LibreGB,
    PorcentajeLibre AS [% Libre],
    Estado,
    Ambiente,
    Hosting,
    CaptureDate
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = (SELECT MAX(CaptureDate) FROM dbo.InventarioDiscosSnapshot)
ORDER BY 
    CASE Estado 
        WHEN 'Crítico' THEN 1 
        WHEN 'Advertencia' THEN 2 
        WHEN 'Saludable' THEN 3 
    END,
    PorcentajeLibre ASC
```

### Top 10 Discos Críticos

```sql
-- Los 10 discos con menos espacio libre
SELECT TOP 10
    Servidor,
    Drive,
    TotalGB,
    LibreGB,
    PorcentajeLibre AS [% Libre],
    Estado
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = (SELECT MAX(CaptureDate) FROM dbo.InventarioDiscosSnapshot)
ORDER BY PorcentajeLibre ASC
```

### Discos por Ambiente

```sql
-- Estadísticas agrupadas por Ambiente
SELECT 
    Ambiente,
    COUNT(*) AS TotalDiscos,
    SUM(CASE WHEN Estado = 'Crítico' THEN 1 ELSE 0 END) AS Criticos,
    SUM(CASE WHEN Estado = 'Advertencia' THEN 1 ELSE 0 END) AS Advertencia,
    SUM(CASE WHEN Estado = 'Saludable' THEN 1 ELSE 0 END) AS Saludables
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = (SELECT MAX(CaptureDate) FROM dbo.InventarioDiscosSnapshot)
GROUP BY Ambiente
ORDER BY Criticos DESC, Advertencia DESC
```

### Histórico de un Disco Específico

```sql
-- Ver la evolución de un disco en el tiempo
SELECT 
    CaptureDate,
    Servidor,
    Drive,
    TotalGB,
    LibreGB,
    PorcentajeLibre,
    Estado
FROM dbo.InventarioDiscosSnapshot
WHERE Servidor = 'SQL-PROD-01'  -- Cambiar por tu servidor
  AND Drive = 'C:'               -- Cambiar por tu drive
ORDER BY CaptureDate DESC
```

### Tendencia de Crecimiento

```sql
-- Ver cómo ha cambiado el espacio libre en las últimas capturas
WITH RankedCaptures AS (
    SELECT 
        Servidor,
        Drive,
        CaptureDate,
        LibreGB,
        PorcentajeLibre,
        ROW_NUMBER() OVER (PARTITION BY Servidor, Drive ORDER BY CaptureDate DESC) AS rn
    FROM dbo.InventarioDiscosSnapshot
)
SELECT 
    actual.Servidor,
    actual.Drive,
    actual.LibreGB AS LibreGB_Actual,
    anterior.LibreGB AS LibreGB_Anterior,
    actual.LibreGB - anterior.LibreGB AS DiferenciaGB,
    actual.CaptureDate AS Fecha_Actual,
    anterior.CaptureDate AS Fecha_Anterior
FROM RankedCaptures actual
LEFT JOIN RankedCaptures anterior 
    ON actual.Servidor = anterior.Servidor 
    AND actual.Drive = anterior.Drive 
    AND anterior.rn = 2
WHERE actual.rn = 1
ORDER BY (actual.LibreGB - anterior.LibreGB) ASC  -- Los que más perdieron espacio
```

## 📝 Estructura de la Tabla

```sql
CREATE TABLE [dbo].[InventarioDiscosSnapshot] (
    [Id]                BIGINT IDENTITY(1,1) PRIMARY KEY,
    [InstanceName]      NVARCHAR(128)  NOT NULL,
    [Ambiente]          NVARCHAR(50)   NULL,
    [Hosting]           NVARCHAR(50)   NULL,
    [Servidor]          NVARCHAR(128)  NOT NULL,
    [Drive]             NVARCHAR(10)   NOT NULL,
    [TotalGB]           DECIMAL(18,2)  NULL,
    [LibreGB]           DECIMAL(18,2)  NULL,
    [PorcentajeLibre]   DECIMAL(5,2)   NULL,
    [Estado]            NVARCHAR(20)   NULL,
    [CaptureDate]       DATETIME2(0)   NOT NULL,
    [InsertedAtUtc]     DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME()
);
```

## ⚙️ Requisitos

- **PowerShell** 5.1 o superior
- **dbatools** (se instala automáticamente si no está presente)
- Acceso a la API de inventario: `http://asprbm-nov-01/InventoryDBA/inventario/`
- Permisos para conectarse a las instancias SQL Server
- Permisos de escritura en la base de datos `SQLNova`

## 🔄 Automatización

Para ejecutar el script de forma programada, crear una tarea en el Programador de Windows:

```powershell
# Programar para ejecutar diariamente a las 6:00 AM
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File C:\Scripts\RelevamientoDiscosMant.ps1"
$Trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM
Register-ScheduledTask -TaskName "RelevamientoDiscos" -Action $Action -Trigger $Trigger -Description "Relevamiento diario de espacios en disco SQL Server"
```

## 🐛 Troubleshooting

### Error: "dbatools no está instalado"
```powershell
Install-Module dbatools -Scope CurrentUser -Force
```

### Error: "No se puede conectar a la instancia"
- Verificar que el nombre de instancia sea correcto
- Verificar conectividad de red
- Verificar permisos de autenticación Windows

### Error: "Access Denied"
- Verificar que la cuenta que ejecuta el script tenga permisos en SQL Server
- Para discos: se requiere acceso administrativo al servidor

## 📊 Ejemplo de Salida

```
=====================================
 Relevamiento Espacios en Disco
=====================================

[1/4] Consultando API...
      ✓ 150 instancias obtenidas

[2/4] Aplicando filtros (solo ON-PREMISES)...
      ✓ 87 instancias ON-PREMISES a procesar

[3/4] Verificando tabla destino...
      ✓ Tabla lista: SSPR17MON-01.SQLNova.dbo.InventarioDiscosSnapshot

[4/4] Procesando instancias...

[1/87] SQL-PROD-01 - 4 discos (1 advertencia)
[2/87] SQL-PROD-02 - 3 discos
[3/87] SQL-DEV-01 - 2 discos (1 crítico)
...

Insertando 312 registros... ✓

=====================================
 RESUMEN
=====================================
Instancias procesadas:  87
Instancias con error:   0
Total discos insertados: 312

DISCOS POR ESTADO:
  Críticos (<10%):      5
  Advertencia (10-20%): 12
  Saludables (>20%):    295

Timestamp: 2025-10-21 14:30:00

Tiempo de ejecución: 00:08:45

✅ Proceso completado exitosamente
```

## 📞 Soporte

Para problemas o sugerencias, contactar al equipo de DBA.

