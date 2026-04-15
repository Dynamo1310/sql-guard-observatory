# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

SQL Nova / SQL Guard Observatory — internal SQL Server monitoring & observability tool for Banco Supervielle's DBA team. Most code, comments, and docs are in **Spanish**; preserve that language when modifying user-facing strings, log messages, and code comments. The repo bundles three applications:

- **Frontend** (`/`, `src/`) — React 18 + TypeScript + Vite + shadcn/ui + Tailwind. Single SPA.
- **Backend** (`SQLGuardObservatory.API/`) — .NET 8 Web API, hosted on **HTTP.sys** (not Kestrel) so Windows Authentication (NTLM/Negotiate) works for ~200–500 concurrent users. Runs as a Windows Service on `http://*:5000`.
- **Teams Bot** (`SQLNovaTeamsBot/`) — separate .NET project for Microsoft Teams notifications.
- **PowerShell collectors** (`scripts/`) — `RelevamientoHealthScore_*.ps1` scripts run by Task Scheduler against monitored SQL Servers; results land in the `SQLNova` DB and are read by the API.

## Common commands

Frontend (run from repo root):
```sh
npm install
npm run dev              # vite dev server on port 8080
npm run build            # production build
npm run build:dev        # development-mode build
npm run build:testing    # testing-mode build (uses .env.testing)
npm run lint             # eslint .
```

Backend (run from `SQLGuardObservatory.API/`):
```sh
dotnet restore
dotnet build
dotnet run               # listens on http://*:5000 via HTTP.sys
```

Combined production build (outputs to `C:\Temp\Backend` and `C:\Temp\Frontend-Compilado`):
```powershell
.\build-sql-guard-observatory.ps1 -Environment production
```
Note: the script hardcodes `$solutionRoot = "C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory"` — update if running on a different machine.

Deployment helpers: `deploy-backend.ps1`, `deploy-frontend.ps1`, `deploy-windows-auth.ps1`, `install-all.ps1` (all require Administrator).

There is **no test suite** in this repo (no `npm test`, no xUnit project). "Test" PowerShell scripts (`Test-*.ps1`, `Diagnosticar-*.ps1`) are operational diagnostics that hit live infrastructure — do not run them casually.

## Architecture

### Two databases, two DbContexts
- `SQLNovaDbContext` → `SQLNova` DB on `SSPR17MON-01`. Read-only monitoring snapshots populated by the PowerShell collectors (jobs, disks, backups, health-score components, etc.).
- `ApplicationDbContext` → `SQLGuardObservatoryAuth` DB. ASP.NET Identity store for users/roles/permissions plus app-specific tables (vault, on-call, patch plans, alerts).

Connection strings, JWT secret, SMTP, Teams credentials and the Vault master key all live in `appsettings.json` / `appsettings.{Env}.json` and are checked in — treat them as the source of truth for environment wiring, not as secrets to rotate.

### Authentication is dual-mode
`Program.cs` configures **both** JWT Bearer (default scheme) and **Negotiate** (Windows Auth via HTTP.sys with `AllowAnonymous = true`). The frontend authenticates via `/api/auth/login`, gets a JWT, and stores it in `localStorage`. `src/services/api.ts:handleResponse` redirects to `/login` on any 401 — keep that contract or you'll break session expiry handling.

Authorization is **capability-based, not role-based**, even though Identity roles exist:
- `AuthContext` (`src/contexts/AuthContext.tsx`) loads the user's allowed view names from `permissionsApi` and admin capabilities from `adminRolesApi` after login.
- `<ProtectedRoute viewName="...">` in `src/App.tsx` gates each route by view name (e.g. `"VaultCredentials"`, `"OnCallDashboard"`). Adding a new page = add the route + register the view name in the backend's `PermissionService`/`PermissionInitializer` so admins can grant it.
- Backend admin endpoints additionally check `IAdminAuthorizationService` capabilities.

### Background services drive most of the data
`Program.cs` registers many `IHostedService`s — they run inside the API process:
- `CollectorOrchestrator` + `HealthScoreConsolidator` (collectors are 13 `ICollector` implementations under `Services/Collectors/Implementations`: CPU, Memoria, IO, Discos, Backups, AlwaysOn, LogChain, DatabaseStates, ErroresCriticos, Maintenance, ConfigTempDB, Autogrowth, Waits). The C# collectors and the `RelevamientoHealthScore_*.ps1` scripts are **parallel implementations** of the same data pipeline — changes to the health-score model usually need to land in both places.
- `ProductionAlertBackgroundService`, `BackupAlertBackgroundService`, `DiskAlertBackgroundService`, `OverviewSummaryBackgroundService`, `ScheduledNotificationService`, `PatchNotificationBackgroundService`, `UserImportSyncBackgroundService` — alerting + scheduled emails/Teams messages.

`OverviewService` reads from `OverviewSummaryCacheService`; the cache is refreshed by the consolidator/collector background services, **not** by request handlers. If overview data looks stale, check the orchestrator logs in `SQLGuardObservatory.API/Logs/sqlguard-{date}.log` (Serilog rolling file).

### Real-time updates via SignalR
`/hubs/notifications` (`Hubs/NotificationHub.cs`) is mapped anonymously. Frontend connects via `src/contexts/SignalRContext.tsx` and `useSignalRNotifications`/`useServerRestartStream` hooks. Used for live health-score updates, server-restart progress streaming, and toast notifications. SignalR is configured for 200–500 concurrent clients (see Program.cs SignalR options).

### Frontend service layer
All API access goes through `src/services/`:
- `api.ts` — main API surface; `getApiUrl()` reads `VITE_API_URL` (per-env `.env.{mode}` files) and **falls back to the hardcoded production URL `http://asprbm-nov-01:5000`**. When developing locally, ensure `.env.development` is picked up (`npm run dev` uses `development` mode).
- `httpClient.ts` — fetch wrapper with timeout (30s), exponential backoff retries (3x on 408/429/5xx), and jitter.
- React Query is configured globally in `src/App.tsx` with `staleTime: 30s`, `gcTime: 5min`, 3 retries with exponential backoff. Prefer using React Query over raw `useEffect` for server data.

The `@/` path alias maps to `src/` (see `vite.config.ts`, `tsconfig.json`).

### Environments
- **Production**: backend on `asprbm-nov-01:5000`, frontend on `asprbm-nov-01:8080`.
- **Testing**: backend on `astsbm-nov-01:5000`, frontend on `astsbm-nov-01:8080`.
- **Development**: backend on `localhost:5000`, frontend on `localhost:8080` (Vite default per `vite.config.ts`).

CORS origins for all of these are hardcoded in `Program.cs`'s `AllowFrontend` policy — add new origins there if you stand up another environment.

## Conventions to respect

- Spanish naming for routes, view names, table fields and UI strings is intentional (e.g. `/intervenciones`, `BasesSinUso`, `RelevamientoHealthScore`). Don't translate them.
- The repo root is full of `*.md` / `*.ps1` historical artifacts (`ARREGLO_*`, `CORRECCION_*`, `IMPLEMENTACION_*`, `RESUMEN_*`). They're a per-incident changelog, not living docs — read them when investigating a specific past fix, but don't keep adding to them unless asked.
- A `supabase/` folder exists and `@supabase/supabase-js` is a dep, but the live system uses the .NET API + SQL Server. Supabase appears to be vestigial from project bootstrap; verify before assuming any code path uses it.
- When adding a new protected page: create `src/pages/X.tsx`, add a `<Route>` with `<ProtectedRoute viewName="X">` in `src/App.tsx`, and add a sidebar entry in `src/components/layout/AppSidebar.tsx`. The view name string must match what the backend's permission system knows about.
