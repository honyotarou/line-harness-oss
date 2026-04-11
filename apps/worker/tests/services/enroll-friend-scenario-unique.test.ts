import { describe, expect, it, vi } from 'vitest';
import { enrollFriendInScenario } from '@line-crm/db';

describe('enrollFriendInScenario (unique friend_id + scenario_id)', () => {
  it('returns existing row when a concurrent insert hits the unique index', async () => {
    const existing = {
      id: 'fs-existing',
      friend_id: 'friend-1',
      scenario_id: 'scenario-1',
      current_step_order: 0,
      status: 'active' as const,
      started_at: 't0',
      next_delivery_at: 't1',
      updated_at: 't2',
    };

    let pairSelectCalls = 0;
    const db = {
      prepare(sql: string) {
        if (sql.includes('FROM friend_scenarios WHERE friend_id = ? AND scenario_id = ?')) {
          return {
            bind() {
              return {
                first: vi.fn(async () => {
                  pairSelectCalls += 1;
                  if (pairSelectCalls === 1) return null;
                  return existing;
                }),
              };
            },
          };
        }
        if (sql.includes('FROM scenario_steps WHERE scenario_id')) {
          return {
            bind() {
              return {
                first: vi.fn(async () => ({ step_order: 0, delay_minutes: 0 })),
              };
            },
          };
        }
        if (sql.includes('INSERT INTO friend_scenarios')) {
          return {
            bind() {
              return {
                run: vi.fn(async () => {
                  throw new Error(
                    'UNIQUE constraint failed: friend_scenarios.idx_friend_scenarios_friend_scenario',
                  );
                }),
              };
            },
          };
        }
        if (sql.includes('SELECT * FROM friend_scenarios WHERE id = ?')) {
          return {
            bind() {
              return { first: vi.fn() };
            },
          };
        }
        throw new Error(`unexpected SQL: ${sql.slice(0, 80)}`);
      },
    } as unknown as D1Database;

    const out = await enrollFriendInScenario(db, 'friend-1', 'scenario-1');
    expect(out.id).toBe('fs-existing');
    expect(pairSelectCalls).toBe(2);
  });
});
