/**
 * Página de Inventario de Bases de Datos SQL Server
 * Con caché local y paginación del lado del servidor
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Search, HardDrive, CheckCircle2, AlertCircle, Clock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, FileSpreadsheet, Server, Check } from 'lucide-react';
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { sqlServerInventoryApi, CacheMetadata, PaginationInfo, ServerSummary } from '@/services/sqlServerInventoryApi';
import { SqlServerDatabase } from '@/types';

// Formatear tamaño en MB a formato legible
const formatSize = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
};

// Color por estado de la base de datos
const getStatusColor = (status: string): string => {
  switch (status.toUpperCase()) {
    case 'ONLINE':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    case 'OFFLINE':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    case 'RESTORING':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
    case 'RECOVERING':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    case 'SUSPECT':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
  }
};

// Color por recovery model
const getRecoveryModelColor = (model: string): string => {
  switch (model.toUpperCase()) {
    case 'FULL':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    case 'SIMPLE':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    case 'BULK_LOGGED':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
  }
};

// Opciones de tamaño de página
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function SqlServerDatabases() {
  const [databases, setDatabases] = useState<SqlServerDatabase[]>([]);
  const [cacheInfo, setCacheInfo] = useState<CacheMetadata | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  // Estados de filtros
  const [selectedServer, setSelectedServer] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedRecoveryModel, setSelectedRecoveryModel] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Estados para exportación
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [serverList, setServerList] = useState<ServerSummary[]>([]);
  const [selectedServersForExport, setSelectedServersForExport] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [loadingServers, setLoadingServers] = useState(false);
  const [serverSearchQuery, setServerSearchQuery] = useState('');

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Cargar datos desde el caché con paginación
  const fetchData = useCallback(async (page: number = 1, pageSize: number = 50) => {
    setLoading(true);
    try {
      const response = await sqlServerInventoryApi.getDatabases({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        server: selectedServer !== 'All' ? selectedServer : undefined,
        status: selectedStatus !== 'All' ? selectedStatus : undefined,
        recoveryModel: selectedRecoveryModel !== 'All' ? selectedRecoveryModel : undefined,
      });
      setDatabases(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error al cargar bases de datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las bases de datos SQL Server',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedServer, selectedStatus, selectedRecoveryModel, toast]);

  // Actualizar desde la API externa
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await sqlServerInventoryApi.refreshDatabases();
      setDatabases(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
      toast({
        title: 'Inventario actualizado',
        description: `Se actualizó el inventario con ${response.cacheInfo.recordCount || response.data.length} bases de datos`,
      });
      // Recargar la página actual con filtros
      fetchData(1, pagination.pageSize);
    } catch (error) {
      console.error('Error al actualizar bases de datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el inventario desde el servidor',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [toast, fetchData, pagination.pageSize]);

  // Cargar datos al cambiar filtros
  useEffect(() => {
    fetchData(pagination.page, pagination.pageSize);
  }, [debouncedSearch, selectedServer, selectedStatus, selectedRecoveryModel]);

  // Cargar datos iniciales
  useEffect(() => {
    fetchData(1, 50);
  }, []);

  // Cargar lista de servidores cuando se abre el diálogo de exportación
  const loadServers = useCallback(async () => {
    if (serverList.length > 0) return; // Ya cargados
    setLoadingServers(true);
    try {
      const servers = await sqlServerInventoryApi.getServers();
      setServerList(servers);
    } catch (error) {
      console.error('Error al cargar servidores:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la lista de servidores',
        variant: 'destructive',
      });
    } finally {
      setLoadingServers(false);
    }
  }, [serverList.length, toast]);

  // Cargar servidores al abrir el diálogo
  useEffect(() => {
    if (exportDialogOpen) {
      loadServers();
    }
  }, [exportDialogOpen, loadServers]);

  // Filtrar servidores por búsqueda
  const filteredServers = useMemo(() => {
    if (!serverSearchQuery) return serverList;
    const query = serverSearchQuery.toLowerCase();
    return serverList.filter(
      s => s.serverName.toLowerCase().includes(query) || s.ambiente.toLowerCase().includes(query)
    );
  }, [serverList, serverSearchQuery]);

  // Agrupar servidores por ambiente
  const serversByAmbiente = useMemo(() => {
    const grouped: Record<string, ServerSummary[]> = {};
    filteredServers.forEach(server => {
      const ambiente = server.ambiente || 'Sin ambiente';
      if (!grouped[ambiente]) grouped[ambiente] = [];
      grouped[ambiente].push(server);
    });
    return grouped;
  }, [filteredServers]);

  // Toggle selección de servidor
  const toggleServerSelection = (serverName: string) => {
    setSelectedServersForExport(prev => 
      prev.includes(serverName)
        ? prev.filter(s => s !== serverName)
        : [...prev, serverName]
    );
  };

  // Seleccionar/deseleccionar todos los servidores de un ambiente
  const toggleAmbiente = (ambiente: string) => {
    const ambienteServers = serversByAmbiente[ambiente]?.map(s => s.serverName) || [];
    const allSelected = ambienteServers.every(s => selectedServersForExport.includes(s));
    
    if (allSelected) {
      setSelectedServersForExport(prev => prev.filter(s => !ambienteServers.includes(s)));
    } else {
      setSelectedServersForExport(prev => [...new Set([...prev, ...ambienteServers])]);
    }
  };

  // Seleccionar/deseleccionar todos
  const toggleSelectAll = () => {
    if (selectedServersForExport.length === filteredServers.length) {
      setSelectedServersForExport([]);
    } else {
      setSelectedServersForExport(filteredServers.map(s => s.serverName));
    }
  };

  // Exportar a Excel
  const exportToExcel = async () => {
    if (selectedServersForExport.length === 0) {
      toast({
        title: 'Selecciona servidores',
        description: 'Debes seleccionar al menos un servidor para exportar',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      toast({
        title: 'Generando Excel',
        description: `Exportando bases de datos de ${selectedServersForExport.length} servidor(es)...`,
      });

      // Obtener datos para exportar
      const exportData = await sqlServerInventoryApi.getDatabasesForExport(selectedServersForExport);

      // Importar exceljs dinámicamente
      const ExcelJS = await import('exceljs');
      
      // Crear workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SQL Guard Observatory';
      workbook.created = new Date();

      // Crear una hoja por cada servidor
      const usedSheetNames = new Set<string>();
      for (const serverData of exportData.servers) {
        // Limpiar nombre del servidor para usarlo como nombre de hoja (max 31 chars)
        let sheetName = serverData.serverName
          .replace(/[\\/*?[\]:]/g, '_')
          .substring(0, 31);

        if (usedSheetNames.has(sheetName)) {
          let counter = 2;
          let candidate: string;
          do {
            const suffix = `_${counter}`;
            candidate = sheetName.substring(0, 31 - suffix.length) + suffix;
            counter++;
          } while (usedSheetNames.has(candidate));
          sheetName = candidate;
        }
        usedSheetNames.add(sheetName);
        
        const worksheet = workbook.addWorksheet(sheetName);

        // Configurar anchos de columna
        worksheet.columns = [
          { header: 'Base de Datos', key: 'dbName', width: 30 },
          { header: 'Estado', key: 'status', width: 12 },
          { header: 'Tamaño (MB)', key: 'dataMB', width: 15 },
          { header: 'Recovery Model', key: 'recoveryModel', width: 15 },
          { header: 'Compatibilidad', key: 'compatibilityLevel', width: 18 },
          { header: 'Collation', key: 'collation', width: 25 },
          { header: 'Fecha Creación', key: 'creationDate', width: 18 },
          { header: 'Archivos', key: 'dataFiles', width: 10 },
          { header: 'Acceso', key: 'userAccess', width: 15 },
          { header: 'Solo Lectura', key: 'readOnly', width: 12 },
          { header: 'Auto Shrink', key: 'autoShrink', width: 12 },
          { header: 'Auto Close', key: 'autoClose', width: 12 },
        ];

        // Estilo del header
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0066CC' },
        };
        headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

        // Agregar datos
        serverData.databases.forEach(db => {
          worksheet.addRow({
            dbName: db.dbName,
            status: db.status,
            dataMB: db.dataMB,
            recoveryModel: db.recoveryModel,
            compatibilityLevel: db.compatibilityLevel?.replace('SQL Server ', '') || '',
            collation: db.collation,
            creationDate: db.creationDate ? new Date(db.creationDate).toLocaleDateString('es-ES') : '',
            dataFiles: db.dataFiles,
            userAccess: db.userAccess,
            readOnly: db.readOnly ? 'Sí' : 'No',
            autoShrink: db.autoShrink ? 'Sí' : 'No',
            autoClose: db.autoClose ? 'Sí' : 'No',
          });
        });

        // Agregar bordes y alternar colores
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            row.eachCell(cell => {
              cell.border = {
                top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
              };
            });
            if (rowNumber % 2 === 0) {
              row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF5F5F5' },
              };
            }
          }
        });

        // Aplicar formato condicional de colores para estado
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
            const statusCell = row.getCell(2);
            if (statusCell.value === 'ONLINE') {
              statusCell.font = { color: { argb: 'FF008000' }, bold: true };
            } else if (statusCell.value === 'OFFLINE') {
              statusCell.font = { color: { argb: 'FFFF0000' }, bold: true };
            } else {
              statusCell.font = { color: { argb: 'FFFFA500' }, bold: true };
            }
          }
        });

        // Agregar resumen al final
        const summaryRow = worksheet.addRow([]);
        const totalRow = worksheet.addRow([
          `Total: ${serverData.databases.length} bases de datos`,
          '',
          serverData.databases.reduce((sum, db) => sum + db.dataMB, 0),
        ]);
        totalRow.font = { bold: true };
        totalRow.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE599' },
        };
      }

      // Generar archivo y descargar
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Inventario_DBs_SQLServer_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Exportación completada',
        description: `Se exportaron ${exportData.totalDatabases} bases de datos de ${exportData.servers.length} servidor(es)`,
      });

      setExportDialogOpen(false);
      setSelectedServersForExport([]);
    } catch (error) {
      console.error('Error al exportar:', error);
      toast({
        title: 'Error al exportar',
        description: 'No se pudo generar el archivo Excel',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Cambiar página
  const goToPage = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchData(page, pagination.pageSize);
    }
  };

  // Cambiar tamaño de página
  const changePageSize = (newSize: number) => {
    fetchData(1, newSize);
  };

  // Formatear fecha de última actualización
  const formatLastUpdated = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Estadísticas (basadas en la página actual)
  const stats = useMemo(() => {
    const total = pagination.totalRecords;
    // Asegurar que data_MB sea un número válido antes de sumar
    const totalSizeMB = databases.reduce((sum, db) => {
      const size = typeof db.data_MB === 'number' ? db.data_MB : (parseInt(String(db.data_MB)) || 0);
      return sum + size;
    }, 0);
    const onlineCount = databases.filter(db => db.status?.toUpperCase() === 'ONLINE').length;
    const serversCount = new Set(databases.map(db => db.ServerName?.ServerName).filter(Boolean)).size;
    const byRecoveryModel = databases.reduce((acc, db) => {
      if (db.recoveryModel) {
        acc[db.recoveryModel] = (acc[db.recoveryModel] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return { total, totalSizeMB, onlineCount, serversCount, byRecoveryModel };
  }, [databases, pagination.totalRecords]);

  // Loading State
  if (loading && databases.length === 0) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>

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

        <div className="flex gap-4 flex-wrap">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>

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
            <SqlServerIcon className="h-8 w-8" />
            Inventario SQL Server - Bases de Datos
          </h1>
          <p className="text-muted-foreground">
            Listado de todas las bases de datos SQL Server registradas
          </p>
        </div>
        <div className="flex items-center gap-4">
          {cacheInfo?.lastUpdatedAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatLastUpdated(cacheInfo.lastUpdatedAt)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Última actualización por: {cacheInfo.updatedByUserName || 'Sistema'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Botón de Exportar */}
          <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Exportar Excel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                  Exportar Inventario a Excel
                </DialogTitle>
                <DialogDescription>
                  Selecciona los servidores que deseas exportar. Se generará una hoja de Excel por cada servidor con el listado de sus bases de datos.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Búsqueda */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar servidores..."
                    value={serverSearchQuery}
                    onChange={(e) => setServerSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {/* Seleccionar todos */}
                <div className="flex items-center justify-between px-2 py-1 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={filteredServers.length > 0 && selectedServersForExport.length === filteredServers.length}
                      onCheckedChange={toggleSelectAll}
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                      Seleccionar todos ({filteredServers.length})
                    </label>
                  </div>
                  <Badge variant="secondary">
                    {selectedServersForExport.length} seleccionados
                  </Badge>
                </div>

                {/* Lista de servidores */}
                <ScrollArea className="h-[350px] rounded-md border">
                  {loadingServers ? (
                    <div className="flex items-center justify-center h-full p-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-muted-foreground">Cargando servidores...</span>
                    </div>
                  ) : Object.keys(serversByAmbiente).length === 0 ? (
                    <div className="flex items-center justify-center h-full p-8 text-muted-foreground">
                      No se encontraron servidores
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      {Object.entries(serversByAmbiente).map(([ambiente, servers]) => {
                        const ambienteServers = servers.map(s => s.serverName);
                        const allAmbienteSelected = ambienteServers.every(s => selectedServersForExport.includes(s));
                        const someAmbienteSelected = ambienteServers.some(s => selectedServersForExport.includes(s));
                        
                        return (
                          <div key={ambiente} className="space-y-2">
                            {/* Header del ambiente */}
                            <div 
                              className="flex items-center gap-2 p-2 bg-muted rounded-md cursor-pointer hover:bg-muted/80"
                              onClick={() => toggleAmbiente(ambiente)}
                            >
                              <Checkbox
                                checked={allAmbienteSelected}
                                className={someAmbienteSelected && !allAmbienteSelected ? 'data-[state=checked]:bg-muted-foreground' : ''}
                              />
                              <Server className="h-4 w-4 text-primary" />
                              <span className="font-semibold text-sm">{ambiente}</span>
                              <Badge variant="outline" className="ml-auto">
                                {servers.length} servidor{servers.length !== 1 ? 'es' : ''}
                              </Badge>
                            </div>

                            {/* Lista de servidores del ambiente */}
                            <div className="ml-6 space-y-1">
                              {servers.map(server => (
                                <div
                                  key={server.serverName}
                                  className={cn(
                                    "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                                    selectedServersForExport.includes(server.serverName)
                                      ? "bg-primary/10 border border-primary/30"
                                      : "hover:bg-muted/50"
                                  )}
                                  onClick={() => toggleServerSelection(server.serverName)}
                                >
                                  <Checkbox
                                    checked={selectedServersForExport.includes(server.serverName)}
                                  />
                                  <SqlServerIcon className="h-4 w-4" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{server.serverName}</p>
                                  </div>
                                  <Badge variant="secondary" className="text-xs">
                                    {server.databaseCount} DBs
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>

                {/* Resumen de selección */}
                {selectedServersForExport.length > 0 && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {selectedServersForExport.length} servidor{selectedServersForExport.length !== 1 ? 'es' : ''} seleccionado{selectedServersForExport.length !== 1 ? 's' : ''} • 
                        {' '}{serverList.filter(s => selectedServersForExport.includes(s.serverName)).reduce((sum, s) => sum + s.databaseCount, 0)} bases de datos en total
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setExportDialogOpen(false);
                    setSelectedServersForExport([]);
                    setServerSearchQuery('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={exportToExcel}
                  disabled={selectedServersForExport.length === 0 || isExporting}
                  className="gap-2"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Exportar ({selectedServersForExport.length})
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            onClick={refreshData}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bases de Datos</CardTitle>
            <SqlServerIcon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.serversCount} servidores en esta página
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tamaño (esta página)</CardTitle>
            <HardDrive className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">
              {formatSize(stats.totalSizeMB)}
            </div>
            <p className="text-xs text-muted-foreground">
              Datos almacenados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online (esta página)</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {stats.onlineCount}
            </div>
            <p className="text-xs text-muted-foreground">
              De {databases.length} en esta página
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recovery Model</CardTitle>
            <AlertCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {stats.byRecoveryModel['FULL'] || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              FULL / {stats.byRecoveryModel['SIMPLE'] || 0} SIMPLE
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar base de datos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Input
          placeholder="Filtrar por servidor..."
          value={selectedServer === 'All' ? '' : selectedServer}
          onChange={(e) => setSelectedServer(e.target.value || 'All')}
          className="w-[220px]"
        />

        <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            <SelectItem value="ONLINE">ONLINE</SelectItem>
            <SelectItem value="OFFLINE">OFFLINE</SelectItem>
            <SelectItem value="RESTORING">RESTORING</SelectItem>
            <SelectItem value="RECOVERING">RECOVERING</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedRecoveryModel} onValueChange={(v) => { setSelectedRecoveryModel(v); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Recovery Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            <SelectItem value="FULL">FULL</SelectItem>
            <SelectItem value="SIMPLE">SIMPLE</SelectItem>
            <SelectItem value="BULK_LOGGED">BULK_LOGGED</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count and page size */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Mostrando {((pagination.page - 1) * pagination.pageSize) + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} de {pagination.totalRecords} bases de datos
        </span>
        <div className="flex items-center gap-2">
          <span>Registros por página:</span>
          <Select value={String(pagination.pageSize)} onValueChange={(v) => changePageSize(Number(v))}>
            <SelectTrigger className="w-[80px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SqlServerIcon className="h-5 w-5" />
            Detalle de Bases de Datos
          </CardTitle>
          <CardDescription>
            Información detallada de cada base de datos SQL Server
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={cn("relative", loading && "opacity-50")}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {databases.length === 0 ? (
              <div className="text-center py-12">
                <SqlServerIcon className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay bases de datos</h3>
                <p className="text-muted-foreground">
                  No se encontraron bases de datos con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Base de Datos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Tamaño</TableHead>
                    <TableHead>Recovery</TableHead>
                    <TableHead>Compatibilidad</TableHead>
                    <TableHead>Collation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databases.map((db) => (
                    <TableRow key={db.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{db.ServerName.ServerName}</span>
                          <span className="text-xs text-muted-foreground">{db.ServerName.ambiente}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{db.dbName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getStatusColor(db.status))}>
                          {db.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatSize(db.data_MB)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getRecoveryModelColor(db.recoveryModel))}>
                          {db.recoveryModel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {db.compatibilityLevel.replace('SQL Server ', '')}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate" title={db.collation}>
                        {db.collation}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(1)}
                  disabled={pagination.page === 1 || loading}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {/* Page numbers */}
                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={pagination.page === pageNum ? 'default' : 'outline'}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => goToPage(pageNum)}
                        disabled={loading}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(pagination.totalPages)}
                  disabled={pagination.page === pagination.totalPages || loading}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
