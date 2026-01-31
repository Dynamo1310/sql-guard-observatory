/**
 * Knowledge Base - Owners de Bases de Datos
 * Gestión de owners responsables de cada base de datos
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen, Plus, Search, RefreshCw, Server, Database, User, Mail, Phone,
  Building, AlertTriangle, Edit, Trash2, CheckCircle2, Users
} from 'lucide-react';
import { 
  databaseOwnersApi, DatabaseOwnerDto, CreateDatabaseOwnerRequest, 
  UpdateDatabaseOwnerRequest, DatabaseOwnerServerDto 
} from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CRITICALITY_OPTIONS = ['Alta', 'Media', 'Baja'];

export default function DatabaseOwners() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCell, setFilterCell] = useState<string>('all');
  const [filterCriticality, setFilterCriticality] = useState<string>('all');
  const [page, setPage] = useState(1);
  const pageSize = 20;
  
  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingOwner, setEditingOwner] = useState<DatabaseOwnerDto | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<CreateDatabaseOwnerRequest>({
    serverName: '',
    instanceName: '',
    databaseName: '',
    ownerName: '',
    ownerEmail: '',
    ownerPhone: '',
    cellTeam: '',
    department: '',
    applicationName: '',
    businessCriticality: '',
    notes: '',
  });

  // Queries
  const { data: ownersResult, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['databaseOwners', page, pageSize, search, filterCell, filterCriticality],
    queryFn: () => databaseOwnersApi.getAll({
      serverName: search || undefined,
      cellTeam: filterCell !== 'all' ? filterCell : undefined,
      businessCriticality: filterCriticality !== 'all' ? filterCriticality : undefined,
      page,
      pageSize,
    }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: cells } = useQuery({
    queryKey: ['ownerCells'],
    queryFn: () => databaseOwnersApi.getCellTeams(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: servers } = useQuery({
    queryKey: ['availableServers'],
    queryFn: () => databaseOwnersApi.getAvailableServers(),
    staleTime: 5 * 60 * 1000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateDatabaseOwnerRequest) => databaseOwnersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databaseOwners'] });
      toast.success('Owner creado exitosamente');
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al crear owner');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDatabaseOwnerRequest }) => 
      databaseOwnersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databaseOwners'] });
      toast.success('Owner actualizado');
      setEditingOwner(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al actualizar');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => databaseOwnersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databaseOwners'] });
      toast.success('Owner eliminado');
      setDeletingId(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al eliminar');
    },
  });

  // Handlers
  const resetForm = () => {
    setFormData({
      serverName: '',
      instanceName: '',
      databaseName: '',
      ownerName: '',
      ownerEmail: '',
      ownerPhone: '',
      cellTeam: '',
      department: '',
      applicationName: '',
      businessCriticality: '',
      notes: '',
    });
  };

  const handleCreate = () => {
    createMutation.mutate(formData);
  };

  const handleUpdate = () => {
    if (!editingOwner) return;
    updateMutation.mutate({
      id: editingOwner.id,
      data: {
        ownerName: formData.ownerName,
        ownerEmail: formData.ownerEmail,
        ownerPhone: formData.ownerPhone,
        cellTeam: formData.cellTeam,
        department: formData.department,
        applicationName: formData.applicationName,
        businessCriticality: formData.businessCriticality,
        notes: formData.notes,
      }
    });
  };

  const openEdit = (owner: DatabaseOwnerDto) => {
    setEditingOwner(owner);
    setFormData({
      serverName: owner.serverName,
      instanceName: owner.instanceName || '',
      databaseName: owner.databaseName,
      ownerName: owner.ownerName,
      ownerEmail: owner.ownerEmail || '',
      ownerPhone: owner.ownerPhone || '',
      cellTeam: owner.cellTeam || '',
      department: owner.department || '',
      applicationName: owner.applicationName || '',
      businessCriticality: owner.businessCriticality || '',
      notes: owner.notes || '',
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" />
            Knowledge Base - Owners de BD
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestión de responsables de bases de datos
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Owner
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por servidor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterCell} onValueChange={setFilterCell}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Célula" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las células</SelectItem>
                {cells?.map(c => (
                  <SelectItem key={c.cellTeam} value={c.cellTeam}>
                    {c.cellTeam} ({c.databaseCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCriticality} onValueChange={setFilterCriticality}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Criticidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CRITICALITY_OPTIONS.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Owners Registrados
          </CardTitle>
          <CardDescription>
            {ownersResult?.totalCount || 0} registros encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servidor / BD</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Célula</TableHead>
                  <TableHead>Criticidad</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead className="w-[100px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ownersResult?.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No hay owners registrados
                    </TableCell>
                  </TableRow>
                ) : (
                  ownersResult?.items.map(owner => (
                    <TableRow key={owner.id}>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <Server className="h-4 w-4 text-muted-foreground mt-1" />
                          <div>
                            <div className="font-medium">{owner.serverName}</div>
                            <div className="text-sm text-muted-foreground">{owner.databaseName}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{owner.ownerName}</div>
                            {owner.department && (
                              <div className="text-xs text-muted-foreground">{owner.department}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {owner.cellTeam && (
                          <Badge variant="outline">{owner.cellTeam}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {owner.businessCriticality && (
                          <Badge className={cn(
                            owner.businessCriticality === 'Alta' && 'bg-red-100 text-red-800',
                            owner.businessCriticality === 'Media' && 'bg-yellow-100 text-yellow-800',
                            owner.businessCriticality === 'Baja' && 'bg-green-100 text-green-800',
                          )}>
                            {owner.businessCriticality}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {owner.ownerEmail && (
                            <div className="flex items-center gap-1 text-sm">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[150px]">{owner.ownerEmail}</span>
                            </div>
                          )}
                          {owner.ownerPhone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {owner.ownerPhone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(owner)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeletingId(owner.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Paginación */}
          {ownersResult && ownersResult.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Página {page} de {ownersResult.totalPages}
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  Anterior
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  disabled={page >= ownersResult.totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Crear/Editar */}
      <Dialog open={showCreateDialog || editingOwner !== null} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingOwner(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOwner ? 'Editar Owner' : 'Nuevo Owner'}</DialogTitle>
            <DialogDescription>
              {editingOwner 
                ? 'Modifica la información del owner'
                : 'Registra un nuevo owner de base de datos'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!editingOwner && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Servidor *</Label>
                    <Select 
                      value={formData.serverName} 
                      onValueChange={(v) => setFormData({ ...formData, serverName: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {servers?.map(s => (
                          <SelectItem key={s.serverName} value={s.serverName}>
                            {s.serverName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Base de Datos *</Label>
                    <Input
                      value={formData.databaseName}
                      onChange={(e) => setFormData({ ...formData, databaseName: e.target.value })}
                      placeholder="Nombre de la BD"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre Owner *</Label>
                <Input
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={formData.ownerPhone}
                  onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Célula / Equipo</Label>
                <Input
                  value={formData.cellTeam}
                  onChange={(e) => setFormData({ ...formData, cellTeam: e.target.value })}
                  placeholder="Ej: Infraestructura"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Input
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Criticidad</Label>
                <Select 
                  value={formData.businessCriticality} 
                  onValueChange={(v) => setFormData({ ...formData, businessCriticality: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CRITICALITY_OPTIONS.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Aplicación</Label>
              <Input
                value={formData.applicationName}
                onChange={(e) => setFormData({ ...formData, applicationName: e.target.value })}
                placeholder="Nombre de la aplicación que usa esta BD"
              />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCreateDialog(false);
              setEditingOwner(null);
              resetForm();
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={editingOwner ? handleUpdate : handleCreate}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingOwner ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar owner?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El owner será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
