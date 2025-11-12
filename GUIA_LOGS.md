# Guía de Gestión de Logs - SQLGuard Observatory

## 📋 Descripción

El backend de SQLGuard Observatory ahora incluye un sistema avanzado de logging con las siguientes características:

- ✅ **Timestamps en UTC-3** (hora de Argentina)
- ✅ **Formato legible** con fecha, hora, nivel y contexto
- ✅ **Rotación automática** de archivos por día
- ✅ **Límite de tamaño** (10 MB por archivo)
- ✅ **Retención automática** (últimos 30 días)
- ✅ **API REST** para gestión de logs
- ✅ **Script PowerShell** para limpieza rápida

---

## 📁 Ubicación de Logs

Los archivos de log se almacenan en:

```
SQLGuardObservatory.API/Logs/
├── sqlguard-20250129.log
├── sqlguard-20250128.log
└── sqlguard-20250127.log
```

---

## 📊 Formato de Logs

Cada línea de log tiene el siguiente formato:

```
[2025-01-29 14:35:42] [INF] SQLGuardObservatory.API.Controllers.HealthScoreTrendsController - Obteniendo tendencia de HealthScore
[2025-01-29 14:35:43] [WRN] SQLGuardObservatory.API.Services.JobsService - No se encontraron jobs para la instancia SQLSERVER01
[2025-01-29 14:35:44] [ERR] SQLGuardObservatory.API.Controllers.DisksController - Error al obtener discos
Exception: System.Data.SqlClient.SqlException: Connection timeout
```

**Componentes:**
- `[2025-01-29 14:35:42]` - Fecha y hora en UTC-3
- `[INF]` - Nivel de log (INF, WRN, ERR, FTL)
- `Controller/Service` - Contexto de donde proviene el log
- Mensaje descriptivo
- Exception (si aplica)

---

## 🔧 Niveles de Log

| Nivel | Código | Uso |
|-------|--------|-----|
| **Information** | INF | Operaciones normales |
| **Warning** | WRN | Situaciones inesperadas pero manejables |
| **Error** | ERR | Errores que requieren atención |
| **Fatal** | FTL | Errores críticos que detienen la aplicación |

---

## 🌐 API REST para Gestión de Logs

### 1. Listar archivos de log

```http
GET /api/logs/list
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "files": [
    {
      "name": "sqlguard-20250129.log",
      "size": "2.45 MB",
      "sizeBytes": 2568192,
      "lastModified": "2025-01-29T14:35:42",
      "path": "C:\\...\\Logs\\sqlguard-20250129.log"
    }
  ],
  "totalFiles": 1
}
```

### 2. Obtener contenido de un log

```http
GET /api/logs/content/{fileName}
Authorization: Bearer {token}
```

**Ejemplo:**
```http
GET /api/logs/content/sqlguard-20250129.log
```

**Respuesta:**
```json
{
  "success": true,
  "fileName": "sqlguard-20250129.log",
  "content": "[2025-01-29 14:35:42] [INF] ...",
  "lines": 1234
}
```

### 3. Limpiar un archivo específico

```http
DELETE /api/logs/clear/{fileName}
Authorization: Bearer {token}
```

**Ejemplo:**
```http
DELETE /api/logs/clear/sqlguard-20250129.log
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Archivo sqlguard-20250129.log limpiado exitosamente"
}
```

### 4. Limpiar todos los logs

```http
DELETE /api/logs/clear-all
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Se limpiaron 5 archivos de log"
}
```

### 5. Purgar logs antiguos

```http
DELETE /api/logs/purge?daysOld=30
Authorization: Bearer {token}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Se eliminaron 10 archivos de log antiguos (>30 días)"
}
```

---

## 💻 Script PowerShell

### Uso Básico

```powershell
# Ver información de logs sin hacer cambios
.\Limpiar-Logs.ps1
```

**Output:**
```
==========================================
  SQLGuard Observatory - Limpieza de Logs
==========================================

Directorio de logs: C:\...\Logs
Archivos de log encontrados: 5

Archivos de log:

  📄 sqlguard-20250129.log
     Tamaño: 2456.78 KB | Última modificación: 29/01/2025 14:35:42 (0 días)

  📄 sqlguard-20250128.log
     Tamaño: 5123.45 KB | Última modificación: 28/01/2025 09:15:23 (1 días)

==========================================
Total: 5 archivos | 12.34 MB
==========================================
```

### Limpiar Todos los Archivos

```powershell
# Vaciar el contenido de todos los logs (con confirmación)
.\Limpiar-Logs.ps1 -All

# Sin confirmación
.\Limpiar-Logs.ps1 -All -Force
```

### Eliminar Logs Antiguos

```powershell
# Eliminar logs más antiguos que 30 días
.\Limpiar-Logs.ps1 -DaysOld 30

# Sin confirmación
.\Limpiar-Logs.ps1 -DaysOld 30 -Force
```

### Ejemplos de Uso

```powershell
# Limpiar logs antes de un despliegue
.\Limpiar-Logs.ps1 -All -Force

# Mantenimiento mensual
.\Limpiar-Logs.ps1 -DaysOld 30

# Ver estado actual sin hacer cambios
.\Limpiar-Logs.ps1
```

---

## 🚀 Configuración Avanzada

### Cambiar Nivel de Log Mínimo

Editar `appsettings.json`:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning",
      "Microsoft.EntityFrameworkCore": "Warning"
    }
  }
}
```

**Niveles disponibles:**
- `Trace` - Todo (muy verbose)
- `Debug` - Información de debug
- `Information` - Información general (recomendado)
- `Warning` - Solo warnings y errores
- `Error` - Solo errores
- `Critical` - Solo críticos

### Cambiar Retención de Archivos

Editar `Program.cs`:

```csharp
.WriteTo.File(
    Path.Combine(logsPath, "sqlguard-.log"),
    outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss}] [{Level:u3}] {SourceContext} - {Message:lj}{NewLine}{Exception}",
    rollingInterval: RollingInterval.Day,
    retainedFileCountLimit: 30, // ← Cambiar aquí (días)
    fileSizeLimitBytes: 10 * 1024 * 1024, // ← Tamaño máximo por archivo
    rollOnFileSizeLimit: true,
    shared: true)
```

---

## 🔒 Seguridad

- ✅ Solo usuarios con rol **Admin** o **SuperAdmin** pueden acceder a los endpoints de logs
- ✅ Validación de rutas para prevenir directory traversal
- ✅ Los logs no contienen información sensible (contraseñas, tokens, etc.)

---

## 📊 Monitoreo

### Ver Logs en Tiempo Real (Windows)

```powershell
# Usar PowerShell para monitorear en tiempo real
Get-Content "SQLGuardObservatory.API\Logs\sqlguard-20250129.log" -Wait -Tail 50
```

### Filtrar por Nivel de Error

```powershell
# Ver solo errores
Get-Content "SQLGuardObservatory.API\Logs\sqlguard-20250129.log" | Where-Object { $_ -like "*[ERR]*" }

# Ver warnings y errores
Get-Content "SQLGuardObservatory.API\Logs\sqlguard-20250129.log" | Where-Object { $_ -like "*[WRN]*" -or $_ -like "*[ERR]*" }
```

---

## 🛠️ Troubleshooting

### Problema: Los logs no se generan

**Solución:**
1. Verificar permisos de escritura en la carpeta `Logs`
2. Verificar que el servicio está corriendo
3. Revisar Windows Event Viewer para errores del servicio

### Problema: Los archivos de log son muy grandes

**Solución:**
1. Reducir el nivel de log mínimo (de `Information` a `Warning`)
2. Reducir `fileSizeLimitBytes` en `Program.cs`
3. Ejecutar `.\Limpiar-Logs.ps1 -DaysOld 7` más frecuentemente

### Problema: Error de permisos al limpiar logs

**Solución:**
1. Detener el servicio del backend
2. Ejecutar el script de limpieza
3. Reiniciar el servicio

---

## 📝 Mejores Prácticas

1. **Limpieza Regular**: Ejecutar `.\Limpiar-Logs.ps1 -DaysOld 30` mensualmente
2. **Monitoreo**: Revisar logs diariamente para detectar problemas temprano
3. **Backup**: Antes de limpiar todos los logs, considerar hacer backup si hay información importante
4. **Alertas**: Configurar alertas en Windows para archivos de log que excedan cierto tamaño
5. **Nivel Apropiado**: Usar `Information` en producción, `Debug` solo para troubleshooting

---

## 🎯 Próximos Pasos

- [ ] Implementar integración con sistemas de monitoreo (ELK, Splunk, etc.)
- [ ] Agregar exportación de logs en formato JSON
- [ ] Implementar compresión automática de logs antiguos
- [ ] Dashboard en el frontend para visualizar logs

---

## 📞 Soporte

Si encuentras problemas con el sistema de logging:

1. Revisar esta documentación
2. Verificar permisos de archivos
3. Consultar logs del Windows Event Viewer
4. Contactar al equipo de desarrollo

---

**Última actualización:** 29 de enero de 2025  
**Versión:** 2.0


