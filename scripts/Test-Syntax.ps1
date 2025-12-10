# Script de prueba para validar sintaxis
$errors = $null
$null = [System.Management.Automation.Language.Parser]::ParseFile(
    "C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts\RelevamientoHealthScore_Discos.ps1",
    [ref]$null, 
    [ref]$errors
)

if ($errors.Count -gt 0) {
    Write-Host "ERRORES ENCONTRADOS:" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  Linea $($err.Extent.StartLineNumber): $($err.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "Sin errores de sintaxis" -ForegroundColor Green
}

