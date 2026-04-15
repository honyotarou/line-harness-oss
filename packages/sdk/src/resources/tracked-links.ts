import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  TrackedLink,
  TrackedLinkWithClicks,
  CreateTrackedLinkInput,
} from '../types.js';

export function createTrackedLinksResource(http: HttpClient): {
  list: () => Promise<TrackedLink[]>;
  create: (input: CreateTrackedLinkInput) => Promise<TrackedLink>;
  get: (id: string) => Promise<TrackedLinkWithClicks>;
  delete: (id: string) => Promise<void>;
} {
  return {
    async list(): Promise<TrackedLink[]> {
      const res = await http.get<ApiResponse<TrackedLink[]>>('/api/tracked-links');
      return res.data;
    },
    async create(input: CreateTrackedLinkInput): Promise<TrackedLink> {
      const res = await http.post<ApiResponse<TrackedLink>>('/api/tracked-links', input);
      return res.data;
    },
    async get(id: string): Promise<TrackedLinkWithClicks> {
      const res = await http.get<ApiResponse<TrackedLinkWithClicks>>(`/api/tracked-links/${id}`);
      return res.data;
    },
    async delete(id: string): Promise<void> {
      await http.delete(`/api/tracked-links/${id}`);
    },
  };
}

export class TrackedLinksResource {
  private readonly api: ReturnType<typeof createTrackedLinksResource>;
  constructor(http: HttpClient) {
    this.api = createTrackedLinksResource(http);
  }

  async list(): Promise<TrackedLink[]> {
    return this.api.list();
  }

  async create(input: CreateTrackedLinkInput): Promise<TrackedLink> {
    return this.api.create(input);
  }

  async get(id: string): Promise<TrackedLinkWithClicks> {
    return this.api.get(id);
  }

  async delete(id: string): Promise<void> {
    return this.api.delete(id);
  }
}
