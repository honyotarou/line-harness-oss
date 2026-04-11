import type { ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const templates = {
  list: (category?: string) =>
    fetchApi<
      ApiResponse<
        {
          id: string;
          name: string;
          category: string;
          messageType: string;
          messageContent: string;
          createdAt: string;
          updatedAt: string;
        }[]
      >
    >('/api/templates' + (category ? '?' + new URLSearchParams({ category }) : '')),
  get: (id: string) =>
    fetchApi<
      ApiResponse<{
        id: string;
        name: string;
        category: string;
        messageType: string;
        messageContent: string;
        createdAt: string;
        updatedAt: string;
      }>
    >(`/api/templates/${id}`),
  create: (data: {
    name: string;
    category: string;
    messageType: string;
    messageContent: string;
  }) =>
    fetchApi<
      ApiResponse<{
        id: string;
        name: string;
        category: string;
        messageType: string;
        messageContent: string;
        createdAt: string;
        updatedAt: string;
      }>
    >('/api/templates', { method: 'POST', body: JSON.stringify(data) }),
  update: (
    id: string,
    data: Partial<{
      name: string;
      category: string;
      messageType: string;
      messageContent: string;
    }>,
  ) =>
    fetchApi<
      ApiResponse<{
        id: string;
        name: string;
        category: string;
        messageType: string;
        messageContent: string;
        createdAt: string;
        updatedAt: string;
      }>
    >(`/api/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/templates/${id}`, { method: 'DELETE' }),
};
