# ================================================================
# Script para arreglar permisos de AdminPermissions
# Solo SuperAdmin debe tener acceso a esta vista
# ================================================================

Write-Host "================================" -ForegroundColor Cyan
Write-Host "ARREGLO: AdminPermissions" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Ejecutar SQL
Write-Host "[1/3] Ejecutando script SQL en la base de datos..." -ForegroundColor Yellow

$sqlScript = @"
USE SQLGuardObservatory;

-- Eliminar permisos incorrectos
DELETE FROM RolePermissions 
WHERE ViewName = 'AdminPermissions' 
  AND Role IN ('Admin', 'Reader');

-- Asegurar que SuperAdmin tiene acceso
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'SuperAdmin' AND ViewName = 'AdminPermissions')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('SuperAdmin', 'AdminPermissions', 1);
END
ELSE
BEGIN
    UPDATE RolePermissions 
    SET Enabled = 1 
    WHERE Role = 'SuperAdmin' AND ViewName = 'AdminPermissions';
END

-- Mostrar resultado
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE ViewName = 'AdminPermissions'
ORDER BY Role;
"@

try {
    # Ejecutar usando SQL Server Authentication con sqlcmd
    $sqlScript | sqlcmd -S "localhost" -d "SQLGuardObservatory" -E
    Write-Host "✓ SQL ejecutado correctamente" -ForegroundColor Green
} catch {
    Write-Host "✗ Error al ejecutar SQL: $_" -ForegroundColor Red
    Write-Host "Por favor ejecuta manualmente: SQLGuardObservatory.API\SQL\FixAdminPermissionsView.sql" -ForegroundColor Yellow
}

Write-Host ""

# Paso 2: Compilar Backend
Write-Host "[2/3] Compilando Backend..." -ForegroundColor Yellow
Set-Location -Path "SQLGuardObservatory.API"

try {
    dotnet publish -c Release -o C:\Temp\Backend
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Backend compilado correctamente" -ForegroundColor Green
    } else {
        throw "Error en compilación"
    }
} catch {
    Write-Host "✗ Error al compilar backend" -ForegroundColor Red
    Set-Location -Path ".."
    exit 1
}

Set-Location -Path ".."
Write-Host ""

# Paso 3: Compilar Frontend
Write-Host "[3/3] Compilando Frontend..." -ForegroundColor Yellow

try {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Frontend compilado correctamente" -ForegroundColor Green
    } else {
        throw "Error en compilación"
    }
} catch {
    Write-Host "✗ Error al compilar frontend" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✓ COMPLETADO" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cambios realizados:" -ForegroundColor White
Write-Host "  1. AdminPermissions solo visible para SuperAdmin" -ForegroundColor White
Write-Host "  2. Backend: SuperAdmin recibe TODOS los permisos automáticamente" -ForegroundColor White
Write-Host "  3. Frontend: Sidebar verifica hasPermission correctamente" -ForegroundColor White
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Despliega el backend: copy C:\Temp\Backend\* al servidor IIS" -ForegroundColor White
Write-Host "  2. Despliega el frontend: copy dist\* al servidor IIS" -ForegroundColor White
Write-Host "  3. Cierra sesión y vuelve a iniciar" -ForegroundColor White
Write-Host "  4. Verifica que solo SuperAdmin ve 'Permisos' en el menú" -ForegroundColor White
Write-Host ""

