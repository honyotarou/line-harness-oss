import type { ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export type AutoReplyAdminRow = Readonly<{
  id: string;
  keyword: string;
  matchType: 'exact' | 'contains';
  responseType: string;
  responseContent: string;
  lineAccountId: string | null;
  isActive: boolean;
  createdAt: string;
}>;

export const autoReplies = {
  list: (accountId?: string) =>
    fetchApi<ApiResponse<AutoReplyAdminRow[]>>(
      accountId
        ? `/api/auto-replies?accountId=${encodeURIComponent(accountId)}`
        : '/api/auto-replies',
    ),
  get: (id: string) => fetchApi<ApiResponse<AutoReplyAdminRow>>(`/api/auto-replies/${id}`),
  create: (data: {
    keyword: string;
    matchType?: 'exact' | 'contains';
    responseType?: string;
    responseContent: string;
    lineAccountId?: string | null;
  }) =>
    fetchApi<ApiResponse<AutoReplyAdminRow>>('/api/auto-replies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Readonly<{
      keyword?: string;
      matchType?: 'exact' | 'contains';
      responseType?: string;
      responseContent?: string;
      lineAccountId?: string | null;
      isActive?: boolean;
    }>,
  ) =>
    fetchApi<ApiResponse<AutoReplyAdminRow>>(`/api/auto-replies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/auto-replies/${id}`, { method: 'DELETE' }),
};
