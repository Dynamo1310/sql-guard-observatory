export type UserRole = "Admin" | "Reader";

export interface User {
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  allowed: boolean;
  roles: UserRole[];
  isOnCallEscalation?: boolean;
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

// ==================== INDEX ANALYSIS TYPES ====================

export interface IndexAnalysisInstance {
  instanceName: string;
  serverName: string;
  ambiente: string;
  hostingSite: string;
  majorVersion?: string;
  edition?: string;
}

export interface DatabaseInfo {
  databaseId: number;
  databaseName: string;
  state: string;
  recoveryModel: string;
  sizeMB: number;
}

export interface FragmentedIndex {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  fragmentationPct: number;
  pageCount: number;
  sizeMB: number;
  suggestion: 'REBUILD' | 'REORGANIZE' | 'NONE';
  isDisabled: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  fillFactor: number;
  rebuildScript?: string;
  reorganizeScript?: string;
}

export interface UnusedIndex {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  userSeeks: number;
  userScans: number;
  userLookups: number;
  userUpdates: number;
  lastUserSeek?: string;
  lastUserScan?: string;
  lastUserLookup?: string;
  lastUserUpdate?: string;
  sizeMB: number;
  pageCount: number;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isDisabled: boolean;
  columns: string;
  includedColumns?: string;
  dropScript?: string;
  severity: 'Warning' | 'Critical';
}

export interface DuplicateIndex {
  schemaName: string;
  tableName: string;
  indexName: string;
  duplicateOfIndex: string;
  indexType: string;
  keyColumns: string;
  includedColumns?: string;
  sizeMB: number;
  pageCount: number;
  isPrimaryKey: boolean;
  isUnique: boolean;
  duplicateType: 'Exact' | 'Similar';
  dropScript?: string;
}

export interface MissingIndex {
  schemaName: string;
  tableName: string;
  equalityColumns: string;
  inequalityColumns?: string;
  includedColumns?: string;
  improvementMeasure: number;
  userSeeks: number;
  userScans: number;
  avgTotalUserCost: number;
  avgUserImpact: number;
  lastUserSeek?: string;
  lastUserScan?: string;
  createScript?: string;
  severity: 'Info' | 'Warning' | 'Critical';
}

export interface DisabledIndex {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  keyColumns: string;
  includedColumns?: string;
  createDate?: string;
  modifyDate?: string;
  rebuildScript?: string;
}

export interface OverlappingIndex {
  schemaName: string;
  tableName: string;
  indexName: string;
  overlappedByIndex: string;
  indexType: string;
  keyColumns: string;
  includedColumns?: string;
  overlappingKeyColumns: string;
  overlappingIncludedColumns?: string;
  sizeMB: number;
  pageCount: number;
  userSeeks: number;
  userScans: number;
  userUpdates: number;
  overlapType: 'Subset' | 'Prefix';
  dropScript?: string;
}

export interface BadIndex {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  keyColumns: string;
  includedColumns?: string;
  keyColumnCount: number;
  includedColumnCount: number;
  totalColumnCount: number;
  keySizeBytes: number;
  sizeMB: number;
  problem: 'TooWide' | 'TooManyKeyColumns' | 'TooManyColumns' | 'LowSelectivity';
  severity: 'Warning' | 'Critical';
  recommendation: string;
}

export interface IndexAnalysisSummary {
  instanceName: string;
  databaseName: string;
  analyzedAt: string;
  totalIndexes: number;
  fragmentedCount: number;
  unusedCount: number;
  duplicateCount: number;
  missingCount: number;
  disabledCount: number;
  overlappingCount: number;
  badIndexCount: number;
  totalIndexSizeMB: number;
  wastedSpaceMB: number;
  potentialSavingsMB: number;
  healthScore: number;
  healthStatus: 'Healthy' | 'Warning' | 'Critical';
  topRecommendations: string[];
}

export interface FullIndexAnalysis {
  summary: IndexAnalysisSummary;
  fragmentedIndexes: FragmentedIndex[];
  unusedIndexes: UnusedIndex[];
  duplicateIndexes: DuplicateIndex[];
  missingIndexes: MissingIndex[];
  disabledIndexes: DisabledIndex[];
  overlappingIndexes: OverlappingIndex[];
  badIndexes: BadIndex[];
}

export interface IndexAnalysisRequest {
  instanceName: string;
  databaseName: string;
  minPageCount?: number;
  minFragmentationPct?: number;
  includeSystemDatabases?: boolean;
  includeHeaps?: boolean;
  generateScripts?: boolean;
}

// ==================== SECURITY GROUPS TYPES ====================

export interface SecurityGroup {
  id: number;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive: boolean;
  memberCount: number;
  permissionCount: number;
  hasADSync: boolean;
  adGroupName?: string;
  createdAt: string;
  createdByUserName?: string;
  updatedAt?: string;
}

export interface SecurityGroupDetail extends SecurityGroup {
  members: GroupMember[];
  permissions: Record<string, boolean>;
  adSyncConfig?: ADSyncConfig;
}

export interface GroupMember {
  userId: string;
  domainUser: string;
  displayName: string;
  email?: string;
  role?: string;
  addedAt: string;
  addedByUserName?: string;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive?: boolean;
  initialMemberIds?: string[];
  initialPermissions?: Record<string, boolean>;
}

export interface UpdateGroupRequest {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive: boolean;
}

export interface GroupPermission {
  groupId: number;
  groupName: string;
  permissions: Record<string, boolean>;
}

export interface ADSyncConfig {
  id?: number;
  groupId: number;
  adGroupName: string;
  autoSync: boolean;
  syncIntervalHours: number;
  lastSyncAt?: string;
  lastSyncResult?: string;
  lastSyncAddedCount?: number;
  lastSyncRemovedCount?: number;
}

export interface UpdateADSyncConfigRequest {
  adGroupName: string;
  autoSync: boolean;
  syncIntervalHours: number;
}

export interface ADSyncResult {
  success: boolean;
  message: string;
  addedCount: number;
  removedCount: number;
  skippedCount: number;
  addedUsers: string[];
  removedUsers: string[];
  errors: string[];
  syncedAt: string;
}

export interface UserGroupMembership {
  groupId: number;
  groupName: string;
  groupColor?: string;
  groupIcon?: string;
  addedAt: string;
}

export interface AvailableUser {
  userId: string;
  domainUser: string;
  displayName: string;
  email?: string;
  role?: string;
  isAlreadyMember: boolean;
}

export interface UserWithGroups {
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  role: string;
  active: boolean;
  createdAt: string;
  groups: UserGroupMembership[];
}