import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

// Load only generated message definitions from the exact installed host. The
// CLI entrypoint is never executed and its archive is never modified. Keeping
// these definitions tied to its hash avoids an independently drifting schema.
export async function loadCursorProtocol(hostRoot) {
  const filename = path.join(hostRoot, 'index.js');
  const source = await readFile(filename, 'utf8');
  const lock = JSON.parse(await readFile(new URL('./cursor-runtime-lock.json', import.meta.url), 'utf8'));
  if (createHash('sha256').update(source).digest('hex') !== lock.files['index.js']) throw new Error('Cursor protocol bundle does not match the pinned runtime');
  const entry = 'var __webpack_exports__=__webpack_require__("./src/main.tsx")';
  if (source.split(entry).length !== 2) throw new Error('Pinned Cursor module registration contract changed');
  const context = { require: createRequire(filename), __filename: filename, __dirname: path.dirname(filename), Buffer, Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, process };
  vm.runInNewContext(source.replace(entry, 'globalThis.chioRequire=__webpack_require__'), context, { timeout: 10000, filename });
  const require = context.chioRequire;
  const types = new Map();
  for (const module of Object.keys(require.m).filter(name => name.includes('/proto/dist/generated/') && name.endsWith('_pb.js'))) {
    // Message definition modules have no host login or CLI initialization.
    for (const value of Object.values(require(module))) if (value?.typeName && value.fields) types.set(value.typeName, value);
  }
  return {
    type(name) { const value = types.get(name); if (!value) throw new Error(`Pinned Cursor schema missing: ${name}`); return value; },
    types,
    bundleSha256: lock.files['index.js'],
  };
}
