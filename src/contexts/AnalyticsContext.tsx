import React, { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsBuffer, AnalyticsEventNames } from '@/services/analyticsService';
import type { AnalyticsEventPayload } from '@/types/analytics';

interface AnalyticsContextType {
  track: (eventName: string, properties?: Record<string, unknown>, extra?: Partial<AnalyticsEventPayload>) => void;
  sessionId: string;
}

const AnalyticsContext = createContext<AnalyticsContextType>({
  track: () => {},
  sessionId: '',
});

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const prevRouteRef = useRef<string | null>(null);
  const screenEntryRef = useRef<number>(Date.now());

  const track = useCallback(
    (eventName: string, properties?: Record<string, unknown>, extra?: Partial<AnalyticsEventPayload>) => {
      analyticsBuffer.track(eventName, properties, {
        route: location.pathname,
        ...extra,
      });
    },
    [location.pathname]
  );

  // Session start
  useEffect(() => {
    analyticsBuffer.track(AnalyticsEventNames.SESSION_START, undefined, {
      route: location.pathname,
    });

    return () => {
      analyticsBuffer.track(AnalyticsEventNames.SESSION_END);
      analyticsBuffer.flush(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page view + screen time tracking
  useEffect(() => {
    const currentRoute = location.pathname;
    const now = Date.now();

    if (prevRouteRef.current && prevRouteRef.current !== currentRoute) {
      const duration = now - screenEntryRef.current;
      analyticsBuffer.track(AnalyticsEventNames.SCREEN_TIME, undefined, {
        route: prevRouteRef.current,
        durationMs: duration,
      });
    }

    analyticsBuffer.track(AnalyticsEventNames.PAGE_VIEW, undefined, {
      route: currentRoute,
      referrerRoute: prevRouteRef.current ?? undefined,
    });

    prevRouteRef.current = currentRoute;
    screenEntryRef.current = now;
  }, [location.pathname]);

  // Track screen time on tab hide via visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && prevRouteRef.current) {
        const duration = Date.now() - screenEntryRef.current;
        analyticsBuffer.track(AnalyticsEventNames.SCREEN_TIME, undefined, {
          route: prevRouteRef.current,
          durationMs: duration,
        });
      } else if (document.visibilityState === 'visible') {
        screenEntryRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return (
    <AnalyticsContext.Provider value={{ track, sessionId: analyticsBuffer.getSessionId() }}>
      {children}
    </AnalyticsContext.Provider>
  );
}
