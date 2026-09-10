# Agent process boundary review, 2026-09-09

Status: **unresolved acceptance blocker for an untrusted host process**. Confidence: high.

This read-only review covers the shared bridge and the Cursor, Hermes, Pi, and
native OpenClaw candidates. It does not accept any I01-I08 gate. It changes no
runtime, credential, journal, host profile, resource, or other repository.

The current candidates restrict model-visible tools, but retain the original
session-admission bearer inside the host process boundary. The exact Cursor and
Hermes OS profiles permit a process to read that bearer, reach the kernel, and
write the local uncertainty journal. The operator preparation file for another
host is also readable under both profiles. Pi and OpenClaw explicitly trust the
host runtime process: their isolation prevents direct protected resource access,
but does not remove the bearer from that process.

No model-visible arbitrary-code path was demonstrated in the restricted Pi,
Hermes, or OpenClaw profiles. Cursor model execution still lacks designated
authentication. Therefore this report does **not** claim a model prompt bypass.
It establishes that the current design does not enforce the program's stronger
untrusted-agent-process boundary. This distinction matters for I03, I04, I05,
and I07; an absent tool is not an OS privilege boundary.

## Inspected identities

Paths below are relative to `/Users/connor/Medica/backbay/standalone`.

| Component | Worktree and inspected identity |
| --- | --- |
| Cursor | `chio-cursor-plugin/.worktrees/required-agent-integrations-20260909`, HEAD `598d892`; launcher `bin/chio-cursor-protected.mjs` |
| Shared bridge | `chio-bridge/.worktrees/required-agent-integrations-20260909`, HEAD `8402b7a4e6cdce9f5341caabab51b9d7a242ddb8`; gateway SHA-256 `4d25d4437f9ed43d73fc8327e6900e0e0799550072767a08a5d7cbf6ff676d0e`, prepare SHA-256 `2240007723449927e1af1ef5c33944f754227aedda3818eb1e23c0c3a105aa87`, execution SHA-256 `c77ba7fdf5630a9adfab9d4b9e02d0a44c6545a57ef99f1a9d88aa632bf7377f` |
| Hermes | `arc/.worktrees/hermes-required-integration-20260909`, HEAD `e12926172e21e17192d06968d59effae4b6ee99e`; `sdks/python/chio-hermes/src/chio_hermes/restricted.py` SHA-256 `bcaa81980575b1a1f6d67bb3a298598cbc06021176f751895d48d736b0feb7b4` |
| Pi | `chio-pi-plugin`, HEAD `26c0cc1476035635e6804e667e5e261d356fa743`; work in progress included `src/cli.ts`. Reviewed `src/session.ts`, `configured.ts`, `extension.ts`, `bridge-executor.ts`, `uncertainty.ts` |
| OpenClaw | `chio-open-claw-plugin/.worktrees/required-agent-integrations-20260909`, HEAD `e9440c738477cc224c8c3f6257d3d5965cc15fb0`; native package untracked at review. `native/src/index.mjs` SHA-256 `06302396fda47c52f06690ad2e4bf6976517412051c0b3b91036f9cbb3315754`; `plugin.mjs` `02a63ada63acfd4bae592209a26f269cd72376ebeab249379f85805b34529857`; `profile.mjs` `8b33b28f43b24de39fda1f6543ed32919af778df4beecd0a4100b4975e90f453`; `journal.mjs` `bd032d2718ba340a174b5502303b528d05502436f41786431790c808a3e890b0` |

The source and package work continues independently. Later packaging changes
must not silently promote this record to verification of a different boundary.

## 1. Session-admission authority remains inside the host boundary

Shared `src/prepare-gateway.ts:17` authenticates with the operator bearer and
initializes a kernel session. Line 30 copies **the same bearer** into the runtime
configuration alongside the pinned session/capability/subject. Mode 0600 protects
the file from other UIDs; it does not restrict the process running as its owner.

`src/execution.ts:127-141` correctly pins a prepared session and checks its
execution context before dispatch. However, that is a check in the selected
client implementation. A process that can read the bearer can construct an
ordinary request to the same HTTP `/mcp` endpoint without this client.
`src/gateway.ts:27-31` checks private path modes, not a different process identity.

The root program has independently demonstrated the consequence in
`arc/.worktrees/required-agent-integrations-20260909/docs/integrations/acceptance/shared-kernel-qualification-20260909/final/grant-budget/raw.json`:

1. An existing capability exhausts its invocation budget; the original session
   remains denied after restart and the independent observer sees no new file.
2. A new authenticated `initialize` yields a different subject and capability.
3. `budget-new-session` writes `/workspace/budget-new-session.txt`; the independent
   observer records `exists: true`, content `fresh-session-reset`.
4. The retained record explicitly identifies fresh-session issuance as a grant
   quota reset. This is an operator-side test, not a test through these hosts.

The same admission credential is not attenuated to the retained session. Giving
it to an untrusted process therefore gives that process fresh-grant authority.
Per-grant budgets can behave correctly while an integration's intended
identity/budget boundary remains bypassable.

## 2. Exact OS-profile access observations

Both probes launched a Node process using an **existing, unchanged** host SBPL
profile and the same UID as its host. They read existing JSON and emitted only
booleans, mode, and UID. They checked journal write permission with `fs.access`
without writing. They opened and closed a TCP connection without sending HTTP
or any application bytes. No bearer, session token, or credential hash was
printed. No new kernel session or resource operation was attempted.

These probes establish OS permissions for an arbitrary code primitive already
inside the boundary. They do not assert that the model can obtain that primitive
through the current tool registry.

Cursor profile:

```text
/private/var/folders/jy/95wms_mn265f0bpj_v6wc4zh0000gn/T/chio-cursor-protected-7mP1m5/control/profile.sb
```

Its retained host run is recorded in `useful-work.txt` and stopped at Cursor
authentication. The read-only probe used its workspace as cwd. Exit 0; stderr
empty; raw JSON output:

```json
{"probe":"read-only same Cursor OS profile; no model execution","gatewayConfigReadable":true,"bearerPresent":true,"gatewayConfigMode":"600","uid":501,"journalWritableByHost":true,"operatorPreparationConfigReadable":true,"operatorBearerPresent":true,"kernelTcpConnect":true}
```

Hermes profile and configuration:

```text
/tmp/chio-hermes-20260909/seatbelt-useful-4/host.sb
/tmp/chio-final-resource-20260909/hermes-seatbelt-useful-gateway.json
```

This is the profile the Hermes owner identified as its retained real-host useful
run. The read-only probe used `/tmp` as cwd. Exit 0; stderr empty; raw JSON output:

```json
{"probe":"read-only same Hermes OS profile; no model execution","gatewayConfigReadable":true,"bearerPresent":true,"gatewayConfigMode":"600","uid":501,"journalWritableByHost":true,"operatorPreparationConfigReadable":true,"operatorBearerPresent":true,"kernelTcpConnect":true}
```

In both probes, `operatorPreparationConfigReadable` refers to the existing
`/private/tmp/chio-final-resource-20260909/cursor-prepare.json`. This demonstrates
cross-profile operator credential exposure in the current temporary layout.
Hiding the preparation file alone does not remove the copy in gateway config.

Minimal reproduction for either retained profile, with operator-supplied paths:

```sh
/usr/bin/sandbox-exec -f "$RETAINED_SBPL" /opt/homebrew/bin/node -e '
const fs = require("node:fs");
const net = require("node:net");
const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const facts = {configReadable:true, bearerPresent:!!c.execution.bearerToken, uid:process.getuid()};
try { fs.accessSync(c.journalDir, fs.constants.W_OK); facts.journalWritable=true; }
catch { facts.journalWritable=false; }
const u = new URL(c.execution.endpoint);
const socket = net.createConnection({host:u.hostname, port:Number(u.port)||80});
let done=false;
function finish(value) { if(done)return;done=true;facts.kernelTcpConnect=value;socket.destroy();console.log(JSON.stringify(facts)); }
socket.setTimeout(2000);socket.on("connect",()=>finish(true));
socket.on("error",()=>finish(false));socket.on("timeout",()=>finish(false));
' "$RETAINED_GATEWAY_CONFIG"
```

Do not replace this with a session-issuing request against a retained production
profile. The quota-reset effect already has separate designated-test evidence.

## 3. Host-specific reachability and remaining assumptions

| Candidate | Model-facing restriction reviewed | Process boundary actually present | Remaining unsupported assumption |
| --- | --- | --- | --- |
| Cursor | Immutable project MCP definition; four filesystem tools; native shell/read/write/web denied by CLI policy and hooks; subagent hook denies | `bin/chio-cursor-protected.mjs:80` denies normal-home files and Unix sockets, and denies control/config writes. It otherwise allows default; control config remains readable and TCP is allowed | Native host process must be trusted with gateway bearer and writable journal. Hook invocation/enforcement through authenticated model work still unresolved |
| Hermes | `restricted.py:128-167` disables plugins/hooks/tool search and selects only `mcp-chio`; only explicit gateway tool names. Host contract hashes checked | `macos_profile`, lines 80-100, denies home reads/writes with runtime/state exceptions and most Unix sockets; allows default elsewhere. Gateway config explicitly readable; journal writable | Host process must be trusted with bearer/journal and readable temporary operator files. The bounded SBPL is expressly not a comprehensive default-deny sandbox |
| Pi | `session.ts:47-81`: all resource discovery disabled, no native tools, only inline `chio_execute`, inventory assertion; params only tool and arguments | `cli.ts:22-39` and `configured.ts:14-21,54` read the config and instantiate bridge in the same process. No OS sandbox. Resource volume separately owned | Stock Pi runtime/inline extension is trusted code with the operator bearer and all same-UID OS permissions; owner explicitly confirmed this assumption |
| OpenClaw | `native/src/profile.mjs:16-42` rejects native tools/commands/MCP/plugins/automation/runtime overrides; `plugin.mjs:28-54` takes authority from operator context, not tool arguments | Container drops capabilities, has read-only root, UID1000, own writable state volume, readonly config, no protected volume or Docker socket. `native/src/index.mjs:10` reads bearer from process environment | Containerized host code still possesses the bearer. `docker/proxy.mjs:8-17` forwards arbitrary method/body/headers for `/mcp`; it is a fixed-destination proxy, not a session-bound authorization broker |

For OpenClaw, existing independent `native/evidence/20260909/kernel-container-final/host-os-boundary.json`
confirms UID1000, no `/workspace`, and no Docker socket. Its command lacks a
network-denying profile. The final runtime command in `native/test/real-host.mjs:87`
passes `CHIO_KERNEL_TOKEN` into that same container and launches the fixed proxy.
Removing mounts/socket protects direct file access but does not attenuate this
network authority. No additional OpenClaw container was launched for this review.

## 4. MCP configuration and uncertainty fences

No gateway protocol method allows the model to set bearer, endpoint, session,
journal directory, or executable transport. Shared `gateway.ts:169-177` exposes
only initialization metadata, tool listing, and tool calls. Its MCP `initialize`
does not itself initialize a new kernel session. Pi and OpenClaw tool arguments
likewise carry no operator authority field. Treat these as meaningful model
interface restrictions.

At the process boundary, the distinction disappears: Pi reads config into its
own runtime; OpenClaw reads its bearer from its own environment; Cursor and
Hermes spawn the gateway with config readable under the same inherited sandbox.
The process does not need to edit an MCP definition to send HTTP directly.
Cursor's read-only MCP config therefore cannot prevent this authority bypass.

The local fences remain valuable against normal retries and fresh **host**
sessions using the intended launcher. Shared gateway binds its journal to the
authority and fences unknown outcomes. Pi uses `profile/chio`; OpenClaw fences
host+subject+server across host-session resets. However, the process owns their
writable state. It can bypass the client fence using direct HTTP/new request IDs
or abandon the local journal. The read-only probes prove write permission, not
a deletion or redispatch. This review did not test whether the kernel itself
globally fences every distinct request under an unknown subject; such a claim
requires separate kernel evidence. A fresh admission with a fresh subject is
already demonstrated in the root quota test.

## Resolving action

The smallest complete resource-owner boundary must keep session-admission
authority **and the uncertainty ledger** outside the untrusted host's readable
and writable process boundary. Two concrete implementations can use the existing
MCP route:

1. Run the existing retained-session gateway as a trusted service outside the
   agent container/UID. Give the host only access to its narrow tool-call
   interface; do not give it the original bearer, preparation config, raw kernel
   endpoint authority, or gateway journal. Keep its configured authority and
   explicit tool list immutable. The network boundary must prevent reaching an
   unrestricted raw kernel route with reusable credentials.
2. Add resource-owner authentication that exchanges the operator bearer for a
   session-bound handle. The handle must reject fresh `initialize`, replacement
   sessions, subject/grant changes, admin actions, and authority expansion.
   A session-bound handle alone is insufficient for the local uncertainty fence:
   the ledger must also be trusted or its fence enforced at the resource owner.

Neither is implemented or accepted by this report. Moving files from `/tmp` to
mode0700 under the same allowed UID, denying extra model tools, or documenting a
trusted-host assumption cannot independently satisfy the untrusted-process gate.
The root and all affected owners received these findings during the review.
