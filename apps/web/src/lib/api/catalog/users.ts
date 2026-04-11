import type { ApiResponse, User } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const users = {
  list: () => fetchApi<ApiResponse<User[]>>('/api/users'),
  get: (id: string) => fetchApi<ApiResponse<User>>(`/api/users/${id}`),
  create: (data: {
    email?: string | null;
    phone?: string | null;
    externalId?: string | null;
    displayName?: string | null;
  }) =>
    fetchApi<ApiResponse<User>>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Partial<Pick<User, 'email' | 'phone' | 'externalId' | 'displayName'>>,
  ) =>
    fetchApi<ApiResponse<User>>(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/users/${id}`, { method: 'DELETE' }),
  link: (userId: string, friendId: string) =>
    fetchApi<ApiResponse<null>>(`/api/users/${userId}/link`, {
      method: 'POST',
      body: JSON.stringify({ friendId }),
    }),
  accounts: (userId: string) =>
    fetchApi<
      ApiResponse<
        { id: string; lineUserId: string; displayName: string | null; isFollowing: boolean }[]
      >
    >(`/api/users/${userId}/accounts`),
};
