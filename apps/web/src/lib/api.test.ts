import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fetchApiCore } from './api';

describe('api object (integration via global fetch)', () => {
  it('setAdminSessionToken and clearAdminSessionToken no-op when window is undefined (SSR/Node)', async () => {
    vi.resetModules();
    const { setAdminSessionToken, clearAdminSessionToken } = await import('./api');
    expect(() => setAdminSessionToken('x')).not.toThrow();
    expect(() => clearAdminSessionToken()).not.toThrow();
  });

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = 'https://worker.test';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20, hasNextPage: false },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getApiBaseUrl returns NEXT_PUBLIC_API_URL', async () => {
    const { getApiBaseUrl } = await import('./api');
    expect(getApiBaseUrl()).toBe('https://worker.test');
  });

  it('friends.list passes lineAccountId and pagination as query params', async () => {
    const { api } = await import('./api');
    const res = await api.friends.list({ accountId: 'acc-1', limit: '10', offset: '0' });
    expect(res.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/friends?offset=0&limit=10&lineAccountId=acc-1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('friends.list includes tagId when set', async () => {
    const { api } = await import('./api');
    await api.friends.list({ tagId: 'tag-x' });
    const url = vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0] as string;
    expect(new URL(url).searchParams.get('tagId')).toBe('tag-x');
  });

  it('auth.login POSTs apiKey JSON body', async () => {
    delete process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN;
    const { api } = await import('./api');
    await api.auth.login('secret-key');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ apiKey: 'secret-key' }),
      }),
    );
  });

  it('auth.login POSTs empty JSON when NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN', async () => {
    process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN = '1';
    const { api } = await import('./api');
    await api.auth.login();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    delete process.env.NEXT_PUBLIC_USE_CLOUDFLARE_ACCESS_LOGIN;
  });

  it('scenarios.list adds lineAccountId query when accountId set', async () => {
    const { api } = await import('./api');
    await api.scenarios.list({ accountId: 'acc-9' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios?lineAccountId=acc-9',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('scenarios.list omits query when no accountId', async () => {
    const { api } = await import('./api');
    await api.scenarios.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('broadcasts.list passes lineAccountId like scenarios', async () => {
    const { api } = await import('./api');
    await api.broadcasts.list({ accountId: 'b1' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/broadcasts?lineAccountId=b1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('broadcasts.list omits query without accountId', async () => {
    const { api } = await import('./api');
    await api.broadcasts.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/broadcasts',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('tags.create POSTs JSON body', async () => {
    const { api } = await import('./api');
    await api.tags.create({ name: 'VIP', color: '#f00' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/tags',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'VIP', color: '#f00' }),
      }),
    );
  });

  it('tags.delete uses DELETE method', async () => {
    const { api } = await import('./api');
    await api.tags.delete('tag-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/tags/tag-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('lineAccounts.list hits /api/line-accounts', async () => {
    const { api } = await import('./api');
    await api.lineAccounts.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/line-accounts',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('users.list hits /api/users', async () => {
    const { api } = await import('./api');
    await api.users.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/users',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('conversions.points hits /api/conversions/points', async () => {
    const { api } = await import('./api');
    await api.conversions.points();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/conversions/points',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('health.getHealth uses account path', async () => {
    const { api } = await import('./api');
    await api.health.getHealth('acc-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/accounts/acc-1/health',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('health.migrations hits list endpoint', async () => {
    const { api } = await import('./api');
    await api.health.migrations();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/accounts/migrations',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('health.migrate POSTs body', async () => {
    const { api } = await import('./api');
    await api.health.migrate('from-1', { toAccountId: 'to-2' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/accounts/from-1/migrate',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ toAccountId: 'to-2' }),
      }),
    );
  });

  it('notifications.rules.list adds lineAccountId query', async () => {
    const { api } = await import('./api');
    await api.notifications.rules.list({ lineAccountId: 'la-1' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/notifications/rules?lineAccountId=la-1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('notifications.rules.list has no query without lineAccountId', async () => {
    const { api } = await import('./api');
    await api.notifications.rules.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/notifications/rules',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('notifications.list builds query string', async () => {
    const { api } = await import('./api');
    await api.notifications.list({ lineAccountId: 'la-1', limit: '50', status: 'sent' });
    const url = vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0] as string;
    expect(url).toMatch(/^https:\/\/worker\.test\/api\/notifications\?/);
    const sp = new URL(url).searchParams;
    expect(sp.get('lineAccountId')).toBe('la-1');
    expect(sp.get('limit')).toBe('50');
    expect(sp.get('status')).toBe('sent');
  });

  it('health.accounts and health.getMigration hit expected paths', async () => {
    const { api } = await import('./api');
    await api.health.accounts();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/line-accounts',
      expect.objectContaining({ credentials: 'include' }),
    );
    await api.health.getMigration('mig-1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/accounts/migrations/mig-1',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('auth.session and auth.logout', async () => {
    const { api } = await import('./api');
    await api.auth.session();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/auth/session',
      expect.objectContaining({ credentials: 'include' }),
    );
    await api.auth.logout();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('friends.get count addTag removeTag', async () => {
    const { api } = await import('./api');
    await api.friends.get('f1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/friends/f1',
      expect.anything(),
    );
    await api.friends.count();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/friends/count',
      expect.anything(),
    );
    await api.friends.count({ accountId: 'a1' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/friends/count?lineAccountId=a1',
      expect.anything(),
    );
    await api.friends.addTag('f1', 't1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/friends/f1/tags',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ tagId: 't1' }) }),
    );
    await api.friends.removeTag('f1', 't1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/friends/f1/tags/t1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('scenarios CRUD and steps', async () => {
    const { api } = await import('./api');
    await api.scenarios.get('s1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios/s1',
      expect.anything(),
    );
    await api.scenarios.create({ name: 'n', lineAccountId: null } as Parameters<
      typeof api.scenarios.create
    >[0]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.scenarios.update('s1', { name: 'x' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios/s1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.scenarios.delete('s1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios/s1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.scenarios.addStep('s1', {
      offsetMinutes: 0,
      messageType: 'text',
      messageContent: 'hi',
    } as Parameters<typeof api.scenarios.addStep>[1]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios/s1/steps',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.scenarios.updateStep('s1', 'st1', { messageContent: 'u' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios/s1/steps/st1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.scenarios.deleteStep('s1', 'st1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scenarios/s1/steps/st1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('broadcasts get create update delete send', async () => {
    const { api } = await import('./api');
    await api.broadcasts.get('b1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/broadcasts/b1',
      expect.anything(),
    );
    await api.broadcasts.create({
      title: 't',
      messageType: 'text',
      messageContent: 'm',
      targetType: 'all',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/broadcasts',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.broadcasts.update('b1', { title: 'u' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/broadcasts/b1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.broadcasts.delete('b1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/broadcasts/b1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.broadcasts.send('b1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/broadcasts/b1/send',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ confirm: true }),
      }),
    );
  });

  it('users get create update delete link accounts', async () => {
    const { api } = await import('./api');
    await api.users.get('u1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/users/u1',
      expect.anything(),
    );
    await api.users.create({ email: 'a@b.c' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/users',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'a@b.c' }) }),
    );
    await api.users.update('u1', { displayName: 'd' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/users/u1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.users.delete('u1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/users/u1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.users.link('u1', 'f1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/users/u1/link',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ friendId: 'f1' }) }),
    );
    await api.users.accounts('u1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/users/u1/accounts',
      expect.anything(),
    );
  });

  it('lineAccounts get create update delete', async () => {
    const { api } = await import('./api');
    await api.lineAccounts.get('la1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/line-accounts/la1',
      expect.anything(),
    );
    await api.lineAccounts.create({
      channelId: 'c',
      name: 'n',
      channelAccessToken: 't',
      channelSecret: 's',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/line-accounts',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.lineAccounts.update('la1', { name: 'x' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/line-accounts/la1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.lineAccounts.delete('la1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/line-accounts/la1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('conversions createPoint deletePoint track report', async () => {
    const { api } = await import('./api');
    await api.conversions.createPoint({ name: 'p', eventType: 'e' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/conversions/points',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.conversions.deletePoint('cp1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/conversions/points/cp1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.conversions.track({ conversionPointId: 'c', friendId: 'f' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/conversions/track',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.conversions.report({ startDate: 'a', endDate: 'b' });
    const reportUrl = vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0] as string;
    expect(reportUrl).toMatch(/^https:\/\/worker\.test\/api\/conversions\/report\?/);
    const rsp = new URL(reportUrl).searchParams;
    expect(rsp.get('startDate')).toBe('a');
    expect(rsp.get('endDate')).toBe('b');
  });

  it('affiliates CRUD and report query', async () => {
    const { api } = await import('./api');
    await api.affiliates.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/affiliates',
      expect.anything(),
    );
    await api.affiliates.get('a1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/affiliates/a1',
      expect.anything(),
    );
    await api.affiliates.create({ name: 'n', code: 'c' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/affiliates',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.affiliates.update('a1', { name: 'x' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/affiliates/a1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.affiliates.delete('a1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/affiliates/a1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.affiliates.report('a1', { startDate: '1', endDate: '2' });
    const u = vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0] as string;
    expect(u).toContain('/api/affiliates/a1/report?');
    expect(new URL(u).searchParams.get('startDate')).toBe('1');
  });

  it('templates list with category and CRUD', async () => {
    const { api } = await import('./api');
    await api.templates.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/templates',
      expect.anything(),
    );
    await api.templates.list('cat');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/templates?' + new URLSearchParams({ category: 'cat' }),
      expect.anything(),
    );
    await api.templates.get('t1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/templates/t1',
      expect.anything(),
    );
    await api.templates.create({
      name: 'n',
      category: 'c',
      messageType: 'text',
      messageContent: '{}',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/templates',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.templates.update('t1', { name: 'u' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/templates/t1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.templates.delete('t1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/templates/t1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('automations list logs with limit', async () => {
    const { api } = await import('./api');
    await api.automations.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations',
      expect.anything(),
    );
    await api.automations.list({ accountId: 'x' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations?lineAccountId=x',
      expect.anything(),
    );
    await api.automations.get('a1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations/a1',
      expect.anything(),
    );
    await api.automations.create({
      name: 'n',
      eventType: 'friend_added',
      actions: [],
    } as Parameters<typeof api.automations.create>[0]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.automations.update('a1', { name: 'u' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations/a1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.automations.delete('a1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations/a1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.automations.logs('a1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations/a1/logs',
      expect.anything(),
    );
    await api.automations.logs('a1', 10);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/automations/a1/logs?limit=10',
      expect.anything(),
    );
  });

  it('chats list get create update send', async () => {
    const { api } = await import('./api');
    await api.chats.list({ status: 'open', operatorId: 'o1', accountId: 'acc' });
    const chatListUrl = vi.mocked(globalThis.fetch).mock.calls.at(-1)?.[0] as string;
    expect(chatListUrl).toMatch(/^https:\/\/worker\.test\/api\/chats\?/);
    const csp = new URL(chatListUrl).searchParams;
    expect(csp.get('status')).toBe('open');
    expect(csp.get('operatorId')).toBe('o1');
    expect(csp.get('lineAccountId')).toBe('acc');
    await api.chats.get('c1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/chats/c1',
      expect.anything(),
    );
    await api.chats.create({ friendId: 'f1' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/chats',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.chats.update('c1', { status: 'closed' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/chats/c1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.chats.send('c1', { content: 'hi' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/chats/c1/send',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('reminders CRUD and steps', async () => {
    const { api } = await import('./api');
    await api.reminders.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders',
      expect.anything(),
    );
    await api.reminders.list({ accountId: 'r' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders?lineAccountId=r',
      expect.anything(),
    );
    await api.reminders.get('r1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders/r1',
      expect.anything(),
    );
    await api.reminders.create({ name: 'n' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.reminders.update('r1', { name: 'u' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders/r1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.reminders.delete('r1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders/r1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.reminders.addStep('r1', {
      offsetMinutes: 1,
      messageType: 'text',
      messageContent: 'm',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders/r1/steps',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.reminders.deleteStep('r1', 's1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/reminders/r1/steps/s1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('scoring rules and friendScore', async () => {
    const { api } = await import('./api');
    await api.scoring.rules();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scoring-rules',
      expect.anything(),
    );
    await api.scoring.getRule('sr1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scoring-rules/sr1',
      expect.anything(),
    );
    await api.scoring.createRule({ name: 'n', eventType: 'e', scoreValue: 1 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scoring-rules',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.scoring.updateRule('sr1', { scoreValue: 2 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scoring-rules/sr1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.scoring.deleteRule('sr1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/scoring-rules/sr1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.scoring.friendScore('f1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/friends/f1/score',
      expect.anything(),
    );
  });

  it('webhooks incoming and outgoing CRUD', async () => {
    const { api } = await import('./api');
    await api.webhooks.incoming.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/incoming',
      expect.anything(),
    );
    await api.webhooks.incoming.create({ name: 'n' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/incoming',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.webhooks.incoming.update('i1', { name: 'u' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/incoming/i1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.webhooks.incoming.delete('i1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/incoming/i1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    await api.webhooks.outgoing.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/outgoing',
      expect.anything(),
    );
    await api.webhooks.outgoing.create({ name: 'n', url: 'https://x', eventTypes: ['a'] });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/outgoing',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.webhooks.outgoing.update('o1', { url: 'https://y' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/outgoing/o1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.webhooks.outgoing.delete('o1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/webhooks/outgoing/o1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('notifications.rules get create update delete', async () => {
    const { api } = await import('./api');
    await api.notifications.rules.get('nr1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/notifications/rules/nr1',
      expect.anything(),
    );
    await api.notifications.rules.create({
      name: 'n',
      eventType: 'e',
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/notifications/rules',
      expect.objectContaining({ method: 'POST' }),
    );
    await api.notifications.rules.update('nr1', { isActive: false });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/notifications/rules/nr1',
      expect.objectContaining({ method: 'PUT' }),
    );
    await api.notifications.rules.delete('nr1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/notifications/rules/nr1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('tags.list hits GET /api/tags', async () => {
    const { api } = await import('./api');
    await api.tags.list();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.test/api/tags',
      expect.anything(),
    );
  });
});

describe('api default base URL', () => {
  const saved = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = saved;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses Cloudflare placeholder when NEXT_PUBLIC_API_URL is unset', async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      }),
    );
    vi.resetModules();
    const { api } = await import('./api');
    await api.tags.list();
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]).toBe(
      'https://your_subdomain.workers.dev/api/tags',
    );
  });
});

describe('fetchApiCore', () => {
  it('throws ApiError when the API base URL is not allowed (e.g. remote http)', async () => {
    const fetchMock = vi.fn();
    await expect(
      fetchApiCore('http://evil.com', fetchMock as typeof fetch, '/api/friends'),
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      message: expect.stringMatching(/Misconfigured API URL/i),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests baseUrl + path with credentials include and default Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    await fetchApiCore('https://api.example', fetchMock as typeof fetch, '/api/friends', {
      method: 'POST',
      body: '{}',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/friends',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Line-Harness-Client': '1',
        }),
      }),
    );
  });

  it('merges caller headers over defaults', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    await fetchApiCore('https://x', fetchMock as typeof fetch, '/p', {
      headers: { 'X-Custom': '1' },
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Custom': '1',
      'X-Line-Harness-Client': '1',
    });
  });

  it('returns parsed JSON on 2xx', async () => {
    const data = { success: true, data: { id: '1' } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => data,
    });

    const result = await fetchApiCore<typeof data>('https://x', fetchMock as typeof fetch, '/p');
    expect(result).toEqual(data);
  });

  it('throws ApiError with status and JSON body on error response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: 'Unauthorized' }),
    });

    await expect(fetchApiCore('https://x', fetchMock as typeof fetch, '/p')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      body: { success: false, error: 'Unauthorized' },
    });
  });

  it('throws ApiError with undefined body when error response is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('not json');
      },
    });

    try {
      await fetchApiCore('https://x', fetchMock as typeof fetch, '/p');
      expect.fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(502);
      expect(err.body).toBeUndefined();
    }
  });
});
