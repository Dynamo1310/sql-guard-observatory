/**
 * Página de gestión de grupos de credenciales
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Plus, Settings, Trash2, UserPlus, Shield,
  Edit2, MoreVertical, Search, FolderLock, Crown, UserCheck, UserX, Key, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { 
  vaultApi, 
  CredentialGroupDto, 
  VaultUserDto,
  GROUP_ROLES,
  GroupRole
} from '@/services/vaultApi';
import { toast } from 'sonner';

// Colores predefinidos para grupos
const GROUP_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', 
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b', '#475569', '#1e293b'
];

// Iconos disponibles para grupos
const GROUP_ICONS = [
  'FolderLock', 'Shield', 'Key', 'Lock', 'Database', 'Server',
  'Cloud', 'Globe', 'Building', 'Users', 'Star', 'Heart'
];

function getRoleIcon(role: string) {
  switch (role) {
    case GROUP_ROLES.OWNER: return <Crown className="h-4 w-4 text-foreground" />;
    case GROUP_ROLES.ADMIN: return <Shield className="h-4 w-4 text-muted-foreground" />;
    case GROUP_ROLES.MEMBER: return <UserCheck className="h-4 w-4 text-muted-foreground" />;
    default: return <Users className="h-4 w-4 text-muted-foreground" />;
  }
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case GROUP_ROLES.OWNER: return 'default';
    case GROUP_ROLES.ADMIN: return 'secondary';
    default: return 'outline';
  }
}

export default function VaultGroups() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<CredentialGroupDto[]>([]);
  const [availableUsers, setAvailableUsers] = useState<VaultUserDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Dialogs
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CredentialGroupDto | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<CredentialGroupDto | null>(null);
  const [membersSheetOpen, setMembersSheetOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CredentialGroupDto | null>(null);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);

  // Form state
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    color: '#3b82f6',
    icon: 'FolderLock'
  });
  const [newMember, setNewMember] = useState({
    userId: '',
    role: GROUP_ROLES.MEMBER as GroupRole,
    receiveNotifications: true
  });

  const loadGroups = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const [groupsData, usersData] = await Promise.all([
        vaultApi.getGroups(),
        vaultApi.getAvailableUsers()
      ]);
      setGroups(groupsData);
      setAvailableUsers(usersData);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudieron cargar los grupos'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  const filteredGroups = groups.filter(group => 
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateGroup = async () => {
    try {
      await vaultApi.createGroup({
        name: groupForm.name,
        description: groupForm.description || undefined,
        color: groupForm.color,
        icon: groupForm.icon
      });
      toast.success('Grupo creado', {
        description: `El grupo "${groupForm.name}" fue creado exitosamente.`
      });
      setGroupDialogOpen(false);
      resetForm();
      loadGroups();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo crear el grupo'
      });
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    try {
      await vaultApi.updateGroup(editingGroup.id, {
        name: groupForm.name,
        description: groupForm.description || undefined,
        color: groupForm.color,
        icon: groupForm.icon
      });
      toast.success('Grupo actualizado', {
        description: `El grupo "${groupForm.name}" fue actualizado.`
      });
      setGroupDialogOpen(false);
      setEditingGroup(null);
      resetForm();
      loadGroups();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo actualizar el grupo'
      });
    }
  };

  const handleDeleteGroup = async () => {
    if (!groupToDelete) return;
    try {
      await vaultApi.deleteGroup(groupToDelete.id);
      toast.success('Grupo eliminado', {
        description: `El grupo "${groupToDelete.name}" fue eliminado.`
      });
      setDeleteDialogOpen(false);
      setGroupToDelete(null);
      loadGroups();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo eliminar el grupo'
      });
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !newMember.userId) return;
    try {
      await vaultApi.addGroupMember(selectedGroup.id, {
        userId: newMember.userId,
        role: newMember.role,
        receiveNotifications: newMember.receiveNotifications
      });
      toast.success('Miembro agregado', {
        description: 'El usuario fue agregado al grupo.'
      });
      setAddMemberDialogOpen(false);
      setNewMember({ userId: '', role: GROUP_ROLES.MEMBER, receiveNotifications: true });
      // Recargar el grupo seleccionado
      const updatedGroup = await vaultApi.getGroupById(selectedGroup.id);
      setSelectedGroup(updatedGroup);
      loadGroups();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo agregar el miembro'
      });
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!selectedGroup) return;
    try {
      await vaultApi.removeGroupMember(selectedGroup.id, memberId);
      toast.success('Miembro eliminado', {
        description: 'El usuario fue eliminado del grupo.'
      });
      const updatedGroup = await vaultApi.getGroupById(selectedGroup.id);
      setSelectedGroup(updatedGroup);
      loadGroups();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo eliminar el miembro'
      });
    }
  };

  const handleUpdateMemberRole = async (memberId: number, newRole: GroupRole) => {
    if (!selectedGroup) return;
    try {
      await vaultApi.updateGroupMember(selectedGroup.id, memberId, { role: newRole });
      toast.success('Rol actualizado', {
        description: 'El rol del miembro fue actualizado.'
      });
      const updatedGroup = await vaultApi.getGroupById(selectedGroup.id);
      setSelectedGroup(updatedGroup);
      loadGroups();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo actualizar el rol'
      });
    }
  };

  const resetForm = () => {
    setGroupForm({
      name: '',
      description: '',
      color: '#3b82f6',
      icon: 'FolderLock'
    });
  };

  const openEditDialog = (group: CredentialGroupDto) => {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      description: group.description || '',
      color: group.color || '#3b82f6',
      icon: group.icon || 'FolderLock'
    });
    setGroupDialogOpen(true);
  };

  const openMembersSheet = (group: CredentialGroupDto) => {
    setSelectedGroup(group);
    setMembersSheetOpen(true);
  };

  const canManageGroup = (group: CredentialGroupDto) => {
    return group.userRole === GROUP_ROLES.OWNER || group.userRole === GROUP_ROLES.ADMIN;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        
        {/* Search skeleton */}
        <Skeleton className="h-10 w-full max-w-md" />
        
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i}>
              <div className="h-2 bg-muted" />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-5" />
                  <Skeleton className="h-5 w-32" />
                </div>
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FolderLock className="h-8 w-8" />
            Grupos de Credenciales
          </h1>
          <p className="text-muted-foreground">
            Organiza tus credenciales en grupos y define quién puede acceder
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => loadGroups(false)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button onClick={() => { resetForm(); setEditingGroup(null); setGroupDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Grupo
          </Button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar grupos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Lista de grupos */}
      {filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderLock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">
              {searchTerm ? 'No se encontraron grupos' : 'No hay grupos creados'}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {searchTerm 
                ? 'Intenta con otro término de búsqueda'
                : 'Crea tu primer grupo para organizar credenciales'
              }
            </p>
            {!searchTerm && (
              <Button onClick={() => { resetForm(); setGroupDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Crear Grupo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredGroups.map(group => (
            <Card 
              key={group.id} 
              className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/vault/groups/${group.id}`)}
            >
              <div 
                className="h-2" 
                style={{ backgroundColor: group.color || '#3b82f6' }} 
              />
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FolderLock 
                      className="h-5 w-5" 
                      style={{ color: group.color || '#3b82f6' }} 
                    />
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/vault/groups/${group.id}`); }}>
                        <Key className="h-4 w-4 mr-2" />
                        Ver credenciales
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openMembersSheet(group); }}>
                        <Users className="h-4 w-4 mr-2" />
                        Ver miembros
                      </DropdownMenuItem>
                      {canManageGroup(group) && (
                        <>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditDialog(group); }}>
                            <Edit2 className="h-4 w-4 mr-2" />
                            Editar grupo
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); setGroupToDelete(group); setDeleteDialogOpen(true); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Eliminar grupo
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {group.description && (
                  <CardDescription className="line-clamp-2">
                    {group.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Key className="h-4 w-4" />
                      {group.credentialsCount} credenciales
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {group.membersCount} miembros
                    </span>
                  </div>
                  <Badge variant={getRoleBadgeVariant(group.userRole)}>
                    {getRoleIcon(group.userRole)}
                    <span className="ml-1">{group.userRole}</span>
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog para crear/editar grupo */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? 'Editar Grupo' : 'Nuevo Grupo'}
            </DialogTitle>
            <DialogDescription>
              {editingGroup 
                ? 'Modifica los detalles del grupo'
                : 'Crea un nuevo grupo para organizar credenciales'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={groupForm.name}
                onChange={(e) => setGroupForm({...groupForm, name: e.target.value})}
                placeholder="Ej: Servidores de Producción"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={groupForm.description}
                onChange={(e) => setGroupForm({...groupForm, description: e.target.value})}
                placeholder="Descripción opcional del grupo..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      groupForm.color === color 
                        ? 'border-foreground scale-110' 
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setGroupForm({...groupForm, color})}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={editingGroup ? handleUpdateGroup : handleCreateGroup}
              disabled={!groupForm.name.trim()}
            >
              {editingGroup ? 'Guardar cambios' : 'Crear grupo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Las credenciales del grupo no serán eliminadas, 
              pero quedarán sin grupo asignado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteGroup} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sheet de miembros */}
      <Sheet open={membersSheetOpen} onOpenChange={setMembersSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Miembros de {selectedGroup?.name}
            </SheetTitle>
            <SheetDescription>
              Gestiona quién tiene acceso a las credenciales de este grupo
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 space-y-4">
            {/* Botón para agregar miembro */}
            {selectedGroup && canManageGroup(selectedGroup) && (
              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => setAddMemberDialogOpen(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Agregar miembro
              </Button>
            )}

            {/* Lista de miembros */}
            <div className="space-y-2">
              {selectedGroup?.members.map(member => (
                <div 
                  key={member.id} 
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-sm font-medium">
                        {(member.displayName || member.userName).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">
                        {member.displayName || member.userName}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedGroup && canManageGroup(selectedGroup) && member.role !== GROUP_ROLES.OWNER ? (
                      <Select
                        value={member.role}
                        onValueChange={(value) => handleUpdateMemberRole(member.id, value as GroupRole)}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={GROUP_ROLES.ADMIN}>Admin</SelectItem>
                          <SelectItem value={GROUP_ROLES.MEMBER}>Member</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={getRoleBadgeVariant(member.role)}>
                        {getRoleIcon(member.role)}
                        <span className="ml-1">{member.role}</span>
                      </Badge>
                    )}
                    {selectedGroup && canManageGroup(selectedGroup) && member.role !== GROUP_ROLES.OWNER && (
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <UserX className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Dialog para agregar miembro */}
      <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Agregar miembro</DialogTitle>
            <DialogDescription>
              Selecciona un usuario para agregar al grupo
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Usuario *</Label>
              <Select
                value={newMember.userId}
                onValueChange={(value) => setNewMember({...newMember, userId: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un usuario" />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers
                    .filter(u => !selectedGroup?.members.some(m => m.userId === u.id))
                    .map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.displayName || user.userName}
                        {user.email && <span className="text-muted-foreground ml-2">({user.email})</span>}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Rol *</Label>
              <Select
                value={newMember.role}
                onValueChange={(value) => setNewMember({...newMember, role: value as GroupRole})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GROUP_ROLES.ADMIN}>
                    <div className="flex items-center gap-2">
                      {getRoleIcon(GROUP_ROLES.ADMIN)}
                      <span>Admin - Puede gestionar miembros y credenciales</span>
                    </div>
                  </SelectItem>
                  <SelectItem value={GROUP_ROLES.MEMBER}>
                    <div className="flex items-center gap-2">
                      {getRoleIcon(GROUP_ROLES.MEMBER)}
                      <span>Member - Puede ver y revelar credenciales</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="notifications">Recibir notificaciones</Label>
              <Switch
                id="notifications"
                checked={newMember.receiveNotifications}
                onCheckedChange={(checked) => setNewMember({...newMember, receiveNotifications: checked})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddMember}
              disabled={!newMember.userId}
            >
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

