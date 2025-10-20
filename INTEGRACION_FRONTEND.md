# 🔗 Guía de Integración Frontend con Backend

Esta guía te muestra cómo modificar el frontend existente para que use el backend real en lugar de datos mock.

## 📋 Resumen

He creado el archivo `src/services/api.ts` que contiene todas las funciones necesarias para conectarte al backend. Ahora necesitas actualizar tus páginas React para usar estas funciones en lugar de los datos mock.

## 🔄 Cambios Necesarios en el Frontend

### 1. Login (src/pages/Login.tsx)

**ANTES (mock):**
```typescript
// Login con validación local o Supabase
```

**DESPUÉS (backend real):**
```typescript
import { authApi } from '@/services/api';
import { useState } from 'react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authApi.login({ username, password });
      
      // Login exitoso - redirigir
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    // Tu JSX del formulario...
    <form onSubmit={handleLogin}>
      <input 
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Usuario (ej: TB03260)"
      />
      <input 
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contraseña"
      />
      {error && <div className="text-red-500">{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>
    </form>
  );
}
```

### 2. Jobs (src/pages/Jobs.tsx)

**ANTES (mock):**
```typescript
import { mockJobSummary, mockJobs } from '@/lib/mockData';

export default function Jobs() {
  // Usa datos mock directamente
  const jobs = mockJobs;
  const summary = mockJobSummary;
  // ...
}
```

**DESPUÉS (backend real):**
```typescript
import { jobsApi, JobDto, JobSummaryDto } from '@/services/api';
import { useState, useEffect } from 'react';

export default function Jobs() {
  const [jobs, setJobs] = useState<JobDto[]>([]);
  const [summary, setSummary] = useState<JobSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [jobsData, summaryData] = await Promise.all([
        jobsApi.getJobs(),
        jobsApi.getJobsSummary()
      ]);
      
      setJobs(jobsData);
      setSummary(summaryData);
    } catch (err: any) {
      setError(err.message || 'Error al cargar datos');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6">Cargando...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-500">Error: {error}</div>
        <button onClick={fetchData}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Tu JSX existente usando `jobs` y `summary` */}
      
      {/* KPIs */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <KPICard
            title="% Jobs OK"
            value={`${summary.okPct}%`}
            icon={Activity}
            variant={summary.okPct > 95 ? 'success' : 'warning'}
          />
          <KPICard
            title="Fallos (24h)"
            value={summary.fails24h}
            icon={Activity}
            variant={summary.fails24h === 0 ? 'success' : 'critical'}
          />
          {/* ... más KPIs */}
        </div>
      )}
      
      {/* Tabla de jobs */}
      <Table>
        <TableBody>
          {jobs.map((job, idx) => (
            <TableRow key={idx}>
              <TableCell>{job.server}</TableCell>
              <TableCell>{job.job}</TableCell>
              <TableCell>
                {new Date(job.lastStart).toLocaleString('es-ES')}
              </TableCell>
              <TableCell>
                {job.lastEnd ? new Date(job.lastEnd).toLocaleString('es-ES') : '-'}
              </TableCell>
              <TableCell>{job.durationSec}s</TableCell>
              <TableCell>
                <StatusBadge status={getJobStatusVariant(job.state)}>
                  {job.state}
                </StatusBadge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### 3. Overview (src/pages/Overview.tsx)

**DESPUÉS (backend real):**
```typescript
import { jobsApi, JobDto, JobSummaryDto } from '@/services/api';
import { useState, useEffect } from 'react';

export default function Overview() {
  const [failedJobs, setFailedJobs] = useState<JobDto[]>([]);
  const [summary, setSummary] = useState<JobSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [summaryData, failedData] = await Promise.all([
        jobsApi.getJobsSummary(),
        jobsApi.getFailedJobs(5)
      ]);
      
      setSummary(summaryData);
      setFailedJobs(failedData);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <KPICard
            title="Jobs OK (24h)"
            value={`${summary.okPct}%`}
            variant={summary.okPct > 95 ? 'success' : 'warning'}
          />
          {/* ... más KPIs */}
        </div>
      )}

      {/* Top Jobs con Fallas */}
      <Card>
        <CardHeader>
          <CardTitle>Top Jobs con Fallas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {failedJobs.length > 0 ? (
                failedJobs.map((job, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{job.job}</TableCell>
                    <TableCell>{job.server}</TableCell>
                    <TableCell>
                      <StatusBadge status="critical">Failed</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">
                    No hay fallas recientes
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 4. AdminUsers (src/pages/AdminUsers.tsx)

**DESPUÉS (backend real):**
```typescript
import { authApi, UserDto, CreateUserRequest } from '@/services/api';
import { useState, useEffect } from 'react';

export default function AdminUsers() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await authApi.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (userData: CreateUserRequest) => {
    try {
      await authApi.createUser(userData);
      await fetchUsers(); // Recargar lista
      setShowCreateDialog(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    
    try {
      await authApi.deleteUser(userId);
      await fetchUsers(); // Recargar lista
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggleActive = async (user: UserDto) => {
    try {
      await authApi.updateUser(user.id, {
        displayName: user.displayName,
        role: user.role,
        active: !user.active
      });
      await fetchUsers(); // Recargar lista
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Administración de Usuarios</h1>
        <button onClick={() => setShowCreateDialog(true)}>
          Agregar Usuario
        </button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(user => (
            <TableRow key={user.id}>
              <TableCell>{user.domainUser}</TableCell>
              <TableCell>{user.displayName}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>
                {user.active ? '✓ Activo' : '✗ Inactivo'}
              </TableCell>
              <TableCell>
                <button onClick={() => handleToggleActive(user)}>
                  {user.active ? 'Desactivar' : 'Activar'}
                </button>
                <button 
                  onClick={() => handleDeleteUser(user.id)}
                  className="text-red-500"
                >
                  Eliminar
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Dialog para crear usuario */}
      {showCreateDialog && (
        <CreateUserDialog 
          onSubmit={handleCreateUser}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
}
```

## 🔐 Protección de Rutas

Crear un componente para proteger rutas que requieren autenticación:

```typescript
// src/components/ProtectedRoute.tsx
import { Navigate } from 'react-router-dom';
import { isAuthenticated, isAdmin } from '@/services/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin()) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
}
```

**Usar en las rutas:**

```typescript
// src/App.tsx o donde configures tus rutas
import { ProtectedRoute } from '@/components/ProtectedRoute';

<Route path="/jobs" element={
  <ProtectedRoute>
    <Jobs />
  </ProtectedRoute>
} />

<Route path="/admin/users" element={
  <ProtectedRoute requireAdmin>
    <AdminUsers />
  </ProtectedRoute>
} />
```

## 🔄 Manejo de Errores Comunes

### Token Expirado

```typescript
// El api.ts ya maneja esto, pero puedes agregar:
import { authApi } from '@/services/api';

// En caso de error 401
if (error.message.includes('401') || error.message.includes('Unauthorized')) {
  authApi.logout();
  window.location.href = '/login';
}
```

### Timeout de Requests

```typescript
// Puedes agregar timeout en fetch
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos

try {
  const response = await fetch(url, {
    signal: controller.signal,
    // ... otros parámetros
  });
} catch (err) {
  if (err.name === 'AbortError') {
    throw new Error('Tiempo de espera agotado');
  }
  throw err;
} finally {
  clearTimeout(timeoutId);
}
```

## ✅ Checklist de Integración

- [ ] Actualizar `src/pages/Login.tsx` para usar `authApi.login()`
- [ ] Actualizar `src/pages/Jobs.tsx` para usar `jobsApi.getJobs()`
- [ ] Actualizar `src/pages/Overview.tsx` para usar `jobsApi.getJobsSummary()` y `jobsApi.getFailedJobs()`
- [ ] Actualizar `src/pages/AdminUsers.tsx` para usar `authApi.getUsers()`, `authApi.createUser()`, etc.
- [ ] Crear componente `ProtectedRoute` para proteger rutas
- [ ] Agregar manejo de loading states
- [ ] Agregar manejo de errores
- [ ] Probar login/logout
- [ ] Probar creación de usuarios
- [ ] Probar visualización de jobs

## 🧪 Testing

### 1. Probar Login
```typescript
// Usuario: TB03260
// Contraseña: Admin123!
```

### 2. Probar API desde consola del navegador

```javascript
// Abrir DevTools (F12) y en Console:

// Login
const response = await fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'TB03260',
    password: 'Admin123!'
  })
});
const data = await response.json();
console.log(data);

// Guardar token
localStorage.setItem('token', data.token);

// Probar endpoint de jobs
const jobsResponse = await fetch('http://localhost:5000/api/jobs/summary', {
  headers: {
    'Authorization': `Bearer ${data.token}`
  }
});
const jobs = await jobsResponse.json();
console.log(jobs);
```

## 🔧 Debugging

### Ver requests en Network tab

1. Abrir DevTools (F12)
2. Ir a pestaña "Network"
3. Hacer login o navegar
4. Ver requests a `/api/*`
5. Verificar:
   - Status code (200 = OK, 401 = no autorizado, 500 = error servidor)
   - Headers (Authorization debe incluir Bearer token)
   - Response body (datos retornados)

### Console.log estratégico

```typescript
const fetchJobs = async () => {
  console.log('🔍 Fetching jobs...');
  
  try {
    const data = await jobsApi.getJobs();
    console.log('✅ Jobs received:', data);
    setJobs(data);
  } catch (err) {
    console.error('❌ Error fetching jobs:', err);
  }
};
```

## 📝 Notas Importantes

1. **Token en localStorage**: El token se guarda automáticamente al hacer login. Se incluye en todos los requests subsiguientes.

2. **CORS**: El backend ya está configurado para aceptar requests desde `http://localhost:5173`. Si cambias el puerto del frontend, actualiza el CORS en `Program.cs`.

3. **Formato de fechas**: Las fechas vienen en formato ISO 8601. Usa `new Date(dateString)` para convertirlas.

4. **Estado vs State**: El campo `JobStatus` de la BD se mapea a `state` en el DTO con valores: "Succeeded", "Failed", "Running", "Canceled".

---

**¿Necesitas ayuda?** Ver [RESUMEN_COMPLETO.md](RESUMEN_COMPLETO.md) para más información.

