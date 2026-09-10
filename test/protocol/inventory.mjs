import { loadCursorProtocol } from '../../bin/cursor-protobuf.mjs';

if (!process.env.CHIO_CURSOR_PROTOCOL_HOST_DIR) throw new Error('Set CHIO_CURSOR_PROTOCOL_HOST_DIR to the pinned public Cursor archive');
const protocol = await loadCursorProtocol(process.env.CHIO_CURSOR_PROTOCOL_HOST_DIR);
const names = [
  'agent.v1.AgentClientMessage', 'agent.v1.AgentServerMessage', 'agent.v1.AgentRunRequest',
  'agent.v1.ConversationAction', 'agent.v1.UserMessageAction', 'agent.v1.UserMessage',
  'agent.v1.ConversationStateStructure', 'agent.v1.RequestContext', 'agent.v1.RequestContextEnv',
  'agent.v1.SystemPromptSpec', 'agent.v1.ExecServerMessage', 'agent.v1.InteractionQuery',
  'agent.v1.InteractionResponse', 'agent.v1.ToolCall',
  'aiserver.v1.BidiRequestId', 'aiserver.v1.BidiPollRequest', 'aiserver.v1.BidiAppendRequest',
];
const schema = Object.fromEntries(names.map(name => [name, protocol.type(name).fields.list().map(field => ({
  number: field.no, name: field.name, jsonName: field.jsonName, kind: field.kind,
  type: field.T?.typeName, oneof: field.oneof?.name, repeated: Boolean(field.repeated),
}))]));
console.log(JSON.stringify({ host: '2026.09.08-6caf4ff', indexSha256: protocol.bundleSha256,
  method: 'Reflection over hash-pinned generated message definitions; CLI entrypoint not executed', schema }, null, 2));
