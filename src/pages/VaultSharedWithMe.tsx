/**
 * Página de credenciales compartidas directamente con el usuario
 */
import { useState, useEffect, useMemo } from 'react';
import { 
  Key, Search, Grid, List, RefreshCw,
  Share2, UserPlus, AlertTriangle, Calendar
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CredentialCard, AuditLogTable } from '@/components/vault';
import { PasswordReveal } from '@/components/vault/PasswordReveal';
import { 
  vaultApi, 
  SharedWithMeCredentialDto, 
  CredentialAuditLogDto,
  CredentialType 
} from '@/services/vaultApi';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function VaultSharedWithMe() {
  const [credentials, setCredentials] = useState<SharedWithMeCredentialDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { toast } = useToast();

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<CredentialType | 'all'>('all');

  // Sheet de auditoría
  const [auditSheetOpen, setAuditSheetOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<CredentialAuditLogDto[]>([]);
  const [auditCredentialName, setAuditCredentialName] = useState('');

  const loadCredentials = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);

    try {
      const data = await vaultApi.getSharedWithMe();
      setCredentials(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las credenciales compartidas',
        variant: 'destructive'
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
          cred.sharedByUserName?.toLowerCase().includes(term) ||
          cred.servers.some(s => s.serverName.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }

      // Filtro de tipo
      if (typeFilter !== 'all' && cred.credentialType !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [credentials, searchTerm, typeFilter]);

  const handleViewAudit = async (credential: SharedWithMeCredentialDto) => {
    try {
      const logs = await vaultApi.getCredentialAuditLog(credential.id);
      setAuditLogs(logs);
      setAuditCredentialName(credential.name);
      setAuditSheetOpen(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cargar el historial',
        variant: 'destructive'
      });
    }
  };

  // Stats
  const stats = useMemo(() => ({
    total: credentials.length,
    expired: credentials.filter(c => c.isExpired).length,
    recentlyShared: credentials.filter(c => {
      if (!c.sharedAt) return false;
      const sharedDate = new Date(c.sharedAt);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return sharedDate > weekAgo;
    }).length
  }), [credentials]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48" />
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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="h-6 w-6" />
            Compartidas Conmigo
          </h1>
          <p className="text-muted-foreground">
            Credenciales que otros usuarios han compartido directamente contigo
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Compartidas conmigo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {stats.recentlyShared > 0 && (
          <Card className="border-blue-500/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold text-blue-500">{stats.recentlyShared}</p>
                  <p className="text-sm text-muted-foreground">Nuevas esta semana</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {stats.expired > 0 && (
          <Card className="border-destructive/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-2xl font-bold text-destructive">{stats.expired}</p>
                  <p className="text-sm text-muted-foreground">Expiradas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filtros y controles */}
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
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="SqlAuth">SQL Auth</SelectItem>
            <SelectItem value="WindowsAD">Windows/AD</SelectItem>
            <SelectItem value="Other">Otro</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex gap-1">
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
        <Button 
          variant="outline" 
          size="icon"
          onClick={() => loadCredentials(false)}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Lista de credenciales */}
      {filteredCredentials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">
              {searchTerm || typeFilter !== 'all'
                ? 'No se encontraron credenciales'
                : 'No hay credenciales compartidas contigo'
              }
            </h3>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              {searchTerm || typeFilter !== 'all'
                ? 'Intenta con otros filtros'
                : 'Cuando alguien comparta una credencial directamente contigo, aparecerá aquí'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
            : 'space-y-3'
        }>
          {filteredCredentials.map(credential => (
            <SharedCredentialCard
              key={credential.id}
              credential={credential}
              onViewAudit={handleViewAudit}
              variant={viewMode === 'list' ? 'compact' : 'default'}
            />
          ))}
        </div>
      )}

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
    </div>
  );
}

// Componente de tarjeta especializado para credenciales compartidas conmigo
interface SharedCredentialCardProps {
  credential: SharedWithMeCredentialDto;
  onViewAudit?: (credential: SharedWithMeCredentialDto) => void;
  variant?: 'default' | 'compact';
}

function SharedCredentialCard({ credential, onViewAudit, variant = 'default' }: SharedCredentialCardProps) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), "d 'de' MMM yyyy", { locale: es });
    } catch {
      return null;
    }
  };

  const getTimeAgo = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: es });
    } catch {
      return null;
    }
  };

  const permissionConfig = {
    View: { label: 'Ver', color: 'bg-gray-100 text-gray-700' },
    Edit: { label: 'Editar', color: 'bg-blue-100 text-blue-700' },
    Admin: { label: 'Admin', color: 'bg-amber-100 text-amber-700' }
  };

  const perm = permissionConfig[credential.myPermission as keyof typeof permissionConfig] || permissionConfig.View;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold truncate">{credential.name}</h3>
            <p className="text-sm text-muted-foreground truncate">
              {credential.domain ? `${credential.domain}\\${credential.username}` : credential.username}
            </p>
          </div>
          <Badge variant="outline" className={perm.color}>
            {perm.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {credential.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {credential.description}
          </p>
        )}

        {/* Información de quién compartió */}
        <div className="flex items-center gap-2 text-sm p-2 bg-muted/50 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-primary">
              {(credential.sharedByUserName || 'U').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{credential.sharedByUserName || 'Usuario'}</p>
            <p className="text-xs text-muted-foreground">
              Compartió {getTimeAgo(credential.sharedAt)}
            </p>
          </div>
        </div>

        {/* Servidores asociados */}
        {credential.servers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {credential.servers.slice(0, 3).map(server => (
              <Badge key={server.id} variant="outline" className="text-xs">
                {server.fullServerName}
              </Badge>
            ))}
            {credential.servers.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{credential.servers.length - 3} más
              </Badge>
            )}
          </div>
        )}

        {/* Acciones */}
        <div className="flex items-center gap-2 pt-2">
          <PasswordReveal credentialId={credential.id} />
          {onViewAudit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewAudit(credential)}
            >
              Historial
            </Button>
          )}
        </div>

        {/* Fecha de expiración */}
        {credential.expiresAt && (
          <div className={`text-xs flex items-center gap-1 ${
            credential.isExpired ? 'text-destructive' : 
            credential.isExpiringSoon ? 'text-amber-600' : 'text-muted-foreground'
          }`}>
            <AlertTriangle className="h-3 w-3" />
            {credential.isExpired 
              ? `Expiró el ${formatDate(credential.expiresAt)}`
              : `Expira el ${formatDate(credential.expiresAt)}`
            }
          </div>
        )}
      </CardContent>
    </Card>
  );
}

