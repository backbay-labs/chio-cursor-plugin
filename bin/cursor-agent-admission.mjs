import { gunzipSync } from 'node:zlib';

export const RUN_PATH = '/agent.v1.AgentService/Run';
export const REMOTE_RUN_BLOCKER = 'Cursor server-owned action prevention has no qualified capability-disallow contract; authenticated Run remains disabled';
const MAX_FRAME = 8 * 1024 * 1024;
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function refuse(message) { throw new Error(`Cursor agent admission refused: ${message}`); }
function keys(value, allowed, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse(`${location} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) refuse(`${location}.${key} is outside the candidate contract`);
}
function disabled(value, names, location) {
  for (const name of names) if (value[name] !== undefined && value[name] !== false) refuse(`${location}.${name} must be disabled`);
}

/** Decode only the exact generated binary dialect, rejecting unknown fields,
 * duplicate singular fields, alternate field ordering and ambiguous encodings.
 * This is an admission component, not proof of remote effect prevention. */
export function decodeCanonical(type, bytes) {
  if (!bytes.length || bytes.length > MAX_FRAME) refuse('protobuf frame size outside limit');
  let message;
  try { message = type.fromBinary(bytes, { readUnknownFields: true }); }
  catch { refuse('invalid protobuf frame'); }
  if (!Buffer.from(message.toBinary({ writeUnknownFields: false })).equals(Buffer.from(bytes))) {
    refuse('unknown, duplicate or noncanonical protobuf fields');
  }
  return message;
}

function inventory(definitions, tools, location) {
  if (!Array.isArray(definitions)) refuse(`${location} must be a tool list`);
  const seen = new Set();
  for (const definition of definitions) {
    keys(definition, ['name', 'providerIdentifier', 'toolName', 'description', 'inputSchema', 'inputSchemaJson'], location);
    const expected = tools.find(tool => tool.name === definition.toolName);
    if (!expected || definition.providerIdentifier !== 'chio' || seen.has(definition.toolName) ||
        typeof expected.hostName !== 'string' || definition.name !== expected.hostName) refuse(`${location} is not the operator Chio inventory`);
    seen.add(definition.toolName);
    let schema;
    try { schema = definition.inputSchemaJson === undefined ? definition.inputSchema : JSON.parse(definition.inputSchemaJson); }
    catch { refuse(`${location} contains malformed schema JSON`); }
    if (canonical(schema) !== canonical(expected.inputSchema) ||
        (definition.inputSchema !== undefined && canonical(definition.inputSchema) !== canonical(expected.inputSchema)) ||
        (definition.description ?? '') !== (expected.description ?? '')) refuse(`${location} differs from the operator tool descriptor`);
  }
}

export function validateInitialRun(protocol, bytes, expected) {
  const message = decodeCanonical(protocol.type('agent.v1.AgentClientMessage'), bytes);
  let json;
  try { json = message.toJson(); }
  catch { refuse('protobuf cannot be represented in the qualified JSON dialect'); }
  keys(json, ['runRequest'], 'client');
  const run = json.runRequest;
  keys(run, ['conversationState', 'action', 'modelDetails', 'requestedModel', 'mcpTools', 'conversationId',
    'excludeWorkspaceContext', 'clientSupportsInlineImages', 'canCreateCloudSubagents', 'clientSupportsSendToUser',
    'runId', 'agentSessionId', 'clientSupportsPromptContextUsageRpc', 'clientSupportsRoutedModelUpdate',
    'clientSupportsPreviewCard', 'startedAsNewProject'], 'run');
  disabled(run, ['canCreateCloudSubagents', 'clientSupportsSendToUser', 'startedAsNewProject'], 'run');
  if (run.conversationId !== expected.conversationId || run.runId !== expected.runId || run.agentSessionId !== expected.agentSessionId) refuse('run identity does not match the operator binding');
  if (run.modelDetails) {
    keys(run.modelDetails, ['modelId', 'displayModelId', 'displayName', 'displayNameShort', 'aliases', 'thinkingDetails', 'maxMode'], 'model');
    if (run.modelDetails.modelId !== expected.modelId) refuse('model selection differs from operator binding');
  }
  if (run.requestedModel) {
    // Parameterized/credential-bearing models require their own qualification.
    keys(run.requestedModel, ['modelId'], 'requestedModel');
    if (run.requestedModel.modelId !== expected.modelId) refuse('requested model differs from operator binding');
  }
  if (!run.modelDetails && !run.requestedModel) refuse('explicit model binding required');
  if (run.conversationState) keys(run.conversationState, ['mode', 'conversationStartedTimestampMs', 'conversationStartedTimeZone'], 'freshConversation');
  if (run.conversationState?.mode && run.conversationState.mode !== 'AGENT_MODE_AGENT') refuse('fresh conversation mode must be Agent');
  keys(run.action, ['userMessageAction'], 'action');
  const action = run.action.userMessageAction;
  keys(action, ['userMessage', 'requestContext'], 'userMessageAction');
  keys(action.userMessage, ['text', 'messageId', 'mode', 'startedAtMs'], 'userMessage');
  if (action.userMessage.text !== expected.prompt || action.userMessage.messageId !== expected.messageId) refuse('prompt or message identity differs from operator binding');
  if (action.userMessage.mode && action.userMessage.mode !== 'AGENT_MODE_AGENT') refuse('user message mode must be Agent');
  const context = action.requestContext;
  keys(context, ['env', 'tools', 'mcpInstructions', 'webSearchEnabled', 'webFetchEnabled', 'searchConversationsEnabled',
    'sendMessageEnabled', 'supportsMcpAuth', 'readLintsEnabled', 'mcpInfoComplete', 'rulesInfoComplete', 'envInfoComplete',
    'repositoryInfoComplete', 'customSubagentsInfoComplete', 'agentSkillsInfoComplete', 'mcpFileSystemInfoComplete',
    'gitStatusInfoComplete', 'gitRepoInfoComplete'], 'requestContext');
  disabled(context, ['webSearchEnabled', 'webFetchEnabled', 'searchConversationsEnabled', 'sendMessageEnabled', 'supportsMcpAuth', 'readLintsEnabled'], 'requestContext');
  if (context.env) {
    // Environment strings are context, not authority. Remote credentials,
    // repository mounts and injected opaque context are excluded by field name.
    keys(context.env, ['osVersion', 'workspacePaths', 'shell', 'sandboxEnabled', 'sandboxSupported', 'timeZone',
      'secretRedactionEnabled', 'isWorkingDirHomeDir', 'processWorkingDirectory', 'computerUseSupported',
      'sandboxNetworkHasDefaults', 'smartModeClassifierAutoModeEnabled'], 'environment');
    disabled(context.env, ['computerUseSupported', 'sandboxNetworkHasDefaults', 'smartModeClassifierAutoModeEnabled', 'isWorkingDirHomeDir'], 'environment');
    if (context.env.workspacePaths && canonical(context.env.workspacePaths) !== canonical([expected.workspace])) refuse('workspace paths differ from operator binding');
    if (context.env.processWorkingDirectory && context.env.processWorkingDirectory !== expected.workspace) refuse('working directory differs from operator binding');
  }
  if (context.mcpInstructions) {
    // No extra remote instructions are accepted until the host shape is observed.
    refuse('MCP instruction expansion is not qualified');
  }
  inventory(context.tools ?? [], expected.tools, 'requestContext.tools');
  if (run.mcpTools) {
    keys(run.mcpTools, ['mcpTools'], 'mcpTools');
    inventory(run.mcpTools.mcpTools ?? [], expected.tools, 'mcpTools');
  }
  if (!(context.tools?.length || run.mcpTools?.mcpTools?.length)) refuse('no qualified Chio tools in request');
  return message;
}

/** Frame decoder handles fragmented input and bounded gzip decompression. It
 * emits complete validated protobuf payloads only; no upstream I/O exists. */
export function createInitialRunDecoder(protocol, expected, { path = RUN_PATH, encoding = 'identity' } = {}) {
  if (path !== RUN_PATH) refuse('alternate RPC/RunSSE/RunPoll/BidiAppend transport is disabled');
  if (!['identity', 'gzip'].includes(encoding)) refuse('unsupported message compression');
  let pending = Buffer.alloc(0); let received = 0; let admitted = false;
  return {
    push(chunk) {
      received += chunk.length;
      if (received > MAX_FRAME + 5) refuse('request byte budget exceeded');
      pending = Buffer.concat([pending, chunk]);
      if (pending.length < 5) return undefined;
      const flags = pending[0]; const length = pending.readUInt32BE(1);
      if (![0, 1].includes(flags) || length === 0 || length > MAX_FRAME) refuse('invalid frame header');
      if (pending.length < length + 5) return undefined;
      if (admitted || pending.length !== length + 5) refuse('multiple initial messages or trailing bytes');
      let payload = pending.subarray(5);
      if (flags === 1) {
        if (encoding !== 'gzip') refuse('compression flag without supported encoding');
        try { payload = gunzipSync(payload, { maxOutputLength: MAX_FRAME }); }
        catch { refuse('invalid or oversized compressed frame'); }
      }
      const message = validateInitialRun(protocol, payload, expected);
      pending = Buffer.alloc(0); admitted = true;
      return message;
    },
    finish() { if (!admitted || pending.length) refuse('truncated or missing initial frame'); },
  };
}

// There is intentionally no environment variable, CLI switch, or callback to
// turn this gate into an authenticated forwarder. A local shape check cannot
// supply Cursor's missing pre-effect server capability contract.
export function requireQualifiedRemoteRun() { throw new Error(REMOTE_RUN_BLOCKER); }
