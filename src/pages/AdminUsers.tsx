import { useState, useEffect, useRef } from 'react';
import { Users, Plus, Pencil, Trash2, UserPlus, Search, Loader2, Shield, ShieldCheck, Eye, Lock, Upload, RefreshCw, Mail, CheckCircle2, XCircle, AlertTriangle, ListChecks, RefreshCcw, Trash, Clock } from 'lucide-react';
import { Capabilities } from '@/lib/capabilities';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { authApi, groupsApi, adminRolesApi, UserDto, CreateUserRequest, UpdateUserRequest, ActiveDirectoryUserDto, AdminRoleSimpleDto, EmailSearchResult, DistributionListSearchResponse, DistributionListMember, UserImportSyncDto } from '@/services/api';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { Checkbox } from '@/components/ui/checkbox';
import { UserAvatar } from '@/components/UserAvatar';
import type { UserWithGroups, UserGroupMembership } from '@/types';

// Tipo extendido para usuarios con grupos (hereda profilePhotoUrl de UserDto)
interface UserDtoWithGroups extends UserDto {
  groups?: UserGroupMembership[];
}

export default function AdminUsers() {
  const { user: currentUser, isSuperAdmin, isReader, canCreateUsers, canDeleteUsers, assignableRoles, canAssignRole, hasCapability } = useAuth();
  
  // Capacidades específicas
  const canEditUsers = hasCapability(Capabilities.UsersEdit);
  const canImportFromAD = hasCapability(Capabilities.UsersImportFromAD);
  const canAssignRoles = hasCapability(Capabilities.UsersAssignRoles);
  const [users, setUsers] = useState<UserDtoWithGroups[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserDto | null>(null);
  
  // Available roles from API
  const [availableRoles, setAvailableRoles] = useState<AdminRoleSimpleDto[]>([]);
  
  // Unified Import Dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [activeImportTab, setActiveImportTab] = useState('ad-group');
  
  // AD Import states
  const [adGroupName, setAdGroupName] = useState('GSCORP\\SQL_admins');
  const [adGroupMembers, setAdGroupMembers] = useState<ActiveDirectoryUserDto[]>([]);
  const [selectedAdUsers, setSelectedAdUsers] = useState<Set<string>>(new Set());
  const [searchingAdGroup, setSearchingAdGroup] = useState(false);
  const [importingUsers, setImportingUsers] = useState(false);
  const [importRoleId, setImportRoleId] = useState<number | undefined>(undefined);
  
  // Email Import states
  const [emailInput, setEmailInput] = useState('');
  const [emailSearchResults, setEmailSearchResults] = useState<EmailSearchResult[]>([]);
  const [selectedEmailUsers, setSelectedEmailUsers] = useState<Set<string>>(new Set());
  const [searchingByEmail, setSearchingByEmail] = useState(false);
  const [importingByEmail, setImportingByEmail] = useState(false);
  const [emailImportRoleId, setEmailImportRoleId] = useState<number | undefined>(undefined);

  // Distribution List Import states
  const [dlEmail, setDlEmail] = useState('');
  const [dlSearchResult, setDlSearchResult] = useState<DistributionListSearchResponse | null>(null);
  const [selectedDlUsers, setSelectedDlUsers] = useState<Set<string>>(new Set());
  const [searchingDl, setSearchingDl] = useState(false);
  const [importingDl, setImportingDl] = useState(false);
  const [dlImportRoleId, setDlImportRoleId] = useState<number | undefined>(undefined);
  const [enableDlSync, setEnableDlSync] = useState(false);
  const [dlSyncIntervalHours, setDlSyncIntervalHours] = useState(24);

  // Sync management states
  const [importSyncs, setImportSyncs] = useState<UserImportSyncDto[]>([]);
  const [executingSync, setExecutingSync] = useState<number | null>(null);
  
  // Photo upload states
  const [uploadingUserPhoto, setUploadingUserPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    domainUser: '',
    displayName: '',
    email: '',
    roleId: undefined as number | undefined,
    active: true
  });
  
  // Fetch available roles from API
  const fetchAvailableRoles = async () => {
    try {
      const roles = await adminRolesApi.getAssignableRoles();
      setAvailableRoles(roles);
      // Set default role to Reader or first available
      const readerRole = roles.find(r => r.name === 'Reader');
      if (readerRole && !formData.roleId) {
        setFormData(prev => ({ ...prev, roleId: readerRole.id }));
        setImportRoleId(readerRole.id);
        setEmailImportRoleId(readerRole.id);
        setDlImportRoleId(readerRole.id);
      } else if (roles.length > 0 && !formData.roleId) {
        setFormData(prev => ({ ...prev, roleId: roles[roles.length - 1].id }));
        setImportRoleId(roles[roles.length - 1].id);
        setEmailImportRoleId(roles[roles.length - 1].id);
        setDlImportRoleId(roles[roles.length - 1].id);
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
      // Fallback to assignableRoles from context
      setAvailableRoles(assignableRoles);
    }
  };

  const fetchImportSyncs = async () => {
    try {
      const syncs = await authApi.getUserImportSyncs();
      setImportSyncs(syncs);
    } catch (err) {
      console.error('Error fetching import syncs:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchAvailableRoles();
    fetchImportSyncs();
  }, []);

  const fetchUsers = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setIsRefreshing(true);
      // Obtener usuarios con sus datos completos (incluyendo foto de perfil)
      const allUsers = await authApi.getUsers();
      
      // Intentar obtener usuarios con sus grupos
      try {
        const usersWithGroups = await groupsApi.getUsersWithGroups();
        // Combinar la información de grupos con los datos completos de usuarios
        setUsers(usersWithGroups.map(u => {
          const fullUser = allUsers.find(au => au.id === u.id);
          return {
            id: u.id,
            domainUser: u.domainUser,
            displayName: u.displayName,
            email: u.email,
            role: u.role,
            roleId: fullUser?.roleId,
            roleColor: fullUser?.roleColor,
            roleIcon: fullUser?.roleIcon,
            active: u.active,
            createdAt: u.createdAt,
            groups: u.groups,
            profilePhotoUrl: fullUser?.profilePhotoUrl,
            hasProfilePhoto: fullUser?.hasProfilePhoto,
            profilePhotoSource: fullUser?.profilePhotoSource,
            lastLoginAt: fullUser?.lastLoginAt,
          };
        }));
      } catch {
        // Fallback a endpoint original si el nuevo falla
        setUsers(allUsers);
      }
    } catch (err: any) {
      toast.error('Error al cargar usuarios: ' + err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Verificar si el usuario actual puede editar a otro usuario
  const canEditUser = (targetUser: UserDto): boolean => {
    // Reader no puede editar
    if (isReader) return false;
    
    // SuperAdmin puede editar a todos
    if (isSuperAdmin) return true;
    
    // Admin no puede editar SuperAdmins
    if (targetUser.role === 'SuperAdmin') return false;
    
    return true;
  };

  // Verificar si el usuario actual puede eliminar a otro usuario
  const canDeleteUserLocal = (targetUser: UserDto): boolean => {
    // Solo SuperAdmin puede eliminar
    if (!canDeleteUsers) return false;
    
    // No puede eliminarse a sí mismo
    if (currentUser?.domainUser === targetUser.domainUser) {
      return false;
    }
    return true;
  };

  const handleCreateUser = async () => {
    if (!formData.domainUser || !formData.displayName) {
      toast.error('El usuario de dominio y nombre para mostrar son obligatorios');
      return;
    }

    if (!formData.roleId) {
      toast.error('Debes seleccionar un rol');
      return;
    }

    try {
      const request: CreateUserRequest = {
        domainUser: formData.domainUser,
        displayName: formData.displayName,
        email: formData.email || undefined,
        roleId: formData.roleId
      };

      await authApi.createUser(request);
      toast.success('Usuario agregado exitosamente. Recuerda agregarlo a un grupo para darle permisos de vistas.');
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
        email: formData.email || undefined,
        roleId: formData.roleId,
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

    // Verificar permisos
    if (!canDeleteUserLocal(selectedUser)) {
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
    setSelectedUser(user);
    setFormData({
      domainUser: user.domainUser,
      displayName: user.displayName,
      email: user.email || '',
      roleId: user.roleId || availableRoles.find(r => r.name === user.role)?.id,
      active: user.active
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (user: UserDto) => {
    // Verificar permisos antes de abrir el diálogo
    if (!canDeleteUserLocal(user)) {
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

    if (!importRoleId) {
      toast.error('Selecciona un rol para los usuarios importados');
      return;
    }

    // Get role name from roleId for the API (maintains backwards compatibility)
    const selectedRole = availableRoles.find(r => r.id === importRoleId);
    const roleName = selectedRole?.name || 'Reader';

    setImportingUsers(true);
    try {
      const response = await authApi.importFromAdGroup({
        groupName: adGroupName,
        selectedUsernames: Array.from(selectedAdUsers),
        defaultRole: roleName
      });

      toast.success(response.message + ' Recuerda agregarlos a un grupo para darles permisos de vistas.');
      
      if (response.errors.length > 0) {
        console.error('Errores durante la importación:', response.errors);
      }

      // Recargar la lista de usuarios
      await fetchUsers();
      
      // Resetear pestaña AD
      setAdGroupMembers([]);
      setSelectedAdUsers(new Set());
      setAdGroupName('GSCORP\\SQL_admins');
      // Reset to Reader role
      const readerRole = availableRoles.find(r => r.name === 'Reader');
      setImportRoleId(readerRole?.id || availableRoles[availableRoles.length - 1]?.id);
    } catch (error: any) {
      toast.error(error.message || 'Error al importar usuarios');
    } finally {
      setImportingUsers(false);
    }
  };

  // Funciones para importación por email
  const handleSearchByEmail = async () => {
    const emails = emailInput
      .split(/[\n,;]+/)
      .map(e => e.trim())
      .filter(e => e.length > 0);

    if (emails.length === 0) {
      toast.error('Ingresa al menos un correo electrónico');
      return;
    }

    setSearchingByEmail(true);
    try {
      const response = await authApi.searchByEmail(emails);
      setEmailSearchResults(response.results);

      const importable = response.results.filter(r => r.found && !r.alreadyExists);
      setSelectedEmailUsers(new Set(importable.map(r => r.email)));

      if (response.foundCount === 0) {
        toast.error('No se encontró ningún usuario en Active Directory');
      } else {
        toast.success(`${response.foundCount} de ${response.results.length} correos encontrados en AD`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al buscar en Active Directory');
      setEmailSearchResults([]);
      setSelectedEmailUsers(new Set());
    } finally {
      setSearchingByEmail(false);
    }
  };

  const handleToggleEmailUser = (email: string) => {
    const newSelected = new Set(selectedEmailUsers);
    if (newSelected.has(email)) {
      newSelected.delete(email);
    } else {
      newSelected.add(email);
    }
    setSelectedEmailUsers(newSelected);
  };

  const handleImportByEmail = async () => {
    if (selectedEmailUsers.size === 0) {
      toast.error('Selecciona al menos un usuario para importar');
      return;
    }

    if (!emailImportRoleId) {
      toast.error('Selecciona un rol para los usuarios importados');
      return;
    }

    const selectedRole = availableRoles.find(r => r.id === emailImportRoleId);
    const roleName = selectedRole?.name || 'Reader';

    setImportingByEmail(true);
    try {
      const response = await authApi.importByEmail({
        emails: Array.from(selectedEmailUsers),
        roleId: emailImportRoleId,
        defaultRole: roleName,
      });

      toast.success(response.message + ' Recuerda agregarlos a un grupo para darles permisos de vistas.');

      if (response.errors.length > 0) {
        console.error('Errores durante la importación por email:', response.errors);
      }

      await fetchUsers();

      // Resetear pestaña email
      setEmailInput('');
      setEmailSearchResults([]);
      setSelectedEmailUsers(new Set());
      const readerRole = availableRoles.find(r => r.name === 'Reader');
      setEmailImportRoleId(readerRole?.id || availableRoles[availableRoles.length - 1]?.id);
    } catch (error: any) {
      toast.error(error.message || 'Error al importar usuarios');
    } finally {
      setImportingByEmail(false);
    }
  };

  // Funciones para importación desde listas de distribución
  const handleSearchDl = async () => {
    if (!dlEmail.trim()) {
      toast.error('Ingresa el correo de la lista de distribución');
      return;
    }

    setSearchingDl(true);
    try {
      const response = await authApi.searchDistributionList(dlEmail.trim());
      setDlSearchResult(response);

      const importable = response.members.filter((m: DistributionListMember) => !m.alreadyExists);
      setSelectedDlUsers(new Set(importable.map((m: DistributionListMember) => m.samAccountName)));

      if (response.memberCount === 0) {
        toast.error('La lista de distribución no tiene miembros');
      } else {
        toast.success(`Lista "${response.groupName}" encontrada con ${response.memberCount} miembros`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al buscar la lista de distribución');
      setDlSearchResult(null);
      setSelectedDlUsers(new Set());
    } finally {
      setSearchingDl(false);
    }
  };

  const handleToggleDlUser = (samAccountName: string) => {
    const newSelected = new Set(selectedDlUsers);
    if (newSelected.has(samAccountName)) {
      newSelected.delete(samAccountName);
    } else {
      newSelected.add(samAccountName);
    }
    setSelectedDlUsers(newSelected);
  };

  const handleSelectAllDlUsers = (checked: boolean) => {
    if (!dlSearchResult) return;
    if (checked) {
      const importable = dlSearchResult.members.filter((m: DistributionListMember) => !m.alreadyExists);
      setSelectedDlUsers(new Set(importable.map((m: DistributionListMember) => m.samAccountName)));
    } else {
      setSelectedDlUsers(new Set());
    }
  };

  const handleImportFromDl = async () => {
    if (selectedDlUsers.size === 0) {
      toast.error('Selecciona al menos un usuario para importar');
      return;
    }

    if (!dlImportRoleId) {
      toast.error('Selecciona un rol para los usuarios importados');
      return;
    }

    const selectedRole = availableRoles.find(r => r.id === dlImportRoleId);
    const roleName = selectedRole?.name || 'Reader';

    setImportingDl(true);
    try {
      const response = await authApi.importFromDistributionList({
        dlEmail: dlEmail.trim(),
        selectedSamAccountNames: Array.from(selectedDlUsers),
        roleId: dlImportRoleId,
        defaultRole: roleName,
        enableSync: enableDlSync,
        syncIntervalHours: dlSyncIntervalHours,
      });

      toast.success(response.message + ' Recuerda agregarlos a un grupo para darles permisos de vistas.');

      if (response.errors.length > 0) {
        console.error('Errores durante la importación desde DL:', response.errors);
      }

      await fetchUsers();
      if (response.syncEnabled) {
        await fetchImportSyncs();
      }

      // Resetear pestaña DL
      setDlEmail('');
      setDlSearchResult(null);
      setSelectedDlUsers(new Set());
      setEnableDlSync(false);
      setDlSyncIntervalHours(24);
    } catch (error: any) {
      toast.error(error.message || 'Error al importar usuarios');
    } finally {
      setImportingDl(false);
    }
  };

  // Funciones de gestión de syncs
  const handleToggleSync = async (syncId: number, currentAutoSync: boolean) => {
    try {
      const sync = importSyncs.find(s => s.id === syncId);
      if (!sync) return;

      await authApi.updateUserImportSync(syncId, {
        autoSync: !currentAutoSync,
        syncIntervalHours: sync.syncIntervalHours,
        defaultRoleId: sync.defaultRoleId ?? undefined,
      });

      toast.success(!currentAutoSync ? 'Sincronización automática activada' : 'Sincronización automática desactivada');
      await fetchImportSyncs();
    } catch (error: any) {
      toast.error(error.message || 'Error al actualizar sincronización');
    }
  };

  const handleExecuteSync = async (syncId: number) => {
    setExecutingSync(syncId);
    try {
      const result = await authApi.executeUserImportSync(syncId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      await fetchUsers();
      await fetchImportSyncs();
    } catch (error: any) {
      toast.error(error.message || 'Error al ejecutar sincronización');
    } finally {
      setExecutingSync(null);
    }
  };

  const handleDeleteSync = async (syncId: number) => {
    try {
      await authApi.deleteUserImportSync(syncId);
      toast.success('Sincronización eliminada');
      await fetchImportSyncs();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar sincronización');
    }
  };

  const resetImportDialog = () => {
    setAdGroupMembers([]);
    setSelectedAdUsers(new Set());
    setAdGroupName('GSCORP\\SQL_admins');
    setEmailInput('');
    setEmailSearchResults([]);
    setSelectedEmailUsers(new Set());
    setDlEmail('');
    setDlSearchResult(null);
    setSelectedDlUsers(new Set());
    setEnableDlSync(false);
    setDlSyncIntervalHours(24);
  };

  const resetForm = () => {
    const readerRole = availableRoles.find(r => r.name === 'Reader');
    setFormData({
      domainUser: '',
      displayName: '',
      email: '',
      roleId: readerRole?.id || availableRoles[availableRoles.length - 1]?.id,
      active: true
    });
  };

  // Subir foto de perfil para un usuario
  const handleUploadUserPhoto = async (userId: string, file: File) => {
    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Tipo de archivo no permitido. Use JPG, PNG, GIF o WebP.');
      return;
    }

    // Validar tamaño (máximo 5MB para mejor calidad)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo es demasiado grande. Máximo 5MB.');
      return;
    }

    setUploadingUserPhoto(true);
    try {
      const response = await authApi.uploadUserPhoto(userId, file);
      
      if (response.success) {
        toast.success('Foto de perfil actualizada');
        // Recargar usuarios para ver la foto actualizada
        await fetchUsers();
      } else {
        toast.error(response.message || 'Error al subir la foto');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al subir foto de perfil');
    } finally {
      setUploadingUserPhoto(false);
      // Limpiar el input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Eliminar foto de perfil de un usuario
  const handleDeleteUserPhoto = async (userId: string) => {
    try {
      await authApi.deleteUserPhoto(userId);
      toast.success('Foto de perfil eliminada');
      // Recargar usuarios
      await fetchUsers();
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar foto de perfil');
    }
  };

  const activeUsers = users.filter(u => u.active).length;
  const usersWithGroups = users.filter(u => u.groups && u.groups.length > 0).length;
  const usersWithoutGroups = users.filter(u => !u.groups || u.groups.length === 0).length;
  const superAdmins = users.filter(u => u.role === 'SuperAdmin').length;
  const admins = users.filter(u => u.role === 'Admin').length;
  const readers = users.filter(u => u.role === 'Reader').length;
  
  // Helper para formatear tiempo relativo
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
    return date.toLocaleDateString('es-ES');
  };

  // Helper para obtener el badge del rol
  const getRoleBadge = (user: UserDtoWithGroups) => {
    const IconComponent = user.role === 'SuperAdmin' ? ShieldCheck : user.role === 'Admin' ? Shield : Eye;
    const bgColor = user.roleColor || (user.role === 'SuperAdmin' ? '#8b5cf6' : user.role === 'Admin' ? '#3b82f6' : '#6b7280');
    
    return (
      <Badge 
        variant="default" 
        style={{ backgroundColor: bgColor }}
        className="hover:opacity-90"
      >
        <IconComponent className="h-3 w-3 mr-1" />
        {user.role}
      </Badge>
    );
  };

  // Helper para obtener icono del rol
  const getRoleIcon = (roleName: string) => {
    if (roleName === 'SuperAdmin') return ShieldCheck;
    if (roleName === 'Admin') return Shield;
    return Eye;
  };

  const { sortedData, requestSort, getSortIndicator } = useTableSort(users);

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10" />
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>

        {/* KPIs skeleton */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            Administración de Usuarios
          </h1>
          <p className="text-muted-foreground">
            Gestión de usuarios del sistema. Los roles definen capacidades administrativas, los grupos definen permisos de vistas.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => fetchUsers(false)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {canImportFromAD && (
            <Button onClick={() => setShowImportDialog(true)} variant="outline" className="w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4" />
              Importar Usuarios
            </Button>
          )}
          {canCreateUsers && (
            <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Agregar Usuario
            </Button>
          )}
          {!canCreateUsers && !canImportFromAD && (
            <Badge variant="outline" className="py-2 px-3">
              <Lock className="h-3 w-3 mr-1" />
              Solo lectura
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard
          title="Total"
          value={users.length}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="SuperAdmins"
          value={superAdmins}
          icon={ShieldCheck}
          variant="default"
        />
        <KPICard
          title="Admins"
          value={admins}
          icon={Shield}
          variant="default"
        />
        <KPICard
          title="Readers"
          value={readers}
          icon={Eye}
          variant="default"
        />
        <KPICard
          title="Con Grupos"
          value={usersWithGroups}
          icon={Users}
          variant="success"
        />
        <KPICard
          title="Sin Grupos"
          value={usersWithoutGroups}
          icon={Users}
          variant={usersWithoutGroups > 0 ? "warning" : "default"}
        />
      </div>

      {/* Panel de Sincronizaciones Activas */}
      {canImportFromAD && importSyncs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              Sincronizaciones de Listas de Distribución ({importSyncs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {importSyncs.map((sync) => (
                <div key={sync.id} className="flex items-center justify-between p-3 border rounded-md bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{sync.sourceDisplayName || sync.adGroupName}</div>
                    <div className="text-xs text-muted-foreground">{sync.sourceIdentifier}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{sync.managedUsersCount} usuarios gestionados</span>
                      {sync.lastSyncAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Último sync: {new Date(sync.lastSyncAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {sync.lastSyncResult && (
                        <span className={sync.lastSyncResult === 'Success' ? 'text-green-600' : 'text-red-600'}>
                          {sync.lastSyncResult === 'Success' ? 'OK' : sync.lastSyncResult}
                        </span>
                      )}
                      {sync.lastSyncAddedCount != null && sync.lastSyncAddedCount > 0 && (
                        <span className="text-green-600">+{sync.lastSyncAddedCount}</span>
                      )}
                      {sync.lastSyncRemovedCount != null && sync.lastSyncRemovedCount > 0 && (
                        <span className="text-red-600">-{sync.lastSyncRemovedCount}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Auto</span>
                      <Switch
                        checked={sync.autoSync}
                        onCheckedChange={() => handleToggleSync(sync.id, sync.autoSync)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExecuteSync(sync.id)}
                      disabled={executingSync === sync.id}
                    >
                      {executingSync === sync.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteSync(sync.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
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
                <TableHead className="text-xs">
                  Grupos
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
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('lastLoginAt')}
                >
                  Última Conexión {getSortIndicator('lastLoginAt')}
                </TableHead>
                <TableHead className="text-xs text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        photoUrl={user.profilePhotoUrl}
                        displayName={user.displayName}
                        domainUser={user.domainUser}
                        size="sm"
                      />
                      <span className="font-mono text-xs">{user.domainUser}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-xs py-2">{user.displayName}</TableCell>
                  <TableCell className="py-2">
                    {getRoleBadge(user)}
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {user.groups && user.groups.length > 0 ? (
                        user.groups.slice(0, 3).map((group) => (
                          <Badge 
                            key={group.groupId} 
                            variant="secondary"
                            className="text-xs"
                            style={{ 
                              borderColor: group.groupColor || '#6b7280',
                              borderWidth: '1px'
                            }}
                          >
                            {group.groupName}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                      {user.groups && user.groups.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{user.groups.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusBadge status={user.active ? 'success' : 'critical'}>
                      {user.active ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="font-mono text-xs py-2">
                    {new Date(user.createdAt).toLocaleDateString('es-ES')}
                  </TableCell>
                  <TableCell className="font-mono text-xs py-2">
                    {user.lastLoginAt ? (
                      <span title={new Date(user.lastLoginAt).toLocaleString('es-ES')}>
                        {formatRelativeTime(user.lastLoginAt)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Nunca</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    {!isReader && (
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
                        {canDeleteUsers && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(user)}
                            disabled={!canDeleteUserLocal(user) || user.domainUser === 'TB03260'}
                            title={
                              user.domainUser === 'TB03260' ? 'No se puede eliminar el SuperAdmin principal' :
                              !canDeleteUserLocal(user) ? 'No tienes permisos para eliminar este usuario' : ''
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
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
              <Label htmlFor="role">Rol (Capacidad Administrativa)</Label>
              <Select
                value={formData.roleId?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, roleId: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => {
                    const IconComponent = getRoleIcon(role.name);
                    return (
                      <SelectItem key={role.id} value={role.id.toString()}>
                        <div className="flex items-center gap-2">
                          <IconComponent className="h-4 w-4" style={{ color: role.color }} />
                          {role.name}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                El rol define las capacidades administrativas del usuario.
              </p>
            </div>
            <div className="bg-muted/50 p-3 rounded-md border border-border">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Nota:</strong> El rol define qué puede administrar el usuario. Para definir qué vistas puede ver, agrégalo a un grupo después de crearlo.
              </p>
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
            {/* Avatar y sincronización de foto */}
            <div className="flex items-center gap-4 p-3 bg-accent/30 rounded-lg">
              <UserAvatar
                photoUrl={selectedUser?.profilePhotoUrl}
                displayName={selectedUser?.displayName}
                domainUser={selectedUser?.domainUser}
                size="lg"
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{selectedUser?.displayName}</p>
                <p className="text-xs text-muted-foreground">{selectedUser?.domainUser}</p>
                <div className="flex gap-2 mt-2">
                  {/* Input oculto para seleccionar archivo */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && selectedUser) {
                        handleUploadUserPhoto(selectedUser.id, file);
                      }
                    }}
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingUserPhoto}
                  >
                    {uploadingUserPhoto ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-3 w-3" />
                        Subir Foto
                      </>
                    )}
                  </Button>
                  {selectedUser?.hasProfilePhoto && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectedUser && handleDeleteUserPhoto(selectedUser.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-2 h-3 w-3" />
                      Eliminar Foto
                    </Button>
                  )}
                </div>
              </div>
            </div>

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
              <Label htmlFor="edit-role">Rol (Capacidad Administrativa)</Label>
              <Select
                value={formData.roleId?.toString() || ''}
                onValueChange={(value) => setFormData({ ...formData, roleId: parseInt(value) })}
                disabled={selectedUser?.role === 'SuperAdmin' && !isSuperAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar rol" />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles.map((role) => {
                    const IconComponent = getRoleIcon(role.name);
                    return (
                      <SelectItem key={role.id} value={role.id.toString()}>
                        <div className="flex items-center gap-2">
                          <IconComponent className="h-4 w-4" style={{ color: role.color }} />
                          {role.name}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-active"
                checked={formData.active}
                onCheckedChange={(checked) => setFormData({ ...formData, active: checked === true })}
              />
              <Label htmlFor="edit-active" className="cursor-pointer">Usuario activo</Label>
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

      {/* Dialog Unificado de Importación */}
      <Dialog open={showImportDialog} onOpenChange={(open) => {
        setShowImportDialog(open);
        if (!open) resetImportDialog();
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar Usuarios</DialogTitle>
            <DialogDescription>
              Importa usuarios desde Active Directory por grupo, correos individuales o lista de distribución.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeImportTab} onValueChange={setActiveImportTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ad-group">
                <UserPlus className="mr-2 h-4 w-4" />
                Grupo AD
              </TabsTrigger>
              <TabsTrigger value="emails">
                <Mail className="mr-2 h-4 w-4" />
                Correos
              </TabsTrigger>
              <TabsTrigger value="distribution-list">
                <ListChecks className="mr-2 h-4 w-4" />
                Lista de Dist.
              </TabsTrigger>
            </TabsList>

            {/* ============ TAB: GRUPO AD ============ */}
            <TabsContent value="ad-group" className="space-y-4 mt-4">
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
                  <Button onClick={handleSearchAdGroup} disabled={searchingAdGroup || !adGroupName.trim()}>
                    {searchingAdGroup ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Buscando...</> : <><Search className="mr-2 h-4 w-4" />Buscar</>}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ingresa el nombre del grupo con o sin el dominio (ej: GSCORP\SQL_admins o SQL_admins)
                </p>
              </div>

              {adGroupMembers.length > 0 && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label>Usuarios encontrados ({adGroupMembers.length})</Label>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="selectAllAd" checked={selectedAdUsers.size === adGroupMembers.length} onCheckedChange={handleSelectAllAdUsers} />
                        <label htmlFor="selectAllAd" className="text-sm font-medium leading-none">Seleccionar todos</label>
                      </div>
                    </div>
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                      <div className="p-2 space-y-2">
                        {adGroupMembers.map((member) => (
                          <div key={member.samAccountName} className="flex items-start space-x-2 p-2 rounded hover:bg-accent">
                            <Checkbox id={`ad-${member.samAccountName}`} checked={selectedAdUsers.has(member.samAccountName)} onCheckedChange={() => handleToggleAdUser(member.samAccountName)} />
                            <label htmlFor={`ad-${member.samAccountName}`} className="flex-1 cursor-pointer">
                              <div className="text-sm font-medium">{member.displayName}</div>
                              <div className="text-xs text-muted-foreground font-mono">{member.samAccountName}</div>
                              {member.email && <div className="text-xs text-muted-foreground">{member.email}</div>}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Rol a asignar</Label>
                    <Select value={importRoleId?.toString() || ''} onValueChange={(value) => setImportRoleId(parseInt(value))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((role) => {
                          const IconComponent = getRoleIcon(role.name);
                          return (
                            <SelectItem key={role.id} value={role.id.toString()}>
                              <div className="flex items-center gap-2"><IconComponent className="h-4 w-4" style={{ color: role.color }} />{role.name}</div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="bg-accent/50 p-3 rounded-md">
                    <p className="text-sm">
                      <strong>{selectedAdUsers.size}</strong> de <strong>{adGroupMembers.length}</strong> usuarios seleccionados para importar con rol <strong>{availableRoles.find(r => r.id === importRoleId)?.name || 'Reader'}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Los usuarios ya existentes serán omitidos.</p>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleImportFromAdGroup} disabled={importingUsers || selectedAdUsers.size === 0}>
                      {importingUsers ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando...</> : <><UserPlus className="mr-2 h-4 w-4" />Importar {selectedAdUsers.size} Usuario{selectedAdUsers.size !== 1 ? 's' : ''}</>}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            {/* ============ TAB: CORREOS ============ */}
            <TabsContent value="emails" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="emailInput">Correos electrónicos</Label>
                <Textarea
                  id="emailInput"
                  className="min-h-[120px]"
                  placeholder={"juan.perez@supervielle.com.ar\nmaria.garcia@supervielle.com.ar\npedro.lopez@supervielle.com.ar"}
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  disabled={searchingByEmail}
                />
                <p className="text-xs text-muted-foreground">Un correo por línea, o separados por coma o punto y coma.</p>
              </div>

              <Button onClick={handleSearchByEmail} disabled={searchingByEmail || !emailInput.trim()} className="w-full">
                {searchingByEmail ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Buscando en Active Directory...</> : <><Search className="mr-2 h-4 w-4" />Buscar en Active Directory</>}
              </Button>

              {emailSearchResults.length > 0 && (
                <>
                  <div className="space-y-2">
                    <Label>Resultados ({emailSearchResults.filter(r => r.found && !r.alreadyExists).length} importables de {emailSearchResults.length})</Label>
                    <div className="border rounded-md max-h-60 overflow-y-auto">
                      <div className="p-2 space-y-1">
                        {emailSearchResults.map((result) => (
                          <div key={result.email} className={`flex items-center space-x-3 p-2 rounded ${result.found && !result.alreadyExists ? 'hover:bg-accent cursor-pointer' : 'opacity-60'}`}
                            onClick={() => { if (result.found && !result.alreadyExists) handleToggleEmailUser(result.email); }}>
                            {result.found && !result.alreadyExists && <Checkbox checked={selectedEmailUsers.has(result.email)} onCheckedChange={() => handleToggleEmailUser(result.email)} />}
                            {result.found && !result.alreadyExists && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                            {result.found && result.alreadyExists && <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                            {!result.found && <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                            <div className="flex-1 min-w-0">
                              {result.found && result.adUser ? (
                                <>
                                  <div className="text-sm font-medium truncate">{result.adUser.displayName}</div>
                                  <div className="text-xs text-muted-foreground"><span className="font-mono">{result.adUser.samAccountName}</span><span className="mx-1">·</span><span>{result.email}</span></div>
                                </>
                              ) : (
                                <div className="text-sm truncate">{result.email}</div>
                              )}
                              {result.alreadyExists && <div className="text-xs text-yellow-600 dark:text-yellow-400">Ya existe en la aplicación</div>}
                              {!result.found && <div className="text-xs text-red-600 dark:text-red-400">No encontrado en Active Directory</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {emailSearchResults.some(r => r.found && !r.alreadyExists) && (
                    <>
                      <div className="space-y-2">
                        <Label>Rol a asignar</Label>
                        <Select value={emailImportRoleId?.toString() || ''} onValueChange={(value) => setEmailImportRoleId(parseInt(value))}>
                          <SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                          <SelectContent>
                            {availableRoles.map((role) => {
                              const IconComponent = getRoleIcon(role.name);
                              return (
                                <SelectItem key={role.id} value={role.id.toString()}>
                                  <div className="flex items-center gap-2"><IconComponent className="h-4 w-4" style={{ color: role.color }} />{role.name}</div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="bg-accent/50 p-3 rounded-md">
                        <p className="text-sm"><strong>{selectedEmailUsers.size}</strong> usuario{selectedEmailUsers.size !== 1 ? 's' : ''} seleccionado{selectedEmailUsers.size !== 1 ? 's' : ''} para importar con rol <strong>{availableRoles.find(r => r.id === emailImportRoleId)?.name || 'Reader'}</strong></p>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={handleImportByEmail} disabled={importingByEmail || selectedEmailUsers.size === 0}>
                          {importingByEmail ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando...</> : <><Mail className="mr-2 h-4 w-4" />Importar {selectedEmailUsers.size} Usuario{selectedEmailUsers.size !== 1 ? 's' : ''}</>}
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </TabsContent>

            {/* ============ TAB: LISTA DE DISTRIBUCIÓN ============ */}
            <TabsContent value="distribution-list" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="dlEmail">Correo de la lista de distribución</Label>
                <div className="flex gap-2">
                  <Input
                    id="dlEmail"
                    placeholder="equipo-dba@supervielle.com.ar"
                    value={dlEmail}
                    onChange={(e) => setDlEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchDl()}
                    disabled={searchingDl}
                    className="flex-1"
                  />
                  <Button onClick={handleSearchDl} disabled={searchingDl || !dlEmail.trim()}>
                    {searchingDl ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Buscando...</> : <><Search className="mr-2 h-4 w-4" />Buscar</>}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ingresa el correo electrónico de la lista de distribución de AD.
                </p>
              </div>

              {dlSearchResult && (
                <>
                  <div className="bg-accent/50 p-3 rounded-md">
                    <p className="text-sm font-medium">{dlSearchResult.groupName}</p>
                    <p className="text-xs text-muted-foreground">{dlSearchResult.email} · {dlSearchResult.memberCount} miembros</p>
                    {dlSearchResult.hasExistingSync && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Esta lista ya tiene sincronización configurada.</p>
                    )}
                  </div>

                  {dlSearchResult.members.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Miembros ({dlSearchResult.members.filter((m: DistributionListMember) => !m.alreadyExists).length} importables de {dlSearchResult.members.length})</Label>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="selectAllDl"
                            checked={selectedDlUsers.size === dlSearchResult.members.filter((m: DistributionListMember) => !m.alreadyExists).length && selectedDlUsers.size > 0}
                            onCheckedChange={handleSelectAllDlUsers}
                          />
                          <label htmlFor="selectAllDl" className="text-sm font-medium leading-none">Seleccionar importables</label>
                        </div>
                      </div>
                      <div className="border rounded-md max-h-60 overflow-y-auto">
                        <div className="p-2 space-y-1">
                          {dlSearchResult.members.map((member: DistributionListMember) => (
                            <div key={member.samAccountName}
                              className={`flex items-center space-x-3 p-2 rounded ${!member.alreadyExists ? 'hover:bg-accent cursor-pointer' : 'opacity-60'}`}
                              onClick={() => { if (!member.alreadyExists) handleToggleDlUser(member.samAccountName); }}>
                              {!member.alreadyExists && <Checkbox checked={selectedDlUsers.has(member.samAccountName)} onCheckedChange={() => handleToggleDlUser(member.samAccountName)} />}
                              {!member.alreadyExists ? <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{member.displayName}</div>
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-mono">{member.samAccountName}</span>
                                  {member.email && <><span className="mx-1">·</span><span>{member.email}</span></>}
                                </div>
                                {member.alreadyExists && <div className="text-xs text-yellow-600 dark:text-yellow-400">Ya existe en la aplicación</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Rol a asignar</Label>
                    <Select value={dlImportRoleId?.toString() || ''} onValueChange={(value) => setDlImportRoleId(parseInt(value))}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger>
                      <SelectContent>
                        {availableRoles.map((role) => {
                          const IconComponent = getRoleIcon(role.name);
                          return (
                            <SelectItem key={role.id} value={role.id.toString()}>
                              <div className="flex items-center gap-2"><IconComponent className="h-4 w-4" style={{ color: role.color }} />{role.name}</div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {!dlSearchResult.hasExistingSync && (
                    <div className="space-y-3 p-4 border rounded-md bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">Mantener sincronizado</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">Sincronizar automáticamente con la lista de distribución</p>
                        </div>
                        <Switch checked={enableDlSync} onCheckedChange={setEnableDlSync} />
                      </div>

                      {enableDlSync && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs">Intervalo de sincronización</Label>
                            <Select value={dlSyncIntervalHours.toString()} onValueChange={(value) => setDlSyncIntervalHours(parseInt(value))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="6">Cada 6 horas</SelectItem>
                                <SelectItem value="12">Cada 12 horas</SelectItem>
                                <SelectItem value="24">Cada 24 horas</SelectItem>
                                <SelectItem value="48">Cada 48 horas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Los nuevos miembros de la lista serán importados automáticamente. Los miembros removidos serán desactivados solo si fueron importados exclusivamente desde esta lista.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button onClick={handleImportFromDl} disabled={importingDl || selectedDlUsers.size === 0}>
                      {importingDl ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importando...</>
                      ) : (
                        <><ListChecks className="mr-2 h-4 w-4" />{enableDlSync ? 'Importar y Sincronizar' : `Importar ${selectedDlUsers.size} Usuario${selectedDlUsers.size !== 1 ? 's' : ''}`}</>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); resetImportDialog(); }}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
