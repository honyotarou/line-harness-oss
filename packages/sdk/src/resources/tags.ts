import type { HttpClient } from '../http.js';
import type { ApiResponse, Tag, CreateTagInput } from '../types.js';

export type TagsResource = Readonly<{
  list: () => Promise<Tag[]>;
  create: (input: CreateTagInput) => Promise<Tag>;
  delete: (id: string) => Promise<void>;
}>;

export function createTagsResource(http: HttpClient): TagsResource {
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
