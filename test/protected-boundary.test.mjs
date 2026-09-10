import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, realpath, symlink, link, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { allowedTools, buildSandboxPolicy, inspectJournal, privateFile, runtimeLibraries, validateSessionConfig } from '../bin/protected-boundary.mjs';

function candidate() {
  return { execution: { endpoint: 'http://127.0.0.1:31234/mcp', bearerToken: 'scoped-test-token', sessionId: 'retained', subjectKey: 'a'.repeat(64), capabilityId: 'cap-test', serverId: 'fs', trustedSigners: ['b'.repeat(64)] },
    sessionId: 'host-session', journalDir: '/private/tmp/operator-journal', tools: allowedTools.map(name => ({ name, inputSchema: { type: 'object' } })),
    sessionCredential: { schema: 'chio.mcp.session-credential.v1', sessionId: 'retained', subjectKey: 'a'.repeat(64), capabilityIds: ['cap-test'], serverId: 'fs', endpointPath: '/mcp', allowedTools, issuedAt: 1000, expiresAt: 2000 } };
}

test('protected configuration rejects legacy, expired, mismatched and expansive authority', () => {
  assert.doesNotThrow(() => validateSessionConfig(candidate(), 1500));
  for (const mutate of [
    config => { delete config.sessionCredential; },
    config => { config.sessionCredential.expiresAt = 1499; },
    config => { config.sessionCredential.sessionId = 'replacement'; },
    config => { config.sessionCredential.allowedTools = [...allowedTools, 'shell']; },
    config => { config.sessionCredential.expiresAt = 5000; },
    config => { config.execution.endpoint = 'https://example.org/mcp'; },
    config => { config.execution.endpoint = 'http://127.0.0.1:31234/admin'; },
  ]) { const config = candidate(); mutate(config); assert.throws(() => validateSessionConfig(config, 1500)); }
  const config = candidate(); config.adminToken = 'do-not-copy'; config.execution.adminToken = 'do-not-copy';
  assert.equal(JSON.stringify(validateSessionConfig(config, 1500)).includes('do-not-copy'), false);
});

test('operator configuration and journal reject linked or unrelated files', async t => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'chio-cursor-private-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = path.join(directory, 'config.json');
  await writeFile(config, '{}', { mode: 0o600 });
  assert.equal(await privateFile(config), config);
  await link(config, path.join(directory, 'hardlink'));
  await assert.rejects(privateFile(config), /singly linked/);
  await symlink(config, path.join(directory, 'symlink'));
  await assert.rejects(privateFile(path.join(directory, 'symlink')));
  await assert.rejects(inspectJournal(directory), /unrelated/);
});

test('actual macOS process boundary blocks operator reads, aliases, links, writes and unrelated network', { skip: process.platform !== 'darwin' }, async t => {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'chio-cursor-boundary-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dirs = Object.fromEntries(['control', 'profile', 'data', 'workspace', 'journal'].map(name => [name, path.join(root, name)]));
  await Promise.all(Object.values(dirs).map(dir => mkdir(dir, { mode: 0o700 })));
  await mkdir(path.join(dirs.workspace, '.cursor'), { mode: 0o700 });
  const config = path.join(dirs.control, 'gateway.json');
  const cliConfig = path.join(dirs.profile, 'cli-config.json');
  const secret = path.join(root, 'operator-credential-canary');
  const journalEntry = path.join(dirs.journal, 'operator-record.json');
  await writeFile(journalEntry, '{}', {mode: 0o600});
  await writeFile(config, 'scoped-only', { mode: 0o600 });
  await writeFile(cliConfig, '{}', { mode: 0o600 });
  await writeFile(secret, 'operator-only', { mode: 0o600 });
  await symlink(secret, path.join(dirs.profile, 'escape'));
  const observers = { allowed: 0, forbidden: 0 };
  const listen = async name => {
    const server = createServer((_request, response) => { observers[name]++; response.end('observed'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return server.address().port;
  };
  const gatewayPort = await listen('allowed'); const forbiddenPort = await listen('forbidden');
  const executable = await realpath(process.execPath); const shell = await realpath('/bin/sh');
  const libraries = [...await runtimeLibraries(executable), ...await runtimeLibraries(shell)];
  const policy = buildSandboxPolicy({ files: libraries, ...dirs, cliConfig, executables: [executable, shell], gatewayPort });
  const policyPath = path.join(dirs.control, 'profile.sb');
  await writeFile(policyPath, policy, { mode: 0o600 });
  const script = `const fs=require('node:fs'),{spawnSync}=require('node:child_process');
const p=${JSON.stringify({ config, cliConfig, secret, journalEntry, ...dirs })};
const facts={}; const attempt=(name,fn)=>{try{fn();facts[name]='allowed';}catch(e){facts[name]=e.code;}};
attempt('scopedConfig',()=>fs.readFileSync(p.config));
attempt('operatorConfig',()=>fs.readFileSync(p.secret));
attempt('journalRead',()=>fs.readFileSync(p.journalEntry));
attempt('journalWrite',()=>fs.writeFileSync(p.journalEntry,'changed'));
attempt('dataVolumeAlias',()=>fs.readFileSync('/System/Volumes/Data'+p.secret));
attempt('symlinkEscape',()=>fs.readFileSync(p.profile+'/escape'));
attempt('controlWrite',()=>fs.writeFileSync(p.config,'changed'));
attempt('aliasControlWrite',()=>fs.writeFileSync('/System/Volumes/Data'+p.config,'changed'));
attempt('policyWrite',()=>fs.writeFileSync(p.cliConfig,'changed'));
attempt('hardlink',()=>fs.linkSync(p.config,p.profile+'/linked-config'));
attempt('privateStateWrite',()=>fs.writeFileSync(p.profile+'/own-state','allowed'));
const descendant=spawnSync(process.execPath,['-e','try{require("fs").readFileSync('+JSON.stringify(p.secret)+');process.exit(9)}catch(e){process.stdout.write(e.code)}'],{encoding:'utf8'});
facts.descendant={status:descendant.status,stdout:descendant.stdout,error:descendant.error?.code};
const unknown=spawnSync('/bin/cat',[p.config],{encoding:'utf8'});facts.unapprovedExecutable=unknown.error?.code??unknown.status;
async function request(port){try{const response=await fetch('http://127.0.0.1:'+port,{signal:AbortSignal.timeout(1500)});return response.status;}catch{return 'blocked';}}
Promise.all([request(${gatewayPort}),request(${forbiddenPort})]).then(([allowed,forbidden])=>{facts.network={allowed,forbidden};console.log(JSON.stringify(facts));});`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/sandbox-exec', ['-f', policyPath, executable, '-e', script], {
      cwd: dirs.workspace, env: { PATH: '/usr/bin:/bin', LANG: 'en_US.UTF-8', TMPDIR: dirs.data, OPENSSL_CONF: '/dev/null' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  const facts = JSON.parse(result.stdout);
  for (const name of ['operatorConfig', 'journalRead', 'journalWrite', 'dataVolumeAlias', 'symlinkEscape', 'controlWrite', 'aliasControlWrite', 'policyWrite', 'hardlink']) {
    assert.equal(facts[name], 'EPERM', `${name}: ${JSON.stringify(facts)}`);
  }
  assert.equal(facts.scopedConfig, 'allowed'); assert.equal(facts.privateStateWrite, 'allowed');
  assert.deepEqual(facts.descendant, { status: 0, stdout: 'EPERM' });
  assert.equal(facts.unapprovedExecutable, 'EPERM');
  assert.deepEqual(facts.network, { allowed: 200, forbidden: 'blocked' });
  assert.deepEqual(observers, { allowed: 1, forbidden: 0 });
  t.diagnostic(JSON.stringify({ facts, independentNetworkObservers: observers }));
});
