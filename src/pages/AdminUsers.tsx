import { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { authApi, UserDto, CreateUserRequest, UpdateUserRequest } from '@/services/api';

export default function AdminUsers() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    domainUser: '',
    displayName: '',
    password: '',
    role: 'Reader' as 'Admin' | 'Reader',
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

  const handleCreateUser = async () => {
    if (!formData.domainUser || !formData.displayName || !formData.password) {
      toast.error('Todos los campos son obligatorios');
      return;
    }

    try {
      const request: CreateUserRequest = {
        domainUser: formData.domainUser,
        displayName: formData.displayName,
        password: formData.password,
        role: formData.role
      };

      await authApi.createUser(request);
      toast.success('Usuario creado exitosamente');
      setShowCreateDialog(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      toast.error('Error al crear usuario: ' + err.message);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const request: UpdateUserRequest = {
        displayName: formData.displayName,
        role: formData.role,
        active: formData.active
      };

      await authApi.updateUser(selectedUser.id, request);
      toast.success('Usuario actualizado exitosamente');
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
    setSelectedUser(user);
    setFormData({
      domainUser: user.domainUser,
      displayName: user.displayName,
      password: '',
      role: user.role as 'Admin' | 'Reader',
      active: user.active
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (user: UserDto) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  const resetForm = () => {
    setFormData({
      domainUser: '',
      displayName: '',
      password: '',
      role: 'Reader',
      active: true
    });
  };

  const activeUsers = users.filter(u => u.active).length;
  const adminUsers = users.filter(u => u.role === 'Admin').length;
  const readerUsers = users.filter(u => u.role === 'Reader').length;

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
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Administración de Usuarios</h1>
          <p className="text-muted-foreground mt-1">Gestión de accesos y roles del sistema</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Usuario
        </Button>
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
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
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
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(user)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(user)}
                        disabled={user.domainUser === 'TB03260'}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Usuario</DialogTitle>
            <DialogDescription>
              Completa los datos del nuevo usuario. Solo los usuarios agregados aquí podrán acceder al sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domainUser">Usuario</Label>
              <Input
                id="domainUser"
                placeholder="TB12345"
                value={formData.domainUser}
                onChange={(e) => setFormData({ ...formData, domainUser: e.target.value })}
              />
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
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Contraseña inicial"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'Admin' | 'Reader') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Reader">Reader</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreateUser}>
              Crear Usuario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Usuario */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
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
              <Label htmlFor="edit-role">Rol</Label>
              <Select
                value={formData.role}
                onValueChange={(value: 'Admin' | 'Reader') => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Reader">Reader</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setSelectedUser(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser}>
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
              Estás a punto de eliminar al usuario <strong>{selectedUser?.displayName}</strong> ({selectedUser?.domainUser}).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedUser(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
