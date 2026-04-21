import type { HttpClient } from '../http.js';
import type {
  ApiResponse,
  Form,
  FormSubmission,
  CreateFormInput,
  UpdateFormInput,
} from '../types.js';

export type FormsResource = Readonly<{
  list: () => Promise<Form[]>;
  get: (id: string) => Promise<Form>;
  create: (input: CreateFormInput) => Promise<Form>;
  update: (id: string, input: UpdateFormInput) => Promise<Form>;
  delete: (id: string) => Promise<void>;
  getSubmissions: (formId: string) => Promise<FormSubmission[]>;
}>;

export function createFormsResource(http: HttpClient): FormsResource {
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
