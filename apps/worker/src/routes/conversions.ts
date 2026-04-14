import { Hono } from 'hono';
import type { Env } from '../index.js';
import { conversionEvents } from './conversions.events.js';
import { conversionPoints } from './conversions.points.js';

const conversions = new Hono<Env>();

conversions.route('/', conversionPoints);
conversions.route('/', conversionEvents);

export { conversions };
