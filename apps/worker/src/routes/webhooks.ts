import { Hono } from 'hono';
import type { Env } from '../index.js';
import { incomingWebhooksAdmin } from './webhooks.incoming-admin.js';
import { outgoingWebhooksAdmin } from './webhooks.outgoing-admin.js';
import { incomingWebhookReceive, INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT } from './webhooks.receive.js';

const webhooks = new Hono<Env>();

webhooks.route('/', incomingWebhooksAdmin);
webhooks.route('/', outgoingWebhooksAdmin);
webhooks.route('/', incomingWebhookReceive);

export { INCOMING_WEBHOOK_GLOBAL_RATE_LIMIT, webhooks };
