import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webSrcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readText(relPath: string): string {
  return readFileSync(join(webSrcRoot, relPath), 'utf8');
}

function listFilesRecursively(dirAbs: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;
    const abs = join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursively(abs));
    } else {
      out.push(abs);
    }
  }
  return out;
}

describe('design tokens enforcement (web)', () => {
  it('does not hardcode LINE green (#06C755) in web sources', () => {
    // Keep this explicit: the whole app should use semantic tokens from globals.css.
    const candidates = [
      'app/login/page.tsx',
      'app/scenarios/page.tsx',
      'app/scenarios/detail/scenario-detail-client.tsx',
      'app/reminders/page.tsx',
      'app/notifications/page.tsx',
      'app/chats/page.tsx',
      'app/broadcasts/page.tsx',
      'app/accounts/page.tsx',
      'app/templates/page.tsx',
      'app/conversions/page.tsx',
      'app/users/page.tsx',
      'app/webhooks/page.tsx',
      'app/health/page.tsx',
      'app/form-submissions/page.tsx',
      'components/layout/sidebar.tsx',
      'components/prompt-modal.tsx',
      'components/scenarios/step-editor.tsx',
      'components/broadcasts/broadcast-form.tsx',
      'components/friends/friend-table.tsx',
    ];

    const offenders = candidates.filter((p) => readText(p).includes('#06C755'));
    expect(offenders).toEqual([]);
  });

  it('remaps colorful Tailwind palette to semantic tokens (line-crm-clean)', () => {
    const css = readText('app/globals.css');

    // Raw Tailwind chroma should not leak. Contract must match `app/globals.css` @theme remap block.
    const required = [
      '--color-blue-50: var(--color-primary-muted);',
      '--color-blue-100: #dbeafe;',
      '--color-blue-500: var(--color-primary);',
      '--color-blue-600: var(--color-primary-hover);',

      '--color-purple-50: var(--color-slate-muted);',
      '--color-purple-100: var(--color-accent-pink-muted);',
      '--color-purple-500: var(--color-accent-pink);',
      '--color-purple-600: #7c3aed;',

      '--color-orange-50: var(--color-marketing-yellow-soft);',
      '--color-orange-100: var(--color-marketing-yellow-soft);',
      '--color-orange-500: var(--color-marketing-orange);',
      '--color-orange-600: var(--color-marketing-orange-deep);',

      '--color-amber-50: var(--color-marketing-yellow-soft);',
      '--color-amber-100: var(--color-marketing-yellow-soft);',
      '--color-amber-400: var(--color-marketing-yellow);',
      '--color-amber-500: var(--color-marketing-yellow);',

      '--color-red-50: var(--color-error-muted);',
      '--color-red-100: var(--color-error-muted);',
      '--color-red-500: var(--color-error);',
      '--color-red-600: var(--color-error);',
    ];

    const missing = required.filter((needle) => !css.includes(needle));
    expect(missing).toEqual([]);
  });

  it('does not use colorful Tailwind utility classes in app templates', () => {
    const srcRoot = join(webSrcRoot, 'app');
    const componentRoot = join(webSrcRoot, 'components');
    const roots = [srcRoot, componentRoot];

    const files = roots
      .flatMap((r) => listFilesRecursively(r))
      .filter((abs) => abs.endsWith('.ts') || abs.endsWith('.tsx') || abs.endsWith('.css'));

    const colorful =
      /\b(bg|text|border|ring|from|to)-(red|blue|green|purple|orange|amber|emerald)-(50|100|200|300|400|500|600|700)\b/g;
    const colorfulVariant =
      /\b(hover|focus|active|disabled):(?:bg|text|border|ring)-(red|blue|green|purple|orange|amber|emerald)-(50|100|200|300|400|500|600|700)\b/g;
    const focusRing = /\bfocus:ring-(red|blue|green|purple|orange|amber|emerald)-(400|500|600)\b/g;

    const offenders: { file: string; matches: string[] }[] = [];
    for (const abs of files) {
      const rel = abs.slice(webSrcRoot.length + 1);
      const text = readFileSync(abs, 'utf8');
      const matches = new Set<string>();
      for (const m of text.matchAll(colorful)) matches.add(m[0]);
      for (const m of text.matchAll(colorfulVariant)) matches.add(m[0]);
      for (const m of text.matchAll(focusRing)) matches.add(m[0]);
      if (matches.size > 0) offenders.push({ file: rel, matches: [...matches].sort() });
    }

    expect(offenders).toEqual([]);
  });

  it('does not duplicate core UI styles in pages (use components/ui)', () => {
    const srcRoot = join(webSrcRoot, 'app');
    const componentRoot = join(webSrcRoot, 'components');
    const roots = [srcRoot, componentRoot];

    const files = roots
      .flatMap((r) => listFilesRecursively(r))
      .filter((abs) => abs.endsWith('.ts') || abs.endsWith('.tsx'));

    // These patterns are allowed only inside components/ui/* (centralized look & feel).
    const bannedSnippets = [
      'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm',
      'bg-[var(--color-error-muted)] border border-[var(--color-error-border)] rounded-lg text-[var(--color-error)] text-sm',
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
    ];

    const offenders: { file: string; matches: string[] }[] = [];
    for (const abs of files) {
      const rel = abs.slice(webSrcRoot.length + 1);
      if (rel.startsWith('components/ui/')) continue;
      const text = readFileSync(abs, 'utf8');
      const matches = bannedSnippets.filter((s) => text.includes(s));
      if (matches.length > 0) offenders.push({ file: rel, matches });
    }

    expect(offenders).toEqual([]);
  });
});
