import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = resolve(process.cwd(), '../../packages/db/schema.sql');
const schema = readFileSync(schemaPath, 'utf8');

describe('schema.sql', () => {
  it('includes runtime tables introduced after the initial schema', () => {
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS entry_routes');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS ref_tracking');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS tracked_links');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS link_clicks');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS forms');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS form_submissions');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS request_rate_limits');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS line_account_profile_cache');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS delivery_operations');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS delivery_dead_letters');
  });

  it('defines friend columns required by runtime code', () => {
    const friendsBlock = schema.match(/CREATE TABLE IF NOT EXISTS friends \(([\s\S]*?)\n\);/);
    expect(friendsBlock?.[1]).toContain('metadata');
    expect(friendsBlock?.[1]).toContain('ref_code');
    expect(friendsBlock?.[1]).toContain('line_account_id');
  });

  it('defines scenario step branching columns required by runtime code', () => {
    const stepsBlock = schema.match(/CREATE TABLE IF NOT EXISTS scenario_steps \(([\s\S]*?)\n\);/);
    expect(stepsBlock?.[1]).toContain('condition_type');
    expect(stepsBlock?.[1]).toContain('condition_value');
    expect(stepsBlock?.[1]).toContain('next_step_on_false');
  });

  it('defines multi-account oauth columns on line_accounts', () => {
    const accountsBlock = schema.match(/CREATE TABLE IF NOT EXISTS line_accounts \(([\s\S]*?)\n\);/);
    expect(accountsBlock?.[1]).toContain('login_channel_id');
    expect(accountsBlock?.[1]).toContain('login_channel_secret');
    expect(accountsBlock?.[1]).toContain('liff_id');
  });

  it('defines notification and delivery columns required for operability', () => {
    const notificationsBlock = schema.match(/CREATE TABLE IF NOT EXISTS notifications \(([\s\S]*?)\n\);/);
    expect(notificationsBlock?.[1]).toContain('line_account_id');

    const deliveryBlock = schema.match(/CREATE TABLE IF NOT EXISTS delivery_operations \(([\s\S]*?)\n\);/);
    expect(deliveryBlock?.[1]).toContain('idempotency_key');
    expect(deliveryBlock?.[1]).toContain('attempt_count');
    expect(deliveryBlock?.[1]).toContain('next_retry_at');
  });
});
