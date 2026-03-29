import type { Page } from '@playwright/test';

export type MockWebApiHooks = {
  onApiRequest?: (request: { method: string; url: URL }) => void;
};

/**
 * Intercepts browser calls to the Worker API (NEXT_PUBLIC_API_URL) for stable E2E runs without a live backend.
 */
export async function mockWebApi(page: Page, hooks?: MockWebApiHooks): Promise<void> {
  const cookieUrl = 'http://127.0.0.1:8787';

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    hooks?.onApiRequest?.({ method: request.method(), url });
    const cookies = await page.context().cookies(cookieUrl);
    const hasSessionCookie = cookies.some(
      (cookie) => cookie.name === 'lh_admin_session' && cookie.value === 'session-token',
    );

    if (url.pathname === '/api/auth/login') {
      const body = request.postDataJSON() as { apiKey?: string };
      if (body.apiKey === 'valid-key') {
        await page.context().addCookies([
          {
            name: 'lh_admin_session',
            value: 'session-token',
            url: cookieUrl,
            httpOnly: true,
            sameSite: 'Lax',
            secure: false,
          },
        ]);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              expiresAt: '2026-03-26T00:00:00.000Z',
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    if (url.pathname === '/api/auth/logout') {
      await page.context().clearCookies();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: null }),
      });
      return;
    }

    if (url.pathname === '/api/auth/session') {
      if (hasSessionCookie) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { authenticated: true } }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    if (url.pathname === '/api/friends/count') {
      if (hasSessionCookie) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { count: 42 } }),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    if (!hasSessionCookie) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Unauthorized' }),
      });
      return;
    }

    const method = request.method();
    const path = url.pathname;

    const ok = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data }),
      });

    if (path === '/api/friends') {
      await ok({
        items: [
          {
            id: 'friend-1',
            lineUserId: 'U111',
            displayName: 'テスト太郎',
            pictureUrl: null,
            statusMessage: null,
            isFollowing: true,
            lineAccountId: 'account-1',
            userId: null,
            refCode: null,
            metadata: {},
            createdAt: '2026-03-26T10:00:00+09:00',
            updatedAt: '2026-03-26T10:00:00+09:00',
            tags: [
              {
                id: 'tag-1',
                name: 'VIP',
                color: '#ff0000',
                createdAt: '2026-03-26T10:00:00+09:00',
              },
            ],
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        hasNextPage: false,
      });
      return;
    }

    if (path === '/api/tags') {
      await ok([
        { id: 'tag-1', name: 'VIP', color: '#ff0000', createdAt: '2026-03-26T10:00:00+09:00' },
      ]);
      return;
    }

    const friendMessagesMatch = path.match(/^\/api\/friends\/([^/]+)\/messages$/);
    if (friendMessagesMatch && method === 'GET') {
      await ok([]);
      return;
    }
    if (friendMessagesMatch && method === 'POST') {
      await ok({ id: 'msg-new' });
      return;
    }

    if (path === '/api/analytics/ref-summary') {
      await ok({
        routes: [
          {
            refCode: 'spring',
            name: '春キャンペーン',
            friendCount: 3,
            clickCount: 12,
            latestAt: '2026-03-15T10:00:00.000Z',
          },
        ],
        totalFriends: 100,
        friendsWithRef: 25,
        friendsWithoutRef: 75,
      });
      return;
    }

    if (path.startsWith('/api/analytics/ref/') && path !== '/api/analytics/ref-summary') {
      const refCode = decodeURIComponent(path.slice('/api/analytics/ref/'.length));
      await ok({
        refCode,
        name: '春キャンペーン',
        friends: [
          {
            id: 'friend-1',
            displayName: 'テスト太郎',
            trackedAt: '2026-03-10T00:00:00.000Z',
          },
        ],
      });
      return;
    }

    if (path === '/api/webhooks/incoming') {
      await ok([
        {
          id: 'in-1',
          name: 'Stripe',
          sourceType: 'stripe',
          secret: 'sec',
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }

    if (path === '/api/webhooks/outgoing') {
      await ok([
        {
          id: 'out-1',
          name: '外部通知',
          url: 'https://example.com/hook',
          eventTypes: ['friend_add'],
          secret: null,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }

    if (path === '/api/chats') {
      await ok([
        {
          id: 'chat-1',
          friendId: 'friend-1',
          friendName: 'テスト太郎',
          friendPictureUrl: null,
          operatorId: null,
          status: 'unread',
          notes: null,
          lastMessageAt: '2026-03-20T12:00:00.000Z',
          createdAt: '2026-03-20T10:00:00.000Z',
          updatedAt: '2026-03-20T12:00:00.000Z',
        },
      ]);
      return;
    }

    const chatIdMatch = path.match(/^\/api\/chats\/([^/]+)$/);
    if (chatIdMatch && method === 'GET') {
      await ok({
        id: chatIdMatch[1],
        friendId: 'friend-1',
        friendName: 'テスト太郎',
        friendPictureUrl: null,
        operatorId: null,
        status: 'unread',
        notes: null,
        lastMessageAt: '2026-03-20T12:00:00.000Z',
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T12:00:00.000Z',
        messages: [
          {
            id: 'm1',
            direction: 'incoming',
            messageType: 'text',
            content: 'こんにちは',
            createdAt: '2026-03-20T11:00:00.000Z',
          },
        ],
      });
      return;
    }
    if (chatIdMatch && method === 'PUT') {
      await ok({
        id: chatIdMatch[1],
        friendId: 'friend-1',
        friendName: 'テスト太郎',
        friendPictureUrl: null,
        operatorId: null,
        status: 'in_progress',
        notes: null,
        lastMessageAt: '2026-03-20T12:00:00.000Z',
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T12:00:00.000Z',
      });
      return;
    }

    const chatSendMatch = path.match(/^\/api\/chats\/([^/]+)\/send$/);
    if (chatSendMatch && method === 'POST') {
      await ok({ ok: true });
      return;
    }

    if (path === '/api/reminders') {
      await ok([
        {
          id: 'rem-1',
          name: 'フォローアップ',
          description: null,
          isActive: true,
          lineAccountId: 'account-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }

    if (path === '/api/conversions/points' && method === 'GET') {
      await ok([
        {
          id: 'cv-1',
          name: '資料ダウンロード',
          eventType: 'custom',
          value: 100,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }
    if (path === '/api/conversions/points' && method === 'POST') {
      await ok({
        id: 'cv-new',
        name: '新規CV',
        eventType: 'custom',
        value: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    if (path === '/api/conversions/report') {
      await ok([
        {
          conversionPointId: 'cv-1',
          conversionPointName: '資料ダウンロード',
          eventType: 'custom',
          totalCount: 5,
          totalValue: 500,
        },
      ]);
      return;
    }

    if (path === '/api/forms') {
      await ok([{ id: 'form-1', name: 'お問い合わせ' }]);
      return;
    }

    const formSubmissionsMatch = path.match(/^\/api\/forms\/([^/]+)\/submissions$/);
    if (formSubmissionsMatch) {
      await ok([
        {
          id: 'sub-1',
          formId: formSubmissionsMatch[1],
          friendId: 'friend-1',
          data: { message: 'hello' },
          createdAt: '2026-03-26T10:00:00.000Z',
        },
      ]);
      return;
    }

    if (path === '/api/users') {
      await ok([]);
      return;
    }

    const accountHealthMatch = path.match(/^\/api\/accounts\/([^/]+)\/health$/);
    if (accountHealthMatch) {
      await ok({
        riskLevel: 'normal',
        logs: [],
      });
      return;
    }

    if (path === '/api/accounts/migrations') {
      await ok([]);
      return;
    }

    const scenarioDetailMatch = path.match(/^\/api\/scenarios\/([^/]+)$/);
    if (scenarioDetailMatch && method === 'GET') {
      await ok({
        id: scenarioDetailMatch[1],
        name: 'ウェルカムフロー',
        description: 'E2E 用',
        triggerType: 'friend_add',
        triggerTagId: null,
        isActive: true,
        lineAccountId: 'account-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        steps: [
          {
            id: 'step-1',
            scenarioId: scenarioDetailMatch[1],
            stepOrder: 1,
            delayMinutes: 0,
            messageType: 'text',
            messageContent: 'ようこそ',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
      return;
    }
    if (scenarioDetailMatch && method === 'PUT') {
      await ok({
        id: scenarioDetailMatch[1],
        name: 'ウェルカムフロー',
        description: 'E2E 用',
        triggerType: 'friend_add',
        triggerTagId: null,
        isActive: false,
        lineAccountId: 'account-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    const broadcastIdMatch = path.match(/^\/api\/broadcasts\/([^/]+)$/);
    if (broadcastIdMatch && method === 'PUT') {
      await ok({
        id: broadcastIdMatch[1],
        title: '予約配信A',
        messageType: 'text',
        messageContent: 'Hi',
        targetType: 'all',
        targetTagId: null,
        status: 'draft',
        lineAccountId: 'account-1',
        scheduledAt: null,
        sentAt: null,
        totalCount: 0,
        successCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    if (path === '/api/line-accounts' && method === 'POST') {
      await ok({
        id: 'new-acc',
        channelId: 'ch-new',
        name: 'New',
        displayName: 'New',
        isActive: true,
        stats: { friendCount: 0, activeScenarios: 0, messagesThisMonth: 0 },
      });
      return;
    }

    if (path === '/api/line-accounts' && method === 'GET') {
      await ok([
        {
          id: 'account-1',
          channelId: 'channel-1',
          name: 'Main Account',
          displayName: 'Main Account',
          isActive: true,
          stats: { friendCount: 42, activeScenarios: 2, messagesThisMonth: 10 },
        },
      ]);
      return;
    }

    if (path === '/api/scenarios' && method === 'GET') {
      await ok([
        {
          id: 'scenario-1',
          name: 'ウェルカムフロー',
          description: '新規友だち向け',
          triggerType: 'friend_add',
          triggerTagId: null,
          isActive: true,
          lineAccountId: 'account-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          stepCount: 2,
        },
        {
          id: 'scenario-2',
          name: '休眠掘り起こし',
          description: null,
          triggerType: 'manual',
          triggerTagId: null,
          isActive: false,
          lineAccountId: 'account-1',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          stepCount: 0,
        },
      ]);
      return;
    }
    if (path === '/api/scenarios' && method === 'POST') {
      await ok({
        id: 'scenario-new',
        name: '新規シナリオ',
        description: null,
        triggerType: 'friend_add',
        triggerTagId: null,
        isActive: true,
        lineAccountId: 'account-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    if (path === '/api/broadcasts' && method === 'GET') {
      await ok([
        {
          id: 'broadcast-1',
          title: '週末セール告知',
          messageType: 'text',
          messageContent: '今週末限定',
          targetType: 'all',
          targetTagId: null,
          status: 'scheduled',
          lineAccountId: 'account-1',
          scheduledAt: '2026-03-30T10:00:00.000Z',
          sentAt: null,
          totalCount: 100,
          successCount: 0,
          createdAt: '2026-03-26T00:00:00.000Z',
        },
      ]);
      return;
    }
    if (path === '/api/broadcasts' && method === 'POST') {
      await ok({
        id: 'broadcast-new',
        title: '新規',
        messageType: 'text',
        messageContent: '',
        targetType: 'all',
        targetTagId: null,
        status: 'draft',
        lineAccountId: 'account-1',
        scheduledAt: null,
        sentAt: null,
        totalCount: 0,
        successCount: 0,
        createdAt: '2026-03-26T00:00:00.000Z',
      });
      return;
    }

    if (path === '/api/templates' && method === 'GET') {
      await ok([
        {
          id: 'template-1',
          name: 'ウェルカム文面',
          category: '挨拶',
          messageType: 'text',
          messageContent: 'はじめまして',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }
    if (path === '/api/templates' && method === 'POST') {
      await ok({
        id: 'template-new',
        name: '新規',
        category: '一般',
        messageType: 'text',
        messageContent: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    if (path === '/api/automations' && method === 'GET') {
      await ok([
        {
          id: 'automation-1',
          name: '追加時タグ付与',
          description: null,
          eventType: 'friend_add',
          conditions: {},
          actions: [{ type: 'add_tag', params: { tagId: 'tag-1' } }],
          isActive: true,
          priority: 10,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }
    if (path === '/api/automations' && method === 'POST') {
      await ok({
        id: 'automation-new',
        name: '新規',
        description: null,
        eventType: 'friend_add',
        conditions: {},
        actions: [],
        isActive: true,
        priority: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    if (path === '/api/scoring-rules' && method === 'GET') {
      await ok([
        {
          id: 'rule-1',
          name: '開封ボーナス',
          eventType: 'message_open',
          scoreValue: 5,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
      return;
    }
    if (path === '/api/scoring-rules' && method === 'POST') {
      await ok({
        id: 'rule-new',
        name: '新規',
        eventType: 'custom',
        scoreValue: 1,
        isActive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      return;
    }

    if (path === '/api/notifications/rules') {
      await ok([]);
      return;
    }
    if (path === '/api/notifications') {
      await ok([]);
      return;
    }

    await ok([]);
  });
}
