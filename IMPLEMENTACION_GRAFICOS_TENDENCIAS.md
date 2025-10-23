# Implementación de Gráficos de Tendencias - Health Score

## 📊 **Resumen**

Ahora que guardas **historia** de métricas, puedes implementar gráficos de tendencias para:
- Ver deterioro/mejora en el tiempo
- Predecir cuándo se llenará un disco
- Auditar cambios
- Analizar patrones de fallas

---

## 🎯 **Gráficos Creados**

### **✅ Archivos Creados (4 archivos)**

| Archivo | Descripción | Tipo |
|---------|-------------|------|
| **`HealthScoreTrendsController.cs`** | API endpoints para datos históricos | Backend |
| **`HealthScoreTrendChart.tsx`** | Gráfico de línea de HealthScore | Frontend |
| **`DiskTrendChart.tsx`** | Gráfico de área de espacio en disco | Frontend |
| **`InstanceTrends.tsx`** | Página dashboard con todos los gráficos | Frontend |

---

## 🚀 **Paso 1: Instalar Librería de Gráficos**

```bash
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

npm install recharts
```

**Recharts** es la librería elegida porque:
- ✅ Simple de usar
- ✅ Responsive out-of-the-box
- ✅ Buena documentación
- ✅ Diseño moderno

---

## 🔧 **Paso 2: Agregar Ruta en el Router**

En `src/App.tsx`, agregar la nueva ruta:

```tsx
import InstanceTrends from '@/pages/InstanceTrends';

// En el Router:
<Route path="/trends/:instanceName" element={<InstanceTrends />} />
```

---

## 📊 **Paso 3: Agregar Botón en Health Score Page**

Modificar la página de Health Score para agregar un botón "Ver Tendencias":

```tsx
// En src/pages/HealthScore.tsx o donde tengas la lista de instancias

import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';

// Dentro del componente:
const navigate = useNavigate();

// En cada fila de instancia:
<Button 
  size="sm" 
  variant="outline"
  onClick={() => navigate(`/trends/${instance.instanceName}`)}
>
  <TrendingUp className="h-4 w-4 mr-1" />
  Tendencias
</Button>
```

---

## 🎨 **Endpoints Disponibles**

### **1. Tendencia de HealthScore**
```http
GET /api/HealthScoreTrends/healthscore/{instanceName}?hours=24

Respuesta:
{
  "success": true,
  "instanceName": "SQLPROD01",
  "hours": 24,
  "dataPoints": 96,
  "data": [
    {
      "timestamp": "2025-10-23T08:00:00Z",
      "healthScore": 95,
      "healthStatus": "Healthy",
      "breakdown": {
        "availability": 30,
        "backup": 25,
        "disk": 20,
        "alwaysOn": 15,
        "errorlog": 10
      }
    },
    // ... más puntos
  ]
}
```

### **2. Tendencia de Espacio en Disco**
```http
GET /api/HealthScoreTrends/disk/{instanceName}?hours=24

Respuesta:
{
  "success": true,
  "data": [
    {
      "timestamp": "2025-10-23T08:00:00Z",
      "freePct": 45.2
    },
    // ... más puntos
  ]
}
```

### **3. Tendencia de Latencia**
```http
GET /api/HealthScoreTrends/latency/{instanceName}?hours=24
```

### **4. Tendencia de Backups**
```http
GET /api/HealthScoreTrends/backups/{instanceName}?days=7
```

### **5. Overview General**
```http
GET /api/HealthScoreTrends/overview?hours=24

Respuesta:
{
  "success": true,
  "data": [
    {
      "timestamp": "2025-10-23T08:00:00Z",
      "avgHealthScore": 87,
      "instanceCount": 150,
      "healthy": 120,
      "warning": 25,
      "critical": 5
    },
    // ... más puntos (cada 15 min)
  ]
}
```

---

## 🖼️ **Gráficos Implementados**

### **1. HealthScore Trend (Línea)**
- Muestra evolución del score en el tiempo
- Líneas de referencia en 70 y 90
- Colores según estado
- Tooltip con detalles

### **2. Disk Trend (Área)**
- Muestra % de espacio libre
- Gradiente azul
- Líneas de referencia en 5%, 10%, 20%
- Alerta visual si está crítico

### **3. Latency Trend (Línea) - TODO**
- Muestra latencia de conexión en ms
- Detecta picos de latencia

### **4. Backup Status (Heatmap) - TODO**
- Muestra estado de backups por día/hora
- Verde = OK, Rojo = Breached

---

## 📝 **TODOs Restantes**

### **Gráficos Pendientes:**

1. **Latency Trend Chart**
   - Crear `src/components/LatencyTrendChart.tsx`
   - Similar a `DiskTrendChart` pero mostrando ms

2. **Backup Status Heatmap**
   - Crear `src/components/BackupStatusHeatmap.tsx`
   - Usar `recharts` o `react-calendar-heatmap`

3. **AlwaysOn Lag Chart**
   - Crear `src/components/AlwaysOnLagChart.tsx`
   - Solo para instancias con AlwaysOn

4. **Maintenance Jobs Timeline**
   - Crear `src/components/MaintenanceJobsTimeline.tsx`
   - Mostrar success/fail de jobs en el tiempo

### **Mejoras:**

5. **Estadísticas del Período**
   - Calcular en backend:
     - % Uptime real
     - Latencia promedio/máxima
     - Número de incidentes
     - Tiempo en cada estado

6. **Exportar a PDF/Excel**
   - Botón para descargar reporte
   - Usar `jspdf` o similar

7. **Comparación de Instancias**
   - Seleccionar múltiples instancias
   - Ver gráficos superpuestos

---

## 🧪 **Testing**

### **Test 1: Verificar Endpoint**
```bash
# Verificar que el endpoint funciona
curl -X GET "http://asprbm-nov-01:5000/api/HealthScoreTrends/healthscore/SQLPROD01?hours=24" \
  -H "Authorization: Bearer {tu-token}"
```

### **Test 2: Verificar Datos en SQL**
```sql
-- Ver datos para graficar
SELECT 
    CollectedAtUtc,
    HealthScore,
    HealthStatus
FROM SQLNova.dbo.InstanceHealth_Score
WHERE InstanceName = 'SQLPROD01'
  AND CollectedAtUtc >= DATEADD(HOUR, -24, GETUTCDATE())
ORDER BY CollectedAtUtc ASC;

-- Debería haber aprox 96 registros (cada 15 min en 24h)
```

### **Test 3: Verificar Frontend**
1. Navegar a `/health-score`
2. Click en "Ver Tendencias" de una instancia
3. Verificar que se muestra el gráfico
4. Cambiar rango de tiempo (6h, 24h, 7d, 30d)
5. Verificar que los datos cargan correctamente

---

## 🎨 **Personalización**

### **Cambiar Colores**
```tsx
// En HealthScoreTrendChart.tsx
const getStatusColor = (score: number) => {
  if (score >= 90) return '#10b981'; // Verde más oscuro
  if (score >= 70) return '#f59e0b'; // Amarillo más oscuro
  return '#dc2626'; // Rojo más oscuro
};
```

### **Cambiar Frecuencia de Puntos**
```csharp
// En HealthScoreTrendsController.cs
// Para overview, cambiar agrupación de 15 min a 1 hora:
DATEADD(MINUTE, DATEDIFF(MINUTE, 0, CollectedAtUtc) / 60 * 60, 0) AS TimeSlot
```

### **Agregar Más Métricas**
```tsx
// En HealthScoreTrendChart.tsx, mostrar breakdown en gráfico apilado:
<Line dataKey="breakdown.availability" stroke="#3b82f6" />
<Line dataKey="breakdown.backup" stroke="#10b981" />
<Line dataKey="breakdown.disk" stroke="#f59e0b" />
// ... etc
```

---

## 📊 **Ejemplo de Dashboard Completo**

```tsx
// En InstanceTrends.tsx - versión mejorada

<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  {/* Health Score */}
  <div className="col-span-2">
    <HealthScoreTrendChart instanceName={instanceName} hours={timeRange} />
  </div>

  {/* Disco */}
  <DiskTrendChart instanceName={instanceName} hours={timeRange} />

  {/* Latencia */}
  <LatencyTrendChart instanceName={instanceName} hours={timeRange} />

  {/* Backups (ancho completo) */}
  <div className="col-span-2">
    <BackupStatusHeatmap instanceName={instanceName} days={7} />
  </div>

  {/* AlwaysOn (si aplica) */}
  {isAlwaysOnEnabled && (
    <div className="col-span-2">
      <AlwaysOnLagChart instanceName={instanceName} hours={timeRange} />
    </div>
  )}
</div>
```

---

## 🚀 **Deployment**

### **Backend (API)**
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\SQLGuardObservatory.API

# Recompilar con el nuevo controlador
dotnet build --configuration Release

# Copiar DLLs
Copy-Item "bin\Release\net8.0\*" "C:\inetpub\wwwroot\SQLGuardAPI\" -Force -Recurse

# Reiniciar IIS
iisreset
```

### **Frontend**
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Instalar recharts si no está
npm install recharts

# Build para producción
npm run build

# Copiar a IIS
Copy-Item "dist\*" "C:\inetpub\wwwroot\SQLGuardFrontend\" -Force -Recurse
```

---

## ✅ **Checklist de Implementación**

### **Backend:**
- [ ] Agregar `HealthScoreTrendsController.cs` a la API
- [ ] Recompilar API
- [ ] Verificar endpoints con Postman/curl
- [ ] Agregar logging de errores

### **Frontend:**
- [ ] Instalar `recharts`
- [ ] Agregar componentes de gráficos
- [ ] Agregar página `InstanceTrends`
- [ ] Agregar ruta en router
- [ ] Agregar botón "Ver Tendencias" en Health Score page
- [ ] Probar con datos reales

### **Datos:**
- [ ] Verificar que los scripts programados están corriendo
- [ ] Verificar que hay al menos 24h de datos
- [ ] Ejecutar manualmente si es necesario

### **UX:**
- [ ] Agregar loading states
- [ ] Agregar error handling
- [ ] Agregar tooltips informativos
- [ ] Mobile responsive

---

## 📚 **Recursos Adicionales**

### **Recharts Documentation:**
- https://recharts.org/en-US/
- Ejemplos: https://recharts.org/en-US/examples

### **Tipos de Gráficos:**
- **LineChart** - Tendencias simples
- **AreaChart** - Tendencias con relleno
- **BarChart** - Comparaciones
- **ComposedChart** - Combinar múltiples tipos
- **ScatterChart** - Correlaciones

### **SQL Queries Útiles:**
```sql
-- Ver frecuencia de recolección real
SELECT 
    InstanceName,
    COUNT(*) AS Registros,
    DATEDIFF(HOUR, MIN(CollectedAtUtc), MAX(CollectedAtUtc)) AS HorasDeHistoria,
    COUNT(*) * 1.0 / DATEDIFF(HOUR, MIN(CollectedAtUtc), MAX(CollectedAtUtc)) AS RegistrosPorHora
FROM SQLNova.dbo.InstanceHealth_Score
WHERE CollectedAtUtc >= DATEADD(DAY, -1, GETUTCDATE())
GROUP BY InstanceName;

-- Debería mostrar ~4 registros/hora (cada 15 min)
```

---

## 🎯 **Resumen**

**✅ Ya tienes:**
- API endpoints para servir datos históricos
- Componentes React con gráficos de HealthScore y Disco
- Página dashboard para ver tendencias

**📝 Por implementar:**
- Gráficos de Latencia, Backups, AlwaysOn
- Estadísticas del período
- Integración completa en el flujo de la app

**📊 Valor agregado:**
- Detectar tendencias antes de que se conviertan en problemas
- Auditar cambios históricos
- Reportes para management
- Predecir cuándo se llenará un disco

---

**Versión:** 1.0  
**Fecha:** 2025-10-23  
**Autor:** SQL Guard Observatory Team
<function_calls>
<invoke name="read_file">
<parameter name="target_file">src/App.tsx
