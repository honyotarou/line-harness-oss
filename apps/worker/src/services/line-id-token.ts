type LineLoginAccountLike = Readonly<{
  login_channel_id: string | null;
}>;

export type VerifiedLineIdToken = Readonly<{
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  /** LINE Login channel id (`client_id` / token `aud`) that verified this token. */
  loginChannelId: string;
}>;

export function collectLineLoginChannelIds(
  defaultChannelId: string,
  accounts: LineLoginAccountLike[],
): string[] {
  const ids = new Set<string>();
  if (defaultChannelId) {
    ids.add(defaultChannelId);
  }

  for (const account of accounts) {
    if (account.login_channel_id) {
      ids.add(account.login_channel_id);
    }
  }

  return [...ids];
}

export async function verifyLineIdToken(
  idToken: string,
  channelIds: string[],
): Promise<VerifiedLineIdToken | null> {
  for (const channelId of channelIds) {
    try {
      const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          id_token: idToken,
          client_id: channelId,
        }),
      });

      if (!response.ok) continue;

      const data = (await response.json()) as {
        sub?: string;
        aud?: string;
        name?: string;
        picture?: string;
        email?: string;
      };
      if (typeof data.sub !== 'string' || data.sub.length === 0) continue;
      if (data.aud !== channelId) continue;

      return {
        sub: data.sub,
        name: data.name,
        picture: data.picture,
        email: data.email,
        loginChannelId: channelId,
      } satisfies VerifiedLineIdToken;
    } catch {
      /* try next channel */
    }
  }
  return null;
}
