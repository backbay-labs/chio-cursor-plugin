# Cursor integration acceptance record (2026-09-09)

Status: **NOT ACCEPTED**. I01-I08 remain unresolved. Confidence: high in the
recorded source defects and local command observations; unknown in full real-host
kernel mediation. Controlling program requirement: Chio direction document 19,
planning commit `d1d99f881`, not historical `SMOKE.md` or unit-test counts.

## Pinned baseline

| Component | Identity / observation |
| --- | --- |
| Plugin source before repair | `2621009246ad94a4f8d42c2ca038a1027ba1f105`, package `chio-cursor` 0.2.0 |
| Implementation branch | `codex/required-agent-integrations-20260909` in isolated worktree |
| Installed GUI | Cursor 3.19.13, commit `dd066f332fcea7382764400fde902f61920648d0`, arm64 |
| Downloaded CLI | 2026.09.08-6caf4ff, macOS arm64 |
| CLI archive SHA256 | `9c456cc432adc476202a2b09c21a10944fdf484b3ca55dcbf939bbc8ce30dcbe` |
| CLI archive source | `https://downloads.cursor.com/lab/2026.09.08-6caf4ff/darwin/arm64/agent-cli-package.tar.gz` |
| OS | macOS 26.4, build 25E246, arm64 |
| Existing kernel | `/usr/local/bin/chio`, version 0.1.0; `check` is evaluation-only, no capability argument |
| Existing bridge source | `f0f21945484b3e2a9ed79a5b2063bda98754ac80`, package 0.2.2 |
| Existing bridge dependency | `file:../chio-bridge`, unpublished sibling required; public npm lookup returned Not found |
| Existing SDK declaration | bridge depends on `@chio-protocol/sdk` `^0.1.0`; not an accepted host pin |
| Authentication | No CURSOR_API_KEY in task environment; isolated CLI reports Not logged in |
| Isolated profile | `/tmp/chio-cursor-20260909/profile` using documented `CURSOR_CONFIG_DIR` |
| Isolated data/workspace | `/tmp/chio-cursor-20260909/data`, `/tmp/chio-cursor-20260909/workspace` |

No normal Cursor settings, credentials, extensions, or workspace files were changed
by the host probes. A later discovery probe established that CURSOR_CONFIG_DIR
alone does not isolate user-level MCP configuration; the restricted launcher
therefore denies normal-home access at the OS boundary. The downloaded CLI was extracted directly in the disposable
location after inspecting the upstream installer; its installer was not run.

## Verified contract and gaps

Authoritative sources checked 2026-09-09:

- [Hooks](https://cursor.com/docs/hooks): generic `preToolUse`, separate Tab hooks,
  explicit fail-closed configuration, command-text shell matchers, and managed
  configuration sources. `afterFileEdit` is a post-effect notification.
- [CLI configuration](https://cursor.com/docs/cli/reference/configuration): isolated
  configuration directory, permissions, sandbox options, and global/project split.
- [CLI permissions](https://cursor.com/docs/cli/reference/permissions): read, write,
  shell, web fetch, and MCP permissions. These are host policy, not a resource ACL.
- [CLI installation](https://cursor.com/docs/cli/installation): public distribution.
- [Cloud agents](https://cursor.com/docs/cloud-agent): early exploratory reads can
  precede hook loading. Cloud hooks do not establish complete sensitive-read coverage.

The installed binary's `--help` independently exposes print-mode tools, sandbox,
resume, continue, persist, MCP, plugin, worktree, and cloud-worker modes. Loading and
enforcement of hook contracts in an authenticated session are **not verified**.

## Action inventory and resource ownership

No mode is currently accepted. The target useful workflow remains editing, reading,
and testing source plus mediated external tool access. Excluding reachable tools
from this table would not resolve their bypasses.

| Path / mode | Effect owner and candidate enforcement | Remaining gap |
| --- | --- | --- |
| Agent / Composer / Cmd+K native writes | Cursor filesystem executor; `preToolUse` before Write/Edit | Verify real write suppression; independent filesystem boundary absent |
| Agent native reads, search, glob, context | Cursor and model context; generic hook and beforeReadFile | Verify all read/search/context routes, attachments, indexes, cached context |
| Tab inline context | Cursor Tab service; beforeTabFileRead | Verify blocking and cache behavior |
| Tab inline writes | Cursor editor; afterTabFileEdit is after effect | No documented pre-write Tab hook; disable through enforced supported profile or isolate resource |
| Shell and git | Host shell; generic and shell hooks | A command precheck cannot confine shell indirection, descendants, git helpers, or network |
| Shell descendants/background tasks | OS child processes, potentially surviving host/kernel | Must inherit resource confinement; cancellation/restart cutpoints unverified |
| Native web fetch/search/network | Host networking or provider backend; generic hook candidate | Verify execution location and deny direct protected destinations |
| MCP/custom tools | Configured MCP server owns effects; generic and MCP hook | Server must enforce kernel capability at execution; precheck alone is insufficient |
| Delegation / Task/subagents | Cursor nested agent loop; generic Task hook and subagentStart contract | Child identity, authority, inherited hooks, and effect boundary unverified |
| CLI resume/continue/persist | Cursor session store and restarted executor | Verify fresh admission, no unknown-outcome redispatch, cancellation, parallel calls |
| GUI resumed sessions | Cursor persisted context and executor | Authenticated session unavailable; stale context and configuration coverage unresolved |
| Cloud/background agent/self-hosted worker | Remote execution environment or cloud worker | Early read stage lacks hooks; not acceptable for sensitive resources as configured |
| Plugin/hook/config modifications | Same OS user can write workspace hooks and policy | Explicit operator paths reduce accidental selection only; ACL/VM boundary still required |
| Native manual editor/terminal routes reachable by agent | Cursor/OS | Must remove or confine consequential alternate routes in supported mode |

The required external boundary must make protected resources, unrestricted authority credentials,
policy, and enforcement code inaccessible to direct host access, with a kernel-bound
resource executor as the only effect route. The restricted macOS launcher now adds normal-home and UNIX-socket denial and
uses the separate kernel gateway for resources. Its complete behavior remains
unqualified through an authenticated host; same-user workspace hooks alone are
not that boundary. No blanket-deny mode is counted as a
useful integration, and no unsupported path is silently removed from acceptance.

## Executed observations

| Case | Observation | Result |
| --- | --- | --- |
| CLI version/help | Official artifact executes and reports pinned identity and commands | Baseline only |
| Isolated `agent status` | `Not logged in` | Required authentication unavailable |
| Real CLI useful-work request | `Authentication required`; host exits before tools | I02 unresolved, not a denial pass |
| Independent file observer | `useful-work.txt` absent after attempted host request | No host tool execution occurred; not proof of enforcement |
| Source regression components | Pre-action template, no local allow without policy/binary, invalid input, upgrade preservation | Component evidence only; see retained output |
| Legacy smoke | Inspected; direct hook invocations, VS Code stub, fixed temporary paths, sibling harness | Not run; cannot establish host acceptance |

Raw output: [authentication](../evidence/20260909/cli-auth-status.txt) and
[useful-work attempt](../evidence/20260909/cli-useful-work.txt).

## Required gate ledger

| Gate | State | Exact missing evidence |
| --- | --- | --- |
| I01 installation/version | Unresolved | Candidate packaged install/discovery/activation plus compatible accepted kernel/SDK combination |
| I02 useful workflow | Blocked by remote enforcement contract; isolated subscription login now verified | Upstream-enforced restriction of unsupported server actions; bounded relay and actual write/read/test/MCP effects |
| I03 denial/bypass | Unresolved | Independent resource boundary; real host paths, descendants, delegation, network/config tampering |
| I04 failure behavior | Unresolved | Authenticated missing/killed/malformed kernel cases; hook crash, timeout, omitted configuration; subsequent effect observer |
| I05 authority | Unresolved | Capability identity/session/resource binding, expiration/revocation, aggregate budgets, pending/rejected approvals |
| I06 evidence | Unresolved | Trusted signer and complete caller/request/result binding; reject substitution and forgery |
| I07 recovery | Unresolved | Retry/cancel/resume/parallel/restart, unknown outcome handling and fencing where applicable |
| I08 delivery | Unresolved | Qualified public artifacts and independent installation, upgrade/recovery/removal; measured overhead |

Do not publish a protected-mode acceptance claim until the gate ledger is complete.


## Restricted gateway candidate progress

The following table records the earlier candidate. Its allow-default OS profile
and bootstrap bearer configuration have been superseded; these results do not
accept the current boundary.

`bin/chio-cursor-protected.mjs` creates a new temporary profile/data/workspace,
uses the packaged `dist/gateway.mjs`, denies native Read/Write/Shell/WebFetch,
blocks unsupported generic tools and delegation, and permits only the four
configured Chio MCP tools. The generated MCP definition, hooks, policy script,
and CLI permissions are immutable to the sandboxed host. The host cannot read
normal-home MCP/hook configuration or connect to UNIX sockets. The model API
credential is the only inherited task credential. The launcher exposes no CLI
resume/persist/cloud/extra-plugin flags; GUI and Tab are outside this candidate
mode. This remains a proposed mode until real-host I01-I08 pass.

Additional observations:

| Case | Result and limit |
| --- | --- |
| Initial custom-profile MCP discovery | Not found: the CLI reads normal-home and project mcp.json, not profile/mcp.json |
| Initial OS sandbox with inherited evidence file descriptors | Cursor Node 26 aborted; fixed by piping child stdout/stderr through the unsandboxed operator launcher |
| Unapproved project gateway | Real CLI rejected unapproved chio server |
| Supported approval and gateway discovery | `agent mcp enable chio` succeeded; real CLI listed exactly four configured tools |
| UNIX-socket-fenced discovery | Same four tools discovered with normal-home access and UNIX sockets denied |
| Useful gateway workflow | Real host exited with Authentication required; independent read-only Docker observer reported no cursor-useful.txt |
| OS normal-home marker probe | Controlled read rejected with Operation not permitted |
| OS Docker bypass probe | Explicit unix:///var/run/docker.sock connection rejected with permission denied |
| Preliminary VSIX | Installed and discovered as chio.chio-cursor@0.3.0 in isolated GUI directories; runtime activation and final-artifact qualification remain open |
| Original policy schema | Shipped CLI rejects shell allow/default and patch max_files; template schema repaired |
| Native Write policy component | Intended allowed Write request still denied by selected CLI path-allowlist; mapping/qualification remains open. This evaluation-only route is not the gateway execution mode |

Evidence: [fenced gateway discovery](../evidence/20260909/protected-gateway-discovery-fenced.txt),
[real useful attempt](../evidence/20260909/protected-useful-work.txt),
[independent resource observer](../evidence/20260909/protected-useful-work-observer.txt),
[OS components](../evidence/20260909/os-boundary-components.json), and
[preliminary VSIX install](../evidence/20260909/vsix-install-preliminary.txt).
The preliminary VSIX SHA256 was
`80b5a55157e8229d7c4324317bd58d0c0dcf9284118284fdb52840ea704db778`.
It must be replaced and requalified after the shared gateway recovery fix.

## Process boundary repair

The read-only review in `evidence/final/BOUNDARY-REVIEW.md` demonstrated that the
earlier Cursor and Hermes profiles could read runtime bootstrap bearers and
cross-host operator preparation files, write journals, and contact the kernel.
Private same-UID modes were insufficient to establish process isolation.

The current Cursor launcher uses a default-deny Seatbelt profile and requires a
bounded, session-scoped kernel credential. It copies only the execution and
scope fields needed by the gateway. Reads are restricted to the exact 443-file
Cursor runtime lock, explicit Node libraries, narrow OS paths, own scoped config,
and own state. Broad `/System` access is absent because that path includes the
Data-volume alias. Writes to control files and hardlinks are denied. Node and
the shell needed for hooks can execute; other executables are denied, and the
same process boundary applies to descendants. Only the explicit kernel loopback
TCP port is allowed. Kernel durable owner fences remain required because the
host can mutate its own local journal.

`test/protected-boundary.test.mjs` executes real macOS process probes and independent
network observers. Its three cases passed with zero skips on the qualification
machine: own state/config work; operator direct/alias/symlink reads, control
writes, hardlinks, unapproved execution, and unrelated TCP fail. These are
component/process-boundary results, not real-model I02-I07 acceptance.

The actual pinned Cursor CLI approved the single gateway and discovered exactly
four tools under this new profile using the aggregate pre-ACK kernel on port
58486. Kernel binary SHA-256:
`d0b87623cb3dd227f79cd3178b32bb04e35b48ddcb9dab63c6598d79b8e13b66`.
The first attempt exposed an OpenSSL config dependency because the MCP child
does not inherit all host environment fields. Setting the immutable MCP
`OPENSSL_CONF=/dev/null` fixed discovery without expanding filesystem access.
The exact retained discovery profile also passed a read-only probe: own scoped
config readable; earlier operator preparation file, Data alias, and another host
config denied with `EPERM`. Raw records are in
`evidence/final/default-deny-host-discovery.txt` and
`evidence/final/default-deny-real-profile-probe.json`. These pre-ACK runtime
results require a final scoped bridge/kernel/artifact rerun before delivery.

Protected `--prompt` is disabled while the Cursor agent protocol remains
unqualified. The installed host's documented `--endpoint` routes to
`https://api2.cursor.sh` by default. Its shipped `agent.v1.AgentService` supports
Run, RunSSE and RunPoll. AgentRunRequest includes `can_create_cloud_subagents`;
the protocol includes web fetch/search and other action variants whose execution
boundary still needs verification. A
fixed-destination generic proxy would not demonstrate complete mediation of
those actions. The resolving work requires designated authentication, a bounded
operator relay with verified streaming behavior, and real-host evidence that
unsupported hosted actions cannot escape the protected boundary. No synthetic
provider or direct API call is being counted as that evidence.

## Parent HTTP boundary repair

The earlier default-deny probe still placed its scoped kernel credential and
journal inside the guest. The current launcher removes both: the parent starts
the bundled HTTP gateway, and Cursor receives only an ephemeral route token.
The SBPL permits only that parent port, not the kernel. Journal access is no
longer allowed. The actual pinned CLI successfully approved the HTTP MCP server
and discovered all four configured tools. No protected resource operation or
authenticated model request was performed by this discovery test.

The component suite passes 32 cases without skips, including actual macOS
process/descendant probes with independent positive/negative TCP observations.
Build and typecheck pass. The former kernel and local-journal permissions in
earlier sections are historical and do not describe this candidate. The
previous boundary review is preserved for its exact source identities.

Upstream HTTP URL, headers and environment interpolation were rechecked against
[official Cursor MCP documentation](https://cursor.com/docs/mcp). This contract
does not establish the safety of AgentService hosted actions. Protected prompt
mode still refuses before launch, and I01-I08 acceptance remains unresolved.

## AgentService contract investigation

The source review now covers the pinned generated protocol and actual Run
construction. Its reproducible inventory is
`evidence/final/cursor-protocol-inventory.json`; the interpretation and external
dependency are recorded in `evidence/final/CURSOR-AGENT-SERVICE-CONTRACT.md`.
The installed `index.js` SHA256 is
`f7875cfc3bd084d5105c579f1dd21aa77561d72bc2a528cdb70219636186bc79`.

The new parser validates only a fresh initial Run frame. It rejects alternate
transports, unknown/duplicate protobuf fields, resume/history, cloud/web flags,
credential overrides, and tool/prompt/model substitutions. There is no upstream
forwarder, and the executable entry refuses `--prompt` before opening a host or
operator configuration. The fixtures use the real generated message schemas;
they are not live server or model evidence.

The pinned-protocol suite passed 22 cases; the ordinary component suite passed
33 cases; both had zero skips. Typecheck passed. Raw output is retained in
`evidence/final/cursor-agent-admission-tests.txt`,
`evidence/final/cursor-protocol-component-suite.txt` and
`evidence/final/cursor-protocol-typecheck.txt`.

No backend contract establishing that normal CLI Run cannot dispatch unsupported
server-owned actions has been found. Schema presence does not prove that such an
action is reachable, and absence of a local approval message does not by itself
prove an exploitable path. Reachability and pre-effect prevention remain unknown.
An authenticated session alone does not resolve this gap. Required next input is
a Cursor-enforced capability/deployment contract covering the enumerated actions,
followed by negative-control tests through the real host and independent effect
observers. The current unaccepted candidate retains its closed execution gate.

The designated isolated subscription login subsequently completed. A real
`cursor-agent status` call confirmed authentication with exit code 0. The record
`evidence/final/cursor-designated-auth-status.json` retains only that boolean and
the command, omitting account identity and credentials. Native auth cache remains
only in the operator-owned HOME; it was not copied into a guest or evidence.
Historical not-logged-in observations above remain baseline facts, not the
current blocker. No authenticated Run has been forwarded by this candidate.
