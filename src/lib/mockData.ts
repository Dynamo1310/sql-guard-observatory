import { Server, JobSummary, Job, Disk, Database, Backup, Index, AdminUser } from '@/types';

export const mockServers: Server[] = [
  { id: '1', name: 'SQL-PROD-01', environment: 'Prod', hosting: 'OnPrem' },
  { id: '2', name: 'SQL-PROD-02', environment: 'Prod', hosting: 'OnPrem' },
  { id: '3', name: 'SQL-PROD-AWS-01', environment: 'Prod', hosting: 'AWS' },
  { id: '4', name: 'SQL-UAT-01', environment: 'UAT', hosting: 'OnPrem' },
  { id: '5', name: 'SQL-DEV-01', environment: 'Dev', hosting: 'AWS' },
];

export const mockJobSummary: JobSummary = {
  okPct: 94.2,
  fails24h: 8,
  avgDurationSec: 142,
  p95Sec: 380,
  lastCapture: new Date().toISOString()
};

export const mockJobs: Job[] = [
  {
    server: 'SQL-PROD-01',
    job: 'DatabaseBackup_FULL',
    lastStart: '2025-10-16T02:00:00Z',
    lastEnd: '2025-10-16T02:15:30Z',
    durationSec: 930,
    state: 'Succeeded',
    message: 'Backup completed successfully'
  },
  {
    server: 'SQL-PROD-01',
    job: 'IndexMaintenance',
    lastStart: '2025-10-16T03:00:00Z',
    lastEnd: '2025-10-16T03:45:12Z',
    durationSec: 2712,
    state: 'Succeeded',
    message: 'Reorganized 45 indexes'
  },
  {
    server: 'SQL-PROD-02',
    job: 'DataSync_Customer',
    lastStart: '2025-10-16T01:30:00Z',
    lastEnd: '2025-10-16T01:30:45Z',
    durationSec: 45,
    state: 'Failed',
    message: 'Timeout waiting for lock on table [dbo].[Customer]'
  },
  {
    server: 'SQL-UAT-01',
    job: 'DatabaseBackup_DIFF',
    lastStart: '2025-10-16T04:00:00Z',
    lastEnd: '2025-10-16T04:05:20Z',
    durationSec: 320,
    state: 'Succeeded',
    message: 'Differential backup completed'
  },
  {
    server: 'SQL-PROD-AWS-01',
    job: 'LogShipping',
    lastStart: '2025-10-16T05:15:00Z',
    lastEnd: '',
    durationSec: 0,
    state: 'Running',
    message: 'Shipping transaction logs...'
  }
];

export const mockDisks: Disk[] = [
  {
    server: 'SQL-PROD-01',
    drive: 'C:',
    totalGb: 500,
    freeGb: 180,
    pctFree: 36.0,
    capturedAt: new Date().toISOString()
  },
  {
    server: 'SQL-PROD-01',
    drive: 'D:',
    totalGb: 2000,
    freeGb: 120,
    pctFree: 6.0,
    capturedAt: new Date().toISOString()
  },
  {
    server: 'SQL-PROD-02',
    drive: 'C:',
    totalGb: 500,
    freeGb: 85,
    pctFree: 17.0,
    capturedAt: new Date().toISOString()
  },
  {
    server: 'SQL-PROD-02',
    drive: 'E:',
    totalGb: 3000,
    freeGb: 450,
    pctFree: 15.0,
    capturedAt: new Date().toISOString()
  },
  {
    server: 'SQL-PROD-AWS-01',
    drive: '/data',
    totalGb: 1500,
    freeGb: 600,
    pctFree: 40.0,
    capturedAt: new Date().toISOString()
  }
];

export const mockDatabases: Database[] = [
  {
    server: 'SQL-PROD-01',
    database: 'Banking_Core',
    totalGb: 850.5,
    dataGb: 780.2,
    logGb: 70.3,
    growth7dGb: 12.4
  },
  {
    server: 'SQL-PROD-01',
    database: 'Customer_CRM',
    totalGb: 320.8,
    dataGb: 295.4,
    logGb: 25.4,
    growth7dGb: 5.2
  },
  {
    server: 'SQL-PROD-02',
    database: 'Transaction_History',
    totalGb: 1200.3,
    dataGb: 1150.1,
    logGb: 50.2,
    growth7dGb: 28.7
  },
  {
    server: 'SQL-PROD-02',
    database: 'Reporting',
    totalGb: 450.6,
    dataGb: 430.2,
    logGb: 20.4,
    growth7dGb: 8.3
  },
  {
    server: 'SQL-UAT-01',
    database: 'Banking_Core_UAT',
    totalGb: 280.4,
    dataGb: 260.1,
    logGb: 20.3,
    growth7dGb: 3.5
  }
];

export const mockBackups: Backup[] = [
  {
    server: 'SQL-PROD-01',
    database: 'Banking_Core',
    recoveryModel: 'FULL',
    lastFull: '2025-10-16T02:15:00Z',
    lastDiff: '2025-10-16T08:00:00Z',
    lastLog: '2025-10-16T11:45:00Z',
    rpoMinutes: 15,
    severity: 'green'
  },
  {
    server: 'SQL-PROD-01',
    database: 'Customer_CRM',
    recoveryModel: 'FULL',
    lastFull: '2025-10-16T02:30:00Z',
    lastDiff: '2025-10-16T08:15:00Z',
    lastLog: '2025-10-16T10:20:00Z',
    rpoMinutes: 100,
    severity: 'amber'
  },
  {
    server: 'SQL-PROD-02',
    database: 'Transaction_History',
    recoveryModel: 'FULL',
    lastFull: '2025-10-15T02:00:00Z',
    lastDiff: '2025-10-16T02:00:00Z',
    lastLog: '2025-10-16T06:00:00Z',
    rpoMinutes: 360,
    severity: 'red'
  },
  {
    server: 'SQL-PROD-02',
    database: 'Reporting',
    recoveryModel: 'SIMPLE',
    lastFull: '2025-10-16T03:00:00Z',
    lastDiff: '',
    lastLog: '',
    rpoMinutes: 540,
    severity: 'amber'
  }
];

export const mockIndexes: Index[] = [
  {
    server: 'SQL-PROD-01',
    database: 'Banking_Core',
    schema: 'dbo',
    table: 'Transactions',
    index: 'IX_Transactions_Date',
    pageCount: 15420,
    fragPct: 45.2,
    capturedAt: new Date().toISOString(),
    suggestion: 'REBUILD'
  },
  {
    server: 'SQL-PROD-01',
    database: 'Banking_Core',
    schema: 'dbo',
    table: 'Accounts',
    index: 'IX_Accounts_CustomerId',
    pageCount: 8230,
    fragPct: 22.5,
    capturedAt: new Date().toISOString(),
    suggestion: 'REORGANIZE'
  },
  {
    server: 'SQL-PROD-02',
    database: 'Transaction_History',
    schema: 'dbo',
    table: 'TransactionLog',
    index: 'PK_TransactionLog',
    pageCount: 42800,
    fragPct: 67.8,
    capturedAt: new Date().toISOString(),
    suggestion: 'REBUILD'
  }
];

export const mockAdminUsers: AdminUser[] = [
  {
    id: '1',
    domainUser: 'BANCO\\admin.user',
    displayName: 'Admin User',
    role: 'Admin',
    active: true,
    createdAt: '2025-01-15T10:00:00Z'
  },
  {
    id: '2',
    domainUser: 'BANCO\\dba.team',
    displayName: 'DBA Team',
    role: 'Admin',
    active: true,
    createdAt: '2025-01-15T10:05:00Z'
  },
  {
    id: '3',
    domainUser: 'BANCO\\analyst.user',
    displayName: 'Data Analyst',
    role: 'Reader',
    active: true,
    createdAt: '2025-02-20T14:30:00Z'
  },
  {
    id: '4',
    domainUser: 'BANCO\\dev.user',
    displayName: 'Developer User',
    role: 'Reader',
    active: false,
    createdAt: '2025-03-10T09:15:00Z'
  }
];
