export type UserRole = "Admin" | "Reader";

export interface User {
  domainUser: string;
  displayName: string;
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
  server: string;
  drive: string;
  totalGb: number;
  freeGb: number;
  pctFree: number;
  capturedAt: string;
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
