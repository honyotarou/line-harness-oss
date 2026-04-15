import type { HttpClient } from '../http.js';
import type { ApiResponse, Tag, CreateTagInput } from '../types.js';

export function createTagsResource(http: HttpClient): {
  list: () => Promise<Tag[]>;
  create: (input: CreateTagInput) => Promise<Tag>;
  delete: (id: string) => Promise<void>;
} {
  return {
    async list(): Promise<Tag[]> {
      const res = await http.get<ApiResponse<Tag[]>>('/api/tags');
      return res.data;
    },
    async create(input: CreateTagInput): Promise<Tag> {
      const res = await http.post<ApiResponse<Tag>>('/api/tags', input);
      return res.data;
    },
    async delete(id: string): Promise<void> {
      await http.delete(`/api/tags/${id}`);
    },
  };
}

export class TagsResource {
  private readonly api: ReturnType<typeof createTagsResource>;
  constructor(http: HttpClient) {
    this.api = createTagsResource(http);
  }

  async list(): Promise<Tag[]> {
    return this.api.list();
  }

  async create(input: CreateTagInput): Promise<Tag> {
    return this.api.create(input);
  }

  async delete(id: string): Promise<void> {
    return this.api.delete(id);
  }
}
