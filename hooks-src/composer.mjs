#!/usr/bin/env node
/**
 * Cursor hook: `afterFileEdit` (Composer / Agent tab multi-file edits)
 * and `beforeReadFile` (inline AI context pulls).
 *
 * stdin for afterFileEdit:
 *   {
 *     file_path: "/abs/path",
 *     edits: [{ old_string, new_string }],
 *     ...base fields
 *   }
 *
 * stdin for beforeReadFile:
 *   { file_path, content, attachments, ...base fields }
 *
 * The same script handles both shapes: it infers intent from which
 * fields are present. Output follows the per-event schema:
 *   - afterFileEdit: no output schema, so we return `{}` and rely on
 *     surfacing a deny via stderr + exit 2 (Cursor logs it; the edit
 *     has already applied by that event — see note in README).
 *   - beforeReadFile: `{permission, user_message}` is honoured.
 *
 * For multi-file Composer refuse-first we lean on `beforeMCPExecution`
 * (tool.mjs) for the `Write`/`Edit` MCP tools where Cursor routes its
 * own internal edits; that hook fires BEFORE the write lands.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  emit,
  readStdinJson,
  resolvePolicyPath,
  loadBridge,
  safeReadFile,
} from "./_lib.mjs";

async function main() {
  const input = await readStdinJson();
  const event = input.hook_event_name || "";
  const filePath = input.file_path;
  if (!filePath) {
    // Nothing to check; allow.
    emit({ permission: "allow" }, 0);
    return;
  }

  const policyPath = resolvePolicyPath(input);
  if (!policyPath) {
    // Fail-closed: can't evaluate policy → deny.
    emit(
      {
        permission: "deny",
        user_message: `Chio: no .chio/policy.yaml found in workspace (${event}).`,
        agent_message: "No chio policy loaded; refuse-first until /chio-init has run.",
      },
      2,
    );
    return;
  }

  const bridge = await loadBridge();

  // Load policy once and reuse its rules.
  let policy;
  try {
    policy = await bridge.loadPolicy(policyPath);
  } catch (err) {
    emit(
      {
        permission: "deny",
        user_message: `Chio: policy load failed: ${err.message}`,
        agent_message: `policy_load_failed: ${err.message}`,
      },
      2,
    );
    return;
  }
  const lint = await bridge.lintPolicy(policy);
  if (lint.errors && lint.errors.length > 0) {
    emit(
      {
        permission: "deny",
        user_message: `Chio: policy has ${lint.errors.length} error(s). Run /chio-init to regenerate.`,
        agent_message: lint.errors.map((e) => `${e.path}: ${e.message}`).join("; "),
      },
      2,
    );
    return;
  }

  // Lazy-load our secret + patch detectors. We accept the `dist/`
  // build (if the extension was built) or fall back to a minimal inline
  // scan so the hook never fails to run because an adjacent bundle
  // is missing.
  const { detectSecrets } = await loadDetector();
  const { checkPatchLocal } = await loadPatchChecker();

  // Gather the content we should scan.
  let contentAfter = "";
  if (event === "afterFileEdit" && Array.isArray(input.edits)) {
    contentAfter = input.edits.map((e) => e.new_string ?? "").join("\n");
    // Augment with on-disk contents when available (Cursor has already
    // written them at this point).
    if (existsSync(filePath)) contentAfter += "\n" + safeReadFile(filePath);
  } else if (event === "beforeReadFile") {
    // beforeReadFile gives us the file contents to scan.
    contentAfter = typeof input.content === "string" ? input.content : safeReadFile(filePath);
  } else if (typeof input.content === "string") {
    contentAfter = input.content;
  } else {
    contentAfter = safeReadFile(filePath);
  }

  // Real secret scan.
  const findings = detectSecrets(contentAfter);

  // Real patch-integrity check. Forward workspace_roots so the
  // checker can compute a workspace-relative path before glob-matching
  // the policy patterns (which are written as `./src/**`-style globs).
  const patchResult = await checkPatchLocal(
    {
      files: [{ path: filePath, after: contentAfter, edits: input.edits }],
      policyPath,
      workspaceRoots: Array.isArray(input.workspace_roots) ? input.workspace_roots : [],
    },
    { bridge, policy },
  );

  const denyReasons = [];
  if (findings.length > 0) {
    denyReasons.push(
      `secrets_scan: ${findings.length} finding(s) — ${findings.map((f) => f.kind).join(", ")}`,
    );
  }
  if (patchResult.decision === "deny") {
    denyReasons.push(...patchResult.reasons);
  }

  if (denyReasons.length > 0) {
    emit(
      {
        permission: "deny",
        user_message: `Chio denied ${path.basename(filePath)}: ${denyReasons[0]}`,
        agent_message: denyReasons.join("; "),
      },
      2,
    );
    return;
  }
  emit({ permission: "allow" }, 0);
}

async function loadDetector() {
  // Prefer the extension's compiled secrets module. Not guaranteed to
  // exist, so fall back to a built-in mirror.
  try {
    const candidate = path.resolve(process.cwd(), "dist", "extension.js");
    if (existsSync(candidate)) {
      // Extension bundle is CJS; we can't import named exports cleanly.
      // Use the fallback for simplicity + determinism in hooks.
    }
  } catch {
    /* ignore */
  }
  return { detectSecrets: inlineDetectSecrets };
}

async function loadPatchChecker() {
  return { checkPatchLocal: checkPatchInline };
}

/**
 * Minimal mirror of src/chio/secrets.ts detectSecrets — kept in sync
 * by test/secrets.test.ts (which asserts both implementations on the
 * same fixtures).
 */
function inlineDetectSecrets(text) {
  if (!text) return [];
  const RULES = [
    ["aws.access_key", /\bAKIA[0-9A-Z]{16}\b/g],
    ["aws.asia_key", /\bASIA[0-9A-Z]{16}\b/g],
    ["github.token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g],
    ["stripe.key", /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/g],
    ["slack.token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
    ["google.api_key", /\bAIza[0-9A-Za-z_\-]{35}\b/g],
    ["jwt", /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g],
    [
      "pem.private_key",
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/g,
    ],
  ];
  const out = [];
  for (const [kind, re] of RULES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      out.push({ kind, match: m[0].slice(0, 80), index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  // Generic credential rule with entropy filter.
  const genRe =
    /\b(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|auth[_-]?token|private[_-]?key)\s*[:=]\s*["']([^"'\s]{16,})["']/gi;
  let g;
  while ((g = genRe.exec(text)) !== null) {
    const raw = g[0];
    const val = g[1];
    const low = raw.toLowerCase();
    if (/\b(?:redacted|example|placeholder|changeme|your[_-]?|xxxx|<.*>)\b/.test(low)) continue;
    const classes =
      Number(/[A-Z]/.test(val)) + Number(/[a-z]/.test(val)) + Number(/[0-9]/.test(val));
    if (classes < 2) continue;
    if (/^(.)\1+$/.test(val)) continue;
    out.push({ kind: "generic.credential", match: raw.slice(0, 80), index: g.index });
  }
  return out;
}

async function checkPatchInline(input, ctx) {
  const rules = (ctx.policy.rules || {});
  const forbidden = asArray(rules.forbidden_paths?.patterns);
  const writeAllow = asArray(rules.path_allowlist?.write);
  const pi = rules.patch_integrity || {};
  const reasons = [];
  const deniedFiles = [];
  const roots = Array.isArray(input.workspaceRoots) ? input.workspaceRoots : [];
  let adds = 0;
  let dels = 0;

  if (typeof pi.max_files === "number" && input.files.length > pi.max_files) {
    reasons.push(`patch_integrity.max_files: patch touches ${input.files.length} files (max ${pi.max_files})`);
  }

  for (const f of input.files) {
    const rel = toRel(f.path, roots);
    let denied = false;
    for (const pat of forbidden) {
      if (globMatch(rel, pat)) {
        reasons.push(`forbidden_paths: ${rel} matches ${pat}`);
        deniedFiles.push(f.path);
        denied = true;
        break;
      }
    }
    if (!denied && writeAllow.length > 0) {
      const ok = writeAllow.some((p) => globMatch(rel, p));
      if (!ok) {
        reasons.push(`path_allowlist.write: ${rel} not in allowlist (${writeAllow.join(", ")})`);
        deniedFiles.push(f.path);
      }
    }
    const after = typeof f.after === "string" ? f.after : "";
    const addedLines = countLines(after);
    const beforeLines = 0;
    adds += Math.max(addedLines - beforeLines, 0);
    if (Array.isArray(f.edits)) {
      for (const e of f.edits) dels += countLines(e.old_string || "");
    }
  }

  if (typeof pi.max_additions === "number" && adds > pi.max_additions) {
    reasons.push(`patch_integrity.max_additions: +${adds} > ${pi.max_additions}`);
  }
  if (typeof pi.max_deletions === "number" && dels > pi.max_deletions) {
    reasons.push(`patch_integrity.max_deletions: -${dels} > ${pi.max_deletions}`);
  }
  const decision = reasons.length === 0 && deniedFiles.length === 0 ? "allow" : "deny";
  return { decision, reasons, deniedFiles, adds, dels };
}

function asArray(v) {
  if (Array.isArray(v)) return v.filter((s) => typeof s === "string");
  return [];
}
function toRel(p, roots = []) {
  let s = p.replace(/\\/g, "/");
  // If we have workspace roots and the file is under one of them, return
  // the workspace-relative path so policy globs like `./src/**` match.
  for (const r of roots) {
    if (typeof r !== "string" || !r) continue;
    const normRoot = r.replace(/\\/g, "/").replace(/\/$/, "");
    if (s === normRoot) return "";
    if (s.startsWith(normRoot + "/")) {
      return s.slice(normRoot.length + 1);
    }
  }
  if (s.startsWith("/")) s = s.slice(1);
  while (s.startsWith("./")) s = s.slice(2);
  return s;
}
function countLines(text) {
  if (!text) return 0;
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
function globMatch(p, pat) {
  let q = pat.replace(/\\/g, "/");
  if (q.startsWith("./")) q = q.slice(2);
  if (q.startsWith("/")) q = q.slice(1);
  let re = "^";
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === "*") {
      if (q[i + 1] === "*") {
        re += ".*";
        i++;
        if (q[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === ".") {
      re += "\\.";
    } else if (c === "/") {
      re += "/";
    } else if ("+^$|(){}[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re).test(p);
}

// Entry point — fail-closed on any error.
main().catch((err) => {
  try {
    process.stdout.write(
      JSON.stringify({
        permission: "deny",
        user_message: `Chio hook crashed: ${err && err.message ? err.message : String(err)}`,
      }),
    );
  } catch {
    /* noop */
  }
  process.exit(2);
});
