import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  Broadcast,
  CreateBroadcastInput,
  UpdateBroadcastInput,
  SegmentCondition,
} from '../types.js';

export function createBroadcastsResource(
  http: HttpClient,
  defaultAccountId?: string,
): {
  list: (params?: { accountId?: string }) => Promise<Broadcast[]>;
  get: (id: string) => Promise<Broadcast>;
  create: (input: CreateBroadcastInput & { lineAccountId?: string }) => Promise<Broadcast>;
  update: (id: string, input: UpdateBroadcastInput) => Promise<Broadcast>;
  delete: (id: string) => Promise<void>;
  send: (id: string) => Promise<Broadcast>;
  sendToSegment: (id: string, conditions: SegmentCondition) => Promise<Broadcast>;
} {
  return {
    async list(params?: { accountId?: string }): Promise<Broadcast[]> {
      const accountId = params?.accountId ?? defaultAccountId;
      const query = accountId ? `?lineAccountId=${accountId}` : '';
      const res = await http.get<ApiResponse<Broadcast[]>>(`/api/broadcasts${query}`);
      return res.data;
    },
    async get(id: string): Promise<Broadcast> {
      const res = await http.get<ApiResponse<Broadcast>>(`/api/broadcasts/${id}`);
      return res.data;
    },
    async create(input: CreateBroadcastInput & { lineAccountId?: string }): Promise<Broadcast> {
      const body = { ...input };
      if (!body.lineAccountId && defaultAccountId) {
        body.lineAccountId = defaultAccountId;
      }
      const res = await http.post<ApiResponse<Broadcast>>('/api/broadcasts', body);
      return res.data;
    },
    async update(id: string, input: UpdateBroadcastInput): Promise<Broadcast> {
      const res = await http.put<ApiResponse<Broadcast>>(`/api/broadcasts/${id}`, input);
      return res.data;
    },
    async delete(id: string): Promise<void> {
      await http.delete(`/api/broadcasts/${id}`);
    },
    async send(id: string): Promise<Broadcast> {
      const res = await http.post<ApiResponse<Broadcast>>(`/api/broadcasts/${id}/send`, {
        confirm: true,
      });
      return res.data;
    },
    async sendToSegment(id: string, conditions: SegmentCondition): Promise<Broadcast> {
      const res = await http.post<ApiResponse<Broadcast>>(`/api/broadcasts/${id}/send-segment`, {
        confirm: true,
        conditions,
      });
      return res.data;
    },
  };
}

export class BroadcastsResource {
  private readonly api: ReturnType<typeof createBroadcastsResource>;
  constructor(http: HttpClient, defaultAccountId?: string) {
    this.api = createBroadcastsResource(http, defaultAccountId);
  }

  async list(params?: { accountId?: string }): Promise<Broadcast[]> {
    return this.api.list(params);
  }

  async get(id: string): Promise<Broadcast> {
    return this.api.get(id);
  }

  async create(input: CreateBroadcastInput & { lineAccountId?: string }): Promise<Broadcast> {
    return this.api.create(input);
  }

  async update(id: string, input: UpdateBroadcastInput): Promise<Broadcast> {
    return this.api.update(id, input);
  }

  async delete(id: string): Promise<void> {
    return this.api.delete(id);
  }

  async send(id: string): Promise<Broadcast> {
    return this.api.send(id);
  }

  async sendToSegment(id: string, conditions: SegmentCondition): Promise<Broadcast> {
    return this.api.sendToSegment(id, conditions);
  }
}
