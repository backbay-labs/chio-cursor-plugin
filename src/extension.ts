import * as vscode from "vscode";
import * as path from "node:path";
import { ChioClient } from "./chio/client.ts";
import { createStatusBar } from "./statusbar.ts";
import { ChioSidebarProvider } from "./sidebar.ts";
import { initCommand } from "./commands/init.ts";
import { bondCommand } from "./commands/bond.ts";
import { attachMcpCommand } from "./commands/attach-mcp.ts";
import { guardsCommand } from "./commands/guards.ts";
import { receiptsCommand } from "./commands/receipts.ts";
import { attenuatePrCommand } from "./commands/attenuate-pr.ts";
import { exportCommand } from "./commands/export.ts";
import { prEvidenceCommand } from "./commands/pr-evidence.ts";
import { revokeCommand } from "./commands/revoke.ts";

/**
 * Extension activation. Role: observability + ergonomics (status bar,
 * sidebar, palette commands, `/chio-init` scaffolding). The real
 * enforcement lives in `.cursor/hooks.json` scripts under `.chio/hooks/`
 * (materialised by `/chio-init`). We intentionally do not call
 * `onWillSaveTextDocument` — it does not fire in Composer. See README.
 */
export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("chio");
  const trustUrl = cfg.get<string>("trust.url") || cfg.get<string>("daemon.url") || "http://127.0.0.1:8940";
  const mcpUrl = cfg.get<string>("mcp.url", "http://127.0.0.1:8931");
  const token = process.env.CHIO_TOKEN ?? "";
  const receiptDbPath =
    process.env.CHIO_RECEIPT_DB ??
    (process.env.CHIO_HARNESS_DIR
      ? path.join(process.env.CHIO_HARNESS_DIR, "var", "receipts.sqlite")
      : undefined);
  const clientOpts: { trustUrl: string; mcpUrl: string; token: string; receiptDbPath?: string } = {
    trustUrl,
    mcpUrl,
    token,
  };
  if (receiptDbPath) clientOpts.receiptDbPath = receiptDbPath;

  const client = new ChioClient(clientOpts);
  ctx.subscriptions.push({ dispose: () => client.dispose() });

  ctx.subscriptions.push(
    createStatusBar(client),
    vscode.window.registerWebviewViewProvider(
      ChioSidebarProvider.viewType,
      new ChioSidebarProvider(client),
    ),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("chio.init",        () => initCommand(client, ctx.extensionPath)),
    vscode.commands.registerCommand("chio.bond",        () => bondCommand(client)),
    vscode.commands.registerCommand("chio.attachMcp",   () => attachMcpCommand(client)),
    vscode.commands.registerCommand("chio.guards",      () => guardsCommand(client)),
    vscode.commands.registerCommand("chio.receipts",    () => receiptsCommand(client)),
    vscode.commands.registerCommand("chio.attenuatePr", () => attenuatePrCommand(client)),
    vscode.commands.registerCommand("chio.prEvidence",  () => prEvidenceCommand(client)),
    vscode.commands.registerCommand("chio.export",      () => exportCommand(client)),
    vscode.commands.registerCommand("chio.revoke",      () => revokeCommand(client)),
    vscode.commands.registerCommand("chio.openPolicy",  () => openPolicy()),
  );

  // Pick up config changes without forcing a reload.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("chio")) {
        const c = vscode.workspace.getConfiguration("chio");
        client.setOptions({
          trustUrl: c.get<string>("trust.url") || c.get<string>("daemon.url") || trustUrl,
          mcpUrl: c.get<string>("mcp.url", mcpUrl),
        });
      }
    }),
  );

  if (cfg.get<string>("bond", "on-workspace-open") === "on-workspace-open") {
    // Don't block activation on bond — schedule it.
    setTimeout(() => {
      void vscode.commands.executeCommand("chio.bond");
    }, 250);
  }
}

export function deactivate(): void {}

async function openPolicy(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) return;
  const rel = vscode.workspace.getConfiguration("chio").get<string>("policy", "./.chio/policy.yaml");
  const uri = vscode.Uri.joinPath(root.uri, rel.replace(/^\.\//, ""));
  await vscode.window.showTextDocument(uri);
}
