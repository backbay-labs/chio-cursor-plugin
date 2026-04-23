import * as vscode from "vscode";
import * as path from "node:path";
import type { ChioClient } from "../chio/client.ts";
import { discoverAndRegister } from "../chio/mcp.ts";

export async function attachMcpCommand(client: ChioClient): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage("Chio: open a workspace first.");
    return;
  }
  const cfg = vscode.workspace.getConfiguration("chio");
  const mcpUrl = cfg.get<string>("mcp.url", "http://127.0.0.1:8931");
  const relPolicy = cfg.get<string>("policy", "./.chio/policy.yaml");
  const policyAbs = path.resolve(root.uri.fsPath, relPolicy.replace(/^\.\//, ""));

  const channel = vscode.window.createOutputChannel("Chio · MCP");
  channel.show(true);
  channel.appendLine("discovering MCP servers on the mesh...");
  try {
    const result = await discoverAndRegister({
      client,
      workspaceRoot: root.uri.fsPath,
      policyPath: policyAbs,
      mcpEdgeUrl: mcpUrl,
    });
    channel.appendLine(`discovered ${result.discovered.length} server(s):`);
    for (const s of result.registered) {
      channel.appendLine(
        `  chio.${s.id} · url=${s.url} · allow=${s.allowedTools.length} · deny=${s.deniedTools.length}${s.capabilityId ? ` · cap=${s.capabilityId.slice(0, 12)}...` : ""}`,
      );
    }
    for (const e of result.errors) {
      channel.appendLine(`  [err] ${e.server}: ${e.error}`);
    }
    if (result.registered.length > 0) {
      vscode.window.showInformationMessage(
        `Chio · ${result.registered.length} MCP server(s) attenuated → .cursor/mcp.json`,
      );
    } else {
      vscode.window.showWarningMessage(
        "Chio · no MCP servers on the mesh. Start chio mcp serve-http first.",
      );
    }
  } catch (err) {
    channel.appendLine(`discovery failed: ${(err as Error).message}`);
    vscode.window.showErrorMessage(
      `Chio MCP discovery failed: ${(err as Error).message}`,
    );
  }
}
