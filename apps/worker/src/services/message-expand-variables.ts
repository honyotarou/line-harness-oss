export type ExpandVariablesOptions = Readonly<{
  /**
   * When set, `{{auth_url:CHANNEL}}` expands only if CHANNEL is in this set.
   * When `apiOrigin` is set but this is omitted or empty, auth_url tokens are stripped (safe default).
   */
  allowedAuthUrlChannelIds?: ReadonlySet<string> | readonly string[];
}>;

function looksLikeJsonTemplate(content: string): boolean {
  const t = content.trimStart();
  return t.startsWith('{') || t.startsWith('[');
}

/**
 * Escapes a string for insertion into a JSON string literal (without adding surrounding quotes).
 * This is used defensively when `expandVariables` is applied to Flex JSON templates stored as strings.
 */
function escapeForJsonStringLiteral(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charCodeAt(i);
    switch (ch) {
      case 0x22: // "
        out += '\\"';
        break;
      case 0x5c: // \
        out += '\\\\';
        break;
      case 0x08:
        out += '\\b';
        break;
      case 0x0c:
        out += '\\f';
        break;
      case 0x0a:
        out += '\\n';
        break;
      case 0x0d:
        out += '\\r';
        break;
      case 0x09:
        out += '\\t';
        break;
      default:
        if (ch < 0x20) {
          out += `\\u${ch.toString(16).padStart(4, '0')}`;
        } else {
          out += raw[i];
        }
    }
  }
  return out;
}

/**
 * Replace template variables in message content.
 *
 * Supported variables:
 * - {{name}}                → friend's display name
 * - {{uid}}                 → friend's user UUID
 * - {{friend_id}}           → friend's internal ID
 * - {{auth_url:CHANNEL_ID}} → full /auth/line URL with uid for cross-account linking (allowlist required when apiOrigin is set)
 */
export function expandVariables(
  content: string,
  friend: {
    id: string;
    display_name: string | null;
    user_id: string | null;
    ref_code?: string | null;
  },
  apiOrigin?: string,
  options?: ExpandVariablesOptions,
): string {
  let result = content;
  const jsonMode = looksLikeJsonTemplate(content);
  const name = friend.display_name || '';
  const uid = friend.user_id || '';
  const friendId = friend.id;
  const ref = friend.ref_code || '';

  const nameSafe = jsonMode ? escapeForJsonStringLiteral(name) : name;
  const uidSafe = jsonMode ? escapeForJsonStringLiteral(uid) : uid;
  const friendIdSafe = jsonMode ? escapeForJsonStringLiteral(friendId) : friendId;
  const refSafe = jsonMode ? escapeForJsonStringLiteral(ref) : ref;

  result = result.replace(/\{\{name\}\}/g, nameSafe);
  result = result.replace(/\{\{uid\}\}/g, uidSafe);
  result = result.replace(/\{\{friend_id\}\}/g, friendIdSafe);
  result = result.replace(/\{\{ref\}\}/g, refSafe);
  // Conditional block: {{#if_ref}}...{{/if_ref}} — only shown if ref_code exists
  if (friend.ref_code) {
    result = result.replace(/\{\{#if_ref\}\}([\s\S]*?)\{\{\/if_ref\}\}/g, '$1');
  } else {
    result = result.replace(/\{\{#if_ref\}\}[\s\S]*?\{\{\/if_ref\}\}/g, '');
  }
  if (apiOrigin) {
    const rawAllow = options?.allowedAuthUrlChannelIds;
    const allowSet =
      rawAllow === undefined ? null : rawAllow instanceof Set ? rawAllow : new Set(rawAllow);

    result = result.replace(/\{\{auth_url:([^}]+)\}\}/g, (_match, channelIdRaw) => {
      const channelId = String(channelIdRaw).trim();
      if (!/^[-a-zA-Z0-9._]{1,128}$/.test(channelId)) {
        return '';
      }
      if (allowSet === null || allowSet.size === 0 || !allowSet.has(channelId)) {
        return '';
      }
      const params = new URLSearchParams({ account: channelId, ref: 'cross-link' });
      if (friend.user_id) params.set('uid', friend.user_id);
      return `${apiOrigin}/auth/line?${params.toString()}`;
    });
  }
  return result;
}
