# 🚀 Guía Rápida: Desplegar HealthScore

## Pasos para Desplegar

### 1️⃣ Aplicar Permisos en Base de Datos

```powershell
cd SQLGuardObservatory.API\SQL
.\Apply-HealthScorePermission.ps1
```

Esto agregará el permiso `HealthScore` a los roles `Admin` y `SuperAdmin`.

---

### 2️⃣ Compilar Backend

```powershell
cd SQLGuardObservatory.API
dotnet build -c Release
```

---

### 3️⃣ Reiniciar API (Windows Service)

```powershell
Restart-Service -Name "SQLGuardObservatory.API"
```

O si está ejecutando manualmente:
```powershell
cd SQLGuardObservatory.API
dotnet run --urls "http://0.0.0.0:5000"
```

---

### 4️⃣ Build Frontend

```powershell
npm run build
```

---

### 5️⃣ Deploy Frontend

```powershell
.\deploy-frontend.ps1
```

---

## ✅ Verificar Funcionamiento

1. **Login** en la aplicación
2. En el **Overview**, deberías ver una nueva tarjeta "**Health Score**" como primera tarjeta
3. **Click** en la tarjeta para ir a la vista completa
4. Deberías ver una tabla con todas las instancias y sus scores
5. **Expandir** una fila para ver los detalles JSON parseados

---

## 🔧 Troubleshooting

### Error: "No se pudieron cargar los health scores"

**Causa**: No hay datos en la tabla `InstanceHealthSnapshot`.

**Solución**: Ejecutar el script PowerShell para poblar datos:
```powershell
cd scripts
.\RelevamientoHealthScoreMant.ps1
```

Asegúrate de tener configurado:
```powershell
# En RelevamientoHealthScoreMant.ps1
$WriteToSql = $true
```

---

### Error: "Unauthorized" o "403 Forbidden"

**Causa**: El permiso no está configurado correctamente.

**Solución**: 
1. Verifica que el usuario tenga rol `Admin` o `SuperAdmin`:
   ```sql
   SELECT u.UserName, r.Name 
   FROM AspNetUsers u
   JOIN AspNetUserRoles ur ON u.Id = ur.UserId
   JOIN AspNetRoles r ON ur.RoleId = r.Id
   ```

2. Verifica que el permiso exista:
   ```sql
   SELECT r.Name, rp.ViewName, rp.CanView
   FROM RolePermissions rp
   JOIN AspNetRoles r ON rp.RoleId = r.Id
   WHERE rp.ViewName = 'HealthScore'
   ```

3. Si falta, ejecuta:
   ```powershell
   .\Apply-HealthScorePermission.ps1
   ```

---

### Error: "La tarjeta no es clickeable"

**Causa**: Falta actualizar el frontend.

**Solución**: 
```powershell
npm run build
.\deploy-frontend.ps1
```

---

### Error: "No aparece en el sidebar"

**Causa**: 
1. Falta permiso en base de datos
2. Frontend no actualizado
3. Usuario sin permisos

**Solución**:
1. Aplicar permisos: `.\Apply-HealthScorePermission.ps1`
2. Build frontend: `npm run build && .\deploy-frontend.ps1`
3. Logout/Login para refrescar permisos

---

## 📊 Datos de Prueba

Si quieres generar datos de prueba rápidamente:

```powershell
cd scripts

# Modo prueba (5 instancias)
# Editar RelevamientoHealthScoreMant.ps1:
$TestMode = $true
$WriteToSql = $true

.\RelevamientoHealthScoreMant.ps1
```

---

## 🔍 Verificar API

### Test 1: Summary
```powershell
$token = "tu_token_jwt"
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:5000/api/healthscore/summary" -Headers $headers
```

### Test 2: Full Data
```powershell
$token = "tu_token_jwt"
$headers = @{ Authorization = "Bearer $token" }
Invoke-RestMethod -Uri "http://localhost:5000/api/healthscore" -Headers $headers
```

---

## 📁 Archivos Importantes

| Archivo | Propósito |
|---------|-----------|
| `src/pages/HealthScore.tsx` | Vista principal |
| `src/pages/Overview.tsx` | Tarjeta KPI |
| `SQLGuardObservatory.API/Controllers/HealthScoreController.cs` | API endpoint |
| `SQLGuardObservatory.API/Services/HealthScoreService.cs` | Lógica de negocio |
| `SQLGuardObservatory.API/SQL/AddHealthScorePermission.sql` | Script de permisos |

---

## 🎯 Resultado Esperado

Al terminar, deberías tener:

✅ Tarjeta "Health Score" en Overview (clickeable)
✅ Vista completa en `/healthscore` con tabla de instancias
✅ Filtros por Estado, Ambiente, Hosting
✅ Detalles expandibles con JSON parseados
✅ Estadísticas en tarjetas superiores (Total, Healthy, Warning, Critical, Avg)
✅ Item "HealthScore" en el sidebar
✅ Permisos configurados para Admin/SuperAdmin

---

## 💡 Tips

1. **Primera ejecución**: Usa modo prueba para verificar rápidamente
   ```powershell
   # En RelevamientoHealthScoreMant.ps1
   $TestMode = $true
   $TestLimit = 5
   $WriteToSql = $true
   ```

2. **Colores automáticos**: 
   - Verde: Score >= 90
   - Amarillo: Score 70-89
   - Rojo: Score < 70

3. **Actualización**: Los datos se actualizan cada vez que ejecutas el script PowerShell

4. **Performance**: La consulta obtiene solo el último snapshot por instancia

---

## 📞 Soporte

Si tienes problemas, revisa:
1. Logs del servicio API: `C:\ProgramData\SQLGuardObservatory\logs\`
2. Consola del navegador (F12)
3. SQL Server logs
4. Documentación completa: `IMPLEMENTACION_HEALTHSCORE_FRONTEND.md`

