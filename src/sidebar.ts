import * as vscode from "vscode";
import type { ChioClient, BondSnapshot } from "./chio/client.ts";

export class ChioSidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "chio.sidebar";

  constructor(private readonly client: ChioClient) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: false };
    view.webview.html = this.render(this.client.current);
    const sub = this.client.onDidChange((s) => {
      view.webview.html = this.render(s);
    });
    view.onDidDispose(() => sub.dispose());
  }

  private render(snap: BondSnapshot): string {
    const pct = Math.min(100, (snap.budgetUsedMin / Math.max(snap.budgetTotalMin, 0.001)) * 100);
    const passport = snap.passportId ? snap.passportId.slice(0, 16) + "..." : "—";
    const cap = snap.capabilityId ? snap.capabilityId.slice(0, 16) + "..." : "—";
    const reason = snap.lastReason ? escapeHtml(snap.lastReason) : "";
    return /* html */ `<!doctype html>
<html>
<head><meta charset="utf-8" /><style>
  body { font: 12px var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
  h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.7; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; gap: 12px; }
  .row span:last-child { text-align: right; word-break: break-all; max-width: 60%; }
  .chip { display: inline-block; padding: 2px 8px; border: 1px solid var(--vscode-panel-border); border-radius: 999px; font-size: 10px; }
  .bar { height: 4px; background: var(--vscode-panel-border); border-radius: 2px; overflow: hidden; margin-top: 6px; }
  .fill { height: 100%; width: ${pct}%; background: var(--vscode-progressBar-background); }
  .muted { opacity: 0.6; }
  .err { color: var(--vscode-errorForeground); margin-top: 6px; }
</style></head>
<body>
  <h3>Bond</h3>
  <div class="row"><span>state</span><span class="chip">${escapeHtml(snap.state)}</span></div>
  <div class="row"><span>policy</span><span class="muted">${escapeHtml(snap.policy ?? "—")}</span></div>
  <div class="row"><span>agent</span><span class="muted">${escapeHtml(snap.agent ?? "—")}</span></div>
  <div class="row"><span>passport</span><span class="muted">${escapeHtml(passport)}</span></div>
  <div class="row"><span>capability</span><span class="muted">${escapeHtml(cap)}</span></div>

  <h3 style="margin-top:18px">Budget</h3>
  <div class="row"><span>${snap.budgetUsedMin.toFixed(1)}</span><span class="muted">of ${snap.budgetTotalMin.toFixed(1)}</span></div>
  <div class="bar"><div class="fill"></div></div>

  <h3 style="margin-top:18px">Receipts</h3>
  <div class="row"><span>count</span><span class="muted">${snap.receiptCount}</span></div>

  ${reason ? `<div class="err">${reason}</div>` : ""}
</body>
</html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
        ? "&lt;"
        : c === ">"
          ? "&gt;"
          : c === '"'
            ? "&quot;"
            : "&#39;",
  );
}
