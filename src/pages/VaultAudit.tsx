/**
 * Página de auditoría del Vault (solo admin)
 * Incluye auditoría de cambios y accesos (Vault + Sistema)
 */
import { useState, useEffect } from 'react';
import { 
  History, RefreshCw, Filter, Calendar, Eye, Copy, Shield, Server
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AuditLogTable } from '@/components/vault';
import { vaultApi, CredentialAuditLogDto, CredentialAccessLogDto } from '@/services/vaultApi';
import { toast } from 'sonner';
import { subDays, subHours } from 'date-fns';

type TimeFilter = '1h' | '24h' | '7d' | '30d' | 'all';
type TabType = 'changes' | 'access';

export default function VaultAudit() {
  const [logs, setLogs] = useState<CredentialAuditLogDto[]>([]);
  const [accessLogs, setAccessLogs] = useState<CredentialAccessLogDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<TabType>('access');

  const loadLogs = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);

    try {
      // Cargar ambos tipos de logs en paralelo
      const [auditData, accessData] = await Promise.all([
        vaultApi.getFullAuditLog(500),
        vaultApi.getAllAccessLogs(500)
      ]);
      setLogs(auditData);
      setAccessLogs(accessData);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo cargar el historial de auditoría'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Filtrar logs de cambios (excluir eventos de acceso que ahora están en la otra pestaña)
  const accessActions = ['PasswordRevealed', 'PasswordCopied'];
  
  const filteredLogs = logs.filter(log => {
    // Excluir eventos de acceso (esos van en la pestaña Accesos)
    if (accessActions.includes(log.action)) return false;
    
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

    if (actionFilter !== 'all' && log.action !== actionFilter) {
      return false;
    }

    return true;
  });

  // Filtrar access logs
  const filteredAccessLogs = accessLogs.filter(log => {
    const logDate = new Date(log.accessedAt);
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

    // Filtro por fuente (Vault/System)
    if (sourceFilter !== 'all' && log.credentialSource !== sourceFilter) {
      return false;
    }

    return true;
  });

  // Estadísticas combinadas
  const stats = {
    total: filteredLogs.length + filteredAccessLogs.length,
    passwordReveals: filteredAccessLogs.filter(l => l.accessType === 'Reveal').length,
    passwordCopies: filteredAccessLogs.filter(l => l.accessType === 'Copy').length,
    changes: filteredLogs.filter(l => ['Created', 'Updated', 'Deleted'].includes(l.action)).length,
    uniqueUsers: new Set([
      ...filteredLogs.map(l => l.performedByUserId),
      ...filteredAccessLogs.map(l => l.userId)
    ]).size,
    vaultAccess: filteredAccessLogs.filter(l => l.credentialSource === 'Vault').length,
    systemAccess: filteredAccessLogs.filter(l => l.credentialSource === 'System').length
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total eventos</CardTitle>
            <History className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revelados</CardTitle>
            <Eye className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.passwordReveals}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Copiados</CardTitle>
            <Copy className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-info">{stats.passwordCopies}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vault</CardTitle>
            <Shield className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.vaultAccess}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sistema</CardTitle>
            <Server className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">{stats.systemAccess}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuarios activos</CardTitle>
            <History className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">{stats.uniqueUsers}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de contenido */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="access" className="gap-2">
              <Eye className="h-4 w-4" />
              Accesos
              <Badge variant="secondary" className="ml-1">{filteredAccessLogs.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="changes" className="gap-2">
              <History className="h-4 w-4" />
              Cambios
              <Badge variant="secondary" className="ml-1">{filteredLogs.length}</Badge>
            </TabsTrigger>
          </TabsList>

          {/* Filtros */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                <SelectTrigger className="w-[160px]">
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

            {activeTab === 'access' && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Fuente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="Vault">Vault</SelectItem>
                    <SelectItem value="System">Sistema</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {activeTab === 'changes' && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Tipo de acción" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las acciones</SelectItem>
                    <SelectItem value="Created">Creación</SelectItem>
                    <SelectItem value="Updated">Actualización</SelectItem>
                    <SelectItem value="Deleted">Eliminación</SelectItem>
                    <SelectItem value="ServerAdded">Servidor asociado</SelectItem>
                    <SelectItem value="ServerRemoved">Servidor desasociado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Tab de Accesos (Reveal/Copy) */}
        <TabsContent value="access">
          <Card>
            <CardHeader>
              <CardTitle>Accesos a Contraseñas</CardTitle>
              <CardDescription>
                Registro de acciones de revelar y copiar contraseñas (Vault + Credenciales de Sistema)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredAccessLogs.length === 0 ? (
                <div className="text-center py-12">
                  <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No hay registros de acceso</h3>
                  <p className="text-muted-foreground">
                    No se encontraron accesos con los filtros seleccionados.
                  </p>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha/Hora</TableHead>
                        <TableHead>Fuente</TableHead>
                        <TableHead>Credencial</TableHead>
                        <TableHead>Acción</TableHead>
                        <TableHead>Usuario</TableHead>
                        <TableHead>IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAccessLogs.map(log => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(log.accessedAt).toLocaleString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={log.credentialSource === 'Vault' ? 'default' : 'secondary'}>
                              {log.credentialSource === 'Vault' ? (
                                <><Shield className="h-3 w-3 mr-1" /> Vault</>
                              ) : (
                                <><Server className="h-3 w-3 mr-1" /> Sistema</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {log.credentialName || `ID: ${log.credentialId || log.systemCredentialId}`}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              className={log.accessType === 'Reveal' ? 'bg-warning/10 text-warning border-warning/30' : 'bg-muted text-muted-foreground border-border/50'}
                            >
                              {log.accessType === 'Reveal' ? (
                                <><Eye className="h-3 w-3 mr-1" /> Revelado</>
                              ) : log.accessType === 'Copy' ? (
                                <><Copy className="h-3 w-3 mr-1" /> Copiado</>
                              ) : (
                                log.accessType
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {log.userName || log.userId}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {log.ipAddress || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Cambios */}
        <TabsContent value="changes">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Cambios</CardTitle>
              <CardDescription>
                Todas las modificaciones realizadas sobre las credenciales del Vault
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

