import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mergeHookConfig } from '../src/chio/hooks.ts';

test('upgrades Chio hooks while preserving other providers and configuration', () => {
  const other = { command: 'security-scanner --before-write', failClosed: true };
  const current = { metadata: 'retained', version: 1, hooks: {
    afterFileEdit: [{ command: 'node ./.chio/hooks/composer.mjs' }, other],
    beforeShellExecution: [{ command: 'node ./.chio/hooks/shell.mjs', matcher: 'Shell' }],
  } };
  const replacement = { command: 'node ./.chio/hooks/pretooluse.mjs', failClosed: true };
  const next = mergeHookConfig(current, { hooks: { preToolUse: [replacement] } });
  assert.equal(next.metadata, 'retained');
  assert.deepEqual(next.hooks, { afterFileEdit: [other], preToolUse: [replacement] });
  assert.deepEqual(mergeHookConfig(next, { hooks: { preToolUse: [replacement] } }), next);
});

test('refuses unsupported or malformed existing configuration', () => {
  for (const input of [null, [], { version: 2 }, { hooks: [] }, { hooks: { preToolUse: null } }]) {
    assert.throws(() => mergeHookConfig(input, {}));
  }
});
