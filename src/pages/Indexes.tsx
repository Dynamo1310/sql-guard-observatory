import { useState, useEffect, useMemo } from 'react';
import { 
  ListTree, Database, Search, AlertTriangle, CheckCircle2, 
  Copy, Download, RefreshCw, Server, Filter,
  TrendingUp, Trash2, AlertCircle, Ban, Layers
} from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
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
      // Intentar con la API moderna primero
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback para contextos no seguros (HTTP)
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



  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <ListTree className="h-8 w-8 text-primary" />
            Análisis de Índices
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Análisis exhaustivo de índices: fragmentación, duplicados, sin uso, missing indexes y más
          </p>
        </div>
      </div>

      {/* Selectores */}
      <Card className="gradient-card shadow-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="h-5 w-5" />
            Seleccionar Instancia y Base de Datos
          </CardTitle>
          <CardDescription>
            Instancias filtradas: sin AWS, sin servidores DMZ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros de búsqueda */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">Buscar instancia</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Escribir nombre de instancia..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <label className="text-sm font-medium mb-2 block">Ambiente</label>
              <Select value={selectedAmbiente} onValueChange={setSelectedAmbiente}>
                <SelectTrigger>
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por ambiente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los ambientes</SelectItem>
                  {ambientes.map((amb) => (
                    <SelectItem key={amb} value={amb.toLowerCase()}>
                      {amb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selectores de Instancia y Base de Datos */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Selector de Instancia */}
            <div className="flex-1">
              <label className="text-sm font-medium mb-2 block">
                Instancia SQL Server 
                <span className="text-muted-foreground ml-1">
                  ({filteredInstances.length} de {instances.length})
                </span>
              </label>
              <Select
                value={selectedInstance}
                onValueChange={setSelectedInstance}
                disabled={isLoadingInstances || filteredInstances.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={
                    isLoadingInstances 
                      ? "Cargando instancias..." 
                      : filteredInstances.length === 0 
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

            {/* Selector de Base de Datos */}
            <div className="flex-1">
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

            {/* Botón de Análisis */}
            <div className="flex items-end">
              <Button 
                onClick={runAnalysis} 
                disabled={!selectedInstance || !selectedDatabase || isAnalyzing}
                className="w-full sm:w-auto"
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
        <Card className="gradient-card shadow-card">
          <CardContent className="py-8">
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
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            <KPICard
              title="Fragmentados"
              value={analysis.summary.fragmentedCount}
              icon={ListTree}
              description={`>= 10% frag.`}
              variant={analysis.summary.fragmentedCount > 10 ? 'warning' : 'default'}
            />
            <KPICard
              title="Sin Uso"
              value={analysis.summary.unusedCount}
              icon={Trash2}
              description="A eliminar"
              variant={analysis.summary.unusedCount > 5 ? 'critical' : 'default'}
            />
            <KPICard
              title="Duplicados"
              value={analysis.summary.duplicateCount}
              icon={Layers}
              variant={analysis.summary.duplicateCount > 0 ? 'warning' : 'success'}
            />
            <KPICard
              title="Faltantes"
              value={analysis.summary.missingCount}
              icon={TrendingUp}
              variant={analysis.summary.missingCount > 5 ? 'warning' : 'default'}
            />
            <KPICard
              title="Deshabilitados"
              value={analysis.summary.disabledCount}
              icon={Ban}
              variant={analysis.summary.disabledCount > 0 ? 'warning' : 'success'}
            />
            <KPICard
              title="Solapados"
              value={analysis.summary.overlappingCount}
              icon={Layers}
              variant={analysis.summary.overlappingCount > 0 ? 'warning' : 'success'}
            />
            <KPICard
              title="Espacio Perdido"
              value={`${analysis.summary.wastedSpaceMB.toFixed(0)} MB`}
              icon={AlertCircle}
              variant={analysis.summary.wastedSpaceMB > 1000 ? 'critical' : 'default'}
            />
          </div>

          {/* Recomendaciones */}
          {analysis.summary.topRecommendations.length > 0 && (
            <Card className="gradient-card shadow-card border-l-4 border-l-amber-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Recomendaciones Prioritarias
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.summary.topRecommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-amber-500 font-bold">{i + 1}.</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Tabs de Análisis */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
              <Card className="gradient-card shadow-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Índices Fragmentados</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                  {analysis.fragmentedIndexes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>No hay índices fragmentados significativamente</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs min-w-[120px]">Tabla</TableHead>
                            <TableHead className="text-xs min-w-[100px]">Índice</TableHead>
                            <TableHead className="text-xs text-right">Frag %</TableHead>
                            <TableHead className="text-xs text-right hidden sm:table-cell">Páginas</TableHead>
                            <TableHead className="text-xs text-right">Tamaño</TableHead>
                            <TableHead className="text-xs">Acción</TableHead>
                            <TableHead className="text-xs w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.fragmentedIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs p-2">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium p-2">
                                {idx.indexName}
                                {idx.isPrimaryKey && <Badge variant="outline" className="ml-1 text-[10px]">PK</Badge>}
                              </TableCell>
                              <TableCell className={`text-right font-mono text-xs font-bold p-2 ${
                                idx.fragmentationPct >= 30 ? 'text-red-500' : 'text-yellow-500'
                              }`}>
                                {idx.fragmentationPct.toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs p-2 hidden sm:table-cell">
                                {idx.pageCount.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs p-2">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell className="p-2">
                                <StatusBadge status={idx.suggestion === 'REBUILD' ? 'critical' : 'warning'}>
                                  {idx.suggestion}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="p-2">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Sin Uso */}
            <TabsContent value="unused">
              <Card className="gradient-card shadow-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Índices Sin Uso</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                  {analysis.unusedIndexes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>Todos los índices están siendo utilizados</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs min-w-[120px]">Tabla</TableHead>
                            <TableHead className="text-xs min-w-[100px]">Índice</TableHead>
                            <TableHead className="text-xs text-right">Updates</TableHead>
                            <TableHead className="text-xs text-right">Tamaño</TableHead>
                            <TableHead className="text-xs">Severidad</TableHead>
                            <TableHead className="text-xs w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.unusedIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs p-2">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium p-2">
                                {idx.indexName}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs text-red-500 p-2">
                                {idx.userUpdates.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs p-2">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell className="p-2">
                                <StatusBadge status={idx.severity === 'Crítico' ? 'critical' : 'warning'}>
                                  {idx.severity}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="p-2">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Duplicados */}
            <TabsContent value="duplicate">
              <Card className="gradient-card shadow-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Índices Duplicados</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                  {analysis.duplicateIndexes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>No hay índices duplicados</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs min-w-[120px]">Tabla</TableHead>
                            <TableHead className="text-xs min-w-[100px]">Índice</TableHead>
                            <TableHead className="text-xs">Duplicado de</TableHead>
                            <TableHead className="text-xs">Tipo</TableHead>
                            <TableHead className="text-xs text-right">Tamaño</TableHead>
                            <TableHead className="text-xs w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.duplicateIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs p-2">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium p-2">
                                {idx.indexName}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-amber-500 p-2">
                                {idx.duplicateOfIndex}
                              </TableCell>
                              <TableCell className="p-2">
                                <Badge variant={idx.duplicateType === 'Exacto' ? 'destructive' : 'secondary'}>
                                  {idx.duplicateType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs p-2">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell className="p-2">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Missing Indexes */}
            <TabsContent value="missing">
              <Card className="gradient-card shadow-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Missing Indexes</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                  {analysis.missingIndexes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>No hay índices faltantes sugeridos</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs min-w-[120px]">Tabla</TableHead>
                            <TableHead className="text-xs">Columnas</TableHead>
                            <TableHead className="text-xs text-right">Mejora</TableHead>
                            <TableHead className="text-xs">Severidad</TableHead>
                            <TableHead className="text-xs w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.missingIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs p-2">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="text-xs p-2 max-w-[150px] truncate" title={`${idx.equalityColumns || ''}${idx.inequalityColumns ? ' | ' + idx.inequalityColumns : ''}`}>
                                {idx.equalityColumns || idx.inequalityColumns || '-'}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs font-bold text-green-500 p-2">
                                {idx.improvementMeasure.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </TableCell>
                              <TableCell className="p-2">
                                <StatusBadge status={
                                  idx.severity === 'Crítico' ? 'critical' : 
                                  idx.severity === 'Advertencia' ? 'warning' : 'success'
                                }>
                                  {idx.severity}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="p-2">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Deshabilitados */}
            <TabsContent value="disabled">
              <Card className="gradient-card shadow-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Índices Deshabilitados</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                  {analysis.disabledIndexes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>No hay índices deshabilitados</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs min-w-[120px]">Tabla</TableHead>
                            <TableHead className="text-xs min-w-[100px]">Índice</TableHead>
                            <TableHead className="text-xs">Tipo</TableHead>
                            <TableHead className="text-xs w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.disabledIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs p-2">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium p-2">
                                {idx.indexName}
                                {idx.isPrimaryKey && <Badge variant="outline" className="ml-1 text-[10px]">PK</Badge>}
                              </TableCell>
                              <TableCell className="text-xs p-2">{idx.indexType}</TableCell>
                              <TableCell className="p-2">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Solapados */}
            <TabsContent value="overlapping">
              <Card className="gradient-card shadow-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Índices Solapados</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                  {analysis.overlappingIndexes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>No hay índices solapados</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs min-w-[120px]">Tabla</TableHead>
                            <TableHead className="text-xs min-w-[100px]">Índice</TableHead>
                            <TableHead className="text-xs">Solapado por</TableHead>
                            <TableHead className="text-xs text-right">Tamaño</TableHead>
                            <TableHead className="text-xs w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.overlappingIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs p-2">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium p-2">
                                {idx.indexName}
                              </TableCell>
                              <TableCell className="font-mono text-xs text-amber-500 p-2">
                                {idx.overlappedByIndex}
                              </TableCell>
                              <TableCell className="text-right font-mono text-xs p-2">
                                {idx.sizeMB.toFixed(1)} MB
                              </TableCell>
                              <TableCell className="p-2">
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
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab: Problemáticos */}
            <TabsContent value="bad">
              <Card className="gradient-card shadow-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Índices Problemáticos</CardTitle>
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
                <CardContent className="p-0 sm:p-6">
                  {analysis.badIndexes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                      <p>No hay índices con problemas de diseño</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs min-w-[120px]">Tabla</TableHead>
                            <TableHead className="text-xs min-w-[100px]">Índice</TableHead>
                            <TableHead className="text-xs">Problema</TableHead>
                            <TableHead className="text-xs">Severidad</TableHead>
                            <TableHead className="text-xs hidden sm:table-cell">Recomendación</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analysis.badIndexes.map((idx, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs p-2">
                                <span className="text-muted-foreground">{idx.schemaName}.</span>{idx.tableName}
                              </TableCell>
                              <TableCell className="font-mono text-xs font-medium p-2">
                                {idx.indexName}
                              </TableCell>
                              <TableCell className="p-2">
                                <Badge variant={idx.problem === 'Muy Ancho' ? 'destructive' : 'secondary'}>
                                  {idx.problem}
                                </Badge>
                              </TableCell>
                              <TableCell className="p-2">
                                <StatusBadge status={idx.severity === 'Crítico' ? 'critical' : 'warning'}>
                                  {idx.severity}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className="text-xs p-2 max-w-[200px] hidden sm:table-cell" title={idx.recommendation}>
                                {idx.recommendation}
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
          </Tabs>
        </>
      )}

      {/* Estado inicial (sin análisis) */}
      {!analysis && !isAnalyzing && (
        <Card className="gradient-card shadow-card">
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
