import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowRightLeft, Search, Server, Database, KeyRound, Link2, Briefcase,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, Download, Filter,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import {
  serverComparisonApi,
  ComparisonInstanceDto,
  ServerComparisonResponse,
  ServerObjectsDto,
  DuplicateGroupDto,
} from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ExcelJS from 'exceljs';

type SortDirection = 'asc' | 'desc';

export default function ServerComparison() {
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ambienteFilter, setAmbienteFilter] = useState<string>('all');
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [activeTab, setActiveTab] = useState('databases');
  const [sortField, setSortField] = useState<string>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');

  const { data: instances, isLoading: loadingInstances } = useQuery({
    queryKey: ['server-comparison-instances'],
    queryFn: () => serverComparisonApi.getInstances(),
    staleTime: 5 * 60 * 1000,
  });

  const compareMutation = useMutation({
    mutationFn: (names: string[]) => serverComparisonApi.compare(names),
    onError: (error: Error) => {
      toast.error('Error al comparar servidores: ' + error.message);
    },
  });

  const result = compareMutation.data;

  const ambientes = useMemo(() => {
    if (!instances) return [];
    const set = new Set(instances.map(i => i.ambiente).filter(Boolean));
    return Array.from(set).sort();
  }, [instances]);

  const filteredInstances = useMemo(() => {
    if (!instances) return [];
    return instances.filter(i => {
      const matchSearch = !searchQuery ||
        i.nombreInstancia.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.serverName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchAmbiente = ambienteFilter === 'all' || i.ambiente === ambienteFilter;
      return matchSearch && matchAmbiente;
    });
  }, [instances, searchQuery, ambienteFilter]);

  const toggleInstance = useCallback((name: string) => {
    setSelectedInstances(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  }, []);

  const handleCompare = useCallback(() => {
    if (selectedInstances.length < 2) {
      toast.warning('Seleccioná al menos 2 instancias para comparar');
      return;
    }
    compareMutation.mutate(selectedInstances);
  }, [selectedInstances, compareMutation]);

  const requestSort = useCallback((field: string) => {
    setSortDir(prev => sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc');
    setSortField(field);
  }, [sortField]);

  const getSortIndicator = useCallback((field: string) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp className="inline h-3 w-3 ml-1" />
      : <ChevronDown className="inline h-3 w-3 ml-1" />;
  }, [sortField, sortDir]);

  const duplicateNames = useMemo(() => {
    if (!result) return new Set<string>();
    return new Set(
      result.duplicates
        .filter(d => {
          if (activeTab === 'databases') return d.objectType === 'Database';
          if (activeTab === 'logins') return d.objectType === 'Login';
          if (activeTab === 'linkedservers') return d.objectType === 'LinkedServer';
          if (activeTab === 'jobs') return d.objectType === 'Job';
          return false;
        })
        .map(d => d.objectName.toLowerCase())
    );
  }, [result, activeTab]);

  const buildMatrixRows = useCallback(<T extends { name: string }>(
    servers: ServerObjectsDto[],
    extractor: (s: ServerObjectsDto) => T[],
    extraColumns: (item: T) => Record<string, string | number | boolean | null | undefined>
  ) => {
    const allNames = new Map<string, Map<string, T>>();

    for (const server of servers.filter(s => s.connectionSuccess)) {
      for (const item of extractor(server)) {
        const key = item.name.toLowerCase();
        if (!allNames.has(key)) allNames.set(key, new Map());
        allNames.get(key)!.set(server.instanceName, item);
      }
    }

    let rows = Array.from(allNames.entries()).map(([key, serverMap]) => ({
      name: Array.from(serverMap.values())[0].name,
      key,
      isDuplicate: serverMap.size > 1,
      serverPresence: servers.filter(s => s.connectionSuccess).map(s => ({
        instanceName: s.instanceName,
        present: serverMap.has(s.instanceName),
        item: serverMap.get(s.instanceName),
      })),
      extra: extraColumns(Array.from(serverMap.values())[0]),
    }));

    if (showOnlyDuplicates) {
      rows = rows.filter(r => r.isDuplicate);
    }

    rows.sort((a, b) => {
      if (sortField === 'name') {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      if (sortField === 'duplicate') {
        const va = a.isDuplicate ? 1 : 0;
        const vb = b.isDuplicate ? 1 : 0;
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const ea = a.extra[sortField];
      const eb = b.extra[sortField];
      const sa = ea == null ? '' : String(ea);
      const sb = eb == null ? '' : String(eb);
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });

    return rows;
  }, [showOnlyDuplicates, sortField, sortDir]);

  const handleExportExcel = useCallback(async () => {
    if (!result) return;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SQL Guard Observatory';
    workbook.created = new Date();

    const connectedServers = result.servers.filter(s => s.connectionSuccess);
    const serverNames = connectedServers.map(s => s.instanceName);

    const addSheet = <T extends { name: string }>(
      sheetName: string,
      extractor: (s: ServerObjectsDto) => T[],
      extraCols: { header: string; key: keyof T }[]
    ) => {
      const sheet = workbook.addWorksheet(sheetName);
      const columns: Partial<ExcelJS.Column>[] = [
        { header: 'Nombre', key: 'name', width: 35 },
        { header: 'Duplicado', key: 'duplicate', width: 12 },
        ...extraCols.map(c => ({ header: c.header, key: c.key as string, width: 20 })),
        ...serverNames.map(s => ({ header: s, key: s, width: 15 })),
      ];
      sheet.columns = columns;

      const allItems = new Map<string, Map<string, T>>();
      for (const server of connectedServers) {
        for (const item of extractor(server)) {
          const key = item.name.toLowerCase();
          if (!allItems.has(key)) allItems.set(key, new Map());
          allItems.get(key)!.set(server.instanceName, item);
        }
      }

      for (const [, serverMap] of allItems) {
        const firstItem = Array.from(serverMap.values())[0];
        const isDup = serverMap.size > 1;
        const rowData: Record<string, unknown> = {
          name: firstItem.name,
          duplicate: isDup ? 'SI' : '',
        };
        for (const col of extraCols) {
          rowData[col.key as string] = firstItem[col.key];
        }
        for (const sn of serverNames) {
          rowData[sn] = serverMap.has(sn) ? 'X' : '';
        }
        const row = sheet.addRow(rowData);
        if (isDup) {
          row.eachCell(cell => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFF3CD' },
            };
          });
        }
      }

      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    };

    addSheet('Databases', s => s.databases, [
      { header: 'Estado', key: 'state' as never },
      { header: 'Recovery Model', key: 'recoveryModel' as never },
      { header: 'Tamaño MB', key: 'sizeMB' as never },
    ]);

    addSheet('Logins', s => s.logins, [
      { header: 'Tipo', key: 'type' as never },
      { header: 'Deshabilitado', key: 'isDisabled' as never },
    ]);

    addSheet('Linked Servers', s => s.linkedServers, [
      { header: 'Provider', key: 'provider' as never },
      { header: 'Data Source', key: 'dataSource' as never },
    ]);

    addSheet('Jobs', s => s.jobs, [
      { header: 'Habilitado', key: 'enabled' as never },
      { header: 'Owner', key: 'ownerLoginName' as never },
    ]);

    const summarySheet = workbook.addWorksheet('Resumen');
    summarySheet.columns = [
      { header: 'Métrica', key: 'metric', width: 30 },
      { header: 'Valor', key: 'value', width: 15 },
    ];
    summarySheet.addRows([
      { metric: 'Servidores Comparados', value: result.summary.totalServers },
      { metric: 'Servidores Conectados', value: result.summary.serversConnected },
      { metric: 'Servidores Fallidos', value: result.summary.serversFailed },
      { metric: '', value: '' },
      { metric: 'Total Databases', value: result.summary.totalDatabases },
      { metric: 'Databases Duplicados', value: result.summary.duplicateDatabases },
      { metric: 'Total Logins', value: result.summary.totalLogins },
      { metric: 'Logins Duplicados', value: result.summary.duplicateLogins },
      { metric: 'Total Linked Servers', value: result.summary.totalLinkedServers },
      { metric: 'Linked Servers Duplicados', value: result.summary.duplicateLinkedServers },
      { metric: 'Total Jobs', value: result.summary.totalJobs },
      { metric: 'Jobs Duplicados', value: result.summary.duplicateJobs },
    ]);
    summarySheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Comparativa_Servidores_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Exportación completada');
  }, [result]);

  const connectedServers = result?.servers.filter(s => s.connectionSuccess) ?? [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="h-8 w-8" />
            Comparativa de Servidores
          </h1>
          <p className="text-muted-foreground">
            Detectá objetos duplicados entre instancias SQL Server antes de consolidar servidores
          </p>
        </div>
        {result && (
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        )}
      </div>

      {/* Selector de servidores */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5" />
            Seleccionar Instancias a Comparar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar instancia..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={ambienteFilter} onValueChange={setAmbienteFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los ambientes</SelectItem>
                {ambientes.map(a => (
                  <SelectItem key={a} value={a!}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleCompare}
              disabled={selectedInstances.length < 2 || compareMutation.isPending}
            >
              {compareMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4 mr-2" />
              )}
              Comparar ({selectedInstances.length})
            </Button>
          </div>

          {selectedInstances.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedInstances.map(name => (
                <Badge
                  key={name}
                  variant="secondary"
                  className="cursor-pointer hover:bg-destructive/20"
                  onClick={() => toggleInstance(name)}
                >
                  {name} <XCircle className="h-3 w-3 ml-1" />
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6"
                onClick={() => setSelectedInstances([])}
              >
                Limpiar todo
              </Button>
            </div>
          )}

          {loadingInstances ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[250px] border rounded-md p-2">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                {filteredInstances.map(instance => {
                  const isSelected = selectedInstances.includes(instance.nombreInstancia);
                  return (
                    <div
                      key={instance.id}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors text-sm',
                        isSelected
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-accent border border-transparent'
                      )}
                      onClick={() => toggleInstance(instance.nombreInstancia)}
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{instance.nombreInstancia}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {instance.ambiente} - {instance.majorVersion || 'N/A'} - {instance.edition || 'N/A'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredInstances.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No se encontraron instancias con los filtros actuales
                </div>
              )}
            </ScrollArea>
          )}

          <div className="text-xs text-muted-foreground">
            {filteredInstances.length} instancia(s) disponible(s) | {selectedInstances.length} seleccionada(s)
          </div>
        </CardContent>
      </Card>

      {/* Errores de conexión */}
      {result && result.servers.some(s => !s.connectionSuccess) && (
        <Card className="border-warning">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
              <div>
                <p className="font-medium text-warning">Conexión fallida en algunos servidores</p>
                <ul className="mt-1 text-sm text-muted-foreground space-y-1">
                  {result.servers.filter(s => !s.connectionSuccess).map(s => (
                    <li key={s.instanceName}>
                      <span className="font-medium">{s.instanceName}</span>: {s.errorMessage}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {compareMutation.isPending && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-lg font-medium">Conectando a las instancias y recolectando objetos...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Consultando sys.databases, sys.server_principals, sys.servers y msdb.dbo.sysjobs
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Resultados */}
      {result && !compareMutation.isPending && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={Database}
              title="Databases"
              total={result.summary.totalDatabases}
              duplicates={result.summary.duplicateDatabases}
              color="text-blue-500"
            />
            <SummaryCard
              icon={KeyRound}
              title="Logins"
              total={result.summary.totalLogins}
              duplicates={result.summary.duplicateLogins}
              color="text-violet-500"
            />
            <SummaryCard
              icon={Link2}
              title="Linked Servers"
              total={result.summary.totalLinkedServers}
              duplicates={result.summary.duplicateLinkedServers}
              color="text-cyan-500"
            />
            <SummaryCard
              icon={Briefcase}
              title="SQL Agent Jobs"
              total={result.summary.totalJobs}
              duplicates={result.summary.duplicateJobs}
              color="text-orange-500"
            />
          </div>

          {/* Connection status */}
          <div className="flex flex-wrap gap-2">
            {result.servers.map(s => (
              <Badge
                key={s.instanceName}
                variant="outline"
                className={cn(
                  'text-xs',
                  s.connectionSuccess
                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
                )}
              >
                {s.connectionSuccess ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                {s.instanceName}
                {s.connectionSuccess && (
                  <span className="ml-1 opacity-70">
                    ({s.databases.length}db / {s.logins.length}lg / {s.linkedServers.length}ls / {s.jobs.length}j)
                  </span>
                )}
              </Badge>
            ))}
          </div>

          <Separator />

          {/* Filter duplicates */}
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Button
              variant={showOnlyDuplicates ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              {showOnlyDuplicates ? 'Mostrando solo duplicados' : 'Mostrar solo duplicados'}
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="databases" className="gap-1.5">
                <Database className="h-3.5 w-3.5" />
                Databases
                {result.summary.duplicateDatabases > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                    {result.summary.duplicateDatabases}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="logins" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Logins
                {result.summary.duplicateLogins > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                    {result.summary.duplicateLogins}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="linkedservers" className="gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Linked Servers
                {result.summary.duplicateLinkedServers > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                    {result.summary.duplicateLinkedServers}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="jobs" className="gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                Jobs
                {result.summary.duplicateJobs > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-[10px]">
                    {result.summary.duplicateJobs}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="databases">
              <ComparisonTable
                servers={connectedServers}
                extractor={s => s.databases}
                extraColumns={item => ({
                  state: item.state,
                  recoveryModel: item.recoveryModel,
                  sizeMB: item.sizeMB,
                  collation: item.collation,
                })}
                columns={[
                  { key: 'state', label: 'Estado' },
                  { key: 'recoveryModel', label: 'Recovery' },
                  { key: 'sizeMB', label: 'Tamaño MB' },
                  { key: 'collation', label: 'Collation' },
                ]}
                duplicateNames={duplicateNames}
                showOnlyDuplicates={showOnlyDuplicates}
                buildMatrixRows={buildMatrixRows}
                sortField={sortField}
                sortDir={sortDir}
                requestSort={requestSort}
                getSortIndicator={getSortIndicator}
              />
            </TabsContent>

            <TabsContent value="logins">
              <ComparisonTable
                servers={connectedServers}
                extractor={s => s.logins}
                extraColumns={item => ({
                  type: item.type,
                  isDisabled: item.isDisabled ? 'Sí' : 'No',
                  defaultDatabase: item.defaultDatabase,
                })}
                columns={[
                  { key: 'type', label: 'Tipo' },
                  { key: 'isDisabled', label: 'Deshabilitado' },
                  { key: 'defaultDatabase', label: 'DB por defecto' },
                ]}
                duplicateNames={duplicateNames}
                showOnlyDuplicates={showOnlyDuplicates}
                buildMatrixRows={buildMatrixRows}
                sortField={sortField}
                sortDir={sortDir}
                requestSort={requestSort}
                getSortIndicator={getSortIndicator}
              />
            </TabsContent>

            <TabsContent value="linkedservers">
              <ComparisonTable
                servers={connectedServers}
                extractor={s => s.linkedServers}
                extraColumns={item => ({
                  provider: item.provider,
                  dataSource: item.dataSource,
                  product: item.product,
                })}
                columns={[
                  { key: 'provider', label: 'Provider' },
                  { key: 'dataSource', label: 'Data Source' },
                  { key: 'product', label: 'Product' },
                ]}
                duplicateNames={duplicateNames}
                showOnlyDuplicates={showOnlyDuplicates}
                buildMatrixRows={buildMatrixRows}
                sortField={sortField}
                sortDir={sortDir}
                requestSort={requestSort}
                getSortIndicator={getSortIndicator}
              />
            </TabsContent>

            <TabsContent value="jobs">
              <ComparisonTable
                servers={connectedServers}
                extractor={s => s.jobs}
                extraColumns={item => ({
                  enabled: item.enabled ? 'Sí' : 'No',
                  ownerLoginName: item.ownerLoginName,
                  description: item.description && item.description.length > 50
                    ? item.description.slice(0, 50) + '...'
                    : item.description,
                })}
                columns={[
                  { key: 'enabled', label: 'Habilitado' },
                  { key: 'ownerLoginName', label: 'Owner' },
                  { key: 'description', label: 'Descripción' },
                ]}
                duplicateNames={duplicateNames}
                showOnlyDuplicates={showOnlyDuplicates}
                buildMatrixRows={buildMatrixRows}
                sortField={sortField}
                sortDir={sortDir}
                requestSort={requestSort}
                getSortIndicator={getSortIndicator}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  total,
  duplicates,
  color,
}: {
  icon: React.ElementType;
  title: string;
  total: number;
  duplicates: number;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', color)} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', color)}>{total}</div>
        <p className="text-xs text-muted-foreground mt-1">
          {duplicates > 0 ? (
            <span className="text-warning font-medium">{duplicates} duplicado(s)</span>
          ) : (
            <span className="text-green-600 dark:text-green-400">Sin duplicados</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function ComparisonTable<T extends { name: string }>({
  servers,
  extractor,
  extraColumns,
  columns,
  duplicateNames,
  showOnlyDuplicates,
  buildMatrixRows,
  sortField,
  sortDir,
  requestSort,
  getSortIndicator,
}: {
  servers: ServerObjectsDto[];
  extractor: (s: ServerObjectsDto) => T[];
  extraColumns: (item: T) => Record<string, string | number | boolean | null | undefined>;
  columns: { key: string; label: string }[];
  duplicateNames: Set<string>;
  showOnlyDuplicates: boolean;
  buildMatrixRows: <U extends { name: string }>(
    servers: ServerObjectsDto[],
    extractor: (s: ServerObjectsDto) => U[],
    extraColumns: (item: U) => Record<string, string | number | boolean | null | undefined>
  ) => Array<{
    name: string;
    key: string;
    isDuplicate: boolean;
    serverPresence: Array<{
      instanceName: string;
      present: boolean;
      item: U | undefined;
    }>;
    extra: Record<string, string | number | boolean | null | undefined>;
  }>;
  sortField: string;
  sortDir: SortDirection;
  requestSort: (field: string) => void;
  getSortIndicator: (field: string) => React.ReactNode;
}) {
  const rows = buildMatrixRows(servers, extractor, extraColumns);

  if (servers.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No hay servidores conectados para mostrar
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-sm text-muted-foreground mb-3">
          {rows.length} objeto(s)
          {showOnlyDuplicates && ' (filtrado: solo duplicados)'}
        </div>
        <div className="max-h-[600px] overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-accent sticky left-0 bg-background z-10 min-w-[200px]"
                  onClick={() => requestSort('name')}
                >
                  Nombre {getSortIndicator('name')}
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-accent w-[80px] text-center"
                  onClick={() => requestSort('duplicate')}
                >
                  Dup. {getSortIndicator('duplicate')}
                </TableHead>
                {columns.map(col => (
                  <TableHead
                    key={col.key}
                    className="cursor-pointer hover:bg-accent"
                    onClick={() => requestSort(col.key)}
                  >
                    {col.label} {getSortIndicator(col.key)}
                  </TableHead>
                ))}
                {servers.map(s => (
                  <TableHead key={s.instanceName} className="text-center min-w-[100px]">
                    <div className="text-xs font-medium truncate">{s.instanceName}</div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3 + columns.length + servers.length} className="text-center py-8 text-muted-foreground">
                    {showOnlyDuplicates
                      ? 'No se encontraron duplicados en esta categoría'
                      : 'No hay objetos para mostrar'}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(row => (
                  <TableRow
                    key={row.key}
                    className={cn(
                      row.isDuplicate && 'bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100/60 dark:hover:bg-amber-950/30'
                    )}
                  >
                    <TableCell className="font-medium sticky left-0 bg-inherit z-10">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.isDuplicate && (
                        <Badge
                          variant="outline"
                          className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 text-[10px] px-1.5"
                        >
                          DUP
                        </Badge>
                      )}
                    </TableCell>
                    {columns.map(col => (
                      <TableCell key={col.key} className="text-sm text-muted-foreground">
                        {row.extra[col.key] != null ? String(row.extra[col.key]) : '-'}
                      </TableCell>
                    ))}
                    {row.serverPresence.map(sp => (
                      <TableCell key={sp.instanceName} className="text-center">
                        {sp.present ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground/30">-</span>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
