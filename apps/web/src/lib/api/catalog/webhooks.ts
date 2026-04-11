import type { ApiResponse, IncomingWebhook, OutgoingWebhook } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const webhooks = {
  incoming: {
    list: () => fetchApi<ApiResponse<IncomingWebhook[]>>('/api/webhooks/incoming'),
    create: (data: { name: string; sourceType?: string; secret?: string | null }) =>
      fetchApi<ApiResponse<IncomingWebhook>>('/api/webhooks/incoming', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<Pick<IncomingWebhook, 'name' | 'sourceType' | 'isActive'>>,
    ) =>
      fetchApi<ApiResponse<IncomingWebhook>>(`/api/webhooks/incoming/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/webhooks/incoming/${id}`, { method: 'DELETE' }),
  },
  outgoing: {
    list: () => fetchApi<ApiResponse<OutgoingWebhook[]>>('/api/webhooks/outgoing'),
    create: (data: { name: string; url: string; eventTypes: string[]; secret?: string | null }) =>
      fetchApi<ApiResponse<OutgoingWebhook>>('/api/webhooks/outgoing', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<Pick<OutgoingWebhook, 'name' | 'url' | 'eventTypes' | 'isActive'>>,
    ) =>
      fetchApi<ApiResponse<OutgoingWebhook>>(`/api/webhooks/outgoing/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/webhooks/outgoing/${id}`, { method: 'DELETE' }),
  },
};
