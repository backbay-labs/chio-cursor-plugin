# Cursor contract recheck, 2026-09-10

Status: **UNRESOLVED**. No I01-I08 gate is closed by this record.
Confidence: high in the reproduced client/source observations; unknown in the
server's rejection semantics and account-specific restrictions.

A fresh real CLI `status --format json` returned exit 0 and
`isAuthenticated: true` using the designated isolated subscription profile.
Only that boolean was retained; account details and credentials were omitted.
Authentication is not the current blocker. The missing boundary is a supported pre-dispatch restriction
for unsupported server-owned messaging, agent management, PR mutation and
remote execution, including delegated, resumed and alternate-transport paths.
The current protected launcher therefore still refuses `--prompt`.

## What was checked

- The [public installer](https://cursor.com/install), fetched without executing
  it, still selects CLI `2026.09.08-6caf4ff`. Its public archive SHA256 remains
  `9c456cc432adc476202a2b09c21a10944fdf484b3ca55dcbf939bbc8ce30dcbe`.
- All 443 files in the existing host runtime lock matched their recorded
  SHA256. Installed GUI metadata reports `3.19.13`. The freshly reflected
  protocol inventory exactly matches the earlier inventory.
- The pinned CLI's actual help and version commands ran in a fresh,
  credential-free profile with all network access denied by `sandbox-exec`.
  `run --help` and `permissions --help` both returned the general help, so
  those invocations do not establish dedicated subcommand contracts.
- The archive contains hidden `agent-cli-local` / `--authless` option text.
  Its stock entrypoint does not inject a local agent runtime. An actual
  `--authless --base-url http://127.0.0.1:9/v1 --print` invocation under the
  same network denial exited 2 with
  `Error: --authless can only be used with agent-cli-local`.
  This is an entrypoint-availability negative control, not a Chio denial test.
- Official CLI [parameters](https://cursor.com/docs/cli/reference/parameters),
  [permissions](https://cursor.com/docs/cli/reference/permissions),
  [configuration](https://cursor.com/docs/cli/reference/configuration),
  [Run Modes](https://cursor.com/docs/agent/security/run-modes),
  [Enterprise](https://cursor.com/docs/enterprise) and
  [model/integration controls](https://cursor.com/docs/enterprise/model-and-integration-management)
  were refreshed. The documented local permissions and MCP allowlists do not
  establish a complete AgentService server-action rejection contract.

## Published SDK lead and its exact limit

The official [TypeScript SDK documentation](https://cursor.com/docs/sdk/typescript)
exposes local `tools` and `disallowedTools` options. The allowlist determines
which built-in tools are offered to the model. Restrictions must be reapplied
on resume; subagents retain separately curated toolsets unless delegation is
disabled. This is a useful concrete contract surface, not a complete pre-effect
server rejection guarantee.

The inspected public artifact is `@cursor/sdk` **1.0.31**:

- [Registry archive](https://registry.npmjs.org/@cursor/sdk/-/sdk-1.0.31.tgz).
- Archive SHA256:
  `6316337f3bf154406d704f00c939031ebaa388031ebfcabde843f74452c02a03`.
- Registry SHA512 integrity and SHA1 both matched the downloaded archive.
- `dist/esm/index.js` SHA256:
  `09d5da1fe1cbba8bcd5af937ddcf6967b6e48170bd52ae744fd0a4b98bcef945`.
- Local executor chunk `dist/esm/357.js` SHA256:
  `6db49240bebc1ac114cbfa800810cd19a0b56316922c2219be5c4a72546dca84`.

The published implementation resolves raw tool names against `ToolCall`, then
maps them to `x-cursor-agent-allowed-tools` and
`x-cursor-agent-exclude-tools` headers. The local executor constructs the same
`agent.v1.AgentService/Run` client and `runRequest`, including the protocol's
remote capability fields. The filter's local consumer constructs request
headers; this inspection did not find a local dispatch-time allowlist check.
A local process and local file executor therefore do not establish a
provider-only model endpoint.

The exact resolving question is whether a supported server rule rejects every
attempted call outside `x-cursor-agent-allowed-tools` **before dispatch**, covers
all server-owned actions, and remains enforced across restart, resume,
alternate transport and delegation. A backend implementation or supported
contract plus designated negative-control observations could resolve this.
The current record does not claim these calls are reachable or exploitable.

No Cursor model run, server message, cloud agent creation or PR mutation was
sent. No production code, package version, candidate archive or normal profile
was changed. Native credential caches were not copied into evidence or a guest. The existing no-Run gate is preserved.

## Evidence and reproduction

`identity-verification.json` records host, GUI and SDK identities.
`local-contract-commands.json` and the stdout/stderr files record the actual
network-denied host invocations. `authless-probe.json` records the failed local
mode selection. These are contract checks, not host acceptance.

`focused-contract-excerpts.json` binds narrow source excerpts to whole-file
hashes and character offsets. `sdk-registry-metadata.json` records the public
package manifest and integrity. The SDK archive and extracted third-party code
remain in `/tmp/chio-cursor-contract-recheck-20260910` for inspection; no private
checkout is required to obtain the artifact.

`primary-source-fetches.json` records the exact fetched URLs, UTC timestamps,
HTTP status, lengths and SHA256. Each `*.raw.gz` is a lossless, mtime-zero gzip
of that public response, so the original body is independently recoverable.
They are retained source snapshots, not claims of upstream immutability.

Reproduce protocol reflection with the hash-pinned public CLI archive:

```sh
CHIO_CURSOR_PROTOCOL_HOST_DIR=/absolute/extracted/host \
  node test/protocol/inventory.mjs
```

Compare the resulting JSON structurally with `protocol-inventory.json`.
`current-designated-auth-status.json` records the fresh authenticated status
check. The earlier result remains separately retained as
`../cursor-designated-auth-status.json`. Historical unauthenticated smoke
failures were not erased or reclassified.
