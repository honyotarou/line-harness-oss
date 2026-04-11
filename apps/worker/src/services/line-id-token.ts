interface LineLoginAccountLike {
  login_channel_id: string | null;
}

export interface VerifiedLineIdToken {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

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
  try {
    return await Promise.any(
      channelIds.map(async (channelId) => {
        const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            id_token: idToken,
            client_id: channelId,
          }),
        });

        if (!response.ok) {
          throw new Error(`LINE ID token verification failed for ${channelId}`);
        }

        const data = (await response.json()) as {
          sub?: string;
          aud?: string;
          name?: string;
          picture?: string;
          email?: string;
        };
        if (typeof data.sub !== 'string' || data.sub.length === 0) {
          throw new Error('LINE ID token missing sub');
        }
        if (data.aud !== channelId) {
          throw new Error('LINE ID token aud does not match channel');
        }

        return {
          sub: data.sub,
          name: data.name,
          picture: data.picture,
          email: data.email,
        } satisfies VerifiedLineIdToken;
      }),
    );
  } catch {
    return null;
  }
}
