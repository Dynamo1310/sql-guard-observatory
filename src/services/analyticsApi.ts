import { apiClient } from './httpClient';
import type {
  AnalyticsOverview,
  AnalyticsFriction,
  AnalyticsJourneys,
  AnalyticsHeatmap,
  AnalyticsUserDetail,
} from '@/types/analytics';

function buildQuery(from?: Date, to?: Date): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from.toISOString());
  if (to) params.set('to', to.toISOString());
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const analyticsApi = {
  async getOverview(from?: Date, to?: Date): Promise<AnalyticsOverview> {
    return apiClient.get<AnalyticsOverview>(`/api/analytics/overview${buildQuery(from, to)}`);
  },

  async getFriction(from?: Date, to?: Date): Promise<AnalyticsFriction> {
    return apiClient.get<AnalyticsFriction>(`/api/analytics/friction${buildQuery(from, to)}`);
  },

  async getJourneys(from?: Date, to?: Date): Promise<AnalyticsJourneys> {
    return apiClient.get<AnalyticsJourneys>(`/api/analytics/journeys${buildQuery(from, to)}`);
  },

  async getHeatmap(from?: Date, to?: Date): Promise<AnalyticsHeatmap> {
    return apiClient.get<AnalyticsHeatmap>(`/api/analytics/heatmap${buildQuery(from, to)}`);
  },

  async getUserDetail(userId: string, from?: Date, to?: Date): Promise<AnalyticsUserDetail> {
    return apiClient.get<AnalyticsUserDetail>(`/api/analytics/user/${encodeURIComponent(userId)}${buildQuery(from, to)}`);
  },
};
