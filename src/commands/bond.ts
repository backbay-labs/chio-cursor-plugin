import * as vscode from "vscode";
import * as path from "node:path";
import { lintPolicy, loadPolicy } from "@chio/bridge";
import type { ChioClient } from "../chio/client.ts";

export async function bondCommand(client: ChioClient): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage("Chio: open a workspace first.");
    return;
  }
  const cfg = vscode.workspace.getConfiguration("chio");
  const relPolicy = cfg.get<string>("policy", "./.chio/policy.yaml");
  const policyAbs = path.resolve(root.uri.fsPath, relPolicy.replace(/^\.\//, ""));

  // Lint first so we refuse to bond against a non-parseable policy.
  try {
    const policy = await loadPolicy(policyAbs);
    const lint = await lintPolicy(policy);
    if (lint.errors.length > 0) {
      const first = lint.errors[0]!;
      vscode.window.showErrorMessage(
        `Chio: policy has ${lint.errors.length} error(s). First: ${first.path}: ${first.message}`,
      );
      return;
    }
  } catch (err) {
    vscode.window.showErrorMessage(
      `Chio: policy load failed — ${(err as Error).message}. Run Chio: Initialize workspace.`,
    );
    return;
  }

  try {
    const snap = await client.bond(policyAbs);
    vscode.window.showInformationMessage(
      `Chio bonded · policy ${path.basename(policyAbs)} · agent ${snap.agent ?? "—"}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(`Chio bond failed (at-risk): ${msg}`);
  }
}
