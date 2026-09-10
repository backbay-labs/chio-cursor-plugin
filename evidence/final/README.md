# Cursor candidate audit and current blocker

Cursor remains **NOT ACCEPTED**. Confidence: high in the observations below;
full authenticated host enforcement remains unknown. The designated isolated
Cursor subscription login has completed, as recorded in
`cursor-designated-auth-status.json` and the fresh
`contract-recheck-20260910/current-designated-auth-status.json`. Another login
is not the resolving input.
The current blocker is the absence of a verified pre-dispatch restriction for
unsupported server-owned messaging, agent management and PR mutations. The
[2026-09-10 contract recheck](contract-recheck-20260910/README.md) reconfirmed the
installed host and examined the published Cursor SDK allowlist. No authenticated
Run has been forwarded, and no I02-I08 acceptance is inferred.

## Historical candidate artifact observations

The source, kernel and artifact identities below describe the earlier retained
candidate audit. They do not identify the integration program's current kernel
release candidate or establish present host acceptance. Historical failed login
output is preserved as an observation from that earlier run.

Source chain: `b61c42e` (source repairs), `8390851` (self-contained dependency
packaging), `baca0bc` (shipped baseline acceptance record and evidence).
The exact final kernel is recorded in `runtime-provenance.json`: source
`04b7d366d62c886c39bc202f58ef0d44e8f5aee7`, binary SHA256
`e7539855906bd5eb7b4eb2e5a12ca0533889cf61ced3bf4adf5850b792aa6447`.
The final shared bridge source is `68b5c466`.

Final artifact paths and SHA256:

- `/tmp/chio-staged-packaging/chio-cursor-0.3.0.vsix`:
  `2a6a85bb632f5d938035280b21f227c925a73414eb18b9852649d107eaa01c2c`
- `/tmp/chio-staged-packaging/chio-cursor-0.3.0.tgz`:
  `3e908ba202ee53eb9aac4ce26855b44291c27c35244fe2f18e01a7e5517adf14`

The bridge packaging worker independently installed the npm artifact offline
with an empty cache. The VSIX was installed into isolated data/extensions
folders, discovered, uninstalled, checked absent from extension discovery, and
reinstalled using the supported CLI procedures. The final artifact includes its
baseline acceptance record, raw evidence, operations guide, and bundled runtime;
installed runtime bytes match the tested source build (`installed-files.json`).

The real Cursor 3.19.13 extension host activated the packaged extension,
registered its commands, and executed `chio.init`. Initialization preserved the
operator's unrelated hook and copied four standalone hook bundles. This used
Cursor's extension-test mode with workspace trust disabled only in the disposable
activation fixture and autobond off. It was an installation/activation test,
not a protected Agent session. GUI user-data isolation still loads normal
`~/.cursor/hooks.json`; inspection found no workspaceOpen hook, and the activation
test invoked no Agent tools. The protected candidate mode is the separate
OS-fenced CLI launcher, which denies normal-home reads and UNIX sockets.

The final installed package's launcher discovered exactly four MCP tools through
real Cursor CLI 2026.09.08-6caf4ff and the final kernel gateway. The real useful
workflow prompt then stopped at `Authentication required`. An independent
read-only Docker observer of `chio-required-agents-final-20260909` reported that
`cursor-useful.txt` does not exist. This absence is not a denial-prevention pass:
no model tool request was executed.

The final removal procedure also removed only the generated Chio hook entries
and four hook files from the disposable workspace, preserving the unrelated
hook and policy. The final VSIX is reinstalled in the isolated profile for
continuation. The disposable workspace retains only the operator's original
hook until initialization is run again. No normal Cursor configuration was edited.

| Gate | Retained observations and current unresolved work |
| --- | --- |
| I01 | Exact artifacts installed/discovered; packaged extension activation and real gateway discovery observed. Protected session qualification remains incomplete |
| I02 | Blocked by unverified server-action prevention; designated isolated login is verified, but no protected useful model workflow has run |
| I03 | Real host alternate-tool/descendant/delegation/config/network denials unresolved. OS component probes deny normal-home marker and direct Docker socket access |
| I04 | Real host kernel/plugin failure, omission, crash, timeout, malformed response cases unresolved |
| I05 | Real host expiry/revocation/identity/scope/budget/approval cases unresolved |
| I06 | Real host trusted signer/request/result substitution cases unresolved |
| I07 | Real host retry/cancellation/resume/parallel/restart/unknown-outcome cases unresolved; launcher does not expose unsupported lifecycle modes |
| I08 | Candidate installation/upgrade/removal/reinstall and offline npm delivery mechanics observed; production publication and operational acceptance remain open |

Source component checks: typecheck and 29 tests passed, zero skips. These counts
are not host acceptance. Earlier failures, preliminary artifact hashes, and the
installation activation runner/result are retained under `../20260909/`.
