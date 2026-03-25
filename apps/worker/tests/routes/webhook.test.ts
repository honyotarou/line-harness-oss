import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  upsertFriend: vi.fn(),
  updateFriendFollowStatus: vi.fn(),
  getFriendByLineUserId: vi.fn(),
  getScenarios: vi.fn(),
  enrollFriendInScenario: vi.fn(),
  getScenarioSteps: vi.fn(),
  advanceFriendScenario: vi.fn(),
  completeFriendScenario: vi.fn(),
  upsertChatOnMessage: vi.fn(),
  getLineAccounts: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

const lineSdkMocks = vi.hoisted(() => ({
  verifySignature: vi.fn().mockResolvedValue(true),
  replyMessage: vi.fn(),
  getProfile: vi.fn(),
}));

vi.mock('@line-crm/line-sdk', () => ({
  verifySignature: lineSdkMocks.verifySignature,
  LineClient: vi.fn().mockImplementation(() => ({
    replyMessage: lineSdkMocks.replyMessage,
    getProfile: lineSdkMocks.getProfile,
  })),
}));

const eventBusMocks = vi.hoisted(() => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/event-bus.js', () => eventBusMocks);

vi.mock('../../src/services/step-delivery.js', () => ({
  buildMessage: vi.fn(),
  expandVariables: vi.fn((value: string) => value),
}));

describe('line webhook route', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.getLineAccounts.mockResolvedValue([]);
    lineSdkMocks.verifySignature.mockClear();
    lineSdkMocks.verifySignature.mockResolvedValue(true);
    lineSdkMocks.replyMessage.mockClear();
    lineSdkMocks.getProfile.mockClear();
    eventBusMocks.fireEvent.mockClear();
  });

  it('rejects oversized webhook payloads before signature verification', async () => {
    const { webhook } = await import('../../src/routes/webhook.js');
    const app = new Hono();
    app.route('/', webhook);

    const body = JSON.stringify({ events: [], padding: 'x'.repeat(300_000) });
    const response = await app.fetch(
      new Request('http://localhost/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(body.length),
          'X-Line-Signature': 'valid-signature',
        },
        body,
      }),
      {
        DB: {} as D1Database,
        LINE_CHANNEL_SECRET: 'line-secret',
        LINE_CHANNEL_ACCESS_TOKEN: 'line-access-token',
        WORKER_URL: 'https://worker.example.com',
      } as never,
    );

    expect(response.status).toBe(413);
    expect(lineSdkMocks.verifySignature).not.toHaveBeenCalled();
  });
});
