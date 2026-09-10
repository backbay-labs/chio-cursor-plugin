#!/usr/bin/env node
// The VSIX contains bundled JavaScript and runs without npm dependencies.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--out")) throw new Error("usage: npm run package -- --out /absolute/chio-cursor.vsix");
const original = readFileSync(join(root, "package.json"));
const manifest = JSON.parse(original);
const destination = resolve(args[1] ?? join(root, "artifacts", `chio-cursor-${manifest.version}.vsix`));
const stage = mkdtempSync(join(tmpdir(), "chio-vsix-stage-"));
function run(command, argv, cwd, capture=false) {
  const result=spawnSync(command,argv,{cwd,encoding:"utf8",stdio:capture?["ignore","pipe","pipe"]:"inherit"});
  if(result.status!==0) throw new Error(`${command} failed: ${result.stderr??result.error??result.status}`);
  return result.stdout??"";
}
try {
  run("npm",["run","build"],root);
  const listing=JSON.parse(run("npm",["pack","--dry-run","--json","--ignore-scripts"],root,true))[0];
  for(const file of listing.files) {
    if(file.path.startsWith("vendor/") || file.path.startsWith("node_modules/") || file.path.endsWith(".map")) continue;
    const target=join(stage,file.path);
    mkdirSync(dirname(target),{recursive:true});cpSync(join(root,file.path),target,{recursive:true});
  }
  const staged={...manifest,files:manifest.files.filter(file=>file!=="vendor")};
  delete staged.dependencies;delete staged.devDependencies;delete staged.scripts;
  delete staged.bundleDependencies;delete staged.bundledDependencies;
  writeFileSync(join(stage,"package.json"),`${JSON.stringify(staged,null,2)}\n`);
  mkdirSync(dirname(destination),{recursive:true});
  run(process.execPath,[join(root,"node_modules/@vscode/vsce/vsce"),"package","--no-dependencies","--out",destination],stage);
  const sha256=createHash("sha256").update(readFileSync(destination)).digest("hex");
  writeFileSync(`${destination}.sha256`,`${sha256}  ${basename(destination)}\n`);
  process.stdout.write(`${JSON.stringify({artifact:destination,sha256,dependencies:"bundled JavaScript only"})}\n`);
} finally {
  rmSync(stage,{recursive:true,force:true});
  if(!readFileSync(join(root,"package.json")).equals(original)) throw new Error("source manifest changed while packaging");
}
