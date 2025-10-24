# 🚀 Guía de Despliegue - Health Score V2

## 📦 Archivos a copiar al Windows Server

### 1️⃣ Backend (.NET 8 API)

**Archivos modificados:**
```
SQLGuardObservatory.API/
├── Models/HealthScoreV2Models.cs          ← NUEVO
├── DTOs/HealthScoreV2Dto.cs               ← NUEVO
├── Data/SQLNovaDbContext.cs               ← MODIFICADO
├── Services/IHealthScoreV2Service.cs      ← NUEVO
├── Services/HealthScoreV2Service.cs       ← NUEVO
├── Controllers/HealthScoreV2Controller.cs ← NUEVO
└── Program.cs                             ← MODIFICADO (línea 84)
```

### 2️⃣ Frontend (React/Next.js)

**Archivos modificados:**
```
src/
├── components/
│   ├── layout/AppSidebar.tsx              ← MODIFICADO (agregado link)
│   └── HealthScoreV2TrendChart.tsx        ← NUEVO
├── pages/
│   ├── HealthScoreV2.tsx                  ← NUEVO
│   └── HealthScoreV2Detail.tsx            ← NUEVO
├── services/api.ts                        ← MODIFICADO
└── App.tsx                                ← MODIFICADO
```

### 3️⃣ Base de Datos (SQL Server - SQLNova)

**Scripts a ejecutar (EN ORDEN):**
```
SQLNova/
├── 01c_Migrar_Tablas_Existentes_V2.sql    ← Tablas
├── 01d_Tabla_HealthScore_History.sql       ← Histórico
├── 02_Views_HealthScore_V2.sql             ← Vistas de scores
├── 03_Views_HealthFinal_V2.sql             ← Vista final con caps
├── 04_Security_V2.sql                      ← Permisos
└── 06_SQLAgent_Job_Materializar.sql        ← Job automático
```

---

## 🔧 Pasos de Despliegue

### PASO 1: Base de Datos (SQL Server)

Conectarte a tu SQL Server central y ejecutar:

```powershell
# Desde PowerShell en el servidor
cd C:\ruta\sql-guard-observatory\SQLNova

# Ejecutar scripts en orden
sqlcmd -S SSPR17MON-01 -d SQLNova -i 01c_Migrar_Tablas_Existentes_V2.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 01d_Tabla_HealthScore_History.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 02_Views_HealthScore_V2.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 03_Views_HealthFinal_V2.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 04_Security_V2.sql
sqlcmd -S SSPR17MON-01 -d msdb -i 06_SQLAgent_Job_Materializar.sql

# Primera materialización
sqlcmd -S SSPR17MON-01 -d SQLNova -Q "EXEC dbo.usp_MaterializarHealthScores_V2"
```

**Verificar:**
```sql
-- Debe devolver filas
SELECT * FROM dbo.vw_HealthFinal_V2;
SELECT * FROM dbo.HealthScoreHistoryV2;
```

---

### PASO 2: Backend (.NET 8 API)

```powershell
# Detener el servicio actual
Stop-Service "SQLGuardObservatory.API"  # Ajustar nombre

# Copiar archivos actualizados (desde tu máquina local al servidor)
# Usar RDP, WinSCP, o compartir red

# En el servidor, recompilar
cd C:\ruta\SQLGuardObservatory.API
dotnet build --configuration Release

# Publicar
dotnet publish --configuration Release --output C:\Publish\SQLGuardObservatory

# Reiniciar servicio
Start-Service "SQLGuardObservatory.API"

# Ver logs para verificar que arrancó bien
Get-Content C:\ruta\logs\api.log -Tail 50
```

**Verificar endpoints:**
```powershell
# Desde PowerShell
Invoke-RestMethod -Uri "http://localhost:5000/api/v2/healthscore" -Method GET
```

---

### PASO 3: Frontend (React)

```powershell
# En tu máquina LOCAL, compilar frontend actualizado
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
npm run build

# Copiar la carpeta dist/ al servidor
# Desde tu máquina:
Copy-Item -Path .\dist\* -Destination \\SERVIDOR\C$\inetpub\wwwroot\sqlguard\ -Recurse -Force

# O si usas IIS, publicar desde Visual Studio/npm script
```

**Verificar:**
- Abrir navegador: `http://servidor/`
- Deberías ver "HealthScore V2" en el sidebar
- Click en HealthScore V2 → debería cargar la nueva vista

---

## 🧪 Verificación Post-Despliegue

### ✅ Checklist:

- [ ] Base de datos: `SELECT * FROM dbo.vw_HealthFinal_V2` devuelve datos
- [ ] Backend: `GET /api/v2/healthscore` responde 200 OK
- [ ] Frontend: Sidebar muestra "HealthScore V2" con ícono 💓
- [ ] Frontend: Click en HealthScore V2 carga la tabla
- [ ] SQL Agent Job: Se ejecuta cada 10 minutos

### 🔍 Troubleshooting:

**Error 500 en API:**
```powershell
# Ver logs del backend
Get-Content C:\Logs\SQLGuardObservatory\api-*.log -Tail 100

# Verificar connection string
Get-Content C:\Publish\SQLGuardObservatory\appsettings.json | Select-String "SQLNova"
```

**Frontend no carga:**
```powershell
# Verificar que los archivos estén actualizados
Get-ChildItem C:\inetpub\wwwroot\sqlguard\assets\*.js | Sort-Object LastWriteTime -Descending | Select -First 5
```

**Vistas SQL no existen:**
```sql
-- Verificar que las vistas V2 existan
SELECT name FROM sys.views WHERE name LIKE '%_V2' ORDER BY name;
```

---

## 📞 Soporte

Si algo falla:
1. Verificar logs del backend (eventos 500)
2. Ejecutar: `SELECT * FROM dbo.CollectorLog ORDER BY LoggedAt DESC`
3. Ver SQL Agent Job History: `EXEC msdb.dbo.sp_help_jobhistory @job_name = 'HealthScore V2 - Materializar Scores'`

---

## 🎯 Resumen Rápido

```bash
# 1. SQL
sqlcmd -S SSPR17MON-01 -d SQLNova -i 01c_*.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 01d_*.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 02_*.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 03_*.sql
sqlcmd -S SSPR17MON-01 -d SQLNova -i 04_*.sql
sqlcmd -S SSPR17MON-01 -d msdb -i 06_*.sql

# 2. Backend
dotnet publish --configuration Release
# Copiar archivos → Reiniciar servicio

# 3. Frontend
npm run build
# Copiar dist/ → Servidor IIS
```

