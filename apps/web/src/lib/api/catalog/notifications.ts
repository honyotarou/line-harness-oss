import type { ApiResponse, Notification, NotificationRule } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const notifications = {
  rules: {
    list: (params?: { lineAccountId?: string }) =>
      fetchApi<ApiResponse<NotificationRule[]>>(
        '/api/notifications/rules' +
          (params?.lineAccountId
            ? `?lineAccountId=${encodeURIComponent(params.lineAccountId)}`
            : ''),
      ),
    get: (id: string) => fetchApi<ApiResponse<NotificationRule>>(`/api/notifications/rules/${id}`),
    create: (data: {
      name: string;
      eventType: string;
      conditions?: Record<string, unknown>;
      channels?: string[];
      lineAccountId?: string | null;
    }) =>
      fetchApi<ApiResponse<NotificationRule>>('/api/notifications/rules', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        eventType: string;
        conditions: Record<string, unknown>;
        channels: string[];
        lineAccountId: string | null;
        isActive: boolean;
      }>,
    ) =>
      fetchApi<ApiResponse<NotificationRule>>(`/api/notifications/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/notifications/rules/${id}`, { method: 'DELETE' }),
  },
  list: (params?: { status?: string; limit?: string; lineAccountId?: string }) =>
    fetchApi<ApiResponse<Notification[]>>(
      '/api/notifications?' + new URLSearchParams(params as Record<string, string>),
    ),
};
