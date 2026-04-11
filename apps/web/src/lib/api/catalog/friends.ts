import type { ApiResponse, PaginatedResponse } from '@line-crm/shared';
import { fetchApi, type FriendListParams, type FriendWithTags } from '../client.js';

export const friends = {
  list: (params?: FriendListParams) => {
    const query: Record<string, string> = {};
    if (params?.offset) query.offset = params.offset;
    if (params?.limit) query.limit = params.limit;
    if (params?.tagId) query.tagId = params.tagId;
    if (params?.accountId) query.lineAccountId = params.accountId;
    return fetchApi<ApiResponse<PaginatedResponse<FriendWithTags>>>(
      '/api/friends?' + new URLSearchParams(query),
    );
  },
  get: (id: string) => fetchApi<ApiResponse<FriendWithTags>>(`/api/friends/${id}`),
  count: (params?: { accountId?: string }) => {
    const query = params?.accountId ? '?lineAccountId=' + params.accountId : '';
    return fetchApi<ApiResponse<{ count: number }>>('/api/friends/count' + query);
  },
  addTag: (friendId: string, tagId: string) =>
    fetchApi<ApiResponse<null>>(`/api/friends/${friendId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tagId }),
    }),
  removeTag: (friendId: string, tagId: string) =>
    fetchApi<ApiResponse<null>>(`/api/friends/${friendId}/tags/${tagId}`, {
      method: 'DELETE',
    }),
};
