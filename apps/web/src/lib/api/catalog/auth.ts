import type { ApiResponse } from '@line-crm/shared';
import { clearAdminSessionToken, fetchApi, useCloudflareAccessLoginMode } from '../client.js';

export const auth = {
  login: (apiKey?: string) => {
    const body = useCloudflareAccessLoginMode()
      ? JSON.stringify({})
      : JSON.stringify({ apiKey: apiKey ?? '' });
    return fetchApi<ApiResponse<{ expiresAt: string; sessionToken: string; email?: string }>>(
      '/api/auth/login',
      {
        method: 'POST',
        body,
      },
    );
  },
  session: () => fetchApi<ApiResponse<{ authenticated: boolean }>>('/api/auth/session'),
  logout: async () => {
    try {
      return await fetchApi<ApiResponse<null>>('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      clearAdminSessionToken();
    }
  },
};
