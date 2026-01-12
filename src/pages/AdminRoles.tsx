import { useState, useEffect } from 'react';
import { Shield, Plus, Pencil, Trash2, Users, ShieldCheck, Eye, Loader2, Check, X, Lock, RefreshCw } from 'lucide-react';
import { Capabilities } from '@/lib/capabilities';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTableSort } from '@/hooks/use-table-sort';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { adminRolesApi, AdminRoleDto, CapabilityCategoryDto, CreateAdminRoleRequest, UpdateAdminRoleRequest } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

// Colores predefinidos para roles
const ROLE_COLORS = [
  { name: 'Púrpura', value: '#8b5cf6' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Ámbar', value: '#f59e0b' },
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Cian', value: '#06b6d4' },
  { name: 'Gris', value: '#6b7280' },
];

// Iconos disponibles para roles
const ROLE_ICONS = [
  { name: 'ShieldCheck', icon: ShieldCheck },
  { name: 'Shield', icon: Shield },
  { name: 'Eye', icon: Eye },
  { name: 'Users', icon: Users },
];

export default function AdminRoles() {
  const { hasCapability, isSuperAdmin } = useAuth();
  const [roles, setRoles] = useState<AdminRoleDto[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AdminRoleDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    icon: 'Shield',
    priority: 200,
    enabledCapabilities: [] as string[],
    assignableRoleIds: [] as number[],
  });

  // Check permissions
  const canView = hasCapability(Capabilities.RolesView) || isSuperAdmin;
  const canCreate = hasCapability(Capabilities.RolesCreate) || isSuperAdmin;
  const canEdit = hasCapability(Capabilities.RolesEdit) || isSuperAdmin;
  const canDelete = hasCapability(Capabilities.RolesDelete) || isSuperAdmin;
  const canAssignCapabilities = hasCapability(Capabilities.RolesAssignCapabilities) || isSuperAdmin;

  useEffect(() => {
    if (canView) {
      fetchRoles();
      fetchCapabilities();
    }
  }, [canView]);

  const fetchRoles = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setIsRefreshing(true);
      const data = await adminRolesApi.getRoles();
      setRoles(data);
    } catch (err: any) {
      toast.error('Error al cargar roles: ' + err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const fetchCapabilities = async () => {
    try {
      const data = await adminRolesApi.getCapabilities();
      setCapabilities(data);
    } catch (err: any) {
      console.error('Error al cargar capacidades:', err);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#3b82f6',
      icon: 'Shield',
      priority: 200,
      enabledCapabilities: [],
      assignableRoleIds: [],
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setActiveTab('general');
    setShowCreateDialog(true);
  };

  const openEditDialog = (role: AdminRoleDto) => {
    setSelectedRole(role);
    setFormData({
      name: role.name,
      description: role.description || '',
      color: role.color,
      icon: role.icon,
      priority: role.priority,
      enabledCapabilities: role.enabledCapabilities,
      assignableRoleIds: role.assignableRoleIds,
    });
    setActiveTab('general');
    setShowEditDialog(true);
  };

  const openDeleteDialog = (role: AdminRoleDto) => {
    if (role.isSystem) {
      toast.error('No se pueden eliminar roles de sistema');
      return;
    }
    if (role.usersCount > 0) {
      toast.error(`No se puede eliminar el rol porque tiene ${role.usersCount} usuario(s) asignado(s)`);
      return;
    }
    setSelectedRole(role);
    setShowDeleteDialog(true);
  };

  const handleCreateRole = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre del rol es obligatorio');
      return;
    }

    setSaving(true);
    try {
      const request: CreateAdminRoleRequest = {
        name: formData.name,
        description: formData.description || undefined,
        color: formData.color,
        icon: formData.icon,
        priority: formData.priority,
        enabledCapabilities: formData.enabledCapabilities,
        assignableRoleIds: formData.assignableRoleIds,
      };

      await adminRolesApi.createRole(request);
      toast.success('Rol creado exitosamente');
      setShowCreateDialog(false);
      resetForm();
      fetchRoles();
    } catch (err: any) {
      toast.error('Error al crear rol: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedRole) return;

    setSaving(true);
    try {
      const request: UpdateAdminRoleRequest = {
        name: selectedRole.isSystem ? undefined : formData.name,
        description: formData.description || undefined,
        color: formData.color,
        icon: formData.icon,
        priority: selectedRole.isSystem ? undefined : formData.priority,
        enabledCapabilities: formData.enabledCapabilities,
        assignableRoleIds: formData.assignableRoleIds,
      };

      await adminRolesApi.updateRole(selectedRole.id, request);
      toast.success('Rol actualizado exitosamente');
      setShowEditDialog(false);
      setSelectedRole(null);
      resetForm();
      fetchRoles();
    } catch (err: any) {
      toast.error('Error al actualizar rol: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole) return;

    setSaving(true);
    try {
      await adminRolesApi.deleteRole(selectedRole.id);
      toast.success('Rol eliminado exitosamente');
      setShowDeleteDialog(false);
      setSelectedRole(null);
      fetchRoles();
    } catch (err: any) {
      toast.error('Error al eliminar rol: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCapability = (capKey: string) => {
    setFormData(prev => ({
      ...prev,
      enabledCapabilities: prev.enabledCapabilities.includes(capKey)
        ? prev.enabledCapabilities.filter(c => c !== capKey)
        : [...prev.enabledCapabilities, capKey],
    }));
  };

  const toggleAssignableRole = (roleId: number) => {
    setFormData(prev => ({
      ...prev,
      assignableRoleIds: prev.assignableRoleIds.includes(roleId)
        ? prev.assignableRoleIds.filter(id => id !== roleId)
        : [...prev.assignableRoleIds, roleId],
    }));
  };

  const getRoleIcon = (iconName: string) => {
    const iconDef = ROLE_ICONS.find(i => i.name === iconName);
    return iconDef ? iconDef.icon : Shield;
  };

  const { sortedData, requestSort, getSortIndicator } = useTableSort(roles);

  // KPI stats
  const totalRoles = roles.length;
  const systemRoles = roles.filter(r => r.isSystem).length;
  const customRoles = roles.filter(r => !r.isSystem).length;
  const totalUsersWithRoles = roles.reduce((acc, r) => acc + r.usersCount, 0);

  if (!canView) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">No tienes permisos para ver esta página</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-80" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* KPIs skeleton */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Función helper para renderizar el formulario de roles
  const renderRoleForm = (isEdit: boolean) => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="capabilities">Capacidades</TabsTrigger>
        <TabsTrigger value="assignable">Roles Asignables</TabsTrigger>
      </TabsList>

      <TabsContent value="general" className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label htmlFor="role-name">Nombre del Rol</Label>
          <Input
            id="role-name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Ej: User Manager"
            disabled={isEdit && selectedRole?.isSystem}
          />
          {isEdit && selectedRole?.isSystem && (
            <p className="text-xs text-muted-foreground">El nombre de roles de sistema no puede modificarse</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="role-description">Descripción</Label>
          <Textarea
            id="role-description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Describe las responsabilidades de este rol..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {ROLE_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    formData.color === color.value ? 'border-foreground scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => setFormData(prev => ({ ...prev, color: color.value }))}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Icono</Label>
            <div className="flex gap-2">
              {ROLE_ICONS.map((iconDef) => {
                const IconComponent = iconDef.icon;
                return (
                  <button
                    key={iconDef.name}
                    type="button"
                    className={`p-2 rounded border-2 transition-all ${
                      formData.icon === iconDef.name ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                    onClick={() => setFormData(prev => ({ ...prev, icon: iconDef.name }))}
                  >
                    <IconComponent className="h-5 w-5" style={{ color: formData.color }} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="role-priority">Prioridad</Label>
          <Input
            id="role-priority"
            type="number"
            value={formData.priority}
            onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
            disabled={isEdit && selectedRole?.isSystem}
            min={0}
            max={999}
          />
          <p className="text-xs text-muted-foreground">
            Mayor prioridad = más privilegios. Un usuario solo puede asignar roles con prioridad menor o igual a la suya.
          </p>
        </div>
      </TabsContent>

      <TabsContent value="capabilities" className="mt-4">
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {capabilities.map((category) => (
            <Card key={category.category}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{category.category}</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {category.capabilities.map((cap) => (
                    <div key={cap.key} className="flex items-start space-x-2">
                      <Checkbox
                        id={`cap-${cap.key}`}
                        checked={formData.enabledCapabilities.includes(cap.key)}
                        onCheckedChange={() => toggleCapability(cap.key)}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <label
                          htmlFor={`cap-${cap.key}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {cap.name}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {cap.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="assignable" className="mt-4">
        <CardDescription className="mb-4">
          Selecciona qué roles puede asignar un usuario con este rol a otros usuarios.
        </CardDescription>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {roles.map((role) => {
            const IconComponent = getRoleIcon(role.icon);
            return (
              <div key={role.id} className="flex items-center space-x-3 p-2 rounded border">
                <Checkbox
                  id={`assignable-role-${role.id}`}
                  checked={formData.assignableRoleIds.includes(role.id)}
                  onCheckedChange={() => toggleAssignableRole(role.id)}
                />
                <IconComponent className="h-5 w-5" style={{ color: role.color }} />
                <div className="flex-1">
                  <label
                    htmlFor={`assignable-role-${role.id}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {role.name}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Prioridad: {role.priority} • {role.usersCount} usuario(s)
                  </p>
                </div>
                {role.isSystem && (
                  <Badge variant="outline" className="text-xs">Sistema</Badge>
                )}
              </div>
            );
          })}
        </div>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Gestión de Roles
          </h1>
          <p className="text-muted-foreground">
            Administra roles personalizables con capacidades granulares.
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => fetchRoles(false)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {canCreate && (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Rol
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <KPICard
          title="Total Roles"
          value={totalRoles}
          icon={Shield}
          variant="default"
        />
        <KPICard
          title="Roles Sistema"
          value={systemRoles}
          icon={ShieldCheck}
          variant="default"
        />
        <KPICard
          title="Roles Personalizados"
          value={customRoles}
          icon={Shield}
          variant="success"
        />
        <KPICard
          title="Usuarios con Rol"
          value={totalUsersWithRoles}
          icon={Users}
          variant="default"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado de Roles</CardTitle>
          <CardDescription>
            Los roles definen las capacidades administrativas de los usuarios.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Icono</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('name')}
                >
                  Nombre {getSortIndicator('name')}
                </TableHead>
                <TableHead className="hidden md:table-cell">Descripción</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-accent text-center"
                  onClick={() => requestSort('priority')}
                >
                  Prioridad {getSortIndicator('priority')}
                </TableHead>
                <TableHead className="text-center">Capacidades</TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-accent text-center"
                  onClick={() => requestSort('usersCount')}
                >
                  Usuarios {getSortIndicator('usersCount')}
                </TableHead>
                <TableHead className="text-center">Tipo</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((role) => {
                const IconComponent = getRoleIcon(role.icon);
                return (
                  <TableRow key={role.id}>
                    <TableCell>
                      <IconComponent className="h-5 w-5" style={{ color: role.color }} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: role.color }}
                        />
                        {role.name}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-[250px] truncate">
                      {role.description || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{role.priority}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">
                        {role.enabledCapabilities.length}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{role.usersCount}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {role.isSystem ? (
                        <Badge>Sistema</Badge>
                      ) : (
                        <Badge variant="secondary">Personalizado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(role)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && !role.isSystem && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(role)}
                            disabled={role.usersCount > 0}
                            title={role.usersCount > 0 ? 'No se puede eliminar: tiene usuarios asignados' : ''}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Crear Rol */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Rol</DialogTitle>
            <DialogDescription>
              Define un nuevo rol con capacidades específicas. Los usuarios con este rol tendrán las capacidades que selecciones.
            </DialogDescription>
          </DialogHeader>
          {renderRoleForm(false)}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleCreateRole} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Crear Rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Rol */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Rol: {selectedRole?.name}</DialogTitle>
            <DialogDescription>
              {selectedRole?.isSystem 
                ? 'Este es un rol de sistema. Solo puedes modificar las capacidades y roles asignables.'
                : 'Modifica las propiedades y capacidades de este rol.'}
            </DialogDescription>
          </DialogHeader>
          {renderRoleForm(true)}
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateRole} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Eliminar Rol */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar el rol <strong>{selectedRole?.name}</strong>.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              disabled={saving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

