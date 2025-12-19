import { HealthScoreV3Dto, HealthScoreV3DetailDto } from '@/services/api';

// View modes for the main page
export type ViewMode = 'grid' | 'table';

// Filter state
export interface HealthScoreFilters {
  status: string;
  ambiente: string;
  hosting: string;
  search: string;
}

// Stats for quick stats bar
export interface HealthScoreStats {
  total: number;
  healthy: number;
  warning: number;
  risk: number;
  critical: number;
  avgScore: number;
}

// Priority alert item
export interface PriorityAlert {
  instanceName: string;
  healthScore: number;
  healthStatus: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  category: string;
  ambiente?: string;
}

// Environment priority order
export const AMBIENTE_PRIORITY: Record<string, number> = {
  'Produccion': 0,
  'Production': 0,
  'PROD': 0,
  'Testing': 1,
  'Test': 1,
  'QA': 1,
  'Desarrollo': 2,
  'Development': 2,
  'DEV': 2,
};

export function getAmbientePriority(ambiente?: string): number {
  if (!ambiente) return 99;
  return AMBIENTE_PRIORITY[ambiente] ?? 50;
}

// Category information for display
export interface CategoryInfo {
  key: string;
  name: string;
  shortName: string;
  icon: string;
  weight: number;
  color: string;
  bgColor: string;
  borderColor: string;
  group: 'availability' | 'performance' | 'maintenance';
}

// All 12 categories
export const CATEGORIES: CategoryInfo[] = [
  // Availability & DR (40%)
  { key: 'backups', name: 'Backups (RPO/RTO)', shortName: 'Backups', icon: 'Database', weight: 18, color: 'text-green-600', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', group: 'availability' },
  { key: 'alwaysOn', name: 'AlwaysOn (AG)', shortName: 'AlwaysOn', icon: 'Shield', weight: 14, color: 'text-purple-600', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30', group: 'availability' },
  { key: 'logChain', name: 'Log Chain Integrity', shortName: 'Log Chain', icon: 'Link', weight: 5, color: 'text-amber-600', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30', group: 'availability' },
  { key: 'databaseStates', name: 'Database States', shortName: 'DB States', icon: 'AlertTriangle', weight: 3, color: 'text-rose-600', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/30', group: 'availability' },
  
  // Performance (35%)
  { key: 'cpu', name: 'CPU', shortName: 'CPU', icon: 'Cpu', weight: 10, color: 'text-orange-500', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30', group: 'performance' },
  { key: 'memoria', name: 'Memory (PLE + Grants)', shortName: 'Memory', icon: 'MemoryStick', weight: 8, color: 'text-pink-600', bgColor: 'bg-pink-500/10', borderColor: 'border-pink-500/30', group: 'performance' },
  { key: 'io', name: 'I/O (Latency / IOPS)', shortName: 'I/O', icon: 'Zap', weight: 10, color: 'text-cyan-600', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30', group: 'performance' },
  { key: 'discos', name: 'Disk Space', shortName: 'Disks', icon: 'HardDrive', weight: 7, color: 'text-yellow-600', bgColor: 'bg-yellow-500/10', borderColor: 'border-yellow-500/30', group: 'performance' },
  
  // Maintenance & Config (25%)
  { key: 'erroresCriticos', name: 'Critical Errors (sev≥20)', shortName: 'Errors', icon: 'XCircle', weight: 7, color: 'text-red-600', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', group: 'maintenance' },
  { key: 'maintenance', name: 'Maintenance', shortName: 'Maint.', icon: 'Wrench', weight: 5, color: 'text-teal-600', bgColor: 'bg-teal-500/10', borderColor: 'border-teal-500/30', group: 'maintenance' },
  { key: 'configuracionTempdb', name: 'Configuration & TempDB', shortName: 'Config', icon: 'Settings', weight: 8, color: 'text-indigo-600', bgColor: 'bg-indigo-500/10', borderColor: 'border-indigo-500/30', group: 'maintenance' },
  { key: 'autogrowth', name: 'Autogrowth & Capacity', shortName: 'Growth', icon: 'TrendingUp', weight: 5, color: 'text-lime-600', bgColor: 'bg-lime-500/10', borderColor: 'border-lime-500/30', group: 'maintenance' },
];

// Get category score from HealthScoreV3Dto
export function getCategoryScore(score: HealthScoreV3Dto, categoryKey: string): number {
  const mapping: Record<string, keyof HealthScoreV3Dto> = {
    backups: 'score_Backups',
    alwaysOn: 'score_AlwaysOn',
    logChain: 'score_LogChain',
    databaseStates: 'score_DatabaseStates',
    cpu: 'score_CPU',
    memoria: 'score_Memoria',
    io: 'score_IO',
    discos: 'score_Discos',
    erroresCriticos: 'score_ErroresCriticos',
    maintenance: 'score_Maintenance',
    configuracionTempdb: 'score_ConfiguracionTempdb',
    autogrowth: 'score_Autogrowth',
  };
  
  const key = mapping[categoryKey];
  return key ? (score[key] as number) ?? 0 : 0;
}

// Get category contribution from HealthScoreV3Dto
export function getCategoryContribution(score: HealthScoreV3Dto, categoryKey: string): number {
  const mapping: Record<string, keyof HealthScoreV3Dto> = {
    backups: 'backupsContribution',
    alwaysOn: 'alwaysOnContribution',
    logChain: 'logChainContribution',
    databaseStates: 'databaseStatesContribution',
    cpu: 'cpuContribution',
    memoria: 'memoriaContribution',
    io: 'ioContribution',
    discos: 'discosContribution',
    erroresCriticos: 'erroresCriticosContribution',
    maintenance: 'mantenimientosContribution',
    configuracionTempdb: 'configuracionTempdbContribution',
    autogrowth: 'autogrowthContribution',
  };
  
  const key = mapping[categoryKey];
  return key ? (score[key] as number) ?? 0 : 0;
}

// Get status color class
export function getStatusColor(status: string): string {
  switch (status) {
    case 'Healthy': return 'text-green-600';
    case 'Warning': return 'text-yellow-500';
    case 'Risk': return 'text-orange-500';
    case 'Critical': return 'text-red-600';
    default: return 'text-muted-foreground';
  }
}

// Get status background class
export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'Healthy': return 'bg-green-500/10 border-green-500/30';
    case 'Warning': return 'bg-yellow-500/10 border-yellow-500/30';
    case 'Risk': return 'bg-orange-500/10 border-orange-500/30';
    case 'Critical': return 'bg-red-500/10 border-red-500/30';
    default: return 'bg-muted/10 border-muted/30';
  }
}

// Get score color based on numeric value
export function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 75) return 'text-yellow-500';
  if (score >= 60) return 'text-orange-500';
  return 'text-red-600';
}

// Get the worst category for an instance
export function getWorstCategory(score: HealthScoreV3Dto): CategoryInfo | null {
  let worst: CategoryInfo | null = null;
  let worstScore = 101;
  
  for (const cat of CATEGORIES) {
    const catScore = getCategoryScore(score, cat.key);
    if (catScore < worstScore) {
      worstScore = catScore;
      worst = cat;
    }
  }
  
  return worst;
}

