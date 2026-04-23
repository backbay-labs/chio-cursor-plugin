import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ChioClient } from "../chio/client.ts";

/**
 * `/chio-init` — materialise the chio scaffold into the user's
 * workspace:
 *
 *   .chio/policy.yaml           (if missing)
 *   .chio/hooks/composer.mjs    (copied from extension's hooks-src/)
 *   .chio/hooks/shell.mjs
 *   .chio/hooks/tool.mjs
 *   .chio/hooks/_lib.mjs
 *   .cursor/hooks.json          (registers the three scripts)
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

  // Copy hook scripts into .chio/hooks/ so they are versioned with the repo.
  const hooks = ["composer.mjs", "shell.mjs", "tool.mjs", "_lib.mjs"];
  const hooksDest = path.join(ws, ".chio", "hooks");
  await fs.mkdir(hooksDest, { recursive: true });
  for (const name of hooks) {
    const destPath = path.join(hooksDest, name);
    const srcPath = path.join(extensionPath, "hooks-src", name);
    const src = await safeRead(srcPath);
    if (src) {
      await fs.writeFile(destPath, src, "utf8");
      await fs.chmod(destPath, 0o755).catch(() => {});
      created.push(path.relative(ws, destPath));
    }
  }

  // .cursor/hooks.json — always overwrite (we own it).
  const hooksJsonSrc = await safeRead(path.join(extensionPath, "templates", ".cursor", "hooks.json"));
  if (hooksJsonSrc) {
    const hooksJsonPath = path.join(ws, ".cursor", "hooks.json");
    await fs.mkdir(path.dirname(hooksJsonPath), { recursive: true });
    await fs.writeFile(hooksJsonPath, hooksJsonSrc, "utf8");
    created.push(".cursor/hooks.json");
  }

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
    `Chio · initialized ${created.length} file(s). Reload Cursor to pick up hooks.`,
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
