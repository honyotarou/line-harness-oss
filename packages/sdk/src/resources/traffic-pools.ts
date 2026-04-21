import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  TrafficPool,
  PoolAccountRow,
  CreateTrafficPoolInput,
  UpdateTrafficPoolInput,
} from '../types.js';

export type TrafficPoolsResource = Readonly<{
  list: () => Promise<TrafficPool[]>;
  create: (input: CreateTrafficPoolInput) => Promise<TrafficPool>;
  update: (id: string, input: UpdateTrafficPoolInput) => Promise<TrafficPool>;
  delete: (id: string) => Promise<void>;
  listAccounts: (poolId: string) => Promise<PoolAccountRow[]>;
  addAccount: (poolId: string, lineAccountId: string) => Promise<Readonly<Record<string, unknown>>>;
  setAccountActive: (
    poolId: string,
    poolAccountRowId: string,
    isActive: boolean,
  ) => Promise<Readonly<Record<string, unknown>>>;
  removeAccount: (poolId: string, poolAccountRowId: string) => Promise<void>;
}>;

export function createTrafficPoolsResource(http: HttpClient): TrafficPoolsResource {
  return {
    async list(): Promise<TrafficPool[]> {
      const res = await http.get<ApiResponse<TrafficPool[]>>('/api/traffic-pools');
      return res.data;
    },
    async create(input: CreateTrafficPoolInput): Promise<TrafficPool> {
      const res = await http.post<ApiResponse<TrafficPool>>('/api/traffic-pools', input);
      return res.data;
    },
    async update(id: string, input: UpdateTrafficPoolInput): Promise<TrafficPool> {
      const res = await http.put<ApiResponse<TrafficPool>>(`/api/traffic-pools/${id}`, input);
      return res.data;
    },
    async delete(id: string): Promise<void> {
      await http.delete(`/api/traffic-pools/${id}`);
    },
    async listAccounts(poolId: string): Promise<PoolAccountRow[]> {
      const res = await http.get<ApiResponse<PoolAccountRow[]>>(
        `/api/traffic-pools/${poolId}/accounts`,
      );
      return res.data;
    },
    async addAccount(
      poolId: string,
      lineAccountId: string,
    ): Promise<Readonly<Record<string, unknown>>> {
      const res = await http.post<ApiResponse<Record<string, unknown>>>(
        `/api/traffic-pools/${poolId}/accounts`,
        { lineAccountId },
      );
      return res.data;
    },
    async setAccountActive(
      poolId: string,
      poolAccountRowId: string,
      isActive: boolean,
    ): Promise<Readonly<Record<string, unknown>>> {
      const res = await http.put<ApiResponse<Record<string, unknown>>>(
        `/api/traffic-pools/${poolId}/accounts/${poolAccountRowId}`,
        { isActive },
      );
      return res.data;
    },
    async removeAccount(poolId: string, poolAccountRowId: string): Promise<void> {
      await http.delete(`/api/traffic-pools/${poolId}/accounts/${poolAccountRowId}`);
    },
  };
}
