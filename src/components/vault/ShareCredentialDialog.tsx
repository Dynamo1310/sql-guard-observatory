/**
 * Diálogo para compartir credenciales con grupos y usuarios
 */
import { useState, useEffect } from 'react';
import {
  Users, Share2, Search, X, Check, UserPlus, FolderLock,
  Shield, Eye, Edit, Crown
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  vaultApi,
  CredentialDto,
  CredentialGroupDto,
  VaultUserDto,
  ShareCredentialRequest,
  SHARE_PERMISSIONS,
  SharePermission
} from '@/services/vaultApi';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ShareCredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: CredentialDto | null;
  onShared?: () => void;
}

function getPermissionIcon(permission: string) {
  switch (permission) {
    case SHARE_PERMISSIONS.ADMIN:
      return <Crown className="h-3.5 w-3.5 text-warning" />;
    case SHARE_PERMISSIONS.EDIT:
      return <Edit className="h-3.5 w-3.5 text-info" />;
    default:
      return <Eye className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getPermissionLabel(permission: string) {
  switch (permission) {
    case SHARE_PERMISSIONS.ADMIN:
      return 'Admin - Puede compartir y editar';
    case SHARE_PERMISSIONS.EDIT:
      return 'Editar - Puede modificar la credencial';
    default:
      return 'Ver - Solo lectura';
  }
}

export function ShareCredentialDialog({
  open,
  onOpenChange,
  credential,
  onShared
}: ShareCredentialDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [groups, setGroups] = useState<CredentialGroupDto[]>([]);
  const [users, setUsers] = useState<VaultUserDto[]>([]);

  // Estado del formulario
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [permission, setPermission] = useState<SharePermission>(SHARE_PERMISSIONS.VIEW);
  const [allowReshare, setAllowReshare] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    if (open && credential) {
      loadData();
      // Inicializar con valores actuales
      setSelectedGroupIds(credential.groupShares?.map(gs => gs.groupId) || []);
      setSelectedUserIds(credential.userShares?.map(us => us.userId) || []);
    }
  }, [open, credential]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [groupsData, usersData] = await Promise.all([
        vaultApi.getGroups(),
        vaultApi.getAvailableUsers()
      ]);
      setGroups(groupsData);
      // Filtrar el propietario de la lista de usuarios
      setUsers(usersData.filter(u => u.id !== credential?.ownerUserId));
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudieron cargar los datos'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!credential) return;

    setIsSaving(true);
    try {
      const request: ShareCredentialRequest = {
        groupIds: selectedGroupIds,
        userIds: selectedUserIds,
        permission,
        allowReshare
      };

      await vaultApi.shareCredential(credential.id, request);

      toast.success('Compartido', {
        description: 'La credencial se compartió exitosamente'
      });

      onOpenChange(false);
      onShared?.();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo compartir la credencial'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleGroup = (groupId: number) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
    g.description?.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const filteredUsers = users.filter(u =>
    u.userName.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  // Credenciales actualmente compartidas
  const currentGroupShares = credential?.groupShares || [];
  const currentUserShares = credential?.userShares || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Share2 className="h-5 w-5 text-primary" />
            </div>
            Compartir Credencial
          </DialogTitle>
          <DialogDescription>
            {credential?.name} - Define quién puede acceder a esta credencial
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Permiso por defecto para nuevos compartidos */}
          <div className="flex items-center justify-between">
            <Label>Permiso para nuevos compartidos</Label>
            <Select
              value={permission}
              onValueChange={(v) => setPermission(v as SharePermission)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SHARE_PERMISSIONS.VIEW}>
                  <div className="flex items-center gap-2">
                    {getPermissionIcon(SHARE_PERMISSIONS.VIEW)}
                    <span>Ver</span>
                  </div>
                </SelectItem>
                <SelectItem value={SHARE_PERMISSIONS.EDIT}>
                  <div className="flex items-center gap-2">
                    {getPermissionIcon(SHARE_PERMISSIONS.EDIT)}
                    <span>Editar</span>
                  </div>
                </SelectItem>
                <SelectItem value={SHARE_PERMISSIONS.ADMIN}>
                  <div className="flex items-center gap-2">
                    {getPermissionIcon(SHARE_PERMISSIONS.ADMIN)}
                    <span>Admin</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Opción de permitir re-compartir */}
          <div className="flex items-center justify-between p-4 bg-muted/20 rounded-xl border border-border/30">
            <div className="space-y-0.5">
              <Label htmlFor="allow-reshare" className="text-sm font-medium">
                Permitir re-compartir
              </Label>
              <p className="text-xs text-muted-foreground">
                Los destinatarios podrán compartir esta credencial con otros usuarios
              </p>
            </div>
            <Checkbox
              id="allow-reshare"
              checked={allowReshare}
              onCheckedChange={(checked) => setAllowReshare(checked === true)}
            />
          </div>

          {/* Tabs para grupos y usuarios */}
          <Tabs defaultValue="groups" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1 rounded-lg">
              <TabsTrigger value="groups" className="flex items-center gap-2 rounded-md">
                <FolderLock className="h-4 w-4" />
                Grupos ({selectedGroupIds.length})
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-2 rounded-md">
                <UserPlus className="h-4 w-4" />
                Usuarios ({selectedUserIds.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="groups" className="mt-4 space-y-3">
              {/* Búsqueda de grupos */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar grupos..."
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Lista de grupos */}
              <ScrollArea className="h-[200px] border border-border/50 rounded-xl p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Cargando grupos...
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No hay grupos disponibles
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredGroups.map(group => {
                      const isSelected = selectedGroupIds.includes(group.id);
                      const currentShare = currentGroupShares.find(gs => gs.groupId === group.id);
                      return (
                        <div
                          key={group.id}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200',
                            isSelected 
                              ? 'bg-primary/10 border border-primary/20' 
                              : 'hover:bg-muted/50 border border-transparent'
                          )}
                          onClick={() => toggleGroup(group.id)}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleGroup(group.id)}
                            />
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: group.color || '#6366f1' }}
                            />
                            <div>
                              <p className="font-medium text-sm">{group.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {group.membersCount} miembros
                              </p>
                            </div>
                          </div>
                          {currentShare && (
                            <Badge variant="outline" className="text-xs font-medium">
                              {getPermissionIcon(currentShare.permission)}
                              <span className="ml-1">{currentShare.permission}</span>
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="users" className="mt-4 space-y-3">
              {/* Búsqueda de usuarios */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuarios..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Lista de usuarios */}
              <ScrollArea className="h-[200px] border border-border/50 rounded-xl p-2">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Cargando usuarios...
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No hay usuarios disponibles
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredUsers.map(user => {
                      const isSelected = selectedUserIds.includes(user.id);
                      const currentShare = currentUserShares.find(us => us.userId === user.id);
                      return (
                        <div
                          key={user.id}
                          className={cn(
                            'flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all duration-200',
                            isSelected 
                              ? 'bg-primary/10 border border-primary/20' 
                              : 'hover:bg-muted/50 border border-transparent'
                          )}
                          onClick={() => toggleUser(user.id)}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleUser(user.id)}
                            />
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <span className="text-sm font-medium">
                                {(user.displayName || user.userName).charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {user.displayName || user.userName}
                              </p>
                              {user.email && (
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                              )}
                            </div>
                          </div>
                          {currentShare && (
                            <Badge variant="outline" className="text-xs font-medium">
                              {getPermissionIcon(currentShare.permission)}
                              <span className="ml-1">{currentShare.permission}</span>
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Resumen de selección */}
          {(selectedGroupIds.length > 0 || selectedUserIds.length > 0) && (
            <div className="p-4 bg-muted/20 rounded-xl border border-border/30">
              <p className="text-sm font-medium mb-2">Resumen:</p>
              <div className="flex flex-wrap gap-2">
                {selectedGroupIds.map(id => {
                  const group = groups.find(g => g.id === id);
                  return group ? (
                    <Badge
                      key={`group-${id}`}
                      variant="outline"
                      className="cursor-pointer hover:bg-destructive/10 transition-colors font-medium"
                      onClick={() => toggleGroup(id)}
                    >
                      <FolderLock className="h-3 w-3 mr-1" />
                      {group.name}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ) : null;
                })}
                {selectedUserIds.map(id => {
                  const user = users.find(u => u.id === id);
                  return user ? (
                    <Badge
                      key={`user-${id}`}
                      variant="outline"
                      className="cursor-pointer hover:bg-destructive/10 transition-colors font-medium"
                      onClick={() => toggleUser(id)}
                    >
                      {user.displayName || user.userName}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ShareCredentialDialog;
