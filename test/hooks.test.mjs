import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { toToolCall } from '../hooks-src/_check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function runHook(script, input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'hooks-src', script)], {
      env: { ...process.env, CHIO_BIN: '', CHIO_POLICY: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', value => { stdout += value; });
    child.stderr.on('data', value => { stderr += value; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, json: JSON.parse(stdout), stderr }));
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

const actions = [
  ['pretooluse.mjs', { hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: { path: '/tmp/protected', content: 'change' } }],
  ['composer.mjs', { hook_event_name: 'beforeReadFile', file_path: '/tmp/private', content: 'private' }],
  ['composer.mjs', { hook_event_name: 'beforeTabFileRead', file_path: '/tmp/private', content: 'private' }],
  ['shell.mjs', { hook_event_name: 'beforeShellExecution', command: 'npm test; touch /tmp/protected', cwd: '/tmp' }],
  ['tool.mjs', { hook_event_name: 'beforeMCPExecution', tool_name: 'write', tool_input: { path: '/tmp/protected' }, mcp_server_name: 'files' }],
];

for (const [script, input] of actions) {
  test(`${input.hook_event_name}: no local allow when operator policy or kernel binary is missing`, async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chio-cursor-unit-'));
    try {
      const policy = path.join(dir, 'policy.yaml');
      await fs.writeFile(policy, 'hushspec: "0.1.0"\nname: allow-all\nrules:\n  shell_commands:\n    enabled: false\n');
      const denied = await runHook(script, input, { CHIO_POLICY: policy });
      assert.equal(denied.code, 2);
      assert.equal(denied.json.permission, 'deny');
      const absent = await runHook(script, input, { CHIO_POLICY: policy, CHIO_BIN: path.join(dir, 'absent') });
      assert.equal(absent.code, 2);
      assert.equal(absent.json.permission, 'deny');
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
}

test('missing tool, empty stdin and malformed JSON fail closed', async () => {
  for (const input of [{ hook_event_name: 'preToolUse', tool_input: {} }, '', '{']) {
    assert.equal((await runHook('pretooluse.mjs', input)).code, 2);
  }
});

test('post-write notifications are rejected instead of masquerading as prevention', async () => {
  const result = await runHook('composer.mjs', { hook_event_name: 'afterFileEdit', file_path: '/tmp/already-written', edits: [] });
  assert.equal(result.code, 2);
  assert.match(result.json.user_message, /unsupported event/);
});

test('tool and caller payload is preserved, MCP uses authoritative server-name field', () => {
  const input = { hook_event_name: 'beforeMCPExecution', tool_name: 'write', tool_input: '{"path":"x"}', mcp_server_name: 'files', conversation_id: 'session', tool_use_id: 'call' };
  const call = toToolCall(input, ['beforeMCPExecution']);
  assert.equal(call.serverId, 'files');
  assert.deepEqual(call.params, { path: 'x', cursor_request: input });
  assert.throws(() => toToolCall({ ...input, mcp_server_name: undefined }, ['beforeMCPExecution']));
});

test('template covers pre-action tool/read/Tab/shell/MCP events without matchers', async () => {
  const template = JSON.parse(await fs.readFile(path.join(root, 'templates/.cursor/hooks.json'), 'utf8'));
  assert.equal(template.hooks.afterFileEdit, undefined);
  for (const event of ['preToolUse', 'beforeReadFile', 'beforeTabFileRead', 'beforeShellExecution', 'beforeMCPExecution']) {
    const [hook] = template.hooks[event];
    assert.equal(hook.failClosed, true);
    assert.equal(hook.matcher, undefined);
  }
});
