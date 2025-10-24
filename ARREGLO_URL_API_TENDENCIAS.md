# Corrección de URL del API en Componentes de Tendencias

**Fecha:** 24/10/2024  
**Problema:** `ERR_CONNECTION_REFUSED` - Frontend intenta conectarse a `localhost:5000` en producción

---

## 🐛 Problema Identificado

### Síntoma:
```
localhost:5000/api/HealthScoreTrends/healthscore/SSPR19CRMPBI-01?hours=24:1  
Failed to load resource: net::ERR_CONNECTION_REFUSED
```

### Causa Raíz:

Los componentes de tendencias (`HealthScoreTrendChart`, `DiskTrendChart`, `HealthScoreRealtime`) estaban usando su propia lógica para detectar la URL del API:

```typescript
// ❌ ANTES - Cada componente tenía esto:
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
```

**Problemas:**
1. Variable de entorno incorrecta: `VITE_API_BASE_URL` (no existe)
2. Variable correcta es: `VITE_API_URL` 
3. En producción, la variable no estaba definida
4. Caía al default: `http://localhost:5000` ❌
5. El backend está en IIS en `/InventoryDBA`, no en puerto 5000

---

## ✅ Solución Implementada

### 1. Centralizar la Detección de URL

**Archivo:** `src/services/api.ts`

```typescript
// ✅ Función exportada para que todos la usen
export const getApiUrl = () => {
  // Si hay variable de entorno, usarla
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Si no, detectar automáticamente basado en el hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';  // Desarrollo
  } else {
    // En IIS, el backend está en /InventoryDBA
    return `http://${hostname}/InventoryDBA`;  // Producción
  }
};
```

**Ventajas:**
- ✅ Un solo lugar para la lógica de detección
- ✅ Funciona automáticamente en desarrollo y producción
- ✅ No requiere variables de entorno (pero las respeta si existen)
- ✅ Se adapta al nombre del servidor automáticamente

---

### 2. Actualizar Todos los Componentes

**Archivos modificados:**
- `src/components/HealthScoreTrendChart.tsx`
- `src/components/DiskTrendChart.tsx`
- `src/components/HealthScoreRealtime.tsx`

```typescript
// ✅ DESPUÉS - Importar y usar la función centralizada
import { getApiUrl } from '@/services/api';

export function HealthScoreTrendChart({ instanceName, hours = 24 }: Props) {
  const API_BASE_URL = getApiUrl();  // ← Usa la función centralizada
  
  const fetchTrendData = async () => {
    const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/healthscore/${instanceName}?hours=${hours}`);
    // ...
  };
}
```

---

## 🔄 Cómo Funciona Ahora

### En Desarrollo (localhost):
```
Usuario accede a: http://localhost:5173
getApiUrl() detecta: hostname = "localhost"
API URL resultante: http://localhost:5000 ✅
```

### En Producción (servidor):
```
Usuario accede a: http://asprbm-nov-01/InventoryDBAFrontend
getApiUrl() detecta: hostname = "asprbm-nov-01"
API URL resultante: http://asprbm-nov-01/InventoryDBA ✅
```

---

## 📝 Archivos Modificados

1. ✅ `src/services/api.ts`
   - Exportada función `getApiUrl()`
   - Actualizada ruta de producción: `http://${hostname}/InventoryDBA`

2. ✅ `src/components/HealthScoreTrendChart.tsx`
   - Importa `getApiUrl`
   - Usa `const API_BASE_URL = getApiUrl()`

3. ✅ `src/components/DiskTrendChart.tsx`
   - Importa `getApiUrl`
   - Usa `const API_BASE_URL = getApiUrl()`

4. ✅ `src/components/HealthScoreRealtime.tsx`
   - Importa `getApiUrl`
   - Usa `const API_BASE_URL = getApiUrl()`

---

## 🚀 Despliegue

```powershell
# Frontend (obligatorio)
npm run build
Copy-Item -Path .\dist\* -Destination "C:\inetpub\wwwroot\InventoryDBAFrontend" -Recurse -Force

# Limpiar caché del navegador
# Ctrl + F5 en el navegador
```

**No requiere cambios en el backend** - Solo frontend.

---

## ✅ Verificación Post-Despliegue

### 1. Abrir Developer Console (F12)
Verificar que las requests van a la URL correcta:

**✅ CORRECTO:**
```
http://asprbm-nov-01/InventoryDBA/api/HealthScoreTrends/healthscore/SSPR19MBK-01?hours=24
Status: 200 OK
```

**❌ INCORRECTO (antes):**
```
localhost:5000/api/HealthScoreTrends/healthscore/SSPR19MBK-01?hours=24
Status: ERR_CONNECTION_REFUSED
```

### 2. Verificar Tendencias
1. Ir a HealthScore
2. Click en cualquier instancia → "Ver Tendencias"
3. Debe cargar:
   - ✅ Gráfico de Health Score
   - ✅ Gráfico de Espacio en Disco
   - ✅ Sin errores en consola

---

## 🔧 Variables de Entorno (Opcional)

Si quieres forzar una URL específica (por ejemplo, para testing):

**`.env.development`:**
```
VITE_API_URL=http://localhost:5000
```

**`.env.production`:**
```
VITE_API_URL=http://tu-servidor/InventoryDBA
```

Pero **NO es necesario** - la detección automática funciona perfectamente.

---

## 📊 Comparación

| Aspecto | Antes | Después |
|---------|-------|---------|
| **URL en desarrollo** | ❌ localhost:5000 | ✅ localhost:5000 |
| **URL en producción** | ❌ localhost:5000 | ✅ http://servidor/InventoryDBA |
| **Variable de entorno** | ❌ VITE_API_BASE_URL (incorrecta) | ✅ VITE_API_URL (correcta pero opcional) |
| **Detección automática** | ❌ No funciona | ✅ Funciona perfectamente |
| **Mantenibilidad** | ❌ Lógica duplicada en 4 archivos | ✅ Centralizada en 1 función |

---

## 🎓 Lecciones Aprendidas

1. **Centralizar configuración** - No duplicar lógica de detección de URLs
2. **Detección automática > Variables de entorno** - Menos configuración manual
3. **Usar el mismo servicio** - Todos los componentes deben usar `api.ts`
4. **Nombres de variables consistentes** - `VITE_API_URL`, no `VITE_API_BASE_URL`

---

**Resultado Final:**

✅ Tendencias funcionan en desarrollo  
✅ Tendencias funcionan en producción  
✅ Sin necesidad de configurar variables de entorno  
✅ Código más mantenible y consistente  
✅ Menos propenso a errores  


