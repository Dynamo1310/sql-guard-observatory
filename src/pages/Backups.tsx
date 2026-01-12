/**
 * Página de Backups - Monitoreo de respaldos y cumplimiento de RPO
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Save, AlertTriangle, CheckCircle2, RefreshCw, Search, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { healthScoreV3Api, HealthScoreV3Dto } from '@/services/api';
import { useTableSort } from '@/hooks/use-table-sort';
import { useToast } from '@/hooks/use-toast';

interface BackupRowData {
  instanceName: string;
  ambiente?: string;
  hostingSite?: string;
  score: number;
  status: 'ok' | 'warning' | 'critical';
  issue: string;
}

export default function Backups() {
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterAmbiente, setFilterAmbiente] = useState<string>('Produccion');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { toast } = useToast();

  // Cargar datos
  const fetchData = useCallback(async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      const data = await healthScoreV3Api.getAllHealthScores();
      setHealthScores(data);
    } catch (error) {
      console.error('Error al cargar datos de backups:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de backups',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Obtener ambientes únicos
  const ambientes = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.ambiente).filter(Boolean))];
    return ['all', ...unique.sort()];
  }, [healthScores]);

  // Filtrar por ambiente y búsqueda
  const filteredScores = useMemo(() => {
    let result = healthScores;
    if (filterAmbiente !== 'all') {
      result = result.filter(s => s.ambiente === filterAmbiente);
    }
    if (searchQuery) {
      result = result.filter(s => 
        s.instanceName.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return result;
  }, [healthScores, filterAmbiente, searchQuery]);

  // Convertir a datos de tabla
  const backupData: BackupRowData[] = useMemo(() => {
    return filteredScores.map(s => {
      const score = s.score_Backups ?? 100;
      let status: 'ok' | 'warning' | 'critical' = 'ok';
      let issue = 'OK';
      
      if (score < 50) {
        status = 'critical';
        issue = 'FULL vencido';
      } else if (score < 100) {
        status = 'warning';
        issue = 'LOG vencido';
      }
      
      return {
        instanceName: s.instanceName,
        ambiente: s.ambiente,
        hostingSite: s.hostingSite,
        score,
        status,
        issue
      };
    }).sort((a, b) => a.score - b.score);
  }, [filteredScores]);

  // Estadísticas
  const stats = useMemo(() => {
    const ok = backupData.filter(b => b.status === 'ok').length;
    const warning = backupData.filter(b => b.status === 'warning').length;
    const critical = backupData.filter(b => b.status === 'critical').length;
    const total = backupData.length;
    const avgScore = total > 0 ? Math.round(backupData.reduce((sum, b) => sum + b.score, 0) / total) : 0;
    return { ok, warning, critical, total, avgScore };
  }, [backupData]);

  const { sortedData, requestSort, getSortIndicator } = useTableSort(backupData);

  // Get status badge
  const getStatusBadge = (status: string, score: number) => {
    if (status === 'ok') {
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          OK
        </Badge>
      );
    }
    if (status === 'warning') {
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Advertencia
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <XCircle className="w-3 h-3 mr-1" />
        Crítico
      </Badge>
    );
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 100) return 'text-emerald-500';
    if (score >= 50) return 'text-warning';
    return 'text-red-500';
  };

  // Loading State
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Stats cards skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Filters skeleton */}
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        
        {/* Table skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Save className="h-8 w-8" />
            Estado de Backups
          </h1>
          <p className="text-muted-foreground">
            Monitoreo de respaldos y cumplimiento de RPO
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchData(false)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Score Promedio</CardTitle>
            <Save className={`h-4 w-4 ${getScoreColor(stats.avgScore)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(stats.avgScore)}`}>
              {stats.avgScore}%
            </div>
            <p className="text-xs text-muted-foreground">
              de 100%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Backups OK</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.ok}</div>
            <p className="text-xs text-muted-foreground">
              RPO cumplido (100%)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Advertencias</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats.warning > 0 ? 'text-warning' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.warning > 0 ? 'text-warning' : 'text-emerald-500'}`}>
              {stats.warning}
            </div>
            <p className="text-xs text-muted-foreground">
              LOG backup vencido
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticos</CardTitle>
            <XCircle className={`h-4 w-4 ${stats.critical > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.critical > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {stats.critical}
            </div>
            <p className="text-xs text-muted-foreground">
              FULL backup vencido
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar instancia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ambiente" />
          </SelectTrigger>
          <SelectContent>
            {ambientes.map(amb => (
              <SelectItem key={amb} value={amb}>
                {amb === 'all' ? 'Todos' : amb}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {backupData.length === healthScores.length 
          ? `${healthScores.length} instancias`
          : `${backupData.length} de ${healthScores.length} instancias`
        }
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-primary" />
            Estado de Backups por Instancia
          </CardTitle>
          <CardDescription>
            Monitoreo del cumplimiento de políticas de backup (RPO)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-auto">
            {sortedData.length === 0 ? (
              <div className="text-center py-12">
                <Save className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay datos de backups</h3>
                <p className="text-muted-foreground">
                  No se encontraron instancias con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('instanceName')}>
                      Instancia {getSortIndicator('instanceName')}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('ambiente')}>
                      Ambiente {getSortIndicator('ambiente')}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('hostingSite')}>
                      Hosting {getSortIndicator('hostingSite')}
                    </TableHead>
                    <TableHead className="text-center cursor-pointer hover:bg-accent" onClick={() => requestSort('score')}>
                      Score {getSortIndicator('score')}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('issue')}>
                      Problema {getSortIndicator('issue')}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('status')}>
                      Estado {getSortIndicator('status')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((backup, idx) => (
                    <TableRow key={idx} className={cn({
                      'bg-destructive/10 dark:bg-destructive/20': backup.status === 'critical',
                    })}>
                      <TableCell className="font-medium">{backup.instanceName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {backup.ambiente || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {backup.hostingSite || 'N/A'}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-lg font-bold ${getScoreColor(backup.score)}`}>
                          {backup.score}%
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {backup.issue}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(backup.status, backup.score)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
