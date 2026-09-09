import { build, context } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);

const watch = process.argv.includes("--watch");

const opts = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  minify: !watch,
  external: ["vscode"],
  logLevel: "info",
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
} else {
  await build(opts);
  await build({
    entryPoints: [path.join(path.dirname(require.resolve("@chio/bridge/package.json")), "dist/gateway.js")],
    bundle: true,
    outfile: "dist/gateway.mjs",
    platform: "node",
    target: "node22",
    format: "esm",
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: "info",
  });
  await build({
    entryPoints: ["pretooluse", "composer", "shell", "tool"].map(name => `hooks-src/${name}.mjs`),
    bundle: true,
    outdir: "dist/hooks",
    outExtension: { ".js": ".mjs" },
    platform: "node",
    target: "node22",
    format: "esm",
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: "info",
  });
}
