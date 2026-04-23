# Chio for Cursor

Your IDE for the internet of agents. Bond Composer, the Agent tab, inline AI, and every mounted MCP server to a Chio policy you own — enforcement runs as a native Cursor hook, not as a VS Code edit listener.

## Architecture

Cursor exposes two independent plug-in surfaces:

1. **VS Code extension surface** — status bar, sidebar, command palette. This package's `src/extension.ts`.
2. **Cursor hooks surface** — stdin/stdout scripts at `.cursor/hooks.json` that Cursor invokes for every Composer edit, shell command, and MCP tool call. This is the real enforcement path; it fires even when the VS Code event model does not (Composer's multi-file apply bypasses `onWillSaveTextDocument`).

Chio uses both:

- The **extension** gives you observability and ergonomics — bond indicator, sidebar, palette commands, `/chio-init` scaffolding.
- The **hook scripts** at `.chio/hooks/{composer,shell,tool}.mjs` do the real enforcement. They read stdin, call `@chio/bridge` into chio, and emit `{permission: "deny"}` with exit 2 to block.

Docs: <https://cursor.com/docs/agent/hooks>

## Install

```
# Cursor → Extensions → search: chio
```

Then run `Chio: Initialize workspace` (or `/chio-init`) once per repo. That writes:

```
.chio/policy.yaml           # HushSpec 0.1.0; parsed + linted by @chio/bridge
.chio/hooks/composer.mjs    # afterFileEdit + beforeReadFile
.chio/hooks/shell.mjs       # beforeShellExecution
.chio/hooks/tool.mjs        # beforeMCPExecution
.chio/hooks/_lib.mjs        # shared stdio plumbing
.cursor/hooks.json          # registers the scripts
.cursor/settings.json       # chio.* defaults
```

## What each hook enforces

| Cursor event           | Script         | Enforcement                                                  |
|------------------------|----------------|--------------------------------------------------------------|
| `afterFileEdit`        | composer.mjs   | `forbidden_paths`, `path_allowlist.write`, `patch_integrity`, real secret scan |
| `beforeReadFile`       | composer.mjs   | secret scan on file contents before they enter context        |
| `beforeShellExecution` | shell.mjs      | `shell_commands.allow` / `shell_commands.deny`                |
| `beforeMCPExecution`   | tool.mjs       | `ChioBridge.check` against chio's 7-guard pipeline            |

All hooks fail **closed**: any crash, timeout, or policy-load failure denies.

## `.chio/` conventions

Policy lives in `.chio/` in your repo, committed and team-shared:

- `.chio/policy.yaml` — `path_allowlist`, `forbidden_paths`, `shell_commands`, `patch_integrity`, `secret_patterns`, `egress`, `tool_access`. Only first-class HushSpec 0.1.0 rule keys are accepted; `extensions.chio` carries chio-only passthrough config.
- `.chio/hooks/` — the versioned hook scripts (above).
- `.chio/branches/<branch>.yaml` — per-PR attenuation deltas (signed on issue by chio).
- `.chio/evidence/pr-<branch>.bundle.json` — signed PR evidence bundles; every receipt is verified locally before the file is written.

CI runs the same guard pipeline via `chio check` on PRs. Every PR Cursor creates has a signed evidence bundle attached via `gh pr edit` (or, when `gh` is unavailable, a markdown companion with `chio evidence verify` instructions).

## Palette / chat commands

- `/chio-init` — scaffold `.chio/` + `.cursor/hooks.json`
- `/chio-bond` — bond the workspace (mints an AgentPassport, attenuates the capability)
- `/chio-attach-mcp` — discover MCP servers on the mesh, attenuate them, register in `.cursor/mcp.json`
- `/chio-guards` — render the active rule pipeline (reads the live policy, not a hard-coded list)
- `/chio-receipts` — stream receipts from the chio trust plane
- `/chio-attenuate-pr` — tighten the current capability for this branch (`path:`, `tool:`, `budget:`)
- `/chio-pr-evidence` — build + verify + attach the PR evidence bundle
- `/chio-export` — ad-hoc evidence export
- `/chio-revoke` — revoke the bond through the lifecycle registry

## Runtime

Talks to:

- `http://127.0.0.1:8940` — chio trust-control plane (`chio trust serve`)
- `http://127.0.0.1:8931` — chio MCP edge (`chio mcp serve-http`)

Override with `chio.trust.url` and `chio.mcp.url`. Auth via `CHIO_TOKEN` env var (the same token `chio trust serve` was started with).

## Developing

```
npm install
npm run build     # esbuild → dist/extension.js
npm test          # secrets + patch + hooks E2E
npm run typecheck
```

See `VERIFY.md` for build/test output.

## CI

[![ci](https://github.com/owner/chio-cursor-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/owner/chio-cursor-plugin/actions/workflows/ci.yml)

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Runs lint/typecheck (non-blocking in Wave 5.1), unit tests, and a chio-backed smoke pass. Swap `owner/...` once the GitHub org is live.
