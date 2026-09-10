# Cursor AgentService admission investigation

Status: **UNRESOLVED**, not I02-I08 acceptance. Reviewed 2026-09-09.
Confidence is high in the pinned wire-schema facts below, unknown in server-side
reachability and enforcement. No authenticated Run was sent by this investigation.
The designated login is managed separately by the program owner and was not changed.
It has now completed, and an independent real CLI status-only call confirmed
authentication. The redacted fact record is `cursor-designated-auth-status.json`.
No native cache was copied or included in the guest or evidence.

## Source identity and method

- CLI: `2026.09.08-6caf4ff`, macOS arm64.
- Public archive SHA256:
  `9c456cc432adc476202a2b09c21a10944fdf484b3ca55dcbf939bbc8ce30dcbe`.
- Source: `https://downloads.cursor.com/lab/2026.09.08-6caf4ff/darwin/arm64/agent-cli-package.tar.gz`.
- `index.js` SHA256:
  `f7875cfc3bd084d5105c579f1dd21aa77561d72bc2a528cdb70219636186bc79`.
- Host extracted at `/tmp/chio-cursor-20260909/host` for this investigation.

`bin/cursor-protobuf.mjs` checks the installed `index.js` against the committed
runtime lock. It loads generated message definitions after replacing the unique
CLI entrypoint call in memory. It never starts the CLI entrypoint or modifies the
archive. `test/protocol/inventory.mjs` emits field names, tags, referenced types
and oneof membership as `cursor-protocol-inventory.json`. No credential or profile
is read by this procedure.

Reproduce from this source checkout with the pinned public archive:

```sh
CHIO_CURSOR_PROTOCOL_HOST_DIR=/absolute/extracted/host \
  node test/protocol/inventory.mjs
CHIO_CURSOR_PROTOCOL_HOST_DIR=/absolute/extracted/host \
  node --test test/protocol/agent-admission.test.mjs
npm test
npm run typecheck
```

## Observed wire contract

| Element | Observed shape and consequence |
| --- | --- |
| `AgentService/Run` | Bidirectional stream of `AgentClientMessage` and `AgentServerMessage`; not a plain model-completion endpoint |
| Fresh action | Client field 1 `run_request`, Run field 2 `action`, Action field 1 `user_message_action`, then user message and request context |
| `RunSSE` | Receives `BidiRequestId`, not the initial Run protobuf |
| `RunPoll` | Receives `BidiPollRequest` with request ID and start flag |
| `BidiAppend` | Separate request contains binary message data or its hexadecimal string representation plus ID and append sequence; a filter on Run alone does not cover this transport |
| Tool inventory | `request_context.tools` carries MCP descriptors; headless Run construction can leave `mcp_tools` empty |
| Initial cloud flags | Run tags 21 `can_create_cloud_subagents`, 23 `client_supports_send_to_user`, 32 `started_as_new_project` |
| Initial context flags | Context tags 17 `web_search_enabled`, 24 `web_fetch_enabled`, 50 `search_conversations_enabled`, 51 `send_message_enabled` |
| Prompt override | `SystemPromptSpec` supports replacement/append strings, not a structured server tool capability allowlist |
| Web search | An InteractionQuery/InteractionResponse approval pair exists; backend ordering and whether refusal is an authoritative pre-effect restriction remain unverified |
| Web fetch | Interaction query and allowlist precheck variants exist, including a `skip_approval` input; an eventual relay must not treat that input as authority |

The following `ToolCall` variants have no corresponding client `ExecServerMessage`
or `InteractionQuery` variant in this pinned schema:

| Tag | Variant |
| --- | --- |
| 48 | `communicate_update_tool_call` |
| 50 | `update_pr_code_tour_tool_call` |
| 52 | `edit_pr_labels_tool_call` |
| 55 | `send_message_tool_call` |
| 56 | `fetch_cloud_agent_data_tool_call` |
| 58 | `send_to_user_tool_call` |
| 74 | `send_to_agent_tool_call` |
| 76 | `create_agent_tool_call` |
| 77 | `stop_agent_tool_call` |

This comparison identifies an unresolved server-owned execution boundary. It does
not prove these variants are reachable in a normal local CLI session. They may be
restricted by an upstream deployment, authenticated account scope, or server
session type. The client archive does not establish those restrictions. Receiving
and dropping a ToolCallStarted/ToolCallCompleted notification cannot establish
that an original remote effect was prevented.

## Authoritative documentation checked

The official [CLI permissions documentation](https://cursor.com/docs/cli/reference/permissions)
defines Shell, Read, Write, WebFetch and MCP permission tokens with deny precedence.
It does not specify a complete server-owned tool capability contract for Run.

Official [Run Modes](https://cursor.com/docs/agent/security/run-modes) controls
apply to local agents; Cloud Agents use their own machines and do not request
per-action approval. Local approval configuration therefore cannot be assumed to
constrain a cloud execution path.

Official [subagent documentation](https://cursor.com/docs/subagents) places the
documented cloud-subagent UI in the desktop Agents Window. Cloud subagents use
team-configured MCP servers rather than a local session's MCP configuration.
That documented UI scope does not establish whether a malicious client may enable
the wire variants in a CLI-authenticated Run.

Official [Enterprise controls](https://cursor.com/docs/enterprise) include
restricting which users may create Cloud Agents. No account-specific policy was
inspected here, and disabling Cloud Agent creation alone would not prove all
listed messaging and PR mutation variants are disabled.

## Implemented admission component and its limits

The parser rejects any route except Run; compressed input is limited to bounded
gzip. It rejects unknown/duplicate/noncanonical protobuf fields, malformed or
oversized framing, multiple initial messages, cloud/web enable flags, opaque
history, resume actions, credential overrides, prompt replacements, non-Chio MCP
descriptors and substituted identities. Expected model, prompt, workspace, run
identity and exact host tool identifier/schema come from the operator binding.

Only fresh initial-frame admission is implemented. Subsequent duplex messages,
real authentication headers, server response admission, cancellation, retry,
stream shutdown and the upstream capability restriction are not qualified.
There is deliberately no HTTP server or authenticated forwarding path here.
`requireQualifiedRemoteRun()` always throws, and the actual launcher calls it
before opening host/configuration paths when `--prompt` is selected. Its process
test verifies this refusal with nonexistent paths and zero child output.

The parser fixtures use the actual hash-pinned generated schemas but synthetic
requests. They prove structural rejection only. Existing discovery and OS probes
likewise do not establish useful model work or remote effect suppression.

## Exact resolving input and next action

An authoritative Cursor server contract or verified deployment/account policy
must make unsupported server actions unavailable **before dispatch** for this
authenticated local Run mode. It must cover messaging, cloud/agent management,
PR mutation, web/remote execution and any equivalent path, including stored
history, alternate transport, resume and delegation. A server capability allowlist
or explicit client approval handshake with documented pre-effect semantics could
provide that boundary; feature flags alone are insufficient evidence.

After that dependency is available, finish the bounded duplex relay, retain
subscription credentials only in its operator parent, and test real host useful
work plus denial/negative controls using independent local and remote observers.
If the upstream cannot provide a supported pre-effect restriction, this host
cannot pass the required protected mode with the current AgentService surface.
No acceptance gate is closed by this investigation.
