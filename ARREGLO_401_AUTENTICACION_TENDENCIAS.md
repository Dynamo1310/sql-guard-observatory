# Arreglo: Error 401 (Unauthorized) en Tendencias Históricas

**Fecha:** 24/10/2025  
**Problema:** Los componentes de tendencias históricas fallaban con error HTTP 401 al intentar obtener datos del backend

## 🔴 Problema Identificado

Los componentes de tendencias estaban usando `fetch()` directamente **sin incluir el token JWT** de autenticación:

```typescript
// ❌ ANTES - Sin autenticación
const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/healthscore/${instanceName}?hours=${hours}`);
```

Mientras que el resto de la aplicación usa el servicio `api.ts` que automáticamente incluye el token en los headers.

## ✅ Solución Aplicada

### 1. Exportar helper de autenticación

**Archivo:** `src/services/api.ts`

```typescript
// Helper para obtener el token del localStorage
export function getAuthHeader(): HeadersInit {  // ✅ Ahora es export
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

### 2. Actualizar componentes de tendencias

Se actualizaron **3 componentes** para incluir el token:

#### 2.1 HealthScoreTrendChart.tsx

```typescript
// Import
import { getApiUrl, getAuthHeader } from '@/services/api';

// Fetch con autenticación
const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/healthscore/${instanceName}?hours=${hours}`, {
  headers: {
    'Content-Type': 'application/json',
    ...getAuthHeader()  // ✅ Incluye el token JWT
  }
});
```

#### 2.2 DiskTrendChart.tsx

```typescript
// Import
import { getApiUrl, getAuthHeader } from '@/services/api';

// Fetch con autenticación
const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/disk/${instanceName}?hours=${hours}`, {
  headers: {
    'Content-Type': 'application/json',
    ...getAuthHeader()  // ✅ Incluye el token JWT
  }
});
```

#### 2.3 HealthScoreRealtime.tsx

```typescript
// Import
import { getApiUrl, getAuthHeader } from '@/services/api';

// Fetch con autenticación
const response = await fetch(`${API_BASE_URL}/api/HealthScoreRealtime/latest`, {
  headers: {
    'Content-Type': 'application/json',
    ...getAuthHeader()  // ✅ Incluye el token JWT
  }
});
```

## 🧪 Testing

### Antes
```
GET http://asprbm-nov-01:5000/api/HealthScoreTrends/healthscore/SSPR19CRMPBI-01?hours=24 
401 (Unauthorized)
```

### Después
```
GET http://asprbm-nov-01:5000/api/HealthScoreTrends/healthscore/SSPR19CRMPBI-01?hours=24
200 OK ✅
```

## 📋 Archivos Modificados

1. `src/services/api.ts` - Exportar `getAuthHeader()`
2. `src/components/HealthScoreTrendChart.tsx` - Usar autenticación
3. `src/components/DiskTrendChart.tsx` - Usar autenticación
4. `src/components/HealthScoreRealtime.tsx` - Usar autenticación

## 🚀 Despliegue

Después de estos cambios:

```powershell
# Frontend
npm run build
# Copiar dist/ al servidor web
```

## ✅ Resultado

- ✅ Las tendencias históricas ahora funcionan correctamente
- ✅ El token JWT se incluye en todas las requests
- ✅ Ya no hay errores 401 (Unauthorized)
- ✅ Los gráficos de tendencias cargan datos correctamente

