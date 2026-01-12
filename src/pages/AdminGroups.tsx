import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Plus, 
  Pencil, 
  Trash2, 
  Search, 
  Shield,
  RefreshCw,
  FolderSync,
  Lock
} from 'lucide-react';
import { Capabilities } from '@/lib/capabilities';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { toast } from 'sonner';
import { groupsApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { SecurityGroup, CreateGroupRequest, UpdateGroupRequest } from '@/types';

// Colores predefinidos para grupos
const GROUP_COLORS = [
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Púrpura', value: '#8b5cf6' },
  { name: 'Verde', value: '#10b981' },
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Naranja', value: '#f97316' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Índigo', value: '#6366f1' },
  { name: 'Cyan', value: '#06b6d4' },
];

// Iconos disponibles
const GROUP_ICONS = [
  'Users', 'Database', 'Code', 'TestTube', 'Shield', 'Server', 'Folder', 'Lock'
];

export default function AdminGroups() {
  const navigate = useNavigate();
  const { isReader, canCreateGroups, canManageGroup, isSuperAdmin, hasCapability } = useAuth();
  
  // Capacidades específicas
  const canEditGroups = hasCapability(Capabilities.GroupsEdit);
  const canDeleteGroups = hasCapability(Capabilities.GroupsDelete);
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<SecurityGroup | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<CreateGroupRequest>({
    name: '',
    description: '',
    color: '#3b82f6',
    icon: 'Users',
    isActive: true,
  });

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setIsRefreshing(true);
      const data = await groupsApi.getGroups();
      setGroups(data);
    } catch (err: any) {
      toast.error('Error al cargar grupos: ' + err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!formData.name.trim()) {
      toast.error('El nombre del grupo es requerido');
      return;
    }

    try {
      await groupsApi.createGroup(formData);
      toast.success('Grupo creado exitosamente');
      setShowCreateDialog(false);
      resetForm();
      fetchGroups();
    } catch (err: any) {
      toast.error('Error al crear grupo: ' + err.message);
    }
  };

  const handleUpdateGroup = async () => {
    if (!selectedGroup) return;

    if (!formData.name.trim()) {
      toast.error('El nombre del grupo es requerido');
      return;
    }

    try {
      const updateRequest: UpdateGroupRequest = {
        name: formData.name,
        description: formData.description,
        color: formData.color,
        icon: formData.icon,
        isActive: formData.isActive ?? true,
      };
      
      await groupsApi.updateGroup(selectedGroup.id, updateRequest);
      toast.success('Grupo actualizado exitosamente');
      setShowEditDialog(false);
      setSelectedGroup(null);
      resetForm();
      fetchGroups();
    } catch (err: any) {
      toast.error('Error al actualizar grupo: ' + err.message);
    }
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;

    try {
      await groupsApi.deleteGroup(selectedGroup.id);
      toast.success('Grupo eliminado exitosamente');
      setShowDeleteDialog(false);
      setSelectedGroup(null);
      fetchGroups();
    } catch (err: any) {
      toast.error('Error al eliminar grupo: ' + err.message);
    }
  };

  const openEditDialog = (group: SecurityGroup) => {
    setSelectedGroup(group);
    setFormData({
      name: group.name,
      description: group.description || '',
      color: group.color || '#3b82f6',
      icon: group.icon || 'Users',
      isActive: group.isActive,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (group: SecurityGroup) => {
    setSelectedGroup(group);
    setShowDeleteDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      color: '#3b82f6',
      icon: 'Users',
      isActive: true,
    });
  };

  const filteredGroups = groups.filter(group =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { sortedData, requestSort, getSortIndicator } = useTableSort(filteredGroups);

  const activeGroups = groups.filter(g => g.isActive).length;
  const totalMembers = groups.reduce((sum, g) => sum + g.memberCount, 0);
  const groupsWithADSync = groups.filter(g => g.hasADSync).length;

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-5 w-80" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* KPIs skeleton */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search skeleton */}
        <Skeleton className="h-10 w-64" />

        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            Grupos de Seguridad
          </h1>
          <p className="text-muted-foreground">
            Organiza usuarios por equipo y asigna permisos por grupo
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button 
            variant="outline" 
            onClick={() => fetchGroups(false)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {canCreateGroups && (
            <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Grupo
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Total Grupos"
          value={groups.length}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Grupos Activos"
          value={activeGroups}
          icon={Shield}
          variant="success"
        />
        <KPICard
          title="Total Miembros"
          value={totalMembers}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Con Sync AD"
          value={groupsWithADSync}
          icon={FolderSync}
          variant="default"
        />
      </div>

      {/* Búsqueda */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar grupos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listado de Grupos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('name')}
                >
                  Grupo {getSortIndicator('name')}
                </TableHead>
                <TableHead className="text-xs">Descripción</TableHead>
                <TableHead 
                  className="text-xs text-center cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('memberCount')}
                >
                  Miembros {getSortIndicator('memberCount')}
                </TableHead>
                <TableHead 
                  className="text-xs text-center cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('permissionCount')}
                >
                  Permisos {getSortIndicator('permissionCount')}
                </TableHead>
                <TableHead className="text-xs text-center">AD Sync</TableHead>
                <TableHead 
                  className="text-xs text-center cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('isActive')}
                >
                  Estado {getSortIndicator('isActive')}
                </TableHead>
                <TableHead className="text-xs text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((group) => (
                <TableRow 
                  key={group.id} 
                  className="cursor-pointer hover:bg-accent/50"
                  onClick={() => navigate(`/admin/groups/${group.id}`)}
                >
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: group.color || '#3b82f6' }}
                      />
                      <span className="font-medium text-sm">{group.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground py-2 max-w-xs truncate">
                    {group.description || '-'}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <Badge variant="outline">{group.memberCount}</Badge>
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <Badge variant="secondary">{group.permissionCount}</Badge>
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {group.hasADSync ? (
                      <Badge variant="soft-success">
                        <FolderSync className="h-3 w-3 mr-1" />
                        Vinculado
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <StatusBadge status={group.isActive ? 'success' : 'critical'}>
                      {group.isActive ? 'Activo' : 'Inactivo'}
                    </StatusBadge>
                  </TableCell>
                  <TableCell className="text-right py-2">
                    {!isReader && canManageGroup(group.id) && (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {canEditGroups && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(group)}
                            title="Editar grupo"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDeleteGroups && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(group)}
                            title="Eliminar grupo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {sortedData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No se encontraron grupos' : 'No hay grupos creados'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Crear Grupo */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Grupo</DialogTitle>
            <DialogDescription>
              Crea un grupo de seguridad para organizar usuarios y asignar permisos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Grupo *</Label>
              <Input
                id="name"
                placeholder="Ej: DBA Team, Desarrollo, QA"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                placeholder="Describe el propósito del grupo..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Color del Grupo</Label>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.color === color.value 
                        ? 'border-foreground scale-110' 
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked === true })}
              />
              <Label htmlFor="isActive" className="cursor-pointer">Grupo activo</Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setShowCreateDialog(false); resetForm(); }}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateGroup} className="w-full sm:w-auto">
              Crear Grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Grupo */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Grupo</DialogTitle>
            <DialogDescription>
              Modifica la información del grupo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre del Grupo *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Color del Grupo</Label>
              <div className="flex flex-wrap gap-2">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.color === color.value 
                        ? 'border-foreground scale-110' 
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData({ ...formData, color: color.value })}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked === true })}
              />
              <Label htmlFor="edit-isActive" className="cursor-pointer">Grupo activo</Label>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setShowEditDialog(false); setSelectedGroup(null); }}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button onClick={handleUpdateGroup} className="w-full sm:w-auto">
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Eliminar Grupo */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar el grupo <strong>{selectedGroup?.name}</strong>.
              Esta acción removerá a todos los miembros del grupo y sus permisos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedGroup(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteGroup} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar Grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

