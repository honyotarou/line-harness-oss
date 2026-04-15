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

export function createLineClient(channelAccessToken: string): {
  getProfile: (userId: string) => Promise<UserProfile>;
  pushMessage: (to: string, messages: Message[]) => Promise<void>;
  multicast: (to: string[], messages: Message[]) => Promise<{ invalidUserIds?: string[] }>;
  broadcast: (messages: Message[]) => Promise<void>;
  replyMessage: (replyToken: string, messages: Message[]) => Promise<void>;
  getRichMenuList: () => Promise<{ richmenus: RichMenuObject[] }>;
  createRichMenu: (menu: RichMenuObject) => Promise<{ richMenuId: string }>;
  deleteRichMenu: (richMenuId: string) => Promise<void>;
  setDefaultRichMenu: (richMenuId: string) => Promise<void>;
  linkRichMenuToUser: (userId: string, richMenuId: string) => Promise<void>;
  unlinkRichMenuFromUser: (userId: string) => Promise<void>;
  getRichMenuIdOfUser: (userId: string) => Promise<{ richMenuId: string }>;
  pushTextMessage: (to: string, text: string) => Promise<void>;
  pushFlexMessage: (to: string, altText: string, contents: FlexContainer) => Promise<void>;
  uploadRichMenuImage: (
    richMenuId: string,
    imageData: ArrayBuffer,
    contentType?: 'image/png' | 'image/jpeg',
  ) => Promise<void>;
} {
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

    return undefined as unknown as T;
  };

  const pushMessage = async (to: string, messages: Message[]): Promise<void> => {
    const body: PushMessageRequest = { to, messages };
    await request('/message/push', body);
  };

  return {
    async getProfile(userId: string): Promise<UserProfile> {
      return request<UserProfile>(`/profile/${encodeURIComponent(userId)}`, {}, 'GET');
    },
    async pushMessage(to: string, messages: Message[]): Promise<void> {
      await pushMessage(to, messages);
    },
    async multicast(to: string[], messages: Message[]): Promise<{ invalidUserIds?: string[] }> {
      const url = `${LINE_API_BASE}/message/multicast`;
      const body: MulticastRequest = { to, messages };
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
    async broadcast(messages: Message[]): Promise<void> {
      const body: BroadcastRequest = { messages };
      await request('/message/broadcast', body);
    },
    async replyMessage(replyToken: string, messages: Message[]): Promise<void> {
      const body: ReplyMessageRequest = { replyToken, messages };
      await request('/message/reply', body);
    },
    async getRichMenuList(): Promise<{ richmenus: RichMenuObject[] }> {
      return request<{ richmenus: RichMenuObject[] }>('/richmenu/list', {}, 'GET');
    },
    async createRichMenu(menu: RichMenuObject): Promise<{ richMenuId: string }> {
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
    async getRichMenuIdOfUser(userId: string): Promise<{ richMenuId: string }> {
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

export class LineClient {
  constructor(private readonly channelAccessToken: string) {}
  private readonly api = createLineClient(this.channelAccessToken);

  // ─── Core request helper ──────────────────────────────────────────────────

  private async request<T = unknown>(
    path: string,
    body: object,
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
  ): Promise<T> {
    const url = `${LINE_API_BASE}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.channelAccessToken}`,
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

    // Some endpoints (e.g. push, reply) return an empty body with 200.
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return res.json() as Promise<T>;
    }

    return undefined as unknown as T;
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<UserProfile> {
    return this.api.getProfile(userId);
  }

  // ─── Messaging ───────────────────────────────────────────────────────────

  async pushMessage(to: string, messages: Message[]): Promise<void> {
    return this.api.pushMessage(to, messages);
  }

  /**
   * Sends a multicast message. When LINE returns JSON with `invalidUserIds`, those user IDs did not
   * receive the message; callers should not treat the batch as fully delivered.
   */
  async multicast(to: string[], messages: Message[]): Promise<{ invalidUserIds?: string[] }> {
    return this.api.multicast(to, messages);
  }

  async broadcast(messages: Message[]): Promise<void> {
    return this.api.broadcast(messages);
  }

  async replyMessage(replyToken: string, messages: Message[]): Promise<void> {
    return this.api.replyMessage(replyToken, messages);
  }

  // ─── Rich Menu ────────────────────────────────────────────────────────────

  async getRichMenuList(): Promise<{ richmenus: RichMenuObject[] }> {
    return this.api.getRichMenuList();
  }

  async createRichMenu(menu: RichMenuObject): Promise<{ richMenuId: string }> {
    return this.api.createRichMenu(menu);
  }

  async deleteRichMenu(richMenuId: string): Promise<void> {
    return this.api.deleteRichMenu(richMenuId);
  }

  async setDefaultRichMenu(richMenuId: string): Promise<void> {
    return this.api.setDefaultRichMenu(richMenuId);
  }

  async linkRichMenuToUser(userId: string, richMenuId: string): Promise<void> {
    return this.api.linkRichMenuToUser(userId, richMenuId);
  }

  async unlinkRichMenuFromUser(userId: string): Promise<void> {
    return this.api.unlinkRichMenuFromUser(userId);
  }

  async getRichMenuIdOfUser(userId: string): Promise<{ richMenuId: string }> {
    return this.api.getRichMenuIdOfUser(userId);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async pushTextMessage(to: string, text: string): Promise<void> {
    return this.api.pushTextMessage(to, text);
  }

  async pushFlexMessage(to: string, altText: string, contents: FlexContainer): Promise<void> {
    return this.api.pushFlexMessage(to, altText, contents);
  }

  // ─── Rich Menu Image Upload ─────────────────────────────────────────────

  /** Upload image to a rich menu. Accepts PNG/JPEG binary (ArrayBuffer or Uint8Array). */
  async uploadRichMenuImage(
    richMenuId: string,
    imageData: ArrayBuffer,
    contentType: 'image/png' | 'image/jpeg' = 'image/png',
  ): Promise<void> {
    return this.api.uploadRichMenuImage(richMenuId, imageData, contentType);
  }
}
