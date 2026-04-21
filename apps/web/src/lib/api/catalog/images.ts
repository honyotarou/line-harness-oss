import type { ApiResponse } from '@line-crm/shared';
import { fetchApi } from '../client.js';

export type ImageUploadResult = Readonly<{
  id: string;
  mimeType: string;
  byteSize: number;
  publicUrlPath: string;
}>;

export const images = {
  upload: (data: { mimeType: string; base64: string; lineAccountId?: string | null }) =>
    fetchApi<ApiResponse<ImageUploadResult>>('/api/images', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
