/**
 * Local patch diagnostics. This is not the Cursor enforcement path.
 *
 * Loads the active `.chio/policy.yaml` through `ChioBridge.loadPolicy`
 * + `lintPolicy`, then reports on these local diagnostic rule blocks:
 *
 *   - `forbidden_paths.patterns`  (deny-if-match, first-priority)
 *   - `path_allowlist.write`       (must-match-one)
 *   - `patch_integrity.max_files` / `max_additions` / `max_deletions`
 *   - inline secret scan via `./secrets.ts` (always on)
 *
 * The patch shape matches what Cursor's `afterFileEdit` hook delivers:
 *   { file_path: string, edits: [{ old_string, new_string }] }
 *
 * For non-Cursor call sites (e.g. programmatic checks from the extension
 * or CI) we also accept an array of { path, before, after } where
 * `before`/`after` may be full file contents.
 */

import { loadPolicy, lintPolicy, type HushSpec } from "@chio/bridge";
import { detectSecrets, type SecretFinding } from "./secrets.ts";

export interface PatchFile {
  /** Absolute or workspace-relative path. */
  path: string;
  /** Full prior contents, if available. */
  before?: string;
  /** Full new contents, if available. Otherwise we rely on `edits`. */
  after?: string;
  /** Per-file edit list in Cursor's afterFileEdit shape. */
  edits?: Array<{ old_string: string; new_string: string }>;
}

export interface PatchCheckInput {
  files: PatchFile[];
  /** Path to the active policy. */
  policyPath: string;
}

export interface PatchCheckResult {
  decision: "allow" | "deny";
  reasons: string[];
  deniedFiles: string[];
  secrets: Array<{ path: string; findings: SecretFinding[] }>;
  /** Totals (computed from `edits` when full contents weren't provided). */
  adds: number;
  dels: number;
  /** The policy we evaluated against; useful for receipts + UI. */
  policyName?: string;
}

/**
 * Minimise leakage of internal policy structure at the call site: this
 * helper just runs diagnostics and returns a result. Cursor pre-action hooks
 * evaluate through the selected kernel CLI instead of calling this helper.
 */
export async function checkPatch(input: PatchCheckInput): Promise<PatchCheckResult> {
  const reasons: string[] = [];
  const deniedFiles: string[] = [];
  const secretsByFile: Array<{ path: string; findings: SecretFinding[] }> = [];
  let adds = 0;
  let dels = 0;

  let policy: HushSpec;
  try {
    policy = await loadPolicy(input.policyPath);
  } catch (err) {
    return {
      decision: "deny",
      reasons: [`policy_load_failed: ${(err as Error).message}`],
      deniedFiles: input.files.map((f) => f.path),
      secrets: [],
      adds: 0,
      dels: 0,
    };
  }

  const lint = await lintPolicy(policy);
  if (lint.errors.length > 0) {
    return {
      decision: "deny",
      reasons: lint.errors.map((e) => `policy_invalid: ${e.path}: ${e.message}`),
      deniedFiles: input.files.map((f) => f.path),
      secrets: [],
      adds: 0,
      dels: 0,
    };
  }

  const rules = (policy.rules ?? {}) as {
    forbidden_paths?: { patterns?: unknown } | undefined;
    path_allowlist?: { write?: unknown; read?: unknown } | undefined;
    patch_integrity?: {
      max_files?: number;
      max_additions?: number;
      max_deletions?: number;
    } | undefined;
  };

  const forbidden = toStringArray(rules.forbidden_paths?.patterns);
  const writeAllow = toStringArray(rules.path_allowlist?.write);
  const pi = rules.patch_integrity ?? {};

  if (typeof pi.max_files === "number" && input.files.length > pi.max_files) {
    reasons.push(
      `patch_integrity.max_files: patch touches ${input.files.length} files (max ${pi.max_files})`,
    );
  }

  for (const f of input.files) {
    const rel = toWorkspaceRel(f.path);
    // Rule 1: forbidden_paths — deny-first.
    for (const pat of forbidden) {
      if (matchesGlob(rel, pat)) {
        reasons.push(`forbidden_paths: ${rel} matches ${pat}`);
        deniedFiles.push(f.path);
        break;
      }
    }
    // Rule 2: path_allowlist.write — must match at least one when set.
    if (writeAllow.length > 0 && !deniedFiles.includes(f.path)) {
      const matched = writeAllow.some((pat) => matchesGlob(rel, pat));
      if (!matched) {
        reasons.push(
          `path_allowlist.write: ${rel} not in allowlist (${writeAllow.join(", ")})`,
        );
        deniedFiles.push(f.path);
      }
    }
    // Compute additions/deletions for this file so downstream receipts
    // and the patch_integrity limits have something to use.
    const { added, deleted, afterText } = summarizeEdits(f);
    adds += added;
    dels += deleted;

    // Rule 3: secret scan on the resulting contents (or the new_string
    // fragments if we don't have full after-content).
    const findings = detectSecrets(afterText);
    if (findings.length > 0) {
      secretsByFile.push({ path: f.path, findings });
      reasons.push(
        `secrets_scan: ${rel} has ${findings.length} finding(s) (${findings
          .map((x) => x.kind)
          .join(", ")})`,
      );
      if (!deniedFiles.includes(f.path)) deniedFiles.push(f.path);
    }
  }

  if (typeof pi.max_additions === "number" && adds > pi.max_additions) {
    reasons.push(`patch_integrity.max_additions: +${adds} > ${pi.max_additions}`);
  }
  if (typeof pi.max_deletions === "number" && dels > pi.max_deletions) {
    reasons.push(`patch_integrity.max_deletions: -${dels} > ${pi.max_deletions}`);
  }

  const decision: "allow" | "deny" =
    reasons.length === 0 && deniedFiles.length === 0 ? "allow" : "deny";

  const out: PatchCheckResult = {
    decision,
    reasons,
    deniedFiles,
    secrets: secretsByFile,
    adds,
    dels,
  };
  if (policy.name) out.policyName = policy.name;
  return out;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (value && typeof value === "object") {
    const maybe = (value as { patterns?: unknown; write?: unknown }).patterns;
    if (Array.isArray(maybe))
      return maybe.filter((v): v is string => typeof v === "string");
  }
  return [];
}

function toWorkspaceRel(p: string): string {
  // Normalize to forward slashes; leave `./` prefix off for matching.
  let s = p.replace(/\\/g, "/");
  // If it's absolute, drop everything up to the last `/` that looks like a
  // workspace root. We don't know the root here, so we just strip a leading
  // slash so that `/abs/.env` matches `**/.env`.
  if (s.startsWith("/")) s = s.slice(1);
  // Strip leading `./`.
  while (s.startsWith("./")) s = s.slice(2);
  return s;
}

function summarizeEdits(file: PatchFile): {
  added: number;
  deleted: number;
  afterText: string;
} {
  if (typeof file.after === "string") {
    const before = typeof file.before === "string" ? file.before : "";
    const a = countLines(file.after);
    const b = countLines(before);
    return {
      added: Math.max(a - b, 0),
      deleted: Math.max(b - a, 0),
      afterText: file.after,
    };
  }
  let added = 0;
  let deleted = 0;
  const chunks: string[] = [];
  if (file.edits) {
    for (const e of file.edits) {
      added += countLines(e.new_string);
      deleted += countLines(e.old_string);
      chunks.push(e.new_string);
    }
  }
  return { added, deleted, afterText: chunks.join("\n") };
}

function countLines(text: string): number {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

/**
 * Minimal glob matcher supporting `**`, `*`, and `?`. Deliberately
 * dependency-free so hook scripts can import it without pulling node_modules.
 */
export function matchesGlob(path: string, pattern: string): boolean {
  let pat = pattern.replace(/\\/g, "/");
  if (pat.startsWith("./")) pat = pat.slice(2);
  if (pat.startsWith("/")) pat = pat.slice(1);
  const re = globToRegex(pat);
  return re.test(path);
}

function globToRegex(pat: string): RegExp {
  let re = "^";
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === "*") {
      if (pat[i + 1] === "*") {
        // **/ or ** consumes any path (including slashes).
        re += ".*";
        i++;
        if (pat[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === ".") {
      re += "\\.";
    } else if (c === "/") {
      re += "/";
    } else if ("+^$|(){}[]\\".includes(c ?? "")) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re);
}
