import { test } from "node:test";
import * as assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = path.resolve(__dirname, "..", "hooks-src");

async function runHook(script, stdinJson, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [path.join(HOOKS_DIR, script)], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString("utf8")));
    proc.stderr.on("data", (c) => (err += c.toString("utf8")));
    proc.on("error", reject);
    proc.on("exit", (code) => {
      let parsed = null;
      try {
        parsed = JSON.parse(out);
      } catch {
        parsed = null;
      }
      resolve({ code: code ?? -1, stdout: out, stderr: err, json: parsed });
    });
    proc.stdin.end(JSON.stringify(stdinJson));
  });
}

async function withWorkspace(body, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chio-hooks-"));
  const policyPath = path.join(dir, ".chio", "policy.yaml");
  await fs.mkdir(path.dirname(policyPath), { recursive: true });
  await fs.writeFile(policyPath, body, "utf8");
  try {
    await run({ root: dir, policyPath });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("composer hook: denies when policy is missing (fail-closed)", async () => {
  const r = await runHook("composer.mjs", {
    hook_event_name: "afterFileEdit",
    file_path: "/nonexistent/x.ts",
    edits: [{ old_string: "", new_string: "const x = 1;" }],
    workspace_roots: ["/tmp/does-not-exist-" + Date.now()],
  });
  assert.equal(r.code, 2, `expected exit 2, got ${r.code}; stdout=${r.stdout}; stderr=${r.stderr}`);
  assert.equal(r.json?.permission, "deny");
});

test("composer hook: denies on forbidden_paths", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  forbidden_paths:\n    patterns:\n      - "**/.env"\n`;
  await withWorkspace(yaml, async ({ root }) => {
    const r = await runHook("composer.mjs", {
      hook_event_name: "afterFileEdit",
      file_path: path.join(root, ".env"),
      edits: [{ old_string: "", new_string: "FOO=bar" }],
      workspace_roots: [root],
    });
    assert.equal(r.code, 2);
    assert.equal(r.json?.permission, "deny");
    assert.match(r.json?.agent_message ?? "", /forbidden_paths/);
  });
});

test("composer hook: denies on embedded AKIA key", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  path_allowlist:\n    write:\n      - "**/*"\n`;
  await withWorkspace(yaml, async ({ root }) => {
    const r = await runHook("composer.mjs", {
      hook_event_name: "afterFileEdit",
      file_path: path.join(root, "src/leak.ts"),
      edits: [{ old_string: "", new_string: "const k = 'AKIAIOSFODNN7EXAMPLE';" }],
      workspace_roots: [root],
    });
    assert.equal(r.code, 2);
    assert.equal(r.json?.permission, "deny");
    assert.match(r.json?.agent_message ?? "", /secrets_scan/);
  });
});

test("composer hook: allows clean edit inside allowlist", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  path_allowlist:\n    write:\n      - "**/*"\n`;
  await withWorkspace(yaml, async ({ root }) => {
    const r = await runHook("composer.mjs", {
      hook_event_name: "afterFileEdit",
      file_path: path.join(root, "src/ok.ts"),
      edits: [{ old_string: "", new_string: "export const answer = 42;" }],
      workspace_roots: [root],
    });
    assert.equal(r.code, 0, `stdout=${r.stdout}; stderr=${r.stderr}`);
    assert.equal(r.json?.permission, "allow");
  });
});

test("shell hook: denies when command not in allowlist", async () => {
  const yaml =
    `hushspec: "0.1.0"\nname: t\nrules:\n  shell_commands:\n    enabled: true\n    default: block\n    allow:\n      - "npm test"\n`;
  await withWorkspace(yaml, async ({ root }) => {
    const r = await runHook("shell.mjs", {
      hook_event_name: "beforeShellExecution",
      command: "rm -rf /",
      cwd: root,
      workspace_roots: [root],
    });
    assert.equal(r.code, 2);
    assert.equal(r.json?.permission, "deny");
  });
});

test("shell hook: allows allowlisted npm test", async () => {
  const yaml =
    `hushspec: "0.1.0"\nname: t\nrules:\n  shell_commands:\n    enabled: true\n    default: block\n    allow:\n      - "npm test"\n`;
  await withWorkspace(yaml, async ({ root }) => {
    const r = await runHook("shell.mjs", {
      hook_event_name: "beforeShellExecution",
      command: "npm test",
      cwd: root,
      workspace_roots: [root],
    });
    assert.equal(r.code, 0);
    assert.equal(r.json?.permission, "allow");
  });
});

test("shell hook: explicit deny rule wins", async () => {
  const yaml =
    `hushspec: "0.1.0"\nname: t\nrules:\n  shell_commands:\n    enabled: true\n    allow:\n      - "git *"\n    deny:\n      - "git push*"\n`;
  await withWorkspace(yaml, async ({ root }) => {
    const r = await runHook("shell.mjs", {
      hook_event_name: "beforeShellExecution",
      command: "git push origin main",
      cwd: root,
      workspace_roots: [root],
    });
    assert.equal(r.code, 2);
    assert.equal(r.json?.permission, "deny");
  });
});

test("tool hook: fails closed when no policy", async () => {
  const r = await runHook("tool.mjs", {
    hook_event_name: "beforeMCPExecution",
    tool_name: "fs.read",
    tool_input: { path: "/etc/passwd" },
    workspace_roots: ["/tmp/no-workspace-" + Date.now()],
  });
  assert.equal(r.code, 2);
  assert.equal(r.json?.permission, "deny");
});
