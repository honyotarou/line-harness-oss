import type { ApiResponse, LineAccount } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const lineAccounts = {
  list: () => fetchApi<ApiResponse<LineAccount[]>>('/api/line-accounts'),
  get: (id: string) => fetchApi<ApiResponse<LineAccount>>(`/api/line-accounts/${id}`),
  create: (data: {
    channelId: string;
    name: string;
    channelAccessToken: string;
    channelSecret: string;
  }) =>
    fetchApi<ApiResponse<LineAccount>>('/api/line-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Partial<Pick<LineAccount, 'name' | 'channelAccessToken' | 'channelSecret' | 'isActive'>>,
  ) =>
    fetchApi<ApiResponse<LineAccount>>(`/api/line-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/line-accounts/${id}`, { method: 'DELETE' }),
};
