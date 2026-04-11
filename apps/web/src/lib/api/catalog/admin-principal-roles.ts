import type { ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const adminPrincipalRoles = {
  list: () =>
    fetchApi<ApiResponse<Array<{ email: string; role: 'admin' | 'viewer'; updatedAt: string }>>>(
      '/api/admin/principal-roles',
    ),
  upsert: (data: { email: string; role: 'admin' | 'viewer' }) =>
    fetchApi<ApiResponse<null>>('/api/admin/principal-roles', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (email: string) =>
    fetchApi<ApiResponse<{ removed: boolean }>>(
      `/api/admin/principal-roles/${encodeURIComponent(email)}`,
      { method: 'DELETE' },
    ),
};
