# Actualización: Latencia de I/O por Disco Físico

## 📋 Resumen

Se ha modificado el collector de I/O para capturar **latencia por disco físico individual** (C:\, D:\, E:\, etc.) en lugar de solo promedios generales.

---

## 🔧 Cambios Realizados

### 1. **Base de Datos** ✅
- Nuevo script: `scripts/SQL/ADD_IOByVolumeJson_Column.sql`
- Agrega columna `IOByVolumeJson NVARCHAR(MAX)` a tabla `InstanceHealth_IO`

### 2. **Collector PowerShell** ✅
- Modificado: `scripts/RelevamientoHealthScore_IO.ps1`
- Ahora agrupa métricas de I/O por volumen/disco
- Guarda JSON con estructura:
```json
[
  {
    "MountPoint": "C:",
    "AvgReadLatencyMs": 3.5,
    "AvgWriteLatencyMs": 2.1,
    "MaxReadLatencyMs": 15.2,
    "MaxWriteLatencyMs": 8.3,
    "ReadIOPS": 125.5,
    "WriteIOPS": 88.2,
    "TotalIOPS": 213.7
  },
  {
    "MountPoint": "E:",
    "AvgReadLatencyMs": 25.8,
    ...
  }
]
```

---

## 🚀 Pasos para Aplicar

### **Paso 1: Agregar columna a la tabla**
```powershell
# Ejecutar en SQL Server Management Studio o Azure Data Studio
.\scripts\SQL\ADD_IOByVolumeJson_Column.sql
```

### **Paso 2: Ejecutar el collector modificado (modo test)**
```powershell
# Ejecutar una sola vez para verificar que funciona
.\scripts\RelevamientoHealthScore_IO.ps1
```

### **Paso 3: Verificar que guardó datos correctamente**
```sql
USE SQLNova;
GO

-- Ver ejemplo de datos por disco
SELECT TOP 1
    InstanceName,
    CollectedAtUtc,
    IOByVolumeJson
FROM dbo.InstanceHealth_IO
WHERE IOByVolumeJson IS NOT NULL
ORDER BY CollectedAtUtc DESC;
```

---

## 📊 Próximos Pasos (Frontend & API)

Una vez verificado que el collector funciona correctamente, necesitamos:

1. **Modificar el endpoint de API** para incluir `IOByVolumeJson`
2. **Actualizar el componente de frontend** para:
   - Mostrar un selector de disco (C:\, D:\, E:\, etc.)
   - Filtrar las métricas según el disco seleccionado
   - Mostrar opción "Todos los discos (Promedio)" por defecto

---

## 🔍 Beneficios

- ✅ Identificar qué disco físico tiene problemas de latencia
- ✅ Diferenciar entre SSD y HDD
- ✅ Detectar issues en volúmenes específicos
- ✅ Mejor diagnóstico de storage tiering
- ✅ Planificación de capacidad más precisa

---

## 📝 Notas

- El collector extrae la letra de unidad del `physical_name` de los archivos
- Solo captura discos locales con letra de unidad (C:\, D:\, E:\, etc.)
- No captura UNC paths (\\server\share)
- Las métricas se agrupan promediando todos los archivos en cada volumen


