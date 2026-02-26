import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, Search, CheckCircle2, AlertTriangle, XCircle, ChevronDown,
  ChevronRight, Copy, Check, Server, Database, Clock, Shield,
  ExternalLink,
} from 'lucide-react';
import {
  tempDbAnalyzerApi,
  TempDbCheckResultDto,
  TempDbRecommendationDto,
} from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function getStatusIcon(status: string) {
  switch (status) {
    case 'CUMPLE':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />;
    case 'ADVERTENCIA':
    case 'REVISAR':
      return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
    case 'NO CUMPLE':
      return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
    default:
      return <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'CUMPLE':
      return <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 bg-emerald-500/10 text-xs">{status}</Badge>;
    case 'ADVERTENCIA':
      return <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/10 text-xs">{status}</Badge>;
    case 'REVISAR':
      return <Badge variant="outline" className="border-amber-500/50 text-amber-600 bg-amber-500/10 text-xs">{status}</Badge>;
    case 'NO CUMPLE':
      return <Badge variant="outline" className="border-red-500/50 text-red-600 bg-red-500/10 text-xs">{status}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreProgressColor(score: number): string {
  if (score >= 80) return '[&>div]:bg-emerald-500';
  if (score >= 50) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

function getOverallStatus(result: TempDbCheckResultDto): string {
  if (!result.connectionSuccess) return 'ERROR';
  if (result.overallScore >= 80) return 'CUMPLE';
  if (result.overallScore >= 50) return 'REVISAR';
  return 'NO CUMPLE';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1"
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  );
}

function RecommendationDetail({ rec }: { rec: TempDbRecommendationDto }) {
  const hasSuggestion = rec.suggestion || rec.sqlScript;
  const showDetail = rec.status !== 'CUMPLE' && rec.status !== 'N/A' && hasSuggestion;

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start gap-2">
        {getStatusIcon(rec.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{rec.name}</span>
            {getStatusBadge(rec.status)}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{rec.details}</p>
        </div>
      </div>

      {showDetail && (
        <div className="ml-6 space-y-2">
          {rec.suggestion && (
            <div className="bg-muted/50 rounded-md p-2.5 text-xs text-foreground">
              {rec.suggestion}
            </div>
          )}
          {rec.sqlScript && (
            <div className="relative">
              <div className="absolute top-1.5 right-1.5 z-10">
                <CopyButton text={rec.sqlScript} />
              </div>
              <pre className="bg-muted border rounded-md p-3 pr-20 text-xs text-foreground overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                {rec.sqlScript}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InstanceRow({
  result,
  onRefresh,
  isRefreshing,
}: {
  result: TempDbCheckResultDto;
  onRefresh: (name: string) => void;
  isRefreshing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const overallStatus = getOverallStatus(result);

  const issueCount = result.recommendations.filter(
    r => r.status !== 'CUMPLE' && r.status !== 'N/A'
  ).length;

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer transition-colors hover:bg-muted/50',
          expanded && 'bg-muted/30'
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <TableCell className="w-8">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </TableCell>
        <TableCell className="font-medium text-sm">
          <div className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
            {result.instanceName}
          </div>
        </TableCell>
        <TableCell className="text-sm">
          <Badge variant="outline" className="text-xs">{result.ambiente || '-'}</Badge>
        </TableCell>
        <TableCell className="text-sm">
          {result.majorVersion || '-'}
        </TableCell>
        <TableCell>
          {result.connectionSuccess ? (
            <div className="flex items-center gap-2 min-w-[120px]">
              <Progress
                value={result.overallScore}
                className={cn('h-2 w-16', getScoreProgressColor(result.overallScore))}
              />
              <span className={cn('text-sm font-semibold tabular-nums', getScoreColor(result.overallScore))}>
                {result.overallScore}
              </span>
            </div>
          ) : (
            <span className="text-xs text-red-500">Error</span>
          )}
        </TableCell>
        <TableCell>
          {result.connectionSuccess ? (
            <div className="flex items-center gap-1.5">
              {overallStatus === 'CUMPLE' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              {overallStatus === 'REVISAR' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
              {overallStatus === 'NO CUMPLE' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
              <span className="text-xs">{overallStatus}</span>
              {issueCount > 0 && (
                <span className="text-[10px] text-muted-foreground">({issueCount} {issueCount === 1 ? 'problema' : 'problemas'})</span>
              )}
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive" className="text-xs">Sin conexión</Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {result.errorMessage || 'Error de conexión'}
              </TooltipContent>
            </Tooltip>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {formatDate(result.analyzedAt)}
        </TableCell>
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={(e) => { e.stopPropagation(); onRefresh(result.instanceName); }}
                disabled={isRefreshing}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Re-analizar esta instancia</TooltipContent>
          </Tooltip>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={8} className="p-0">
            <div className="px-4 py-3 bg-muted/20 border-t space-y-2">
              {!result.connectionSuccess ? (
                <div className="text-sm text-red-500 p-2">
                  Error de conexión: {result.errorMessage}
                </div>
              ) : result.recommendations.length === 0 ? (
                <div className="text-sm text-muted-foreground p-2">
                  No hay datos de análisis disponibles.
                </div>
              ) : (
                <div className="grid gap-2">
                  {result.recommendations.map((rec, idx) => (
                    <RecommendationDetail key={idx} rec={rec} />
                  ))}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function TempDbAnalyzer() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ambienteFilter, setAmbienteFilter] = useState<string>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [refreshingInstance, setRefreshingInstance] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tempdb-analyzer'],
    queryFn: () => tempDbAnalyzerApi.getCachedResults(),
  });

  const analyzeAllMutation = useMutation({
    mutationFn: () => tempDbAnalyzerApi.analyzeAll(),
    onSuccess: (response) => {
      queryClient.setQueryData(['tempdb-analyzer'], response);
      toast.success(`Análisis completado: ${response.totalInstances} instancias analizadas`);
    },
    onError: (err: Error) => {
      toast.error('Error al analizar: ' + err.message);
    },
  });

  const analyzeInstanceMutation = useMutation({
    mutationFn: (instanceName: string) => tempDbAnalyzerApi.analyzeInstance(instanceName),
    onSuccess: (updated) => {
      queryClient.setQueryData(['tempdb-analyzer'], (old: typeof data) => {
        if (!old) return old;
        const newResults = old.results.map(r =>
          r.instanceName === updated.instanceName ? updated : r
        );
        const connected = newResults.filter(r => r.connectionSuccess);
        return {
          ...old,
          results: newResults,
          complianceCount: connected.filter(r => r.overallScore >= 80).length,
          warningCount: connected.filter(r => r.overallScore >= 50 && r.overallScore < 80).length,
          failCount: newResults.filter(r => !r.connectionSuccess || r.overallScore < 50).length,
        };
      });
      setRefreshingInstance(null);
      toast.success(`${updated.instanceName} re-analizada`);
    },
    onError: (err: Error) => {
      setRefreshingInstance(null);
      toast.error('Error: ' + err.message);
    },
  });

  const handleRefreshInstance = (name: string) => {
    setRefreshingInstance(name);
    analyzeInstanceMutation.mutate(name);
  };

  const ambientes = useMemo(() => {
    if (!data?.results) return [];
    const set = new Set(data.results.map(r => r.ambiente).filter(Boolean) as string[]);
    return [...set].sort();
  }, [data]);

  const versions = useMemo(() => {
    if (!data?.results) return [];
    const set = new Set(data.results.map(r => r.majorVersion).filter(Boolean) as string[]);
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.results) return [];
    return data.results.filter(r => {
      if (search && !r.instanceName.toLowerCase().includes(search.toLowerCase())) return false;

      if (ambienteFilter !== 'all' && r.ambiente !== ambienteFilter) return false;
      if (versionFilter !== 'all' && r.majorVersion !== versionFilter) return false;

      if (statusFilter !== 'all') {
        const status = getOverallStatus(r);
        if (statusFilter === 'CUMPLE' && status !== 'CUMPLE') return false;
        if (statusFilter === 'REVISAR' && status !== 'REVISAR') return false;
        if (statusFilter === 'NO CUMPLE' && status !== 'NO CUMPLE' && status !== 'ERROR') return false;
      }

      return true;
    });
  }, [data, search, statusFilter, ambienteFilter, versionFilter]);

  const hasData = data && data.results.length > 0;
  const isEmpty = data && data.results.length === 0;

  return (
    <TooltipProvider>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Database className="h-6 w-6 text-primary" />
              Analizador TempDB
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Chequeo de mejores prácticas de TempDB en todas las instancias SQL Server
            </p>
            <a
              href="https://triggerdb.com/optimizacion-de-tempdb-en-sql-server-guia-de-mejores-practicas-y-script-de-salud/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors mt-0.5"
            >
              <ExternalLink className="h-3 w-3" />
              Basado en guía de TriggerDB Consulting
            </a>
          </div>
          <div className="flex items-center gap-2">
            {data?.lastFullScanAt && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(data.lastFullScanAt)}
              </span>
            )}
            <Button
              onClick={() => analyzeAllMutation.mutate()}
              disabled={analyzeAllMutation.isPending}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-4 w-4', analyzeAllMutation.isPending && 'animate-spin')} />
              {analyzeAllMutation.isPending ? 'Analizando...' : 'Actualizar Todo'}
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {hasData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">Total Instancias</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="text-2xl font-bold">{data.totalInstances}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-emerald-600">Cumplen</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-2xl font-bold text-emerald-600">{data.complianceCount}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-amber-600">Advertencias</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <span className="text-2xl font-bold text-amber-600">{data.warningCount}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-red-600">No Cumplen</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <span className="text-2xl font-bold text-red-600">{data.failCount}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        {hasData && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar instancia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[170px] h-9 text-sm">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="CUMPLE">Cumplen</SelectItem>
                <SelectItem value="REVISAR">Revisar</SelectItem>
                <SelectItem value="NO CUMPLE">No Cumplen</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ambienteFilter} onValueChange={setAmbienteFilter}>
              <SelectTrigger className="w-[190px] h-9 text-sm">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los ambientes</SelectItem>
                {ambientes.map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={versionFilter} onValueChange={setVersionFilter}>
              <SelectTrigger className="w-[190px] h-9 text-sm">
                <SelectValue placeholder="Versión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las versiones</SelectItem>
                {versions.map(v => (
                  <SelectItem key={v} value={v}>SQL {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(search || statusFilter !== 'all' || ambienteFilter !== 'all' || versionFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 text-xs"
                onClick={() => { setSearch(''); setStatusFilter('all'); setAmbienteFilter('all'); setVersionFilter('all'); }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <Card>
            <CardContent className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {isError && (
          <Card>
            <CardContent className="p-8 text-center">
              <XCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Error al cargar los datos.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ['tempdb-analyzer'] })}>
                Reintentar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {isEmpty && (
          <Card>
            <CardContent className="p-12 text-center">
              <Database className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
              <h3 className="text-lg font-semibold">Sin datos de análisis</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Ejecutá el primer análisis para verificar las mejores prácticas de TempDB en todas las instancias.
              </p>
              <Button onClick={() => analyzeAllMutation.mutate()} disabled={analyzeAllMutation.isPending}>
                <RefreshCw className={cn('h-4 w-4 mr-2', analyzeAllMutation.isPending && 'animate-spin')} />
                Ejecutar Análisis
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Analyzing overlay */}
        {analyzeAllMutation.isPending && (
          <Card>
            <CardContent className="p-6 text-center">
              <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">Analizando todas las instancias...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Esto puede tomar unos minutos dependiendo de la cantidad de instancias.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        {hasData && filtered.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead className="text-xs">Instancia</TableHead>
                    <TableHead className="text-xs">Ambiente</TableHead>
                    <TableHead className="text-xs">Versión</TableHead>
                    <TableHead className="text-xs">Score</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs">Última vez</TableHead>
                    <TableHead className="text-xs w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((result) => (
                    <InstanceRow
                      key={result.instanceName}
                      result={result}
                      onRefresh={handleRefreshInstance}
                      isRefreshing={refreshingInstance === result.instanceName}
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* No results after filter */}
        {hasData && filtered.length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No se encontraron instancias con los filtros seleccionados.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
