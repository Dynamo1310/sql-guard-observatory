import { AnalyticsEventPayload, AnalyticsEventNames } from '@/types/analytics';
import { getApiUrl } from './httpClient';

const BUFFER_FLUSH_INTERVAL = 10_000; // 10 seconds
const BUFFER_MAX_SIZE = 20;
const SESSION_KEY = 'analytics_session_id';

function generateSessionId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getOrCreateSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

class AnalyticsBuffer {
  private buffer: AnalyticsEventPayload[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = getOrCreateSessionId();
    this.startFlushTimer();

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush(true));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.flush(true);
        }
      });
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }

  track(eventName: string, properties?: Record<string, unknown>, extra?: Partial<AnalyticsEventPayload>) {
    const event: AnalyticsEventPayload = {
      eventName,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      properties,
      ...extra,
    };

    this.buffer.push(event);

    if (this.buffer.length >= BUFFER_MAX_SIZE) {
      this.flush();
    }
  }

  flush(useBeacon = false) {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    const payload = JSON.stringify({
      events,
      sessionId: this.sessionId,
    });

    const url = `${getApiUrl()}/api/analytics/events`;
    const token = localStorage.getItem('token');

    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      if (!sent) {
        this.sendViaFetch(url, payload, token);
      }
    } else {
      this.sendViaFetch(url, payload, token);
    }
  }

  private async sendViaFetch(url: string, payload: string, token: string | null) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true,
      });
    } catch {
      // Fire-and-forget: never let analytics break the app
    }
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => this.flush(), BUFFER_FLUSH_INTERVAL);
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush(true);
  }
}

export const analyticsBuffer = new AnalyticsBuffer();

export function track(eventName: string, properties?: Record<string, unknown>, extra?: Partial<AnalyticsEventPayload>) {
  analyticsBuffer.track(eventName, properties, extra);
}

export { AnalyticsEventNames };
