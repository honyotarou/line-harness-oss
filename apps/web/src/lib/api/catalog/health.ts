import type {
  AccountHealthLog,
  AccountMigration,
  ApiResponse,
  LineAccount,
} from '@line-crm/shared';
import { fetchApi } from '../client.js';

export const health = {
  accounts: () => fetchApi<ApiResponse<LineAccount[]>>('/api/line-accounts'),
  getHealth: (accountId: string) =>
    fetchApi<ApiResponse<{ riskLevel: string; logs: AccountHealthLog[] }>>(
      `/api/accounts/${accountId}/health`,
    ),
  migrations: () => fetchApi<ApiResponse<AccountMigration[]>>('/api/accounts/migrations'),
  migrate: (fromAccountId: string, data: { toAccountId: string }) =>
    fetchApi<ApiResponse<AccountMigration>>(`/api/accounts/${fromAccountId}/migrate`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getMigration: (migrationId: string) =>
    fetchApi<ApiResponse<AccountMigration>>(`/api/accounts/migrations/${migrationId}`),
};
