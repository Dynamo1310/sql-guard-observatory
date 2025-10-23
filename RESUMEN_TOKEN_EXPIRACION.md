# 🔐 Arreglo de Expiración de Tokens JWT

## ❌ Problema Original

Un usuario se logueó **ayer a las 15:00** y hoy a las **10:00 AM** (19+ horas después) **seguía logueado**, aunque el token supuestamente expiraba cada 8 horas.

---

## 🔍 Causa del Problema

### 1. **ClockSkew por defecto (5 minutos)**
ASP.NET Core tiene una tolerancia de 5 minutos por defecto para compensar diferencias de reloj entre servidores, pero esto no explicaba 19+ horas.

### 2. **Frontend NO validaba expiración**
El problema principal era que el frontend:
- ✅ Guardaba el token en `localStorage`
- ✅ Guardaba el usuario en `localStorage`
- ❌ **NUNCA verificaba si el token expiró**
- ❌ **Usaba datos de localStorage sin consultar al backend**

**Resultado:** El usuario podía navegar por la app usando datos viejos de `localStorage` indefinidamente, sin hacer requests autenticados al backend.

---

## ✅ Solución Implementada

### **1. Cambio de expiración: 8 horas → 2 horas**
```json
"ExpirationMinutes": 120  // 2 horas
```

### **2. ClockSkew = 0 (sin tolerancia)**
```csharp
ClockSkew = TimeSpan.Zero // Expiración estricta
```

### **3. Interceptor en frontend**
Ahora **CADA request** al backend valida el token:
- ✅ Si el backend devuelve `401` (Unauthorized)
- ✅ El interceptor cierra sesión automáticamente
- ✅ Limpia `localStorage`
- ✅ Redirige al login
- ✅ Muestra mensaje: *"Tu sesión ha expirado"*

```typescript
if (response.status === 401) {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
  throw new Error('Tu sesión ha expirado');
}
```

---

## 📊 Comparación

| Aspecto | ❌ Antes | ✅ Ahora |
|---------|---------|----------|
| **Expiración token** | 8 horas | 2 horas |
| **ClockSkew** | 5 min (default) | 0 (estricto) |
| **Validación frontend** | ❌ No validaba | ✅ Valida cada request |
| **Cierre automático** | ❌ No | ✅ Sí (401 → logout) |
| **Usuario sin backend** | ✅ Podía navegar | ❌ Ya no puede |

---

## 🎯 Resultado Final

### **Flujo con token válido:**
```
Usuario hace request
├─ Token válido (< 2 horas)
├─ Backend responde 200 OK
└─ Usuario trabaja normalmente
```

### **Flujo con token expirado:**
```
Usuario hace request (después de 2h)
├─ Token expirado
├─ Backend responde 401 Unauthorized
├─ Interceptor frontend detecta 401
├─ Limpia localStorage
├─ Redirige a /login
└─ Usuario debe iniciar sesión nuevamente
```

### **Cambios de roles:**
- SuperAdmin cambia rol de un usuario
- Ese usuario sigue trabajando (máximo 2 horas)
- En máximo 2 horas su token expira
- Cierra sesión automática
- Inicia sesión nuevamente → obtiene nuevos permisos ✅

---

## ⚠️ IMPORTANTE

**Después de desplegar estos cambios:**

1. ✅ Todos los usuarios con tokens viejos (8h) serán desconectados en su próximo request
2. ✅ Deberán iniciar sesión nuevamente
3. ✅ A partir de ahí, tokens nuevos expirarán cada 2 horas
4. ✅ Cambios de roles se aplicarán en máximo 2 horas

---

## 📁 Archivos Modificados

1. **Backend:**
   - `SQLGuardObservatory.API/Program.cs` → Agregado `ClockSkew = TimeSpan.Zero`
   - `SQLGuardObservatory.API/appsettings.json` → `ExpirationMinutes: 120`

2. **Frontend:**
   - `src/services/api.ts` → Interceptor para manejar 401

---

## ✅ Checklist de Despliegue

- [ ] Compilar backend: `dotnet publish -c Release -o C:\Temp\Backend`
- [ ] Compilar frontend: `npm run build`
- [ ] Copiar backend a servidor IIS
- [ ] Copiar frontend a servidor IIS
- [ ] Reiniciar IIS o Application Pool
- [ ] Informar a usuarios que deben cerrar sesión y volver a iniciar
- [ ] Verificar que usuarios son desconectados después de 2 horas

---

**Fecha de implementación:** [Agregar fecha]  
**Responsable:** SQL Guard Observatory Team

