import * as vscode from "vscode";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChioClient } from "../chio/client.ts";
import type { AttenuationDelta } from "@chio/bridge";

const exec = promisify(execFile);

/**
 * `/chio-attenuate-pr` — tighten the active capability for the current
 * branch only. Accepts a spec like `path:/docs/**`, `tool:fs.read`, or
 * `budget:2`. The signed attenuation delta is written to
 * `.chio/branches/<branch>.yaml`; the base policy is untouched.
 */
export async function attenuatePrCommand(client: ChioClient): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0];
  if (!root) {
    vscode.window.showWarningMessage("Chio: open a workspace first.");
    return;
  }
  const spec = await vscode.window.showInputBox({
    prompt: "Attenuate this branch · spec (e.g. path:./docs/**, tool:fs.read, budget:2)",
    placeHolder: "path:./docs/**",
  });
  if (!spec) return;

  const delta = parseSpec(spec);
  if (!delta) {
    vscode.window.showErrorMessage(
      `Chio: could not parse "${spec}". Expected path:<glob>, tool:<name>, or budget:<usd>.`,
    );
    return;
  }

  const passport = client.currentPassport;
  if (!passport || !passport.capabilityId) {
    vscode.window.showErrorMessage(
      "Chio: workspace not bonded with a capability id. Run Chio: Bond first.",
    );
    return;
  }

  const branch = await currentBranch(root.uri.fsPath);
  const branchDir = path.join(root.uri.fsPath, ".chio", "branches");
  await fs.mkdir(branchDir, { recursive: true });

  try {
    const newId = await client.attenuate(passport.capabilityId, delta);
    const body = {
      branch,
      source_capability: passport.capabilityId,
      attenuated_capability: newId,
      delta,
      spec,
      created_at: new Date().toISOString(),
    };
    const outPath = path.join(branchDir, `${sanitize(branch)}.yaml`);
    await fs.writeFile(outPath, yamlDump(body), "utf8");
    vscode.window.showInformationMessage(
      `Chio · branch ${branch} attenuated (${spec}) · ${path.relative(root.uri.fsPath, outPath)}`,
    );
  } catch (err) {
    vscode.window.showErrorMessage(
      `Chio: attenuation failed — ${(err as Error).message}`,
    );
  }
}

function parseSpec(spec: string): AttenuationDelta | null {
  const [k, v] = spec.split(":", 2) as [string, string | undefined];
  if (!k || !v) return null;
  const key = k.trim().toLowerCase();
  const val = v.trim();
  if (key === "path") {
    return { scope: { grants: [{ server_id: "fs", tool_name: "write", constraints: { path: val } }] } };
  }
  if (key === "tool") {
    const [server = "fs", tool = val] = val.includes(".") ? val.split(".", 2) : ["fs", val];
    return { scope: { grants: [{ server_id: server, tool_name: tool }] } };
  }
  if (key === "budget") {
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    return { budget: { maxUsd: n } };
  }
  return null;
}

async function currentBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
    return stdout.trim() || "HEAD";
  } catch {
    return "HEAD";
  }
}

function sanitize(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "-");
}

function yamlDump(obj: unknown): string {
  // tiny, deterministic YAML serialiser sufficient for our signed deltas.
  // No dep on `yaml` in the extension bundle.
  return JSON.stringify(obj, null, 2) + "\n";
}
