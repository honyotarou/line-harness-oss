import type {
  BroadcastRequest,
  FlexContainer,
  Message,
  MulticastRequest,
  PushMessageRequest,
  ReplyMessageRequest,
  RichMenuObject,
  UserProfile,
} from './types.js';

const LINE_API_BASE = 'https://api.line.me/v2/bot';

export type LineClient = Readonly<{
  getProfile: (userId: string) => Promise<UserProfile>;
  pushMessage: (to: string, messages: readonly Message[]) => Promise<void>;
  multicast: (
    to: readonly string[],
    messages: readonly Message[],
  ) => Promise<Readonly<{ invalidUserIds?: readonly string[] }>>;
  broadcast: (messages: readonly Message[]) => Promise<void>;
  replyMessage: (replyToken: string, messages: readonly Message[]) => Promise<void>;
  getRichMenuList: () => Promise<Readonly<{ richmenus: readonly RichMenuObject[] }>>;
  createRichMenu: (menu: RichMenuObject) => Promise<Readonly<{ richMenuId: string }>>;
  deleteRichMenu: (richMenuId: string) => Promise<void>;
  setDefaultRichMenu: (richMenuId: string) => Promise<void>;
  linkRichMenuToUser: (userId: string, richMenuId: string) => Promise<void>;
  unlinkRichMenuFromUser: (userId: string) => Promise<void>;
  getRichMenuIdOfUser: (userId: string) => Promise<Readonly<{ richMenuId: string }>>;
  pushTextMessage: (to: string, text: string) => Promise<void>;
  pushFlexMessage: (to: string, altText: string, contents: FlexContainer) => Promise<void>;
  uploadRichMenuImage: (
    richMenuId: string,
    imageData: ArrayBuffer,
    contentType?: 'image/png' | 'image/jpeg',
  ) => Promise<void>;
}>;

export function createLineClient(channelAccessToken: string): LineClient {
  const request = async <T = unknown>(
    path: string,
    body: object,
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
  ): Promise<T> => {
    const url = `${LINE_API_BASE}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
    };

    if (method !== 'GET' && method !== 'DELETE') {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LINE API error: ${res.status} ${res.statusText} — ${text}`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json() as Promise<T>;
    }

    return undefined as T;
  };

  const pushMessage = async (to: string, messages: readonly Message[]): Promise<void> => {
    const body: PushMessageRequest = { to, messages: [...messages] };
    await request('/message/push', body);
  };

  return {
    async getProfile(userId: string): Promise<UserProfile> {
      return request<UserProfile>(`/profile/${encodeURIComponent(userId)}`, {}, 'GET');
    },
    async pushMessage(to: string, messages: readonly Message[]): Promise<void> {
      await pushMessage(to, messages);
    },
    async multicast(
      to: readonly string[],
      messages: readonly Message[],
    ): Promise<Readonly<{ invalidUserIds?: readonly string[] }>> {
      const url = `${LINE_API_BASE}/message/multicast`;
      const body: MulticastRequest = { to: [...to], messages: [...messages] };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LINE API error: ${res.status} ${res.statusText} — ${text}`);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        return {};
      }

      const raw = await res.text();
      if (!raw.trim()) {
        return {};
      }

      try {
        const parsed = JSON.parse(raw) as { invalidUserIds?: unknown };
        if (
          Array.isArray(parsed.invalidUserIds) &&
          parsed.invalidUserIds.every((id) => typeof id === 'string')
        ) {
          return { invalidUserIds: parsed.invalidUserIds };
        }
      } catch {
        /* ignore malformed body */
      }
      return {};
    },
    async broadcast(messages: readonly Message[]): Promise<void> {
      const body: BroadcastRequest = { messages: [...messages] };
      await request('/message/broadcast', body);
    },
    async replyMessage(replyToken: string, messages: readonly Message[]): Promise<void> {
      const body: ReplyMessageRequest = { replyToken, messages: [...messages] };
      await request('/message/reply', body);
    },
    async getRichMenuList(): Promise<Readonly<{ richmenus: readonly RichMenuObject[] }>> {
      return request<{ richmenus: RichMenuObject[] }>('/richmenu/list', {}, 'GET');
    },
    async createRichMenu(menu: RichMenuObject): Promise<Readonly<{ richMenuId: string }>> {
      return request<{ richMenuId: string }>('/richmenu', menu);
    },
    async deleteRichMenu(richMenuId: string): Promise<void> {
      await request(`/richmenu/${encodeURIComponent(richMenuId)}`, {}, 'DELETE');
    },
    async setDefaultRichMenu(richMenuId: string): Promise<void> {
      await request(`/user/all/richmenu/${encodeURIComponent(richMenuId)}`, {});
    },
    async linkRichMenuToUser(userId: string, richMenuId: string): Promise<void> {
      await request(
        `/user/${encodeURIComponent(userId)}/richmenu/${encodeURIComponent(richMenuId)}`,
        {},
      );
    },
    async unlinkRichMenuFromUser(userId: string): Promise<void> {
      await request(`/user/${encodeURIComponent(userId)}/richmenu`, {}, 'DELETE');
    },
    async getRichMenuIdOfUser(userId: string): Promise<Readonly<{ richMenuId: string }>> {
      return request<{ richMenuId: string }>(
        `/user/${encodeURIComponent(userId)}/richmenu`,
        {},
        'GET',
      );
    },
    async pushTextMessage(to: string, text: string): Promise<void> {
      await pushMessage(to, [{ type: 'text', text }]);
    },
    async pushFlexMessage(to: string, altText: string, contents: FlexContainer): Promise<void> {
      await pushMessage(to, [{ type: 'flex', altText, contents }]);
    },
    async uploadRichMenuImage(
      richMenuId: string,
      imageData: ArrayBuffer,
      contentType: 'image/png' | 'image/jpeg' = 'image/png',
    ): Promise<void> {
      const url = `https://api-data.line.me/v2/bot/richmenu/${encodeURIComponent(richMenuId)}/content`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: imageData,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LINE API error: ${res.status} ${res.statusText} — ${text}`);
      }
    },
  };
}
