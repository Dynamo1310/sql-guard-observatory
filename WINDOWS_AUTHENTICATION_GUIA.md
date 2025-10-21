# Guía de Configuración de Autenticación de Windows

## Descripción General

Esta aplicación utiliza **Autenticación de Windows (Windows Authentication)** para validar usuarios del dominio `gscorp.ad`. Los usuarios se autentican automáticamente con sus credenciales de Windows, sin necesidad de ingresar usuario y contraseña manualmente.

Solo los usuarios que estén en la **lista blanca** de la aplicación podrán acceder al sistema.

## Usuario SuperAdmin por Defecto

El usuario **GSCORP\TB03260** está configurado como **SuperAdmin** por defecto y tiene acceso total al sistema.

---

## Configuración del Backend (IIS)

### Paso 1: Configurar Windows Authentication en IIS

1. Abre el **Administrador de IIS** (Internet Information Services)
2. Navega hasta tu sitio web de la API
3. Selecciona **Autenticación** (Authentication)
4. **Habilita** las siguientes opciones:
   - **Autenticación de Windows** (Windows Authentication): **Habilitado**
   - **Autenticación anónima** (Anonymous Authentication): **Habilitado** ⚠️ *Importante: Debe estar habilitado para que funcione el endpoint público*

### Paso 2: Configurar Proveedores de Windows Authentication

1. En la sección de **Autenticación de Windows**, haz clic derecho y selecciona **Proveedores** (Providers)
2. Asegúrate de que los siguientes proveedores estén habilitados en este orden:
   - **Negotiate** (Kerberos)
   - **NTLM**

### Paso 3: Configurar el Pool de Aplicaciones

1. En IIS, navega a **Grupos de aplicaciones** (Application Pools)
2. Selecciona el pool de tu aplicación
3. Haz clic derecho y selecciona **Configuración avanzada** (Advanced Settings)
4. En **Identidad** (Identity), configura:
   - **ApplicationPoolIdentity** o una cuenta de servicio con permisos en el dominio

### Paso 4: Verificar Permisos NTFS

Asegúrate de que el usuario del Pool de Aplicaciones tenga permisos de lectura y ejecución en la carpeta de la aplicación.

---

## Configuración del Frontend

### Paso 1: Configurar el Sitio Web en IIS

1. Abre el **Administrador de IIS**
2. Navega hasta tu sitio web del frontend
3. Selecciona **Autenticación** (Authentication)
4. **Habilita** las siguientes opciones:
   - **Autenticación de Windows** (Windows Authentication): **Habilitado**
   - **Autenticación anónima** (Anonymous Authentication): **Deshabilitado** (opcional, según necesites)

### Paso 2: Configurar CORS en el Backend

El backend ya está configurado para aceptar solicitudes del frontend. En el archivo `Program.cs`, verifica que la configuración de CORS incluya tu servidor:

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://localhost:4200",
            "http://localhost:8080",
            "http://asprbm-nov-01:8080"  // Tu servidor
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();  // Importante para Windows Authentication
    });
});
```

---

## Verificación de la Configuración

### Backend

1. Abre un navegador y navega a: `http://tu-servidor:5000/api/auth/windows-login`
2. Deberías ver una respuesta JSON con tu token de autenticación si tu usuario está en la lista blanca
3. Si recibes un error 401, verifica:
   - Que Windows Authentication esté habilitado en IIS
   - Que tu usuario esté en la lista blanca
   - Que estés en el dominio gscorp.ad

### Frontend

1. Abre un navegador y navega a: `http://tu-servidor:8080`
2. La aplicación debería autenticarte automáticamente
3. Si recibes un error, abre la consola del navegador (F12) para ver los detalles

---

## Gestión de Usuarios (Lista Blanca)

### Agregar un Usuario a la Lista Blanca

1. Inicia sesión como **SuperAdmin** o **Admin**
2. Navega a **Administración > Usuarios**
3. Haz clic en **Agregar Usuario**
4. Completa los siguientes campos:
   - **Usuario de Dominio**: El usuario sin el dominio (ej: `TB12345`)
   - **Nombre Completo**: El nombre completo del usuario
   - **Rol**: Selecciona el rol apropiado
     - **Reader**: Solo lectura
     - **Admin**: Gestión de usuarios y permisos
     - **SuperAdmin**: Acceso total
5. Haz clic en **Crear Usuario**

### Editar un Usuario

1. En la lista de usuarios, haz clic en el ícono de **Editar** (lápiz)
2. Modifica los campos necesarios:
   - **Nombre Completo**
   - **Rol**
   - **Estado** (Activo/Inactivo)
3. Haz clic en **Guardar Cambios**

### Eliminar un Usuario de la Lista Blanca

1. En la lista de usuarios, haz clic en el ícono de **Eliminar** (papelera)
2. Confirma la eliminación
3. El usuario ya no podrá acceder al sistema

---

## Solución de Problemas

### Error: "No se pudo obtener la identidad de Windows"

**Causa**: Windows Authentication no está habilitado en IIS.

**Solución**:
1. Verifica que Windows Authentication esté habilitado en IIS
2. Reinicia el sitio web en IIS
3. Verifica que el Pool de Aplicaciones esté corriendo

### Error: "Usuario no autorizado"

**Causa**: El usuario no está en la lista blanca o no pertenece al dominio gscorp.ad.

**Solución**:
1. Verifica que el usuario esté agregado en la sección de Administración > Usuarios
2. Verifica que el usuario esté marcado como "Activo"
3. Verifica que el usuario pertenezca al dominio gscorp.ad

### Error: "CORS policy blocked"

**Causa**: El backend no está configurado para aceptar solicitudes del frontend.

**Solución**:
1. Verifica que el origen del frontend esté en la lista de CORS en `Program.cs`
2. Verifica que `.AllowCredentials()` esté habilitado
3. Reinicia el backend

### El usuario se autentica pero no puede acceder a ciertas páginas

**Causa**: El usuario no tiene permisos suficientes.

**Solución**:
1. Verifica el rol del usuario en Administración > Usuarios
2. Verifica los permisos del rol en Administración > Permisos
3. Si es necesario, cambia el rol del usuario o ajusta los permisos

---

## Arquitectura de Autenticación

### Flujo de Autenticación

1. El usuario accede a la aplicación desde su navegador
2. El navegador envía automáticamente las credenciales de Windows al backend
3. El backend valida que el usuario pertenezca al dominio gscorp.ad
4. El backend verifica que el usuario esté en la lista blanca (tabla `AspNetUsers`)
5. Si es válido, el backend genera un token JWT
6. El frontend almacena el token en localStorage
7. Todas las solicitudes posteriores incluyen el token JWT en el header

### Componentes Clave

**Backend**:
- `Program.cs`: Configuración de Windows Authentication + JWT
- `AuthController.cs`: Endpoint `/api/auth/windows-login`
- `AuthService.cs`: Validación de usuarios contra lista blanca
- `ApplicationDbContext.cs`: Contexto de base de datos con usuarios autorizados

**Frontend**:
- `Login.tsx`: Página que llama automáticamente a `windowsLogin()`
- `AuthContext.tsx`: Contexto de autenticación global
- `api.ts`: Servicio que maneja las llamadas al backend

---

## Seguridad

### Mejores Prácticas

1. **Lista Blanca**: Solo los usuarios explícitamente agregados pueden acceder
2. **Dominio Verificado**: Solo usuarios del dominio gscorp.ad son aceptados
3. **Roles y Permisos**: Control granular de acceso por rol
4. **JWT Expiration**: Los tokens expiran después de 8 horas (configurable)
5. **HTTPS**: Se recomienda habilitar HTTPS en producción

### Recomendaciones

- Revisa periódicamente la lista de usuarios activos
- Desactiva usuarios que ya no necesiten acceso (en lugar de eliminarlos)
- Asigna el rol mínimo necesario para cada usuario
- Mantén actualizado el usuario TB03260 como SuperAdmin principal

---

## Preguntas Frecuentes

### ¿Puedo usar contraseñas en lugar de Windows Authentication?

No, la aplicación está diseñada exclusivamente para Windows Authentication. Las contraseñas almacenadas en la base de datos son solo dummies internos y no se utilizan nunca.

### ¿Cómo cambio el usuario SuperAdmin principal?

El usuario TB03260 está hardcoded como SuperAdmin principal en `DbInitializer.cs`. Para cambiarlo:
1. Modifica el valor en `DbInitializer.cs`
2. Recompila la aplicación
3. Reinicia el servicio

### ¿Funciona con otros dominios además de gscorp.ad?

No, la aplicación está configurada para aceptar únicamente usuarios del dominio gscorp.ad. Para cambiar esto, modifica la validación en `AuthService.cs` (método `AuthenticateWindowsUserAsync`).

### ¿Puedo probar localmente sin estar en el dominio?

Para desarrollo local, puedes comentar temporalmente la validación del dominio en `AuthService.cs`, pero **nunca** despliegues esto en producción.

---

## Contacto y Soporte

Para dudas o problemas con la configuración, contacta al equipo de desarrollo o infraestructura.

**Última actualización**: Octubre 2024

