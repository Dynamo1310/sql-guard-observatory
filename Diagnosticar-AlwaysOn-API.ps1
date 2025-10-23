<#
.SYNOPSIS
    Diagnóstico: ¿Qué valores de AlwaysOn devuelve la API?
#>

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"

Write-Host "🔍 Diagnosticando valores de AlwaysOn en la API..." -ForegroundColor Cyan
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "PASO 1: ¿Existe la propiedad 'AlwaysOn' en las instancias?" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    
    $firstInstance = $response | Select-Object -First 1
    
    if ($firstInstance.PSObject.Properties.Name -contains "AlwaysOn") {
        Write-Host "✅ SÍ, la propiedad 'AlwaysOn' existe" -ForegroundColor Green
    } else {
        Write-Host "❌ NO, la propiedad 'AlwaysOn' NO existe" -ForegroundColor Red
        Write-Host ""
        Write-Host "Propiedades disponibles:" -ForegroundColor Yellow
        $firstInstance.PSObject.Properties.Name | Sort-Object | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "PASO 2: Valores únicos de AlwaysOn en la API" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    
    if ($response[0].PSObject.Properties.Name -contains "AlwaysOn") {
        $uniqueValues = $response | Select-Object -ExpandProperty AlwaysOn -Unique | Sort-Object
        Write-Host "Valores únicos encontrados:" -ForegroundColor Cyan
        foreach ($value in $uniqueValues) {
            $count = ($response | Where-Object { $_.AlwaysOn -eq $value }).Count
            Write-Host "  • '$value' → $count instancias" -ForegroundColor White
        }
    } else {
        Write-Host "⚠️ No se puede analizar porque la propiedad no existe" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "PASO 3: Instancias con AlwaysOn habilitado (primeras 10)" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    
    if ($response[0].PSObject.Properties.Name -contains "AlwaysOn") {
        $alwaysOnInstances = $response | Where-Object { $_.AlwaysOn -ne $null -and $_.AlwaysOn -ne "" -and $_.AlwaysOn -ne "Disabled" } | Select-Object -First 10
        
        if ($alwaysOnInstances.Count -gt 0) {
            Write-Host "Instancias con AlwaysOn (posiblemente habilitado):" -ForegroundColor Cyan
            foreach ($inst in $alwaysOnInstances) {
                Write-Host "  • $($inst.NombreInstancia) → AlwaysOn: '$($inst.AlwaysOn)'" -ForegroundColor White
            }
        } else {
            Write-Host "❌ No se encontraron instancias con AlwaysOn habilitado" -ForegroundColor Red
        }
    } else {
        Write-Host "⚠️ No se puede analizar porque la propiedad no existe" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "PASO 4: Comparación con el script de Availability" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    
    if ($response[0].PSObject.Properties.Name -contains "AlwaysOn") {
        Write-Host "El script actual busca:" -ForegroundColor Cyan
        Write-Host '  $instance.AlwaysOn -eq "Enabled"' -ForegroundColor Yellow
        Write-Host ""
        
        $matchCount = ($response | Where-Object { $_.AlwaysOn -eq "Enabled" }).Count
        Write-Host "Instancias que coinciden con 'Enabled' (exacto): $matchCount" -ForegroundColor $(if ($matchCount -gt 0) { "Green" } else { "Red" })
        
        # Probar otras variaciones
        $matchCountLower = ($response | Where-Object { $_.AlwaysOn -eq "enabled" }).Count
        Write-Host "Instancias que coinciden con 'enabled' (minúsculas): $matchCountLower" -ForegroundColor $(if ($matchCountLower -gt 0) { "Green" } else { "Red" })
        
        $matchCountTrue = ($response | Where-Object { $_.AlwaysOn -eq "True" -or $_.AlwaysOn -eq $true }).Count
        Write-Host "Instancias que coinciden con 'True' o boolean true: $matchCountTrue" -ForegroundColor $(if ($matchCountTrue -gt 0) { "Green" } else { "Red" })
        
        Write-Host ""
        Write-Host "💡 Recomendación:" -ForegroundColor Cyan
        if ($matchCount -gt 0) {
            Write-Host "   ✅ El script está correcto, la API devuelve 'Enabled'" -ForegroundColor Green
        } elseif ($matchCountLower -gt 0) {
            Write-Host "   ⚠️ La API devuelve 'enabled' (minúsculas), cambiar a:" -ForegroundColor Yellow
            Write-Host '      $instance.AlwaysOn -eq "enabled"' -ForegroundColor White
        } elseif ($matchCountTrue -gt 0) {
            Write-Host "   ⚠️ La API devuelve True/boolean, cambiar a:" -ForegroundColor Yellow
            Write-Host '      $instance.AlwaysOn -eq "True" -or $instance.AlwaysOn -eq $true' -ForegroundColor White
        } else {
            Write-Host "   ❌ Ninguna instancia tiene AlwaysOn='Enabled'" -ForegroundColor Red
            Write-Host "      Verificar los valores únicos en PASO 2" -ForegroundColor White
        }
    } else {
        Write-Host "⚠️ La propiedad 'AlwaysOn' no existe en la API" -ForegroundColor Red
        Write-Host "   Posibles nombres alternativos:" -ForegroundColor Yellow
        $possibleNames = $firstInstance.PSObject.Properties.Name | Where-Object { $_ -like "*Always*" -or $_ -like "*AG*" -or $_ -like "*Availability*" }
        if ($possibleNames) {
            $possibleNames | ForEach-Object { Write-Host "     • $_" -ForegroundColor White }
        } else {
            Write-Host "     (No se encontraron propiedades relacionadas)" -ForegroundColor Gray
        }
    }
    
} catch {
    Write-Error "❌ Error al consultar API: $($_.Exception.Message)"
    exit 1
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "Diagnóstico completado" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green

