import type { HttpClient } from '../http.js';
import type { ApiResponse, RichMenu, CreateRichMenuInput } from '../types.js';

export function createRichMenusResource(http: HttpClient): {
  list: () => Promise<RichMenu[]>;
  create: (menu: CreateRichMenuInput) => Promise<{ richMenuId: string }>;
  delete: (richMenuId: string) => Promise<void>;
  setDefault: (richMenuId: string) => Promise<void>;
} {
  return {
    async list(): Promise<RichMenu[]> {
      const res = await http.get<ApiResponse<RichMenu[]>>('/api/rich-menus');
      return res.data;
    },
    async create(menu: CreateRichMenuInput): Promise<{ richMenuId: string }> {
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

export class RichMenusResource {
  private readonly api: ReturnType<typeof createRichMenusResource>;
  constructor(http: HttpClient) {
    this.api = createRichMenusResource(http);
  }

  async list(): Promise<RichMenu[]> {
    return this.api.list();
  }

  async create(menu: CreateRichMenuInput): Promise<{ richMenuId: string }> {
    return this.api.create(menu);
  }

  async delete(richMenuId: string): Promise<void> {
    return this.api.delete(richMenuId);
  }

  async setDefault(richMenuId: string): Promise<void> {
    return this.api.setDefault(richMenuId);
  }
}
