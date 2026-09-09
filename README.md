# Chio for Cursor

This integration is an **unaccepted candidate** for the six-host Chio program.
The current branch repairs pre-action policy checks and installation packaging.
A restricted macOS CLI launcher adds a default-deny process boundary and kernel
tool discovery. Protected model execution is disabled pending designated
authentication and qualification of a bounded Cursor AgentService relay. Do not use
its status indicator or hook responses as proof that protected effects are mediated.

The VS Code extension provides commands and receipt inspection. Cursor executes
separate hook processes before native tools, reads, shell commands, and MCP calls.
Native file writes use `preToolUse`; `afterFileEdit` cannot prevent a write that
already happened. Hooks use the CLI evaluation path only, because older bridge
versions executed MCP tools from their daemon `check()` path.

Every hook requires an operator-selected absolute `CHIO_BIN` and `CHIO_POLICY`.
Missing or invalid inputs, unavailable CLI, and non-allow decisions produce deny
responses. `failClosed: true` is set on every definition. The CLI operation is a
policy evaluation: host-owned execution after an allow response remains a separate
step. It does not establish capability, budget, approval, or result enforcement.

Use the restricted launcher in [OPERATIONS.md](OPERATIONS.md) for the current
kernel-discovery probe. It requires a scoped kernel session credential; bootstrap
bearers are rejected. The hooks described above remain policy-check diagnostics.

Read [the acceptance record](docs/acceptance-20260909.md) for exact versions,
coverage, evidence, failures, and the remaining delivery gates. Installation,
recovery, and removal instructions are in [OPERATIONS.md](OPERATIONS.md).

## Build and component checks

Use Node 22 or newer. Dependency artifacts and a lockfile must accompany the
candidate; a successful build must not require a private sibling checkout.

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package
```

`dist/hooks/*.mjs` are self-contained bundles copied by `Chio: Initialize workspace`.
They do not load packages from the agent workspace. Initialization preserves other
providers' hooks and backs up the previous configuration before writing an upgrade.
Existing malformed hook configuration is rejected without replacement.

Direct hook tests are component tests. The old `smoke.sh` directly invokes hooks
and is retained only as historical diagnostic material; it does not run a Cursor
agent acceptance session.

## Candidate hook coverage

| Event | Script | Action |
| --- | --- | --- |
| `preToolUse` | `pretooluse.mjs` | Evaluate the full tool request before execution |
| `beforeReadFile` | `composer.mjs` | Evaluate Agent context reads |
| `beforeTabFileRead` | `composer.mjs` | Evaluate Tab context reads |
| `beforeShellExecution` | `shell.mjs` | Evaluate complete shell command and working directory |
| `beforeMCPExecution` | `tool.mjs` | Evaluate tool input and `mcp_server_name` |

The full host payload is retained in the request as `cursor_request` for evaluation.
It is host-supplied metadata, not authenticated identity. The selected CLI's mapping
of tool names and policy fields must be qualified for each supported workflow.

See the authoritative [Cursor hooks contract](https://cursor.com/docs/hooks) and
[CLI configuration](https://cursor.com/docs/cli/reference/configuration). Real host
hook invocation and effect prevention remain unresolved without an authenticated
isolated Cursor profile and the required resource isolation.

The current probe keeps the Chio bridge, kernel credential and durable journal
in its parent process. Cursor sees a single HTTP MCP endpoint with an ephemeral
token. Its actual CLI discovers the four filesystem tools in this mode.
Authenticated model work remains disabled pending the isolated credentials and
bounded hosted-protocol qualification described in OPERATIONS.md.
