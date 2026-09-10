import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('protected prompt entry refuses before opening the selected host or operator configuration', () => {
  const launcher = fileURLToPath(new URL('../bin/chio-cursor-protected.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [launcher, '--agent', '/nonexistent-cursor-fixture/cursor-agent',
    '--gateway-config', '/nonexistent-cursor-fixture/operator.json', '--prompt', 'fixture only'], {
    encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, OPENSSL_CONF: '/dev/null' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, process.platform === 'darwin'
    ? /server-owned action prevention has no qualified capability-disallow contract/
    : /requires macOS sandbox-exec/);
  assert.doesNotMatch(result.stderr, /ENOENT|EACCES/);
});
