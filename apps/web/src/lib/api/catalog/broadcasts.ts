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
  send: (
    id: string,
    opts?: Readonly<{
      sendSecret?: string;
    }>,
  ) =>
    fetchApi<ApiResponse<ApiBroadcast>>(`/api/broadcasts/${id}/send`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
      headers: opts?.sendSecret?.trim()
        ? { 'X-Broadcast-Send-Secret': opts.sendSecret.trim() }
        : {},
    }),
  segmentPreviewCount: (id: string, conditions: unknown) =>
    fetchApi<ApiResponse<{ count: number }>>(`/api/broadcasts/${id}/segment-preview-count`, {
      method: 'POST',
      body: JSON.stringify({ conditions }),
    }),
  testPush: (
    id: string,
    body: Readonly<{ friendId: string; confirm: true }>,
    opts?: Readonly<{ sendSecret?: string }>,
  ) =>
    fetchApi<ApiResponse<unknown>>(`/api/broadcasts/${id}/test-push`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: opts?.sendSecret?.trim()
        ? { 'X-Broadcast-Send-Secret': opts.sendSecret.trim() }
        : {},
    }),
};
