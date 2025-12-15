export type UserRole = "Admin" | "Reader";

export interface User {
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  allowed: boolean;
  roles: UserRole[];
}

export interface AuthResponse {
  domainUser: string;
  displayName: string;
  allowed: boolean;
  roles: UserRole[];
}

export type Environment = "All" | "Prod" | "UAT" | "Dev";
export type Hosting = "All" | "OnPrem" | "AWS";

export interface Server {
  id: string;
  name: string;
  environment: Environment;
  hosting: Hosting;
}

export interface JobSummary {
  okPct: number;
  fails24h: number;
  avgDurationSec: number;
  p95Sec: number;
  lastCapture: string;
}

export interface Job {
  server: string;
  job: string;
  lastStart: string;
  lastEnd: string;
  durationSec: number;
  state: "Succeeded" | "Failed" | "Running" | "Canceled";
  message: string;
}

export interface Disk {
  id: number;
  instanceName: string;
  ambiente?: string;
  hosting?: string;
  servidor: string;
  drive: string;
  totalGB?: number;
  libreGB?: number;
  porcentajeLibre?: number;
  estado?: string;
  captureDate: string;
}

export interface DiskSummary {
  discosCriticos: number;
  discosAdvertencia: number;
  discosSaludables: number;
  totalDiscos: number;
  ultimaCaptura?: string;
}

export interface DiskFilters {
  ambientes: string[];
  hostings: string[];
  instancias: string[];
  estados: string[];
}

export interface Database {
  server: string;
  database: string;
  totalGb: number;
  dataGb: number;
  logGb: number;
  growth7dGb: number;
}

export interface Backup {
  server: string;
  database: string;
  recoveryModel: "FULL" | "BULK_LOGGED" | "SIMPLE";
  lastFull: string;
  lastDiff: string;
  lastLog: string;
  rpoMinutes: number;
  severity: "green" | "amber" | "red";
}

export interface Index {
  server: string;
  database: string;
  schema: string;
  table: string;
  index: string;
  pageCount: number;
  fragPct: number;
  capturedAt: string;
  suggestion: "REBUILD" | "REORGANIZE" | "NONE";
}

export interface AdminUser {
  id: string;
  domainUser: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface HealthScoreDto {
  instanceName: string;
  ambiente?: string;
  hostingSite?: string;
  version?: string;
  connectSuccess: boolean;
  connectLatencyMs?: number;
  healthScore: number;
  healthStatus: 'Healthy' | 'Warning' | 'Critical';
  generatedAtUtc: string;
  worstVolumeFreePct?: number;
  backupBreachesCount?: number;
  alwaysOnIssuesCount?: number;
  severity20PlusCount24h?: number;
}

export interface HealthScoreSummaryDto {
  totalInstances: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  avgScore: number;
  lastUpdate?: string;
}