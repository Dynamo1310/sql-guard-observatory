import { useCallback } from 'react';
import { useAnalytics } from '@/contexts/AnalyticsContext';
import type { AnalyticsEventPayload } from '@/types/analytics';

export function useTrackEvent() {
  const { track } = useAnalytics();

  return useCallback(
    (eventName: string, properties?: Record<string, unknown>, extra?: Partial<AnalyticsEventPayload>) => {
      track(eventName, properties, extra);
    },
    [track]
  );
}
