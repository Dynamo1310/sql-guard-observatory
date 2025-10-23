# Implementación de Página de Discos - Completa

## 📋 Resumen

Se ha implementado completamente la funcionalidad de monitoreo de discos con datos reales de la base de datos `SQLNova`. La página ahora muestra información actual de los espacios en disco de las instancias ON-PREMISES.

## ✅ Cambios Realizados

### Backend (.NET)

#### 1. **Modelos y DTOs**
- ✅ `SQLGuardObservatory.API/Models/InventarioDiscosSnapshot.cs` - Modelo de base de datos
- ✅ `SQLGuardObservatory.API/DTOs/DiskDto.cs` - DTOs para API (DiskDto, DiskSummaryDto, DiskFiltersDto)

#### 2. **Servicios**
- ✅ `SQLGuardObservatory.API/Services/IDisksService.cs` - Interfaz del servicio
- ✅ `SQLGuardObservatory.API/Services/DisksService.cs` - Implementación del servicio con lógica de negocio

#### 3. **Controladores**
- ✅ `SQLGuardObservatory.API/Controllers/DisksController.cs` - API endpoints para discos

#### 4. **Configuración**
- ✅ `SQLGuardObservatory.API/Data/SQLNovaDbContext.cs` - Agregado DbSet para InventarioDiscosSnapshot
- ✅ `SQLGuardObservatory.API/Program.cs` - Registrado IDisksService

### Frontend (React + TypeScript)

#### 1. **Tipos**
- ✅ `src/types/index.ts` - Agregados interfaces: Disk, DiskSummary, DiskFilters

#### 2. **Servicios API**
- ✅ `src/services/api.ts` - Agregado `disksApi` con métodos:
  - `getDisks()` - Obtener lista de discos con filtros
  - `getDisksSummary()` - Obtener KPIs
  - `getFilters()` - Obtener filtros disponibles

#### 3. **Páginas**
- ✅ `src/pages/Disks.tsx` - Actualizada para usar datos reales con:
  - KPIs dinámicos (Críticos, Advertencia, Saludables)
  - Filtros: Ambiente, Hosting, Instancia, Estado
  - Tabla con ordenamiento
  - Colores tipo semáforo
  - Barras de progreso con datos reales

### Scripts PowerShell

#### 1. **Scripts Creados**
- ✅ `scripts/RelevamientoDiscosMant.ps1` - Script principal para relevar discos
- ✅ `scripts/AlterInventarioDiscosSnapshotTable.sql` - Crear tabla manualmente
- ✅ `scripts/MigrarColumnaDrive.sql` - Migrar columna Drive a 255 caracteres
- ✅ `scripts/ConsultarKPIsDiscos.ps1` - Consultar KPIs desde PowerShell
- ✅ `scripts/README_DISCOS.md` - Documentación completa

## 🎯 Funcionalidades Implementadas

### KPIs (Tarjetas Superiores)
- 🔴 **Discos Críticos**: < 10% libre
- 🟡 **Discos en Advertencia**: 10-20% libre
- 🟢 **Discos Saludables**: > 20% libre

### Filtros
Los filtros funcionan igual que en la página de Jobs:
- **Ambiente**: Producción, UAT, Desarrollo, etc.
- **Hosting**: On-Premises, AWS (en este caso solo ON-PREMISES)
- **Instancia**: Nombre de la instancia SQL
- **Estado**: Saludable, Advertencia, Crítico

### Tabla de Discos
- Columnas: Servidor, Drive, Total (GB), Libre (GB), % Libre, Estado
- **Ordenamiento**: Click en cualquier columna para ordenar
- **Colores tipo semáforo** en % Libre:
  - 🔴 Rojo: < 10%
  - 🟡 Amarillo: 10-20%
  - 🟢 Verde: > 20%
- **Barra de progreso**: Muestra porcentaje de ocupación con colores

## 🚀 Despliegue

### 1. Migrar la Base de Datos

Si ya ejecutaste el script de relevamiento y tienes datos, necesitas migrar la columna Drive:

```powershell
sqlcmd -S SSPR17MON-01 -d SQLNova -i scripts\MigrarColumnaDrive.sql
```

O ejecuta en SSMS:

```sql
USE SQLNova
GO

ALTER TABLE [dbo].[InventarioDiscosSnapshot]
ALTER COLUMN [Drive] NVARCHAR(255) NOT NULL
GO
```

### 2. Recompilar y Desplegar Backend

```powershell
# Recompilar
cd SQLGuardObservatory.API
dotnet build -c Release

# Desplegar (ajustar ruta según tu configuración)
.\deploy-backend.ps1
```

O si tienes el backend como servicio de Windows, reiniciarlo:

```powershell
Restart-Service -Name "SQLGuardObservatoryAPI"
```

### 3. Recompilar y Desplegar Frontend

```powershell
# Instalar dependencias (si es necesario)
npm install

# Compilar para producción
npm run build

# Desplegar (ajustar según tu configuración)
.\deploy-frontend.ps1
```

### 4. Verificar

1. **Verificar que el backend responde:**
   ```powershell
   # Prueba el endpoint de filtros (requiere autenticación)
   Invoke-RestMethod -Uri "http://asprbm-nov-01:5000/api/disks/filters" -Headers @{Authorization="Bearer TU_TOKEN"}
   ```

2. **Acceder a la aplicación web:**
   - Ir a: `http://asprbm-nov-01:8080`
   - Login con tu usuario Windows
   - Navegar a "Discos" en el sidebar
   - Verificar que se muestran datos reales

## 📊 API Endpoints Creados

### GET /api/disks
Obtiene la lista de discos filtrada

**Query Parameters:**
- `ambiente` (opcional): Filtrar por ambiente
- `hosting` (opcional): Filtrar por hosting
- `instance` (opcional): Filtrar por instancia
- `estado` (opcional): Filtrar por estado (Saludable, Advertencia, Critico)

**Response:**
```json
[
  {
    "id": 1,
    "instanceName": "SQL-PROD-01",
    "ambiente": "Produccion",
    "hosting": "OnPrem",
    "servidor": "SQL-PROD-01",
    "drive": "C:",
    "totalGB": 500.00,
    "libreGB": 180.00,
    "porcentajeLibre": 36.00,
    "estado": "Saludable",
    "captureDate": "2025-10-21T10:00:00"
  }
]
```

### GET /api/disks/summary
Obtiene el resumen de KPIs

**Query Parameters:** (mismos que /api/disks)

**Response:**
```json
{
  "discosCriticos": 5,
  "discosAdvertencia": 12,
  "discosSaludables": 295,
  "totalDiscos": 312,
  "ultimaCaptura": "2025-10-21T10:00:00"
}
```

### GET /api/disks/filters
Obtiene los valores disponibles para los filtros

**Response:**
```json
{
  "ambientes": ["Produccion", "UAT", "Desarrollo"],
  "hostings": ["OnPrem"],
  "instancias": ["SQL-PROD-01", "SQL-PROD-02", ...],
  "estados": ["Critico", "Advertencia", "Saludable"]
}
```

## 🔄 Relevamiento Automático

Para que los datos se actualicen automáticamente, programa el script de PowerShell:

```powershell
# Crear tarea programada (ejecutar como administrador)
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
    -Argument "-File C:\Scripts\RelevamientoDiscosMant.ps1"

$Trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM

Register-ScheduledTask -TaskName "RelevamientoDiscos" `
    -Action $Action `
    -Trigger $Trigger `
    -Description "Relevamiento diario de espacios en disco SQL Server" `
    -User "DOMINIO\UsuarioServicio" `
    -Password "Password"
```

## 🐛 Troubleshooting

### Error: "La columna Drive no existe"
**Solución:** Ejecutar script de migración `MigrarColumnaDrive.sql`

### Error: "Cannot convert... to System.Decimal"
**Solución:** Ya corregido en el script. Usar `.Byte` para acceder a valores de Size

### No se muestran datos en el frontend
**Verificar:**
1. Backend está corriendo: `http://asprbm-nov-01:5000/swagger`
2. Hay datos en la tabla: `SELECT COUNT(*) FROM SQLNova.dbo.InventarioDiscosSnapshot`
3. Token de autenticación es válido
4. CORS está configurado correctamente en Program.cs

### Filtros no cargan
**Verificar:**
1. Endpoint `/api/disks/filters` responde correctamente
2. Revisar consola del navegador (F12) para errores de JavaScript
3. Verificar que el usuario tiene permisos (política WhitelistOnly)

## 📝 Diferencias con Mock Data

| Aspecto | Mock (Anterior) | Real (Actual) |
|---------|----------------|---------------|
| **Origen** | Archivo mockData.ts | Base de datos SQLNova |
| **Campos** | server, drive, totalGb, freeGb, pctFree | servidor, drive, totalGB, libreGB, porcentajeLibre, estado |
| **Estado** | Calculado en frontend | Pre-calculado en base de datos |
| **Filtros** | No disponibles | Ambiente, Hosting, Instancia, Estado |
| **Actualización** | Manual | Automática (vía script programado) |
| **Mount Points** | No soportados | Soportados (255 caracteres) |

## ✨ Características Adicionales

- **Responsive**: Funciona en desktop, tablet y móvil
- **Ordenamiento**: Click en columnas para ordenar
- **Colores dinámicos**: Semáforo basado en estado
- **Filtrado en tiempo real**: Los KPIs se actualizan con los filtros
- **Manejo de errores**: Toast notifications para errores
- **Loading states**: Indicadores de carga mientras consulta API

## 📞 Próximos Pasos Sugeridos

1. **Alertas**: Configurar alertas por email cuando hay discos críticos
2. **Histórico**: Gráfico de tendencia de espacio en disco
3. **Exportar**: Botón para exportar datos a Excel/CSV
4. **Dashboard Overview**: Agregar widget de discos en página principal
5. **Predicción**: Estimar cuándo se llenará un disco basado en tendencia

---

**Implementado por:** Asistente IA  
**Fecha:** 21 de Octubre, 2025  
**Estado:** ✅ Completo y Funcional

