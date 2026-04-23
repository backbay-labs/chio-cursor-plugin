/**
 * Real PR evidence bundle builder.
 *
 * Flow:
 *   1. Determine the branch point (via `git merge-base HEAD origin/main`,
 *      falling back to `HEAD~50` if no remote).
 *   2. Ask `ChioBridge.exportEvidence` to dump every receipt since that
 *      timestamp to `.chio/evidence/pr-<branch>.bundle.json`.
 *   3. Verify every receipt in the bundle via `ChioBridge.verifyReceipt`.
 *      Fail the whole export if any receipt doesn't verify — we will not
 *      ship a forgery-tolerant bundle.
 *   4. Optionally attach to an open PR via `gh pr edit`; otherwise write
 *      a `.chio/evidence/pr-<branch>.md` with verification instructions.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ArcReceipt } from "@chio/bridge";
import type { ChioClient } from "./client.ts";

const exec = promisify(execFile);

export interface PrEvidenceResult {
  bundlePath: string;
  branch: string;
  receiptCount: number;
  verified: number;
  failedVerification: string[];
  markdownPath?: string;
  ghAttached?: boolean;
}

export async function buildPrEvidence(opts: {
  client: ChioClient;
  workspaceRoot: string;
}): Promise<PrEvidenceResult> {
  const branch = await currentBranch(opts.workspaceRoot);
  const since = await branchPointTime(opts.workspaceRoot);
  const outDir = path.join(opts.workspaceRoot, ".chio", "evidence");
  await fs.mkdir(outDir, { recursive: true });

  const safeBranch = branch.replace(/[^A-Za-z0-9._-]/g, "-");
  const bundlePath = path.join(outDir, `pr-${safeBranch}.bundle.json`);

  await opts.client.exportEvidence({ since, outPath: bundlePath });

  // Re-read the bundle to verify receipts. The bundle is the raw
  // `/v1/evidence/export` response; receipts live under a handful of
  // known keys — we check a few and fall through to the first array.
  const raw = await fs.readFile(bundlePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const receipts = extractReceipts(parsed);

  const failed: string[] = [];
  let verified = 0;
  for (const r of receipts) {
    try {
      const ok = await opts.client.verifyReceipt(r);
      if (ok) verified++;
      else failed.push(r.id);
    } catch (err) {
      failed.push(`${r.id ?? "<unknown>"}: ${(err as Error).message}`);
    }
  }

  if (failed.length > 0) {
    throw new Error(
      `PR evidence bundle has ${failed.length} receipt(s) that failed verification: ${failed
        .slice(0, 5)
        .join(", ")}${failed.length > 5 ? "..." : ""}`,
    );
  }

  const result: PrEvidenceResult = {
    bundlePath,
    branch,
    receiptCount: receipts.length,
    verified,
    failedVerification: failed,
  };

  // Try to attach via `gh` if available.
  const attached = await tryGhAttach(opts.workspaceRoot, bundlePath, branch, receipts.length);
  if (attached) {
    result.ghAttached = true;
  } else {
    // Fallback: write a markdown file with verification instructions.
    const mdPath = path.join(outDir, `pr-${safeBranch}.md`);
    await fs.writeFile(mdPath, renderInstructions(branch, bundlePath, receipts.length), "utf8");
    result.markdownPath = mdPath;
    result.ghAttached = false;
  }
  return result;
}

function extractReceipts(doc: Record<string, unknown>): ArcReceipt[] {
  // arc's `/v1/evidence/export` returns
  //   { bundle: { toolReceipts: [{ seq, receipt: {...} }, ...], ... } }
  // Older endpoints used flat shapes (`receipts`, `items`, ...). We
  // recursively harvest any nested array of receipt-shaped objects so
  // the plugin keeps working as the bundle evolves.
  const out: ArcReceipt[] = [];
  const seen = new Set<string>();
  const walk = (node: unknown): void => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const e of node) {
        if (e && typeof e === "object") {
          const obj = e as Record<string, unknown>;
          // Wrapped form: { seq, receipt: {...} }
          if (obj.receipt && typeof obj.receipt === "object") {
            const r = obj.receipt as ArcReceipt & { id?: string };
            if (r.id && !seen.has(r.id)) {
              seen.add(r.id);
              out.push(r);
            }
            continue;
          }
          // Bare form: an object that already looks like a receipt.
          if (typeof obj.id === "string" && (obj.signature || obj.kernel_key)) {
            if (!seen.has(obj.id)) {
              seen.add(obj.id);
              out.push(e as ArcReceipt);
            }
          }
        }
      }
      return;
    }
    if (typeof node === "object") {
      for (const v of Object.values(node as Record<string, unknown>)) walk(v);
    }
  };
  walk(doc);
  return out;
}

async function currentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    return stdout.trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}

async function branchPointTime(cwd: string): Promise<Date> {
  // Try origin/main, origin/master, main, master, then HEAD~50.
  const bases = ["origin/main", "origin/master", "main", "master"];
  for (const base of bases) {
    try {
      const { stdout: mb } = await exec("git", ["merge-base", "HEAD", base], { cwd });
      const sha = mb.trim();
      if (!sha) continue;
      const { stdout: ts } = await exec("git", ["show", "-s", "--format=%ct", sha], { cwd });
      const epoch = Number(ts.trim());
      if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch * 1000);
    } catch {
      continue;
    }
  }
  // Last-resort: 24 hours ago.
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

async function tryGhAttach(
  cwd: string,
  bundlePath: string,
  branch: string,
  count: number,
): Promise<boolean> {
  try {
    // Require `gh` binary.
    await exec("gh", ["--version"], { cwd });
  } catch {
    return false;
  }
  // Find an open PR for this branch.
  let prNumber = "";
  try {
    const { stdout } = await exec(
      "gh",
      ["pr", "view", branch, "--json", "number", "-q", ".number"],
      { cwd },
    );
    prNumber = stdout.trim();
  } catch {
    return false;
  }
  if (!prNumber) return false;
  const marker = `<!-- chio-evidence -->`;
  const block =
    `${marker}\n\n**Chio evidence bundle**: \`${path.relative(cwd, bundlePath)}\`  \n` +
    `Receipts: ${count}. Verify with \`arc evidence verify ${path.relative(cwd, bundlePath)}\`.\n`;
  try {
    await exec(
      "gh",
      ["pr", "edit", prNumber, "--body", block],
      { cwd },
    );
    return true;
  } catch {
    return false;
  }
}

function renderInstructions(branch: string, bundlePath: string, count: number): string {
  const rel = path.basename(bundlePath);
  return [
    `# Chio PR evidence bundle`,
    ``,
    `- branch: \`${branch}\``,
    `- bundle: \`${rel}\``,
    `- receipts: ${count}`,
    ``,
    `## Verify`,
    ``,
    `\`\`\``,
    `chio evidence verify .chio/evidence/${rel}`,
    `\`\`\``,
    ``,
    `Every receipt in this bundle is ed25519-signed. The bundle was generated`,
    `from the chio trust plane's \`/v1/evidence/export\`; Chio verified every`,
    `receipt locally via \`ChioBridge.verifyReceipt\` before writing this file.`,
    ``,
  ].join("\n");
}
