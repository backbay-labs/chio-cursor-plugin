import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { checkPatch, matchesGlob } from "../src/chio/patch.ts";

async function withTempPolicy(body: string, run: (p: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chio-patch-"));
  const p = path.join(dir, "policy.yaml");
  await fs.writeFile(p, body, "utf8");
  try {
    await run(p);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("denies write to forbidden_paths", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  forbidden_paths:\n    patterns:\n      - "**/.env"\n`;
  await withTempPolicy(yaml, async (policyPath) => {
    const r = await checkPatch({
      files: [{ path: "/abs/repo/.env", after: "FOO=bar\n" }],
      policyPath,
    });
    assert.equal(r.decision, "deny");
    assert.ok(r.reasons.some((s) => s.includes("forbidden_paths")));
    assert.deepEqual(r.deniedFiles, ["/abs/repo/.env"]);
  });
});

test("denies write outside path_allowlist.write", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  path_allowlist:\n    write:\n      - "./src/**"\n`;
  await withTempPolicy(yaml, async (policyPath) => {
    const r = await checkPatch({
      files: [{ path: "docs/readme.md", after: "hi" }],
      policyPath,
    });
    assert.equal(r.decision, "deny");
    assert.ok(r.reasons.some((s) => s.includes("path_allowlist.write")));
  });
});

test("allows write inside allowlist", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  path_allowlist:\n    write:\n      - "./src/**"\n`;
  await withTempPolicy(yaml, async (policyPath) => {
    const r = await checkPatch({
      files: [{ path: "src/index.ts", after: "export const x = 1;\n" }],
      policyPath,
    });
    assert.equal(r.decision, "allow", `expected allow got ${JSON.stringify(r)}`);
  });
});

test("denies on max_files overflow", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  patch_integrity:\n    max_files: 2\n`;
  await withTempPolicy(yaml, async (policyPath) => {
    const r = await checkPatch({
      files: [
        { path: "a.ts", after: "" },
        { path: "b.ts", after: "" },
        { path: "c.ts", after: "" },
      ],
      policyPath,
    });
    assert.equal(r.decision, "deny");
    assert.ok(r.reasons.some((s) => s.includes("max_files")));
  });
});

test("deny on embedded AWS key even if path is allowed", async () => {
  const yaml = `hushspec: "0.1.0"\nname: t\nrules:\n  path_allowlist:\n    write:\n      - "**/*"\n`;
  await withTempPolicy(yaml, async (policyPath) => {
    const r = await checkPatch({
      files: [{ path: "src/bad.ts", after: "const k = 'AKIAIOSFODNN7EXAMPLE';\n" }],
      policyPath,
    });
    assert.equal(r.decision, "deny");
    assert.ok(r.reasons.some((s) => s.includes("secrets_scan")));
  });
});

test("glob matcher handles ** correctly", () => {
  assert.equal(matchesGlob("src/deep/nested/x.ts", "src/**"), true);
  assert.equal(matchesGlob(".env", "**/.env"), true);
  assert.equal(matchesGlob("a/b/c/.env", "**/.env"), true);
  assert.equal(matchesGlob("notenv", "**/.env"), false);
});
