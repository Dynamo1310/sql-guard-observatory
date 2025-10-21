# Implementación de Autenticación de Windows - Resumen Completo

## 📋 Descripción General

Se ha implementado **Autenticación de Windows (Windows Authentication)** para la aplicación SQL Guard Observatory. Los usuarios del dominio `gscorp.ad` ahora pueden autenticarse automáticamente con sus credenciales de Windows, sin necesidad de ingresar usuario y contraseña manualmente.

### Usuario SuperAdmin por Defecto
- **Usuario**: GSCORP\TB03260
- **Rol**: SuperAdmin (acceso total)

---

## 🔧 Cambios Realizados

### Backend (.NET)

#### 1. **Program.cs**
- ✅ Agregado `Microsoft.AspNetCore.Authentication.Negotiate`
- ✅ Configurado `.AddNegotiate()` para Windows Authentication
- ✅ Mantenido JWT para autorización de requests

#### 2. **AuthService.cs**
- ✅ Agregado método `AuthenticateWindowsUserAsync(string windowsIdentity)`
- ✅ Validación de dominio gscorp.ad
- ✅ Extracción automática del username desde DOMAIN\username o username@domain
- ✅ Validación contra lista blanca (tabla AspNetUsers)
- ✅ Modificado `CreateUserAsync` para no requerir contraseña (genera password dummy interno)
- ✅ Modificado `UpdateUserAsync` para remover manejo de contraseñas

#### 3. **IAuthService.cs**
- ✅ Agregada interfaz para `AuthenticateWindowsUserAsync`

#### 4. **AuthController.cs**
- ✅ Agregado endpoint `GET /api/auth/windows-login`
- ✅ Obtiene identidad de Windows automáticamente desde `User.Identity.Name`
- ✅ Valida contra lista blanca
- ✅ Retorna JWT token para autorización

#### 5. **DTOs/AuthDto.cs**
- ✅ Removido campo `Password` de `CreateUserRequest`
- ✅ Removido campo `Password` de `UpdateUserRequest`

#### 6. **web.config** (Nuevo)
- ✅ Configuración de Windows Authentication para IIS
- ✅ Configuración de proveedores (Negotiate + NTLM)
- ✅ Habilitado Anonymous Authentication para endpoints públicos
- ✅ Configuración de CORS

### Frontend (React + TypeScript)

#### 1. **src/services/api.ts**
- ✅ Agregado método `windowsLogin()` en `authApi`
- ✅ Configurado `credentials: 'include'` para enviar credenciales de Windows
- ✅ Removido campo `password` de `CreateUserRequest` interface
- ✅ Removido campo `password` de `UpdateUserRequest` interface

#### 2. **src/pages/Login.tsx**
- ✅ Removido formulario de usuario/contraseña
- ✅ Implementada autenticación automática con `useEffect`
- ✅ Llamada automática a `authApi.windowsLogin()` al cargar la página
- ✅ Pantalla de loading con spinner
- ✅ Mensajes de error claros si falla la autenticación
- ✅ Opción de reintentar autenticación

#### 3. **src/pages/AdminUsers.tsx**
- ✅ Removidos campos de contraseña del formulario de crear usuario
- ✅ Removidos campos de contraseña del formulario de editar usuario
- ✅ Actualizados textos para reflejar "Lista Blanca"
- ✅ Actualizado placeholder y descripción para "Usuario de Dominio"
- ✅ Agregada nota sobre autenticación de Windows

### Documentación

#### 1. **WINDOWS_AUTHENTICATION_GUIA.md** (Nuevo)
- ✅ Guía completa de configuración de Windows Authentication
- ✅ Instrucciones paso a paso para IIS
- ✅ Configuración de CORS
- ✅ Gestión de lista blanca
- ✅ Solución de problemas
- ✅ Arquitectura de autenticación
- ✅ Preguntas frecuentes

---

## 🚀 Pasos para Desplegar

### 1. Compilar el Backend

```powershell
cd SQLGuardObservatory.API
dotnet publish -c Release
```

### 2. Copiar Archivos al Servidor

Copia todo el contenido de `SQLGuardObservatory.API/bin/Release/net8.0/publish/` al servidor IIS.

### 3. Configurar IIS - Backend

1. Abre **Administrador de IIS**
2. Navega al sitio de la API
3. Selecciona **Autenticación**
4. Habilita:
   - ✅ **Windows Authentication**
   - ✅ **Anonymous Authentication**
5. En Windows Authentication > Proveedores:
   - ✅ Negotiate (primero)
   - ✅ NTLM (segundo)

### 4. Compilar el Frontend

```bash
npm run build
```

### 5. Copiar Frontend al Servidor

Copia todo el contenido de `dist/` a la carpeta del frontend en IIS.

### 6. Verificar Base de Datos

Asegúrate de que el usuario **TB03260** esté en la base de datos como SuperAdmin:

```sql
SELECT * FROM AspNetUsers WHERE UserName = 'TB03260'
```

Si no existe, el `DbInitializer` lo creará automáticamente al iniciar la aplicación.

---

## 🧪 Pruebas

### Probar Backend

1. Abre un navegador
2. Navega a: `http://asprbm-nov-01:5000/api/auth/windows-login`
3. Deberías ver un JSON con tu token si estás en la lista blanca

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "domainUser": "TB03260",
  "displayName": "Administrador Principal",
  "allowed": true,
  "roles": ["SuperAdmin"]
}
```

### Probar Frontend

1. Abre un navegador
2. Navega a: `http://asprbm-nov-01:8080`
3. La aplicación debería autenticarte automáticamente
4. Si falla, revisa la consola del navegador (F12)

---

## 📝 Gestión de Usuarios

### Agregar Usuario a Lista Blanca

1. Inicia sesión como SuperAdmin (TB03260)
2. Ve a **Administración > Usuarios**
3. Clic en **Agregar Usuario**
4. Completa:
   - **Usuario de Dominio**: TB12345 (sin GSCORP\)
   - **Nombre Completo**: Juan Pérez
   - **Rol**: Reader/Admin/SuperAdmin
5. Guardar

### Editar Usuario

1. Clic en el ícono de **Editar** (lápiz)
2. Modifica:
   - Nombre Completo
   - Rol
   - Estado (Activo/Inactivo)
3. Guardar

### Eliminar Usuario de Lista Blanca

1. Clic en el ícono de **Eliminar** (papelera)
2. Confirmar
3. El usuario ya no podrá acceder

---

## 🔒 Seguridad

### Validaciones Implementadas

1. ✅ Solo usuarios del dominio **gscorp.ad**
2. ✅ Solo usuarios en la **lista blanca** (tabla AspNetUsers)
3. ✅ Usuario debe estar **activo** (IsActive = true)
4. ✅ Roles y permisos por funcionalidad
5. ✅ JWT tokens con expiración de 8 horas

### Flujo de Autenticación

```
Usuario accede → IIS captura credenciales Windows → Backend valida dominio 
→ Backend verifica lista blanca → Genera JWT → Frontend guarda token 
→ Requests usan JWT para autorización
```

---

## 🐛 Solución de Problemas Comunes

### Error: "No se pudo obtener la identidad de Windows"

**Solución**:
- Verifica que Windows Authentication esté habilitado en IIS
- Reinicia el sitio en IIS
- Verifica que el Pool de Aplicaciones esté corriendo

### Error: "Usuario no autorizado"

**Solución**:
- Verifica que el usuario esté en la lista blanca
- Verifica que el usuario esté activo
- Verifica que sea del dominio gscorp.ad

### Error CORS

**Solución**:
- Verifica configuración de CORS en `Program.cs`
- Verifica que `.AllowCredentials()` esté habilitado
- Reinicia el backend

---

## 📦 Archivos Nuevos Creados

1. `WINDOWS_AUTHENTICATION_GUIA.md` - Guía completa de configuración
2. `SQLGuardObservatory.API/web.config` - Configuración de IIS
3. `IMPLEMENTACION_WINDOWS_AUTH.md` - Este documento

---

## 📚 Archivos Modificados

### Backend
- `SQLGuardObservatory.API/Program.cs`
- `SQLGuardObservatory.API/Services/AuthService.cs`
- `SQLGuardObservatory.API/Services/IAuthService.cs`
- `SQLGuardObservatory.API/Controllers/AuthController.cs`
- `SQLGuardObservatory.API/DTOs/AuthDto.cs`

### Frontend
- `src/services/api.ts`
- `src/pages/Login.tsx`
- `src/pages/AdminUsers.tsx`

---

## ✅ Checklist de Despliegue

- [ ] Compilar backend con `dotnet publish -c Release`
- [ ] Copiar archivos al servidor IIS
- [ ] Configurar Windows Authentication en IIS (Backend)
- [ ] Configurar proveedores Negotiate + NTLM
- [ ] Verificar que Anonymous Authentication esté habilitado
- [ ] Compilar frontend con `npm run build`
- [ ] Copiar `dist/` al servidor
- [ ] Verificar que TB03260 esté en la base de datos
- [ ] Probar endpoint `/api/auth/windows-login`
- [ ] Probar login automático en frontend
- [ ] Agregar usuarios adicionales a la lista blanca
- [ ] Verificar permisos y roles

---

## 🎯 Resultado Final

Los usuarios del dominio **gscorp.ad** que estén en la **lista blanca** podrán:

1. ✅ Acceder automáticamente sin ingresar credenciales
2. ✅ Autenticarse con su cuenta de Windows
3. ✅ Tener acceso según su rol asignado
4. ✅ Ser gestionados por administradores (agregar/quitar de lista blanca)

El usuario **GSCORP\TB03260** es el SuperAdmin principal con acceso total.

---

**Fecha de Implementación**: Octubre 2024  
**Desarrollador**: AI Assistant  
**Empresa**: Banco Supervielle

