/**
 * Página de Estado de Parcheo SQL Server
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Server, CheckCircle2, 
  XCircle, Clock, Download, TrendingUp, Database, ShieldOff, Search, 
  X, ArrowUpDown, ArrowUp, ArrowDown, Users, CalendarCheck, AlertTriangle,
  Timer, BarChart3, Layers
} from 'lucide-react';
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
import { patchingApi, ServerPatchStatusDto, patchPlanApi, PatchDashboardStatsDto, PatchPlanStatus } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';

const CURRENT_YEAR = new Date().getFullYear();

// Configuración del gráfico de pie para estados de parcheo - Paleta Azul + Rojo para obsoletos
const pieChartConfig = {
  compliant: {
    label: "Compliance",
    color: "#2563eb",
  },
  nonCompliant: {
    label: "No Compliance",
    color: "#93c5fd",
  },
  obsolete: {
    label: "Obsoleto",
    color: "#dc2626",
  },
} satisfies ChartConfig;

// Configuración del gráfico de barras por versión - Paleta Azul + Rojo para obsoletos
const versionChartConfig = {
  compliant: {
    label: "Compliance",
    color: "#2563eb",
  },
  nonCompliant: {
    label: "No Compliance",
    color: "#93c5fd",
  },
  obsolete: {
    label: "Obsoleto",
    color: "#dc2626",
  },
} satisfies ChartConfig;

// Tooltip personalizado para el gráfico de pie
const PieCustomTooltip = ({ active, payload, total }: { active?: boolean; payload?: any[]; total: number }) => {
  if (!active || !payload?.length) return null;
  
  const data = payload[0];
  const statusLabels: Record<string, string> = {
    compliant: 'Compliance',
    nonCompliant: 'No Compliance',
    obsolete: 'Obsoleto'
  };
  const statusColors: Record<string, string> = {
    compliant: '#2563eb',
    nonCompliant: '#93c5fd',
    obsolete: '#dc2626'
  };
  
  const label = statusLabels[data.name] || data.name;
  const value = data.value;
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <div 
          className="w-3 h-3 rounded-sm" 
          style={{ backgroundColor: statusColors[data.name] }}
        />
        <span className="font-medium">{label}</span>
      </div>
      <div className="text-muted-foreground mt-1">
        {value} servidores ({percentage}%)
      </div>
    </div>
  );
};

// Tooltip personalizado para el gráfico de barras por versión
const VersionCustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  
  const total = payload.reduce((sum, entry) => sum + (entry.value || 0), 0);
  
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm min-w-[140px]">
      <div className="font-medium mb-2">SQL Server {label}</div>
      {payload.map((entry: any, index: number) => {
        if (entry.value === 0) return null;
        const percentage = total > 0 ? ((entry.value / total) * 100).toFixed(1) : '0.0';
        return (
          <div key={index} className="flex items-center justify-between gap-3 text-muted-foreground">
            <div className="flex items-center gap-2">
              <div 
                className="w-2.5 h-2.5 rounded-sm" 
                style={{ backgroundColor: entry.color }}
              />
              <span>{entry.name}</span>
            </div>
            <span className="font-medium text-foreground">{entry.value} ({percentage}%)</span>
          </div>
        );
      })}
      <div className="border-t mt-1.5 pt-1.5 flex justify-between text-muted-foreground">
        <span>Total</span>
        <span className="font-medium text-foreground">{total}</span>
      </div>
    </div>
  );
};

// Tipo para rastrear la fuente del filtro interactivo
type FilterSource = 'kpi' | 'chart' | 'dropdown' | null;

export default function PatchStatus() {
  const [searchTerm, setSearchTerm] = useState('');
  const [ambienteFilter, setAmbienteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Estado para rastrear filtros interactivos (para resaltar elementos activos)
  const [activeFilterSource, setActiveFilterSource] = useState<{
    status: FilterSource;
    version: FilterSource;
    ambiente: FilterSource;
  }>({ status: null, version: null, ambiente: null });

  // Estado para ordenamiento de la tabla
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  }>({ key: 'pendingCUs', direction: 'desc' }); // Por defecto ordenar por CUs pendientes desc

  // Verificar si hay algún filtro activo
  const hasActiveFilters = statusFilter !== 'all' || versionFilter !== 'all' || ambienteFilter !== 'all' || searchTerm !== '';

  // Limpiar todos los filtros
  const clearAllFilters = () => {
    setSearchTerm('');
    setAmbienteFilter('all');
    setStatusFilter('all');
    setVersionFilter('all');
    setActiveFilterSource({ status: null, version: null, ambiente: null });
  };

  // Handlers para filtros interactivos
  const handleKpiClick = (status: string) => {
    if (statusFilter === status) {
      setStatusFilter('all');
      setActiveFilterSource(prev => ({ ...prev, status: null }));
    } else {
      setStatusFilter(status);
      setActiveFilterSource(prev => ({ ...prev, status: 'kpi' }));
    }
  };

  const handleChartStatusClick = (status: string) => {
    const mappedStatus = status === 'compliant' ? 'Compliance' : status === 'nonCompliant' ? 'NoCompliance' : 'Obsolete';
    if (statusFilter === mappedStatus) {
      setStatusFilter('all');
      setActiveFilterSource(prev => ({ ...prev, status: null }));
    } else {
      setStatusFilter(mappedStatus);
      setActiveFilterSource(prev => ({ ...prev, status: 'chart' }));
    }
  };

  const handleVersionClick = (version: string) => {
    if (versionFilter === version) {
      setVersionFilter('all');
      setActiveFilterSource(prev => ({ ...prev, version: null }));
    } else {
      setVersionFilter(version);
      setActiveFilterSource(prev => ({ ...prev, version: 'chart' }));
    }
  };

  const handleAmbienteClick = (ambiente: string) => {
    if (ambienteFilter === ambiente) {
      setAmbienteFilter('all');
      setActiveFilterSource(prev => ({ ...prev, ambiente: null }));
    } else {
      setAmbienteFilter(ambiente);
      setActiveFilterSource(prev => ({ ...prev, ambiente: 'chart' }));
    }
  };

  // Handler para cambiar ordenamiento de la tabla
  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  // Componente para header ordenable
  const SortableHeader = ({ column, label, className }: { column: string; label: string; className?: string }) => {
    const isActive = sortConfig.key === column;
    return (
      <TableHead 
        className={cn("cursor-pointer hover:bg-muted/50 transition-colors select-none", className)}
        onClick={() => handleSort(column)}
      >
        <div className="flex items-center gap-1">
          {label}
          {isActive ? (
            sortConfig.direction === 'desc' ? 
              <ArrowDown className="h-3 w-3 text-primary" /> : 
              <ArrowUp className="h-3 w-3 text-primary" />
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
          )}
        </div>
      </TableHead>
    );
  };

  // Query para obtener años disponibles
  const { data: complianceYears } = useQuery({
    queryKey: ['complianceYears'],
    queryFn: patchingApi.getComplianceYears,
  });

  const { 
    data: rawServers, 
    isLoading, 
    isError, 
    error,
    refetch, 
    isFetching 
  } = useQuery({
    queryKey: ['patchStatus', selectedYear],
    queryFn: () => patchingApi.getStatus(false, selectedYear),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Dashboard stats para la sección de parcheos planificados
  const { data: dashboardStats } = useQuery({
    queryKey: ['patchDashboardStats'],
    queryFn: () => patchPlanApi.getDashboardStats(),
    staleTime: 5 * 60 * 1000,
  });

  // Filtrar servidores que no responden
  const servers = useMemo(() => {
    if (!rawServers) return [];
    return rawServers.filter(s => s.connectionSuccess === true);
  }, [rawServers]);

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    try {
      await patchingApi.getStatus(true, selectedYear);
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Años disponibles
  const availableYears = useMemo(() => {
    const years = new Set(complianceYears || []);
    years.add(CURRENT_YEAR);
    years.add(CURRENT_YEAR + 1);
    return Array.from(years).sort((a, b) => b - a);
  }, [complianceYears]);

  const showLoading = isLoading || isRefreshing;

  // Versiones obsoletas (fuera de soporte de Microsoft)
  const obsoleteVersions = ['2005', '2008', '2008 R2', '2012', '2014'];

  // Calcular métricas
  const metrics = useMemo(() => {
    if (!servers) return null;
    
    const total = servers.length;
    // Primero identificamos los obsoletos (no cuentan como compliance aunque su patchStatus sea Updated/Compliant)
    const obsoleteServers = servers.filter(s => obsoleteVersions.includes(s.majorVersion)).length;
    
    // Compliance = (Updated + Compliant) EXCEPTO los obsoletos
    const compliant = servers.filter(s => 
      (s.patchStatus === 'Updated' || s.patchStatus === 'Compliant') &&
      !obsoleteVersions.includes(s.majorVersion)
    ).length;
    
    // No Compliance = NonCompliant + Critical + Error + Unknown + Outdated (excepto obsoletos que ya se contaron)
    const nonCompliant = servers.filter(s => 
      !obsoleteVersions.includes(s.majorVersion) && (
        s.patchStatus === 'NonCompliant' || 
        s.patchStatus === 'Critical' || 
        s.patchStatus === 'Error' || 
        s.patchStatus === 'Unknown' ||
        s.patchStatus === 'Outdated'
      )
    ).length;
    
    // Compliance rate se calcula sobre el total EXCLUYENDO obsoletos
    const nonObsoleteTotal = total - obsoleteServers;
    const complianceRate = nonObsoleteTotal > 0 ? Math.round((compliant / nonObsoleteTotal) * 100) : 0;
    
    return { total, compliant, nonCompliant, obsoleteServers, complianceRate };
  }, [servers]);

  // Datos para gráfico de pie
  const pieData = useMemo(() => {
    if (!metrics) return [];
    return [
      { status: 'compliant', value: metrics.compliant, fill: 'var(--color-compliant)' },
      { status: 'nonCompliant', value: metrics.nonCompliant, fill: 'var(--color-nonCompliant)' },
      { status: 'obsolete', value: metrics.obsoleteServers, fill: 'var(--color-obsolete)' },
    ].filter(d => d.value > 0);
  }, [metrics]);

  // Datos para gráfico por versión
  const versionData = useMemo(() => {
    if (!servers) return [];
    
    const byVersion = servers.reduce((acc, s) => {
      const version = s.majorVersion || 'Otro';
      if (!acc[version]) {
        acc[version] = { version, versionLabel: version, compliant: 0, nonCompliant: 0, obsolete: 0, total: 0 };
      }
      acc[version].total++;
      
      // Si es versión obsoleta, cuenta como obsoleto sin importar el patchStatus
      if (obsoleteVersions.includes(version)) {
        acc[version].obsolete++;
      } else if (s.patchStatus === 'Updated' || s.patchStatus === 'Compliant') {
        acc[version].compliant++;
      } else {
        acc[version].nonCompliant++;
      }
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(byVersion).sort((a: any, b: any) => b.total - a.total);
  }, [servers]);

  // Compliance por ambiente (excluyendo obsoletos del cálculo)
  const ambienteComplianceData = useMemo(() => {
    if (!servers) return [];
    
    const byAmbiente = servers.reduce((acc, s) => {
      const ambiente = s.ambiente || 'Sin definir';
      const isObsolete = obsoleteVersions.includes(s.majorVersion);
      
      if (!acc[ambiente]) {
        acc[ambiente] = { ambiente, total: 0, compliant: 0, nonCompliant: 0, obsolete: 0 };
      }
      
      // Los obsoletos se cuentan por separado, no afectan el % de compliance
      if (isObsolete) {
        acc[ambiente].obsolete++;
      } else {
        acc[ambiente].total++;
        if (s.patchStatus === 'Updated' || s.patchStatus === 'Compliant') {
          acc[ambiente].compliant++;
        } else {
          acc[ambiente].nonCompliant++;
        }
      }
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(byAmbiente)
      .map((a: any) => ({
        ...a,
        complianceRate: a.total > 0 ? Math.round((a.compliant / a.total) * 100) : 0,
      }))
      .sort((a: any, b: any) => {
        // Ambientes con solo obsoletos van al final
        if (a.total === 0 && b.total > 0) return 1;
        if (a.total > 0 && b.total === 0) return -1;
        // Luego ordenar por % compliance ascendente (peores primero)
        return a.complianceRate - b.complianceRate;
      });
  }, [servers]);

  const getPendingCount = (server: ServerPatchStatusDto) => {
    if (server.patchStatus === 'Compliant') return server.pendingCUsForLatest;
    return server.pendingCUsForCompliance;
  };

  // Filtros únicos
  const uniqueAmbientes = useMemo(() => {
    if (!servers) return [];
    return [...new Set(servers.map(s => s.ambiente).filter(Boolean))].sort();
  }, [servers]);

  const uniqueVersions = useMemo(() => {
    if (!servers) return [];
    return [...new Set(servers.map(s => s.majorVersion).filter(Boolean))].sort();
  }, [servers]);

  // Filtrar y ordenar servidores
  const filteredServers = useMemo(() => {
    if (!servers) return [];
    
    const filtered = servers.filter(server => {
      const matchesSearch = searchTerm === '' || 
        server.serverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        server.instanceName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAmbiente = ambienteFilter === 'all' || server.ambiente === ambienteFilter;
      
      // Filtro de estado: Compliance, NoCompliance, Obsolete
      let matchesStatus = true;
      const isObsolete = obsoleteVersions.includes(server.majorVersion);
      
      if (statusFilter === 'Obsolete') {
        matchesStatus = isObsolete;
      } else if (statusFilter === 'Compliance') {
        // Compliance = (Updated o Compliant) Y NO obsoleto
        matchesStatus = !isObsolete && (server.patchStatus === 'Updated' || server.patchStatus === 'Compliant');
      } else if (statusFilter === 'NoCompliance') {
        // No Compliance = NO (Updated o Compliant) Y NO obsoleto
        matchesStatus = !isObsolete && server.patchStatus !== 'Updated' && server.patchStatus !== 'Compliant';
      }
      
      const matchesVersion = versionFilter === 'all' || server.majorVersion === versionFilter;
      
      return matchesSearch && matchesAmbiente && matchesStatus && matchesVersion;
    });

    // Aplicar ordenamiento
    const sorted = [...filtered].sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      
      switch (sortConfig.key) {
        case 'serverName':
          return direction * a.serverName.localeCompare(b.serverName);
        case 'ambiente':
          return direction * (a.ambiente || '').localeCompare(b.ambiente || '');
        case 'version':
          return direction * (a.majorVersion || '').localeCompare(b.majorVersion || '');
        case 'currentBuild':
          return direction * (a.currentBuild || '').localeCompare(b.currentBuild || '');
        case 'currentCU':
          return direction * (a.currentCU || a.currentSP || '').localeCompare(b.currentCU || b.currentSP || '');
        case 'requiredCU':
          return direction * (a.requiredCU || '').localeCompare(b.requiredCU || '');
        case 'pendingCUs': {
          const aPending = a.patchStatus === 'Compliant' ? a.pendingCUsForLatest : a.pendingCUsForCompliance;
          const bPending = b.patchStatus === 'Compliant' ? b.pendingCUsForLatest : b.pendingCUsForCompliance;
          return direction * (aPending - bPending);
        }
        case 'status': {
          // Ordenar por severidad: Obsolete > NonCompliant > Compliant > Updated
          const statusOrder: Record<string, number> = {
            'Critical': 0, 'NonCompliant': 1, 'Outdated': 2, 'Error': 3, 
            'Unknown': 4, 'Compliant': 5, 'Updated': 6
          };
          const aOrder = obsoleteVersions.includes(a.majorVersion) ? -1 : (statusOrder[a.patchStatus] ?? 99);
          const bOrder = obsoleteVersions.includes(b.majorVersion) ? -1 : (statusOrder[b.patchStatus] ?? 99);
          return direction * (aOrder - bOrder);
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [servers, searchTerm, ambienteFilter, statusFilter, versionFilter, sortConfig]);

  // Exportar a Excel
  const exportToExcel = async () => {
    if (!filteredServers.length) return;

    // Importar exceljs dinámicamente
    const ExcelJS = await import('exceljs');
    
    // Crear workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SQL Guard Observatory';
    workbook.created = new Date();

    // Crear hoja de trabajo
    const worksheet = workbook.addWorksheet('Estado de Parcheo');

    // Configurar anchos de columna
    worksheet.columns = [
      { header: 'Servidor', key: 'servidor', width: 35 },
      { header: 'Instancia', key: 'instancia', width: 35 },
      { header: 'Ambiente', key: 'ambiente', width: 15 },
      { header: 'Versión', key: 'version', width: 12 },
      { header: 'Build Actual', key: 'buildActual', width: 15 },
      { header: 'CU Actual', key: 'cuActual', width: 15 },
      { header: 'Build Requerido', key: 'buildRequerido', width: 15 },
      { header: 'CU Requerido', key: 'cuRequerido', width: 15 },
      { header: 'CUs Pend. Compliance', key: 'cusPendCompliance', width: 20 },
      { header: 'CUs Pend. Última', key: 'cusPendUltima', width: 18 },
      { header: 'Estado', key: 'estado', width: 15 },
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
    filteredServers.forEach(server => {
      const isObsolete = obsoleteVersions.includes(server.majorVersion);
      let estado = 'No Compliance';
      if (isObsolete) {
        estado = 'Obsoleto';
      } else if (server.patchStatus === 'Updated' || server.patchStatus === 'Compliant') {
        estado = 'Compliance';
      }

      worksheet.addRow({
        servidor: server.serverName,
        instancia: server.instanceName,
        ambiente: server.ambiente,
        version: server.majorVersion,
        buildActual: server.currentBuild || '',
        cuActual: server.currentCU || server.currentSP || '',
        buildRequerido: server.requiredBuild || '',
        cuRequerido: server.requiredCU || '',
        cusPendCompliance: server.pendingCUsForCompliance,
        cusPendUltima: server.pendingCUsForLatest,
        estado: estado,
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
        const statusCell = row.getCell('estado');
        if (statusCell.value === 'Compliance') {
          statusCell.font = { color: { argb: 'FF16A34A' }, bold: true }; // Verde
        } else if (statusCell.value === 'Obsoleto') {
          statusCell.font = { color: { argb: 'FFDC2626' }, bold: true }; // Rojo
        } else {
          statusCell.font = { color: { argb: 'FFFBBF24' }, bold: true }; // Amarillo/Warning
        }
      }
    });

    // Agregar resumen al final
    worksheet.addRow([]);
    const totalRow = worksheet.addRow([
      `Total: ${filteredServers.length} servidores`,
      '', '', '', '', '', '', '', '', '', ''
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE599' },
    };

    // Agregar estadísticas de compliance
    const compliantCount = filteredServers.filter(s => 
      !obsoleteVersions.includes(s.majorVersion) && 
      (s.patchStatus === 'Updated' || s.patchStatus === 'Compliant')
    ).length;
    const nonCompliantCount = filteredServers.filter(s => 
      !obsoleteVersions.includes(s.majorVersion) && 
      s.patchStatus !== 'Updated' && s.patchStatus !== 'Compliant'
    ).length;
    const obsoleteCount = filteredServers.filter(s => obsoleteVersions.includes(s.majorVersion)).length;
    
    const statsRow = worksheet.addRow([
      `Compliance: ${compliantCount} | No Compliance: ${nonCompliantCount} | Obsoletos: ${obsoleteCount}`,
      '', '', '', '', '', '', '', '', '', ''
    ]);
    statsRow.font = { italic: true };

    // Generar archivo y descargar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `patch_compliance_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string, majorVersion: string) => {
    // Primero verificar si es obsoleto (independientemente del patchStatus)
    if (obsoleteVersions.includes(majorVersion)) {
      return <Badge variant="destructive">Obsoleto</Badge>;
    }
    
    switch (status) {
      case 'Updated':
      case 'Compliant':
        return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Compliance</Badge>;
      case 'NonCompliant':
      case 'Critical':
      case 'Outdated':
      case 'Error':
      case 'Unknown':
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">No Compliance</Badge>;
      default:
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">No Compliance</Badge>;
    }
  };

  // Error state
  if (isError) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center text-center py-12">
              <ShieldX className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error al cargar el estado de parcheo</h3>
              <p className="text-muted-foreground mb-4">{(error as Error)?.message}</p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (showLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-80" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[200px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
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
            <div className="relative">
              <SqlServerIcon className="h-8 w-8" />
              <ShieldCheck className="h-4 w-4 text-primary absolute -bottom-1 -right-1" />
            </div>
            Estado de Parcheo SQL Server
          </h1>
          <p className="text-muted-foreground">
            Última actualización: {servers?.[0]?.lastChecked 
              ? new Date(servers[0].lastChecked).toLocaleString('es-AR')
              : 'N/A'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  Compliance {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleForceRefresh} disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button onClick={exportToExcel} variant="outline" disabled={!filteredServers.length}>
            <Download className="w-4 h-4 mr-2" /> Excel
          </Button>
        </div>
      </div>

      {/* KPI Cards - Clickeables como filtros */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total - No clickeable, pero muestra botón limpiar si hay filtros */}
        <Card className="relative">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Instancias</CardTitle>
            <Database className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{metrics?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {hasActiveFilters ? (
                <span className="flex items-center gap-1">
                  Mostrando {filteredServers.length} 
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-5 px-1.5 text-xs text-primary hover:text-primary"
                    onClick={clearAllFilters}
                  >
                    <X className="h-3 w-3 mr-0.5" />
                    Limpiar
                  </Button>
                </span>
              ) : (
                'servidores monitoreados'
              )}
            </p>
          </CardContent>
        </Card>

        {/* Compliance - Clickeable */}
        <Card 
          className={cn(
            'cursor-pointer transition-all hover:shadow-md',
            statusFilter === 'Compliance' && activeFilterSource.status === 'kpi' && 'ring-2 ring-emerald-500 ring-offset-2'
          )}
          onClick={() => handleKpiClick('Compliance')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              Compliance
              {statusFilter === 'Compliance' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
            </CardTitle>
            <ShieldCheck className={`h-4 w-4 ${(metrics?.complianceRate ?? 0) >= 80 ? 'text-emerald-500' : 'text-warning'}`} />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${(metrics?.complianceRate ?? 0) >= 80 ? 'text-emerald-500' : 'text-warning'}`}>
                {metrics?.compliant || 0}
              </span>
              <span className={`text-lg font-semibold ${(metrics?.complianceRate ?? 0) >= 80 ? 'text-emerald-500/70' : 'text-warning/70'}`}>
                ({metrics?.complianceRate || 0}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">cumplen requisito (excl. obsoletos)</p>
          </CardContent>
        </Card>

        {/* No Compliance - Clickeable */}
        <Card 
          className={cn(
            'cursor-pointer transition-all hover:shadow-md',
            statusFilter === 'NoCompliance' && activeFilterSource.status === 'kpi' && 'ring-2 ring-warning ring-offset-2'
          )}
          onClick={() => handleKpiClick('NoCompliance')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              No Compliance
              {statusFilter === 'NoCompliance' && <CheckCircle2 className="h-3 w-3 text-warning" />}
            </CardTitle>
            <ShieldOff className={`h-4 w-4 ${(metrics?.nonCompliant ?? 0) > 0 ? 'text-warning' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${(metrics?.nonCompliant ?? 0) > 0 ? 'text-warning' : 'text-emerald-500'}`}>
                {metrics?.nonCompliant || 0}
              </span>
              <span className={`text-lg font-semibold ${(metrics?.nonCompliant ?? 0) > 0 ? 'text-warning/70' : 'text-emerald-500/70'}`}>
                ({100 - (metrics?.complianceRate || 0)}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">pendientes de actualizar (excl. obsoletos)</p>
          </CardContent>
        </Card>

        {/* Obsoletos - Clickeable */}
        <Card 
          className={cn(
            'cursor-pointer transition-all hover:shadow-md',
            statusFilter === 'Obsolete' && activeFilterSource.status === 'kpi' && 'ring-2 ring-red-500 ring-offset-2'
          )}
          onClick={() => handleKpiClick('Obsolete')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              Obsoletos
              {statusFilter === 'Obsolete' && <CheckCircle2 className="h-3 w-3 text-red-500" />}
            </CardTitle>
            <Clock className={`h-4 w-4 ${(metrics?.obsoleteServers ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${(metrics?.obsoleteServers ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {metrics?.obsoleteServers || 0}
                  </span>
                  <span className={`text-lg font-semibold ${(metrics?.obsoleteServers ?? 0) > 0 ? 'text-red-500/70' : 'text-emerald-500/70'}`}>
                    ({metrics?.total ? Math.round((metrics.obsoleteServers / metrics.total) * 100) : 0}%)
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Versiones fuera de soporte: 2005-2014</p>
              </TooltipContent>
            </Tooltip>
            <p className="text-xs text-muted-foreground">(del total del parque) sin soporte de Microsoft</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4 text-primary" />
              Distribución por Estado
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer config={pieChartConfig} className="mx-auto h-[180px]">
              <PieChart>
                <ChartTooltip
                  cursor={false}
                  content={<PieCustomTooltip total={metrics?.total || 0} />}
                />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={2}
                  strokeWidth={0}
                  style={{ cursor: 'pointer' }}
                  onClick={(data) => data && handleChartStatusClick(data.status)}
                >
                  {pieData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`}
                      style={{ 
                        cursor: 'pointer',
                        opacity: statusFilter !== 'all' && 
                          ((statusFilter === 'Compliance' && entry.status !== 'compliant') ||
                           (statusFilter === 'NoCompliance' && entry.status !== 'nonCompliant') ||
                           (statusFilter === 'Obsolete' && entry.status !== 'obsolete')) ? 0.3 : 1,
                        transition: 'opacity 0.2s'
                      }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            {/* Leyenda clickeable */}
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs mt-1">
              {pieData.map((item) => {
                const isActive = (statusFilter === 'Compliance' && item.status === 'compliant') ||
                                 (statusFilter === 'NoCompliance' && item.status === 'nonCompliant') ||
                                 (statusFilter === 'Obsolete' && item.status === 'obsolete');
                return (
                  <div 
                    key={item.status} 
                    className={cn(
                      "flex items-center gap-1.5 cursor-pointer hover:opacity-80 px-1.5 py-0.5 rounded transition-all",
                      isActive && "bg-muted ring-1 ring-primary/50"
                    )}
                    onClick={() => handleChartStatusClick(item.status)}
                  >
                    <div 
                      className="w-2.5 h-2.5 rounded-sm" 
                      style={{ backgroundColor: pieChartConfig[item.status as keyof typeof pieChartConfig]?.color }}
                    />
                    <span className="text-muted-foreground">
                      {pieChartConfig[item.status as keyof typeof pieChartConfig]?.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-primary" />
              Compliance por Versión
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer 
              config={versionChartConfig} 
              className="w-full"
              style={{ height: Math.max(180, versionData.length * 28 + 40) }}
            >
              <BarChart 
                data={versionData} 
                layout="vertical" 
                barSize={16} 
                margin={{ left: 0, right: 10 }}
                onClick={(data) => data?.activeLabel && handleVersionClick(data.activeLabel)}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis 
                  dataKey="versionLabel" 
                  type="category" 
                  tick={({ x, y, payload }) => (
                    <text 
                      x={x} 
                      y={y} 
                      dy={4} 
                      textAnchor="end" 
                      fontSize={10}
                      fill={versionFilter === payload.value ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                      fontWeight={versionFilter === payload.value ? 'bold' : 'normal'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleVersionClick(payload.value)}
                    >
                      {payload.value}
                    </text>
                  )}
                  width={50}
                  interval={0}
                />
                <ChartTooltip
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
                  content={<VersionCustomTooltip />}
                />
                <Bar 
                  dataKey="compliant" 
                  stackId="a" 
                  fill="var(--color-compliant)" 
                  radius={[0, 0, 0, 0]} 
                  name="Compliance"
                  style={{ cursor: 'pointer' }}
                />
                <Bar 
                  dataKey="nonCompliant" 
                  stackId="a" 
                  fill="var(--color-nonCompliant)" 
                  radius={[0, 0, 0, 0]} 
                  name="No Compliance"
                  style={{ cursor: 'pointer' }}
                />
                <Bar 
                  dataKey="obsolete" 
                  stackId="a" 
                  fill="var(--color-obsolete)" 
                  radius={[0, 4, 4, 0]} 
                  name="Obsoleto"
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            </ChartContainer>
            {/* Indicador de versión seleccionada */}
            {versionFilter !== 'all' && (
              <div className="flex justify-center mt-1">
                <Badge 
                  variant="secondary" 
                  className="cursor-pointer hover:bg-destructive/10"
                  onClick={() => handleVersionClick(versionFilter)}
                >
                  SQL {versionFilter} <X className="h-3 w-3 ml-1" />
                </Badge>
              </div>
            )}
            {/* Leyenda compacta */}
            <div className="flex justify-center gap-4 text-xs mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#2563eb' }} />
                <span className="text-muted-foreground">Compliance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#93c5fd' }} />
                <span className="text-muted-foreground">No Compliance</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#dc2626' }} />
                <span className="text-muted-foreground">Obsoleto</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              % Compliance por Ambiente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {ambienteComplianceData.length === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos de ambientes
              </div>
            ) : (
              <div className="space-y-2.5 py-1">
                {ambienteComplianceData.map((amb: any) => {
                  const isSelected = ambienteFilter === amb.ambiente;
                  return (
                    <div 
                      key={amb.ambiente} 
                      className={cn(
                        "space-y-1 p-1.5 -mx-1.5 rounded cursor-pointer transition-all hover:bg-muted/50",
                        isSelected && "bg-muted ring-1 ring-primary/50"
                      )}
                      onClick={() => handleAmbienteClick(amb.ambiente)}
                    >
                      <div className="flex justify-between text-sm">
                        <span className={cn(
                          "font-medium truncate max-w-[120px]",
                          isSelected && "text-primary"
                        )}>
                          {amb.ambiente}
                          {isSelected && <CheckCircle2 className="h-3 w-3 ml-1 inline text-primary" />}
                        </span>
                        <div className="flex items-center gap-2">
                          {amb.obsolete > 0 && (
                            <span className="text-xs text-red-500">+{amb.obsolete} obs.</span>
                          )}
                          <span className={cn('font-bold', {
                            'text-emerald-500': amb.complianceRate >= 90,
                            'text-blue-500': amb.complianceRate >= 70 && amb.complianceRate < 90,
                            'text-warning': amb.complianceRate >= 50 && amb.complianceRate < 70,
                            'text-red-500': amb.complianceRate < 50,
                          })}>
                            {amb.total > 0 ? `${amb.complianceRate}%` : '-'}
                          </span>
                        </div>
                      </div>
                      {amb.total > 0 ? (
                        <>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={cn('h-full transition-all duration-500', {
                                'bg-emerald-500': amb.complianceRate >= 90,
                                'bg-blue-500': amb.complianceRate >= 70 && amb.complianceRate < 90,
                                'bg-warning': amb.complianceRate >= 50 && amb.complianceRate < 70,
                                'bg-red-500': amb.complianceRate < 50,
                              })}
                              style={{ width: `${amb.complianceRate}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{amb.compliant} en compliance</span>
                            <span>{amb.nonCompliant} pendientes</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">
                          Solo servidores obsoletos
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dashboard de Parcheos Planificados */}
      {dashboardStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Dashboard de Parcheos
            </CardTitle>
            <CardDescription>
              Estadísticas del ciclo actual de parcheos planificados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="cycle" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-4">
                <TabsTrigger value="cycle">Por Ciclo</TabsTrigger>
                <TabsTrigger value="cell">Por Célula</TabsTrigger>
                <TabsTrigger value="compliance">Cumplimiento</TabsTrigger>
                <TabsTrigger value="priority">Por Prioridad</TabsTrigger>
              </TabsList>
              
              {/* Tab: Por Ciclo */}
              <TabsContent value="cycle" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CalendarCheck className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-muted-foreground">Total Planificados</span>
                    </div>
                    <div className="text-2xl font-bold">{dashboardStats.totalPlans}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-muted-foreground">Completados</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">{dashboardStats.completedPlans}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {dashboardStats.completionPercentage.toFixed(1)}% del total
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium text-muted-foreground">Pendientes</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">{dashboardStats.pendingPlans}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-muted-foreground">Atrasados</span>
                    </div>
                    <div className="text-2xl font-bold text-red-600">{dashboardStats.delayedPlans}</div>
                  </div>
                </div>
                
                {/* Barra de progreso del ciclo */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Progreso del ciclo</span>
                    <span className="font-medium">{dashboardStats.completionPercentage.toFixed(1)}%</span>
                  </div>
                  <Progress value={dashboardStats.completionPercentage} className="h-2" />
                </div>
              </TabsContent>
              
              {/* Tab: Por Célula */}
              <TabsContent value="cell" className="space-y-4">
                {dashboardStats.cellStats && dashboardStats.cellStats.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dashboardStats.cellStats.map((cell, idx) => {
                      const totalCell = cell.backlog + cell.completed;
                      const completionRate = totalCell > 0 ? Math.round((cell.completed / totalCell) * 100) : 0;
                      return (
                        <div key={idx} className="bg-muted/30 rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-primary" />
                              <span className="font-medium">{cell.cellTeam}</span>
                            </div>
                            <Badge variant="outline">{totalCell} planes</Badge>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div>
                              <div className="text-lg font-bold text-yellow-600">{cell.backlog}</div>
                              <div className="text-xs text-muted-foreground">Backlog</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-green-600">{cell.completed}</div>
                              <div className="text-xs text-muted-foreground">Completados</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-blue-600">{cell.rescheduled}</div>
                              <div className="text-xs text-muted-foreground">Reprog.</div>
                            </div>
                            <div>
                              <div className="text-lg font-bold text-purple-600">{cell.waivers}</div>
                              <div className="text-xs text-muted-foreground">Waivers</div>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Tasa de completación</span>
                              <span className="font-medium">{completionRate}%</span>
                            </div>
                            <Progress value={completionRate} className="h-1.5" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No hay datos de células disponibles</p>
                    <p className="text-xs mt-1">Asigna células a los planes de parcheo para ver estadísticas</p>
                  </div>
                )}
              </TabsContent>
              
              {/* Tab: Cumplimiento */}
              <TabsContent value="compliance" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-green-500" />
                      <span className="font-medium">En Ventana</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-green-600">{dashboardStats.inWindowExecutions}</span>
                      <span className="text-muted-foreground text-sm">
                        ({dashboardStats.completedPlans > 0 
                          ? Math.round((dashboardStats.inWindowExecutions / dashboardStats.completedPlans) * 100) 
                          : 0}%)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Parcheos completados dentro de la ventana planificada
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-orange-500" />
                      <span className="font-medium">Fuera de Ventana</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-orange-600">{dashboardStats.outOfWindowExecutions}</span>
                      <span className="text-muted-foreground text-sm">
                        ({dashboardStats.completedPlans > 0 
                          ? Math.round((dashboardStats.outOfWindowExecutions / dashboardStats.completedPlans) * 100) 
                          : 0}%)
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Parcheos completados fuera de la ventana planificada
                    </p>
                  </div>
                </div>
                
                {dashboardStats.averageLeadTimeDays !== undefined && dashboardStats.averageLeadTimeDays > 0 && (
                  <div className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Timer className="h-4 w-4 text-primary" />
                      <span className="font-medium">Lead Time Promedio</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{dashboardStats.averageLeadTimeDays.toFixed(1)}</span>
                      <span className="text-muted-foreground">días</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tiempo promedio desde planificación hasta ejecución
                    </p>
                  </div>
                )}
              </TabsContent>
              
              {/* Tab: Por Prioridad */}
              <TabsContent value="priority" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 border border-red-200 dark:border-red-900">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium">Alta Prioridad</span>
                    </div>
                    <div className="text-2xl font-bold text-red-600">{dashboardStats.highPriorityPending}</div>
                    <p className="text-xs text-muted-foreground mt-1">Pendientes de alta prioridad</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950/30 rounded-lg p-4 border border-yellow-200 dark:border-yellow-900">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium">Media Prioridad</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600">{dashboardStats.mediumPriorityPending}</div>
                    <p className="text-xs text-muted-foreground mt-1">Pendientes de prioridad media</p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 border border-green-200 dark:border-green-900">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Baja Prioridad</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">{dashboardStats.lowPriorityPending}</div>
                    <p className="text-xs text-muted-foreground mt-1">Pendientes de baja prioridad</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Tabla de Detalle - Ancho completo */}
      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              Detalle de Servidores
            </CardTitle>
            <CardDescription>
              {filteredServers.length} servidores encontrados
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[150px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8"
                />
              </div>
              <Select 
                value={ambienteFilter} 
                onValueChange={(v) => {
                  setAmbienteFilter(v);
                  setActiveFilterSource(prev => ({ ...prev, ambiente: v === 'all' ? null : 'dropdown' }));
                }}
              >
                <SelectTrigger className={cn("h-8 w-[180px]", ambienteFilter !== 'all' && "ring-1 ring-primary")}>
                  <SelectValue placeholder="Ambiente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ambientes</SelectItem>
                  {uniqueAmbientes.map(amb => (
                    <SelectItem key={amb} value={amb}>{amb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select 
                value={statusFilter} 
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setActiveFilterSource(prev => ({ ...prev, status: v === 'all' ? null : 'dropdown' }));
                }}
              >
                <SelectTrigger className={cn("h-8 w-[170px]", statusFilter !== 'all' && "ring-1 ring-primary")}>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Compliance">Compliance</SelectItem>
                  <SelectItem value="NoCompliance">No Compliance</SelectItem>
                  <SelectItem value="Obsolete">Obsoleto</SelectItem>
                </SelectContent>
              </Select>
              <Select 
                value={versionFilter} 
                onValueChange={(v) => {
                  setVersionFilter(v);
                  setActiveFilterSource(prev => ({ ...prev, version: v === 'all' ? null : 'dropdown' }));
                }}
              >
                <SelectTrigger className={cn("h-8 w-[175px]", versionFilter !== 'all' && "ring-1 ring-primary")}>
                  <SelectValue placeholder="Versión" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las versiones</SelectItem>
                  {uniqueVersions.map(ver => (
                    <SelectItem key={ver} value={ver}>{ver}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tabla */}
            <div className="max-h-[400px] overflow-auto">
              {filteredServers.length === 0 ? (
                <div className="text-center py-12">
                  <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No hay servidores</h3>
                  <p className="text-muted-foreground">
                    No hay servidores que coincidan con los filtros.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHeader column="serverName" label="Servidor" className="min-w-[280px]" />
                      <SortableHeader column="ambiente" label="Ambiente" />
                      <SortableHeader column="version" label="Versión" />
                      <SortableHeader column="currentBuild" label="Build Actual" />
                      <SortableHeader column="currentCU" label="CU Actual" />
                      <SortableHeader column="requiredCU" label="Requerido" />
                      <SortableHeader column="pendingCUs" label="Pend." className="text-center" />
                      <SortableHeader column="status" label="Estado" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServers.map((server, idx) => (
                      <TableRow key={`${server.instanceName}-${idx}`} className={cn({
                        'bg-destructive/10': server.patchStatus === 'Critical',
                      })}>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2">
                                <div className={cn('w-2 h-2 rounded-full', {
                                  'bg-emerald-500': server.connectionSuccess,
                                  'bg-red-500': !server.connectionSuccess,
                                })} />
                                <span className="font-medium truncate max-w-[290px]">{server.serverName}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Instancia: {server.instanceName}</p>
                              <p>Conexión: {server.connectionSuccess ? 'OK' : 'Error'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{server.ambiente}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{server.majorVersion}</TableCell>
                        <TableCell className="font-mono text-sm">{server.currentBuild || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{server.currentCU || server.currentSP || '-'}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{server.requiredCU || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const pendingCount = getPendingCount(server);
                            if (pendingCount > 0) {
                              return (
                                <span className={cn('font-bold', {
                                  'text-primary': server.patchStatus === 'Compliant',
                                  'text-red-500': pendingCount >= 3 && server.patchStatus !== 'Compliant',
                                  'text-warning': pendingCount < 3 && server.patchStatus !== 'Compliant',
                                })}>
                                  {pendingCount}
                                </span>
                              );
                            }
                            return <span className="text-emerald-500">0</span>;
                          })()}
                        </TableCell>
                        <TableCell>{getStatusBadge(server.patchStatus, server.majorVersion)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-primary" /> Compliance (cumple requisito de parcheo)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-warning" /> No Compliance (pendiente de actualizar)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" /> Obsoleto (sin soporte)
        </span>
      </div>
    </div>
  );
}
