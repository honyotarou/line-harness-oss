import { Hono, type Context } from 'hono';
import {
  createAdminFormRecord,
  deleteAdminFormRecord,
  getFormForReader,
  listAdminForms,
  listAdminFormSubmissions,
  resolveFormDefinitionReader,
  updateAdminFormRecord,
  type CreateAdminFormBody,
  type UpdateAdminFormBody,
} from '../application/admin-forms.js';
import {
  submitPublicForm,
  type PublicFormSubmitBody,
} from '../application/public-form-submission.js';
import type { Env } from '../index.js';
import { readAdminSessionCookie } from '../services/admin-session.js';
import { parseBearerAuthorization } from '../services/bearer-authorization.js';
import {
  DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
  jsonBodyReadErrorResponse,
  readJsonBodyWithLimit,
} from '../services/request-body.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';
import { rejectInvalidFormPathId } from '../services/form-path-validation.js';

const forms = new Hono<Env>();
const PUBLIC_FORM_SUBMIT_LIMIT_BYTES = 64 * 1024;
const PUBLIC_FORM_SUBMIT_RATE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

function jsonFormFailure(
  c: Pick<Context<Env>, 'json'>,
  failure: Readonly<{ body: unknown; status: number }>,
) {
  return c.json(failure.body, failure.status as 400 | 401 | 404 | 409);
}

function resolveFormReaderToken(c: Context<Env>): string | null {
  const bearer = parseBearerAuthorization(c.req.header('Authorization'));
  const cookieToken = readAdminSessionCookie(c);
  return bearer || cookieToken || null;
}

forms.get('/api/forms', async (c) => {
  try {
    const out = await listAdminForms(c.env.DB);
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.get('/api/forms/:id', async (c) => {
  try {
    const invalid = rejectInvalidFormPathId(c);
    if (invalid) return invalid;

    const mode = await resolveFormDefinitionReader({
      db: c.env.DB,
      env: c.env,
      token: resolveFormReaderToken(c),
    });
    if (!mode) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const out = await getFormForReader(c.env.DB, c.req.param('id'), mode);
    if (!out.ok) {
      return jsonFormFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.post('/api/forms', async (c) => {
  try {
    const body = await readJsonBodyWithLimit<CreateAdminFormBody>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const out = await createAdminFormRecord(c.env.DB, body);
    if (!out.ok) {
      return jsonFormFailure(c, out);
    }
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const bodyError = jsonBodyReadErrorResponse(err);
    if (bodyError) {
      return c.json(bodyError.body, bodyError.status);
    }
    console.error('POST /api/forms error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.put('/api/forms/:id', async (c) => {
  try {
    const invalid = rejectInvalidFormPathId(c);
    if (invalid) return invalid;

    const body = await readJsonBodyWithLimit<UpdateAdminFormBody>(
      c.req.raw,
      DEFAULT_ADMIN_JSON_BODY_LIMIT_BYTES,
    );
    const out = await updateAdminFormRecord(c.env.DB, c.req.param('id'), body);
    if (!out.ok) {
      return jsonFormFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    const bodyError = jsonBodyReadErrorResponse(err);
    if (bodyError) {
      return c.json(bodyError.body, bodyError.status);
    }
    console.error('PUT /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.delete('/api/forms/:id', async (c) => {
  try {
    const invalid = rejectInvalidFormPathId(c);
    if (invalid) return invalid;

    const out = await deleteAdminFormRecord(c.env.DB, c.req.param('id'));
    if (!out.ok) {
      return jsonFormFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('DELETE /api/forms/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.get('/api/forms/:id/submissions', async (c) => {
  try {
    const invalid = rejectInvalidFormPathId(c);
    if (invalid) return invalid;

    const out = await listAdminFormSubmissions(c.env.DB, c.req.param('id'));
    if (!out.ok) {
      return jsonFormFailure(c, out);
    }
    return c.json({ success: true, data: out.data });
  } catch (err) {
    console.error('GET /api/forms/:id/submissions error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

forms.post('/api/forms/:id/submit', async (c) => {
  try {
    const invalid = rejectInvalidFormPathId(c);
    if (invalid) return invalid;

    const limited = await enforceRateLimit(c, {
      bucket: `public-form-submit:${c.req.param('id')}`,
      db: c.env.DB,
      limit: PUBLIC_FORM_SUBMIT_RATE_LIMIT.limit,
      windowMs: PUBLIC_FORM_SUBMIT_RATE_LIMIT.windowMs,
    });
    if (limited) {
      return limited;
    }

    const body = await readJsonBodyWithLimit<PublicFormSubmitBody>(
      c.req.raw,
      PUBLIC_FORM_SUBMIT_LIMIT_BYTES,
    );
    const out = await submitPublicForm(c.env.DB, c.env, c.req.param('id'), body);
    if (!out.ok) {
      return jsonFormFailure(c, out);
    }
    return c.json({ success: true, data: out.data }, 201);
  } catch (err) {
    const bodyError = jsonBodyReadErrorResponse(err);
    if (bodyError) {
      return c.json(bodyError.body, bodyError.status);
    }
    console.error('POST /api/forms/:id/submit error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { forms };
