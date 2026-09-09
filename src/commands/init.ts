import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { mergeHookConfig, type HookConfig } from "../chio/hooks.ts";
import type { ChioClient } from "../chio/client.ts";

/**
 * `/chio-init` - materialise the chio scaffold into the user's
 * workspace:
 *
 *   .chio/policy.yaml           (if missing)
 *   .chio/hooks/composer.mjs    (copied from extension's dist/hooks/)
 *   .chio/hooks/shell.mjs
 *   .chio/hooks/tool.mjs
 *   .chio/hooks/pretooluse.mjs
 *   .cursor/hooks.json          (registers bundled pre-action scripts)
 *   .cursor/settings.json       (chio.* defaults, preserved if exists)
 */
export async function initCommand(
  _client: ChioClient,
  extensionPath: string,
): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage("Chio: open a workspace first.");
    return;
  }
  const ws = root.uri.fsPath;
  const created: string[] = [];
  // Read and validate the entire upgrade before touching existing hook files.
  const hookNames = ["pretooluse.mjs", "composer.mjs", "shell.mjs", "tool.mjs"];
  const bundles = await Promise.all(hookNames.map(name => fs.readFile(path.join(extensionPath, "dist", "hooks", name), "utf8")));
  const hooksJsonPath = path.join(ws, ".cursor", "hooks.json");
  const currentHooks = await safeRead(hooksJsonPath);
  const template = JSON.parse(await fs.readFile(path.join(extensionPath, "templates", ".cursor", "hooks.json"), "utf8")) as HookConfig;
  const mergedHooks = mergeHookConfig(currentHooks === null ? {} : JSON.parse(currentHooks), template);

  // Copy .chio/policy.yaml if missing.
  const policyRel = ".chio/policy.yaml";
  const policyAbs = path.join(ws, policyRel);
  if (!(await exists(policyAbs))) {
    await fs.mkdir(path.dirname(policyAbs), { recursive: true });
    const src = await safeRead(path.join(extensionPath, "templates", policyRel));
    if (src) {
      await fs.writeFile(policyAbs, src, "utf8");
      created.push(policyRel);
    }
  }

  // Copy self-contained bundles. Hooks must not depend on workspace node_modules.
  const hooksDest = path.join(ws, ".chio", "hooks");
  await fs.mkdir(hooksDest, { recursive: true });
  for (const [index, name] of hookNames.entries()) {
    const destPath = path.join(hooksDest, name);
    await fs.writeFile(destPath, bundles[index]!, { encoding: "utf8", mode: 0o755 });
    created.push(path.relative(ws, destPath));
  }
  await fs.mkdir(path.dirname(hooksJsonPath), { recursive: true });
  if (currentHooks !== null) {
    await fs.writeFile(hooksJsonPath + `.chio-backup-${Date.now()}`, currentHooks, "utf8");
  }
  await fs.writeFile(hooksJsonPath, JSON.stringify(mergedHooks, null, 2) + "\n", "utf8");
  created.push(".cursor/hooks.json");

  // .cursor/settings.json — merge into any existing file.
  const settingsTemplate = await safeRead(
    path.join(extensionPath, "templates", ".cursor", "settings.json"),
  );
  if (settingsTemplate) {
    const settingsPath = path.join(ws, ".cursor", "settings.json");
    let existing: Record<string, unknown> = {};
    const current = await safeRead(settingsPath);
    if (current) {
      try {
        existing = JSON.parse(current) as Record<string, unknown>;
      } catch {
        // preserve the bad file out of the way
        await fs.writeFile(settingsPath + ".bak", current, "utf8").catch(() => {});
        existing = {};
      }
    }
    const merged = { ...JSON.parse(settingsTemplate), ...existing };
    await fs.writeFile(settingsPath, JSON.stringify(merged, null, 2) + "\n", "utf8");
    created.push(".cursor/settings.json");
  }

  vscode.window.showInformationMessage(
    `Chio · initialized ${created.length} file(s). Set operator-owned CHIO_BIN and CHIO_POLICY paths, then reload Cursor. This candidate is not accepted for protected resources.`,
  );
  const channel = vscode.window.createOutputChannel("Chio · Init");
  channel.show(true);
  channel.appendLine(`workspace: ${ws}`);
  for (const f of created) channel.appendLine(`  wrote ${f}`);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function safeRead(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}
