import type { ApiResponse, Reminder, ReminderStep } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const reminders = {
  list: (params?: { accountId?: string }) => {
    const query = params?.accountId ? '?lineAccountId=' + params.accountId : '';
    return fetchApi<ApiResponse<Reminder[]>>('/api/reminders' + query);
  },
  get: (id: string) =>
    fetchApi<ApiResponse<Reminder & { steps: ReminderStep[] }>>(`/api/reminders/${id}`),
  create: (data: { name: string; description?: string | null; lineAccountId?: string | null }) =>
    fetchApi<ApiResponse<Reminder>>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Pick<Reminder, 'name' | 'description' | 'isActive'>>) =>
    fetchApi<ApiResponse<Reminder>>(`/api/reminders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/reminders/${id}`, { method: 'DELETE' }),
  addStep: (
    id: string,
    data: { offsetMinutes: number; messageType: string; messageContent: string },
  ) =>
    fetchApi<ApiResponse<ReminderStep>>(`/api/reminders/${id}/steps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteStep: (reminderId: string, stepId: string) =>
    fetchApi<ApiResponse<null>>(`/api/reminders/${reminderId}/steps/${stepId}`, {
      method: 'DELETE',
    }),
};
