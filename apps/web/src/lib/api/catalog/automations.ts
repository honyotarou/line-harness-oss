import type { ApiResponse, Automation, AutomationLog } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const automations = {
  list: (params?: { accountId?: string }) => {
    const query = params?.accountId ? '?lineAccountId=' + params.accountId : '';
    return fetchApi<ApiResponse<Automation[]>>('/api/automations' + query);
  },
  get: (id: string) =>
    fetchApi<ApiResponse<Automation & { logs?: AutomationLog[] }>>(`/api/automations/${id}`),
  create: (data: {
    name: string;
    eventType: Automation['eventType'];
    actions: Automation['actions'];
    description?: string | null;
    conditions?: Record<string, unknown>;
    priority?: number;
    lineAccountId?: string | null;
  }) =>
    fetchApi<ApiResponse<Automation>>('/api/automations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Partial<
      Pick<
        Automation,
        'name' | 'description' | 'eventType' | 'conditions' | 'actions' | 'isActive' | 'priority'
      >
    >,
  ) =>
    fetchApi<ApiResponse<Automation>>(`/api/automations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/automations/${id}`, { method: 'DELETE' }),
  logs: (id: string, limit?: number) =>
    fetchApi<ApiResponse<AutomationLog[]>>(
      `/api/automations/${id}/logs` + (limit ? `?limit=${limit}` : ''),
    ),
};
