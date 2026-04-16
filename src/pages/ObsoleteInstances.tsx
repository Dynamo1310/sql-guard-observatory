/**
 * Página de Instancias Obsoletas - Multi-motor
 * Muestra instancias con versiones fuera de soporte y próximas a quedar obsoletas
 * Soporta SQL Server, PostgreSQL (AWS RDS), Redis (AWS ElastiCache) y DocumentDB
 */
import { useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, Clock, Server, RefreshCw, Download, Search,
  CalendarX2, ShieldAlert, Database, TrendingDown,
  ExternalLink, Info, Layers,
} from 'lucide-react';
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
import { PostgreSqlIcon } from '@/components/icons/PostgreSqlIcon';
import { RedisIcon } from '@/components/icons/RedisIcon';
import { DocumentDbIcon } from '@/components/icons/DocumentDbIcon';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { patchingApi } from '@/services/api';
import { postgresqlInventoryApi } from '@/services/postgresqlInventoryApi';
import { redisInventoryApi } from '@/services/redisInventoryApi';
import { documentdbInventoryApi } from '@/services/documentdbInventoryApi';
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
import { cn } from '@/lib/utils';
import {
  PieChart,
  Pie,
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
  type ChartConfig,
} from '@/components/ui/chart';

// ==================== TIPOS ====================

type EngineKind = 'SQL Server' | 'PostgreSQL' | 'Redis' | 'DocumentDB';

const ENGINES: EngineKind[] = ['SQL Server', 'PostgreSQL', 'Redis', 'DocumentDB'];

interface VersionLifecycle {
  version: string;
  name: string;
  endOfSupport: string; // ISO date
}

interface ObsoleteRow {
  engine: EngineKind;
  serverName: string;
  instanceName: string;
  ambiente: string;
  hostingSite: string;
  versionKey: string;          // normalizada para matching
  versionDisplay: string;      // raw para mostrar
  build: string | null;        // solo SQL Server
  endOfSupport: string | null;
  versionInfo: VersionLifecycle | null;
  status: 'obsolete' | 'near-obsolete' | 'supported';
}

// ==================== TABLAS DE FIN DE SOPORTE ====================
// Fuentes públicas: AWS RDS / ElastiCache / DocumentDB lifecycle policies + Microsoft Lifecycle.
// Si AWS extiende el soporte estándar de alguna versión, actualizar esta tabla.

const ENGINE_LIFECYCLE: Record<EngineKind, VersionLifecycle[]> = {
  'SQL Server': [
    { version: '2005',    name: 'SQL Server 2005',    endOfSupport: '2016-04-12' },
    { version: '2008',    name: 'SQL Server 2008',    endOfSupport: '2019-07-09' },
    { version: '2008 R2', name: 'SQL Server 2008 R2', endOfSupport: '2019-07-09' },
    { version: '2012',    name: 'SQL Server 2012',    endOfSupport: '2022-07-12' },
    { version: '2014',    name: 'SQL Server 2014',    endOfSupport: '2024-07-09' },
    { version: '2016',    name: 'SQL Server 2016',    endOfSupport: '2026-07-14' },
  ],
  'PostgreSQL': [
    { version: '11', name: 'PostgreSQL 11', endOfSupport: '2024-02-29' },
    { version: '12', name: 'PostgreSQL 12', endOfSupport: '2025-02-28' },
    { version: '13', name: 'PostgreSQL 13', endOfSupport: '2026-02-28' },
    { version: '14', name: 'PostgreSQL 14', endOfSupport: '2026-11-12' },
    { version: '15', name: 'PostgreSQL 15', endOfSupport: '2027-11-11' },
    { version: '16', name: 'PostgreSQL 16', endOfSupport: '2028-11-09' },
    { version: '17', name: 'PostgreSQL 17', endOfSupport: '2029-11-08' },
  ],
  'Redis': [
    { version: '2.6', name: 'Redis 2.6', endOfSupport: '2024-04-30' },
    { version: '2.8', name: 'Redis 2.8', endOfSupport: '2024-04-30' },
    { version: '3.2', name: 'Redis 3.2', endOfSupport: '2024-04-30' },
    { version: '4.0', name: 'Redis 4.0', endOfSupport: '2024-08-31' },
    { version: '5.0', name: 'Redis 5.0', endOfSupport: '2024-08-31' },
    { version: '6.0', name: 'Redis 6.0', endOfSupport: '2024-08-31' },
  ],
  'DocumentDB': [
    { version: '3.6', name: 'DocumentDB 3.6', endOfSupport: '2023-04-30' },
  ],
};

const NEAR_OBSOLETE_MONTHS = 12;

// ==================== HELPERS ====================

function extractVersionKey(engine: EngineKind, raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = String(raw).trim();
  if (engine === 'SQL Server') return cleaned; // ya viene "2014", "2008 R2", etc.

  if (engine === 'PostgreSQL') {
    // "PostgreSQL 16" / "16" / "16.4" → "16"
    const m = cleaned.match(/(\d+)/);
    return m ? m[1] : cleaned;
  }

  // Redis & DocumentDB: "5", "5.0", "5.0.6", "Redis 5.0", "redis7.0.4" → "5.0" o "5"
  const m = cleaned.match(/(\d+)(?:\.(\d+))?/);
  if (!m) return cleaned;
  return m[2] !== undefined ? `${m[1]}.${m[2]}` : m[1];
}

function findVersionInfo(engine: EngineKind, versionKey: string): VersionLifecycle | null {
  if (!versionKey) return null;
  const entries = ENGINE_LIFECYCLE[engine];
  const exact = entries.find(v => v.version === versionKey);
  if (exact) return exact;
  // Fallback Redis/DocumentDB: SOLO cuando el inventario trae el major sin minor
  // (ej. "5" → matchea contra "5.0" en la lifecycle). NO usar fallback cuando viene
  // con minor (ej. "6.2" no debe matchear "6.0", son versiones distintas).
  if ((engine === 'Redis' || engine === 'DocumentDB') && !versionKey.includes('.')) {
    const byMajor = entries.find(v => v.version.split('.')[0] === versionKey);
    if (byMajor) return byMajor;
  }
  return null;
}

function classifyStatus(engine: EngineKind, versionKey: string): {
  status: ObsoleteRow['status'];
  endOfSupport: string | null;
  versionInfo: VersionLifecycle | null;
} {
  const versionInfo = findVersionInfo(engine, versionKey);
  if (!versionInfo) {
    return { status: 'supported', endOfSupport: null, versionInfo: null };
  }
  const today = new Date();
  const eos = new Date(versionInfo.endOfSupport);
  if (eos.getTime() <= today.getTime()) {
    return { status: 'obsolete', endOfSupport: versionInfo.endOfSupport, versionInfo };
  }
  const monthsRemaining = (eos.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsRemaining <= NEAR_OBSOLETE_MONTHS) {
    return { status: 'near-obsolete', endOfSupport: versionInfo.endOfSupport, versionInfo };
  }
  return { status: 'supported', endOfSupport: versionInfo.endOfSupport, versionInfo };
}

function getMonthsRemaining(endOfSupportDate: string): number {
  const today = new Date();
  const endDate = new Date(endOfSupportDate);
  const diffMonths = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  return Math.max(0, diffMonths);
}

function getYearsOutOfSupport(endOfSupportDate: string): number {
  const today = new Date();
  const endDate = new Date(endOfSupportDate);
  const diffYears = (today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(0, Math.floor(diffYears));
}

// Convierte el primer <svg> de un container a PNG (data URL).
// Resuelve var(--xxx) leyendo getComputedStyle del propio container,
// porque <ChartContainer> de shadcn inyecta los colores por CSS vars.
async function chartContainerToPngDataUrl(
  container: HTMLElement,
  scale = 2,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const svgEl = container.querySelector('svg') as SVGSVGElement | null;
  if (!svgEl) return null;

  const bbox = svgEl.getBoundingClientRect();
  const w = Math.max(1, Math.ceil(bbox.width));
  const h = Math.max(1, Math.ceil(bbox.height));

  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  let xml = new XMLSerializer().serializeToString(clone);
  const containerStyle = window.getComputedStyle(container);
  xml = xml.replace(/var\(--([a-zA-Z0-9_-]+)\)/g, (m, varName) => {
    const v = containerStyle.getPropertyValue(`--${varName}`).trim();
    return v || m;
  });

  const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ==================== ESTILOS POR MOTOR ====================

const ENGINE_SHORT: Record<EngineKind, string> = {
  'SQL Server': 'SQL',
  'PostgreSQL': 'PG',
  'Redis': 'Redis',
  'DocumentDB': 'DocDB',
};

const ENGINE_BADGE_CLASS: Record<EngineKind, string> = {
  'SQL Server': 'bg-red-500/10 text-red-600 border-red-500/30',
  'PostgreSQL': 'bg-sky-500/10 text-sky-600 border-sky-500/30',
  'Redis':      'bg-purple-500/10 text-purple-600 border-purple-500/30',
  'DocumentDB': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
};

// Paleta para el pie chart — colores graduados por engine
const ENGINE_PIE_PALETTE: Record<EngineKind, string[]> = {
  'SQL Server': ['#7f1d1d', '#b91c1c', '#dc2626', '#f97316', '#fb923c', '#fbbf24'],
  'PostgreSQL': ['#0c4a6e', '#075985', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc'],
  'Redis':      ['#581c87', '#7e22ce', '#a855f7', '#c084fc', '#d8b4fe'],
  'DocumentDB': ['#14532d', '#15803d', '#22c55e', '#4ade80'],
};

function pieColorFor(engine: EngineKind, versionKey: string): string {
  const palette = ENGINE_PIE_PALETTE[engine];
  const versions = ENGINE_LIFECYCLE[engine].map(v => v.version);
  const idx = versions.indexOf(versionKey);
  return palette[idx >= 0 ? idx % palette.length : 0];
}

function EngineIcon({ engine, className }: { engine: EngineKind; className?: string }) {
  switch (engine) {
    case 'SQL Server': return <SqlServerIcon className={className} />;
    case 'PostgreSQL': return <PostgreSqlIcon className={className} />;
    case 'Redis':      return <RedisIcon className={className} />;
    case 'DocumentDB': return <DocumentDbIcon className={className} />;
  }
}

const ambienteChartConfig = {
  obsolete:     { label: 'Obsoletos',      color: '#dc2626' },
  nearObsolete: { label: 'Próx. Obsoletos', color: '#f59e0b' },
  supported:    { label: 'Con Soporte',     color: '#22c55e' },
} satisfies ChartConfig;

// ==================== COMPONENTE ====================

type EngineTab = 'all' | EngineKind;

export default function ObsoleteInstances() {
  const [selectedEngine, setSelectedEngine] = useState<EngineTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [ambienteFilter, setAmbienteFilter] = useState<string>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, obsolete, near-obsolete

  const pieChartRef = useRef<HTMLDivElement>(null);
  const barChartRef = useRef<HTMLDivElement>(null);

  const sqlQuery = useQuery({
    queryKey: ['patchStatus'],
    queryFn: () => patchingApi.getStatus(false),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const pgQuery = useQuery({
    queryKey: ['pgInventoryAll'],
    queryFn: () => postgresqlInventoryApi.getInstances({ pageSize: 10000 }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const redisQuery = useQuery({
    queryKey: ['redisInventoryAll'],
    queryFn: () => redisInventoryApi.getInstances({ pageSize: 10000 }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const docdbQuery = useQuery({
    queryKey: ['docdbInventoryAll'],
    queryFn: () => documentdbInventoryApi.getInstances({ pageSize: 10000 }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const isLoading  = sqlQuery.isLoading || pgQuery.isLoading || redisQuery.isLoading || docdbQuery.isLoading;
  const isFetching = sqlQuery.isFetching || pgQuery.isFetching || redisQuery.isFetching || docdbQuery.isFetching;
  const isError    = sqlQuery.isError || pgQuery.isError || redisQuery.isError || docdbQuery.isError;
  const error      = sqlQuery.error || pgQuery.error || redisQuery.error || docdbQuery.error;

  const refetchAll = () => {
    sqlQuery.refetch();
    pgQuery.refetch();
    redisQuery.refetch();
    docdbQuery.refetch();
  };

  // Combinar todas las fuentes en filas unificadas
  const allRows: ObsoleteRow[] = useMemo(() => {
    const rows: ObsoleteRow[] = [];

    // SQL Server
    sqlQuery.data
      ?.filter(s => s.connectionSuccess === true)
      .forEach(s => {
        const versionKey = extractVersionKey('SQL Server', s.majorVersion);
        const cls = classifyStatus('SQL Server', versionKey);
        rows.push({
          engine: 'SQL Server',
          serverName: s.serverName,
          instanceName: s.instanceName,
          ambiente: s.ambiente || 'Sin definir',
          hostingSite: s.hostingSite || '',
          versionKey,
          versionDisplay: s.majorVersion || '-',
          build: s.currentBuild || null,
          endOfSupport: cls.endOfSupport,
          versionInfo: cls.versionInfo,
          status: cls.status,
        });
      });

    // PostgreSQL
    pgQuery.data?.data?.forEach(p => {
      const versionKey = extractVersionKey('PostgreSQL', p.MajorVersion);
      const cls = classifyStatus('PostgreSQL', versionKey);
      rows.push({
        engine: 'PostgreSQL',
        serverName: p.ServerName,
        instanceName: p.NombreInstancia,
        ambiente: p.ambiente || 'Sin definir',
        hostingSite: p.hostingSite || '',
        versionKey,
        versionDisplay: p.ProductVersion || p.MajorVersion || '-',
        build: null,
        endOfSupport: cls.endOfSupport,
        versionInfo: cls.versionInfo,
        status: cls.status,
      });
    });

    // Redis
    redisQuery.data?.data?.forEach(r => {
      const versionKey = extractVersionKey('Redis', r.ProductVersion);
      const cls = classifyStatus('Redis', versionKey);
      rows.push({
        engine: 'Redis',
        serverName: r.ServerName,
        instanceName: r.NombreInstancia,
        ambiente: r.ambiente || 'Sin definir',
        hostingSite: r.hostingSite || '',
        versionKey,
        versionDisplay: r.ProductVersion || '-',
        build: null,
        endOfSupport: cls.endOfSupport,
        versionInfo: cls.versionInfo,
        status: cls.status,
      });
    });

    // DocumentDB
    docdbQuery.data?.data?.forEach(d => {
      const versionKey = extractVersionKey('DocumentDB', d.ProductVersion);
      const cls = classifyStatus('DocumentDB', versionKey);
      rows.push({
        engine: 'DocumentDB',
        serverName: d.ServerName,
        instanceName: d.NombreInstancia,
        ambiente: d.ambiente || 'Sin definir',
        hostingSite: d.hostingSite || '',
        versionKey,
        versionDisplay: d.ProductVersion || '-',
        build: null,
        endOfSupport: cls.endOfSupport,
        versionInfo: cls.versionInfo,
        status: cls.status,
      });
    });

    return rows;
  }, [sqlQuery.data, pgQuery.data, redisQuery.data, docdbQuery.data]);

  // Filas en alcance del tab activo
  const scopedRows: ObsoleteRow[] = useMemo(() => {
    if (selectedEngine === 'all') return allRows;
    return allRows.filter(r => r.engine === selectedEngine);
  }, [allRows, selectedEngine]);

  // Contador de obsoletas + próximas por motor (para badges en los tabs)
  const engineRiskCounts = useMemo(() => {
    const counts: Record<EngineTab, number> = {
      all: 0,
      'SQL Server': 0,
      'PostgreSQL': 0,
      'Redis': 0,
      'DocumentDB': 0,
    };
    allRows.forEach(r => {
      if (r.status === 'obsolete' || r.status === 'near-obsolete') {
        counts[r.engine]++;
        counts.all++;
      }
    });
    return counts;
  }, [allRows]);

  // KPIs (filtrados por tab activo)
  const metrics = useMemo(() => {
    const total = scopedRows.length;
    const obsolete = scopedRows.filter(r => r.status === 'obsolete').length;
    const nearObsolete = scopedRows.filter(r => r.status === 'near-obsolete').length;
    const supported = total - obsolete - nearObsolete;
    const obsoleteRate = total > 0 ? Math.round((obsolete / total) * 100) : 0;
    const nearObsoleteRate = total > 0 ? Math.round((nearObsolete / total) * 100) : 0;
    const riskRate = total > 0 ? Math.round(((obsolete + nearObsolete) / total) * 100) : 0;
    return { total, obsolete, nearObsolete, supported, obsoleteRate, nearObsoleteRate, riskRate };
  }, [scopedRows]);

  // Pie chart: distribución por (motor, versión) entre las obsoletas
  // En tab específico, etiqueta sólo con la versión (no hace falta repetir motor)
  const pieData = useMemo(() => {
    const buckets: Record<string, { key: string; label: string; value: number; fill: string; engine: EngineKind; version: string }> = {};
    scopedRows.filter(r => r.status === 'obsolete').forEach(r => {
      const key = `${r.engine}|${r.versionKey}`;
      if (!buckets[key]) {
        buckets[key] = {
          key,
          label: selectedEngine === 'all'
            ? `${ENGINE_SHORT[r.engine]} ${r.versionKey}`
            : r.versionKey,
          value: 0,
          fill: pieColorFor(r.engine, r.versionKey),
          engine: r.engine,
          version: r.versionKey,
        };
      }
      buckets[key].value++;
    });
    return Object.values(buckets).sort((a, b) => {
      if (a.engine !== b.engine) return ENGINES.indexOf(a.engine) - ENGINES.indexOf(b.engine);
      const versions = ENGINE_LIFECYCLE[a.engine].map(v => v.version);
      return versions.indexOf(a.version) - versions.indexOf(b.version);
    });
  }, [scopedRows, selectedEngine]);

  // Config dinámica del pie chart
  const pieChartConfig = useMemo<ChartConfig>(() => {
    const cfg: ChartConfig = {};
    pieData.forEach(item => {
      cfg[item.key] = { label: item.label, color: item.fill };
    });
    return cfg;
  }, [pieData]);

  // Bar chart por ambiente
  const ambienteData = useMemo(() => {
    const byAmbiente: Record<string, { ambiente: string; obsolete: number; nearObsolete: number; supported: number; total: number }> = {};
    scopedRows.forEach(r => {
      const a = r.ambiente;
      if (!byAmbiente[a]) byAmbiente[a] = { ambiente: a, obsolete: 0, nearObsolete: 0, supported: 0, total: 0 };
      byAmbiente[a].total++;
      if (r.status === 'obsolete') byAmbiente[a].obsolete++;
      else if (r.status === 'near-obsolete') byAmbiente[a].nearObsolete++;
      else byAmbiente[a].supported++;
    });
    return Object.values(byAmbiente)
      .filter(a => a.obsolete > 0 || a.nearObsolete > 0)
      .sort((a, b) => (b.obsolete + b.nearObsolete) - (a.obsolete + a.nearObsolete));
  }, [scopedRows]);

  // Filas filtradas (solo obsoletas y próximas)
  const filteredRows = useMemo(() => {
    return scopedRows.filter(row => {
      if (statusFilter === 'obsolete' && row.status !== 'obsolete') return false;
      if (statusFilter === 'near-obsolete' && row.status !== 'near-obsolete') return false;
      if (statusFilter === 'all' && row.status === 'supported') return false;

      if (searchTerm) {
        const t = searchTerm.toLowerCase();
        if (!row.serverName.toLowerCase().includes(t) && !row.instanceName.toLowerCase().includes(t)) {
          return false;
        }
      }
      if (ambienteFilter !== 'all' && row.ambiente !== ambienteFilter) return false;
      if (versionFilter !== 'all' && `${row.engine}|${row.versionKey}` !== versionFilter) return false;
      return true;
    });
  }, [scopedRows, searchTerm, statusFilter, ambienteFilter, versionFilter]);

  // Filtros dinámicos (calculados sobre el set obsoleto/próximo del tab activo)
  const uniqueAmbientes = useMemo(() => {
    return [...new Set(
      scopedRows.filter(r => r.status !== 'supported').map(r => r.ambiente).filter(Boolean)
    )].sort();
  }, [scopedRows]);

  const uniqueVersionEntries = useMemo(() => {
    const seen = new Set<string>();
    const result: { key: string; label: string; engine: EngineKind }[] = [];
    scopedRows.filter(r => r.status !== 'supported').forEach(r => {
      const key = `${r.engine}|${r.versionKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        const label = selectedEngine === 'all'
          ? `${ENGINE_SHORT[r.engine]} ${r.versionKey}`
          : r.versionKey;
        result.push({ key, label, engine: r.engine });
      }
    });
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [scopedRows, selectedEngine]);

  // Export Excel
  const exportToExcel = async () => {
    if (!filteredRows.length) return;

    const ExcelJS = await import('exceljs');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SQL Guard Observatory';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Instancias Obsoletas');

    worksheet.columns = [
      { header: 'Motor',       key: 'engine',         width: 15 },
      { header: 'Servidor',    key: 'serverName',     width: 35 },
      { header: 'Instancia',   key: 'instanceName',   width: 35 },
      { header: 'Ambiente',    key: 'ambiente',       width: 15 },
      { header: 'Versión',     key: 'versionDisplay', width: 25 },
      { header: 'Build',       key: 'build',          width: 18 },
      { header: 'Fin Soporte', key: 'endOfSupport',   width: 18 },
      { header: 'Estado',      key: 'estado',         width: 20 },
      { header: 'Riesgo',      key: 'riesgo',         width: 15 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0066CC' },
    };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    filteredRows.forEach(r => {
      worksheet.addRow({
        engine: r.engine,
        serverName: r.serverName,
        instanceName: r.instanceName,
        ambiente: r.ambiente,
        versionDisplay: r.versionDisplay,
        build: r.build || '-',
        endOfSupport: r.endOfSupport ? new Date(r.endOfSupport).toLocaleDateString('es-ES') : 'N/A',
        estado: r.status === 'obsolete' ? 'Obsoleto' : 'Próximo a Obsoleto',
        riesgo: r.status === 'obsolete' ? 'CRÍTICO' : 'ADVERTENCIA',
      });
    });

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

        const estadoCell = row.getCell(8);
        const riesgoCell = row.getCell(9);
        if (estadoCell.value === 'Obsoleto') {
          estadoCell.font = { color: { argb: 'FFCC0000' }, bold: true };
          riesgoCell.font = { color: { argb: 'FFCC0000' }, bold: true };
        } else {
          estadoCell.font = { color: { argb: 'FFCC7700' }, bold: true };
          riesgoCell.font = { color: { argb: 'FFCC7700' }, bold: true };
        }
      }
    });

    worksheet.addRow([]);
    const totalRow = worksheet.addRow([`Total: ${filteredRows.length} instancias obsoletas / próximas a obsoletas`]);
    totalRow.font = { bold: true };
    totalRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFE599' },
    };

    // ===== Hoja "Gráficos" con imágenes embebidas =====
    const chartImages: { title: string; subtitle: string; data: { dataUrl: string; width: number; height: number } | null }[] = [
      {
        title: 'Distribución por Versión Obsoleta',
        subtitle: selectedEngine === 'all' ? 'Todos los motores' : selectedEngine,
        data: pieChartRef.current ? await chartContainerToPngDataUrl(pieChartRef.current) : null,
      },
      {
        title: 'Obsoletas por Ambiente',
        subtitle: selectedEngine === 'all' ? 'Todos los motores' : selectedEngine,
        data: barChartRef.current ? await chartContainerToPngDataUrl(barChartRef.current) : null,
      },
    ];

    const renderableCharts = chartImages.filter(c => c.data !== null);
    if (renderableCharts.length > 0) {
      const chartsSheet = workbook.addWorksheet('Gráficos');
      chartsSheet.getColumn(1).width = 90;

      let currentRow = 1;
      for (const chart of renderableCharts) {
        if (!chart.data) continue;

        const titleRow = chartsSheet.getRow(currentRow);
        titleRow.getCell(1).value = chart.title;
        titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF0066CC' } };
        currentRow++;

        const subtitleRow = chartsSheet.getRow(currentRow);
        subtitleRow.getCell(1).value = chart.subtitle;
        subtitleRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
        currentRow += 1;

        const base64 = chart.data.dataUrl.split(',')[1];
        const imgId = workbook.addImage({ base64, extension: 'png' });
        const imgWidth = Math.min(700, chart.data.width);
        const imgHeight = chart.data.height * (imgWidth / chart.data.width);
        chartsSheet.addImage(imgId, {
          tl: { col: 0, row: currentRow },
          ext: { width: imgWidth, height: imgHeight },
        });

        // Reservar filas debajo de la imagen (~20px por fila default)
        const rowsForImage = Math.ceil(imgHeight / 20) + 2;
        currentRow += rowsForImage;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `instancias_obsoletas_${new Date().toISOString().split('T')[0]}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: ObsoleteRow['status']) => {
    if (status === 'obsolete') return <Badge variant="destructive">Obsoleto</Badge>;
    if (status === 'near-obsolete') return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Próx. Obsoleto</Badge>;
    return <Badge variant="secondary">Con Soporte</Badge>;
  };

  // Error state
  if (isError) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center text-center py-12">
              <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error al cargar instancias</h3>
              <p className="text-muted-foreground mb-4">{(error as Error)?.message}</p>
              <Button onClick={refetchAll} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-80" />
          </div>
          <Skeleton className="h-9 w-28" />
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
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
              <ShieldAlert className="h-8 w-8 text-red-500" />
            </div>
            Instancias Obsoletas
          </h1>
          <p className="text-muted-foreground">
            SQL Server, PostgreSQL, Redis y DocumentDB fuera de soporte estándar (AWS / on-prem)
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={refetchAll} variant="outline" disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button onClick={exportToExcel} variant="outline" disabled={!filteredRows.length}>
            <Download className="w-4 h-4 mr-2" /> Excel
          </Button>
        </div>
      </div>

      {/* Tabs por motor */}
      <Tabs
        value={selectedEngine}
        onValueChange={(v) => {
          setSelectedEngine(v as EngineTab);
          setAmbienteFilter('all');
          setVersionFilter('all');
        }}
      >
        <TabsList className="grid w-full grid-cols-5 h-auto">
          <TabsTrigger value="all" className="flex items-center gap-2 py-2">
            <Layers className="h-4 w-4" />
            <span>Todos</span>
            {engineRiskCounts.all > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5">{engineRiskCounts.all}</Badge>
            )}
          </TabsTrigger>
          {ENGINES.map(e => (
            <TabsTrigger key={e} value={e} className="flex items-center gap-2 py-2">
              <EngineIcon engine={e} className="h-4 w-4" />
              <span>{e}</span>
              {engineRiskCounts[e] > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5">{engineRiskCounts[e]}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Monitoreadas</CardTitle>
            <Database className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{metrics.total}</div>
            <p className="text-xs text-muted-foreground">instancias activas (4 motores)</p>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Obsoletas</CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-red-500">{metrics.obsolete}</span>
              <span className="text-lg font-semibold text-red-500/70">
                ({metrics.obsoleteRate}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">sin soporte estándar</p>
          </CardContent>
        </Card>

        <Card className="border-warning/20 bg-warning/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próx. Obsoletas</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-warning">{metrics.nearObsolete}</span>
              <span className="text-lg font-semibold text-warning/70">
                ({metrics.nearObsoleteRate}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">soporte termina en ≤ {NEAR_OBSOLETE_MONTHS} meses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Riesgo Total</CardTitle>
            <TrendingDown className={`h-4 w-4 ${metrics.riskRate > 20 ? 'text-red-500' : 'text-warning'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.riskRate > 20 ? 'text-red-500' : 'text-warning'}`}>
              {metrics.riskRate}%
            </div>
            <p className="text-xs text-muted-foreground">del parque en riesgo</p>
          </CardContent>
        </Card>
      </div>

      {/* Info de versiones por motor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-primary" />
            Ciclo de Vida de Versiones por Motor
          </CardTitle>
          <CardDescription>
            Versiones contempladas en la clasificación. Los conteos provienen del inventario actual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={cn(
            'grid gap-4',
            selectedEngine === 'all'
              ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
              : 'grid-cols-1'
          )}>
            {(selectedEngine === 'all' ? ENGINES : [selectedEngine as EngineKind]).map(engine => {
              const versions = ENGINE_LIFECYCLE[engine];
              return (
                <div key={engine} className="space-y-2">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <EngineIcon engine={engine} className="h-4 w-4" />
                    {engine}
                  </h4>
                  <div className="space-y-1.5">
                    {versions.map(v => {
                      const count = allRows.filter(r => r.engine === engine && r.versionKey === v.version).length;
                      const cls = classifyStatus(engine, v.version);
                      const isObsolete = cls.status === 'obsolete';
                      const isNear = cls.status === 'near-obsolete';
                      const containerCls = isObsolete
                        ? 'bg-red-500/5 border-red-500/10'
                        : isNear
                        ? 'bg-warning/5 border-warning/10'
                        : 'bg-muted/30 border-muted';
                      return (
                        <div key={v.version} className={cn('flex justify-between items-center text-xs p-2 rounded border', containerCls)}>
                          <div className="flex flex-col">
                            <span className="font-medium">{v.name}</span>
                            <span className="text-muted-foreground text-[10px]">
                              fin: {new Date(v.endOfSupport).toLocaleDateString('es-ES')}
                              {isNear && ` (~${getMonthsRemaining(v.endOfSupport)}m)`}
                            </span>
                          </div>
                          <Badge
                            variant={count > 0 && (isObsolete || isNear) ? (isObsolete ? 'destructive' : 'outline') : 'secondary'}
                            className={cn({
                              'border-warning text-warning': count > 0 && isNear,
                            })}
                          >
                            {count}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>
                Fuentes: {' '}
                <a href="https://learn.microsoft.com/en-us/lifecycle/products/?products=sql-server" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Microsoft Lifecycle</a>
                {' • '}
                <a href="https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-versions.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AWS RDS PostgreSQL</a>
                {' • '}
                <a href="https://docs.aws.amazon.com/AmazonElastiCache/latest/rg-ug/supported-engine-versions.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AWS ElastiCache Redis</a>
                {' • '}
                <a href="https://docs.aws.amazon.com/documentdb/latest/developerguide/engine-versions.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AWS DocumentDB</a>
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      {metrics.obsolete > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Distribución por versión obsoleta */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Server className="h-4 w-4 text-red-500" />
                Distribución por Versión Obsoleta
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div ref={pieChartRef}>
              <ChartContainer config={pieChartConfig} className="mx-auto h-[200px]">
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel nameKey="key" />}
                  />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="key"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    strokeWidth={0}
                  />
                </PieChart>
              </ChartContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs mt-2">
                {pieData.map(item => (
                  <div key={item.key} className="flex items-center gap-1.5">
                    <EngineIcon engine={item.engine} className="h-3.5 w-3.5" />
                    <div
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: item.fill }}
                    />
                    <span className="text-muted-foreground">
                      {item.label} ({item.value})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Por ambiente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-primary" />
                Obsoletas por Ambiente
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {ambienteData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  Sin datos de ambientes con obsoletos
                </div>
              ) : (
                <div ref={barChartRef}>
                <ChartContainer
                  config={ambienteChartConfig}
                  className="w-full"
                  style={{ height: Math.max(200, ambienteData.length * 35 + 40) }}
                >
                  <BarChart data={ambienteData} layout="vertical" barSize={18} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis
                      dataKey="ambiente"
                      type="category"
                      tick={{ fontSize: 10 }}
                      width={80}
                      interval={0}
                    />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                    <Bar dataKey="obsolete" stackId="a" fill="var(--color-obsolete)" radius={[0, 0, 0, 0]} name="Obsoletos" />
                    <Bar dataKey="nearObsolete" stackId="a" fill="var(--color-nearObsolete)" radius={[0, 4, 4, 0]} name="Próx. Obsoletos" />
                  </BarChart>
                </ChartContainer>
                </div>
              )}
              <div className="flex justify-center gap-4 text-xs mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-600" />
                  <span className="text-muted-foreground">Obsoletos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span className="text-muted-foreground">Próx. Obsoletos</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabla de detalle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-red-500" />
            Detalle de Instancias
          </CardTitle>
          <CardDescription>
            {filteredRows.length} instancias {statusFilter === 'all' ? 'obsoletas o próximas' : statusFilter === 'obsolete' ? 'obsoletas' : 'próximas a obsoletas'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[150px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar servidor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="obsolete">Obsoletos</SelectItem>
                <SelectItem value="near-obsolete">Próx. Obsoletos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ambienteFilter} onValueChange={setAmbienteFilter}>
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {uniqueAmbientes.map(amb => (
                  <SelectItem key={amb} value={amb}>{amb}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={versionFilter} onValueChange={setVersionFilter}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue placeholder="Versión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueVersionEntries.map(ver => (
                  <SelectItem key={ver.key} value={ver.key}>{ver.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <div className="max-h-[500px] overflow-auto">
            {filteredRows.length === 0 ? (
              <div className="text-center py-12">
                <CalendarX2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay instancias obsoletas</h3>
                <p className="text-muted-foreground">
                  ¡Excelente! No tienes instancias con versiones fuera de soporte para los filtros aplicados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {selectedEngine === 'all' && <TableHead>Motor</TableHead>}
                    <TableHead>Servidor</TableHead>
                    <TableHead>Ambiente</TableHead>
                    <TableHead>Versión</TableHead>
                    {selectedEngine === 'all' || selectedEngine === 'SQL Server' ? <TableHead>Build</TableHead> : null}
                    <TableHead>Fin Soporte</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row, idx) => {
                    const isObsolete = row.status === 'obsolete';
                    return (
                      <TableRow
                        key={`${row.engine}-${row.instanceName}-${idx}`}
                        className={cn({
                          'bg-red-500/5': isObsolete,
                          'bg-warning/5': !isObsolete,
                        })}
                      >
                        {selectedEngine === 'all' && (
                          <TableCell>
                            <Badge variant="outline" className={cn('gap-1.5', ENGINE_BADGE_CLASS[row.engine])}>
                              <EngineIcon engine={row.engine} className="h-3 w-3" />
                              {row.engine}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <EngineIcon engine={row.engine} className="h-4 w-4" />
                                  <div className={cn('w-2 h-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-background', {
                                    'bg-red-500': isObsolete,
                                    'bg-warning': !isObsolete,
                                  })} />
                                </div>
                                <span className="font-medium truncate max-w-[160px]">{row.serverName}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Instancia: {row.instanceName}</p>
                              {row.hostingSite && <p>Hosting: {row.hostingSite}</p>}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.ambiente}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{row.versionDisplay}</span>
                        </TableCell>
                        {(selectedEngine === 'all' || selectedEngine === 'SQL Server') && (
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {row.build || '-'}
                          </TableCell>
                        )}
                        <TableCell>
                          {row.versionInfo && (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className={cn('text-sm', {
                                  'text-red-500': isObsolete,
                                  'text-warning': !isObsolete,
                                })}>
                                  {new Date(row.versionInfo.endOfSupport).toLocaleDateString('es-ES')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {isObsolete
                                  ? `Fuera de soporte hace ${getYearsOutOfSupport(row.versionInfo.endOfSupport)} años`
                                  : `Soporte termina en ~${getMonthsRemaining(row.versionInfo.endOfSupport)} meses`}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(row.status)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" /> Obsoleto (sin soporte)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-warning" /> Próximo a Obsoleto
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500" /> Con Soporte
        </span>
      </div>
    </div>
  );
}
