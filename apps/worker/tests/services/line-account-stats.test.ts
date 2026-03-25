import { describe, expect, it, vi } from 'vitest';

describe('loadLineAccountStats', () => {
  it('loads grouped stats for all line accounts with three aggregate queries', async () => {
    const aggregateResults = [
      {
        results: [
          { lineAccountId: 'account-1', count: 12 },
          { lineAccountId: 'account-2', count: 4 },
        ],
      },
      {
        results: [
          { lineAccountId: 'account-1', count: 3 },
        ],
      },
      {
        results: [
          { lineAccountId: 'account-2', count: 99 },
        ],
      },
    ];

    const all = vi.fn()
      .mockResolvedValueOnce(aggregateResults[0])
      .mockResolvedValueOnce(aggregateResults[1])
      .mockResolvedValueOnce(aggregateResults[2]);
    const prepare = vi.fn(() => ({ all }));

    const { loadLineAccountStats } = await import('../../src/services/line-account-stats.js');
    const stats = await loadLineAccountStats({ prepare } as unknown as D1Database);

    expect(prepare).toHaveBeenCalledTimes(3);
    expect(stats).toEqual({
      'account-1': {
        friendCount: 12,
        activeScenarios: 3,
        messagesThisMonth: 0,
      },
      'account-2': {
        friendCount: 4,
        activeScenarios: 0,
        messagesThisMonth: 99,
      },
    });
  });
});
