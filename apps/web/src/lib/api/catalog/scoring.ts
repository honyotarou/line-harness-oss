import type { ApiResponse, ScoringRule } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const scoring = {
  rules: () => fetchApi<ApiResponse<ScoringRule[]>>('/api/scoring-rules'),
  getRule: (id: string) => fetchApi<ApiResponse<ScoringRule>>(`/api/scoring-rules/${id}`),
  createRule: (data: { name: string; eventType: string; scoreValue: number }) =>
    fetchApi<ApiResponse<ScoringRule>>('/api/scoring-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRule: (
    id: string,
    data: Partial<Pick<ScoringRule, 'name' | 'eventType' | 'scoreValue' | 'isActive'>>,
  ) =>
    fetchApi<ApiResponse<ScoringRule>>(`/api/scoring-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteRule: (id: string) =>
    fetchApi<ApiResponse<null>>(`/api/scoring-rules/${id}`, { method: 'DELETE' }),
  friendScore: (friendId: string) =>
    fetchApi<
      ApiResponse<{
        currentScore: number;
        history: { id: string; scoreChange: number; reason: string | null; createdAt: string }[];
      }>
    >(`/api/friends/${friendId}/score`),
};
