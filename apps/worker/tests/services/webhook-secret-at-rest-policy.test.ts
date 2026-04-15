import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../src/index.js';
import { denyUnlessWebhookSecretsAtRestKeyForWrites } from '../../src/services/webhook-secret-at-rest-policy.js';

/** 32 raw bytes as standard base64 (ASCII 0x00–0x1f). */
const TEST_LINE_AT_REST_KEY_B64 = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i)),
);

describe('denyUnlessWebhookSecretsAtRestKeyForWrites', () => {
  it('returns null for localhost-style Workers (plaintext allowed without key)', async () => {
    const app = new Hono<Env>();
    app.get('/t', (c) => denyUnlessWebhookSecretsAtRestKeyForWrites(c) ?? c.text('ok'));
    const res = await app.fetch(new Request('http://127.0.0.1/t'), {
      WORKER_URL: 'http://127.0.0.1:8787',
      API_KEY: 'k',
      LINE_CHANNEL_SECRET: 's',
      LINE_CHANNEL_ACCESS_TOKEN: 't',
    } as never);
    expect(res.status).toBe(200);
  });

  it('returns 503 on non-local HTTPS when LINE_ACCOUNT_SECRETS_KEY is unset', async () => {
    const app = new Hono<Env>();
    app.get('/t', (c) => denyUnlessWebhookSecretsAtRestKeyForWrites(c) ?? c.text('ok'));
    const res = await app.fetch(new Request('https://worker.example/t'), {
      WORKER_URL: 'https://api.example.com',
      API_KEY: 'k',
      LINE_CHANNEL_SECRET: 's',
      LINE_CHANNEL_ACCESS_TOKEN: 't',
    } as never);
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/LINE_ACCOUNT_SECRETS_KEY/i);
  });

  it('returns null on HTTPS when a valid LINE_ACCOUNT_SECRETS_KEY is set', async () => {
    const app = new Hono<Env>();
    app.get('/t', (c) => denyUnlessWebhookSecretsAtRestKeyForWrites(c) ?? c.text('ok'));
    const res = await app.fetch(new Request('https://worker.example/t'), {
      WORKER_URL: 'https://api.example.com',
      API_KEY: 'k',
      LINE_CHANNEL_SECRET: 's',
      LINE_CHANNEL_ACCESS_TOKEN: 't',
      LINE_ACCOUNT_SECRETS_KEY: TEST_LINE_AT_REST_KEY_B64,
    } as never);
    expect(res.status).toBe(200);
  });

  it('returns null on HTTPS when plaintext at rest is explicitly allowed', async () => {
    const app = new Hono<Env>();
    app.get('/t', (c) => denyUnlessWebhookSecretsAtRestKeyForWrites(c) ?? c.text('ok'));
    const res = await app.fetch(new Request('https://worker.example/t'), {
      WORKER_URL: 'https://api.example.com',
      API_KEY: 'k',
      LINE_CHANNEL_SECRET: 's',
      LINE_CHANNEL_ACCESS_TOKEN: 't',
      ALLOW_WEBHOOK_SECRETS_PLAINTEXT_AT_REST: '1',
    } as never);
    expect(res.status).toBe(200);
  });

  it('returns null on HTTPS when full RELAX pair is set without at-rest key', async () => {
    const app = new Hono<Env>();
    app.get('/t', (c) => denyUnlessWebhookSecretsAtRestKeyForWrites(c) ?? c.text('ok'));
    const res = await app.fetch(new Request('https://worker.example/t'), {
      WORKER_URL: 'https://api.example.com',
      API_KEY: 'k',
      LINE_CHANNEL_SECRET: 's',
      LINE_CHANNEL_ACCESS_TOKEN: 't',
      RELAX_DEPLOYED_SECURITY_DEFAULTS: '1',
      RELAX_DEPLOYED_SECURITY_CONFIRM: 'YES_I_ACCEPT_REDUCED_SECURITY',
    } as never);
    expect(res.status).toBe(200);
  });
});
