import type { ApiResponse, ConversionPoint } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const conversions = {
  points: () => fetchApi<ApiResponse<ConversionPoint[]>>('/api/conversions/points'),
  createPoint: (data: { name: string; eventType: string; value?: number | null }) =>
    fetchApi<ApiResponse<ConversionPoint>>('/api/conversions/points', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deletePoint: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/conversions/points/${id}`, { method: 'DELETE' }),
  track: (data: {
    conversionPointId: string;
    friendId: string;
    userId?: string | null;
    affiliateCode?: string | null;
    metadata?: Record<string, unknown> | null;
  }) =>
    fetchApi<ApiResponse<unknown>>('/api/conversions/track', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  report: (params?: { startDate?: string; endDate?: string }) =>
    fetchApi<
      ApiResponse<
        {
          conversionPointId: string;
          conversionPointName: string;
          eventType: string;
          totalCount: number;
          totalValue: number;
        }[]
      >
    >('/api/conversions/report?' + new URLSearchParams(params as Record<string, string>)),
};
