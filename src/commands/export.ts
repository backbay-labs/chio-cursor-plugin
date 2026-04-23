import * as vscode from "vscode";
import type { ChioClient } from "../chio/client.ts";

/**
 * Free-form evidence export (palette only). For the PR-integrated flow
 * see `pr-evidence.ts` / `chio.prEvidence`.
 */
export async function exportCommand(client: ChioClient): Promise<void> {
  const uri = await vscode.window.showSaveDialog({
    saveLabel: "Export evidence bundle",
    filters: { "Chio bundle": ["json"] },
    defaultUri: vscode.Uri.file("chio-evidence-bundle.json"),
  });
  if (!uri) return;
  const sinceStr = await vscode.window.showInputBox({
    prompt: "Since (ISO timestamp or minutes-ago)",
    value: "60",
  });
  if (!sinceStr) return;
  const asInt = Number(sinceStr);
  const since = Number.isFinite(asInt)
    ? new Date(Date.now() - asInt * 60_000)
    : new Date(sinceStr);
  if (isNaN(since.getTime())) {
    vscode.window.showErrorMessage(`Chio: bad timestamp "${sinceStr}"`);
    return;
  }
  try {
    const out = await client.exportEvidence({ since, outPath: uri.fsPath });
    vscode.window.showInformationMessage(`Chio · evidence exported to ${out}`);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Chio: evidence export failed — ${(err as Error).message}`,
    );
  }
}
