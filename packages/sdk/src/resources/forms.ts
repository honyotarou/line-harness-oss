import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  Form,
  FormSubmission,
  CreateFormInput,
  UpdateFormInput,
} from '../types.js';

export function createFormsResource(http: HttpClient): {
  list: () => Promise<Form[]>;
  get: (id: string) => Promise<Form>;
  create: (input: CreateFormInput) => Promise<Form>;
  update: (id: string, input: UpdateFormInput) => Promise<Form>;
  delete: (id: string) => Promise<void>;
  getSubmissions: (formId: string) => Promise<FormSubmission[]>;
} {
  return {
    async list(): Promise<Form[]> {
      const res = await http.get<ApiResponse<Form[]>>('/api/forms');
      return res.data;
    },
    async get(id: string): Promise<Form> {
      const res = await http.get<ApiResponse<Form>>(`/api/forms/${id}`);
      return res.data;
    },
    async create(input: CreateFormInput): Promise<Form> {
      const res = await http.post<ApiResponse<Form>>('/api/forms', input);
      return res.data;
    },
    async update(id: string, input: UpdateFormInput): Promise<Form> {
      const res = await http.put<ApiResponse<Form>>(`/api/forms/${id}`, input);
      return res.data;
    },
    async delete(id: string): Promise<void> {
      await http.delete(`/api/forms/${id}`);
    },
    async getSubmissions(formId: string): Promise<FormSubmission[]> {
      const res = await http.get<ApiResponse<FormSubmission[]>>(`/api/forms/${formId}/submissions`);
      return res.data;
    },
  };
}

export class FormsResource {
  private readonly api: ReturnType<typeof createFormsResource>;
  constructor(http: HttpClient) {
    this.api = createFormsResource(http);
  }

  async list(): Promise<Form[]> {
    return this.api.list();
  }

  async get(id: string): Promise<Form> {
    return this.api.get(id);
  }

  async create(input: CreateFormInput): Promise<Form> {
    return this.api.create(input);
  }

  async update(id: string, input: UpdateFormInput): Promise<Form> {
    return this.api.update(id, input);
  }

  async delete(id: string): Promise<void> {
    return this.api.delete(id);
  }

  async getSubmissions(formId: string): Promise<FormSubmission[]> {
    return this.api.getSubmissions(formId);
  }
}
