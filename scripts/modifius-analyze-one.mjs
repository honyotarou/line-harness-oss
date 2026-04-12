/**
 * Canonical source for Modifius-style CI LLM analysis: system prompt, user message shape,
 * and Messages API parameters (temperature, model). Do not copy the prompt into `.cursor/skills`;
 * the `line` skill points here. Single-file pass; `modifius-ci.yml` matrix invokes this.
 *
 * Env: MODIFIUS_FILE (repo-relative), ANTHROPIC_API_KEY, optional MODIFIUS_MODEL, MODIFIUS_MAX_CHARS.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const rel = process.env.MODIFIUS_FILE;
if (!rel || typeof rel !== 'string' || rel.includes('..')) {
  console.error('invalid MODIFIUS_FILE');
  process.exit(2);
}
const abs = resolve(root, rel);
const rootSlash = `${root}/`;
if (abs !== root && !abs.startsWith(rootSlash)) {
  console.error('path outside repo');
  process.exit(2);
}

let body = readFileSync(abs, 'utf8');
const maxChars = Number(process.env.MODIFIUS_MAX_CHARS || 120_000);
if (body.length > maxChars) {
  body = `${body.slice(0, maxChars)}\n\n[truncated]\n`;
}

const model = process.env.MODIFIUS_MODEL || 'claude-3-5-haiku-20241022';
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('missing ANTHROPIC_API_KEY');
  process.exit(1);
}

const system = `You are a code modifiability reviewer (変更容易性). Focus on: mixed concerns, inconsistent abstraction levels, and what to split or extract. Output Markdown in Japanese: ## 結論, ## 指摘（箇条書き）, ## 改善の方向（短く）. Be concise. Do not paste back large portions of source code.`;

const user = `File: ${rel}\n\n\`\`\`typescript\n${body}\n\`\`\``;

const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model,
    max_tokens: 2048,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: user }],
  }),
});

if (!res.ok) {
  const t = await res.text();
  console.error(t);
  process.exit(1);
}

/** @type {{ content?: Array<{ type?: string; text?: string }> }} */
const data = await res.json();
const text = data.content?.map((b) => (b.type === 'text' ? b.text : '')).join('') || '';

mkdirSync('modifius-out', { recursive: true });
const safe = createHash('sha256').update(rel).digest('hex').slice(0, 16);
writeFileSync(`modifius-out/${safe}.md`, `# ${rel}\n\n${text}\n`, 'utf8');
console.log('wrote', safe);
