import type { OutgoingWebhookRow } from '@line-crm/db';
import { maskSigningSecretForList } from './signing-secret-display.js';
import { parseStringArrayJson } from './safe-json.js';

export function mapOutgoingWebhookAdminListItem(row: OutgoingWebhookRow) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    eventTypes: parseStringArrayJson(row.event_types) ?? [],
    secret: maskSigningSecretForList(row.secret),
    lineAccountId: row.line_account_id ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOutgoingWebhookAdminCreated(row: OutgoingWebhookRow) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    eventTypes: parseStringArrayJson(row.event_types) ?? [],
    lineAccountId: row.line_account_id ?? null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
  };
}

export function mapOutgoingWebhookAdminUpdated(row: OutgoingWebhookRow) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    eventTypes: parseStringArrayJson(row.event_types) ?? [],
    lineAccountId: row.line_account_id ?? null,
    isActive: Boolean(row.is_active),
  };
}
