import type { ApiResponse } from '@line-crm/shared';
import { fetchApi, type ApiBroadcast } from '../client.js';

export const broadcasts = {
  list: (params?: { accountId?: string }) => {
    const query = params?.accountId ? '?lineAccountId=' + params.accountId : '';
    return fetchApi<ApiResponse<ApiBroadcast[]>>('/api/broadcasts' + query);
  },
  get: (id: string) => fetchApi<ApiResponse<ApiBroadcast>>(`/api/broadcasts/${id}`),
  create: (data: {
    title: string;
    messageType: ApiBroadcast['messageType'];
    messageContent: string;
    targetType: ApiBroadcast['targetType'];
    targetTagId?: string | null;
    scheduledAt?: string | null;
    status?: ApiBroadcast['status'];
    lineAccountId?: string | null;
  }) =>
    fetchApi<ApiResponse<ApiBroadcast>>('/api/broadcasts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: {
      title?: string;
      messageType?: ApiBroadcast['messageType'];
      messageContent?: string;
      targetType?: ApiBroadcast['targetType'];
      targetTagId?: string | null;
      scheduledAt?: string | null;
    },
  ) =>
    fetchApi<ApiResponse<ApiBroadcast>>(`/api/broadcasts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/broadcasts/${id}`, { method: 'DELETE' }),
  send: (id: string) =>
    fetchApi<ApiResponse<ApiBroadcast>>(`/api/broadcasts/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }),
};
