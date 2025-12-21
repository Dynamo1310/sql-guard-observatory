/**
 * Dashboard del Vault de Credenciales DBA
 */
import { useState, useEffect } from 'react';
import { 
  Key, Lock, Unlock, AlertTriangle, Clock, Server, 
  Database, Monitor, Activity, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { CredentialCard, CredentialDialog } from '@/components/vault';
import { vaultApi, VaultStatsDto, CredentialDto } from '@/services/vaultApi';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function VaultDashboard() {
  const [stats, setStats] = useState<VaultStatsDto | null>(null);
  const [expiringCredentials, setExpiringCredentials] = useState<CredentialDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const loadData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setIsRefreshing(true);
    
    try {
      const [statsData, expiringData] = await Promise.all([
        vaultApi.getStats(),
        vaultApi.getExpiringCredentials(30)
      ]);
      setStats(statsData);
      setExpiringCredentials(expiringData);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las estadísticas',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const typeBreakdown = [
    { 
      type: 'SQL Server', 
      count: stats?.sqlAuthCredentials || 0, 
      icon: Database, 
      color: 'bg-blue-500' 
    },
    { 
      type: 'Windows/AD', 
      count: stats?.windowsCredentials || 0, 
      icon: Monitor, 
      color: 'bg-purple-500' 
    },
    { 
      type: 'Otros', 
      count: stats?.otherCredentials || 0, 
      icon: Key, 
      color: 'bg-gray-500' 
    }
  ];

  const totalByType = typeBreakdown.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vault DBA</h1>
          <p className="text-muted-foreground">
            Gestión segura de credenciales del equipo
          </p>
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
          <Button onClick={() => setDialogOpen(true)}>
            <Key className="h-4 w-4 mr-2" />
            Nueva Credencial
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credenciales</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCredentials || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalServersLinked || 0} servidores vinculados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compartidas</CardTitle>
            <Unlock className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sharedCredentials || 0}</div>
            <p className="text-xs text-muted-foreground">
              Accesibles por el equipo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Privadas</CardTitle>
            <Lock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.privateCredentials || 0}</div>
            <p className="text-xs text-muted-foreground">
              Solo visibles para ti
            </p>
          </CardContent>
        </Card>

        <Card className={stats?.expiringCredentials || stats?.expiredCredentials ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-950/20' : ''}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Atención</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats?.expiredCredentials ? 'text-red-500' : stats?.expiringCredentials ? 'text-amber-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats?.expiringCredentials || 0) + (stats?.expiredCredentials || 0)}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {stats?.expiredCredentials ? (
                <Badge variant="destructive" className="text-xs">
                  {stats.expiredCredentials} expiradas
                </Badge>
              ) : null}
              {stats?.expiringCredentials ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
                  {stats.expiringCredentials} por expirar
                </Badge>
              ) : null}
              {!stats?.expiredCredentials && !stats?.expiringCredentials && (
                <span className="text-muted-foreground">Todo al día</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution and Expiring */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Distribución por tipo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribución por Tipo</CardTitle>
            <CardDescription>
              Desglose de credenciales por tipo de autenticación
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {typeBreakdown.map((type) => (
              <div key={type.type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <type.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{type.type}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {type.count} ({totalByType ? Math.round((type.count / totalByType) * 100) : 0}%)
                  </span>
                </div>
                <Progress 
                  value={totalByType ? (type.count / totalByType) * 100 : 0} 
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Última actividad */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actividad Reciente</CardTitle>
            <CardDescription>
              Estado del vault y última actualización
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">Estado del Vault</span>
              </div>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Operativo
              </Badge>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Última actividad</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {stats?.lastActivity 
                  ? formatDistanceToNow(new Date(stats.lastActivity), { locale: es, addSuffix: true })
                  : 'Sin actividad'
                }
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Servidores vinculados</span>
              </div>
              <span className="text-sm font-medium">{stats?.totalServersLinked || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credenciales próximas a expirar */}
      {expiringCredentials.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Credenciales que requieren atención
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {expiringCredentials.slice(0, 6).map((credential) => (
              <CredentialCard
                key={credential.id}
                credential={credential}
                showActions={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Dialog para nueva credencial */}
      <CredentialDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => loadData(false)}
      />
    </div>
  );
}

