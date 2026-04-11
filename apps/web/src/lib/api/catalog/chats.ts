import type { ApiResponse, Chat } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const chats = {
  list: (params?: { status?: string; operatorId?: string; accountId?: string }) => {
    const query: Record<string, string> = {};
    if (params?.status) query.status = params.status;
    if (params?.operatorId) query.operatorId = params.operatorId;
    if (params?.accountId) query.lineAccountId = params.accountId;
    return fetchApi<ApiResponse<Chat[]>>('/api/chats?' + new URLSearchParams(query));
  },
  get: (id: string) =>
    fetchApi<
      ApiResponse<
        Chat & {
          messages?: { id: string; content: string; senderType: string; createdAt: string }[];
        }
      >
    >(`/api/chats/${id}`),
  create: (data: {
    friendId: string;
    operatorId?: string | null;
    lineAccountId?: string | null;
  }) =>
    fetchApi<ApiResponse<Chat>>('/api/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: { operatorId?: string | null; status?: Chat['status']; notes?: string | null },
  ) =>
    fetchApi<ApiResponse<Chat>>(`/api/chats/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  send: (id: string, data: { content: string; messageType?: string }) =>
    fetchApi<ApiResponse<unknown>>(`/api/chats/${id}/send`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
