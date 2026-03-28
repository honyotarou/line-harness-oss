import type {
  Friend,
  Tag,
  Scenario,
  ScenarioStep,
  ApiResponse,
  PaginatedResponse,
  User,
  LineAccount,
  ConversionPoint,
  Affiliate,
  Template,
  Automation,
  AutomationLog,
  Chat,
  Reminder,
  ReminderStep,
  ScoringRule,
  IncomingWebhook,
  OutgoingWebhook,
  NotificationRule,
  Notification,
  AccountHealthLog,
  AccountMigration,
} from '@line-crm/shared';

import type { Broadcast } from '@line-crm/shared';

/** Broadcast type from API (now camelCase after worker serialization) */
export type ApiBroadcast = Broadcast;

const DEFAULT_API_URL = 'http://127.0.0.1:8787';

function resolveApiUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Testable HTTP helper: all browser `fetchApi` calls go through here. */
export async function fetchApiCore<T>(
  baseUrl: string,
  fetchImpl: typeof fetch,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> | undefined),
  };
  const res = await fetchImpl(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    throw new ApiError(`API error: ${res.status}`, res.status, body);
  }
  return res.json() as Promise<T>;
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchApiCore<T>(resolveApiUrl(), globalThis.fetch.bind(globalThis), path, options);
}

export type FriendListParams = {
  offset?: string;
  limit?: string;
  tagId?: string;
  accountId?: string;
};

export type FriendWithTags = Friend & { tags: Tag[] };

export const api = {
  auth: {
    login: (apiKey: string) =>
      fetchApi<ApiResponse<{ expiresAt: string }>>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ apiKey }),
      }),
    session: () => fetchApi<ApiResponse<{ authenticated: boolean }>>('/api/auth/session'),
    logout: () =>
      fetchApi<ApiResponse<null>>('/api/auth/logout', {
        method: 'POST',
      }),
  },
  friends: {
    list: (params?: FriendListParams) => {
      const query: Record<string, string> = {};
      if (params?.offset) query.offset = params.offset;
      if (params?.limit) query.limit = params.limit;
      if (params?.tagId) query.tagId = params.tagId;
      if (params?.accountId) query.lineAccountId = params.accountId;
      return fetchApi<ApiResponse<PaginatedResponse<FriendWithTags>>>(
        '/api/friends?' + new URLSearchParams(query),
      );
    },
    get: (id: string) => fetchApi<ApiResponse<FriendWithTags>>(`/api/friends/${id}`),
    count: (params?: { accountId?: string }) => {
      const query = params?.accountId ? '?lineAccountId=' + params.accountId : '';
      return fetchApi<ApiResponse<{ count: number }>>('/api/friends/count' + query);
    },
    addTag: (friendId: string, tagId: string) =>
      fetchApi<ApiResponse<null>>(`/api/friends/${friendId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tagId }),
      }),
    removeTag: (friendId: string, tagId: string) =>
      fetchApi<ApiResponse<null>>(`/api/friends/${friendId}/tags/${tagId}`, {
        method: 'DELETE',
      }),
  },
  tags: {
    list: () => fetchApi<ApiResponse<Tag[]>>('/api/tags'),
    create: (data: { name: string; color: string }) =>
      fetchApi<ApiResponse<Tag>>('/api/tags', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/tags/${id}`, { method: 'DELETE' }),
  },
  scenarios: {
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
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/scenarios/${id}`, { method: 'DELETE' }),
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
  },
  broadcasts: {
    list: (params?: { accountId?: string }) => {
      const query = params?.accountId ? '?lineAccountId=' + params.accountId : '';
      return fetchApi<ApiResponse<ApiBroadcast[]>>('/api/broadcasts' + query);
    },
    get: (id: string) => fetchApi<ApiResponse<ApiBroadcast>>(`/api/broadcasts/${id}`),
    create: (data: {
      title: string;
      messageType: ApiBroadcast['messageType'];
      messageContent: string;
      targetType: ApiBroadcast['targetType'];
      targetTagId?: string | null;
      scheduledAt?: string | null;
      status?: ApiBroadcast['status'];
      lineAccountId?: string | null;
    }) =>
      fetchApi<ApiResponse<ApiBroadcast>>('/api/broadcasts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: {
        title?: string;
        messageType?: ApiBroadcast['messageType'];
        messageContent?: string;
        targetType?: ApiBroadcast['targetType'];
        targetTagId?: string | null;
        scheduledAt?: string | null;
      },
    ) =>
      fetchApi<ApiResponse<ApiBroadcast>>(`/api/broadcasts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/broadcasts/${id}`, { method: 'DELETE' }),
    send: (id: string) =>
      fetchApi<ApiResponse<ApiBroadcast>>(`/api/broadcasts/${id}/send`, { method: 'POST' }),
  },

  // ── Round 2 APIs ─────────────────────────────────────────────────────────
  users: {
    list: () => fetchApi<ApiResponse<User[]>>('/api/users'),
    get: (id: string) => fetchApi<ApiResponse<User>>(`/api/users/${id}`),
    create: (data: {
      email?: string | null;
      phone?: string | null;
      externalId?: string | null;
      displayName?: string | null;
    }) =>
      fetchApi<ApiResponse<User>>('/api/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<Pick<User, 'email' | 'phone' | 'externalId' | 'displayName'>>,
    ) =>
      fetchApi<ApiResponse<User>>(`/api/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => fetchApi<ApiResponse<null>>(`/api/users/${id}`, { method: 'DELETE' }),
    link: (userId: string, friendId: string) =>
      fetchApi<ApiResponse<null>>(`/api/users/${userId}/link`, {
        method: 'POST',
        body: JSON.stringify({ friendId }),
      }),
    accounts: (userId: string) =>
      fetchApi<
        ApiResponse<
          { id: string; lineUserId: string; displayName: string | null; isFollowing: boolean }[]
        >
      >(`/api/users/${userId}/accounts`),
  },
  lineAccounts: {
    list: () => fetchApi<ApiResponse<LineAccount[]>>('/api/line-accounts'),
    get: (id: string) => fetchApi<ApiResponse<LineAccount>>(`/api/line-accounts/${id}`),
    create: (data: {
      channelId: string;
      name: string;
      channelAccessToken: string;
      channelSecret: string;
    }) =>
      fetchApi<ApiResponse<LineAccount>>('/api/line-accounts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<
        Pick<LineAccount, 'name' | 'channelAccessToken' | 'channelSecret' | 'isActive'>
      >,
    ) =>
      fetchApi<ApiResponse<LineAccount>>(`/api/line-accounts/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/line-accounts/${id}`, { method: 'DELETE' }),
  },
  conversions: {
    points: () => fetchApi<ApiResponse<ConversionPoint[]>>('/api/conversions/points'),
    createPoint: (data: { name: string; eventType: string; value?: number | null }) =>
      fetchApi<ApiResponse<ConversionPoint>>('/api/conversions/points', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    deletePoint: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/conversions/points/${id}`, { method: 'DELETE' }),
    track: (data: {
      conversionPointId: string;
      friendId: string;
      userId?: string | null;
      affiliateCode?: string | null;
      metadata?: Record<string, unknown> | null;
    }) =>
      fetchApi<ApiResponse<unknown>>('/api/conversions/track', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    report: (params?: { startDate?: string; endDate?: string }) =>
      fetchApi<
        ApiResponse<
          {
            conversionPointId: string;
            conversionPointName: string;
            eventType: string;
            totalCount: number;
            totalValue: number;
          }[]
        >
      >('/api/conversions/report?' + new URLSearchParams(params as Record<string, string>)),
  },
  affiliates: {
    list: () => fetchApi<ApiResponse<Affiliate[]>>('/api/affiliates'),
    get: (id: string) => fetchApi<ApiResponse<Affiliate>>(`/api/affiliates/${id}`),
    create: (data: { name: string; code: string; commissionRate?: number }) =>
      fetchApi<ApiResponse<Affiliate>>('/api/affiliates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Pick<Affiliate, 'name' | 'commissionRate' | 'isActive'>>) =>
      fetchApi<ApiResponse<Affiliate>>(`/api/affiliates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/affiliates/${id}`, { method: 'DELETE' }),
    report: (id: string, params?: { startDate?: string; endDate?: string }) =>
      fetchApi<
        ApiResponse<{
          affiliateId: string;
          affiliateName: string;
          code: string;
          commissionRate: number;
          totalClicks: number;
          totalConversions: number;
          totalRevenue: number;
        }>
      >(`/api/affiliates/${id}/report?` + new URLSearchParams(params as Record<string, string>)),
  },
  templates: {
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
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/templates/${id}`, { method: 'DELETE' }),
  },
  automations: {
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
  },
  chats: {
    list: (params?: { status?: string; operatorId?: string; accountId?: string }) => {
      const query: Record<string, string> = {};
      if (params?.status) query.status = params.status;
      if (params?.operatorId) query.operatorId = params.operatorId;
      if (params?.accountId) query.lineAccountId = params.accountId;
      return fetchApi<ApiResponse<Chat[]>>('/api/chats?' + new URLSearchParams(query));
    },
    get: (id: string) =>
      fetchApi<
        ApiResponse<
          Chat & {
            messages?: { id: string; content: string; senderType: string; createdAt: string }[];
          }
        >
      >(`/api/chats/${id}`),
    create: (data: {
      friendId: string;
      operatorId?: string | null;
      lineAccountId?: string | null;
    }) =>
      fetchApi<ApiResponse<Chat>>('/api/chats', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: { operatorId?: string | null; status?: Chat['status']; notes?: string | null },
    ) =>
      fetchApi<ApiResponse<Chat>>(`/api/chats/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    send: (id: string, data: { content: string; messageType?: string }) =>
      fetchApi<ApiResponse<unknown>>(`/api/chats/${id}/send`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  reminders: {
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
    delete: (id: string) =>
      fetchApi<ApiResponse<null>>(`/api/reminders/${id}`, { method: 'DELETE' }),
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
  },
  scoring: {
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
  },
  webhooks: {
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
  },
  notifications: {
    rules: {
      list: (params?: { lineAccountId?: string }) =>
        fetchApi<ApiResponse<NotificationRule[]>>(
          '/api/notifications/rules' +
            (params?.lineAccountId
              ? `?lineAccountId=${encodeURIComponent(params.lineAccountId)}`
              : ''),
        ),
      get: (id: string) =>
        fetchApi<ApiResponse<NotificationRule>>(`/api/notifications/rules/${id}`),
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
  },
  health: {
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
  },
};
