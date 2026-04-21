import type { ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export type InboxThreadApi = Readonly<{
  friendId: string;
  friendName: string;
  friendPictureUrl: string | null;
  lineUserId: string | null;
  lineAccountId: string | null;
  lastContent: string | null;
  lastDirection: string | null;
  lastAt: string | null;
  incomingTotal: number;
}>;

export const inbox = {
  threads: {
    list: (params?: { accountId?: string; limit?: string; offset?: string }) => {
      const q = new URLSearchParams();
      if (params?.accountId) q.set('lineAccountId', params.accountId);
      if (params?.limit) q.set('limit', params.limit);
      if (params?.offset) q.set('offset', params.offset);
      const s = q.toString();
      return fetchApi<ApiResponse<InboxThreadApi[]>>('/api/inbox/threads' + (s ? `?${s}` : ''));
    },
  },
};
