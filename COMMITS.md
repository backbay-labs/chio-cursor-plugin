# COMMITS.md — chio-cursor-plugin

Cursor plug-in. Uses **both** plug-in surfaces: a VS Code extension
for status bar + palette + sidebar, and Cursor-native hook scripts at
`.cursor/hooks.json` for the real enforcement path (fires even when
the VS Code event model doesn't). Ships to the VS Code Marketplace
as a VSIX. Target first ship tag: `v0.2.0`.

---

## 1. chore: scaffold VSIX package with esbuild and vsce prep

**Body.** `package.json` with `publisher: "<VSCE_PUBLISHER>"`,
`engines.vscode`, activation events, and the `contributes` block
(commands, views, configuration). `esbuild.config.mjs` for the
extension entry bundle, `tsconfig.json`, `LICENSE`, `.vscodeignore`
(excludes source + tests from the VSIX), `.gitignore`, `bun.lock`.
Wave 1.

**Files.**

- `package.json`, `package-lock.json`, `bun.lock`
- `esbuild.config.mjs`
- `tsconfig.json`
- `LICENSE`, `.gitignore`, `.vscodeignore`

---

## 2. feat: extension surface — status bar, sidebar, palette, /chio-init

**Body.** `src/extension.ts` activates on startup, on
`.chio/policy.yaml`, on `.cursor/settings.json`, or on
`.cursor/hooks.json`. Surfaces bond status in the status bar
(`src/statusbar.ts`), receipt stream in the sidebar
(`src/sidebar.ts`), and the `/chio-*` palette commands in
`src/commands/`. `/chio-init` scaffolds `.chio/policy.yaml`,
`.chio/hooks/*.mjs`, `.cursor/hooks.json`, and `.cursor/settings.json`
from the `templates/` directory. Wave 1 rewrite against the host
schema.

**Files.**

- `src/extension.ts`
- `src/statusbar.ts`
- `src/sidebar.ts`
- `src/commands/*.ts`
- `src/chio/*.ts` — bridge construction + receipt stream subscription.
- `templates/` — `.chio/hooks/*.mjs`, `policy.yaml`, `hooks.json`,
  `settings.json` scaffolding.

---

## 3. feat: Cursor hook scripts enforce on composer, shell, and MCP

**Body.** Three fail-closed hook scripts emitted to
`.chio/hooks/{composer,shell,tool}.mjs`. `composer.mjs` handles
`afterFileEdit` (enforces `forbidden_paths`, `path_allowlist.write`,
`patch_integrity`, real secret scan) and `beforeReadFile` (secret
scan on ingested file contents). `shell.mjs` handles
`beforeShellExecution` (`shell_commands.allow` / `deny`). `tool.mjs`
handles `beforeMCPExecution` (full `ChioBridge.check` against chio's
7-guard pipeline). All emit `{permission: "deny"}` with exit 2 to
block. Per <https://cursor.com/docs/agent/hooks>. Wave 1.

**Files.**

- `hooks-src/composer.ts`
- `hooks-src/shell.ts`
- `hooks-src/tool.ts`
- `hooks-src/_lib.ts`

---

## 4. test: secrets, patch integrity, and hook E2E

**Body.** Unit tests cover secret pattern detection, patch
integrity validation, and the composer/shell/tool hook JSON
contracts. `smoke.sh` boots `chio-test-harness`, loads the
`templates/policy.yaml`, and exercises each hook through fixtures
representative of a real Cursor Composer session. Wave 1 + ST.2.x.

**Files.**

- `test/*.test.ts`
- `smoke.sh`
- `SMOKE.md`

---

## 5. ci: lint, typecheck, and chio-backed smoke

**Body.** GitHub Actions workflow parallel to the other plugins'
ci.yml: checks out bridge, test-harness, arc; runs `setup-chio`,
typecheck (non-blocking), unit tests, then `smoke.sh`. Wave 5.1.

**Files.**

- `.github/workflows/ci.yml`

---

## 6. ci: add SLSA L3 VSIX release workflow with vsce publish

**Body.** Tag-triggered `vsce publish` to the VS Code Marketplace
under `<VSCE_PUBLISHER>.chio-cursor`. Also uploads the `.vsix` as
a release asset with keyless `cosign sign-blob` signature and a SLSA
L3 generic generator attestation (VSIX is not a first-class generator
target). Input flag `vsce-publish: false` lets humans produce the
.vsix for sideload without publishing. Wave 5.5.

**Files.**

- `.github/workflows/release.yml`

---

## 7. docs: README with architecture and .chio conventions

**Body.** Documents the two plug-in surfaces, the four `.chio/`
paths (`policy.yaml`, `hooks/`, `branches/`, `evidence/`), the
palette/chat commands, and the fail-closed contract. Wave 5.2.

**Files.**

- `README.md`
- `VERIFY.md`
