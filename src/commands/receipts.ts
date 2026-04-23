import * as vscode from "vscode";
import type { ChioClient } from "../chio/client.ts";

export async function receiptsCommand(client: ChioClient): Promise<void> {
  const channel = vscode.window.createOutputChannel("Chio · Receipts");
  channel.show(true);
  const since = new Date(Date.now() - 5 * 60_000);
  channel.appendLine(`fetching receipts since ${since.toISOString()}...`);
  try {
    const list = await client.recentReceipts(since, 200);
    channel.appendLine(`received ${list.length} receipt(s)`);
    for (const r of list.slice(-50)) {
      const decision =
        typeof r.decision === "string"
          ? r.decision
          : typeof r.decision === "object" && r.decision !== null
            ? Object.keys(r.decision)[0] ?? "unknown"
            : "unknown";
      const ts =
        typeof r.timestamp === "number"
          ? new Date(r.timestamp * 1000).toISOString()
          : String(r.timestamp ?? "");
      channel.appendLine(
        `  ${ts} · ${decision} · ${r.tool_server ?? "?"}/${r.tool_name ?? "?"} · id=${(r.id ?? "").slice(0, 12)}...`,
      );
    }
    // Stream follow-up new receipts until the user closes the channel.
    channel.appendLine("streaming new receipts (close panel to stop)...");
    const cfg = vscode.workspace.getConfiguration("chio");
    void cfg; // reserved for future sink/filter settings
    const bridge = client.bridgeOrNull();
    if (!bridge) {
      channel.appendLine("daemon unreachable; not streaming");
      return;
    }
    // Light polling via recentReceipts.
    let cursor = new Date();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const next = await client.recentReceipts(cursor, 100).catch(() => []);
      for (const r of next) {
        const decision =
          typeof r.decision === "string"
            ? r.decision
            : typeof r.decision === "object" && r.decision !== null
              ? Object.keys(r.decision)[0] ?? "unknown"
              : "unknown";
        const ts =
          typeof r.timestamp === "number"
            ? new Date(r.timestamp * 1000).toISOString()
            : String(r.timestamp ?? "");
        channel.appendLine(
          `  ${ts} · ${decision} · ${r.tool_server ?? "?"}/${r.tool_name ?? "?"}`,
        );
      }
      cursor = new Date();
    }
  } catch (err) {
    channel.appendLine(`receipts failed: ${(err as Error).message}`);
  }
}
