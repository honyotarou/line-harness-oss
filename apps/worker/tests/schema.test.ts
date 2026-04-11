import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = resolve(process.cwd(), '../../packages/db/schema.sql');
const schema = readFileSync(schemaPath, 'utf8');

const migration011Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/011_admin_principal_roles.sql',
);

const migration012Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/012_line_webhook_event_dedup.sql',
);

const migration013Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/013_incoming_webhook_payload_dedup.sql',
);

const migration015Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/015_admin_session_revocations.sql',
);

describe('schema.sql', () => {
  it('migration 011 matches admin_principal_roles DDL', () => {
    const m011 = readFileSync(migration011Path, 'utf8');
    expect(m011).toContain('CREATE TABLE IF NOT EXISTS admin_principal_roles');
    expect(m011).toContain("CHECK (role IN ('admin', 'viewer'))");
  });

  it('migration 012 matches line_webhook_processed_events DDL', () => {
    const m012 = readFileSync(migration012Path, 'utf8');
    expect(m012).toContain('CREATE TABLE IF NOT EXISTS line_webhook_processed_events');
    expect(m012).toContain('webhook_event_id');
  });

  it('migration 013 matches incoming_webhook_processed_payloads DDL', () => {
    const m013 = readFileSync(migration013Path, 'utf8');
    expect(m013).toContain('CREATE TABLE IF NOT EXISTS incoming_webhook_processed_payloads');
    expect(m013).toContain('payload_hash');
  });

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
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS admin_principal_roles');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS line_webhook_processed_events');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS incoming_webhook_processed_payloads');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS admin_session_revocations');
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
    const accountsBlock = schema.match(
      /CREATE TABLE IF NOT EXISTS line_accounts \(([\s\S]*?)\n\);/,
    );
    expect(accountsBlock?.[1]).toContain('login_channel_id');
    expect(accountsBlock?.[1]).toContain('login_channel_secret');
    expect(accountsBlock?.[1]).toContain('liff_id');
  });

  it('defines notification and delivery columns required for operability', () => {
    const notificationsBlock = schema.match(
      /CREATE TABLE IF NOT EXISTS notifications \(([\s\S]*?)\n\);/,
    );
    expect(notificationsBlock?.[1]).toContain('line_account_id');

    const deliveryBlock = schema.match(
      /CREATE TABLE IF NOT EXISTS delivery_operations \(([\s\S]*?)\n\);/,
    );
    expect(deliveryBlock?.[1]).toContain('idempotency_key');
    expect(deliveryBlock?.[1]).toContain('attempt_count');
    expect(deliveryBlock?.[1]).toContain('next_retry_at');
  });
});
