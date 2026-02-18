export const AnalyticsEventNames = {
  // Navegación (automáticos)
  PAGE_VIEW: 'page_view',
  SCREEN_TIME: 'screen_time',

  // Sesión (automáticos)
  SESSION_START: 'session_start',
  SESSION_END: 'session_end',

  // Auth
  LOGIN_SUCCESS: 'login_success',
  LOGOUT: 'logout',

  // Interacciones clave
  FILTER_APPLIED: 'filter_applied',
  SEARCH_EXECUTED: 'search_executed',
  SERVER_SELECTED: 'server_selected',
  INSTANCE_CHANGED: 'instance_changed',
  JOB_RUN_REQUESTED: 'job_run_requested',
  REPORT_EXPORTED: 'report_exported',
  DRILLDOWN_OPENED: 'drilldown_opened',
  ALERT_ACKNOWLEDGED: 'alert_acknowledged',

  // Fricción
  API_ERROR: 'api_error',
  UI_ERROR: 'ui_error',
  PERMISSION_DENIED: 'permission_denied',
  EMPTY_STATE_SEEN: 'empty_state_seen',
  SLOW_REQUEST: 'slow_request',
} as const;

export type AnalyticsEventName = typeof AnalyticsEventNames[keyof typeof AnalyticsEventNames];

export interface AnalyticsEventPayload {
  eventName: AnalyticsEventName | string;
  route?: string;
  referrerRoute?: string;
  source?: string;
  properties?: Record<string, unknown>;
  durationMs?: number;
  success?: boolean;
  timestamp?: number;
  sessionId?: string;
}

export interface AnalyticsIngestRequest {
  events: AnalyticsEventPayload[];
  sessionId?: string;
}

// DTOs del dashboard
export interface AnalyticsOverview {
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  todaySessions: number;
  medianSessionDurationMinutes: number;
  topRoutes: TopRoute[];
  topEvents: TopEvent[];
  dailyTrend: DailyTrend[];
}

export interface TopRoute {
  route: string;
  pageViews: number;
  uniqueUsers: number;
}

export interface TopEvent {
  eventName: string;
  count: number;
  uniqueUsers: number;
}

export interface DailyTrend {
  date: string;
  activeUsers: number;
  sessions: number;
  pageViews: number;
}

export interface AnalyticsFriction {
  topErrors: FrictionError[];
  topEmptyStates: FrictionEmptyState[];
  slowScreens: FrictionSlowScreen[];
  slowEndpoints: FrictionSlowEndpoint[];
  permissionDenials: FrictionPermissionDenied[];
}

export interface FrictionError {
  eventName: string;
  route: string | null;
  count: number;
  uniqueUsers: number;
}

export interface FrictionEmptyState {
  route: string;
  count: number;
  uniqueUsers: number;
}

export interface FrictionSlowScreen {
  route: string;
  avgDurationMs: number;
  p95DurationMs: number;
  viewCount: number;
}

export interface FrictionSlowEndpoint {
  endpoint: string;
  avgDurationMs: number;
  p95DurationMs: number;
  count: number;
}

export interface FrictionPermissionDenied {
  route: string;
  count: number;
  uniqueUsers: number;
}

export interface AnalyticsJourneys {
  funnels: Funnel[];
  commonPaths: CommonPath[];
}

export interface Funnel {
  name: string;
  steps: FunnelStep[];
}

export interface FunnelStep {
  stepName: string;
  users: number;
  conversionRate: number;
}

export interface CommonPath {
  path: string[];
  sessionCount: number;
}

export interface AnalyticsHeatmap {
  cells: HeatmapCell[];
}

export interface HeatmapCell {
  dayOfWeek: number;
  hour: number;
  eventCount: number;
  uniqueUsers: number;
}

export interface AnalyticsUserDetail {
  userId: string;
  displayName: string | null;
  totalSessions: number;
  totalEvents: number;
  lastSeenAt: string | null;
  topRoutes: string[];
  topEvents: TopEvent[];
}
