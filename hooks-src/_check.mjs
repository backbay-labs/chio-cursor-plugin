import path from 'node:path';
import { emit, readStdinJson, resolvePolicyPath, loadBridge } from './_lib.mjs';

function requiredText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing ${label}`);
  return value;
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

export function toToolCall(input, acceptedEvents) {
  object(input, 'hook input');
  const event = requiredText(input.hook_event_name, 'hook_event_name');
  if (!acceptedEvents.includes(event)) throw new Error(`unsupported event: ${event}`);
  let tool;
  let params;
  if (event === 'preToolUse' || event === 'beforeMCPExecution') {
    tool = requiredText(input.tool_name, 'tool_name');
    params = object(typeof input.tool_input === 'string'
      ? JSON.parse(input.tool_input) : input.tool_input, 'tool_input');
  } else if (event === 'beforeShellExecution') {
    tool = 'Shell';
    params = { command: requiredText(input.command, 'command'), cwd: requiredText(input.cwd, 'cwd') };
  } else {
    tool = event === 'beforeTabFileRead' ? 'TabRead' : 'Read';
    params = { path: requiredText(input.file_path, 'file_path'), content: input.content };
  }
  // Preserve host identity and the entire request for inspection. These fields
  // are claims from the host; this policy check does not authenticate them.
  const call = { tool, params: { ...params, cursor_request: input } };
  if (event === 'beforeMCPExecution') {
    call.serverId = requiredText(input.mcp_server_name, 'mcp_server_name');
  }
  return call;
}

export async function checkEvent(acceptedEvents) {
  try {
    const input = await readStdinJson();
    const call = toToolCall(input, acceptedEvents);
    const policyPath = resolvePolicyPath(input);
    if (!policyPath) throw new Error('no policy configured');
    // Require explicit operator-selected binary. PATH lookup can otherwise
    // resolve an agent-written program. Its integrity still requires isolation.
    const binary = requiredText(process.env.CHIO_BIN, 'CHIO_BIN');
    if (!path.isAbsolute(binary)) throw new Error('CHIO_BIN must be an absolute path');
    const bridge = await loadBridge();
    // A daemon check in bridge <=0.2.x actually executed the MCP tool, after
    // which Cursor would dispatch it again. Never use that API in a pre-hook.
    const client = bridge.ChioBridge.fromCli({ chioBinary: binary });
    const verdict = await client.check({ ...call, policyPath });
    if (verdict?.decision !== 'allow') {
      throw new Error(verdict?.reason || `policy decision: ${verdict?.decision ?? 'missing'}`);
    }
    emit({ permission: 'allow' });
  } catch (error) {
    emit({ permission: 'deny', user_message: `Chio: ${error.message}`,
      agent_message: 'Chio pre-action policy check did not authorize this request.' }, 2);
  }
}
