import type { ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export type TrafficPoolAdminRow = Readonly<{
  id: string;
  slug: string;
  name: string;
  activeAccountId: string;
  accountName: string;
  liffId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export type PoolAccountAdminRow = Readonly<{
  id: string;
  poolId: string;
  lineAccountId: string;
  accountName: string;
  liffId: string | null;
  isActive: boolean;
  createdAt: string;
}>;

export const trafficPools = {
  list: () => fetchApi<ApiResponse<TrafficPoolAdminRow[]>>('/api/traffic-pools'),
  create: (data: { slug: string; name: string; activeAccountId: string }) =>
    fetchApi<ApiResponse<TrafficPoolAdminRow>>('/api/traffic-pools', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Readonly<{ name?: string; activeAccountId?: string; isActive?: boolean }>,
  ) =>
    fetchApi<ApiResponse<TrafficPoolAdminRow>>(`/api/traffic-pools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/traffic-pools/${id}`, { method: 'DELETE' }),
  listAccounts: (poolId: string) =>
    fetchApi<ApiResponse<PoolAccountAdminRow[]>>(`/api/traffic-pools/${poolId}/accounts`),
  addAccount: (poolId: string, lineAccountId: string) =>
    fetchApi<ApiResponse<Record<string, unknown>>>(`/api/traffic-pools/${poolId}/accounts`, {
      method: 'POST',
      body: JSON.stringify({ lineAccountId }),
    }),
  setAccountActive: (poolId: string, poolAccountRowId: string, isActive: boolean) =>
    fetchApi<ApiResponse<Record<string, unknown>>>(
      `/api/traffic-pools/${poolId}/accounts/${poolAccountRowId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ isActive }),
      },
    ),
  removeAccount: (poolId: string, poolAccountRowId: string) =>
    fetchApi<ApiResponse<unknown>>(`/api/traffic-pools/${poolId}/accounts/${poolAccountRowId}`, {
      method: 'DELETE',
    }),
};
