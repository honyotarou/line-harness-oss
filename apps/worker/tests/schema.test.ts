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

const migration016Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/016_friend_scenarios_unique.sql',
);

const migration017Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/017_drop_legacy_admin_users.sql',
);

const migration018Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/018_outgoing_webhooks_line_account.sql',
);

const migration019Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/019_admin_principal_owner_role.sql',
);

const migration020Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/020_chats_line_account_fk.sql',
);

const migration021Path = resolve(
  process.cwd(),
  '../../packages/db/migrations/021_users_email_lowercase.sql',
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

  it('dedupes friend_scenarios per (friend_id, scenario_id) in schema and migration 016', () => {
    expect(schema).toContain('idx_friend_scenarios_friend_scenario');
    const m016 = readFileSync(migration016Path, 'utf8');
    expect(m016).toContain('idx_friend_scenarios_friend_scenario');
    expect(m016).toContain('GROUP BY friend_id, scenario_id');
  });

  it('omits legacy admin_users from consolidated schema; migration 017 drops it for existing DBs', () => {
    expect(schema).not.toMatch(/CREATE TABLE IF NOT EXISTS admin_users/);
    const m017 = readFileSync(migration017Path, 'utf8');
    expect(m017).toContain('DROP TABLE IF EXISTS admin_users');
  });

  it('defines multi-account oauth columns on line_accounts', () => {
    const accountsBlock = schema.match(
      /CREATE TABLE IF NOT EXISTS line_accounts \(([\s\S]*?)\n\);/,
    );
    expect(accountsBlock?.[1]).toContain('login_channel_id');
    expect(accountsBlock?.[1]).toContain('login_channel_secret');
    expect(accountsBlock?.[1]).toContain('liff_id');
  });

  it('migration 019 adds owner to admin_principal_roles role CHECK', () => {
    const m019 = readFileSync(migration019Path, 'utf8');
    expect(m019).toContain("CHECK (role IN ('owner', 'admin', 'viewer'))");
  });

  it('migration 020 rebuilds chats with line_account_id FK to line_accounts', () => {
    const m020 = readFileSync(migration020Path, 'utf8');
    expect(m020).toContain('REFERENCES line_accounts (id)');
    expect(m020).toContain('UPDATE chats');
  });

  it('migration 021 lowercases users.email for V-7 UNIQUE alignment', () => {
    const m021 = readFileSync(migration021Path, 'utf8');
    expect(m021).toContain('UPDATE users');
    expect(m021).toContain('LOWER(TRIM(email))');
  });

  it('schema lists owner in admin_principal_roles CHECK and chats.line_account_id FK', () => {
    const rolesBlock = schema.match(
      /CREATE TABLE IF NOT EXISTS admin_principal_roles \(([\s\S]*?)\n\);/,
    );
    expect(rolesBlock?.[1]).toMatch(/'owner'.*'admin'.*'viewer'/);
    const chatsBlock = schema.match(/CREATE TABLE IF NOT EXISTS chats \(([\s\S]*?)\n\);/);
    expect(chatsBlock?.[1]).toContain('line_account_id TEXT REFERENCES line_accounts (id)');
  });

  it('adds line_account_id to outgoing_webhooks in schema and migration 018', () => {
    const outBlock = schema.match(/CREATE TABLE IF NOT EXISTS outgoing_webhooks \(([\s\S]*?)\n\);/);
    expect(outBlock?.[1]).toContain('line_account_id');
    expect(schema).toContain('idx_outgoing_webhooks_line_account_id');
    const m018 = readFileSync(migration018Path, 'utf8');
    expect(m018).toContain('line_account_id');
    expect(m018).toContain('idx_outgoing_webhooks_line_account_id');
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
