#!/usr/bin/env node
/**
 * Cursor hook: `beforeShellExecution`. Fires when Cursor (Agent tab,
 * Composer, or inline AI) wants to run a shell command.
 *
 * stdin:
 *   { command: "full terminal command", cwd: "...", sandbox: false, ... }
 *
 * We enforce three rules from the active policy:
 *   - `rules.shell_commands.allow` — exact-or-prefix allowlist
 *   - `rules.shell_commands.deny`  — hard block (wins over allow)
 *   - `rules.shell_commands.enabled: false` — allow-all (explicit opt-out)
 *
 * Output follows the beforeShellExecution schema:
 *   { permission: "allow" | "deny" | "ask", user_message, agent_message }
 */

import process from "node:process";
import { readStdinJson, emit, resolvePolicyPath, loadBridge } from "./_lib.mjs";

async function main() {
  const input = await readStdinJson();
  const command = typeof input.command === "string" ? input.command : "";
  if (!command.trim()) {
    emit({ permission: "allow" }, 0);
    return;
  }

  const policyPath = resolvePolicyPath(input);
  if (!policyPath) {
    emit(
      {
        permission: "deny",
        user_message: "Chio: no .chio/policy.yaml in workspace; refusing shell until /chio-init runs.",
      },
      2,
    );
    return;
  }

  const bridge = await loadBridge();
  let policy;
  try {
    policy = await bridge.loadPolicy(policyPath);
  } catch (err) {
    emit(
      {
        permission: "deny",
        user_message: `Chio: policy load failed: ${err.message}`,
      },
      2,
    );
    return;
  }

  const sc = (policy.rules && policy.rules.shell_commands) || {};
  if (sc.enabled === false) {
    emit({ permission: "allow" }, 0);
    return;
  }
  const allowList = asArray(sc.allow);
  const denyList = asArray(sc.deny);

  for (const d of denyList) {
    if (commandMatches(command, d)) {
      emit(
        {
          permission: "deny",
          user_message: `Chio denied shell: "${command}" matched deny rule "${d}".`,
          agent_message: `shell_commands.deny: ${d}`,
        },
        2,
      );
      return;
    }
  }
  if (allowList.length > 0) {
    const ok = allowList.some((a) => commandMatches(command, a));
    if (!ok) {
      emit(
        {
          permission: "deny",
          user_message: `Chio denied shell: "${command}" not in allowlist (${allowList.slice(0, 4).join(", ")}${allowList.length > 4 ? "..." : ""}).`,
          agent_message: `shell_commands.allow: ${command} not in allowlist`,
        },
        2,
      );
      return;
    }
  }

  emit({ permission: "allow" }, 0);
}

function asArray(v) {
  if (Array.isArray(v)) return v.filter((s) => typeof s === "string");
  return [];
}

/**
 * Match a command against an allow/deny entry. Entries can be:
 *   - exact: `npm test`
 *   - prefix: `git *` (trailing `*` is a wildcard)
 *   - regex: `/^npm (test|run build)$/` (slashes)
 */
function commandMatches(cmd, rule) {
  const trimmed = cmd.trim();
  const r = rule.trim();
  if (!r) return false;
  if (r.startsWith("/") && r.endsWith("/") && r.length > 1) {
    try {
      const re = new RegExp(r.slice(1, -1));
      return re.test(trimmed);
    } catch {
      return false;
    }
  }
  if (r.endsWith("*")) {
    const prefix = r.slice(0, -1).trimEnd();
    return trimmed === prefix || trimmed.startsWith(prefix + " ") || trimmed.startsWith(prefix);
  }
  // Default: exact match OR "starts with rule followed by whitespace/flag".
  if (trimmed === r) return true;
  if (trimmed.startsWith(r + " ")) return true;
  return false;
}

main().catch((err) => {
  try {
    process.stdout.write(
      JSON.stringify({
        permission: "deny",
        user_message: `Chio shell hook crashed: ${err && err.message ? err.message : String(err)}`,
      }),
    );
  } catch {
    /* noop */
  }
  process.exit(2);
});
