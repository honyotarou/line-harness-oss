import { Hono } from 'hono';
import type { Env } from '../index.js';
import { isOpenApiDocumentationEnabled, openApiSpec } from '../application/openapi-spec.js';
import { enforceRateLimit } from '../services/request-rate-limit.js';

const openapi = new Hono<Env>();
const OPENAPI_PUBLIC_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export { isOpenApiDocumentationEnabled };

// GET /openapi.json - raw spec
openapi.get('/openapi.json', async (c) => {
  if (!isOpenApiDocumentationEnabled(c.env)) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }
  const limited = await enforceRateLimit(c, {
    bucket: 'openapi-spec',
    db: c.env.DB,
    limit: OPENAPI_PUBLIC_RATE_LIMIT.limit,
    windowMs: OPENAPI_PUBLIC_RATE_LIMIT.windowMs,
  });
  if (limited) {
    return limited;
  }
  return c.json(openApiSpec);
});

// GET /docs - Swagger UI
openapi.get('/docs', async (c) => {
  if (!isOpenApiDocumentationEnabled(c.env)) {
    return c.json({ success: false, error: 'Not found' }, 404);
  }
  const limited = await enforceRateLimit(c, {
    bucket: 'openapi-docs',
    db: c.env.DB,
    limit: OPENAPI_PUBLIC_RATE_LIMIT.limit,
    windowMs: OPENAPI_PUBLIC_RATE_LIMIT.windowMs,
  });
  if (limited) {
    return limited;
  }
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LINE CRM API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;
  return c.html(html);
});

export { openapi };
