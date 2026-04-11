import type { ApiResponse, Scenario, ScenarioStep } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const scenarios = {
  list: (params?: { accountId?: string }) => {
    const query = params?.accountId ? '?lineAccountId=' + params.accountId : '';
    return fetchApi<ApiResponse<(Scenario & { stepCount?: number })[]>>('/api/scenarios' + query);
  },
  get: (id: string) =>
    fetchApi<ApiResponse<Scenario & { steps: ScenarioStep[] }>>(`/api/scenarios/${id}`),
  create: (
    data: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt' | 'lineAccountId'> & {
      lineAccountId?: string | null;
    },
  ) =>
    fetchApi<ApiResponse<Scenario>>('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (
    id: string,
    data: Partial<Omit<Scenario, 'id' | 'createdAt' | 'updatedAt' | 'lineAccountId'>>,
  ) =>
    fetchApi<ApiResponse<Scenario>>(`/api/scenarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/scenarios/${id}`, { method: 'DELETE' }),
  addStep: (id: string, data: Omit<ScenarioStep, 'id' | 'scenarioId' | 'createdAt'>) =>
    fetchApi<ApiResponse<ScenarioStep>>(`/api/scenarios/${id}/steps`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateStep: (
    id: string,
    stepId: string,
    data: Partial<Omit<ScenarioStep, 'id' | 'scenarioId' | 'createdAt'>>,
  ) =>
    fetchApi<ApiResponse<ScenarioStep>>(`/api/scenarios/${id}/steps/${stepId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteStep: (id: string, stepId: string) =>
    fetchApi<ApiResponse<null>>(`/api/scenarios/${id}/steps/${stepId}`, {
      method: 'DELETE',
    }),
};
