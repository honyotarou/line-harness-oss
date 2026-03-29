import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SegmentCondition } from '../../src/services/segment-query.js';

const dbMocks = vi.hoisted(() => ({
  getBroadcastById: vi.fn(),
  updateBroadcastStatus: vi.fn(),
  jstNow: vi.fn(() => '2026-03-28T12:00:00+09:00'),
}));

vi.mock('@line-crm/db', () => dbMocks);

const stealthMocks = vi.hoisted(() => ({
  calculateStaggerDelay: vi.fn(() => 0),
  sleep: vi.fn().mockResolvedValue(undefined),
  addMessageVariation: vi.fn((text: string, index: number) => `${text}[${index}]`),
}));

vi.mock('../../src/services/stealth.js', () => stealthMocks);

function createMockDb(friends: { id: string; line_user_id: string }[]) {
  return {
    prepare: vi.fn().mockImplementation(() => {
      const chain = {
        all: vi.fn().mockResolvedValue({ results: friends }),
        run: vi.fn().mockResolvedValue({}),
        first: vi.fn(),
      };
      return {
        bind: vi.fn().mockReturnValue(chain),
      };
    }),
  } as unknown as D1Database;
}

const baseBroadcast = {
  id: 'bcast-1',
  title: 't',
  message_type: 'text' as const,
  message_content: 'hello',
  target_type: 'all' as const,
  target_tag_id: null,
  line_account_id: null,
  status: 'draft' as const,
  scheduled_at: null,
  sent_at: null,
  total_count: 0,
  success_count: 0,
  created_at: '2026-01-01T00:00:00+09:00',
};

describe('processSegmentSend', () => {
  beforeEach(() => {
    vi.resetModules();
    dbMocks.getBroadcastById.mockReset();
    dbMocks.updateBroadcastStatus.mockReset();
    dbMocks.jstNow.mockReturnValue('2026-03-28T12:00:00+09:00');
    stealthMocks.calculateStaggerDelay.mockReturnValue(0);
    stealthMocks.sleep.mockClear();
    stealthMocks.addMessageVariation.mockImplementation((t: string, i: number) => `${t}[${i}]`);
  });

  it('throws when broadcast is missing after status update', async () => {
    dbMocks.getBroadcastById.mockResolvedValue(null);
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb([]);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await expect(
      processSegmentSend(db, lineClient as never, 'missing-id', {
        operator: 'AND',
        rules: [{ type: 'tag_exists', value: 't1' }],
      }),
    ).rejects.toThrow('Broadcast missing-id not found');

    expect(dbMocks.updateBroadcastStatus).toHaveBeenCalledWith(db, 'missing-id', 'sending');
  });

  it('marks sent with zero recipients when segment is empty', async () => {
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({ ...baseBroadcast, id: 'b1' })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b1',
        status: 'sent',
        total_count: 0,
        success_count: 0,
      });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb([]);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    const out = await processSegmentSend(db, lineClient as never, 'b1', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 'tag-x' }],
    } satisfies SegmentCondition);

    expect(out.status).toBe('sent');
    expect(lineClient.multicast).not.toHaveBeenCalled();
    expect(dbMocks.updateBroadcastStatus).toHaveBeenCalledWith(db, 'b1', 'sent', {
      totalCount: 0,
      successCount: 0,
    });
  });

  it('multicasts text and logs each friend', async () => {
    const friends = [
      { id: 'f1', line_user_id: 'U1' },
      { id: 'f2', line_user_id: 'U2' },
    ];
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({ ...baseBroadcast, id: 'b2' })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b2',
        status: 'sent',
        total_count: 2,
        success_count: 2,
      });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb(friends);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await processSegmentSend(db, lineClient as never, 'b2', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 't1' }],
    });

    expect(lineClient.multicast).toHaveBeenCalledTimes(1);
    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['U1', 'U2'],
      [{ type: 'text', text: 'hello' }],
    );
    expect(dbMocks.updateBroadcastStatus).toHaveBeenCalledWith(db, 'b2', 'sent', {
      totalCount: 2,
      successCount: 2,
    });
  });

  it('uses stagger and message variation for multi-batch text sends', async () => {
    const friends = Array.from({ length: 501 }, (_, i) => ({
      id: `f${i}`,
      line_user_id: `U${i}`,
    }));
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({ ...baseBroadcast, id: 'b3', message_content: 'bulk' })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b3',
        message_content: 'bulk',
        status: 'sent',
        total_count: 501,
        success_count: 501,
      });
    stealthMocks.calculateStaggerDelay.mockReturnValue(12);
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb(friends);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await processSegmentSend(db, lineClient as never, 'b3', {
      operator: 'AND',
      rules: [{ type: 'is_following', value: true }],
    });

    expect(lineClient.multicast).toHaveBeenCalledTimes(2);
    expect(stealthMocks.sleep).toHaveBeenCalled();
    expect(stealthMocks.addMessageVariation).toHaveBeenCalled();
    const secondCall = lineClient.multicast.mock.calls[1] as [
      string[],
      { type: string; text: string }[],
    ];
    expect(secondCall[1][0].text).toContain('bulk');
  });

  it('resets broadcast to draft when segment query throws', async () => {
    const db = {
      prepare: vi.fn().mockImplementation(() => ({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockRejectedValue(new Error('d1 fail')),
          run: vi.fn().mockResolvedValue({}),
          first: vi.fn(),
        }),
      })),
    } as unknown as D1Database;

    dbMocks.getBroadcastById.mockResolvedValue({ ...baseBroadcast, id: 'b4' });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const lineClient = { multicast: vi.fn() };

    await expect(
      processSegmentSend(db, lineClient as never, 'b4', {
        operator: 'AND',
        rules: [{ type: 'tag_exists', value: 't1' }],
      }),
    ).rejects.toThrow('d1 fail');

    expect(dbMocks.updateBroadcastStatus).toHaveBeenCalledWith(db, 'b4', 'draft');
  });

  it('continues when a multicast batch fails', async () => {
    const friends = Array.from({ length: 501 }, (_, i) => ({
      id: `f${i}`,
      line_user_id: `U${i}`,
    }));
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({ ...baseBroadcast, id: 'b5' })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b5',
        status: 'sent',
        total_count: 501,
        success_count: 1,
      });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb(friends);
    const lineClient = {
      multicast: vi.fn().mockRejectedValueOnce(new Error('LINE down')).mockResolvedValue(undefined),
    };

    await processSegmentSend(db, lineClient as never, 'b5', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 't1' }],
    });

    expect(lineClient.multicast).toHaveBeenCalledTimes(2);
    expect(dbMocks.updateBroadcastStatus).toHaveBeenCalledWith(db, 'b5', 'sent', {
      totalCount: 501,
      successCount: 1,
    });
  });

  it('builds image messages from JSON content', async () => {
    const img = JSON.stringify({
      originalContentUrl: 'https://example.com/o.jpg',
      previewImageUrl: 'https://example.com/p.jpg',
    });
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b6',
        message_type: 'image',
        message_content: img,
      })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b6',
        message_type: 'image',
        message_content: img,
        status: 'sent',
        total_count: 1,
        success_count: 1,
      });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb([{ id: 'f1', line_user_id: 'U1' }]);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await processSegmentSend(db, lineClient as never, 'b6', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 't1' }],
    });

    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['U1'],
      [
        {
          type: 'image',
          originalContentUrl: 'https://example.com/o.jpg',
          previewImageUrl: 'https://example.com/p.jpg',
        },
      ],
    );
  });

  it('falls back to text when image JSON is invalid', async () => {
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b7',
        message_type: 'image',
        message_content: 'not-json',
      })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b7',
        message_type: 'image',
        message_content: 'not-json',
        status: 'sent',
        total_count: 1,
        success_count: 1,
      });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb([{ id: 'f1', line_user_id: 'U1' }]);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await processSegmentSend(db, lineClient as never, 'b7', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 't1' }],
    });

    expect(lineClient.multicast).toHaveBeenCalledWith(['U1'], [{ type: 'text', text: 'not-json' }]);
  });

  it('builds flex messages from JSON content', async () => {
    const flexBody = JSON.stringify({
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', contents: [] },
    });
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b8',
        message_type: 'flex',
        message_content: flexBody,
      })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b8',
        message_type: 'flex',
        message_content: flexBody,
        status: 'sent',
        total_count: 1,
        success_count: 1,
      });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb([{ id: 'f1', line_user_id: 'U1' }]);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await processSegmentSend(db, lineClient as never, 'b8', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 't1' }],
    });

    const msg = (
      lineClient.multicast.mock.calls[0] as [
        string[],
        { type: string; altText: string; contents: unknown }[],
      ]
    )[1][0];
    expect(msg.type).toBe('flex');
    expect(msg.altText).toBe('Message');
    expect(msg.contents).toEqual(JSON.parse(flexBody));
  });

  it('falls back to text when flex JSON is invalid', async () => {
    dbMocks.getBroadcastById
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b9',
        message_type: 'flex',
        message_content: 'not-flex-json',
      })
      .mockResolvedValueOnce({
        ...baseBroadcast,
        id: 'b9',
        message_type: 'flex',
        message_content: 'not-flex-json',
        status: 'sent',
        total_count: 1,
        success_count: 1,
      });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb([{ id: 'f1', line_user_id: 'U1' }]);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await processSegmentSend(db, lineClient as never, 'b9', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 't1' }],
    });

    expect(lineClient.multicast).toHaveBeenCalledWith(
      ['U1'],
      [{ type: 'text', text: 'not-flex-json' }],
    );
  });

  it('uses plain text for unknown message types', async () => {
    const row = {
      ...baseBroadcast,
      id: 'b10',
      message_type: 'sticker' as (typeof baseBroadcast)['message_type'],
      message_content: 'raw',
    };
    dbMocks.getBroadcastById
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce({ ...row, status: 'sent' as const, total_count: 1, success_count: 1 });
    const { processSegmentSend } = await import('../../src/services/segment-send.js');
    const db = createMockDb([{ id: 'f1', line_user_id: 'U1' }]);
    const lineClient = { multicast: vi.fn().mockResolvedValue(undefined) };

    await processSegmentSend(db, lineClient as never, 'b10', {
      operator: 'AND',
      rules: [{ type: 'tag_exists', value: 't1' }],
    });

    expect(lineClient.multicast).toHaveBeenCalledWith(['U1'], [{ type: 'text', text: 'raw' }]);
  });
});
