import * as vscode from "vscode";
import type { ChioClient } from "../chio/client.ts";

export async function revokeCommand(client: ChioClient): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    "Revoke the Chio bond for this workspace?",
    { modal: true },
    "Revoke",
  );
  if (confirm !== "Revoke") return;
  await client.revoke();
  vscode.window.showInformationMessage("Chio · bond revoked");
}
