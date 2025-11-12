import { useEffect, useState } from 'react';
import { Shield, Save } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { permissionsApi, RolePermissionDto, AvailableViewsDto } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminPermissions() {
  const { user, isSuperAdmin } = useAuth();
  const [permissions, setPermissions] = useState<RolePermissionDto[]>([]);
  const [availableData, setAvailableData] = useState<AvailableViewsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Map<string, Map<string, boolean>>>(new Map());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [permsData, availData] = await Promise.all([
        permissionsApi.getAllPermissions(),
        permissionsApi.getAvailableViews(),
      ]);

      setPermissions(permsData);
      setAvailableData(availData);
    } catch (err: any) {
      toast.error('Error al cargar permisos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const canEditRole = (role: string): boolean => {
    // SuperAdmin puede editar todo
    if (isSuperAdmin) return true;
    
    // Admin solo puede editar el rol Reader
    if (role === 'Reader') return true;
    
    // Admin no puede editar SuperAdmin ni sus propios permisos (Admin)
    return false;
  };

  const canViewRole = (role: string): boolean => {
    // SuperAdmin puede ver todos los roles
    if (isSuperAdmin) return true;
    
    // Admin solo puede ver el rol Reader
    return role === 'Reader';
  };

  const handleTogglePermission = (role: string, viewName: string, currentValue: boolean) => {
    // Verificar si el usuario actual puede editar este rol
    if (!canEditRole(role)) {
      toast.error('No tienes permisos para editar este rol');
      return;
    }

    const roleChanges = changes.get(role) || new Map();
    roleChanges.set(viewName, !currentValue);
    
    const newChanges = new Map(changes);
    newChanges.set(role, roleChanges);
    setChanges(newChanges);

    // Actualizar estado local
    setPermissions(prev =>
      prev.map(p =>
        p.role === role
          ? {
              ...p,
              permissions: {
                ...p.permissions,
                [viewName]: !currentValue,
              },
            }
          : p
      )
    );
  };

  const handleSaveChanges = async () => {
    if (changes.size === 0) {
      toast.info('No hay cambios para guardar');
      return;
    }

    setSaving(true);

    try {
      // Guardar cambios para cada rol modificado
      for (const [role, roleChanges] of changes.entries()) {
        const rolePermission = permissions.find(p => p.role === role);
        if (rolePermission) {
          const updatedPermissions = { ...rolePermission.permissions };
          
          // Aplicar cambios
          for (const [view, enabled] of roleChanges.entries()) {
            updatedPermissions[view] = enabled;
          }

          await permissionsApi.updateRolePermissions(role, updatedPermissions);
        }
      }

      toast.success('Permisos actualizados exitosamente');
      setChanges(new Map());
      loadData();
    } catch (err: any) {
      toast.error('Error al guardar permisos: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetChanges = () => {
    setChanges(new Map());
    loadData();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SuperAdmin':
        return 'bg-purple-500 text-white';
      case 'Admin':
        return 'bg-blue-500 text-white';
      case 'Reader':
        return 'bg-gray-500 text-white';
      default:
        return '';
    }
  };

  const getRoleDisplayName = (role: string) => {
    switch (role) {
      case 'SuperAdmin':
        return 'Super Administrador';
      case 'Admin':
        return 'Administrador';
      case 'Reader':
        return 'Lector';
      default:
        return role;
    }
  };

  const getViewDisplayName = (viewName: string) => {
    const view = availableData?.views.find(v => v.viewName === viewName);
    return view?.displayName || viewName;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando permisos...</div>
        </div>
      </div>
    );
  }

  const totalViews = availableData?.views.length || 0;
  const hasChanges = changes.size > 0;

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Gestión de Permisos</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Configura qué vistas puede ver cada rol</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {hasChanges && (
            <Button variant="outline" onClick={handleResetChanges} disabled={saving} className="w-full sm:w-auto">
              Descartar Cambios
            </Button>
          )}
          <Button onClick={handleSaveChanges} disabled={!hasChanges || saving} className="w-full sm:w-auto">
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Roles Configurados"
          value={permissions.length}
          icon={Shield}
          variant="default"
        />
        <KPICard
          title="Vistas Disponibles"
          value={totalViews}
          icon={Shield}
          variant="default"
        />
        <KPICard
          title="Cambios Pendientes"
          value={Array.from(changes.values()).reduce((acc, roleChanges) => acc + roleChanges.size, 0)}
          icon={Shield}
          variant={hasChanges ? 'warning' : 'success'}
        />
      </div>

      {/* Tabla de Permisos por Rol */}
      {permissions.filter(rp => canViewRole(rp.role)).map((rolePermission) => {
        const viewsList = availableData?.views || [];
        
        return (
          <Card key={rolePermission.role} className="gradient-card shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Badge className={getRoleBadgeColor(rolePermission.role)}>
                      {getRoleDisplayName(rolePermission.role)}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {rolePermission.role === 'SuperAdmin' && 'Acceso total al sistema y configuración de permisos'}
                    {rolePermission.role === 'Admin' && 'Gestión de usuarios y configuración de permisos de Reader'}
                    {rolePermission.role === 'Reader' && 'Solo lectura de las vistas permitidas'}
                  </CardDescription>
                </div>
                <div className="text-sm text-muted-foreground">
                  {Object.values(rolePermission.permissions).filter(Boolean).length} / {totalViews} vistas habilitadas
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vista</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-center">Acceso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewsList.map((view) => {
                    const hasPermission = rolePermission.permissions[view.viewName] || false;
                    const isModified = changes.get(rolePermission.role)?.has(view.viewName);
                    const canEdit = canEditRole(rolePermission.role);

                    return (
                      <TableRow key={view.viewName} className={isModified ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                        <TableCell className="font-medium">{view.displayName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{view.description}</TableCell>
                        <TableCell className="text-center">
                          <button
                            onClick={() => handleTogglePermission(rolePermission.role, view.viewName, hasPermission)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              hasPermission ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
                            } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={saving || !canEdit}
                            title={!canEdit ? 'No tienes permisos para editar este rol' : ''}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                hasPermission ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

