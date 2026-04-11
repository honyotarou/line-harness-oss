import { describe, expect, it } from 'vitest';

describe('matchAutomationConditions', () => {
  it('returns false for empty conditions', async () => {
    const { matchAutomationConditions } = await import('../../src/services/event-bus.js');
    expect(matchAutomationConditions({}, { friendId: 'f1' })).toBe(false);
  });

  it('returns true when match_always is true', async () => {
    const { matchAutomationConditions } = await import('../../src/services/event-bus.js');
    expect(matchAutomationConditions({ match_always: true }, { friendId: 'f1' })).toBe(true);
  });

  it('returns false for unknown condition keys', async () => {
    const { matchAutomationConditions } = await import('../../src/services/event-bus.js');
    expect(matchAutomationConditions({ extra: 1 }, { friendId: 'f1' })).toBe(false);
  });

  it('enforces score_threshold when present', async () => {
    const { matchAutomationConditions } = await import('../../src/services/event-bus.js');
    expect(
      matchAutomationConditions(
        { score_threshold: 100 },
        { friendId: 'f1', eventData: { currentScore: 50 } },
      ),
    ).toBe(false);
    expect(
      matchAutomationConditions(
        { score_threshold: 100 },
        { friendId: 'f1', eventData: { currentScore: 200 } },
      ),
    ).toBe(true);
  });
});
