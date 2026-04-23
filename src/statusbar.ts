import * as vscode from "vscode";
import type { BondSnapshot, ChioClient } from "./chio/client.ts";

const LABEL: Record<BondSnapshot["state"], string> = {
  bonded: "$(shield) BONDED",
  "at-risk": "$(warning) AT-RISK",
  revoked: "$(circle-slash) REVOKED",
  unbonded: "$(shield) UNBONDED",
};

export function createStatusBar(client: ChioClient): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = "chio.openPolicy";
  render(item, client.current);
  client.onDidChange((s) => render(item, s));
  item.show();
  return item;
}

function render(item: vscode.StatusBarItem, snap: BondSnapshot): void {
  const budget = `${snap.budgetUsedMin.toFixed(1)} / ${snap.budgetTotalMin.toFixed(1)} min`;
  item.text = `${LABEL[snap.state]} · ${budget}`;
  item.tooltip = new vscode.MarkdownString(
    [
      `**Chio** · ${snap.state}`,
      snap.policy ? `policy: \`${snap.policy}\`` : "no policy bound",
      snap.agent ? `agent: \`${snap.agent}\`` : "",
      `budget: ${budget}`,
      `receipts: ${snap.receiptCount}`,
    ]
      .filter(Boolean)
      .join("  \n"),
  );
  if (snap.state === "at-risk") {
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  } else if (snap.state === "revoked") {
    item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
  } else {
    item.backgroundColor = new vscode.ThemeColor("statusBar.background");
  }
}
