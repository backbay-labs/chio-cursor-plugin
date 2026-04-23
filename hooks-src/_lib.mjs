// Shared plumbing for chio's Cursor hook scripts.
//
// Cursor invokes each hook as a subprocess, delivering a JSON payload
// on stdin and reading one of:
//   - exit 0 + stdout JSON (`permission`/`continue` etc.)
//   - exit 2 (equivalent to permission=deny)
//
// Docs: https://cursor.com/docs/agent/hooks
//
// Contract this library enforces:
//   - Fail-closed on any error. A hook that crashes must deny the action.
//   - Always emit a single JSON object on stdout before exit.
//   - Load the workspace policy via @chio/bridge — never stub.

import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import process from "node:process";

export async function readStdinJson() {
  return new Promise((resolveP, rejectP) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("error", rejectP);
    process.stdin.on("end", () => {
      if (!buf.trim()) {
        resolveP({});
        return;
      }
      try {
        resolveP(JSON.parse(buf));
      } catch (err) {
        rejectP(new Error(`invalid hook stdin JSON: ${err.message}`));
      }
    });
  });
}

/**
 * Emit an output object on stdout and exit with `code`. Exit code 2
 * tells Cursor to block regardless of stdout.
 */
export function emit(out, code = 0) {
  try {
    process.stdout.write(JSON.stringify(out));
  } catch {
    /* swallow */
  }
  process.exit(code);
}

export function allow(userMsg) {
  const out = { permission: "allow" };
  if (userMsg) out.user_message = userMsg;
  emit(out, 0);
}

export function deny(userMsg, agentMsg) {
  const out = {
    permission: "deny",
    user_message: userMsg ?? "Chio denied this action.",
  };
  if (agentMsg) out.agent_message = agentMsg;
  emit(out, 2);
}

/**
 * For beforeSubmitPrompt-shaped hooks the output shape is
 * `{continue: boolean, user_message}` instead of `{permission}`.
 */
export function allowPrompt() {
  emit({ continue: true }, 0);
}
export function denyPrompt(userMsg) {
  emit({ continue: false, user_message: userMsg ?? "Chio blocked this prompt." }, 2);
}

/**
 * Walk up from the first workspace root until we find `.chio/policy.yaml`.
 * Returns absolute path or null.
 */
export function resolvePolicyPath(hookInput) {
  const roots = Array.isArray(hookInput.workspace_roots) ? hookInput.workspace_roots : [];
  for (const r of roots) {
    const p = join(r, ".chio", "policy.yaml");
    if (existsSync(p)) return p;
  }
  // Fallback: $CHIO_POLICY env.
  if (process.env.CHIO_POLICY && existsSync(process.env.CHIO_POLICY)) {
    return resolve(process.env.CHIO_POLICY);
  }
  return null;
}

/**
 * Dynamic import of @chio/bridge. Kept dynamic so the hook script is
 * cheap to parse; errors here fail closed.
 */
export async function loadBridge() {
  return await import("@chio/bridge");
}

/** Try to read a file synchronously; return empty string on failure. */
export function safeReadFile(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

/**
 * Top-level safety wrapper: every hook script should call this in its
 * main. If `fn` throws, we emit a deny. Opt out of deny-on-error with
 * `{ denyOnError: false }` to use allow-on-error for shapes that must
 * not block silently (rare).
 */
export async function run(fn, { onError = "deny", shape = "permission" } = {}) {
  try {
    const input = await readStdinJson();
    await fn(input);
    // If fn didn't call emit/allow/deny, default to allow so Cursor keeps moving.
    if (shape === "prompt") allowPrompt();
    else allow();
  } catch (err) {
    const msg = `chio hook error: ${err && err.message ? err.message : String(err)}`;
    if (onError === "allow") {
      if (shape === "prompt") allowPrompt();
      else allow(msg);
    } else {
      if (shape === "prompt") denyPrompt(msg);
      else deny(msg);
    }
  }
}
