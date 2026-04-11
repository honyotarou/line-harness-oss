export type ExpandVariablesOptions = {
  /**
   * When set, `{{auth_url:CHANNEL}}` expands only if CHANNEL is in this set.
   * When `apiOrigin` is set but this is omitted or empty, auth_url tokens are stripped (safe default).
   */
  allowedAuthUrlChannelIds?: ReadonlySet<string> | readonly string[];
};

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
  result = result.replace(/\{\{name\}\}/g, friend.display_name || '');
  result = result.replace(/\{\{uid\}\}/g, friend.user_id || '');
  result = result.replace(/\{\{friend_id\}\}/g, friend.id);
  result = result.replace(/\{\{ref\}\}/g, friend.ref_code || '');
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
