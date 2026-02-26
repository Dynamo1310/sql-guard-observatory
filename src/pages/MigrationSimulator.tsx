import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Search, Server, Database, AlertTriangle, CheckCircle2,
  RefreshCw, Download, ChevronDown, ChevronUp, Calculator, HardDrive,
  ArrowRight, ArrowLeft, Info, Layers, Monitor, ChevronRight,
  ListChecks, XCircle, Filter,
} from 'lucide-react';
import {
  migrationSimulatorApi,
  MigrationServerDto,
  MigrationDatabaseDto,
  NamingSuggestionResponse,
} from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Legend, Treemap as RechartsTreemap,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import ExcelJS from 'exceljs';

const SERVER_COLORS = [
  'hsl(217, 91%, 60%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)',
  'hsl(0, 84%, 60%)', 'hsl(280, 68%, 60%)', 'hsl(190, 90%, 50%)',
  'hsl(330, 80%, 60%)', 'hsl(60, 70%, 50%)', 'hsl(160, 60%, 45%)',
  'hsl(25, 95%, 53%)',
];

const INSTANCE_COLORS = [
  'hsl(210, 80%, 55%)', 'hsl(150, 65%, 45%)', 'hsl(35, 85%, 55%)',
  'hsl(340, 75%, 55%)', 'hsl(260, 65%, 55%)', 'hsl(180, 70%, 45%)',
];

const TARGET_VERSIONS = [
  { value: '16', label: 'SQL Server 2016' },
  { value: '17', label: 'SQL Server 2017' },
  { value: '19', label: 'SQL Server 2019' },
  { value: '22', label: 'SQL Server 2022' },
];

const DISK_TOTAL_GB = 500;
const DISK_RESERVED_GB = 50;
const DISK_USABLE_GB = DISK_TOTAL_GB - DISK_RESERVED_GB; // 450
const DATA_DISK_LETTERS = 'IJKLMNOPQRSTUVWXYZ'.split('');

const FIXED_DISKS: { letter: string; role: string; color: string }[] = [
  { letter: 'C', role: 'Sistema Operativo', color: 'bg-slate-400' },
  { letter: 'E', role: 'SQL Server', color: 'bg-slate-400' },
  { letter: 'F', role: 'TempDB Data', color: 'bg-slate-400' },
  { letter: 'G', role: 'TempDB Log', color: 'bg-slate-400' },
];

interface SelectedDb {
  instanceName: string;
  db: MigrationDatabaseDto;
}

interface DiskInfo {
  letter: string;
  usedGB: number;
  isExistingDisk: boolean;
  preExistingGB: number;
  newGB: number;
}

interface SuggestedInstance {
  name: string;
  index: number;
  databases: SelectedDb[];
  totalDataGB: number;
  totalLogGB: number;
  dataDisks: DiskInfo[];
  logDisk: { letter: string; usedGB: number };
  status: 'ok' | 'warning' | 'critical';
  isExisting: boolean;
  preExistingDataGB: number;
  preExistingLogGB: number;
  preExistingDbCount: number;
  preExistingDbNames: string[];
}

function detectEnvironment(instanceNames: string[]): string | null {
  const envs = new Set<string>();
  for (const name of instanceNames) {
    const upper = name.toUpperCase();
    if (upper.includes('DS')) envs.add('DS');
    else if (upper.includes('TS')) envs.add('TS');
    else if (upper.includes('PR')) envs.add('PR');
  }
  if (envs.size === 1) return [...envs][0];
  return null;
}

function getDiskLetterRange(count: number): string {
  if (count <= 0) return '-';
  if (count === 1) return 'I:';
  const last = DATA_DISK_LETTERS[Math.min(count - 1, DATA_DISK_LETTERS.length - 1)];
  return `I: a ${last}:`;
}

function getInstanceStatus(inst: { logDisk: { usedGB: number }; dataDisks: { usedGB: number }[] }): 'ok' | 'warning' | 'critical' {
  const dataUsed = inst.dataDisks.map(d => d.usedGB);
  if (dataUsed.some(u => u > DISK_USABLE_GB)) return 'critical';
  if (dataUsed.some(u => u > DISK_USABLE_GB * 0.85)) return 'warning';
  if (inst.logDisk.usedGB > DISK_USABLE_GB) return 'warning';
  if (inst.logDisk.usedGB > DISK_USABLE_GB * 0.85) return 'warning';
  return 'ok';
}

function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

/* ============================================================
   InfoTooltip helper
   ============================================================ */
function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline-block ml-1" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/* ============================================================
   Step Indicator
   ============================================================ */
function StepIndicator({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-6">
      {labels.map((label, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <div key={step} className="flex items-center">
            {i > 0 && (
              <div className={cn('w-12 h-0.5 mx-1', isDone ? 'bg-primary' : 'bg-muted-foreground/20')} />
            )}
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all',
                isActive ? 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2' :
                isDone ? 'bg-primary text-primary-foreground' :
                'bg-muted text-muted-foreground'
              )}>
                {isDone ? <CheckCircle2 className="h-4 w-4" /> : step}
              </div>
              <span className={cn('text-xs font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Main Component
   ============================================================ */
export default function MigrationSimulator() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [targetVersion, setTargetVersion] = useState<string>('');
  const [detectedEnv, setDetectedEnv] = useState<string | null>(null);
  const [manualEnv, setManualEnv] = useState<string>('');
  const [maxDataDisks, setMaxDataDisks] = useState(4);
  const [searchQuery, setSearchQuery] = useState('');
  const [ambienteFilter, setAmbienteFilter] = useState<string>('all');
  const [dbSearch, setDbSearch] = useState('');
  const [selectedDbs, setSelectedDbs] = useState<Set<string>>(new Set());
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [instanceFilter, setInstanceFilter] = useState<string>('all');
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});
  const [destinationStrategy, setDestinationStrategy] = useState<'new_only' | 'existing_only' | 'both'>('new_only');
  const [customInstanceNames, setCustomInstanceNames] = useState<string[]>([]);
  const [customNameInput, setCustomNameInput] = useState('');

  const environment = manualEnv || detectedEnv || '';

  const { data: instances, isLoading: loadingInstances } = useQuery({
    queryKey: ['migration-simulator-instances'],
    queryFn: () => migrationSimulatorApi.getInstances(),
  });

  const sourcesMutation = useMutation({
    mutationFn: (names: string[]) => migrationSimulatorApi.getSourceDatabases(names),
    onSuccess: (data) => {
      const allKeys = new Set<string>();
      const expanded = new Set<string>();
      data.servers.forEach(s => {
        if (s.connectionSuccess) {
          expanded.add(s.instanceName);
          s.databases.forEach(db => allKeys.add(`${s.instanceName}||${db.name}`));
        }
      });
      setSelectedDbs(allKeys);
      setExpandedServers(expanded);
    },
    onError: () => toast.error('Error al obtener databases de los servidores origen'),
  });

  const namingMutation = useMutation({
    mutationFn: ({ ver, env }: { ver: string; env: string }) =>
      migrationSimulatorApi.getNamingSuggestion(ver, env),
    onError: () => toast.error('Error al obtener sugerencia de nombres'),
  });

  const sourceData = sourcesMutation.data;
  const namingData = namingMutation.data;

  const ambientes = useMemo(() => {
    if (!instances) return [];
    return [...new Set(instances.map(i => i.ambiente).filter(Boolean))].sort();
  }, [instances]);

  const filteredInstances = useMemo(() => {
    if (!instances) return [];
    return instances.filter(i => {
      if (ambienteFilter !== 'all' && i.ambiente !== ambienteFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return i.nombreInstancia.toLowerCase().includes(q) ||
          i.serverName.toLowerCase().includes(q) ||
          (i.ambiente || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [instances, ambienteFilter, searchQuery]);

  const toggleSource = useCallback((name: string) => {
    setSelectedSources(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
      const env = detectEnvironment(next);
      setDetectedEnv(env);
      if (env) setManualEnv('');
      return next;
    });
  }, []);

  const handleSimulate = useCallback(() => {
    if (selectedSources.length === 0) {
      toast.warning('Seleccioná al menos un servidor origen');
      return;
    }
    if (!targetVersion) {
      toast.warning('Seleccioná la versión destino');
      return;
    }
    if (!environment) {
      toast.warning('No se pudo detectar el entorno. Seleccionalo manualmente.');
      return;
    }
    sourcesMutation.mutate(selectedSources);
    namingMutation.mutate({ ver: targetVersion, env: environment });
    setCurrentStep(3);
  }, [selectedSources, targetVersion, environment]);

  const connectedServers = useMemo(
    () => (sourceData?.servers ?? []).filter(s => s.connectionSuccess),
    [sourceData]
  );

  const serverColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    connectedServers.forEach((s, i) => { map[s.instanceName] = SERVER_COLORS[i % SERVER_COLORS.length]; });
    return map;
  }, [connectedServers]);

  const selectedDbList = useMemo((): SelectedDb[] => {
    const list: SelectedDb[] = [];
    connectedServers.forEach(s => {
      s.databases.forEach(db => {
        if (selectedDbs.has(`${s.instanceName}||${db.name}`)) {
          list.push({ instanceName: s.instanceName, db });
        }
      });
    });
    return list;
  }, [connectedServers, selectedDbs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setManualAssignments({}); }, [selectedDbs.size, maxDataDisks, destinationStrategy, customInstanceNames.length]);

  const totals = useMemo(() => {
    let dataMB = 0, logMB = 0;
    selectedDbList.forEach(({ db }) => { dataMB += db.dataSizeMB; logMB += db.logSizeMB; });
    return { dataMB, logMB, totalMB: dataMB + logMB, count: selectedDbList.length };
  }, [selectedDbList]);

  const maxDbSize = useMemo(() => {
    if (connectedServers.length === 0) return 1;
    let max = 0;
    connectedServers.forEach(s => s.databases.forEach(db => { if (db.totalSizeMB > max) max = db.totalSizeMB; }));
    return max || 1;
  }, [connectedServers]);

  const moveDatabase = useCallback((dbKey: string, targetName: string) => {
    setManualAssignments(prev => {
      const next = { ...prev };
      if (targetName === '__auto__') delete next[dbKey];
      else next[dbKey] = targetName;
      return next;
    });
  }, []);

  const resetManualAssignments = useCallback(() => setManualAssignments({}), []);

  const manualAssignmentCount = Object.keys(manualAssignments).length;

  // --- Bin-packing distribution algorithm (considers existing instances + manual overrides) ---
  const suggestedInstances = useMemo((): SuggestedInstance[] => {
    if (!namingData || selectedDbList.length === 0) return [];

    const MAX_PHYSICAL_DATA_DISKS = DATA_DISK_LETTERS.length; // 18 (I: a Z:)
    const maxDataCapacityNew = maxDataDisks * DISK_USABLE_GB;
    const maxDataCapacityExisting = MAX_PHYSICAL_DATA_DISKS * DISK_USABLE_GB;

    const sorted = [...selectedDbList].sort((a, b) => b.db.totalSizeMB - a.db.totalSizeMB);

    const manualByTarget: Record<string, SelectedDb[]> = {};
    const autoDbs: SelectedDb[] = [];
    for (const item of sorted) {
      const key = `${item.instanceName}||${item.db.name}`;
      const target = manualAssignments[key];
      if (target && target !== '__auto__') {
        (manualByTarget[target] ??= []).push(item);
      } else {
        autoDbs.push(item);
      }
    }

    interface Bin {
      name: string;
      dbs: SelectedDb[];
      dataGB: number;
      logGB: number;
      isExisting: boolean;
      preExistingDataGB: number;
      preExistingLogGB: number;
      preExistingDbCount: number;
      preExistingDbNames: string[];
    }

    const bins: Bin[] = [];

    // Only add existing instances as bins when strategy allows it
    if (destinationStrategy !== 'new_only') {
      const existingConnected = (namingData.existingInstancesInfo ?? [])
        .filter(ei => ei.connectionSuccess)
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const ei of existingConnected) {
        const preDataGB = ei.currentDataSizeMB / 1024;
        const preLogGB = ei.currentLogSizeMB / 1024;
        bins.push({
          name: ei.name,
          dbs: [],
          dataGB: preDataGB,
          logGB: preLogGB,
          isExisting: true,
          preExistingDataGB: preDataGB,
          preExistingLogGB: preLogGB,
          preExistingDbCount: ei.currentDatabaseCount,
          preExistingDbNames: [...ei.currentDatabaseNames],
        });
      }
    }

    let nextNum = namingData.nextAvailableNumber;
    let customIdx = 0;
    const getNextNewName = (): string => {
      if (customIdx < customInstanceNames.length) {
        return customInstanceNames[customIdx++];
      }
      const numStr = nextNum.toString().padStart(2, '0');
      nextNum++;
      return `${namingData.baseName}-${numStr}`;
    };

    for (const [targetName, dbs] of Object.entries(manualByTarget)) {
      let bin = bins.find(b => b.name === targetName);
      if (!bin) {
        if (targetName === '__new__') {
          bin = {
            name: getNextNewName(),
            dbs: [],
            dataGB: 0,
            logGB: 0,
            isExisting: false,
            preExistingDataGB: 0,
            preExistingLogGB: 0,
            preExistingDbCount: 0,
            preExistingDbNames: [],
          };
          bins.push(bin);
        } else {
          bin = {
            name: targetName,
            dbs: [],
            dataGB: 0,
            logGB: 0,
            isExisting: false,
            preExistingDataGB: 0,
            preExistingLogGB: 0,
            preExistingDbCount: 0,
            preExistingDbNames: [],
          };
          bins.push(bin);
        }
      }
      for (const item of dbs) {
        bin.dbs.push(item);
        bin.dataGB += item.db.dataSizeMB / 1024;
        bin.logGB += item.db.logSizeMB / 1024;
      }
    }

    for (const item of autoDbs) {
      const dataGB = item.db.dataSizeMB / 1024;
      const logGB = item.db.logSizeMB / 1024;

      let placed = false;
      for (const bin of bins) {
        const binMaxData = bin.isExisting ? maxDataCapacityExisting : maxDataCapacityNew;
        if (bin.dataGB + dataGB <= binMaxData) {
          bin.dbs.push(item);
          bin.dataGB += dataGB;
          bin.logGB += logGB;
          placed = true;
          break;
        }
      }

      if (!placed) {
        bins.push({
          name: getNextNewName(),
          dbs: [item],
          dataGB,
          logGB,
          isExisting: false,
          preExistingDataGB: 0,
          preExistingLogGB: 0,
          preExistingDbCount: 0,
          preExistingDbNames: [],
        });
      }
    }

    const result = bins.filter(b => b.dbs.length > 0 || b.isExisting);

    return result.map((bin, idx) => {
      const dataDisks: DiskInfo[] = [];

      if (bin.isExisting && bin.preExistingDataGB > 0) {
        const eiInfo = (namingData.existingInstancesInfo ?? []).find(e => e.name === bin.name);
        const existingDiskCount = eiInfo?.currentDataDiskCount
          ? Math.max(1, eiInfo.currentDataDiskCount)
          : Math.max(1, Math.ceil(bin.preExistingDataGB / DISK_USABLE_GB));
        const prePerDisk = bin.preExistingDataGB / existingDiskCount;
        for (let d = 0; d < existingDiskCount; d++) {
          dataDisks.push({
            letter: DATA_DISK_LETTERS[d] || '?',
            usedGB: +prePerDisk.toFixed(1),
            isExistingDisk: true,
            preExistingGB: +prePerDisk.toFixed(1),
            newGB: 0,
          });
        }
        const lastExisting = dataDisks[dataDisks.length - 1];
        const freeOnLast = DISK_USABLE_GB - lastExisting.preExistingGB;
        let newDataRemaining = Math.max(0, bin.dataGB - bin.preExistingDataGB);
        if (freeOnLast > 0 && newDataRemaining > 0) {
          const fill = Math.min(freeOnLast, newDataRemaining);
          lastExisting.newGB = +fill.toFixed(1);
          lastExisting.usedGB = +(lastExisting.usedGB + fill).toFixed(1);
          newDataRemaining -= fill;
        }
        let nextDiskIdx = existingDiskCount;
        while (newDataRemaining > 0.01 && nextDiskIdx < MAX_PHYSICAL_DATA_DISKS) {
          const used = Math.min(newDataRemaining, DISK_USABLE_GB);
          dataDisks.push({
            letter: DATA_DISK_LETTERS[nextDiskIdx] || '?',
            usedGB: +used.toFixed(1),
            isExistingDisk: false,
            preExistingGB: 0,
            newGB: +used.toFixed(1),
          });
          newDataRemaining -= used;
          nextDiskIdx++;
        }
      } else {
        const totalDataForDisks = bin.dataGB;
        const diskCount = Math.min(MAX_PHYSICAL_DATA_DISKS, Math.max(1, Math.ceil(totalDataForDisks / DISK_USABLE_GB)));
        let remaining = totalDataForDisks;
        for (let d = 0; d < diskCount; d++) {
          const used = Math.min(remaining, DISK_USABLE_GB);
          dataDisks.push({
            letter: DATA_DISK_LETTERS[d] || '?',
            usedGB: +used.toFixed(1),
            isExistingDisk: false,
            preExistingGB: 0,
            newGB: +used.toFixed(1),
          });
          remaining -= used;
        }
      }

      const partial: Omit<SuggestedInstance, 'status'> = {
        name: bin.name,
        index: idx,
        databases: bin.dbs,
        totalDataGB: +bin.dataGB.toFixed(2),
        totalLogGB: +bin.logGB.toFixed(2),
        dataDisks,
        logDisk: { letter: 'H', usedGB: +bin.logGB.toFixed(1) },
        isExisting: bin.isExisting,
        preExistingDataGB: +bin.preExistingDataGB.toFixed(2),
        preExistingLogGB: +bin.preExistingLogGB.toFixed(2),
        preExistingDbCount: bin.preExistingDbCount,
        preExistingDbNames: bin.preExistingDbNames,
      };

      return { ...partial, status: getInstanceStatus(partial) } as SuggestedInstance;
    });
  }, [namingData, selectedDbList, maxDataDisks, manualAssignments, destinationStrategy, customInstanceNames]);

  const availableInstanceNames = useMemo(() =>
    suggestedInstances.map(i => i.name),
  [suggestedInstances]);

  const dbToInstanceMap = useMemo(() => {
    const map: Record<string, string> = {};
    suggestedInstances.forEach(inst => {
      inst.databases.forEach(({ instanceName, db }) => {
        map[`${instanceName}||${db.name}`] = inst.name;
      });
    });
    return map;
  }, [suggestedInstances]);

  // Map each db to its target disk letter
  const dbToDiskMap = useMemo(() => {
    const map: Record<string, string> = {};
    suggestedInstances.forEach(inst => {
      const sorted = [...inst.databases].sort((a, b) => b.db.dataSizeMB - a.db.dataSizeMB);
      const diskUsed: number[] = inst.dataDisks.map(d => d.preExistingGB);
      sorted.forEach(({ instanceName, db }) => {
        const key = `${instanceName}||${db.name}`;
        const dataGB = db.dataSizeMB / 1024;
        let bestDisk = 0;
        for (let d = 0; d < diskUsed.length; d++) {
          if (diskUsed[d] + dataGB <= DISK_USABLE_GB) { bestDisk = d; break; }
        }
        diskUsed[bestDisk] += dataGB;
        map[key] = inst.dataDisks[bestDisk]?.letter || '?';
      });
    });
    return map;
  }, [suggestedInstances]);

  const toggleServerDbs = useCallback((instanceName: string, checked: boolean) => {
    setSelectedDbs(prev => {
      const next = new Set(prev);
      const server = connectedServers.find(s => s.instanceName === instanceName);
      server?.databases.forEach(db => {
        const key = `${instanceName}||${db.name}`;
        if (checked) next.add(key); else next.delete(key);
      });
      return next;
    });
  }, [connectedServers]);

  const toggleDb = useCallback((instanceName: string, dbName: string) => {
    setSelectedDbs(prev => {
      const next = new Set(prev);
      const key = `${instanceName}||${dbName}`;
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectAllDbs = useCallback(() => {
    const allKeys = new Set<string>();
    connectedServers.forEach(s => s.databases.forEach(db => allKeys.add(`${s.instanceName}||${db.name}`)));
    setSelectedDbs(allKeys);
  }, [connectedServers]);

  const deselectAllDbs = useCallback(() => {
    setSelectedDbs(new Set());
  }, []);

  const isServerFullySelected = useCallback((instanceName: string) => {
    const server = connectedServers.find(s => s.instanceName === instanceName);
    if (!server || server.databases.length === 0) return false;
    return server.databases.every(db => selectedDbs.has(`${instanceName}||${db.name}`));
  }, [connectedServers, selectedDbs]);

  const filteredDbsFn = useCallback((dbs: MigrationDatabaseDto[]) => {
    if (!dbSearch) return dbs;
    const q = dbSearch.toLowerCase();
    return dbs.filter(db => db.name.toLowerCase().includes(q));
  }, [dbSearch]);

  const alerts = useMemo(() => {
    const list: { level: 'warning' | 'error'; text: string }[] = [];
    suggestedInstances.forEach(inst => {
      if (inst.logDisk.usedGB > DISK_USABLE_GB) {
        list.push({ level: 'error', text: `${inst.name}: logs (${inst.logDisk.usedGB.toFixed(1)} GB) exceden los ${DISK_USABLE_GB} GB usables del disco H:` });
      } else if (inst.logDisk.usedGB > DISK_USABLE_GB * 0.85) {
        list.push({ level: 'warning', text: `${inst.name}: disco H: al ${((inst.logDisk.usedGB / DISK_USABLE_GB) * 100).toFixed(0)}% de capacidad usable` });
      }
      inst.dataDisks.forEach(d => {
        if (d.usedGB > DISK_USABLE_GB) {
          list.push({ level: 'error', text: `${inst.name}: disco ${d.letter}: (${d.usedGB.toFixed(1)} GB) excede los ${DISK_USABLE_GB} GB usables` });
        } else if (d.usedGB > DISK_USABLE_GB * 0.85) {
          list.push({ level: 'warning', text: `${inst.name}: disco ${d.letter}: al ${((d.usedGB / DISK_USABLE_GB) * 100).toFixed(0)}% de capacidad usable` });
        }
      });
    });
    return list;
  }, [suggestedInstances]);

  const isLoading = sourcesMutation.isPending || namingMutation.isPending;
  const hasResults = sourceData && namingData && !isLoading;

  const canProceedStep1 = selectedSources.length > 0;
  const canSimulate = canProceedStep1 && !!targetVersion && !!environment;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Calculator className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Simulador de Migración</h1>
            <p className="text-muted-foreground">
              Calculá cuántas instancias nuevas necesitás y cómo distribuir las bases de datos
            </p>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator current={currentStep} labels={['Servidores Origen', 'Configuración', 'Resultados']} />

        {/* ======================== STEP 1: Source Servers ======================== */}
        {currentStep === 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="h-5 w-5" />
                Paso 1: Seleccionar Servidores Origen
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Seleccioná las instancias SQL Server que deseás consolidar en nuevas instancias.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar instancia..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
                </div>
                <Select value={ambienteFilter} onValueChange={setAmbienteFilter}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ambiente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los ambientes</SelectItem>
                    {ambientes.map(a => <SelectItem key={a} value={a!}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {loadingInstances ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : (
                <ScrollArea className="h-[320px] border rounded-md p-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1">
                    {filteredInstances.map(inst => {
                      const sel = selectedSources.includes(inst.nombreInstancia);
                      return (
                        <div
                          key={inst.id}
                          className={cn(
                            'flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-all text-sm',
                            sel ? 'bg-primary/10 border border-primary/30 shadow-sm' : 'hover:bg-accent border border-transparent'
                          )}
                          onClick={() => toggleSource(inst.nombreInstancia)}
                        >
                          <Checkbox checked={sel} className="pointer-events-none" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{inst.nombreInstancia}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {inst.ambiente} &middot; {inst.majorVersion || 'N/A'} &middot; {inst.edition || 'N/A'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {filteredInstances.length} disponible(s) &middot; <span className="font-semibold text-foreground">{selectedSources.length} seleccionado(s)</span>
                </span>
                <Button onClick={() => setCurrentStep(2)} disabled={!canProceedStep1}>
                  Siguiente <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ======================== STEP 2: Configuration ======================== */}
        {currentStep === 2 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Paso 2: Configurar Destino
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Configurá los parámetros de las nuevas instancias destino.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Selected sources summary */}
              <div className="p-3 rounded-md bg-muted/50 border">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Servidores seleccionados ({selectedSources.length}):</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSources.map(s => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>

              {/* Destination strategy */}
              <div className="space-y-3">
                <label className="text-sm font-medium flex items-center">
                  Estrategia de destino
                  <InfoTip text="Elegí si las bases deben ir a instancias que ya existen en el inventario, a instancias nuevas, o a ambas. 'Solo nuevas' ignora las existentes y crea desde cero." />
                </label>
                <RadioGroup
                  value={destinationStrategy}
                  onValueChange={(v) => setDestinationStrategy(v as 'new_only' | 'existing_only' | 'both')}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3"
                >
                  {([
                    { value: 'new_only', label: 'Solo instancias nuevas', desc: 'Crea instancias desde cero, ignora existentes' },
                    { value: 'existing_only', label: 'Solo instancias existentes', desc: 'Rellena existentes, crea nuevas solo si no caben' },
                    { value: 'both', label: 'Ambas (existentes + nuevas)', desc: 'Prioriza existentes, luego crea nuevas' },
                  ] as const).map(opt => (
                    <Label
                      key={opt.value}
                      htmlFor={`strategy-${opt.value}`}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors',
                        destinationStrategy === opt.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent'
                      )}
                    >
                      <RadioGroupItem value={opt.value} id={`strategy-${opt.value}`} className="mt-0.5" />
                      <div className="space-y-0.5">
                        <span className="text-sm font-medium">{opt.label}</span>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Target version */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center">
                    Versión destino
                    <InfoTip text="Seleccioná la versión de SQL Server para las nuevas instancias. Podés migrar a la misma versión o a cualquier versión superior." />
                  </label>
                  <Select value={targetVersion} onValueChange={setTargetVersion}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar versión..." /></SelectTrigger>
                    <SelectContent>
                      {TARGET_VERSIONS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Environment */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center">
                    Entorno
                    <InfoTip text="Se auto-detecta a partir de los nombres de los servidores origen (DS=Desarrollo, TS=Testing, PR=Producción). Podés cambiarlo manualmente si la detección es incorrecta." />
                  </label>
                  {detectedEnv ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-sm py-1.5 px-3">
                        {detectedEnv === 'DS' ? 'DS - Desarrollo' : detectedEnv === 'TS' ? 'TS - Testing' : detectedEnv === 'PR' ? 'PR - Producción' : detectedEnv}
                      </Badge>
                      <span className="text-xs text-muted-foreground">(auto-detectado)</span>
                    </div>
                  ) : (
                    <Select value={manualEnv} onValueChange={setManualEnv}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar entorno..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DS">DS - Desarrollo</SelectItem>
                        <SelectItem value="TS">TS - Testing</SelectItem>
                        <SelectItem value="PR">PR - Producción</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Max data disks */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center">
                    Max discos de datos: <span className="text-primary ml-1">{maxDataDisks}</span>
                    <InfoTip text={`Cada instancia puede tener de 1 a 18 discos para archivos de datos (.mdf/.ndf), usando las letras de I: a Z:. Cada disco tiene ${DISK_TOTAL_GB} GB totales (${DISK_USABLE_GB} GB usables, ${DISK_RESERVED_GB} GB reservados).`} />
                  </label>
                  <Slider value={[maxDataDisks]} onValueChange={v => setMaxDataDisks(v[0])} min={1} max={18} step={1} />
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>
                      Discos <span className="font-semibold">{getDiskLetterRange(maxDataDisks)}</span> &middot;
                      {maxDataDisks} &times; {DISK_USABLE_GB} GB = <span className="font-semibold text-foreground">{((maxDataDisks * DISK_USABLE_GB) / 1024).toFixed(1)} TB</span> max data por instancia
                    </p>
                  </div>
                </div>
              </div>

              {/* Custom instance names */}
              {destinationStrategy !== 'existing_only' && (
                <div className="space-y-3">
                  <label className="text-sm font-medium flex items-center">
                    Nombres de instancias destino (opcional)
                    <InfoTip text="Escribí nombres custom para las instancias destino. Si el nombre coincide con una instancia existente del inventario, se usará esa instancia con su data actual. Si no existe, se creará como instancia nueva. Si no escribís ningún nombre, se usan los nombres auto-generados." />
                  </label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ej: SSDS22-01, MI-SERVER-CUSTOM..."
                      value={customNameInput}
                      onChange={e => setCustomNameInput(e.target.value.toUpperCase())}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && customNameInput.trim()) {
                          e.preventDefault();
                          const name = customNameInput.trim();
                          if (!customInstanceNames.includes(name)) {
                            setCustomInstanceNames(prev => [...prev, name]);
                          }
                          setCustomNameInput('');
                        }
                      }}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!customNameInput.trim()}
                      onClick={() => {
                        const name = customNameInput.trim();
                        if (name && !customInstanceNames.includes(name)) {
                          setCustomInstanceNames(prev => [...prev, name]);
                        }
                        setCustomNameInput('');
                      }}
                    >
                      + Agregar
                    </Button>
                  </div>
                  {customInstanceNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {customInstanceNames.map((name, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs gap-1 pr-1">
                          {name}
                          <button
                            type="button"
                            className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                            onClick={() => setCustomInstanceNames(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <XCircle className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs text-muted-foreground"
                        onClick={() => setCustomInstanceNames([])}
                      >
                        Limpiar todo
                      </Button>
                    </div>
                  )}
                  {customInstanceNames.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Sin nombres custom. Se usarán nombres auto-generados (ej: {environment && targetVersion ? `SS${environment}${targetVersion}-01` : 'SSDS22-01'}).
                    </p>
                  )}
                </div>
              )}

              {/* Disk layout legend */}
              <DiskLayoutLegend maxDataDisks={maxDataDisks} />

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Volver
                </Button>
                <Button onClick={handleSimulate} disabled={isLoading || !canSimulate} size="lg">
                  {isLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  Simular Migración
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ======================== STEP 3: Results ======================== */}
        {currentStep === 3 && (
          <>
            {/* Nav back */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCurrentStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Modificar configuración
              </Button>
            </div>

            {/* Loading */}
            {isLoading && (
              <Card>
                <CardContent className="py-12 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-lg font-medium">Conectando a las instancias y recolectando datos...</p>
                  <p className="text-sm text-muted-foreground mt-1">Esto puede tardar unos segundos.</p>
                </CardContent>
              </Card>
            )}

            {/* Connection errors */}
            {sourceData && sourceData.servers.some(s => !s.connectionSuccess) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">Conexión fallida en algunos servidores:</p>
                  <ul className="mt-1 text-sm space-y-1">
                    {sourceData.servers.filter(s => !s.connectionSuccess).map(s => (
                      <li key={s.instanceName}><span className="font-medium">{s.instanceName}</span>: {s.errorMessage}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {hasResults && (
              <>
                {/* Database selection panel */}
                <DatabaseSelectionPanel
                  servers={connectedServers}
                  selectedDbs={selectedDbs}
                  expandedServers={expandedServers}
                  setExpandedServers={setExpandedServers}
                  toggleServerDbs={toggleServerDbs}
                  toggleDb={toggleDb}
                  isServerFullySelected={isServerFullySelected}
                  serverColorMap={serverColorMap}
                  dbSearch={dbSearch}
                  setDbSearch={setDbSearch}
                  filteredDbs={filteredDbsFn}
                  totals={totals}
                  selectAll={selectAllDbs}
                  deselectAll={deselectAllDbs}
                  maxDbSize={maxDbSize}
                />

                {/* Hint to scroll to instance cards for manual assignment */}
                {suggestedInstances.length > 0 && (
                  <Alert className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 dark:text-blue-300 flex items-center justify-between">
                      <span>
                        <span className="font-semibold">{suggestedInstances.length} instancia(s) sugerida(s).</span>{' '}
                        Podés reasignar bases entre instancias desde las tarjetas de abajo.
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-3 h-7 text-xs shrink-0 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300"
                        onClick={() => document.getElementById('instance-cards-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      >
                        <ArrowRight className="h-3 w-3 mr-1" />
                        Ver instancias
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Global alerts */}
                {alerts.filter(a => a.level === 'error').length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <p className="font-semibold">Problemas críticos en la distribución:</p>
                      <ul className="mt-1 space-y-1 text-sm">{alerts.filter(a => a.level === 'error').map((a, i) => <li key={i}>{a.text}</li>)}</ul>
                    </AlertDescription>
                  </Alert>
                )}

                {alerts.filter(a => a.level === 'warning').length > 0 && (
                  <Alert className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800 dark:text-yellow-300">
                      <p className="font-semibold">Advertencias de capacidad:</p>
                      <ul className="mt-1 space-y-1 text-sm">{alerts.filter(a => a.level === 'warning').map((a, i) => <li key={i}>{a.text}</li>)}</ul>
                    </AlertDescription>
                  </Alert>
                )}

                {alerts.length === 0 && totals.count > 0 && suggestedInstances.length > 0 && (
                  <Alert className="border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertDescription className="text-emerald-800 dark:text-emerald-300">
                      La distribución es viable. Todas las instancias tienen capacidad suficiente con {DISK_RESERVED_GB} GB de reserva en cada disco.
                    </AlertDescription>
                  </Alert>
                )}

                {/* KPI Cards */}
                {suggestedInstances.length > 0 && (
                  <KpiCards
                    suggestedInstances={suggestedInstances}
                    totals={totals}
                    namingData={namingData}
                    maxDataDisks={maxDataDisks}
                    destinationStrategy={destinationStrategy}
                  />
                )}

                {/* Empty state */}
                {totals.count === 0 && (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                      <p className="text-lg font-medium text-muted-foreground">No hay bases seleccionadas</p>
                      <p className="text-sm text-muted-foreground mt-1">Seleccioná al menos una base de datos del panel superior para ver la distribución.</p>
                    </CardContent>
                  </Card>
                )}

                {/* Instance cards */}
                {suggestedInstances.length > 0 && (
                  <div id="instance-cards-section" className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Layers className="h-5 w-5" />
                        Instancias Sugeridas
                      </h3>
                      <div className="flex items-center gap-2">
                        {manualAssignmentCount > 0 && (
                          <>
                            <Badge variant="secondary" className="text-xs">
                              {manualAssignmentCount} base(s) reasignada(s)
                            </Badge>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={resetManualAssignments}>
                              Resetear asignaciones
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <DiskLayoutLegend maxDataDisks={maxDataDisks} compact />
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {suggestedInstances.map(inst => (
                        <InstanceCard
                          key={inst.name}
                          instance={inst}
                          serverColorMap={serverColorMap}
                          availableInstances={availableInstanceNames}
                          onMoveDb={moveDatabase}
                          manualAssignments={manualAssignments}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Charts */}
                {totals.count > 0 && suggestedInstances.length > 0 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <StackedBarChart suggestedInstances={suggestedInstances} serverColorMap={serverColorMap} connectedServers={connectedServers} selectedDbs={selectedDbs} />
                    <DonutChart servers={connectedServers} selectedDbs={selectedDbs} serverColorMap={serverColorMap} />
                  </div>
                )}

                {totals.count > 0 && (
                  <TreemapChart selectedDbList={selectedDbList} serverColorMap={serverColorMap} />
                )}

                {/* Summary table */}
                {totals.count > 0 && (
                  <SummaryTable
                    selectedDbList={selectedDbList}
                    serverColorMap={serverColorMap}
                    totals={totals}
                    dbToInstanceMap={dbToInstanceMap}
                    dbToDiskMap={dbToDiskMap}
                    suggestedInstances={suggestedInstances}
                    instanceFilter={instanceFilter}
                    setInstanceFilter={setInstanceFilter}
                    onExport={() => handleExportExcel(selectedDbList, suggestedInstances, totals, connectedServers, namingData, targetVersion, dbToInstanceMap, dbToDiskMap)}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

/* ============================================================
   Disk Layout Legend
   ============================================================ */
function DiskLayoutLegend({ maxDataDisks, compact }: { maxDataDisks: number; compact?: boolean }) {
  const disks = [
    { letter: 'C:', role: 'OS', type: 'fixed' as const },
    { letter: 'E:', role: 'SQL Server', type: 'fixed' as const },
    { letter: 'F:', role: 'TempDB Data', type: 'fixed' as const },
    { letter: 'G:', role: 'TempDB Log', type: 'fixed' as const },
    { letter: 'H:', role: 'Logs (.ldf)', type: 'log' as const },
    { letter: `I:-${DATA_DISK_LETTERS[Math.min(maxDataDisks - 1, DATA_DISK_LETTERS.length - 1)]}:`, role: `Data (.mdf/.ndf) × ${maxDataDisks}`, type: 'data' as const },
  ];

  const colors = { fixed: 'bg-slate-300 dark:bg-slate-600', log: 'bg-violet-400 dark:bg-violet-600', data: 'bg-blue-400 dark:bg-blue-600' };
  const textColors = { fixed: 'text-slate-600 dark:text-slate-300', log: 'text-violet-700 dark:text-violet-300', data: 'text-blue-700 dark:text-blue-300' };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 text-[10px]">
        {disks.map(d => (
          <div key={d.letter} className="flex items-center gap-1">
            <div className={cn('w-2.5 h-2.5 rounded-sm', colors[d.type])} />
            <span className="font-medium">{d.letter}</span>
            <span className="text-muted-foreground">{d.role}</span>
          </div>
        ))}
        <div className="flex items-center gap-1 ml-2">
          <div className="w-2.5 h-2.5 rounded-sm bg-muted border border-dashed border-muted-foreground/30" />
          <span className="text-muted-foreground">Reserva ({DISK_RESERVED_GB} GB)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Layout estándar de discos por instancia:</p>
      <div className="flex flex-wrap gap-1.5">
        {disks.map(d => (
          <div key={d.letter} className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs', colors[d.type] + '/20', textColors[d.type])}>
            <div className={cn('w-3 h-3 rounded-sm', colors[d.type])} />
            <span className="font-semibold">{d.letter}</span>
            <span className="opacity-80">{d.role}</span>
            {d.type !== 'fixed' && (
              <span className="text-[10px] opacity-60">({DISK_USABLE_GB} GB usable)</span>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Cada disco variable tiene {DISK_TOTAL_GB} GB totales &middot; {DISK_RESERVED_GB} GB reservados &middot; <span className="font-semibold">{DISK_USABLE_GB} GB usables</span>
      </p>
    </div>
  );
}

/* ============================================================
   KPI Cards
   ============================================================ */
function KpiCards({ suggestedInstances, totals, namingData, maxDataDisks, destinationStrategy }: {
  suggestedInstances: SuggestedInstance[];
  totals: { dataMB: number; logMB: number; totalMB: number; count: number };
  namingData?: NamingSuggestionResponse;
  maxDataDisks: number;
  destinationStrategy: 'new_only' | 'existing_only' | 'both';
}) {
  const totalDataDisks = suggestedInstances.reduce((a, inst) => a + inst.dataDisks.length, 0);
  const maxCapacity = suggestedInstances.length * maxDataDisks * DISK_USABLE_GB;
  const totalDataGB = totals.dataMB / 1024;
  const totalLogGB = totals.logMB / 1024;
  const maxLogCapacity = suggestedInstances.length * DISK_USABLE_GB;

  const existingCount = suggestedInstances.filter(i => i.isExisting).length;
  const newCount = suggestedInstances.filter(i => !i.isExisting).length;
  const instanceSubText = destinationStrategy === 'new_only'
    ? suggestedInstances.map(i => i.name).join(', ')
    : existingCount > 0
      ? `${existingCount} existente${existingCount > 1 ? 's' : ''} + ${newCount} nueva${newCount !== 1 ? 's' : ''}`
      : suggestedInstances.map(i => i.name).join(', ');

  const kpis = [
    {
      title: 'Instancias Destino',
      value: suggestedInstances.length.toString(),
      sub: instanceSubText,
      icon: Server,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      extra: existingCount > 0
        ? `Reutilizando: ${suggestedInstances.filter(i => i.isExisting).map(i => i.name).join(', ')}`
        : undefined,
    },
    {
      title: 'Total Data',
      value: `${totalDataGB.toFixed(1)} GB`,
      sub: `${totals.count} base(s) seleccionada(s)`,
      icon: Database,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
      pct: maxCapacity > 0 ? (totalDataGB / maxCapacity) * 100 : 0,
      pctLabel: `${totalDataGB.toFixed(0)} / ${maxCapacity.toFixed(0)} GB capacidad usable`,
    },
    {
      title: 'Total Log',
      value: `${totalLogGB.toFixed(1)} GB`,
      sub: `Disco H: por instancia`,
      icon: HardDrive,
      color: 'text-violet-600',
      bgColor: 'bg-violet-500/10',
      pct: maxLogCapacity > 0 ? (totalLogGB / maxLogCapacity) * 100 : 0,
      pctLabel: `${totalLogGB.toFixed(0)} / ${maxLogCapacity.toFixed(0)} GB capacidad usable`,
    },
    {
      title: 'Discos de Datos',
      value: totalDataDisks.toString(),
      sub: `Rango: ${getDiskLetterRange(Math.max(...suggestedInstances.map(i => i.dataDisks.length)))}`,
      icon: Layers,
      color: 'text-cyan-600',
      bgColor: 'bg-cyan-500/10',
    },
  ];

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {kpis.map(kpi => (
        <Card key={kpi.title}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className={cn('p-2 rounded-lg', kpi.bgColor)}>
                <kpi.icon className={cn('h-5 w-5', kpi.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{kpi.title}</p>
                <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{kpi.sub}</p>
              </div>
            </div>
            {kpi.pct !== undefined && (
              <div className="mt-3">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', kpi.pct > 90 ? 'bg-red-500' : kpi.pct > 70 ? 'bg-yellow-500' : 'bg-emerald-500')}
                    style={{ width: `${Math.min(kpi.pct, 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{kpi.pctLabel}</p>
              </div>
            )}
            {kpi.extra && <p className="text-[10px] text-muted-foreground mt-1">{kpi.extra}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ============================================================
   Database Selection Panel
   ============================================================ */
function DatabaseSelectionPanel({
  servers, selectedDbs, expandedServers, setExpandedServers,
  toggleServerDbs, toggleDb, isServerFullySelected, serverColorMap,
  dbSearch, setDbSearch, filteredDbs, totals, selectAll, deselectAll, maxDbSize,
}: {
  servers: MigrationServerDto[];
  selectedDbs: Set<string>;
  expandedServers: Set<string>;
  setExpandedServers: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleServerDbs: (name: string, checked: boolean) => void;
  toggleDb: (inst: string, db: string) => void;
  isServerFullySelected: (name: string) => boolean;
  serverColorMap: Record<string, string>;
  dbSearch: string;
  setDbSearch: (v: string) => void;
  filteredDbs: (dbs: MigrationDatabaseDto[]) => MigrationDatabaseDto[];
  totals: { dataMB: number; logMB: number; totalMB: number; count: number };
  selectAll: () => void;
  deselectAll: () => void;
  maxDbSize: number;
}) {
  const totalAllDbs = servers.reduce((a, s) => a + s.databases.length, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Selección de Bases de Datos
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              <ListChecks className="h-3.5 w-3.5 mr-1" /> Todo
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              <XCircle className="h-3.5 w-3.5 mr-1" /> Nada
            </Button>
            <Badge variant="secondary" className="text-xs whitespace-nowrap">
              {totals.count}/{totalAllDbs} bases &middot; {(totals.dataMB / 1024).toFixed(1)} GB data &middot; {(totals.logMB / 1024).toFixed(1)} GB log
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filtrar bases por nombre..." value={dbSearch} onChange={e => setDbSearch(e.target.value)} className="pl-9" />
        </div>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {servers.map(server => {
              const isExpanded = expandedServers.has(server.instanceName);
              const dbs = filteredDbs(server.databases);
              const selectedCount = server.databases.filter(db => selectedDbs.has(`${server.instanceName}||${db.name}`)).length;
              const color = serverColorMap[server.instanceName];
              return (
                <Collapsible key={server.instanceName} open={isExpanded}
                  onOpenChange={() => setExpandedServers(prev => {
                    const next = new Set(prev);
                    if (next.has(server.instanceName)) next.delete(server.instanceName); else next.add(server.instanceName);
                    return next;
                  })}
                >
                  <div className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <Switch checked={isServerFullySelected(server.instanceName)} onCheckedChange={checked => toggleServerDbs(server.instanceName, checked)} />
                    <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-medium truncate">{server.instanceName}</span>
                      <Badge variant="outline" className="text-xs">{selectedCount}/{server.databases.length}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto mr-2">{(server.totalSizeMB / 1024).toFixed(1)} GB</span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <div className="ml-6 mt-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1">
                      {dbs.map(db => {
                        const key = `${server.instanceName}||${db.name}`;
                        const isSelected = selectedDbs.has(key);
                        const sizeRatio = maxDbSize > 0 ? (db.totalSizeMB / maxDbSize) * 100 : 0;
                        return (
                          <div key={key}
                            className={cn('flex items-center gap-2 p-1.5 rounded text-sm cursor-pointer transition-colors', isSelected ? 'bg-primary/5' : 'hover:bg-accent')}
                            onClick={() => toggleDb(server.instanceName, db.name)}
                          >
                            <Checkbox checked={isSelected} className="pointer-events-none" />
                            <div className="flex-1 min-w-0">
                              <span className="truncate font-mono text-xs block">{db.name}</span>
                              <div className="h-1 w-full rounded-full bg-muted mt-0.5 overflow-hidden">
                                <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${Math.max(sizeRatio, 2)}%` }} />
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {fmtSize(db.totalSizeMB)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Instance Card (suggested new instance)
   ============================================================ */
function InstanceCard({ instance, serverColorMap, availableInstances, onMoveDb, manualAssignments }: {
  instance: SuggestedInstance;
  serverColorMap: Record<string, string>;
  availableInstances: string[];
  onMoveDb: (dbKey: string, targetName: string) => void;
  manualAssignments: Record<string, string>;
}) {
  const color = INSTANCE_COLORS[instance.index % INSTANCE_COLORS.length];

  const statusConfig = {
    ok: { label: 'Viable', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
    warning: { label: 'Ajustado', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' },
    critical: { label: 'Excedido', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' },
  };

  const st = statusConfig[instance.status];

  const DiskBarVariable = ({ letter, usedGB, preExistingGB, newGB, role, roleColor, isExistingDisk }: {
    letter: string; usedGB: number; preExistingGB: number; newGB: number; role: string; roleColor: string; isExistingDisk: boolean;
  }) => {
    const pctOfUsable = (usedGB / DISK_USABLE_GB) * 100;
    const reservePctStart = (DISK_USABLE_GB / DISK_TOTAL_GB) * 100;
    const freeGB = Math.max(DISK_USABLE_GB - usedGB, 0);
    const barColor = pctOfUsable >= 100 ? 'bg-red-500' : pctOfUsable >= 85 ? 'bg-yellow-500' : roleColor;
    const preExPctOfTotal = (preExistingGB / DISK_TOTAL_GB) * 100;
    const newPctOfTotal = (newGB / DISK_TOTAL_GB) * 100;

    return (
      <div className="space-y-0.5">
        <div className="flex justify-between text-[10px]">
          <span className="font-medium">
            {letter}:\ <span className="text-muted-foreground">({role})</span>
            {isExistingDisk && <span className="ml-1 text-blue-600 dark:text-blue-400">[Existente]</span>}
            {!isExistingDisk && role === 'Data' && <span className="ml-1 text-emerald-600 dark:text-emerald-400">[Nuevo]</span>}
          </span>
          <span>
            {usedGB.toFixed(0)} / {DISK_USABLE_GB} GB
            <span className="text-muted-foreground ml-1">({pctOfUsable.toFixed(0)}%)</span>
          </span>
        </div>
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden relative">
          {preExistingGB > 0 && (
            <div className="absolute top-0 left-0 h-full bg-slate-500 dark:bg-slate-400 transition-all rounded-l-full"
              style={{ width: `${Math.min(preExPctOfTotal, 100)}%` }} />
          )}
          {newGB > 0 && (
            <div className={cn('absolute top-0 h-full transition-all', barColor)}
              style={{ left: `${Math.min(preExPctOfTotal, 100)}%`, width: `${Math.min(newPctOfTotal, 100 - preExPctOfTotal)}%` }} />
          )}
          <div
            className="absolute top-0 h-full bg-muted-foreground/10 border-l border-dashed border-muted-foreground/30"
            style={{ left: `${reservePctStart}%`, width: `${100 - reservePctStart}%` }}
          />
        </div>
        <div className="text-[9px] text-muted-foreground">
          {preExistingGB > 0 && (
            <span className="mr-1.5">Pre-existente: {preExistingGB.toFixed(1)} GB &middot;</span>
          )}
          {newGB > 0 && (
            <span className="mr-1.5">Nuevo: {newGB.toFixed(1)} GB &middot;</span>
          )}
          Libre: {freeGB.toFixed(1)} GB &middot; Reserva: {DISK_RESERVED_GB} GB
        </div>
      </div>
    );
  };

  const DiskBarFixed = ({ letter, role }: { letter: string; role: string }) => (
    <div className="flex items-center gap-2 text-[10px] py-0.5">
      <div className="w-7 text-right font-medium text-muted-foreground">{letter}:\</div>
      <div className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />
      <span className="text-muted-foreground w-24 text-right">{role}</span>
    </div>
  );

  const existingDisks = instance.dataDisks.filter(d => d.isExistingDisk);
  const newDisks = instance.dataDisks.filter(d => !d.isExistingDisk);

  const diskRangeLabel = (() => {
    const parts: string[] = [];
    if (existingDisks.length > 0) {
      parts.push(`Exist: ${existingDisks[0].letter}:-${existingDisks[existingDisks.length - 1].letter}:`);
    }
    if (newDisks.length > 0) {
      parts.push(`Nuevos: ${newDisks[0].letter}:-${newDisks[newDisks.length - 1].letter}:`);
    }
    if (parts.length === 0) return 'N/A';
    return parts.join(' | ');
  })();

  return (
    <Card className="border-l-4" style={{ borderLeftColor: color }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            {instance.name}
          </span>
          <div className="flex items-center gap-1.5">
            {instance.isExisting ? (
              <Badge variant="outline" className="text-[10px] font-semibold bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800">
                Existente
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                Nueva
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] font-normal">
              {diskRangeLabel}
            </Badge>
            <Badge className={cn('text-[10px] border', st.className)}>
              {st.label}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {instance.isExisting && instance.preExistingDbCount > 0 && (
          <div className="rounded-md bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 p-2 text-xs space-y-1">
            <p className="font-medium text-blue-800 dark:text-blue-300">
              Ya tiene {instance.preExistingDbCount} base(s) ({instance.preExistingDataGB.toFixed(1)} GB data, {instance.preExistingLogGB.toFixed(1)} GB log)
            </p>
            {instance.preExistingDbNames.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {instance.preExistingDbNames.slice(0, 8).map(n => (
                  <Badge key={n} variant="secondary" className="text-[9px] py-0 px-1.5 bg-blue-100/80 dark:bg-blue-900/40">
                    {n}
                  </Badge>
                ))}
                {instance.preExistingDbNames.length > 8 && (
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                    +{instance.preExistingDbNames.length - 8} más
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fixed disks */}
        <div className="space-y-0">
          {FIXED_DISKS.map(d => (
            <DiskBarFixed key={d.letter} letter={d.letter} role={d.role} />
          ))}
        </div>

        <Separator />

        {/* Variable disks */}
        <div className="space-y-2">
          <DiskBarVariable
            letter={instance.logDisk.letter}
            usedGB={instance.logDisk.usedGB}
            preExistingGB={instance.isExisting ? instance.preExistingLogGB : 0}
            newGB={instance.isExisting ? Math.max(0, instance.logDisk.usedGB - instance.preExistingLogGB) : instance.logDisk.usedGB}
            role="Logs"
            roleColor="bg-violet-500"
            isExistingDisk={instance.isExisting}
          />
          {instance.logDisk.usedGB > DISK_USABLE_GB && (
            <div className="text-[9px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1 -mt-1">
              <AlertTriangle className="h-3 w-3" />
              Logs exceden {DISK_USABLE_GB} GB — se requiere truncar logs post-migración
            </div>
          )}
          {instance.dataDisks.map(d => (
            <DiskBarVariable
              key={d.letter}
              letter={d.letter}
              usedGB={d.usedGB}
              preExistingGB={d.preExistingGB}
              newGB={d.newGB}
              role="Data"
              roleColor="bg-blue-500"
              isExistingDisk={d.isExistingDisk}
            />
          ))}
        </div>

        <Separator />

        {/* Databases to migrate */}
        {instance.databases.length > 0 && (
          <>
            <p className="text-[10px] font-medium text-muted-foreground">
              {instance.isExisting ? 'Bases a migrar aquí:' : 'Bases asignadas:'}
              <span className="ml-1 text-muted-foreground/60">(click en Mover para reasignar)</span>
            </p>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto">
              {instance.databases.map(({ instanceName, db }) => {
                const dbKey = `${instanceName}||${db.name}`;
                const isManual = !!manualAssignments[dbKey];
                return (
                  <div key={dbKey} className={cn(
                    'flex items-center gap-1.5 text-xs rounded-md px-1.5 py-1 border transition-colors',
                    isManual
                      ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                      : 'border-transparent hover:bg-accent'
                  )}>
                    <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: serverColorMap[instanceName] }} />
                    <span className="font-mono truncate flex-1 min-w-0">{db.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap text-[10px]">{fmtSize(db.totalSizeMB)}</span>
                    <Select
                      value={instance.name}
                      onValueChange={(val) => onMoveDb(dbKey, val === instance.name ? '__auto__' : val)}
                    >
                      <SelectTrigger className="h-6 w-auto min-w-[60px] px-1.5 text-[10px] gap-0.5 border-dashed">
                        <ArrowRight className="h-3 w-3 flex-shrink-0" />
                        <span>Mover</span>
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="__auto__" className="text-xs">Auto (algoritmo)</SelectItem>
                        {availableInstances.filter(n => n !== instance.name).map(n => (
                          <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>
                        ))}
                        <SelectItem value="__new__" className="text-xs font-medium text-emerald-600">+ Nueva instancia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t">
          <span>{instance.totalDataGB.toFixed(1)} GB data</span>
          <span>{instance.totalLogGB.toFixed(1)} GB log</span>
          <span>{instance.databases.length} a migrar</span>
          <span>{instance.dataDisks.length} disco(s)</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Stacked Bar Chart
   ============================================================ */
function StackedBarChart({
  suggestedInstances, serverColorMap, connectedServers, selectedDbs,
}: {
  suggestedInstances: SuggestedInstance[];
  serverColorMap: Record<string, string>;
  connectedServers: MigrationServerDto[];
  selectedDbs: Set<string>;
}) {
  const chartData = useMemo(() => {
    return suggestedInstances.map(inst => {
      const byServer: Record<string, number> = {};
      inst.databases.forEach(({ instanceName, db }) => {
        byServer[instanceName] = (byServer[instanceName] || 0) + db.totalSizeMB / 1024;
      });
      return {
        name: inst.name,
        ...Object.fromEntries(
          Object.entries(byServer).map(([k, v]) => [k, +v.toFixed(2)])
        ),
      };
    });
  }, [suggestedInstances]);

  const chartConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    connectedServers.forEach(s => { cfg[s.instanceName] = { label: s.instanceName, color: serverColorMap[s.instanceName] }; });
    return cfg;
  }, [connectedServers, serverColorMap]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Aporte por Servidor Origen por Instancia (GB)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {connectedServers.map(s => (
              <Bar key={s.instanceName} dataKey={s.instanceName} stackId="stack" fill={serverColorMap[s.instanceName]} />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Donut Chart
   ============================================================ */
function DonutChart({
  servers, selectedDbs, serverColorMap,
}: {
  servers: MigrationServerDto[];
  selectedDbs: Set<string>;
  serverColorMap: Record<string, string>;
}) {
  const { dataDonut, logDonut, chartConfig } = useMemo(() => {
    const data: { name: string; value: number; fill: string }[] = [];
    const log: { name: string; value: number; fill: string }[] = [];
    const cfg: ChartConfig = {};
    servers.forEach(s => {
      let dMB = 0, lMB = 0;
      s.databases.forEach(db => {
        if (selectedDbs.has(`${s.instanceName}||${db.name}`)) { dMB += db.dataSizeMB; lMB += db.logSizeMB; }
      });
      cfg[s.instanceName] = { label: s.instanceName, color: serverColorMap[s.instanceName] };
      if (dMB > 0) data.push({ name: s.instanceName, value: +(dMB / 1024).toFixed(2), fill: serverColorMap[s.instanceName] });
      if (lMB > 0) log.push({ name: s.instanceName, value: +(lMB / 1024).toFixed(2), fill: serverColorMap[s.instanceName] });
    });
    return { dataDonut: data, logDonut: log, chartConfig: cfg };
  }, [servers, selectedDbs, serverColorMap]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Distribución por Origen (GB)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Data Files</p>
            <ChartContainer config={chartConfig} className="h-[200px]">
              <PieChart>
                <Pie data={dataDonut} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value" nameKey="name">
                  {dataDonut.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(2)} GB`} />} />
              </PieChart>
            </ChartContainer>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1 font-medium">Log Files</p>
            <ChartContainer config={chartConfig} className="h-[200px]">
              <PieChart>
                <Pie data={logDonut} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} dataKey="value" nameKey="name">
                  {logDonut.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${Number(value).toFixed(2)} GB`} />} />
              </PieChart>
            </ChartContainer>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-center mt-2">
          {servers.map(s => (
            <div key={s.instanceName} className="flex items-center gap-1.5 text-xs">
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: serverColorMap[s.instanceName] }} />
              <span className="truncate max-w-[120px]">{s.instanceName}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Treemap Chart
   ============================================================ */
interface TreemapPayload { name: string; size: number; color: string; instance: string; }

function TreemapChart({ selectedDbList, serverColorMap }: { selectedDbList: SelectedDb[]; serverColorMap: Record<string, string> }) {
  const treemapData = useMemo(() => {
    return selectedDbList
      .filter(d => d.db.totalSizeMB > 0)
      .map(d => ({
        name: d.db.name,
        size: +(d.db.totalSizeMB / 1024).toFixed(2),
        color: serverColorMap[d.instanceName],
        instance: d.instanceName,
      }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 100);
  }, [selectedDbList, serverColorMap]);

  const chartConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    const uniqueServers = [...new Set(selectedDbList.map(d => d.instanceName))];
    uniqueServers.forEach(name => {
      cfg[name] = { label: name, color: serverColorMap[name] };
    });
    return cfg;
  }, [selectedDbList, serverColorMap]);

  const CustomContent = (props: any) => {
    const { x, y, width, height, name, color } = props;
    if (!name || width < 30 || height < 20) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={color || '#888'} stroke="#fff" strokeWidth={1.5} rx={2} />
        {width > 50 && height > 30 && (
          <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" className="fill-white text-[10px] font-medium">
            {name.length > width / 7 ? name.slice(0, Math.floor(width / 7)) + '...' : name}
          </text>
        )}
      </g>
    );
  };

  if (treemapData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Tamaño Relativo de Bases (GB)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <RechartsTreemap data={treemapData} dataKey="size" stroke="#fff" content={<CustomContent />}>
            <ChartTooltip content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload as TreemapPayload;
              if (!d?.name) return null;
              return (
                <div className="rounded-md bg-background border p-2 shadow-md text-xs">
                  <p className="font-medium">{d.name}</p>
                  <p className="text-muted-foreground">{d.instance}</p>
                  <p className="font-semibold mt-1">{d.size.toFixed(2)} GB</p>
                </div>
              );
            }} />
          </RechartsTreemap>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Summary Table
   ============================================================ */
function SummaryTable({
  selectedDbList, serverColorMap, totals, dbToInstanceMap, dbToDiskMap,
  suggestedInstances, instanceFilter, setInstanceFilter, onExport,
}: {
  selectedDbList: SelectedDb[];
  serverColorMap: Record<string, string>;
  totals: { dataMB: number; logMB: number; totalMB: number; count: number };
  dbToInstanceMap: Record<string, string>;
  dbToDiskMap: Record<string, string>;
  suggestedInstances: SuggestedInstance[];
  instanceFilter: string;
  setInstanceFilter: (v: string) => void;
  onExport: () => void;
}) {
  const [sortField, setSortField] = useState<string>('totalSizeMB');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const instanceColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    suggestedInstances.forEach((inst, i) => {
      map[inst.name] = INSTANCE_COLORS[i % INSTANCE_COLORS.length];
    });
    return map;
  }, [suggestedInstances]);

  const filtered = useMemo(() => {
    if (instanceFilter === 'all') return selectedDbList;
    return selectedDbList.filter(({ instanceName, db }) => {
      const target = dbToInstanceMap[`${instanceName}||${db.name}`];
      return target === instanceFilter;
    });
  }, [selectedDbList, instanceFilter, dbToInstanceMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: any, vb: any;
      if (sortField === 'instanceName') { va = a.instanceName; vb = b.instanceName; }
      else if (sortField === 'name') { va = a.db.name; vb = b.db.name; }
      else if (sortField === 'target') { va = dbToInstanceMap[`${a.instanceName}||${a.db.name}`] || ''; vb = dbToInstanceMap[`${b.instanceName}||${b.db.name}`] || ''; }
      else if (sortField === 'disk') { va = dbToDiskMap[`${a.instanceName}||${a.db.name}`] || ''; vb = dbToDiskMap[`${b.instanceName}||${b.db.name}`] || ''; }
      else { va = (a.db as any)[sortField] ?? 0; vb = (b.db as any)[sortField] ?? 0; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortDir, dbToInstanceMap, dbToDiskMap]);

  const requestSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };
  const sortIcon = (field: string) => {
    if (sortField !== field) return null;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Detalle de Bases Seleccionadas</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={instanceFilter} onValueChange={setInstanceFilter}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="Filtrar por destino..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las instancias</SelectItem>
                {suggestedInstances.map(inst => (
                  <SelectItem key={inst.name} value={inst.name}>{inst.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-1.5" />Exportar Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => requestSort('instanceName')}>Servidor Origen {sortIcon('instanceName')}</TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('name')}>Base de Datos {sortIcon('name')}</TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => requestSort('dataSizeMB')}>Data {sortIcon('dataSizeMB')}</TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => requestSort('logSizeMB')}>Log {sortIcon('logSizeMB')}</TableHead>
                <TableHead className="cursor-pointer text-right" onClick={() => requestSort('totalSizeMB')}>Total {sortIcon('totalSizeMB')}</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('target')}>Inst. Destino {sortIcon('target')}</TableHead>
                <TableHead className="cursor-pointer" onClick={() => requestSort('disk')}>Disco {sortIcon('disk')}</TableHead>
                <TableHead className="text-right">% Disco</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(({ instanceName, db }) => {
                const key = `${instanceName}||${db.name}`;
                const target = dbToInstanceMap[key];
                const diskLetter = dbToDiskMap[key] || '-';
                const pctOfDisk = db.dataSizeMB > 0 ? ((db.dataSizeMB / 1024) / DISK_USABLE_GB * 100) : 0;
                const instColor = target ? instanceColorMap[target] : undefined;
                return (
                  <TableRow key={key} style={instColor ? { backgroundColor: `${instColor}08` } : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: serverColorMap[instanceName] }} />
                        <span className="text-xs truncate max-w-[140px]">{instanceName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{db.name}</TableCell>
                    <TableCell className="text-right text-xs">{fmtSize(db.dataSizeMB)}</TableCell>
                    <TableCell className="text-right text-xs">{fmtSize(db.logSizeMB)}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{fmtSize(db.totalSizeMB)}</TableCell>
                    <TableCell>
                      <Badge variant={db.state === 'ONLINE' ? 'default' : 'secondary'} className="text-[10px]">{db.state || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-semibold">{target || '-'}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs font-medium">{diskLetter}:</TableCell>
                    <TableCell className="text-right text-xs">{pctOfDisk.toFixed(1)}%</TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/50 font-semibold">
                <TableCell colSpan={2}>TOTAL ({filtered.length} bases)</TableCell>
                <TableCell className="text-right text-xs">{fmtSize(totals.dataMB)}</TableCell>
                <TableCell className="text-right text-xs">{fmtSize(totals.logMB)}</TableCell>
                <TableCell className="text-right text-xs">{fmtSize(totals.totalMB)}</TableCell>
                <TableCell colSpan={4}></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================================================
   Excel Export
   ============================================================ */
async function handleExportExcel(
  selectedDbList: SelectedDb[],
  suggestedInstances: SuggestedInstance[],
  totals: { dataMB: number; logMB: number; totalMB: number; count: number },
  servers: MigrationServerDto[],
  namingData: NamingSuggestionResponse | undefined,
  targetVersion: string,
  dbToInstanceMap: Record<string, string>,
  dbToDiskMap: Record<string, string>,
) {
  try {
    const wb = new ExcelJS.Workbook();
    const versionLabel = TARGET_VERSIONS.find(v => v.value === targetVersion)?.label || targetVersion;

    // Sheet 1: Summary
    const ws1 = wb.addWorksheet('Resumen');
    ws1.columns = [
      { header: 'Concepto', key: 'concept', width: 40 },
      { header: 'Valor', key: 'value', width: 30 },
    ];
    ws1.addRow({ concept: 'Versión Destino', value: versionLabel });
    ws1.addRow({ concept: 'Entorno', value: namingData?.environment ?? '' });
    ws1.addRow({ concept: 'Total Bases Seleccionadas', value: totals.count });
    ws1.addRow({ concept: 'Total Data (GB)', value: +(totals.dataMB / 1024).toFixed(2) });
    ws1.addRow({ concept: 'Total Log (GB)', value: +(totals.logMB / 1024).toFixed(2) });
    ws1.addRow({ concept: 'Total General (GB)', value: +(totals.totalMB / 1024).toFixed(2) });
    ws1.addRow({ concept: 'Instancias Sugeridas', value: suggestedInstances.length });
    ws1.addRow({ concept: 'Nombres Sugeridos', value: suggestedInstances.map(i => i.name).join(', ') });
    ws1.addRow({ concept: 'Capacidad Usable por Disco (GB)', value: DISK_USABLE_GB });
    ws1.addRow({ concept: 'Espacio Reservado por Disco (GB)', value: DISK_RESERVED_GB });
    ws1.addRow({ concept: 'Capacidad Total por Disco (GB)', value: DISK_TOTAL_GB });
    ws1.addRow({ concept: '', value: '' });
    ws1.addRow({ concept: 'Servidores Origen', value: servers.map(s => s.instanceName).join(', ') });
    if (namingData?.existingInstances?.length) {
      ws1.addRow({ concept: 'Instancias ya existentes con este patrón', value: namingData.existingInstances.join(', ') });
    }
    ws1.getRow(1).font = { bold: true };

    // Sheet 2: Database detail
    const ws2 = wb.addWorksheet('Detalle Bases');
    ws2.columns = [
      { header: 'Servidor Origen', key: 'server', width: 30 },
      { header: 'Base de Datos', key: 'name', width: 30 },
      { header: 'Instancia Destino', key: 'target', width: 20 },
      { header: 'Disco Destino', key: 'disk', width: 14 },
      { header: '% Disco Usable', key: 'pctDisk', width: 14 },
      { header: 'Data (MB)', key: 'dataMB', width: 14 },
      { header: 'Log (MB)', key: 'logMB', width: 14 },
      { header: 'Total (MB)', key: 'totalMB', width: 14 },
      { header: 'Estado', key: 'state', width: 12 },
      { header: 'Recovery Model', key: 'recovery', width: 16 },
      { header: 'Collation', key: 'collation', width: 25 },
    ];
    selectedDbList.forEach(({ instanceName, db }) => {
      const key = `${instanceName}||${db.name}`;
      const pct = db.dataSizeMB > 0 ? +((db.dataSizeMB / 1024) / DISK_USABLE_GB * 100).toFixed(1) : 0;
      ws2.addRow({
        server: instanceName,
        name: db.name,
        target: dbToInstanceMap[key] || '',
        disk: dbToDiskMap[key] ? `${dbToDiskMap[key]}:\\` : '',
        pctDisk: pct,
        dataMB: +db.dataSizeMB.toFixed(2),
        logMB: +db.logSizeMB.toFixed(2),
        totalMB: +db.totalSizeMB.toFixed(2),
        state: db.state || '',
        recovery: db.recoveryModel || '',
        collation: db.collation || '',
      });
    });
    ws2.getRow(1).font = { bold: true };

    // Sheet 3: Disk layout per instance
    const ws3 = wb.addWorksheet('Layout Discos');
    ws3.columns = [
      { header: 'Instancia', key: 'instance', width: 20 },
      { header: 'Disco', key: 'disk', width: 10 },
      { header: 'Rol', key: 'role', width: 10 },
      { header: 'Usado (GB)', key: 'usedGB', width: 14 },
      { header: 'Usable (GB)', key: 'usableGB', width: 14 },
      { header: 'Reserva (GB)', key: 'reserveGB', width: 14 },
      { header: 'Total (GB)', key: 'totalGB', width: 14 },
      { header: 'Libre Usable (GB)', key: 'freeGB', width: 16 },
      { header: '% Uso (sobre usable)', key: 'pct', width: 18 },
      { header: 'Bases Asignadas', key: 'dbCount', width: 16 },
    ];
    suggestedInstances.forEach(inst => {
      ws3.addRow({
        instance: inst.name,
        disk: `${inst.logDisk.letter}:\\`,
        role: 'Log',
        usedGB: inst.logDisk.usedGB,
        usableGB: DISK_USABLE_GB,
        reserveGB: DISK_RESERVED_GB,
        totalGB: DISK_TOTAL_GB,
        freeGB: +Math.max(DISK_USABLE_GB - inst.logDisk.usedGB, 0).toFixed(1),
        pct: +((inst.logDisk.usedGB / DISK_USABLE_GB) * 100).toFixed(1),
        dbCount: inst.databases.length,
      });
      inst.dataDisks.forEach(d => {
        ws3.addRow({
          instance: inst.name,
          disk: `${d.letter}:\\`,
          role: 'Data',
          usedGB: d.usedGB,
          usableGB: DISK_USABLE_GB,
          reserveGB: DISK_RESERVED_GB,
          totalGB: DISK_TOTAL_GB,
          freeGB: +Math.max(DISK_USABLE_GB - d.usedGB, 0).toFixed(1),
          pct: +((d.usedGB / DISK_USABLE_GB) * 100).toFixed(1),
          dbCount: '',
        });
      });
    });
    ws3.getRow(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SimuladorMigracion_${namingData?.baseName ?? 'export'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Excel exportado correctamente');
  } catch (err) {
    console.error(err);
    toast.error('Error al exportar el Excel');
  }
}
