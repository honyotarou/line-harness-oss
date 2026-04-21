import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  PaginatedData,
  Friend,
  FriendListParams,
  MessageType,
} from '../types.js';

export type FriendsResource = Readonly<{
  list: (params?: FriendListParams) => Promise<PaginatedData<Friend>>;
  get: (id: string) => Promise<Friend>;
  count: (params?: Readonly<{ accountId?: string }>) => Promise<number>;
  addTag: (friendId: string, tagId: string) => Promise<void>;
  removeTag: (friendId: string, tagId: string) => Promise<void>;
  sendMessage: (
    friendId: string,
    content: string,
    messageType?: MessageType,
  ) => Promise<Readonly<{ messageId: string }>>;
  setMetadata: (friendId: string, fields: Readonly<Record<string, unknown>>) => Promise<Friend>;
  setRichMenu: (friendId: string, richMenuId: string) => Promise<void>;
  removeRichMenu: (friendId: string) => Promise<void>;
}>;

export function createFriendsResource(
  http: HttpClient,
  defaultAccountId?: string,
): FriendsResource {
  return {
    async list(params?: FriendListParams): Promise<PaginatedData<Friend>> {
      const query = new URLSearchParams();
      if (params?.limit !== undefined) query.set('limit', String(params.limit));
      if (params?.offset !== undefined) query.set('offset', String(params.offset));
      if (params?.tagId) query.set('tagId', params.tagId);
      const accountId = params?.accountId ?? defaultAccountId;
      if (accountId) query.set('lineAccountId', accountId);
      const qs = query.toString();
      const path = qs ? `/api/friends?${qs}` : '/api/friends';
      const res = await http.get<ApiResponse<PaginatedData<Friend>>>(path);
      return res.data;
    },
    async get(id: string): Promise<Friend> {
      const res = await http.get<ApiResponse<Friend>>(`/api/friends/${id}`);
      return res.data;
    },
    async count(params?: Readonly<{ accountId?: string }>): Promise<number> {
      const accountId = params?.accountId ?? defaultAccountId;
      const path = accountId
        ? `/api/friends/count?lineAccountId=${accountId}`
        : '/api/friends/count';
      const res = await http.get<ApiResponse<{ count: number }>>(path);
      return res.data.count;
    },
    async addTag(friendId: string, tagId: string): Promise<void> {
      await http.post(`/api/friends/${friendId}/tags`, { tagId });
    },
    async removeTag(friendId: string, tagId: string): Promise<void> {
      await http.delete(`/api/friends/${friendId}/tags/${tagId}`);
    },
    async sendMessage(
      friendId: string,
      content: string,
      messageType: MessageType = 'text',
    ): Promise<Readonly<{ messageId: string }>> {
      const res = await http.post<ApiResponse<{ messageId: string }>>(
        `/api/friends/${friendId}/messages`,
        {
          messageType,
          content,
        },
      );
      return res.data;
    },
    async setMetadata(
      friendId: string,
      fields: Readonly<Record<string, unknown>>,
    ): Promise<Friend> {
      const res = await http.put<ApiResponse<Friend>>(`/api/friends/${friendId}/metadata`, fields);
      return res.data;
    },
    async setRichMenu(friendId: string, richMenuId: string): Promise<void> {
      await http.post(`/api/friends/${friendId}/rich-menu`, { richMenuId });
    },
    async removeRichMenu(friendId: string): Promise<void> {
      await http.delete(`/api/friends/${friendId}/rich-menu`);
    },
  };
}
