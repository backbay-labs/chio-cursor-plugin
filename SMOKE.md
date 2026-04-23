# SMOKE — chio-cursor-plugin live test

End-to-end smoke-test against a real arc daemon (no mocks). Clone of
`chio-test-harness` on isolated ports trust=8946 / mcp=8937.

Runtime: ~9 seconds (well under the 5-minute budget).
Idempotent: passes twice in a row without reset.
Total assertions: 23 across 17 steps (0–16).

Run:

```
./smoke.sh
# logs land in smoke-results/latest.log (gitignored)
```

## Claim-vs-proof

| Plugin claim | Proof (step) | Evidence |
|---|---|---|
| `.chio/policy.yaml` parses + lints via `ChioBridge.lintPolicy` | 1 | `{"errors":0,"warnings":0}` on the template policy |
| `.cursor/hooks.json` contract wires all four Cursor events | 2 | Written to workspace with absolute paths; `JSON.parse` round-trips |
| Real arc daemon reachable (trust + mcp) | 3 | `wait-ready.sh` confirms `/health` + MCP `initialize` session |
| `bond()` returns a real `did:arc:` from the trust plane | 4 | `did:arc:4a63...9eb8` (signed AgentPassport, lifecycle registry record) |
| `afterFileEdit` allows clean writes inside `path_allowlist` | 5 | exit 0, `{"permission":"allow"}` |
| `afterFileEdit` denies on AKIA AWS key | 6 | exit 2, `agent_message` contains `secrets_scan: 1 finding(s) — aws.access_key` |
| `afterFileEdit` denies on `forbidden_paths` (`.env`) | 7 | exit 2, `forbidden_paths: .env matches **/.env` |
| `afterFileEdit` denies on `patch_integrity.max_additions` | 8 | exit 2, `patch_integrity.max_additions: +200 > 50` |
| `beforeReadFile` denies context-leaking secrets | 9 | exit 2, `secrets_scan` reason |
| `beforeShellExecution` respects `shell_commands.allow` | 10 | `npm test` allowed |
| `beforeShellExecution` blocks via `shell_commands.deny` | 10 | `rm -rf /var/log` denied; matches `rm -rf *` |
| `beforeMCPExecution` routes allow via real arc | 11 | `echo` returns `permission: allow` through the edge |
| `beforeMCPExecution` routes deny via real arc | 11 | `delete_file` denied: `requested tool delete_file on server hello-mcp is not in capability scope` |
| Every allow/deny emits a real receipt, ed25519-verifiable | 11 | 3 receipts in the store, 3/3 verify via `ChioBridge.verifyReceipt` |
| `wrapMcp` spawns `arc mcp serve-http` and parses real banner | 12 | Returns `http://127.0.0.1:51632/mcp` with a stable `serverId` |
| `attenuate-pr` writes `.chio/branches/<branch>.yaml` with a subset scope | 13 | Wide cap: `{grants:[fs/write/invoke]}`; narrow cap: adds `PathPrefix: ./docs/` constraint |
| PR evidence bundle: every receipt verifies before write | 14 | 3/3 verified, 0 failed; markdown fallback written (no `gh`) |
| VS Code extension bundle activates without throwing | 15 | `require('./dist/extension.js')` exposes `activate` + `deactivate` functions |
| Clean teardown, no orphans from our smoke | 16 | `stop.sh` kills both pids; `pgrep` on our SMOKE_DIR path returns empty |

## Plugin patches

Two real bugs surfaced by the smoke, both patched:

- `hooks-src/composer.mjs` (`toRel`, `checkPatchInline`) — the inline
  checker stripped a leading `/` from absolute file paths and glob-matched
  the stripped form against `./src/**`, producing `tmp/.../src/ok.ts`
  which never matched. Fix: thread `workspace_roots` through and strip
  the containing root to produce `src/ok.ts`.
  - file:lines `hooks-src/composer.mjs:118-124` (new `workspaceRoots`
    plumbing), `hooks-src/composer.mjs:224`, `hooks-src/composer.mjs:276-291`
- `src/chio/evidence.ts` (`extractReceipts`) — the real
  `/v1/evidence/export` response nests receipts under
  `bundle.toolReceipts[].receipt`, not at the top level. The previous
  implementation picked the first top-level array and returned an empty
  list, which silently reported `count: 0`. Fix: recursive harvest that
  unwraps `{seq, receipt}` pairs and dedupes by id.
  - file:lines `src/chio/evidence.ts:97-135`

## Bridge surface deltas surfaced by the smoke

The bridge's `IssueCapabilityInput` does not forward `subjectPublicKey`,
and the bridge's `attenuateCapability` posts to
`/v1/capabilities/<id>/attenuate` (returns 404 on the current trust
plane; the real surface is `POST /v1/capabilities/issue` with a narrower
scope, since `/v1/capabilities/attenuate` is not mounted in this arc
build). The smoke works around both via direct wire-level POSTs in step
13 and documents the gap. These are candidates for a follow-up bridge
PR.

## Live transcript excerpt (≤50 lines)

```
==> chio-cursor-plugin smoke: smoke-results/smoke-20260420-213518.log
----- step 3: start harness and source env -----
[start] wait-ready: trust plane /health OK at http://127.0.0.1:8946
[start] wait-ready: MCP edge initialize OK at http://127.0.0.1:8937
[start] READY
  CHIO_TRUST_URL=http://127.0.0.1:8946
  CHIO_MCP_URL=http://127.0.0.1:8937
----- step 4: bond and persist DID -----
  bonded DID: did:arc:4a6383319640254b371e16a42cc14fdfb75b948f005903ad6b97184cd8c79eb8
  assert ok [bond returned did:arc:]: matches ^did:arc:
----- step 5: afterFileEdit happy path -----
  exit=0 out={"permission":"allow"}
----- step 6: afterFileEdit denies on embedded AKIA secret -----
  exit=2 out={"permission":"deny","user_message":"Chio denied leak.ts: secrets_scan: 1 finding(s) — aws.access_key","agent_message":"secrets_scan: 1 finding(s) — aws.access_key"}
----- step 7: afterFileEdit denies on forbidden path (.env) -----
  exit=2 out={"permission":"deny","user_message":"Chio denied .env: forbidden_paths: .env matches **/.env"}
----- step 8: afterFileEdit denies on patch_integrity max_additions -----
  exit=2 out={"permission":"deny","agent_message":"patch_integrity.max_additions: +200 > 50"}
----- step 10: beforeShellExecution allow + deny -----
  allow exit=0 out={"permission":"allow"}
  deny  exit=2 out={"agent_message":"shell_commands.deny: rm -rf *"}
----- step 11: beforeMCPExecution real arc routing -----
  echo exit=0 out={"permission":"allow"}
  delete_file exit=2 out={"agent_message":"deny: requested tool delete_file on server hello-mcp is not in capability scope"}
  receipts: {"count":3,"verified":3}
----- step 12: MCP mesh: wrapMcp + discoverMcpServers -----
  mesh: {"initialCount":0,"wrapped":{"url":"http://127.0.0.1:51632/mcp","serverId":"chio-smoke-wrap","listen":"127.0.0.1:51632","toolCount":1}}
----- step 13: per-PR attenuation -----
  attenuation: {"origCap":"cap-019dadac-9cd8-...","attnCap":"cap-019dadac-9cea-...","newScope":"{...constraints:[{type:path_prefix,value:./docs/}]}"}
----- step 14: PR evidence bundle -----
  evidence: {"count":3,"verified":3,"failed":0}
  assert ok [all receipts verified]: 3 == 3
----- step 15: VS Code extension imports without throwing -----
  function function
----- step 16: teardown -----
[stop] stop.sh: stopping mcp (pid 88946)
[stop] stop.sh: stopping trust (pid 88945)
==> all 17 steps passed
==> SMOKE PASSED
```
