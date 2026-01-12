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

// 8 categorías activas del Health Score V3
export const CATEGORIES: CategoryInfo[] = [
  // Availability & DR (40%)
  { key: 'backups', name: 'Backups (RPO/RTO)', shortName: 'Backups', icon: 'Database', weight: 23, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'availability' },
  { key: 'alwaysOn', name: 'AlwaysOn (AG)', shortName: 'AlwaysOn', icon: 'Shield', weight: 17, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'availability' },
  
  // Performance (54%)
  { key: 'cpu', name: 'CPU', shortName: 'CPU', icon: 'Cpu', weight: 12, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'performance' },
  { key: 'memoria', name: 'Memory (PLE + Grants)', shortName: 'Memory', icon: 'MemoryStick', weight: 10, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'performance' },
  { key: 'io', name: 'I/O (Latency / IOPS)', shortName: 'I/O', icon: 'Zap', weight: 13, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'performance' },
  { key: 'discos', name: 'Disk Space', shortName: 'Disks', icon: 'HardDrive', weight: 9, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'performance' },
  { key: 'waits', name: 'Wait Statistics', shortName: 'Waits', icon: 'Clock', weight: 10, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'performance' },
  
  // Maintenance (6%)
  { key: 'maintenance', name: 'Maintenance', shortName: 'Maint.', icon: 'Wrench', weight: 6, color: 'text-foreground', bgColor: 'bg-muted/50', borderColor: 'border-border', group: 'maintenance' },
];

// Get category score from HealthScoreV3Dto (8 categorías activas)
export function getCategoryScore(score: HealthScoreV3Dto, categoryKey: string): number {
  const mapping: Record<string, keyof HealthScoreV3Dto> = {
    backups: 'score_Backups',
    alwaysOn: 'score_AlwaysOn',
    cpu: 'score_CPU',
    memoria: 'score_Memoria',
    io: 'score_IO',
    discos: 'score_Discos',
    waits: 'score_Waits',
    maintenance: 'score_Maintenance',
  };
  
  const key = mapping[categoryKey];
  return key ? (score[key] as number) ?? 0 : 0;
}

// Get category contribution from HealthScoreV3Dto (8 categorías activas)
export function getCategoryContribution(score: HealthScoreV3Dto, categoryKey: string): number {
  const mapping: Record<string, keyof HealthScoreV3Dto> = {
    backups: 'backupsContribution',
    alwaysOn: 'alwaysOnContribution',
    cpu: 'cpuContribution',
    memoria: 'memoriaContribution',
    io: 'ioContribution',
    discos: 'discosContribution',
    waits: 'waitsContribution',
    maintenance: 'mantenimientosContribution',
  };
  
  const key = mapping[categoryKey];
  return key ? (score[key] as number) ?? 0 : 0;
}

// Get status color class
export function getStatusColor(status: string): string {
  switch (status) {
    case 'Healthy': return 'text-success';
    case 'Warning': return 'text-warning';
    case 'Risk': return 'text-warning';
    case 'Critical': return 'text-destructive';
    default: return 'text-muted-foreground';
  }
}

// Get status background class
export function getStatusBgColor(status: string): string {
  switch (status) {
    case 'Healthy': return 'bg-success/10 border-success/30';
    case 'Warning': return 'bg-warning/10 border-warning/30';
    case 'Risk': return 'bg-warning/10 border-warning/30';
    case 'Critical': return 'bg-destructive/10 border-destructive/30';
    default: return 'bg-muted/10 border-muted/30';
  }
}

// Get score color based on numeric value
export function getScoreColor(score: number): string {
  if (score >= 90) return 'text-success';
  if (score >= 75) return 'text-warning';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
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

