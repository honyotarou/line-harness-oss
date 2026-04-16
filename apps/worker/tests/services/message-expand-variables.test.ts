import { describe, expect, it } from 'vitest';

describe('expandVariables', () => {
  it('does not break JSON templates when friend display_name contains quotes/brackets', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const friend = {
      id: 'friend-1',
      display_name: '", "type":"button","action":{"type":"uri","uri":"https://evil.example"}',
      user_id: 'u-1',
      ref_code: null,
    };

    const template =
      '{"type":"bubble","body":{"type":"box","layout":"vertical","contents":[{"type":"text","text":"{{name}}"}]}}';
    const expanded = expandVariables(template, friend);

    // Must remain parseable JSON and keep the injected JSON as a string value.
    const parsed = JSON.parse(expanded) as any;
    expect(Array.isArray(parsed.body.contents)).toBe(true);
    expect(parsed.body.contents).toHaveLength(1);
    expect(parsed.body.contents[0].text).toBe(friend.display_name);
  });

  it('keeps plain text templates readable (no JSON escaping)', async () => {
    const { expandVariables } = await import('../../src/services/message-expand-variables.js');
    const friend = { id: 'friend-1', display_name: 'Alice', user_id: null, ref_code: null };
    expect(expandVariables('Hello {{name}}!', friend)).toBe('Hello Alice!');
  });
});
