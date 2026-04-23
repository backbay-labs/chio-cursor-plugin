import * as vscode from "vscode";
import * as path from "node:path";
import { loadPolicy, lintPolicy, RULE_KEYS } from "@chio/bridge";
import type { ChioClient } from "../chio/client.ts";

/**
 * Render the real guard pipeline from the live policy: which rules are
 * enabled, which are disabled, and any lint warnings/errors.
 */
export async function guardsCommand(_client: ChioClient): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  const channel = vscode.window.createOutputChannel("Chio · Guards");
  channel.show(true);

  if (!root) {
    channel.appendLine("no workspace open");
    return;
  }
  const cfg = vscode.workspace.getConfiguration("chio");
  const relPolicy = cfg.get<string>("policy", "./.chio/policy.yaml");
  const policyAbs = path.resolve(root.uri.fsPath, relPolicy.replace(/^\.\//, ""));

  try {
    const policy = await loadPolicy(policyAbs);
    const lint = await lintPolicy(policy);
    channel.appendLine(`policy: ${policy.name ?? "<unnamed>"} (${policyAbs})`);
    channel.appendLine(`hushspec: ${policy.hushspec}`);
    channel.appendLine("");
    channel.appendLine("rule pipeline:");
    const rules = (policy.rules ?? {}) as Record<string, { enabled?: boolean } | undefined>;
    for (const key of RULE_KEYS) {
      const present = key in rules;
      if (!present) continue;
      const enabled = rules[key]?.enabled !== false;
      const mark = enabled ? "on " : "off";
      channel.appendLine(`  [${mark}] ${key}`);
    }
    if (lint.errors.length > 0) {
      channel.appendLine("");
      channel.appendLine(`errors: ${lint.errors.length}`);
      for (const e of lint.errors) channel.appendLine(`  · ${e.path}: ${e.message}`);
    }
    if (lint.warnings.length > 0) {
      channel.appendLine("");
      channel.appendLine(`warnings: ${lint.warnings.length}`);
      for (const w of lint.warnings) channel.appendLine(`  · ${w.path}: ${w.message}`);
    }
  } catch (err) {
    channel.appendLine(`failed to load policy: ${(err as Error).message}`);
  }
}
