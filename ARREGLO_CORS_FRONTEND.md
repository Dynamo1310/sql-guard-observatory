# Corrección de CORS - Acceso desde Frontend

**Fecha:** 24/10/2024  
**Problema:** CORS bloqueando requests del frontend al backend

---

## 🐛 Problema Identificado

### Error:
```
Access to fetch at 'http://asprbm-nov-01/InventoryDBA/api/permissions/my-permissions' 
from origin 'http://asprbm-nov-01:8080' has been blocked by CORS policy: 
Response to preflight request doesn't pass access control check: 
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### Causa Raíz:

**CORS (Cross-Origin Resource Sharing)** es una política de seguridad de los navegadores que bloquea requests de un origen (dominio + puerto) a otro origen diferente.

**En este caso:**
- 🌐 **Frontend:** `http://asprbm-nov-01:8080` (puerto 8080)
- 🔧 **Backend API:** `http://asprbm-nov-01/InventoryDBA` (puerto 80)

Como el puerto es diferente, el navegador considera que son **orígenes diferentes** y bloquea la request por seguridad.

**La configuración de CORS tenía:**
```csharp
policy.WithOrigins(
    "http://localhost:5173",
    "http://localhost:8080",
    "http://asprbm-nov-01:8080"  // ← Tenía el puerto 8080
)
```

**Pero faltaba:**
- `http://asprbm-nov-01` (puerto 80, el default)
- `http://asprbm-nov-01:80` (puerto 80 explícito)

---

## ✅ Solución Implementada

**Archivo:** `SQLGuardObservatory.API/Program.cs`

### ANTES:
```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
            "http://localhost:5173",
            "http://localhost:8080",
            "http://asprbm-nov-01:8080"  // ← Solo puerto 8080
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});
```

### DESPUÉS:
```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
            // Desarrollo
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://localhost:4200",
            "http://localhost:8080",
            // Producción - Todas las variantes posibles ✅
            "http://asprbm-nov-01",           // Puerto 80 (default)
            "http://asprbm-nov-01:80",        // Puerto 80 explícito
            "http://asprbm-nov-01:8080",      // Puerto 8080
            "https://asprbm-nov-01",          // HTTPS si aplica
            "https://asprbm-nov-01:443"       // HTTPS puerto explícito
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});
```

**Cambios:**
1. ✅ Agregado `http://asprbm-nov-01` (puerto 80 default)
2. ✅ Agregado `http://asprbm-nov-01:80` (puerto 80 explícito)
3. ✅ Mantenido `http://asprbm-nov-01:8080` (ya estaba)
4. ✅ Agregado variantes HTTPS por si acaso
5. ✅ Documentado claramente desarrollo vs producción

---

## 🔧 ¿Por Qué Múltiples Orígenes?

### IIS puede servir el frontend de diferentes formas:

1. **Puerto 80 (default HTTP):**
   - URL: `http://asprbm-nov-01`
   - Navegador usa: `http://asprbm-nov-01` (sin puerto)

2. **Puerto 80 explícito:**
   - URL: `http://asprbm-nov-01:80`
   - Navegador usa: `http://asprbm-nov-01:80`

3. **Puerto 8080:**
   - URL: `http://asprbm-nov-01:8080`
   - Navegador usa: `http://asprbm-nov-01:8080`

4. **HTTPS (443):**
   - URL: `https://asprbm-nov-01`
   - Navegador usa: `https://asprbm-nov-01`

**Cada combinación de protocolo + dominio + puerto es un origen DIFERENTE** para CORS.

---

## 🚀 Despliegue

### 1. Backend (Obligatorio)

```powershell
cd SQLGuardObservatory.API

# Compilar
dotnet build --configuration Release

# Publicar
dotnet publish --configuration Release --output ./publish

# Copiar a IIS
Copy-Item -Path ./publish/* -Destination "C:\inetpub\wwwroot\InventoryDBA" -Recurse -Force

# Reiniciar IIS para aplicar cambios
iisreset
```

### 2. Verificar

Después de reiniciar IIS:
1. Abrir el frontend
2. Abrir DevTools (F12) → Console
3. Ya NO debe aparecer el error de CORS
4. Las requests deben completarse con `200 OK`

---

## 🛡️ Seguridad

### ¿Por qué no usar `AllowAnyOrigin()`?

```csharp
// ❌ NO RECOMENDADO para producción
policy.AllowAnyOrigin()  // Permite cualquier origen
    .AllowAnyMethod()
    .AllowAnyHeader();
```

**Problemas:**
1. ⚠️ Permite que CUALQUIER sitio web acceda a tu API
2. ⚠️ Abre vulnerabilidades de seguridad (CSRF, XSS)
3. ⚠️ No compatible con `.AllowCredentials()` (necesario para cookies/auth)

**Mejor práctica: Lista blanca de orígenes específicos** ✅

Solo los dominios que tú controlas pueden acceder a tu API.

---

## 📊 Testing de CORS

### Desde el navegador (DevTools Console):

```javascript
// Test manual de CORS
fetch('http://asprbm-nov-01/InventoryDBA/api/healthscore', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log('✅ CORS OK:', data))
.catch(err => console.error('❌ CORS Error:', err));
```

**Resultado esperado:**
- ✅ Status: `200 OK`
- ✅ Response con datos
- ❌ NO debe haber errores de CORS en consola

---

## 🔍 Verificar Configuración Actual de IIS

Para saber en qué puerto está el frontend:

```powershell
# Ver bindings de IIS
Get-IISSite | Select-Object Name, @{Name="Bindings";Expression={$_.Bindings | ForEach-Object { $_.Protocol + "://" + $_.BindingInformation }}}
```

**Ejemplo de salida:**
```
Name                    Bindings
----                    --------
InventoryDBAFrontend    http://*:8080
                        http://*:80
InventoryDBA            http://*:80
```

Esto te dice exactamente qué puertos usar en la configuración de CORS.

---

## 📝 Archivos Modificados

1. ✅ `SQLGuardObservatory.API/Program.cs`
   - Actualizada configuración de CORS
   - Agregados todos los orígenes necesarios

---

## 🎓 Entendiendo CORS

### Flujo de una Request con CORS:

1. **Browser:** "Quiero hacer un POST desde `http://asprbm-nov-01:8080` a `http://asprbm-nov-01/InventoryDBA/api/healthscore`"

2. **Browser envía Preflight Request (OPTIONS):**
   ```
   OPTIONS /InventoryDBA/api/healthscore HTTP/1.1
   Origin: http://asprbm-nov-01:8080
   Access-Control-Request-Method: POST
   Access-Control-Request-Headers: content-type
   ```

3. **Backend responde:**
   ```
   HTTP/1.1 200 OK
   Access-Control-Allow-Origin: http://asprbm-nov-01:8080 ✅
   Access-Control-Allow-Methods: GET, POST, PUT, DELETE
   Access-Control-Allow-Headers: content-type
   Access-Control-Allow-Credentials: true
   ```

4. **Browser:** "OK, el origen está permitido, ahora sí hago la request real"

5. **Browser envía Request Real (POST):**
   ```
   POST /InventoryDBA/api/healthscore HTTP/1.1
   Origin: http://asprbm-nov-01:8080
   Content-Type: application/json
   ```

6. **Backend responde con datos + headers CORS:**
   ```
   HTTP/1.1 200 OK
   Access-Control-Allow-Origin: http://asprbm-nov-01:8080 ✅
   { "data": "..." }
   ```

**Si el origen NO está en la lista:**
```
❌ No 'Access-Control-Allow-Origin' header is present
Browser bloquea la respuesta
Frontend recibe: TypeError: Failed to fetch
```

---

## ✅ Checklist Post-Despliegue

- [ ] Backend recompilado
- [ ] Backend desplegado en IIS
- [ ] IIS reiniciado (`iisreset`)
- [ ] Frontend abierto en navegador
- [ ] DevTools (F12) abierto → Console
- [ ] No hay errores de CORS en consola
- [ ] Requests a `/api/healthscore` devuelven `200 OK`
- [ ] Requests a `/api/permissions/my-permissions` devuelven `200 OK`
- [ ] Frontend carga datos correctamente

---

## 🔧 Troubleshooting

### Si aún hay errores de CORS:

1. **Verificar el origen exacto en el error:**
   ```
   from origin 'http://asprbm-nov-01:XXXX'
                                    ^^^^
   ```
   Anota el puerto exacto y agrégalo a `WithOrigins()`.

2. **Verificar que IIS se reinició:**
   ```powershell
   iisreset
   ```

3. **Limpiar caché del navegador:**
   - Ctrl + F5 (hard refresh)
   - O abrir en ventana incógnita

4. **Verificar que la DLL se actualizó:**
   ```powershell
   Get-Item "C:\inetpub\wwwroot\InventoryDBA\SQLGuardObservatory.API.dll" | Select-Object LastWriteTime
   ```
   Debe mostrar la fecha/hora de hace pocos minutos.

---

**Resultado Esperado:**

✅ CORS configurado correctamente  
✅ Frontend se comunica con backend sin errores  
✅ Todas las requests completan exitosamente  
✅ Sin errores en DevTools Console  



