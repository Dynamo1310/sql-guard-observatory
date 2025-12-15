import { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2, UserPlus, Search, Loader2 } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { authApi, UserDto, CreateUserRequest, UpdateUserRequest, ActiveDirectoryUserDto } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';

export default function AdminUsers() {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  
  // AD Import states
  const [showImportAdDialog, setShowImportAdDialog] = useState(false);
  const [adGroupName, setAdGroupName] = useState('GSCORP\\SQL_admins');
  const [adGroupMembers, setAdGroupMembers] = useState<ActiveDirectoryUserDto[]>([]);
  const [selectedAdUsers, setSelectedAdUsers] = useState<Set<string>>(new Set());
  const [importRole, setImportRole] = useState<'SuperAdmin' | 'Admin' | 'Reader'>('Admin');
  const [searchingAdGroup, setSearchingAdGroup] = useState(false);
  const [importingUsers, setImportingUsers] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    domainUser: '',
    displayName: '',
    email: '',
    role: 'Reader' as 'SuperAdmin' | 'Admin' | 'Reader',
    active: true
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await authApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      toast.error('Error al cargar usuarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Verificar si el usuario actual puede editar a otro usuario
  const canEditUser = (targetUser: UserDto): boolean => {
    // SuperAdmin puede editar a todos
    if (isSuperAdmin) return true;
    
    // Admin puede editarse a sí mismo (solo nombre y estado, no rol)
    if (currentUser?.domainUser === targetUser.domainUser) {
      return true;
    }
    
    // Admin no puede editar a un SuperAdmin
    if (targetUser.role === 'SuperAdmin') {
      return false;
    }
    
    return true;
  };

  // Verificar si se está editando el propio perfil
  const isEditingOwnProfile = (targetUser: UserDto): boolean => {
    return !isSuperAdmin && currentUser?.domainUser === targetUser.domainUser;
  };

  // Verificar si el usuario actual puede eliminar a otro usuario
  const canDeleteUser = (targetUser: UserDto): boolean => {
    // SuperAdmin puede eliminar a todos (excepto TB03260 que se valida en backend)
    if (isSuperAdmin) return true;
    
    // Admin no puede eliminarse a sí mismo
    if (currentUser?.domainUser === targetUser.domainUser) {
      return false;
    }
    
    // Admin no puede eliminar a un SuperAdmin
    if (targetUser.role === 'SuperAdmin') {
      return false;
    }
    
    return true;
  };

  const handleCreateUser = async () => {
    if (!formData.domainUser || !formData.displayName) {
      toast.error('El usuario de dominio y nombre para mostrar son obligatorios');
      return;
    }

    try {
      const request: CreateUserRequest = {
        domainUser: formData.domainUser,
        displayName: formData.displayName,
        email: formData.email || undefined,
        role: formData.role
      };

      await authApi.createUser(request);
      toast.success('Usuario agregado a la lista blanca exitosamente');
      setShowCreateDialog(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      toast.error('Error al crear usuario: ' + err.message);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    // Verificar permisos
    if (!canEditUser(selectedUser)) {
      toast.error('No tienes permisos para editar este usuario');
      return;
    }

    try {
      const request: UpdateUserRequest = {
        displayName: formData.displayName,
        email: formData.email || undefined,
        role: formData.role,
        active: formData.active
      };

      await authApi.updateUser(selectedUser.id, request);
      
      // Si se cambió el rol del usuario, mostrar mensaje informativo
      const roleChanged = selectedUser.role !== formData.role;
      if (roleChanged) {
        toast.success('Usuario actualizado exitosamente', {
          description: 'El usuario deberá cerrar sesión para que los cambios surtan efecto'
        });
      } else {
        toast.success('Usuario actualizado exitosamente');
      }
      
      setShowEditDialog(false);
      setSelectedUser(null);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      toast.error('Error al actualizar usuario: ' + err.message);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    // Verificar permisos
    if (!canDeleteUser(selectedUser)) {
      toast.error('No tienes permisos para eliminar este usuario');
      return;
    }

    try {
      await authApi.deleteUser(selectedUser.id);
      toast.success('Usuario eliminado exitosamente');
      setShowDeleteDialog(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err: any) {
      toast.error('Error al eliminar usuario: ' + err.message);
    }
  };

  const openEditDialog = (user: UserDto) => {
    // Verificar permisos antes de abrir el diálogo
    if (!canEditUser(user)) {
      toast.error('No tienes permisos para editar este usuario');
      return;
    }

    setSelectedUser(user);
    setFormData({
      domainUser: user.domainUser,
      displayName: user.displayName,
      email: user.email || '',
      role: user.role as 'SuperAdmin' | 'Admin' | 'Reader',
      active: user.active
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (user: UserDto) => {
    // Verificar permisos antes de abrir el diálogo
    if (!canDeleteUser(user)) {
      toast.error('No tienes permisos para eliminar este usuario');
      return;
    }

    // Validación adicional para TB03260
    if (user.domainUser === 'TB03260') {
      toast.error('No se puede eliminar el SuperAdmin principal');
      return;
    }

    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  // Funciones para importación de grupos AD
  const handleSearchAdGroup = async () => {
    if (!adGroupName.trim()) {
      toast.error('Ingresa el nombre del grupo AD');
      return;
    }

    setSearchingAdGroup(true);
    try {
      const response = await authApi.getAdGroupMembers(adGroupName);
      setAdGroupMembers(response.members);
      setSelectedAdUsers(new Set(response.members.map(m => m.samAccountName)));
      toast.success(`${response.count} usuarios encontrados en el grupo ${response.groupName}`);
    } catch (error: any) {
      toast.error(error.message || 'Error al buscar el grupo AD');
      setAdGroupMembers([]);
      setSelectedAdUsers(new Set());
    } finally {
      setSearchingAdGroup(false);
    }
  };

  const handleToggleAdUser = (samAccountName: string) => {
    const newSelected = new Set(selectedAdUsers);
    if (newSelected.has(samAccountName)) {
      newSelected.delete(samAccountName);
    } else {
      newSelected.add(samAccountName);
    }
    setSelectedAdUsers(newSelected);
  };

  const handleSelectAllAdUsers = (checked: boolean) => {
    if (checked) {
      setSelectedAdUsers(new Set(adGroupMembers.map(m => m.samAccountName)));
    } else {
      setSelectedAdUsers(new Set());
    }
  };

  const handleImportFromAdGroup = async () => {
    if (selectedAdUsers.size === 0) {
      toast.error('Selecciona al menos un usuario para importar');
      return;
    }

    setImportingUsers(true);
    try {
      const response = await authApi.importFromAdGroup({
        groupName: adGroupName,
        selectedUsernames: Array.from(selectedAdUsers),
        defaultRole: importRole
      });

      toast.success(response.message);
      
      if (response.errors.length > 0) {
        console.error('Errores durante la importación:', response.errors);
      }

      // Recargar la lista de usuarios
      await fetchUsers();
      
      // Cerrar el diálogo y resetear
      setShowImportAdDialog(false);
      setAdGroupMembers([]);
      setSelectedAdUsers(new Set());
      setAdGroupName('GSCORP\\SQL_admins');
      setImportRole('Admin');
    } catch (error: any) {
      toast.error(error.message || 'Error al importar usuarios');
    } finally {
      setImportingUsers(false);
    }
  };

  const resetForm = () => {
    setFormData({
      domainUser: '',
      displayName: '',
      email: '',
      role: 'Reader' as 'SuperAdmin' | 'Admin' | 'Reader',
      active: true
    });
  };

  // Obtener opciones de roles disponibles según el usuario actual
  const getAvailableRoles = () => {
    if (isSuperAdmin) {
      // SuperAdmin puede asignar cualquier rol
      return [
        { value: 'Reader', label: 'Reader (Solo lectura)' },
        { value: 'Admin', label: 'Admin (Gestión de usuarios)' },
        { value: 'SuperAdmin', label: 'SuperAdmin (Acceso total)' }
      ];
    } else {
      // Admin solo puede asignar Reader y Admin
      return [
        { value: 'Reader', label: 'Reader (Solo lectura)' },
        { value: 'Admin', label: 'Admin (Gestión de usuarios)' }
      ];
    }
  };

  const activeUsers = users.filter(u => u.active).length;
  const superAdminUsers = users.filter(u => u.role === 'SuperAdmin').length;
  const adminUsers = users.filter(u => u.role === 'Admin').length;
  const readerUsers = users.filter(u => u.role === 'Reader').length;

  const { sortedData, requestSort, getSortIndicator } = useTableSort(users);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando usuarios...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Administración de Usuarios</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Gestión de accesos y roles del sistema</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button onClick={() => setShowImportAdDialog(true)} variant="outline" className="w-full sm:w-auto">
            <UserPlus className="mr-2 h-4 w-4" />
            Importar desde Grupo AD
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Usuario
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Usuarios Activos"
          value={activeUsers}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Super Admins"
          value={superAdminUsers}
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
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('domainUser')}
                >
                  Usuario {getSortIndicator('domainUser')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('displayName')}
                >
                  Nombre {getSortIndicator('displayName')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('role')}
                >
                  Rol {getSortIndicator('role')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('active')}
                >
                  Estado {getSortIndicator('active')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('createdAt')}
                >
                  Fecha Alta {getSortIndicator('createdAt')}
                </TableHead>
                <TableHead className="text-xs text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono text-xs py-2">{user.domainUser}</TableCell>
                  <TableCell className="font-medium text-xs py-2">{user.displayName}</TableCell>
                  <TableCell className="py-2">
                    <Badge 
                      variant="outline" 
                      className={
                        user.role === 'SuperAdmin' ? 'border-purple-500 text-purple-500 text-xs' :
                        user.role === 'Admin' ? 'border-primary text-primary text-xs' : 'text-xs'
                      }
                    >
                      {user.role === 'SuperAdmin' ? 'Super Admin' : user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusBadge status={user.active ? 'success' : 'critical'}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="font-mono text-xs py-2">
                    {new Date(user.createdAt).toLocaleDateString('es-ES')}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                        disabled={!canEditUser(user)}
                        title={!canEditUser(user) ? 'No tienes permisos para editar este usuario' : ''}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(user)}
                        disabled={!canDeleteUser(user) || user.domainUser === 'TB03260'}
                        title={
                          user.domainUser === 'TB03260' ? 'No se puede eliminar el SuperAdmin principal' :
                          !canDeleteUser(user) ? 'No tienes permisos para eliminar este usuario' : ''
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Crear Usuario */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar Usuario a Lista Blanca</DialogTitle>
            <DialogDescription>
              Completa los datos del usuario del dominio gscorp.ad. Solo los usuarios agregados aquí podrán acceder al sistema con su autenticación de Windows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domainUser">Usuario de Dominio</Label>
              <Input
                id="domainUser"
                placeholder="TB12345"
                value={formData.domainUser}
                onChange={(e) => setFormData({ ...formData, domainUser: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Usuario del dominio gscorp.ad (sin incluir el dominio)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Nombre Completo</Label>
              <Input
                id="displayName"
                placeholder="Juan Pérez"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@empresa.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Email para recibir notificaciones del sistema
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'SuperAdmin' | 'Admin' | 'Reader') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableRoles().map(role => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSuperAdmin && (
                <p className="text-xs text-muted-foreground">
                  Solo puedes asignar roles Reader y Admin
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} className="w-full sm:w-auto">
              Crear Usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Usuario */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
            <DialogDescription>
              Modifica los datos del usuario seleccionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Input value={formData.domainUser} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-displayName">Nombre Completo</Label>
              <Input
                id="edit-displayName"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="usuario@empresa.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Email para recibir notificaciones del sistema
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Rol</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'SuperAdmin' | 'Admin' | 'Reader') => setFormData({ ...formData, role: value })}
                disabled={selectedUser && isEditingOwnProfile(selectedUser)}
              >
                <SelectTrigger 
                  title={selectedUser && isEditingOwnProfile(selectedUser) ? 'No puedes cambiar tu propio rol' : ''}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableRoles().map(role => (
                    <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedUser && isEditingOwnProfile(selectedUser) && (
                <p className="text-xs text-muted-foreground">
                  No puedes modificar tu propio rol por seguridad
                </p>
              )}
              {!isSuperAdmin && selectedUser && !isEditingOwnProfile(selectedUser) && (
                <p className="text-xs text-muted-foreground">
                  Solo puedes asignar roles Reader y Admin
                </p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="edit-active">Usuario activo</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Este usuario se autentica con su cuenta de Windows del dominio gscorp.ad.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setSelectedUser(null); }} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser} className="w-full sm:w-auto">
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Eliminar Usuario */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar de la lista blanca al usuario <strong>{selectedUser?.displayName}</strong> ({selectedUser?.domainUser}).
              Este usuario ya no podrá acceder al sistema. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar de Lista Blanca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Importar desde Grupo AD */}
      <Dialog open={showImportAdDialog} onOpenChange={setShowImportAdDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Usuarios desde Grupo de Active Directory</DialogTitle>
            <DialogDescription>
              Busca un grupo de AD y selecciona los usuarios que deseas agregar a la lista blanca de la aplicación.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Input para nombre del grupo */}
            <div className="space-y-2">
              <Label htmlFor="adGroupName">Nombre del Grupo AD</Label>
              <div className="flex gap-2">
                <Input
                  id="adGroupName"
                  placeholder="GSCORP\SQL_admins"
                  value={adGroupName}
                  onChange={(e) => setAdGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchAdGroup()}
                  disabled={searchingAdGroup}
                  className="flex-1"
                />
                <Button 
                  onClick={handleSearchAdGroup} 
                  disabled={searchingAdGroup || !adGroupName.trim()}
                >
                  {searchingAdGroup ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Buscando...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Buscar
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ingresa el nombre del grupo con o sin el dominio (ej: GSCORP\SQL_admins o SQL_admins)
              </p>
            </div>

            {/* Lista de usuarios encontrados */}
            {adGroupMembers.length > 0 && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Usuarios encontrados ({adGroupMembers.length})</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="selectAll"
                        checked={selectedAdUsers.size === adGroupMembers.length}
                        onCheckedChange={handleSelectAllAdUsers}
                      />
                      <label
                        htmlFor="selectAll"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Seleccionar todos
                      </label>
                    </div>
                  </div>
                  
                  <div className="border rounded-md max-h-60 overflow-y-auto">
                    <div className="p-2 space-y-2">
                      {adGroupMembers.map((member) => (
                        <div 
                          key={member.samAccountName}
                          className="flex items-start space-x-2 p-2 rounded hover:bg-accent"
                        >
                          <Checkbox
                            id={member.samAccountName}
                            checked={selectedAdUsers.has(member.samAccountName)}
                            onCheckedChange={() => handleToggleAdUser(member.samAccountName)}
                          />
                          <label
                            htmlFor={member.samAccountName}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="text-sm font-medium">{member.displayName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{member.samAccountName}</div>
                            {member.email && (
                              <div className="text-xs text-muted-foreground">{member.email}</div>
                            )}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Selector de rol por defecto */}
                <div className="space-y-2">
                  <Label htmlFor="importRole">Rol por Defecto</Label>
                  <Select
                    value={importRole}
                    onValueChange={(value: 'SuperAdmin' | 'Admin' | 'Reader') => setImportRole(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableRoles().map(role => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Todos los usuarios importados tendrán este rol. Podrás cambiarlo individualmente después.
                    {!isSuperAdmin && ' (Solo puedes asignar Reader y Admin)'}
                  </p>
                </div>

                {/* Información de importación */}
                <div className="bg-accent/50 p-3 rounded-md">
                  <p className="text-sm">
                    <strong>{selectedAdUsers.size}</strong> de <strong>{adGroupMembers.length}</strong> usuarios seleccionados para importar
                  </p>
                  {selectedAdUsers.size > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Los usuarios ya existentes en la base de datos serán omitidos.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowImportAdDialog(false);
                setAdGroupMembers([]);
                setSelectedAdUsers(new Set());
              }}
              disabled={importingUsers}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleImportFromAdGroup}
              disabled={importingUsers || selectedAdUsers.size === 0}
              className="w-full sm:w-auto"
            >
              {importingUsers ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Importar {selectedAdUsers.size} Usuario{selectedAdUsers.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
