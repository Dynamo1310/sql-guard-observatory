/**
 * Página de detalle de un grupo de credenciales
 */
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Users, Shield, Key, Search, RefreshCw,
  Edit2, Trash2, UserPlus, UserX, Crown, Eye, Settings,
  Grid, List, FolderLock, Share2, MoreVertical, Lock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { CredentialCard, CredentialDialog, AuditLogTable, ShareCredentialDialog, CredentialSelector } from '@/components/vault';
import { 
  vaultApi, 
  CredentialDto, 
  CredentialGroupDto,
  CredentialAuditLogDto,
  VaultUserDto,
  GROUP_ROLES,
  GroupRole
} from '@/services/vaultApi';
import { toast } from 'sonner';

// Helper para iconos de rol
function getRoleIcon(role: string) {
  switch (role) {
    case GROUP_ROLES.OWNER: return <Crown className="h-4 w-4 text-amber-500" />;
    case GROUP_ROLES.ADMIN: return <Shield className="h-4 w-4 text-blue-500" />;
    case GROUP_ROLES.MEMBER: return <Key className="h-4 w-4 text-green-500" />;
    case GROUP_ROLES.VIEWER: return <Eye className="h-4 w-4 text-gray-500" />;
    default: return <Users className="h-4 w-4" />;
  }
}

function getRoleBadgeVariant(role: string): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case GROUP_ROLES.OWNER: return 'default';
    case GROUP_ROLES.ADMIN: return 'secondary';
    default: return 'outline';
  }
}

export default function VaultGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [group, setGroup] = useState<CredentialGroupDto | null>(null);
  const [credentials, setCredentials] = useState<CredentialDto[]>([]);
  const [availableUsers, setAvailableUsers] = useState<VaultUserDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('credentials');

  // Estados para dialogs
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<CredentialDto | undefined>();
  const [deleteCredentialDialogOpen, setDeleteCredentialDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<CredentialDto | null>(null);
  const [removeFromGroupDialogOpen, setRemoveFromGroupDialogOpen] = useState(false);
  const [credentialToRemove, setCredentialToRemove] = useState<CredentialDto | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharingCredential, setSharingCredential] = useState<CredentialDto | null>(null);
  const [auditSheetOpen, setAuditSheetOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<CredentialAuditLogDto[]>([]);
  const [auditCredentialName, setAuditCredentialName] = useState('');
  
  // Estado para selector de credenciales existentes
  const [addExistingDialogOpen, setAddExistingDialogOpen] = useState(false);
  
  // Estado para miembros
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [newMember, setNewMember] = useState({
    userId: '',
    role: GROUP_ROLES.MEMBER as GroupRole,
    receiveNotifications: true
  });

  const groupId = parseInt(id || '0');

  const loadData = async (showLoading = true) => {
    if (!groupId) return;
    
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);

    try {
      const [groupData, credentialsData, usersData] = await Promise.all([
        vaultApi.getGroupById(groupId),
        vaultApi.getGroupCredentials(groupId),
        vaultApi.getAvailableUsers()
      ]);
      setGroup(groupData);
      setCredentials(credentialsData);
      setAvailableUsers(usersData);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo cargar el grupo'
      });
      navigate('/vault/groups');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [groupId]);

  // Filtrar credenciales
  const filteredCredentials = useMemo(() => {
    if (!searchTerm) return credentials;
    const term = searchTerm.toLowerCase();
    return credentials.filter(cred => 
      cred.name.toLowerCase().includes(term) ||
      cred.username.toLowerCase().includes(term) ||
      cred.description?.toLowerCase().includes(term)
    );
  }, [credentials, searchTerm]);

  const canManageGroup = group?.userRole === GROUP_ROLES.OWNER || group?.userRole === GROUP_ROLES.ADMIN;

  // Handlers de credenciales
  const handleNewCredential = () => {
    setEditingCredential(undefined);
    setCredentialDialogOpen(true);
  };

  const handleEditCredential = (credential: CredentialDto) => {
    setEditingCredential(credential);
    setCredentialDialogOpen(true);
  };

  const handleDeleteCredential = (credential: CredentialDto) => {
    setCredentialToDelete(credential);
    setDeleteCredentialDialogOpen(true);
  };

  const confirmDeleteCredential = async () => {
    if (!credentialToDelete) return;

    try {
      await vaultApi.deleteCredential(credentialToDelete.id);
      toast.success('Credencial eliminada', {
        description: `"${credentialToDelete.name}" fue eliminada correctamente.`
      });
      loadData(false);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo eliminar la credencial'
      });
    } finally {
      setDeleteCredentialDialogOpen(false);
      setCredentialToDelete(null);
    }
  };

  const handleRemoveFromGroup = (credential: CredentialDto) => {
    setCredentialToRemove(credential);
    setRemoveFromGroupDialogOpen(true);
  };

  const confirmRemoveFromGroup = async () => {
    if (!credentialToRemove || !groupId) return;

    try {
      await vaultApi.removeCredentialFromGroup(groupId, credentialToRemove.id);
      toast.success('Credencial removida', {
        description: `"${credentialToRemove.name}" fue removida del grupo.`
      });
      loadData(false);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo remover la credencial del grupo'
      });
    } finally {
      setRemoveFromGroupDialogOpen(false);
      setCredentialToRemove(null);
    }
  };

  const handleViewAudit = async (credential: CredentialDto) => {
    try {
      const logs = await vaultApi.getCredentialAuditLog(credential.id);
      setAuditLogs(logs);
      setAuditCredentialName(credential.name);
      setAuditSheetOpen(true);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo cargar el historial'
      });
    }
  };

  const handleShare = (credential: CredentialDto) => {
    setSharingCredential(credential);
    setShareDialogOpen(true);
  };

  // Handlers de miembros
  const handleAddMember = async () => {
    if (!newMember.userId || !groupId) return;

    try {
      await vaultApi.addGroupMember(groupId, {
        userId: newMember.userId,
        role: newMember.role,
        receiveNotifications: newMember.receiveNotifications
      });
      toast.success('Miembro agregado', {
        description: 'El usuario fue agregado al grupo correctamente.'
      });
      setAddMemberDialogOpen(false);
      setNewMember({ userId: '', role: GROUP_ROLES.MEMBER, receiveNotifications: true });
      loadData(false);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo agregar el miembro'
      });
    }
  };

  const handleUpdateMemberRole = async (memberId: number, newRole: GroupRole) => {
    if (!groupId) return;
    
    try {
      await vaultApi.updateGroupMember(groupId, memberId, { role: newRole });
      toast.success('Rol actualizado', {
        description: 'El rol del miembro fue actualizado correctamente.'
      });
      loadData(false);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo actualizar el rol'
      });
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!groupId) return;
    
    try {
      await vaultApi.removeGroupMember(groupId, memberId);
      toast.success('Miembro removido', {
        description: 'El usuario fue removido del grupo.'
      });
      loadData(false);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo remover el miembro'
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderLock className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Grupo no encontrado</h3>
            <p className="text-muted-foreground text-sm mb-4">
              El grupo que buscas no existe o no tienes acceso.
            </p>
            <Button onClick={() => navigate('/vault/groups')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver a grupos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/vault/groups')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div 
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: group.color || '#3b82f6' }}
          >
            <FolderLock className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {group.name}
              <Badge variant={getRoleBadgeVariant(group.userRole)}>
                {getRoleIcon(group.userRole)}
                <span className="ml-1">{group.userRole}</span>
              </Badge>
            </h1>
            {group.description && (
              <p className="text-muted-foreground">{group.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => loadData(false)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
          {canManageGroup && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/vault/groups`)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Editar grupo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{credentials.length}</p>
                <p className="text-sm text-muted-foreground">Credenciales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{group.membersCount}</p>
                <p className="text-sm text-muted-foreground">Miembros</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="credentials" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Credenciales ({credentials.length})
          </TabsTrigger>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Miembros ({group.membersCount})
          </TabsTrigger>
        </TabsList>

        {/* Tab de Credenciales */}
        <TabsContent value="credentials" className="mt-6 space-y-4">
          {/* Controles */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar credenciales..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            {canManageGroup && (
              <>
                <Button variant="outline" onClick={() => setAddExistingDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar existente
                </Button>
                <Button onClick={handleNewCredential}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva credencial
                </Button>
              </>
            )}
          </div>

          {/* Lista de credenciales */}
          {filteredCredentials.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Key className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">
                  {searchTerm ? 'No se encontraron credenciales' : 'Sin credenciales'}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">
                  {searchTerm 
                    ? 'Intenta con otro término de búsqueda'
                    : 'Este grupo aún no tiene credenciales compartidas.'
                  }
                </p>
                {!searchTerm && canManageGroup && (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setAddExistingDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar existente
                    </Button>
                    <Button onClick={handleNewCredential}>
                      <Plus className="h-4 w-4 mr-2" />
                      Nueva credencial
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className={
              viewMode === 'grid' 
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
                : 'space-y-3'
            }>
              {filteredCredentials.map(credential => (
                <CredentialCard
                  key={credential.id}
                  credential={credential}
                  onEdit={canManageGroup ? handleEditCredential : undefined}
                  onDelete={canManageGroup ? handleDeleteCredential : undefined}
                  onViewAudit={handleViewAudit}
                  onShare={canManageGroup ? handleShare : undefined}
                  variant={viewMode === 'list' ? 'compact' : 'default'}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab de Miembros */}
        <TabsContent value="members" className="mt-6 space-y-4">
          {canManageGroup && (
            <Button onClick={() => setAddMemberDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Agregar miembro
            </Button>
          )}

          <div className="space-y-2">
            {group.members.map(member => (
              <Card key={member.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-sm font-medium">
                        {(member.displayName || member.userName).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{member.displayName || member.userName}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canManageGroup && member.role !== GROUP_ROLES.OWNER ? (
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
                          <SelectItem value={GROUP_ROLES.VIEWER}>Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={getRoleBadgeVariant(member.role)}>
                        {getRoleIcon(member.role)}
                        <span className="ml-1">{member.role}</span>
                      </Badge>
                    )}
                    {canManageGroup && member.role !== GROUP_ROLES.OWNER && (
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
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de crear/editar credencial */}
      <CredentialDialog
        open={credentialDialogOpen}
        onOpenChange={setCredentialDialogOpen}
        credential={editingCredential}
        defaultGroupId={groupId}
        onSuccess={() => loadData(false)}
      />

      {/* Dialog de compartir */}
      <ShareCredentialDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        credential={sharingCredential}
        onShared={() => loadData(false)}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteCredentialDialogOpen} onOpenChange={setDeleteCredentialDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar credencial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La credencial "{credentialToDelete?.name}" 
              será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCredential} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmación de remover del grupo */}
      <AlertDialog open={removeFromGroupDialogOpen} onOpenChange={setRemoveFromGroupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Remover del grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              La credencial "{credentialToRemove?.name}" dejará de estar compartida con este grupo.
              La credencial no será eliminada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveFromGroup}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sheet de auditoría */}
      <Sheet open={auditSheetOpen} onOpenChange={setAuditSheetOpen}>
        <SheetContent className="sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle>Historial de "{auditCredentialName}"</SheetTitle>
            <SheetDescription>
              Registro de todas las acciones realizadas sobre esta credencial
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <AuditLogTable logs={auditLogs} />
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
                    .filter(u => !group?.members.some(m => m.userId === u.id))
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
                  <SelectItem value={GROUP_ROLES.VIEWER}>
                    <div className="flex items-center gap-2">
                      {getRoleIcon(GROUP_ROLES.VIEWER)}
                      <span>Viewer - Solo puede ver credenciales</span>
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

      {/* Selector de credenciales existentes */}
      <CredentialSelector
        open={addExistingDialogOpen}
        onOpenChange={setAddExistingDialogOpen}
        groupId={groupId}
        excludeCredentialIds={credentials.map(c => c.id)}
        onCredentialsAdded={() => loadData(false)}
      />
    </div>
  );
}

