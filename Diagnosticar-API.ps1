<#
.SYNOPSIS
    Diagnostica la estructura del JSON de la API de inventario
    
.DESCRIPTION
    Este script muestra exactamente qué propiedades devuelve la API
    para que podamos ajustar los scripts correctamente.
#>

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  DIAGNÓSTICO DE API - Estructura JSON                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"

Write-Host "1️⃣  Obteniendo respuesta de la API..." -ForegroundColor Yellow
Write-Host "   URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    
    Write-Host "✅ API respondió correctamente" -ForegroundColor Green
    Write-Host ""
    
    # ===== PASO 1: Ver tipo de $response =====
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "PASO 1: Tipo de `$response" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Host "`$response.GetType():" -ForegroundColor Gray
    $response.GetType().FullName
    Write-Host ""
    
    # ===== PASO 2: Propiedades de $response =====
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "PASO 2: Propiedades de `$response" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    $response | Get-Member -MemberType Properties | Format-Table Name, MemberType, Definition -AutoSize
    Write-Host ""
    
    # ===== PASO 3: Ver contenido de $response.message =====
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "PASO 3: Contenido de `$response.message" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    if ($response.message) {
        Write-Host "✅ `$response.message existe" -ForegroundColor Green
        Write-Host ""
        
        # Tipo de $response.message
        Write-Host "Tipo: $($response.message.GetType().FullName)" -ForegroundColor Gray
        Write-Host ""
        
        # ¿Es un array?
        if ($response.message -is [Array]) {
            Write-Host "✅ Es un array con $($response.message.Count) elementos" -ForegroundColor Green
        } else {
            Write-Host "⚠️  NO es un array directo" -ForegroundColor Yellow
        }
        Write-Host ""
        
        # Ver primeras 3 instancias
        Write-Host "Primeras 3 instancias:" -ForegroundColor Cyan
        Write-Host ""
        
        $response.message | Select-Object -First 3 | ForEach-Object {
            Write-Host "─────────────────────────────────────────────────────" -ForegroundColor Gray
            $_ | Format-List *
        }
        
    } else {
        Write-Host "❌ `$response.message NO existe o está vacío" -ForegroundColor Red
        Write-Host ""
        Write-Host "Contenido de `$response:" -ForegroundColor Yellow
        $response | Format-List *
    }
    
    # ===== PASO 4: Intentar obtener instancias de diferentes formas =====
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "PASO 4: Intentar diferentes formas de acceder" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    # Opción A: $response.message directo
    Write-Host "A) `$response.message | Select-Object -First 1" -ForegroundColor Gray
    $testA = $response.message | Select-Object -First 1
    if ($testA) {
        Write-Host "   ✅ Funciona - Primera instancia:" -ForegroundColor Green
        $testA | Format-List *
    } else {
        Write-Host "   ❌ Devuelve vacío" -ForegroundColor Red
    }
    Write-Host ""
    
    # Opción B: Acceso directo al índice
    Write-Host "B) `$response.message[0]" -ForegroundColor Gray
    if ($response.message -and $response.message.Count -gt 0) {
        $testB = $response.message[0]
        if ($testB) {
            Write-Host "   ✅ Funciona - Primera instancia:" -ForegroundColor Green
            $testB | Format-List *
        } else {
            Write-Host "   ❌ Devuelve vacío" -ForegroundColor Red
        }
    } else {
        Write-Host "   ❌ No hay elementos en el array" -ForegroundColor Red
    }
    Write-Host ""
    
    # Opción C: ForEach-Object
    Write-Host "C) `$response.message | ForEach-Object { ... }" -ForegroundColor Gray
    $testC = $response.message | Select-Object -First 1 | ForEach-Object { $_ }
    if ($testC) {
        Write-Host "   ✅ Funciona" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Devuelve vacío" -ForegroundColor Red
    }
    Write-Host ""
    
    # ===== PASO 5: Buscar propiedad con nombre de instancia =====
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "PASO 5: ¿Qué propiedad contiene el nombre?" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    $firstInstance = $response.message | Select-Object -First 1
    if ($firstInstance) {
        Write-Host "Propiedades de la primera instancia:" -ForegroundColor Cyan
        Write-Host ""
        $firstInstance.PSObject.Properties | ForEach-Object {
            $propName = $_.Name
            $propValue = $_.Value
            
            # Resaltar propiedades que parecen contener nombre de instancia
            if ($propName -match "nombre|name|instance|server") {
                Write-Host "   👉 $propName = $propValue" -ForegroundColor Green
            } else {
                Write-Host "   $propName = $propValue" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ No se pudo obtener la primera instancia" -ForegroundColor Red
    }
    
    # ===== RESUMEN =====
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║  RESUMEN                                              ║" -ForegroundColor Green
    Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
    
    if ($response.message -and ($response.message | Select-Object -First 1)) {
        $first = $response.message | Select-Object -First 1
        
        # Buscar propiedad con nombre de instancia
        $instanceNameProperty = $null
        $possibleNames = @('nombreInstancia', 'name', 'instanceName', 'serverName', 'server', 'NombreInstancia')
        
        foreach ($prop in $possibleNames) {
            if ($first.PSObject.Properties.Name -contains $prop) {
                $instanceNameProperty = $prop
                break
            }
        }
        
        if ($instanceNameProperty) {
            Write-Host "║  ✅ Propiedad encontrada: $instanceNameProperty".PadRight(53) "║" -ForegroundColor White
            Write-Host "║  ✅ Valor ejemplo: $($first.$instanceNameProperty)".PadRight(53) "║" -ForegroundColor White
        } else {
            Write-Host "║  ⚠️  No se encontró propiedad obvia para el nombre".PadRight(53) "║" -ForegroundColor Yellow
            Write-Host "║  📝 Revisa PASO 5 arriba para identificarla manualmente".PadRight(53) "║" -ForegroundColor White
        }
        
    } else {
        Write-Host "║  ❌ No se pudieron obtener instancias".PadRight(53) "║" -ForegroundColor Red
    }
    
    Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    
    # ===== INSTRUCCIONES =====
    Write-Host "📝 PRÓXIMOS PASOS:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Revisa el PASO 5 arriba" -ForegroundColor White
    Write-Host "2. Identifica qué propiedad contiene el nombre de la instancia" -ForegroundColor White
    Write-Host "3. Avísame cuál es la propiedad correcta" -ForegroundColor White
    Write-Host "4. Actualizaré los scripts para usar esa propiedad" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Error "❌ Error obteniendo datos de la API: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Detalles del error:" -ForegroundColor Yellow
    Write-Host $_.Exception | Format-List * -Force
}

