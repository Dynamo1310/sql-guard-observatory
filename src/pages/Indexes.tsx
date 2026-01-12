/**
 * Página de Análisis de Índices
 */
import { useState, useEffect, useMemo } from 'react';
import { 
  ListTree, Database, Search, AlertTriangle, CheckCircle2, 
  Copy, Download, RefreshCw, Server,
  TrendingUp, Trash2, AlertCircle, Ban, Layers
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  indexAnalysisApi, 
  IndexAnalysisInstanceDto, 
  DatabaseInfoDto,
  FullIndexAnalysisDto 
} from '@/services/api';

export default function Indexes() {
  // State para selectores
  const [instances, setInstances] = useState<IndexAnalysisInstanceDto[]>([]);
  const [databases, setDatabases] = useState<DatabaseInfoDto[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  
  // State para filtros
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('todos');
  
  // State para análisis
  const [analysis, setAnalysis] = useState<FullIndexAnalysisDto | null>(null);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('fragmented');

  // Obtener ambientes únicos
  const ambientes = useMemo(() => {
    const uniqueAmbientes = [...new Set(instances.map(i => i.ambiente).filter(Boolean))];
    return uniqueAmbientes.sort();
  }, [instances]);

  // Filtrar instancias
  const filteredInstances = useMemo(() => {
    return instances.filter(inst => {
      const matchesSearch = searchTerm === '' || 
        inst.instanceName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAmbiente = selectedAmbiente === 'todos' || 
        inst.ambiente?.toLowerCase() === selectedAmbiente.toLowerCase();
      return matchesSearch && matchesAmbiente;
    });
  }, [instances, searchTerm, selectedAmbiente]);

  // Cargar instancias al montar
  useEffect(() => {
    loadInstances();
  }, []);

  // Cargar bases de datos cuando cambia la instancia
  useEffect(() => {
    if (selectedInstance) {
      loadDatabases(selectedInstance);
      setSelectedDatabase('');
      setAnalysis(null);
    }
  }, [selectedInstance]);

  const loadInstances = async () => {
    setIsLoadingInstances(true);
    try {
      const data = await indexAnalysisApi.getInstances();
      setInstances(data);
    } catch (error) {
      toast.error('No se pudieron cargar las instancias');
    } finally {
      setIsLoadingInstances(false);
    }
  };

  const loadDatabases = async (instanceName: string) => {
    setIsLoadingDatabases(true);
    try {
      const data = await indexAnalysisApi.getDatabases(instanceName);
      setDatabases(data);
    } catch (error) {
      toast.error(`No se pudo conectar a ${instanceName}`);
      setDatabases([]);
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  const runAnalysis = async () => {
    if (!selectedInstance || !selectedDatabase) {
      toast.error('Selecciona una instancia y base de datos');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await indexAnalysisApi.getFullAnalysis(selectedInstance, selectedDatabase);
      setAnalysis(result);
      toast.success(`Análisis completado: ${selectedDatabase}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error en análisis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    if (!text) {
      toast.error('No hay script disponible para copiar');
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      toast.success(`Script de ${label} copiado`);
    } catch (error) {
      toast.error('Error al copiar al portapapeles');
    }
  };

  const exportToCSV = (data: unknown[], filename: string) => {
    if (!data.length) return;
    
    const headers = Object.keys(data[0] as object).join(',');
    const rows = data.map(row => 
      Object.values(row as object).map(v => 
        typeof v === 'string' && v.includes(',') ? `"${v}"` : v
      ).join(',')
    );
    
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  // Get color for KPI
  const getKpiColor = (value: number, thresholdWarning: number, thresholdCritical: number) => {
    if (value >= thresholdCritical) return 'text-red-500';
    if (value >= thresholdWarning) return 'text-warning';
    return 'text-emerald-500';
  };

  // Loading State
  if (isLoadingInstances) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
        </div>
        
        {/* Selector skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-40" />
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-32" />
            </div>
          </CardContent>
        </Card>
        
        {/* Content skeleton */}
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Skeleton className="h-16 w-16 rounded-full" />
              <Skeleton className="h-6 w-48 mt-4" />
              <Skeleton className="h-4 w-64 mt-2" />
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
            <ListTree className="h-8 w-8" />
            Análisis de Índices
          </h1>
          <p className="text-muted-foreground">
            Análisis exhaustivo de índices: fragmentación, duplicados, sin uso, missing indexes y más
          </p>
        </div>
      </div>

      {/* Selectores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Seleccionar Instancia y Base de Datos
          </CardTitle>
          <CardDescription>
            Instancias filtradas: sin AWS, sin servidores DMZ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros de búsqueda */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar instancia..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={selectedAmbiente} onValueChange={setSelectedAmbiente}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {ambientes.map((amb) => (
                  <SelectItem key={amb} value={amb.toLowerCase()}>
                    {amb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selectores de Instancia y Base de Datos */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">
                Instancia SQL Server 
                <span className="text-muted-foreground ml-1">
                  ({filteredInstances.length} de {instances.length})
                </span>
              </label>
              <Select
                value={selectedInstance}
                onValueChange={setSelectedInstance}
                disabled={filteredInstances.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={
                    filteredInstances.length === 0 
                      ? "No hay instancias con ese filtro"
                      : "Seleccionar instancia"
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {filteredInstances.map((inst) => (
                    <SelectItem key={inst.instanceName} value={inst.instanceName}>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span>{inst.instanceName}</span>
                        <Badge variant="outline" className="text-xs">
                          {inst.ambiente}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Base de Datos</label>
              <Select
                value={selectedDatabase}
                onValueChange={setSelectedDatabase}
                disabled={!selectedInstance || isLoadingDatabases}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={
                    !selectedInstance 
                      ? "Primero selecciona una instancia" 
                      : isLoadingDatabases 
                        ? "Cargando bases de datos..." 
                        : "Seleccionar base de datos"
                  } />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {databases.map((db) => (
                    <SelectItem key={db.databaseName} value={db.databaseName}>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <span>{db.databaseName}</span>
                        <span className="text-xs text-muted-foreground">
                          ({db.sizeMB.toFixed(0)} MB)
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                onClick={runAnalysis} 
                disabled={!selectedInstance || !selectedDatabase || isAnalyzing}
              >
                {isAnalyzing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analizar Índices
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isAnalyzing && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <RefreshCw className="h-12 w-12 text-primary animate-spin" />
              <p className="text-lg font-medium">Analizando índices...</p>
              <p className="text-sm text-muted-foreground">
                Este proceso puede tomar varios segundos dependiendo del tamaño de la base de datos
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultados del Análisis */}
      {analysis && !isAnalyzing && (
        <>
          {/* Resumen KPIs */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-7">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Fragmentados</CardTitle>
                <ListTree className={`h-4 w-4 ${getKpiColor(analysis.summary.fragmentedCount, 5, 10)}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getKpiColor(analysis.summary.fragmentedCount, 5, 10)}`}>
                  {analysis.summary.fragmentedCount}
                </div>
                <p className="text-xs text-muted-foreground">&ge; 10% frag.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sin Uso</CardTitle>
                <Trash2 className={`h-4 w-4 ${getKpiColor(analysis.summary.unusedCount, 3, 5)}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getKpiColor(analysis.summary.unusedCount, 3, 5)}`}>
                  {analysis.summary.unusedCount}
                </div>
                <p className="text-xs text-muted-foreground">A eliminar</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Duplicados</CardTitle>
                <Layers className={`h-4 w-4 ${analysis.summary.duplicateCount > 0 ? 'text-warning' : 'text-emerald-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${analysis.summary.duplicateCount > 0 ? 'text-warning' : 'text-emerald-500'}`}>
                  {analysis.summary.duplicateCount}
                </div>
                <p className="text-xs text-muted-foreground">Redundantes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Faltantes</CardTitle>
                <TrendingUp className={`h-4 w-4 ${getKpiColor(analysis.summary.missingCount, 3, 5)}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getKpiColor(analysis.summary.missingCount, 3, 5)}`}>
                  {analysis.summary.missingCount}
                </div>
                <p className="text-xs text-muted-foreground">Sugeridos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Deshabilitados</CardTitle>
                <Ban className={`h-4 w-4 ${analysis.summary.disabledCount > 0 ? 'text-warning' : 'text-emerald-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${analysis.summary.disabledCount > 0 ? 'text-warning' : 'text-emerald-500'}`}>
                  {analysis.summary.disabledCount}
                </div>
                <p className="text-xs text-muted-foreground">Inactivos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Solapados</CardTitle>
                <Layers className={`h-4 w-4 ${analysis.summary.overlappingCount > 0 ? 'text-warning' : 'text-emerald-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${analysis.summary.overlappingCount > 0 ? 'text-warning' : 'text-emerald-500'}`}>
                  {analysis.summary.overlappingCount}
                </div>
                <p className="text-xs text-muted-foreground">Subconjuntos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Espacio Perdido</CardTitle>
                <AlertCircle className={`h-4 w-4 ${getKpiColor(analysis.summary.wastedSpaceMB, 500, 1000)}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${getKpiColor(analysis.summary.wastedSpaceMB, 500, 1000)}`}>
                  {analysis.summary.wastedSpaceMB.toFixed(0)}
                </div>
                <p className="text-xs text-muted-foreground">MB</p>
              </CardContent>
            </Card>
          </div>

          {/* Recomendaciones */}
          {analysis.summary.topRecommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Recomendaciones Prioritarias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.summary.topRecommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground font-bold">{i + 1}.</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Tabs de Análisis */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="overflow-x-auto pb-2">
              <TabsList className="inline-flex h-auto min-w-full gap-1 p-1">
                <TabsTrigger value="fragmented" className="text-xs whitespace-nowrap px-2 py-1.5">
                  Frag. ({analysis.fragmentedIndexes.length})
                </TabsTrigger>
                <TabsTrigger value="unused" className="text-xs whitespace-nowrap px-2 py-1.5">
                  Sin Uso ({analysis.unusedIndexes.length})
                </TabsTrigger>
                <TabsTrigger value="duplicate" className="text-xs whitespace-nowrap px-2 py-1.5">
                  Duplic. ({analysis.duplicateIndexes.length})
                </TabsTrigger>
                <TabsTrigger value="missing" className="text-xs whitespace-nowrap px-2 py-1.5">
                  Faltantes ({analysis.missingIndexes.length})
                </TabsTrigger>
                <TabsTrigger value="disabled" className="text-xs whitespace-nowrap px-2 py-1.5">
                  Deshab. ({analysis.disabledIndexes.length})
                </TabsTrigger>
                <TabsTrigger value="overlapping" className="text-xs whitespace-nowrap px-2 py-1.5">
                  Solap. ({analysis.overlappingIndexes.length})
                </TabsTrigger>
                <TabsTrigger value="bad" className="text-xs whitespace-nowrap px-2 py-1.5">
                  Probl. ({analysis.badIndexes.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab: Fragmentados */}
            <TabsContent value="fragmented">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ListTree className="h-5 w-5 text-warning" />
                      Índices Fragmentados
                    </CardTitle>
                    <CardDescription>
                      Índices con fragmentación &ge; 10%
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(analysis.fragmentedIndexes, 'fragmented_indexes')}
                    disabled={!analysis.fragmentedIndexes.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-auto">
                    {analysis.fragmentedIndexes.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Sin fragmentación significativa</h3>
                        <p className="text-muted-foreground">
                          No hay índices fragmentados significativamente.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabla</TableHead>
                            <TableHead>Índice</TableHead>
                            <TableHead className="text-right">Frag %</TableHead>
                            <TableHead className="text-right">Páginas</TableHead>
                            <TableHead className="text-right">Tamaño</TableHead>
                            <TableHead>Acción</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.fragmentedIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-medium text-sm">
                                {idx.indexName}
                                {idx.isPrimaryKey && <Badge variant="outline" className="ml-1 text-[10px]">PK</Badge>}
                              </TableCell>
                              <TableCell className={cn('text-right font-bold text-sm', {
                                'text-red-500': idx.fragmentationPct >= 30,
                                'text-warning': idx.fragmentationPct < 30,
                              })}>
                                {idx.fragmentationPct.toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">
                                {idx.pageCount.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell>
                                <Badge variant={idx.suggestion === 'REBUILD' ? 'destructive' : 'outline'} className={cn(
                                  idx.suggestion !== 'REBUILD' && 'bg-warning/10 text-warning border-warning/30'
                                )}>
                                  {idx.suggestion}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => copyToClipboard(
                                    idx.suggestion === 'REBUILD' ? idx.rebuildScript || '' : idx.reorganizeScript || '',
                                    idx.suggestion
                                  )}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Sin Uso */}
            <TabsContent value="unused">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Trash2 className="h-5 w-5 text-red-500" />
                      Índices Sin Uso
                    </CardTitle>
                    <CardDescription>
                      Índices que no han sido utilizados desde el último reinicio de SQL Server
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(analysis.unusedIndexes, 'unused_indexes')}
                    disabled={!analysis.unusedIndexes.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-auto">
                    {analysis.unusedIndexes.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Todos los índices están en uso</h3>
                        <p className="text-muted-foreground">
                          Todos los índices están siendo utilizados.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabla</TableHead>
                            <TableHead>Índice</TableHead>
                            <TableHead className="text-right">Updates</TableHead>
                            <TableHead className="text-right">Tamaño</TableHead>
                            <TableHead>Severidad</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.unusedIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-medium text-sm">{idx.indexName}</TableCell>
                              <TableCell className="text-right text-sm text-red-500">
                                {idx.userUpdates.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell>
                                <Badge variant={idx.severity === 'Crítico' ? 'destructive' : 'outline'} className={cn(
                                  idx.severity !== 'Crítico' && 'bg-warning/10 text-warning border-warning/30'
                                )}>
                                  {idx.severity}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => copyToClipboard(idx.dropScript || '', 'DROP')}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Duplicados */}
            <TabsContent value="duplicate">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-warning" />
                      Índices Duplicados
                    </CardTitle>
                    <CardDescription>
                      Índices con las mismas columnas clave que otros índices
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(analysis.duplicateIndexes, 'duplicate_indexes')}
                    disabled={!analysis.duplicateIndexes.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-auto">
                    {analysis.duplicateIndexes.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Sin duplicados</h3>
                        <p className="text-muted-foreground">
                          No hay índices duplicados.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabla</TableHead>
                            <TableHead>Índice</TableHead>
                            <TableHead>Duplicado de</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="text-right">Tamaño</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.duplicateIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-medium text-sm">{idx.indexName}</TableCell>
                              <TableCell className="text-sm text-warning">{idx.duplicateOfIndex}</TableCell>
                              <TableCell>
                                <Badge variant={idx.duplicateType === 'Exacto' ? 'destructive' : 'secondary'}>
                                  {idx.duplicateType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => copyToClipboard(idx.dropScript || '', 'DROP')}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Missing Indexes */}
            <TabsContent value="missing">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                      Missing Indexes
                    </CardTitle>
                    <CardDescription>
                      Índices sugeridos por SQL Server basados en el uso de queries
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(analysis.missingIndexes, 'missing_indexes')}
                    disabled={!analysis.missingIndexes.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-auto">
                    {analysis.missingIndexes.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Sin sugerencias</h3>
                        <p className="text-muted-foreground">
                          No hay índices faltantes sugeridos.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabla</TableHead>
                            <TableHead>Columnas</TableHead>
                            <TableHead className="text-right">Mejora</TableHead>
                            <TableHead>Severidad</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.missingIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="text-sm max-w-[150px] truncate" title={`${idx.equalityColumns || ''}${idx.inequalityColumns ? ' | ' + idx.inequalityColumns : ''}`}>
                                {idx.equalityColumns || idx.inequalityColumns || '-'}
                              </TableCell>
                              <TableCell className="text-right text-sm font-bold text-emerald-500">
                                {idx.improvementMeasure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </TableCell>
                              <TableCell>
                                <Badge variant={idx.severity === 'Crítico' ? 'destructive' : 'outline'} className={cn(
                                  idx.severity !== 'Crítico' && 'bg-warning/10 text-warning border-warning/30'
                                )}>
                                  {idx.severity}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => copyToClipboard(idx.createScript || '', 'CREATE INDEX')}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Deshabilitados */}
            <TabsContent value="disabled">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Ban className="h-5 w-5 text-cyan-500" />
                      Índices Deshabilitados
                    </CardTitle>
                    <CardDescription>
                      Índices que están deshabilitados y no están siendo utilizados
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(analysis.disabledIndexes, 'disabled_indexes')}
                    disabled={!analysis.disabledIndexes.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-auto">
                    {analysis.disabledIndexes.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Sin deshabilitados</h3>
                        <p className="text-muted-foreground">
                          No hay índices deshabilitados.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabla</TableHead>
                            <TableHead>Índice</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.disabledIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-medium text-sm">
                                {idx.indexName}
                                {idx.isPrimaryKey && <Badge variant="outline" className="ml-1 text-[10px]">PK</Badge>}
                              </TableCell>
                              <TableCell className="text-sm">{idx.indexType}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => copyToClipboard(idx.rebuildScript || '', 'REBUILD')}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Solapados */}
            <TabsContent value="overlapping">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-violet-500" />
                      Índices Solapados
                    </CardTitle>
                    <CardDescription>
                      Índices cuyas columnas clave son un subconjunto de otro índice
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(analysis.overlappingIndexes, 'overlapping_indexes')}
                    disabled={!analysis.overlappingIndexes.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-auto">
                    {analysis.overlappingIndexes.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Sin solapados</h3>
                        <p className="text-muted-foreground">
                          No hay índices solapados.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabla</TableHead>
                            <TableHead>Índice</TableHead>
                            <TableHead>Solapado por</TableHead>
                            <TableHead className="text-right">Tamaño</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.overlappingIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-medium text-sm">{idx.indexName}</TableCell>
                              <TableCell className="text-sm text-warning">{idx.overlappedByIndex}</TableCell>
                              <TableCell className="text-right text-sm">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => copyToClipboard(idx.dropScript || '', 'DROP')}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Problemáticos */}
            <TabsContent value="bad">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      Índices Problemáticos
                    </CardTitle>
                    <CardDescription>
                      Índices con problemas de diseño: muy anchos, demasiadas columnas, etc.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportToCSV(analysis.badIndexes, 'bad_indexes')}
                    disabled={!analysis.badIndexes.length}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[500px] overflow-auto">
                    {analysis.badIndexes.length === 0 ? (
                      <div className="text-center py-12">
                        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Sin problemas</h3>
                        <p className="text-muted-foreground">
                          No hay índices con problemas de diseño.
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tabla</TableHead>
                            <TableHead>Índice</TableHead>
                            <TableHead>Problema</TableHead>
                            <TableHead>Severidad</TableHead>
                            <TableHead>Recomendación</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.badIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-medium text-sm">{idx.indexName}</TableCell>
                              <TableCell>
                                <Badge variant={idx.problem === 'Muy Ancho' ? 'destructive' : 'secondary'}>
                                  {idx.problem}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={idx.severity === 'Crítico' ? 'destructive' : 'outline'} className={cn(
                                  idx.severity !== 'Crítico' && 'bg-warning/10 text-warning border-warning/30'
                                )}>
                                  {idx.severity}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm max-w-[200px]" title={idx.recommendation}>
                                {idx.recommendation}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Estado inicial (sin análisis) */}
      {!analysis && !isAnalyzing && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <ListTree className="h-16 w-16 text-muted-foreground opacity-50" />
              <div>
                <h3 className="text-lg font-semibold">Selecciona una instancia y base de datos</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Elige una instancia SQL Server y una base de datos para ejecutar el análisis de índices
                </p>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>El análisis incluye:</p>
                <ul className="list-disc list-inside text-left">
                  <li>Fragmentación de índices</li>
                  <li>Índices sin uso</li>
                  <li>Índices duplicados</li>
                  <li>Missing indexes sugeridos</li>
                  <li>Índices deshabilitados</li>
                  <li>Índices solapados/redundantes</li>
                  <li>Índices con problemas de diseño</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
