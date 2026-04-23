import * as vscode from "vscode";
import * as path from "node:path";
import type { ChioClient } from "../chio/client.ts";
import { buildPrEvidence } from "../chio/evidence.ts";

/**
 * `/chio-pr-evidence` — build the signed PR evidence bundle for the
 * current branch, verify every receipt locally, and (when `gh` is
 * available) attach it to the open PR. Otherwise writes a markdown
 * companion with verify instructions.
 */
export async function prEvidenceCommand(client: ChioClient): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage("Chio: open a workspace first.");
    return;
  }
  const channel = vscode.window.createOutputChannel("Chio · PR evidence");
  channel.show(true);
  channel.appendLine("building PR evidence bundle...");
  try {
    const result = await buildPrEvidence({
      client,
      workspaceRoot: root.uri.fsPath,
    });
    channel.appendLine(
      `branch: ${result.branch} · receipts: ${result.receiptCount} · verified: ${result.verified}`,
    );
    channel.appendLine(`bundle: ${path.relative(root.uri.fsPath, result.bundlePath)}`);
    if (result.ghAttached) {
      channel.appendLine("attached to open PR via gh");
    } else if (result.markdownPath) {
      channel.appendLine(
        `wrote verify instructions: ${path.relative(root.uri.fsPath, result.markdownPath)}`,
      );
    }
    vscode.window.showInformationMessage(
      `Chio · PR evidence ready (${result.receiptCount} receipts, all verified)`,
    );
  } catch (err) {
    channel.appendLine(`failed: ${(err as Error).message}`);
    vscode.window.showErrorMessage(
      `Chio: PR evidence failed — ${(err as Error).message}`,
    );
  }
}
