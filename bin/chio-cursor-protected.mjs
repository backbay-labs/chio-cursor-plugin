#!/usr/bin/env node
// Candidate macOS launcher. Authentication and I01-I08 remain qualification gates.
import { spawn } from 'node:child_process';
import { access, copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const allowedTools = ['read_text_file', 'write_file', 'edit_file', 'list_directory'];
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const within = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep);

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
  const agent = await realpath(options['--agent']);
  const node = await realpath(process.execPath);
  const normalHome = await realpath(os.homedir());
  if (within(agent, normalHome) || within(node, normalHome)) throw new Error('extract the host and Node runtime outside the normal home before launching');
  await access('/usr/bin/sandbox-exec', constants.X_OK);
  const configSource = await realpath(options['--gateway-config']);
  const config = JSON.parse(await readFile(configSource, 'utf8'));
  if (!Array.isArray(config.tools) || config.tools.length !== allowedTools.length ||
      !config.tools.every(tool => allowedTools.includes(tool.name)) || new Set(config.tools.map(tool => tool.name)).size !== allowedTools.length) {
    throw new Error('gateway configuration must expose exactly the four qualified candidate filesystem tools');
  }
  const state = await realpath(await mkdtemp(path.join(os.tmpdir(), 'chio-cursor-protected-')));
  const profile = path.join(state, 'profile');
  const workspace = path.join(state, 'workspace');
  const data = path.join(state, 'data');
  const control = path.join(state, 'control');
  for (const directory of [profile, workspace, data, control, path.join(workspace, '.cursor')]) await mkdir(directory, { recursive: true, mode: 0o700 });
  const gateway = path.join(control, 'gateway.mjs');
  await copyFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/gateway.mjs'), gateway);
  const gatewayConfig = path.join(control, 'gateway.json');
  await writeFile(gatewayConfig, JSON.stringify(config), { mode: 0o600 });
  const cliConfig = path.join(profile, 'cli-config.json');
  await writeFile(cliConfig, JSON.stringify({ version: 1, editor: { vimMode: false }, approvalMode: 'allowlist', sandbox: { mode: 'enabled' }, permissions: {
    allow: allowedTools.map(tool => `Mcp(chio:${tool})`),
    deny: ['Shell(*)', 'Read(**)', 'Read(/**)', 'Write(**)', 'Write(/**)', 'WebFetch(*)'],
  } }, null, 2));
  const mcpConfig = path.join(workspace, '.cursor', 'mcp.json');
  await writeFile(mcpConfig, JSON.stringify({ mcpServers: { chio: { command: node, args: [gateway, gatewayConfig] } } }, null, 2));
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
  const hookDefinition = { command: `${quote(node)} ${quote(hook)}`, timeout: 10, failClosed: true };
  const hooks = Object.fromEntries(['preToolUse', 'beforeMCPExecution', 'beforeShellExecution', 'beforeReadFile', 'beforeTabFileRead', 'subagentStart'].map(event => [event, [hookDefinition]]));
  await writeFile(path.join(workspace, '.cursor', 'hooks.json'), JSON.stringify({ version: 1, hooks }, null, 2));
  // CLI ignores CURSOR_CONFIG_DIR when reading user-level MCP configuration.
  // Deny the normal home at the OS boundary, including inherited hooks and sockets.
  const policy = `(version 1)\n(allow default)\n(deny network-outbound (remote unix-socket))\n(deny file-read* file-write* (subpath ${JSON.stringify(normalHome)}))\n(deny file-write* (subpath ${JSON.stringify(control)}) (subpath ${JSON.stringify(path.join(workspace, '.cursor'))}) (literal ${JSON.stringify(cliConfig)}))\n`;
  const sandbox = path.join(control, 'profile.sb');
  await writeFile(sandbox, policy, { mode: 0o600 });
  const command = [agent, '--workspace', workspace, '--sandbox', 'enabled', '--trust'];
  if (options['--probe']) command.push('mcp', 'list-tools', 'chio');
  else command.push('--print', '--output-format', 'json', options['--prompt']);
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', TMPDIR: os.tmpdir(), LANG: 'en_US.UTF-8', CURSOR_CONFIG_DIR: profile, CURSOR_DATA_DIR: data, AGENT_CLI_CREDENTIAL_STORE: 'file', NODE_COMPILE_CACHE: path.join(data, 'compile-cache') };
  if (process.env.CURSOR_API_KEY) env.CURSOR_API_KEY = process.env.CURSOR_API_KEY;
  process.stderr.write(`Chio Cursor candidate state: ${state}\n`);
  async function invoke(hostArguments) {
    const child = spawn('/usr/bin/sandbox-exec', ['-f', sandbox, ...hostArguments], { cwd: workspace, env, stdio: ['inherit', 'pipe', 'pipe'] });
    // Pipes let operators retain stdout in normal-home evidence files while the
    // sandboxed host itself cannot open those files or inherit writable file fds.
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    const interrupt = () => { try { child.kill('SIGINT'); } catch {} };
    process.on('SIGINT', interrupt);
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', (code, signal) => resolve(code ?? (signal ? 130 : 1))); });
    process.removeListener('SIGINT', interrupt);
    return code;
  }
  // Use the host's supported approval procedure for this single immutable MCP
  // definition. Do not use --force or approve arbitrary inherited servers.
  const approved = await invoke([agent, '--workspace', workspace, 'mcp', 'enable', 'chio']);
  process.exitCode = approved === 0 ? await invoke(command) : approved;
}
main().catch(error => { process.stderr.write(`Chio Cursor launch failed: ${error.message}\n`); process.exitCode = 1; });
