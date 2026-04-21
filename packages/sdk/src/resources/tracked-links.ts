import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  TrackedLink,
  TrackedLinkWithClicks,
  CreateTrackedLinkInput,
} from '../types.js';

export type TrackedLinksResource = Readonly<{
  list: () => Promise<TrackedLink[]>;
  create: (input: CreateTrackedLinkInput) => Promise<TrackedLink>;
  get: (id: string) => Promise<TrackedLinkWithClicks>;
  delete: (id: string) => Promise<void>;
}>;

export function createTrackedLinksResource(http: HttpClient): TrackedLinksResource {
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
