/**
 * Página de auditoría del Vault (solo admin)
 */
import { useState, useEffect } from 'react';
import { 
  History, RefreshCw, Filter, Calendar, User, Key
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AuditLogTable } from '@/components/vault';
import { vaultApi, CredentialAuditLogDto } from '@/services/vaultApi';
import { useToast } from '@/hooks/use-toast';
import { format, subDays, subHours } from 'date-fns';
import { es } from 'date-fns/locale';

type TimeFilter = '1h' | '24h' | '7d' | '30d' | 'all';

export default function VaultAudit() {
  const [logs, setLogs] = useState<CredentialAuditLogDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const { toast } = useToast();

  const loadLogs = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);

    try {
      // Cargar más registros para filtrar localmente
      const data = await vaultApi.getFullAuditLog(500);
      setLogs(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo cargar el historial de auditoría',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Filtrar logs
  const filteredLogs = logs.filter(log => {
    // Filtro de tiempo
    const logDate = new Date(log.performedAt);
    const now = new Date();
    
    switch (timeFilter) {
      case '1h':
        if (logDate < subHours(now, 1)) return false;
        break;
      case '24h':
        if (logDate < subHours(now, 24)) return false;
        break;
      case '7d':
        if (logDate < subDays(now, 7)) return false;
        break;
      case '30d':
        if (logDate < subDays(now, 30)) return false;
        break;
    }

    // Filtro de acción
    if (actionFilter !== 'all' && log.action !== actionFilter) {
      return false;
    }

    return true;
  });

  // Estadísticas
  const stats = {
    total: filteredLogs.length,
    passwordReveals: filteredLogs.filter(l => l.action === 'PasswordRevealed').length,
    passwordCopies: filteredLogs.filter(l => l.action === 'PasswordCopied').length,
    changes: filteredLogs.filter(l => ['Created', 'Updated', 'Deleted'].includes(l.action)).length,
    uniqueUsers: new Set(filteredLogs.map(l => l.performedByUserId)).size,
    uniqueCredentials: new Set(filteredLogs.map(l => l.credentialId)).size
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-8 w-8" />
            Auditoría del Vault
          </h1>
          <p className="text-muted-foreground">
            Registro completo de actividad en el Vault de Credenciales
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadLogs(false)}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total eventos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Passwords revelados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats.passwordReveals}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Passwords copiados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.passwordCopies}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Cambios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.changes}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usuarios activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueUsers}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Credenciales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.uniqueCredentials}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Última hora</SelectItem>
                  <SelectItem value="24h">Últimas 24 horas</SelectItem>
                  <SelectItem value="7d">Últimos 7 días</SelectItem>
                  <SelectItem value="30d">Últimos 30 días</SelectItem>
                  <SelectItem value="all">Todo el historial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Tipo de acción" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las acciones</SelectItem>
                  <SelectItem value="Created">Creación</SelectItem>
                  <SelectItem value="Updated">Actualización</SelectItem>
                  <SelectItem value="Deleted">Eliminación</SelectItem>
                  <SelectItem value="PasswordRevealed">Password revelado</SelectItem>
                  <SelectItem value="PasswordCopied">Password copiado</SelectItem>
                  <SelectItem value="ServerAdded">Servidor asociado</SelectItem>
                  <SelectItem value="ServerRemoved">Servidor desasociado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Badge variant="outline">
              {filteredLogs.length} registros
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de auditoría */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Actividad</CardTitle>
          <CardDescription>
            Todas las acciones realizadas sobre las credenciales del Vault
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay registros</h3>
              <p className="text-muted-foreground">
                No se encontraron eventos de auditoría con los filtros seleccionados.
              </p>
            </div>
          ) : (
            <AuditLogTable 
              logs={filteredLogs} 
              showCredentialName={true} 
              maxHeight="600px"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

