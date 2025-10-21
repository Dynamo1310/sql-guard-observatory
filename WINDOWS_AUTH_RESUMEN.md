# Windows Authentication - Resumen Rápido

## 🎯 ¿Qué se implementó?

Autenticación automática con credenciales de Windows para usuarios del dominio **gscorp.ad** con lista blanca.

## 👤 Usuario SuperAdmin

- **Usuario**: GSCORP\TB03260
- **Rol**: SuperAdmin

## 🚀 Despliegue Rápido

```powershell
# Opción 1: Script automatizado
.\deploy-windows-auth.ps1

# Opción 2: Manual
cd SQLGuardObservatory.API
dotnet publish -c Release
# Copiar bin/Release/net8.0/publish/* al servidor

npm run build
# Copiar dist/* al servidor
```

## ⚙️ Configuración IIS (Crítico)

### Backend API

1. IIS Manager → Tu sitio API → **Authentication**
2. Habilitar:
   - ✅ **Windows Authentication**
   - ✅ **Anonymous Authentication**
3. Windows Authentication → Providers:
   - Negotiate (primero)
   - NTLM (segundo)

## 🧪 Verificación

### Backend
```
http://asprbm-nov-01:5000/api/auth/windows-login
```
Debe retornar JSON con token si estás en la lista blanca.

### Frontend
```
http://asprbm-nov-01:8080
```
Login automático sin formulario.

## 📝 Gestión de Usuarios

### Agregar usuario:
1. Login como SuperAdmin (TB03260)
2. Administración > Usuarios > Agregar Usuario
3. Ingresar:
   - Usuario de Dominio (sin GSCORP\)
   - Nombre Completo
   - Rol

### Roles disponibles:
- **Reader**: Solo lectura
- **Admin**: Gestión de usuarios
- **SuperAdmin**: Acceso total

## 🐛 Problemas Comunes

| Error | Solución |
|-------|----------|
| "No se pudo obtener la identidad de Windows" | Windows Auth no habilitado en IIS |
| "Usuario no autorizado" | Usuario no está en lista blanca o no es del dominio gscorp.ad |
| CORS error | Verificar configuración en Program.cs |

## 📚 Documentación Completa

- **Configuración detallada**: `WINDOWS_AUTHENTICATION_GUIA.md`
- **Cambios implementados**: `IMPLEMENTACION_WINDOWS_AUTH.md`

## 🔑 Endpoints Clave

- `GET /api/auth/windows-login` - Autenticación con Windows
- `GET /api/auth/users` - Lista de usuarios (Admin+)
- `POST /api/auth/users` - Crear usuario (Admin+)
- `PUT /api/auth/users/{id}` - Editar usuario (Admin+)
- `DELETE /api/auth/users/{id}` - Eliminar usuario (Admin+)

## ✅ Checklist Post-Despliegue

- [ ] Windows Authentication habilitado en IIS
- [ ] Anonymous Authentication habilitado en IIS
- [ ] Proveedores configurados (Negotiate + NTLM)
- [ ] Backend responde en `/api/auth/windows-login`
- [ ] Frontend carga y autentica automáticamente
- [ ] TB03260 puede acceder como SuperAdmin
- [ ] Agregar usuarios adicionales a lista blanca

## 🔒 Seguridad

- ✅ Solo dominio gscorp.ad
- ✅ Solo usuarios en lista blanca
- ✅ JWT tokens expiran en 8 horas
- ✅ Roles y permisos granulares
- ✅ Sin contraseñas manuales

---

**Fecha**: Octubre 2024  
**Banco**: Supervielle

