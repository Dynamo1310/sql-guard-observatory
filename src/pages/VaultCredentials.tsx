/**
 * Página de gestión de credenciales compartidas
 */
import { useState, useEffect, useMemo } from 'react';
import { 
  Key, Search, Filter, Plus, Grid, List, RefreshCw,
  Database, Monitor, AlertTriangle, X
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { CredentialCard, CredentialDialog, AuditLogTable } from '@/components/vault';
import { 
  vaultApi, 
  CredentialDto, 
  CredentialFilterRequest,
  CredentialAuditLogDto,
  CredentialType 
} from '@/services/vaultApi';
import { toast } from 'sonner';

export default function VaultCredentials() {
  const [credentials, setCredentials] = useState<CredentialDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CredentialType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'expiring'>('all');

  // Dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCredential, setEditingCredential] = useState<CredentialDto | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [credentialToDelete, setCredentialToDelete] = useState<CredentialDto | null>(null);
  const [auditSheetOpen, setAuditSheetOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<CredentialAuditLogDto[]>([]);
  const [auditCredentialName, setAuditCredentialName] = useState('');

  const loadCredentials = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);

    try {
      const filter: CredentialFilterRequest = {
        isPrivate: false // Solo compartidas en esta página
      };
      const data = await vaultApi.getCredentials(filter);
      setCredentials(data);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudieron cargar las credenciales'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCredentials();
  }, []);

  // Filtrar credenciales localmente
  const filteredCredentials = useMemo(() => {
    return credentials.filter(cred => {
      // Filtro de búsqueda
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          cred.name.toLowerCase().includes(term) ||
          cred.username.toLowerCase().includes(term) ||
          cred.description?.toLowerCase().includes(term) ||
          cred.servers.some(s => s.serverName.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }

      // Filtro de tipo
      if (typeFilter !== 'all' && cred.credentialType !== typeFilter) {
        return false;
      }

      // Filtro de estado
      if (statusFilter === 'expired' && !cred.isExpired) return false;
      if (statusFilter === 'expiring' && !cred.isExpiringSoon) return false;

      return true;
    });
  }, [credentials, searchTerm, typeFilter, statusFilter]);

  const handleEdit = (credential: CredentialDto) => {
    setEditingCredential(credential);
    setDialogOpen(true);
  };

  const handleDelete = (credential: CredentialDto) => {
    setCredentialToDelete(credential);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!credentialToDelete) return;

    try {
      await vaultApi.deleteCredential(credentialToDelete.id);
      toast.success('Credencial eliminada', {
        description: `"${credentialToDelete.name}" ha sido eliminada.`
      });
      loadCredentials(false);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo eliminar la credencial'
      });
    } finally {
      setDeleteDialogOpen(false);
      setCredentialToDelete(null);
    }
  };

  const handleViewAudit = async (credential: CredentialDto) => {
    setAuditCredentialName(credential.name);
    setAuditSheetOpen(true);
    
    try {
      const logs = await vaultApi.getCredentialAuditLog(credential.id);
      setAuditLogs(logs);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo cargar el historial'
      });
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
  };

  const hasActiveFilters = searchTerm || typeFilter !== 'all' || statusFilter !== 'all';

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64" />
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
          <h1 className="text-3xl font-bold tracking-tight">Credenciales Compartidas</h1>
          <p className="text-muted-foreground">
            Credenciales accesibles por todo el equipo DBA
          </p>
        </div>
        <Button onClick={() => { setEditingCredential(undefined); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Credencial
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, usuario o servidor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CredentialType | 'all')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="SqlAuth">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    SQL Server
                  </div>
                </SelectItem>
                <SelectItem value="WindowsAD">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    Windows/AD
                  </div>
                </SelectItem>
                <SelectItem value="Other">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Otro
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'expired' | 'expiring')}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="expired">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    Expiradas
                  </div>
                </SelectItem>
                <SelectItem value="expiring">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    Por expirar
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Limpiar
              </Button>
            )}

            <div className="flex items-center gap-1 border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="icon"
              onClick={() => loadCredentials(false)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-2 mt-4">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Mostrando {filteredCredentials.length} de {credentials.length} credenciales
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de credenciales */}
      {filteredCredentials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              {hasActiveFilters ? 'No se encontraron credenciales' : 'No hay credenciales'}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {hasActiveFilters 
                ? 'Intenta ajustar los filtros de búsqueda'
                : 'Crea la primera credencial compartida del equipo'
              }
            </p>
            {!hasActiveFilters && (
              <Button onClick={() => { setEditingCredential(undefined); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Credencial
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={viewMode === 'grid' 
          ? 'grid gap-4 md:grid-cols-2 lg:grid-cols-3' 
          : 'space-y-4'
        }>
          {filteredCredentials.map((credential) => (
            <CredentialCard
              key={credential.id}
              credential={credential}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onViewAudit={handleViewAudit}
            />
          ))}
        </div>
      )}

      {/* Dialog de crear/editar */}
      <CredentialDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingCredential(undefined);
        }}
        credential={editingCredential}
        onSuccess={() => loadCredentials(false)}
      />

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar credencial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La credencial "{credentialToDelete?.name}" 
              será marcada como eliminada y ya no estará disponible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sheet de auditoría */}
      <Sheet open={auditSheetOpen} onOpenChange={setAuditSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Historial de "{auditCredentialName}"</SheetTitle>
            <SheetDescription>
              Registro de todas las acciones realizadas sobre esta credencial
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <AuditLogTable logs={auditLogs} showCredentialName={false} maxHeight="calc(100vh - 200px)" />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

