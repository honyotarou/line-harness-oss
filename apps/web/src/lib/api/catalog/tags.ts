import type { ApiResponse, Tag } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const tags = {
  list: (params?: { accountId?: string }) => {
    const q = params?.accountId ? `?lineAccountId=${encodeURIComponent(params.accountId)}` : '';
    return fetchApi<ApiResponse<Tag[]>>(`/api/tags${q}`);
  },
  create: (data: { name: string; color?: string; lineAccountId?: string | null }) =>
    fetchApi<ApiResponse<Tag>>('/api/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/tags/${id}`, { method: 'DELETE' }),
};
