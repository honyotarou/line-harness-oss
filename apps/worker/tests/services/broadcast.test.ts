import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  getBroadcastById: vi.fn(),
  getBroadcasts: vi.fn(),
  updateBroadcastStatus: vi.fn().mockResolvedValue(undefined),
  getFriendsByTag: vi.fn(),
  jstNow: vi.fn(() => '2026-03-25T10:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

const reliabilityMocks = vi.hoisted(() => ({
  beginDeliveryAttempt: vi.fn().mockResolvedValue(true),
  markDeliveryAttemptSucceeded: vi.fn().mockResolvedValue(undefined),
  markDeliveryAttemptFailed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/delivery-reliability.js', () => reliabilityMocks);

function createDb() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  } as unknown as D1Database;
}

describe('broadcast delivery', () => {
  beforeEach(() => {
    Object.values(dbMocks).forEach((mockFn) => mockFn.mockReset());
    dbMocks.updateBroadcastStatus.mockResolvedValue(undefined);
    dbMocks.jstNow.mockReturnValue('2026-03-25T10:00:00+09:00');
    Object.values(reliabilityMocks).forEach((mockFn) => mockFn.mockReset());
    reliabilityMocks.beginDeliveryAttempt.mockResolvedValue(true);
    reliabilityMocks.markDeliveryAttemptSucceeded.mockResolvedValue(undefined);
    reliabilityMocks.markDeliveryAttemptFailed.mockResolvedValue(undefined);
  });

  it('sends tag-targeted broadcasts to following friends and logs successful sends', async () => {
    dbMocks.getBroadcastById.mockResolvedValue({
      id: 'broadcast-1',
      message_type: 'text',
      message_content: 'hello',
      target_type: 'tag',
      target_tag_id: 'tag-1',
    });
    dbMocks.getFriendsByTag.mockResolvedValue([
      { id: 'friend-1', line_user_id: 'u1', is_following: 1 },
      { id: 'friend-2', line_user_id: 'u2', is_following: 1 },
      { id: 'friend-3', line_user_id: 'u3', is_following: 0 },
    ]);

    const { processBroadcastSend } = await import('../../src/services/broadcast.js');
    const db = createDb();
    const lineClient = {
      broadcast: vi.fn(),
      multicast: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processBroadcastSend(db, lineClient as never, 'broadcast-1');

    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['u1', 'u2'],
      [{ type: 'text', text: 'hello' }],
    );
    expect(dbMocks.updateBroadcastStatus).toHaveBeenNthCalledWith(1, db, 'broadcast-1', 'sending');
    expect(dbMocks.updateBroadcastStatus).toHaveBeenNthCalledWith(2, db, 'broadcast-1', 'sent', {
      totalCount: 2,
      successCount: 2,
    });
    expect((db as unknown as { prepare: ReturnType<typeof vi.fn> }).prepare).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        id: 'broadcast-1',
      }),
    );
  });

  it('uses the LINE broadcast API for all-target broadcasts', async () => {
    dbMocks.getBroadcastById.mockResolvedValue({
      id: 'broadcast-all',
      message_type: 'image',
      message_content: JSON.stringify({
        originalContentUrl: 'https://example.com/original.png',
        previewImageUrl: 'https://example.com/preview.png',
      }),
      target_type: 'all',
      target_tag_id: null,
    });

    const { processBroadcastSend } = await import('../../src/services/broadcast.js');
    const db = createDb();
    const lineClient = {
      broadcast: vi.fn().mockResolvedValue(undefined),
      multicast: vi.fn(),
    };

    await processBroadcastSend(db, lineClient as never, 'broadcast-all');

    expect(lineClient.broadcast).toHaveBeenCalledWith([
      {
        type: 'image',
        originalContentUrl: 'https://example.com/original.png',
        previewImageUrl: 'https://example.com/preview.png',
      },
    ]);
    expect(dbMocks.updateBroadcastStatus).toHaveBeenLastCalledWith(db, 'broadcast-all', 'sent', {
      totalCount: 0,
      successCount: 0,
    });
  });

  it('records failed batches and leaves the broadcast retryable when some recipients fail', async () => {
    dbMocks.getBroadcastById.mockResolvedValue({
      id: 'broadcast-1',
      line_account_id: 'account-1',
      message_type: 'text',
      message_content: 'hello',
      target_type: 'tag',
      target_tag_id: 'tag-1',
    });
    dbMocks.getFriendsByTag.mockResolvedValue([
      { id: 'friend-1', line_user_id: 'u1', is_following: 1 },
      { id: 'friend-2', line_user_id: 'u2', is_following: 1 },
    ]);

    const { processBroadcastSend } = await import('../../src/services/broadcast.js');
    const db = createDb();
    const lineClient = {
      broadcast: vi.fn(),
      multicast: vi.fn().mockRejectedValue(new Error('LINE down')),
    };

    await processBroadcastSend(db, lineClient as never, 'broadcast-1');

    expect(reliabilityMocks.beginDeliveryAttempt).toHaveBeenCalled();
    expect(reliabilityMocks.markDeliveryAttemptFailed).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        jobName: 'broadcast_send',
        sourceId: 'broadcast-1',
        lineAccountId: 'account-1',
      }),
      undefined,
    );
    expect(dbMocks.updateBroadcastStatus).toHaveBeenLastCalledWith(db, 'broadcast-1', 'draft', {
      totalCount: 2,
      successCount: 0,
    });
  });
});
