import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Users, 
  Shield, 
  ShieldCheck,
  FolderSync, 
  UserPlus, 
  Trash2,
  Save,
  RefreshCw,
  Loader2,
  Search,
  Check,
  X
} from 'lucide-react';


import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { UserAvatar } from '@/components/UserAvatar';
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
import { toast } from 'sonner';
import { groupsApi, permissionsApi, adminAssignmentsApi, AvailableViewsDto, GroupAdminsDto, AvailableAdminDto } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { 
  SecurityGroupDetail, 
  GroupMember, 
  AvailableUser,
  ADSyncConfig,
  ADSyncResult 
} from '@/types';

export default function AdminGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isSuperAdmin, isReader, canManageGroup } = useAuth();
  const groupId = parseInt(id || '0');

  const [group, setGroup] = useState<SecurityGroupDetail | null>(null);
  const [availableViews, setAvailableViews] = useState<AvailableViewsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Estado de permisos modificados
  const [permissionChanges, setPermissionChanges] = useState<Map<string, boolean>>(new Map());
  
  // Estado para agregar miembros
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  
  // Estado para eliminar miembro
  const [showRemoveMemberDialog, setShowRemoveMemberDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<GroupMember | null>(null);
  
  // Estado para AD Sync
  const [adSyncForm, setAdSyncForm] = useState({
    adGroupName: '',
    autoSync: false,
    syncIntervalHours: 24,
  });
  const [syncingAD, setSyncingAD] = useState(false);
  const [savingADConfig, setSavingADConfig] = useState(false);
  const [adSyncResult, setAdSyncResult] = useState<ADSyncResult | null>(null);
  
  // Estado para Administradores (solo SuperAdmin)
  const [groupAdmins, setGroupAdmins] = useState<GroupAdminsDto | null>(null);
  const [availableAdmins, setAvailableAdmins] = useState<AvailableAdminDto[]>([]);
  const [showAddAdminDialog, setShowAddAdminDialog] = useState(false);
  const [selectedAdmins, setSelectedAdmins] = useState<Set<string>>(new Set());
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [addingAdmins, setAddingAdmins] = useState(false);
  const [adminToRemove, setAdminToRemove] = useState<string | null>(null);
  const [showRemoveAdminDialog, setShowRemoveAdminDialog] = useState(false);
  
  // Verificar si el usuario actual puede editar este grupo
  const canEdit = canManageGroup(groupId) && !isReader;

  useEffect(() => {
    if (groupId > 0) {
      loadGroupData();
    }
  }, [groupId]);

  const loadGroupData = async () => {
    try {
      setLoading(true);
      const [groupData, viewsData] = await Promise.all([
        groupsApi.getGroup(groupId),
        permissionsApi.getAvailableViews(),
      ]);
      setGroup(groupData);
      setAvailableViews(viewsData);
      
      // Cargar configuración AD si existe
      if (groupData.adSyncConfig) {
        setAdSyncForm({
          adGroupName: groupData.adSyncConfig.adGroupName,
          autoSync: groupData.adSyncConfig.autoSync,
          syncIntervalHours: groupData.adSyncConfig.syncIntervalHours,
        });
      }
      
      // Cargar administradores si es SuperAdmin
      if (isSuperAdmin) {
        loadGroupAdmins();
      }
    } catch (err: any) {
      toast.error('Error al cargar grupo: ' + err.message);
      navigate('/admin/groups');
    } finally {
      setLoading(false);
    }
  };
  
  // ==================== ADMINISTRADORES (Solo SuperAdmin) ====================
  
  const loadGroupAdmins = async () => {
    try {
      const admins = await adminAssignmentsApi.getGroupAdmins(groupId);
      setGroupAdmins(admins);
    } catch (err: any) {
      console.error('Error al cargar administradores:', err);
    }
  };
  
  const loadAvailableAdmins = async () => {
    try {
      setLoadingAdmins(true);
      const admins = await adminAssignmentsApi.getAvailableAdminsForGroup(groupId);
      setAvailableAdmins(admins);
    } catch (err: any) {
      toast.error('Error al cargar administradores disponibles: ' + err.message);
    } finally {
      setLoadingAdmins(false);
    }
  };
  
  const handleAddAdminClick = () => {
    loadAvailableAdmins();
    setSelectedAdmins(new Set());
    setShowAddAdminDialog(true);
  };
  
  const handleAddAdmins = async () => {
    if (selectedAdmins.size === 0) return;
    
    try {
      setAddingAdmins(true);
      
      // Obtener administradores actuales
      const currentAdmins = groupAdmins?.admins || [];
      const newAdmins = [...currentAdmins.map(a => ({
        userId: a.userId,
        canEdit: a.canEdit,
        canDelete: a.canDelete,
        canManageMembers: a.canManageMembers,
        canManagePermissions: a.canManagePermissions,
      }))];
      
      // Agregar nuevos administradores
      for (const userId of selectedAdmins) {
        if (!newAdmins.find(a => a.userId === userId)) {
          newAdmins.push({
            userId,
            canEdit: true,
            canDelete: false,
            canManageMembers: true,
            canManagePermissions: true,
          });
        }
      }
      
      await adminAssignmentsApi.updateGroupAdmins(groupId, newAdmins);
      toast.success('Administradores agregados exitosamente');
      setShowAddAdminDialog(false);
      setSelectedAdmins(new Set());
      loadGroupAdmins();
    } catch (err: any) {
      toast.error('Error al agregar administradores: ' + err.message);
    } finally {
      setAddingAdmins(false);
    }
  };
  
  const handleRemoveAdmin = async () => {
    if (!adminToRemove) return;
    
    try {
      await adminAssignmentsApi.removeGroupFromUser(adminToRemove, groupId);
      toast.success('Administrador removido exitosamente');
      setShowRemoveAdminDialog(false);
      setAdminToRemove(null);
      loadGroupAdmins();
    } catch (err: any) {
      toast.error('Error al remover administrador: ' + err.message);
    }
  };

  // ==================== PERMISOS ====================
  
  const handleTogglePermission = (viewName: string) => {
    const currentValue = group?.permissions[viewName] ?? false;
    const pendingValue = permissionChanges.get(viewName);
    const newValue = pendingValue !== undefined ? !pendingValue : !currentValue;
    
    const newChanges = new Map(permissionChanges);
    
    // Si volvemos al valor original, eliminar del mapa de cambios
    if (newValue === (group?.permissions[viewName] ?? false)) {
      newChanges.delete(viewName);
    } else {
      newChanges.set(viewName, newValue);
    }
    
    setPermissionChanges(newChanges);
  };

  const getPermissionValue = (viewName: string): boolean => {
    const pendingValue = permissionChanges.get(viewName);
    if (pendingValue !== undefined) return pendingValue;
    return group?.permissions[viewName] ?? false;
  };

  const handleSavePermissions = async () => {
    if (permissionChanges.size === 0) {
      toast.info('No hay cambios para guardar');
      return;
    }

    try {
      setSaving(true);
      
      // Combinar permisos actuales con cambios
      const updatedPermissions: Record<string, boolean> = { ...group?.permissions };
      permissionChanges.forEach((value, key) => {
        updatedPermissions[key] = value;
      });
      
      await groupsApi.updatePermissions(groupId, updatedPermissions);
      toast.success('Permisos actualizados exitosamente');
      setPermissionChanges(new Map());
      loadGroupData();
    } catch (err: any) {
      toast.error('Error al guardar permisos: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ==================== MIEMBROS ====================
  
  const openAddMemberDialog = async () => {
    setShowAddMemberDialog(true);
    setLoadingUsers(true);
    try {
      const users = await groupsApi.getAvailableUsersForGroup(groupId);
      setAvailableUsers(users);
    } catch (err: any) {
      toast.error('Error al cargar usuarios: ' + err.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedUsers.size === 0) {
      toast.error('Selecciona al menos un usuario');
      return;
    }

    try {
      setAddingMembers(true);
      await groupsApi.addMembers(groupId, Array.from(selectedUsers));
      toast.success(`${selectedUsers.size} miembro(s) agregado(s) exitosamente`);
      setShowAddMemberDialog(false);
      setSelectedUsers(new Set());
      setUserSearchTerm('');
      loadGroupData();
    } catch (err: any) {
      toast.error('Error al agregar miembros: ' + err.message);
    } finally {
      setAddingMembers(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;

    try {
      await groupsApi.removeMember(groupId, memberToRemove.userId);
      toast.success('Miembro removido exitosamente');
      setShowRemoveMemberDialog(false);
      setMemberToRemove(null);
      loadGroupData();
    } catch (err: any) {
      toast.error('Error al remover miembro: ' + err.message);
    }
  };

  const filteredAvailableUsers = availableUsers.filter(user =>
    !user.isAlreadyMember && (
      user.displayName.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      user.domainUser.toLowerCase().includes(userSearchTerm.toLowerCase())
    )
  );

  // ==================== AD SYNC ====================
  
  const handleSaveADConfig = async () => {
    if (!adSyncForm.adGroupName.trim()) {
      toast.error('El nombre del grupo AD es requerido');
      return;
    }

    try {
      setSavingADConfig(true);
      await groupsApi.updateADSyncConfig(groupId, adSyncForm);
      toast.success('Configuración AD actualizada');
      loadGroupData();
    } catch (err: any) {
      toast.error('Error al guardar configuración: ' + err.message);
    } finally {
      setSavingADConfig(false);
    }
  };

  const handleExecuteADSync = async () => {
    try {
      setSyncingAD(true);
      setAdSyncResult(null);
      const result = await groupsApi.executeADSync(groupId);
      setAdSyncResult(result);
      if (result.success) {
        toast.success(result.message);
        loadGroupData();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error('Error en sincronización: ' + err.message);
    } finally {
      setSyncingAD(false);
    }
  };

  const handleRemoveADConfig = async () => {
    try {
      await groupsApi.removeADSyncConfig(groupId);
      toast.success('Configuración AD removida');
      setAdSyncForm({
        adGroupName: '',
        autoSync: false,
        syncIntervalHours: 24,
      });
      loadGroupData();
    } catch (err: any) {
      toast.error('Error al remover configuración: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-20" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          </div>
          <Skeleton className="h-6 w-16" />
        </div>

        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-96" />

        {/* Content skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!group) {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/groups')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div className="flex items-center gap-3">
            <div 
              className="w-5 h-5 rounded-full" 
              style={{ backgroundColor: group.color || '#3b82f6' }}
            />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
              <p className="text-muted-foreground">{group.description || 'Sin descripción'}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => loadGroupData()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Badge variant={group.isActive ? 'default' : 'secondary'}>
            {group.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="space-y-4">
        <TabsList>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Miembros ({group.memberCount})
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
            <Shield className="h-4 w-4" />
            Permisos
          </TabsTrigger>
          <TabsTrigger value="ad-sync" className="gap-2">
            <FolderSync className="h-4 w-4" />
            Sincronización AD
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="admins" className="gap-2">
              <ShieldCheck className="h-4 w-4" />
              Administradores ({groupAdmins?.admins.length || 0})
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab: Miembros */}
        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Miembros del Grupo</CardTitle>
                <CardDescription>
                  Usuarios que pertenecen a este grupo y heredan sus permisos
                </CardDescription>
              </div>
              <Button onClick={openAddMemberDialog}>
                <UserPlus className="h-4 w-4 mr-2" />
                Agregar Miembros
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Agregado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.members.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            photoUrl={member.profilePhotoUrl}
                            displayName={member.displayName}
                            domainUser={member.domainUser}
                            size="xs"
                          />
                          {member.domainUser}
                        </div>
                      </TableCell>
                      <TableCell>{member.displayName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.role || 'Reader'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(member.addedAt).toLocaleDateString('es-ES')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setMemberToRemove(member);
                            setShowRemoveMemberDialog(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {group.members.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay miembros en este grupo
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Permisos */}
        <TabsContent value="permissions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Permisos del Grupo</CardTitle>
                <CardDescription>
                  Vistas a las que tendrán acceso los miembros de este grupo (modelo aditivo)
                </CardDescription>
              </div>
              {permissionChanges.size > 0 && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setPermissionChanges(new Map())}
                    disabled={saving}
                  >
                    Descartar
                  </Button>
                  <Button onClick={handleSavePermissions} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {(() => {
                // Agrupar vistas por categoría
                const viewsByCategory = availableViews?.views.reduce((acc, view) => {
                  const category = view.category || 'Sin Categoría';
                  if (!acc[category]) {
                    acc[category] = [];
                  }
                  acc[category].push(view);
                  return acc;
                }, {} as Record<string, typeof availableViews.views>) || {};

                // Orden de las categorías
                const categoryOrder = [
                  'Observabilidad',
                  'Observabilidad > Monitoreo',
                  'Observabilidad > Infraestructura',
                  'Observabilidad > Rendimiento',
                  'Observabilidad > Parcheos',
                  'Inventario',
                  'Guardias DBA',
                  'Operaciones',
                  'Seguridad',
                  'Administración > Control de Acceso',
                  'Administración > Configuración',
                  'Administración > Monitoreo Sistema',
                ];
                const sortedCategories = Object.keys(viewsByCategory).sort((a, b) => {
                  const indexA = categoryOrder.indexOf(a);
                  const indexB = categoryOrder.indexOf(b);
                  if (indexA === -1 && indexB === -1) return a.localeCompare(b);
                  if (indexA === -1) return 1;
                  if (indexB === -1) return -1;
                  return indexA - indexB;
                });

                const getCategoryColor = (_category: string) => {
                  // Estilo monocromático para todas las categorías
                  return 'bg-muted text-foreground border-border/50';
                };

                // Contar permisos habilitados por categoría
                const getEnabledCount = (views: typeof availableViews.views) => {
                  return views.filter(v => getPermissionValue(v.viewName)).length;
                };

                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vista</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-center">Acceso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCategories.map((category) => (
                        <>
                          {/* Encabezado de categoría */}
                          <TableRow key={`category-${category}`} className="bg-muted/50 hover:bg-muted/50">
                            <TableCell colSpan={2} className="py-2">
                              <Badge variant="outline" className={`${getCategoryColor(category)} font-semibold`}>
                                {category}
                              </Badge>
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({getEnabledCount(viewsByCategory[category])}/{viewsByCategory[category].length} habilitados)
                              </span>
                            </TableCell>
                            <TableCell className="text-center py-2">
                              <button
                                onClick={() => {
                                  // Toggle all permissions in category
                                  const allEnabled = viewsByCategory[category].every(v => getPermissionValue(v.viewName));
                                  viewsByCategory[category].forEach(view => {
                                    const currentValue = getPermissionValue(view.viewName);
                                    if (allEnabled ? currentValue : !currentValue) {
                                      handleTogglePermission(view.viewName);
                                    }
                                  });
                                }}
                                className="text-xs text-primary hover:underline"
                                disabled={saving}
                              >
                                {viewsByCategory[category].every(v => getPermissionValue(v.viewName)) 
                                  ? 'Desmarcar todos' 
                                  : 'Marcar todos'}
                              </button>
                            </TableCell>
                          </TableRow>
                          {/* Vistas de la categoría */}
                          {viewsByCategory[category].map((view) => {
                            const hasPermission = getPermissionValue(view.viewName);
                            const isModified = permissionChanges.has(view.viewName);
                            
                            return (
                              <TableRow 
                                key={view.viewName}
                                className={isModified ? 'bg-warning/5 dark:bg-warning/10' : ''}
                              >
                                <TableCell className="font-medium pl-6">{view.displayName}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {view.description}
                                </TableCell>
                                <TableCell className="text-center">
                                  <button
                                    onClick={() => handleTogglePermission(view.viewName)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                      hasPermission ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'
                                    }`}
                                    disabled={saving}
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
                        </>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: AD Sync */}
        <TabsContent value="ad-sync">
          <Card>
            <CardHeader>
              <CardTitle>Sincronización con Active Directory</CardTitle>
              <CardDescription>
                Vincula este grupo con un grupo de Active Directory para sincronizar miembros automáticamente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="adGroupName">Nombre del Grupo AD</Label>
                  <Input
                    id="adGroupName"
                    placeholder="GSCORP\SQL_admins o SQL_admins"
                    value={adSyncForm.adGroupName}
                    onChange={(e) => setAdSyncForm({ ...adSyncForm, adGroupName: e.target.value })}
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoSync"
                    checked={adSyncForm.autoSync}
                    onCheckedChange={(checked) => 
                      setAdSyncForm({ ...adSyncForm, autoSync: checked as boolean })
                    }
                  />
                  <Label htmlFor="autoSync">Sincronización automática</Label>
                </div>
                
                {adSyncForm.autoSync && (
                  <div className="space-y-2">
                    <Label htmlFor="syncInterval">Intervalo (horas)</Label>
                    <Input
                      id="syncInterval"
                      type="number"
                      min="1"
                      max="168"
                      value={adSyncForm.syncIntervalHours}
                      onChange={(e) => 
                        setAdSyncForm({ ...adSyncForm, syncIntervalHours: parseInt(e.target.value) || 24 })
                      }
                    />
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleSaveADConfig} 
                    disabled={savingADConfig || !adSyncForm.adGroupName.trim()}
                  >
                    {savingADConfig ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Guardar Configuración
                  </Button>
                  
                  {group.hasADSync && (
                    <>
                      <Button 
                        variant="outline" 
                        onClick={handleExecuteADSync}
                        disabled={syncingAD}
                      >
                        {syncingAD ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Sincronizar Ahora
                      </Button>
                      <Button 
                        variant="destructive" 
                        onClick={handleRemoveADConfig}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Desvincular
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              {/* Info de última sincronización */}
              {group.adSyncConfig && (
                <div className="border rounded-lg p-4 bg-muted/50 max-w-md">
                  <h4 className="font-medium mb-2">Última Sincronización</h4>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>
                      <strong>Fecha:</strong>{' '}
                      {group.adSyncConfig.lastSyncAt 
                        ? new Date(group.adSyncConfig.lastSyncAt).toLocaleString('es-ES')
                        : 'Nunca'
                      }
                    </p>
                    <p>
                      <strong>Resultado:</strong> {group.adSyncConfig.lastSyncResult || 'N/A'}
                    </p>
                    {group.adSyncConfig.lastSyncAddedCount !== undefined && (
                      <p>
                        <strong>Agregados:</strong> {group.adSyncConfig.lastSyncAddedCount} |{' '}
                        <strong>Removidos:</strong> {group.adSyncConfig.lastSyncRemovedCount}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              {/* Resultado de sincronización reciente */}
              {adSyncResult && (
                <div className={`border rounded-lg p-4 max-w-md ${
                  adSyncResult.success ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
                }`}>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    {adSyncResult.success ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <X className="h-4 w-4 text-destructive" />
                    )}
                    Resultado de Sincronización
                  </h4>
                  <p className="text-sm">{adSyncResult.message}</p>
                  {adSyncResult.addedUsers.length > 0 && (
                    <p className="text-xs mt-2">
                      <strong>Agregados:</strong> {adSyncResult.addedUsers.join(', ')}
                    </p>
                  )}
                  {adSyncResult.removedUsers.length > 0 && (
                    <p className="text-xs mt-1">
                      <strong>Removidos:</strong> {adSyncResult.removedUsers.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Tab: Administradores (Solo SuperAdmin) */}
        {isSuperAdmin && (
          <TabsContent value="admins">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Administradores del Grupo</CardTitle>
                  <CardDescription>
                    Usuarios con rol Admin que pueden gestionar este grupo
                  </CardDescription>
                </div>
                <Button onClick={handleAddAdminClick}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Asignar Admin
                </Button>
              </CardHeader>
              <CardContent>
                {!groupAdmins || groupAdmins.admins.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay administradores asignados a este grupo</p>
                    <p className="text-sm">Solo los SuperAdmin pueden gestionar este grupo actualmente</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuario</TableHead>
                        <TableHead className="text-center">Editar Grupo</TableHead>
                        <TableHead className="text-center">Eliminar Grupo</TableHead>
                        <TableHead className="text-center">Gestionar Miembros</TableHead>
                        <TableHead className="text-center">Gestionar Permisos</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupAdmins.admins.map((admin) => (
                        <TableRow key={admin.userId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{admin.userDisplayName}</div>
                              <div className="text-xs text-muted-foreground">{admin.userEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {admin.canEdit ? (
                              <Check className="h-4 w-4 mx-auto text-success" />
                            ) : (
                              <X className="h-4 w-4 mx-auto text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {admin.canDelete ? (
                              <Check className="h-4 w-4 mx-auto text-success" />
                            ) : (
                              <X className="h-4 w-4 mx-auto text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {admin.canManageMembers ? (
                              <Check className="h-4 w-4 mx-auto text-success" />
                            ) : (
                              <X className="h-4 w-4 mx-auto text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {admin.canManagePermissions ? (
                              <Check className="h-4 w-4 mx-auto text-success" />
                            ) : (
                              <X className="h-4 w-4 mx-auto text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setAdminToRemove(admin.userId);
                                setShowRemoveAdminDialog(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                
                <div className="mt-4 p-3 bg-muted/50 rounded-md">
                  <p className="text-sm text-muted-foreground">
                    <strong>Nota:</strong> Los administradores asignados aquí podrán gestionar este grupo según los permisos otorgados.
                    SuperAdmin siempre puede gestionar todos los grupos.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Dialog: Agregar Miembros */}
      <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Agregar Miembros al Grupo</DialogTitle>
            <DialogDescription>
              Selecciona los usuarios que deseas agregar a {group.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuarios..."
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            {loadingUsers ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {filteredAvailableUsers.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    {userSearchTerm ? 'No se encontraron usuarios' : 'No hay usuarios disponibles'}
                  </div>
                ) : (
                  filteredAvailableUsers.map((user) => (
                    <div 
                      key={user.userId}
                      className="flex items-center space-x-3 p-3 hover:bg-accent border-b last:border-0"
                    >
                      <Checkbox
                        checked={selectedUsers.has(user.userId)}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedUsers);
                          if (checked) {
                            newSelected.add(user.userId);
                          } else {
                            newSelected.delete(user.userId);
                          }
                          setSelectedUsers(newSelected);
                        }}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{user.displayName}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {user.domainUser}
                        </div>
                      </div>
                      <Badge variant="outline">{user.role || 'Reader'}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {selectedUsers.size > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedUsers.size} usuario(s) seleccionado(s)
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowAddMemberDialog(false);
                setSelectedUsers(new Set());
                setUserSearchTerm('');
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleAddMembers}
              disabled={addingMembers || selectedUsers.size === 0}
            >
              {addingMembers ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Agregar {selectedUsers.size > 0 ? `(${selectedUsers.size})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar eliminar miembro */}
      <AlertDialog open={showRemoveMemberDialog} onOpenChange={setShowRemoveMemberDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Remover miembro?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas remover a <strong>{memberToRemove?.displayName}</strong> del grupo?
              El usuario perderá los permisos otorgados por este grupo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToRemove(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: Agregar Administradores */}
      <Dialog open={showAddAdminDialog} onOpenChange={setShowAddAdminDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Asignar Administradores al Grupo</DialogTitle>
            <DialogDescription>
              Selecciona los usuarios con rol Admin que podrán gestionar este grupo
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {loadingAdmins ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {availableAdmins.filter(a => !a.isAlreadyAssigned).length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No hay administradores disponibles para asignar
                  </div>
                ) : (
                  availableAdmins.filter(a => !a.isAlreadyAssigned).map((admin) => (
                    <div 
                      key={admin.userId}
                      className="flex items-center space-x-3 p-3 hover:bg-accent border-b last:border-0"
                    >
                      <Checkbox
                        checked={selectedAdmins.has(admin.userId)}
                        onCheckedChange={(checked) => {
                          const newSelected = new Set(selectedAdmins);
                          if (checked) {
                            newSelected.add(admin.userId);
                          } else {
                            newSelected.delete(admin.userId);
                          }
                          setSelectedAdmins(newSelected);
                        }}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{admin.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          {admin.email}
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-muted text-foreground border-border/50">
                        <Shield className="h-3 w-3 mr-1" />
                        Admin
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            )}
            
            {selectedAdmins.size > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedAdmins.size} administrador(es) seleccionado(s)
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowAddAdminDialog(false);
                setSelectedAdmins(new Set());
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleAddAdmins}
              disabled={addingAdmins || selectedAdmins.size === 0}
            >
              {addingAdmins ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Asignar {selectedAdmins.size > 0 ? `(${selectedAdmins.size})` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar remover administrador */}
      <AlertDialog open={showRemoveAdminDialog} onOpenChange={setShowRemoveAdminDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Remover administrador?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas remover este administrador del grupo?
              El usuario ya no podrá gestionar este grupo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAdminToRemove(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveAdmin}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

