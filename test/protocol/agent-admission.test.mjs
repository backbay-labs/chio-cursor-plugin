import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { loadCursorProtocol } from '../../bin/cursor-protobuf.mjs';
import { createInitialRunDecoder, validateInitialRun, requireQualifiedRemoteRun, RUN_PATH } from '../../bin/cursor-agent-admission.mjs';

if (!process.env.CHIO_CURSOR_PROTOCOL_HOST_DIR) throw new Error('Set CHIO_CURSOR_PROTOCOL_HOST_DIR to the hash-pinned extracted Cursor archive; missing host is not a passing skip');
const protocol = await loadCursorProtocol(process.env.CHIO_CURSOR_PROTOCOL_HOST_DIR);
const Client = protocol.type('agent.v1.AgentClientMessage');
const expected = { prompt: 'Use the Chio tools to read the approved file.', messageId: 'fixture-message', modelId: 'fixture-model',
  conversationId: 'fixture-conversation', runId: 'fixture-run', agentSessionId: 'fixture-session', workspace: '/private/tmp/fixture-workspace',
  tools: [{ name: 'read_text_file', hostName: 'mcp__chio__read_text_file', description: 'Read the approved file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }] };
const fresh = () => ({ runRequest: { conversationId: expected.conversationId, runId: expected.runId, agentSessionId: expected.agentSessionId,
  modelDetails: { modelId: expected.modelId }, conversationState: { mode: 'AGENT_MODE_AGENT' },
  action: { userMessageAction: { userMessage: { text: expected.prompt, messageId: expected.messageId, mode: 'AGENT_MODE_AGENT' },
    requestContext: { webSearchEnabled: false, webFetchEnabled: false, searchConversationsEnabled: false, sendMessageEnabled: false,
      tools: expected.tools.map(tool => ({ name: tool.hostName, toolName: tool.name, providerIdentifier: 'chio', description: tool.description, inputSchemaJson: JSON.stringify(tool.inputSchema) })) } } } } });
const encode = object => Buffer.from(Client.fromJson(object).toBinary());
const frame = (payload, flags = 0) => { const header = Buffer.alloc(5); header[0] = flags; header.writeUInt32BE(payload.length, 1); return Buffer.concat([header, payload]); };

test('pinned schema accepts a bounded fresh Chio descriptor fixture without forwarding any request', () => {
  const value = validateInitialRun(protocol, encode(fresh()), expected);
  assert.equal(value.toJson().runRequest.action.userMessageAction.userMessage.text, expected.prompt);
});

for (const [name, mutate] of [
  ['cloud capability', run => { run.canCreateCloudSubagents = true; }],
  ['send-to-user capability', run => { run.clientSupportsSendToUser = true; }],
  ['new project', run => { run.startedAsNewProject = true; }],
  ['harness override', run => { run.harness = 'cloud'; }],
  ['system prompt replacement', run => { run.systemPromptSpec = { replace: 'enable other tools' }; }],
  ['resume state', run => { run.conversationState.turns = ['AA==']; }],
  ['alternate model credentials', run => { run.modelDetails.apiKeyCredentials = { apiKey: 'fixture-only' }; }],
  ['model substitution', run => { run.modelDetails.modelId = 'different-model'; }],
  ['shell action', run => { run.action = { shellCommandAction: {} }; }],
  ['stored history', run => { run.action.userMessageAction.conversationHistory = {}; }],
  ['opaque context parts', run => { run.action.requestContextParts = {}; }],
  ['web search', run => { run.action.userMessageAction.requestContext.webSearchEnabled = true; }],
  ['web fetch', run => { run.action.userMessageAction.requestContext.webFetchEnabled = true; }],
  ['server messages', run => { run.action.userMessageAction.requestContext.sendMessageEnabled = true; }],
  ['non-Chio MCP', run => { run.action.userMessageAction.requestContext.tools[0].providerIdentifier = 'other'; }],
  ['MCP host identifier substitution', run => { run.action.userMessageAction.requestContext.tools[0].name = 'shell'; }],
  ['MCP schema substitution', run => { run.action.userMessageAction.requestContext.tools[0].inputSchemaJson = '{}'; }],
  ['prompt substitution', run => { run.action.userMessageAction.userMessage.text = 'different prompt'; }],
]) test(`rejects ${name} before admission`, () => {
  const object = fresh(); mutate(object.runRequest);
  assert.throws(() => validateInitialRun(protocol, encode(object), expected), /Cursor agent admission refused/);
});

test('rejects unknown and duplicate protobuf fields including nested unknowns', () => {
  const bytes = encode(fresh());
  assert.throws(() => validateInitialRun(protocol, Buffer.concat([bytes, Buffer.from([0xf8, 0x07, 0x01])]), expected), /noncanonical/);
  assert.throws(() => validateInitialRun(protocol, Buffer.concat([bytes, bytes]), expected), /noncanonical/);
  const run = protocol.type('agent.v1.AgentRunRequest').fromJson(fresh().runRequest).toBinary();
  const nested = Buffer.concat([run, Buffer.from([0xf8, 0x07, 0x01])]);
  const size = []; let length = nested.length; while (length > 127) { size.push((length & 127) | 128); length >>>= 7; } size.push(length);
  assert.throws(() => validateInitialRun(protocol, Buffer.concat([Buffer.from([10, ...size]), nested]), expected), /noncanonical/);
});

test('decodes fragmented identity/gzip frames and rejects partial, oversized, duplicate or alternate transport', () => {
  const bytes = encode(fresh());
  for (const compressed of [false, true]) {
    const wire = frame(compressed ? gzipSync(bytes) : bytes, compressed ? 1 : 0);
    const decoder = createInitialRunDecoder(protocol, expected, { encoding: compressed ? 'gzip' : 'identity' });
    assert.equal(decoder.push(wire.subarray(0, 3)), undefined);
    assert.equal(decoder.push(wire.subarray(3, 7)), undefined);
    assert.ok(decoder.push(wire.subarray(7))); decoder.finish();
    assert.throws(() => decoder.push(wire), /multiple/);
  }
  const partial = createInitialRunDecoder(protocol, expected); partial.push(frame(bytes).subarray(0, 10));
  assert.throws(() => partial.finish(), /truncated/);
  for (const path of ['/agent.v1.AgentService/RunSSE', '/agent.v1.AgentService/RunPoll', '/aiserver.v1.AiService/BidiAppend', RUN_PATH + '?bypass=1']) {
    assert.throws(() => createInitialRunDecoder(protocol, expected, { path }), /alternate/);
  }
  const oversized = Buffer.alloc(5); oversized.writeUInt32BE(8 * 1024 * 1024 + 1, 1);
  assert.throws(() => createInitialRunDecoder(protocol, expected).push(oversized), /header/);
  assert.throws(() => createInitialRunDecoder(protocol, expected).push(frame(gzipSync(bytes), 1)), /compression/);
});

test('structurally valid candidate cannot enable authenticated remote Run', () => {
  validateInitialRun(protocol, encode(fresh()), expected);
  assert.throws(requireQualifiedRemoteRun, /no qualified capability-disallow contract/);
});
