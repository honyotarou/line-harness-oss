import { Hono } from 'hono';
import type { Env } from '../index.js';
import { handleEnvProbeGet } from '../services/env-probe-response.js';

const envProbe = new Hono<Env>();

envProbe.get('/api/_debug/env-probe', (c) => handleEnvProbeGet(c));

export { envProbe };
