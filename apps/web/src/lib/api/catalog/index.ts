import { adminPrincipalRoles } from './admin-principal-roles.js';
import { affiliates } from './affiliates.js';
import { auth } from './auth.js';
import { automations } from './automations.js';
import { broadcasts } from './broadcasts.js';
import { chats } from './chats.js';
import { conversions } from './conversions.js';
import { friends } from './friends.js';
import { health } from './health.js';
import { lineAccounts } from './line-accounts.js';
import { notifications } from './notifications.js';
import { reminders } from './reminders.js';
import { scenarios } from './scenarios.js';
import { scoring } from './scoring.js';
import { tags } from './tags.js';
import { templates } from './templates.js';
import { users } from './users.js';
import { webhooks } from './webhooks.js';

export const api = {
  auth,
  friends,
  tags,
  scenarios,
  broadcasts,
  users,
  lineAccounts,
  conversions,
  affiliates,
  templates,
  automations,
  chats,
  reminders,
  scoring,
  webhooks,
  notifications,
  health,
  adminPrincipalRoles,
};
