#!/usr/bin/env node
// Candidate macOS launcher. Authentication and I01-I08 remain qualification gates.
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGatewayHttp } from '../dist/gateway-http.mjs';
import { allowedTools, buildSandboxPolicy, inspectJournal, pinnedRuntime, privateFile, runtimeLibraries, validateSessionConfig, within } from './protected-boundary.mjs';

const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

async function main() {
  const options = {};
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    process.stdout.write('Usage: node bin/chio-cursor-protected.mjs --agent /absolute/cursor-agent --gateway-config /absolute/private.json [--probe | --prompt "task"]\n');
    return;
  }
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--agent', '--gateway-config', '--prompt', '--probe'].includes(key) || key in options) throw new Error('unsupported or duplicate option');
    if (key === '--probe') options[key] = true;
    else {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`missing ${key} value`);
      options[key] = value;
    }
  }
  if (process.platform !== 'darwin') throw new Error('candidate launcher currently requires macOS sandbox-exec');
  if (!options['--agent'] || !options['--gateway-config']) throw new Error('--agent and --gateway-config are required');
  if (!!options['--probe'] === !!options['--prompt']) throw new Error('choose exactly one of --probe or --prompt');
  // The agent API is a streamed tool/runtime protocol, not a plain model API.
  // Its cloud-action fields need a qualified operator relay before giving the
  // untrusted process any authenticated route to that service.
  if (options['--prompt']) throw new Error('Protected model execution remains blocked: designated Cursor authentication and a bounded AgentService relay require qualification; use --probe for kernel discovery');
  const agent = await realpath(options['--agent']);
  const node = await realpath(process.execPath);
  const normalHome = await realpath(os.homedir());
  if (within(agent, normalHome) || within(node, normalHome)) throw new Error('extract the host and Node runtime outside the normal home before launching');
  await access('/usr/bin/sandbox-exec', constants.X_OK);
  if (path.basename(agent) !== 'cursor-agent') throw new Error('Select the pinned Cursor archive entrypoint');
  const hostRoot = path.dirname(agent);
  const binRoot = path.dirname(fileURLToPath(import.meta.url));
  const lock = JSON.parse(await readFile(path.join(binRoot, 'cursor-runtime-lock.json'), 'utf8'));
  const hostFiles = await pinnedRuntime(hostRoot, lock);
  const hostNode = await realpath(path.join(hostRoot, 'node'));
  const configSource = await privateFile(options['--gateway-config']);
  const config = validateSessionConfig(JSON.parse(await readFile(configSource, 'utf8')));
  await mkdir(config.journalDir, { recursive: true, mode: 0o700 });
  config.journalDir = await inspectJournal(config.journalDir);
  if (within(configSource, config.journalDir) || within(hostRoot, config.journalDir) || within(config.journalDir, hostRoot)) {
    throw new Error('Journal, operator configuration and pinned runtime must have separate paths');
  }
  const state = await realpath(await mkdtemp(path.join(os.tmpdir(), 'chio-cursor-protected-')));
  const profile = path.join(state, 'profile');
  const workspace = path.join(state, 'workspace');
  const data = path.join(state, 'data');
  const control = path.join(state, 'control');
  for (const directory of [profile, workspace, data, control, path.join(workspace, '.cursor')]) await mkdir(directory, { recursive: true, mode: 0o700 });
  const transport = await startGatewayHttp(config);
  try {
  const cliConfig = path.join(profile, 'cli-config.json');
  await writeFile(cliConfig, JSON.stringify({ version: 1, editor: { vimMode: false }, approvalMode: 'allowlist', sandbox: { mode: 'enabled' }, permissions: {
    allow: allowedTools.map(tool => `Mcp(chio:${tool})`),
    deny: ['Shell(*)', 'Read(**)', 'Read(/**)', 'Write(**)', 'Write(/**)', 'WebFetch(*)'],
  } }, null, 2));
  const mcpConfig = path.join(workspace, '.cursor', 'mcp.json');
  await writeFile(mcpConfig, JSON.stringify({ mcpServers: { chio: { url: transport.url,
    headers: { Authorization: 'Bearer ${env:CHIO_CURSOR_GATEWAY_TOKEN}' } } } }, null, 2), {mode: 0o600});
  const hook = path.join(control, 'gateway-only.mjs');
  await writeFile(hook, `const tools = ${JSON.stringify(allowedTools)};
let data = ''; for await (const chunk of process.stdin) data += chunk;
try {
  const input = JSON.parse(data);
  const event = input.hook_event_name;
  const permitted = event === 'beforeMCPExecution'
    ? input.mcp_server_name === 'chio' && tools.includes(input.tool_name)
    : event === 'preToolUse' && tools.some(name => input.tool_name === 'MCP:' + name || input.tool_name === 'mcp__chio__' + name);
  process.stdout.write(JSON.stringify({ permission: permitted ? 'allow' : 'deny', user_message: permitted ? undefined : 'Chio candidate mode permits only the kernel gateway tools.' }));
  process.exitCode = permitted ? 0 : 2;
} catch { process.stdout.write('{"permission":"deny"}'); process.exitCode = 2; }
`);
  const hookDefinition = { command: `OPENSSL_CONF=/dev/null ${quote(node)} ${quote(hook)}`, timeout: 10, failClosed: true };
  const hooks = Object.fromEntries(['preToolUse', 'beforeMCPExecution', 'beforeShellExecution', 'beforeReadFile', 'beforeTabFileRead', 'subagentStart'].map(event => [event, [hookDefinition]]));
  await writeFile(path.join(workspace, '.cursor', 'hooks.json'), JSON.stringify({ version: 1, hooks }, null, 2));
  const libraries = [...new Set([...(await runtimeLibraries(node)), ...(await runtimeLibraries(hostNode))])];
  const policy = buildSandboxPolicy({ files: [...hostFiles, ...libraries], control, profile, data, workspace,
    cliConfig, executables: [node, hostNode], gatewayPort: transport.port });
  const sandbox = path.join(control, 'profile.sb');
  await writeFile(sandbox, policy, { mode: 0o600 });
  // Invoke the archive's Node entry directly. This is the pinned cursor-agent
  // script's final exec, without granting its shell's utility executables.
  const hostCommand = [hostNode, path.join(hostRoot, 'index.js')];
  const command = [...hostCommand, '--workspace', workspace, '--sandbox', 'enabled', '--trust'];
  if (options['--probe']) command.push('mcp', 'list-tools', 'chio');
  else command.push('--print', '--output-format', 'json', options['--prompt']);
  const temporary = path.join(data, 'tmp');
  await mkdir(temporary, { mode: 0o700 });
  const env = { PATH: `${path.dirname(node)}:/usr/bin:/bin`, TMPDIR: temporary, LANG: 'en_US.UTF-8', CURSOR_INVOKED_AS: 'cursor-agent', CURSOR_CONFIG_DIR: profile, CURSOR_DATA_DIR: data, AGENT_CLI_CREDENTIAL_STORE: 'file', NODE_COMPILE_CACHE: path.join(data, 'compile-cache'), OPENSSL_CONF: '/dev/null', CHIO_CURSOR_GATEWAY_TOKEN: transport.token };
  process.stderr.write(`Chio Cursor candidate state: ${state}\n`);
  async function invoke(hostArguments) {
    const child = spawn('/usr/bin/sandbox-exec', ['-f', sandbox, ...hostArguments], { cwd: workspace, env, stdio: ['inherit', 'pipe', 'pipe'] });
    // Pipes let operators retain stdout in normal-home evidence files while the
    // sandboxed host itself cannot open those files or inherit writable file fds.
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    const interrupt = () => { try { child.kill('SIGINT'); } catch {} };
    process.on('SIGINT', interrupt);
    let forceStop;
    const deadline = setTimeout(() => { child.kill('SIGTERM'); forceStop = setTimeout(() => child.kill('SIGKILL'), 5000); }, 60000);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => resolve(code ?? (signal ? 130 : 1))); }).finally(() => { clearTimeout(deadline); if (forceStop) clearTimeout(forceStop); });
    process.removeListener('SIGINT', interrupt);
    return code;
  }
  // Use the host's supported approval procedure for this single immutable MCP
  // definition. Do not use --force or approve arbitrary inherited servers.
  const approved = await invoke([...hostCommand, '--workspace', workspace, 'mcp', 'enable', 'chio']);
  process.exitCode = approved === 0 ? await invoke(command) : approved;
  } finally { await transport.close(); }
}
main().catch(error => { process.stderr.write(`Chio Cursor launch failed: ${error.message}\n`); process.exitCode = 1; });
