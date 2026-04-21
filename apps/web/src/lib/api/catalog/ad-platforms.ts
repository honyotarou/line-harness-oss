import type { ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export type AdPlatformProvider = 'meta' | 'google' | 'tiktok' | 'x';

export type AdPlatformConnectionApi = Readonly<{
  id: string;
  provider: AdPlatformProvider;
  name: string;
  lineAccountId: string | null;
  externalAccountRef: string | null;
  hasCredentials: boolean;
  metadata: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}>;

export const adPlatforms = {
  list: (params?: { accountId?: string }) => {
    const q = params?.accountId ? '?lineAccountId=' + encodeURIComponent(params.accountId) : '';
    return fetchApi<ApiResponse<AdPlatformConnectionApi[]>>('/api/ad-platforms' + q);
  },
  get: (id: string) => fetchApi<ApiResponse<AdPlatformConnectionApi>>(`/api/ad-platforms/${id}`),
  create: (data: {
    provider: AdPlatformProvider;
    name: string;
    lineAccountId?: string | null;
    externalAccountRef?: string | null;
    credentialsEnc?: string | null;
    metadata?: Record<string, unknown>;
  }) =>
    fetchApi<ApiResponse<AdPlatformConnectionApi>>('/api/ad-platforms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Readonly<{
      name?: string;
      externalAccountRef?: string | null;
      credentialsEnc?: string | null;
      metadata?: Record<string, unknown>;
      isActive?: boolean;
    }>,
  ) =>
    fetchApi<ApiResponse<AdPlatformConnectionApi>>(`/api/ad-platforms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/ad-platforms/${id}`, { method: 'DELETE' }),
  sync: (id: string) =>
    fetchApi<ApiResponse<unknown>>(`/api/ad-platforms/${id}/sync`, { method: 'POST' }),
};
