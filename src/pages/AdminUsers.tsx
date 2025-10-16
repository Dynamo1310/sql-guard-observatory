import { Users } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { mockAdminUsers } from '@/lib/mockData';

export default function AdminUsers() {
  const activeUsers = mockAdminUsers.filter(u => u.active).length;
  const adminUsers = mockAdminUsers.filter(u => u.role === 'Admin').length;
  const readerUsers = mockAdminUsers.filter(u => u.role === 'Reader').length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Administración de Usuarios</h1>
        <p className="text-muted-foreground mt-1">Gestión de accesos y roles del sistema</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KPICard
          title="Usuarios Activos"
          value={activeUsers}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Administradores"
          value={adminUsers}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Lectores"
          value={readerUsers}
          icon={Users}
          variant="default"
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Listado de Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha Alta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockAdminUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-sm">{user.domainUser}</TableCell>
                  <TableCell className="font-medium">{user.displayName}</TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={user.role === 'Admin' ? 'border-primary text-primary' : ''}
                    >
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={user.active ? 'success' : 'critical'}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {new Date(user.createdAt).toLocaleDateString('es-ES')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
