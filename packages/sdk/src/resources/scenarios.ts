import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  Scenario,
  ScenarioListItem,
  ScenarioWithSteps,
  ScenarioStep,
  CreateScenarioInput,
  CreateStepInput,
  UpdateScenarioInput,
  UpdateStepInput,
  FriendScenarioEnrollment,
} from '../types.js';

export type ScenariosResource = Readonly<{
  list: (params?: Readonly<{ accountId?: string }>) => Promise<ScenarioListItem[]>;
  get: (id: string) => Promise<ScenarioWithSteps>;
  create: (input: CreateScenarioInput & Readonly<{ lineAccountId?: string }>) => Promise<Scenario>;
  update: (id: string, input: UpdateScenarioInput) => Promise<Scenario>;
  delete: (id: string) => Promise<void>;
  addStep: (scenarioId: string, input: CreateStepInput) => Promise<ScenarioStep>;
  updateStep: (scenarioId: string, stepId: string, input: UpdateStepInput) => Promise<ScenarioStep>;
  deleteStep: (scenarioId: string, stepId: string) => Promise<void>;
  enroll: (scenarioId: string, friendId: string) => Promise<FriendScenarioEnrollment>;
}>;

export function createScenariosResource(
  http: HttpClient,
  defaultAccountId?: string,
): ScenariosResource {
  return {
    async list(params?: Readonly<{ accountId?: string }>): Promise<ScenarioListItem[]> {
      const accountId = params?.accountId ?? defaultAccountId;
      const query = accountId ? `?lineAccountId=${accountId}` : '';
      const res = await http.get<ApiResponse<ScenarioListItem[]>>(`/api/scenarios${query}`);
      return res.data;
    },
    async get(id: string): Promise<ScenarioWithSteps> {
      const res = await http.get<ApiResponse<ScenarioWithSteps>>(`/api/scenarios/${id}`);
      return res.data;
    },
    async create(
      input: CreateScenarioInput & Readonly<{ lineAccountId?: string }>,
    ): Promise<Scenario> {
      const body = { ...input };
      if (!body.lineAccountId && defaultAccountId) {
        body.lineAccountId = defaultAccountId;
      }
      const res = await http.post<ApiResponse<Scenario>>('/api/scenarios', body);
      return res.data;
    },
    async update(id: string, input: UpdateScenarioInput): Promise<Scenario> {
      const res = await http.put<ApiResponse<Scenario>>(`/api/scenarios/${id}`, input);
      return res.data;
    },
    async delete(id: string): Promise<void> {
      await http.delete(`/api/scenarios/${id}`);
    },
    async addStep(scenarioId: string, input: CreateStepInput): Promise<ScenarioStep> {
      const res = await http.post<ApiResponse<ScenarioStep>>(
        `/api/scenarios/${scenarioId}/steps`,
        input,
      );
      return res.data;
    },
    async updateStep(
      scenarioId: string,
      stepId: string,
      input: UpdateStepInput,
    ): Promise<ScenarioStep> {
      const res = await http.put<ApiResponse<ScenarioStep>>(
        `/api/scenarios/${scenarioId}/steps/${stepId}`,
        input,
      );
      return res.data;
    },
    async deleteStep(scenarioId: string, stepId: string): Promise<void> {
      await http.delete(`/api/scenarios/${scenarioId}/steps/${stepId}`);
    },
    async enroll(scenarioId: string, friendId: string): Promise<FriendScenarioEnrollment> {
      const res = await http.post<ApiResponse<FriendScenarioEnrollment>>(
        `/api/scenarios/${scenarioId}/enroll/${friendId}`,
      );
      return res.data;
    },
  };
}
