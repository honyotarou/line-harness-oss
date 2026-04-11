import type { ApiResponse, Tag } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const tags = {
  list: () => fetchApi<ApiResponse<Tag[]>>('/api/tags'),
  create: (data: { name: string; color: string }) =>
    fetchApi<ApiResponse<Tag>>('/api/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/tags/${id}`, { method: 'DELETE' }),
};
