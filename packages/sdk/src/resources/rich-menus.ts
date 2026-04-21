import type { HttpClient } from '../http.js';
import type { ApiResponse, RichMenu, CreateRichMenuInput } from '../types.js';

export type RichMenusResource = Readonly<{
  list: () => Promise<RichMenu[]>;
  create: (menu: CreateRichMenuInput) => Promise<Readonly<{ richMenuId: string }>>;
  delete: (richMenuId: string) => Promise<void>;
  setDefault: (richMenuId: string) => Promise<void>;
}>;

export function createRichMenusResource(http: HttpClient): RichMenusResource {
  return {
    async list(): Promise<RichMenu[]> {
      const res = await http.get<ApiResponse<RichMenu[]>>('/api/rich-menus');
      return res.data;
    },
    async create(menu: CreateRichMenuInput): Promise<Readonly<{ richMenuId: string }>> {
      const res = await http.post<ApiResponse<{ richMenuId: string }>>('/api/rich-menus', menu);
      return res.data;
    },
    async delete(richMenuId: string): Promise<void> {
      await http.delete(`/api/rich-menus/${encodeURIComponent(richMenuId)}`);
    },
    async setDefault(richMenuId: string): Promise<void> {
      await http.post(`/api/rich-menus/${encodeURIComponent(richMenuId)}/default`);
    },
  };
}
