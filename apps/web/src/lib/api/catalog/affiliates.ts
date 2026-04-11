import type { Affiliate, ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const affiliates = {
  list: () => fetchApi<ApiResponse<Affiliate[]>>('/api/affiliates'),
  get: (id: string) => fetchApi<ApiResponse<Affiliate>>(`/api/affiliates/${id}`),
  create: (data: { name: string; code: string; commissionRate?: number }) =>
    fetchApi<ApiResponse<Affiliate>>('/api/affiliates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Pick<Affiliate, 'name' | 'commissionRate' | 'isActive'>>) =>
    fetchApi<ApiResponse<Affiliate>>(`/api/affiliates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/affiliates/${id}`, { method: 'DELETE' }),
  report: (id: string, params?: { startDate?: string; endDate?: string }) =>
    fetchApi<
      ApiResponse<{
        affiliateId: string;
        affiliateName: string;
        code: string;
        commissionRate: number;
        totalClicks: number;
        totalConversions: number;
        totalRevenue: number;
      }>
    >(`/api/affiliates/${id}/report?` + new URLSearchParams(params as Record<string, string>)),
};
