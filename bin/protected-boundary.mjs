import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const allowedTools = ['read_text_file', 'write_file', 'edit_file', 'list_directory'];
export const within = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep);
const q = value => JSON.stringify(value);
const sameNames = (a, b) => Array.isArray(a) && a.every(name => typeof name === 'string') && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export async function privateFile(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.mode & 0o077 || stat.uid !== process.getuid() || stat.size > 1024 * 1024) {
    throw new Error('Operator configuration must be a private, singly linked regular file owned by this operator');
  }
  return realpath(file);
}

export function validateSessionConfig(config, now = Math.floor(Date.now() / 1000)) {
  const execution = config?.execution;
  const credential = config?.sessionCredential;
  if (!execution || typeof execution.bearerToken !== 'string' || !execution.bearerToken ||
      !Array.isArray(config.tools) || config.tools.length !== allowedTools.length ||
      !sameNames(config.tools.map(tool => tool.name), allowedTools)) {
    throw new Error('Gateway must expose exactly the four qualified filesystem tools');
  }
  if (!credential || credential.schema !== 'chio.mcp.session-credential.v1' ||
      !execution.sessionId || credential.sessionId !== execution.sessionId ||
      !/^[a-f0-9]{64}$/i.test(execution.subjectKey) || credential.subjectKey !== execution.subjectKey ||
      !execution.capabilityId || !sameNames(credential.capabilityIds, [execution.capabilityId]) ||
      !execution.serverId || credential.serverId !== execution.serverId || credential.endpointPath !== '/mcp' ||
      !sameNames(credential.allowedTools, allowedTools) || !Number.isSafeInteger(credential.issuedAt) ||
      !Number.isSafeInteger(credential.expiresAt) || credential.issuedAt > now + 5 || credential.expiresAt <= now ||
      credential.expiresAt <= credential.issuedAt || credential.expiresAt - credential.issuedAt > 3600 ||
      !Array.isArray(execution.trustedSigners) || !execution.trustedSigners.length ||
      execution.trustedSigners.some(signer => !/^[a-f0-9]{64}$/i.test(signer)) ||
      typeof config.sessionId !== 'string' || !config.sessionId || !path.isAbsolute(config.journalDir ?? '')) {
    throw new Error('Prepare a live, bounded kernel session credential; bootstrap bearer configurations are unsupported');
  }
  const endpoint = new URL(execution.endpoint);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port ||
      !['/', '/mcp'].includes(endpoint.pathname) || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
    throw new Error('Protected candidate requires an explicit 127.0.0.1 kernel port and root or /mcp base path');
  }
  // Do not copy extra operator fields or preparation credentials into the host.
  return {
    execution: Object.fromEntries(['endpoint', 'bearerToken', 'trustedSigners', 'serverId', 'subjectKey', 'capabilityId', 'sessionId', 'timeoutMs']
      .filter(key => execution[key] !== undefined).map(key => [key, execution[key]])),
    sessionId: config.sessionId, journalDir: config.journalDir, tools: config.tools,
    sessionCredential: Object.fromEntries(['schema', 'sessionId', 'subjectKey', 'capabilityIds', 'serverId', 'endpointPath', 'allowedTools', 'issuedAt', 'expiresAt']
      .map(key => [key, credential[key]])),
  };
}

export async function inspectJournal(directory) {
  const canonical = await realpath(directory);
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || stat.mode & 0o077) {
    throw new Error('Journal must be a dedicated private directory owned by the operator');
  }
  for (const entry of await readdir(canonical)) {
    if (!/^(authority\.binding|gateway\.lock|[a-f0-9]{64}\.json)$/.test(entry)) throw new Error('Journal contains unrelated files');
    const child = await lstat(path.join(canonical, entry));
    if (!child.isFile() || child.isSymbolicLink() || child.nlink !== 1 || child.uid !== process.getuid() || child.mode & 0o077) {
      throw new Error('Journal contains a nonprivate or linked entry');
    }
  }
  return canonical;
}

export async function pinnedRuntime(root, lock) {
  const canonical = await realpath(root);
  const files = [];
  for (const [name, digest] of Object.entries(lock.files)) {
    const candidate = path.join(canonical, name);
    const resolved = await realpath(candidate);
    const stat = await lstat(candidate);
    if (!within(resolved, canonical) || !stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 ||
        createHash('sha256').update(await readFile(resolved)).digest('hex') !== digest) {
      throw new Error(`Cursor runtime does not match the pinned ${lock.hostVersion} artifact: ${name}`);
    }
    files.push(resolved);
  }
  return files;
}

export async function runtimeLibraries(executable) {
  const files = new Set();
  const pending = [await realpath(executable)];
  while (pending.length) {
    const file = pending.pop();
    if (files.has(file)) continue;
    if (files.size >= 128) throw new Error('Runtime library graph exceeds qualified limit');
    files.add(file);
    const output = execFileSync('/usr/bin/otool', ['-L', file], { encoding: 'utf8', timeout: 5000 });
    for (const line of output.split('\n').slice(1)) {
      const library = line.trim().split(' ')[0];
      if (!library || library.startsWith('/usr/lib/') || library.startsWith('/System/')) continue;
      let resolved = library;
      if (library.startsWith('@rpath/')) {
        try { resolved = await realpath(path.join(path.dirname(file), library.slice(7))); }
        catch { resolved = path.join(path.dirname(executable), '..', 'lib', library.slice(7)); }
      } else if (library.startsWith('@loader_path/')) resolved = path.join(path.dirname(file), library.slice(13));
      else if (library.startsWith('@executable_path/')) resolved = path.join(path.dirname(executable), library.slice(17));
      if (!path.isAbsolute(resolved)) throw new Error('Unsupported runtime library location');
      pending.push(await realpath(resolved));
    }
  }
  return [...files];
}

export function buildSandboxPolicy({ files, control, profile, data, workspace, cliConfig, executables, gatewayPort }) {
  if (!Number.isSafeInteger(gatewayPort) || gatewayPort < 1 || gatewayPort > 65535) throw new Error('Explicit parent gateway TCP port required');
  const directories = [...new Set(files.map(file => path.dirname(file)))];
  // /System itself contains the Data-volume alias to operator files. Only
  // immutable OS subtrees belong in the read allowlist. No procargs sysctl.
  return `(version 1)
(deny default)
(deny file-link)
(allow file-read-metadata)
(allow file-read-data (literal "/"))
(allow sysctl-read (sysctl-name-prefix "hw.") (sysctl-name "kern.hostname") (sysctl-name "kern.ostype") (sysctl-name "kern.osrelease") (sysctl-name "kern.osversion") (sysctl-name "kern.osproductversion") (sysctl-name "kern.version") (sysctl-name "kern.maxfilesperproc") (sysctl-name "kern.tcsm_available") (sysctl-name "kern.tcsm_enable") (sysctl-name "machdep.cpu.brand_string"))
(allow mach-lookup (global-name "com.apple.system.logger") (global-name "com.apple.system.opendirectoryd.libinfo"))
(allow process-fork)
(allow process-info* (target self))
(allow signal (target children) (target self))
(allow process-exec ${executables.map(file => `(literal ${q(file)})`).join(' ')})
(allow network-outbound (remote tcp "localhost:${gatewayPort}"))
(allow file-read* (subpath "/System/Library") (subpath "/System/Volumes/Preboot/Cryptexes/OS") (subpath "/usr/lib") (subpath "/Library/Apple/System") (subpath "/private/var/db/dyld")
  (literal "/private/etc/localtime") (literal "/private/etc/hosts") (literal "/private/etc/resolv.conf")
  (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom")
  (subpath ${q(control)}) ${files.map(file => `(literal ${q(file)})`).join('\n  ')})
(allow file-read-data (require-all (vnode-type DIRECTORY) (require-any ${[...directories, workspace].map(dir => `(literal ${q(dir)})`).join(' ')})))
(allow file-read* file-write* (subpath ${q(profile)}) (subpath ${q(data)}) (literal "/dev/null"))
(allow file-read* (subpath ${q(path.join(workspace, '.cursor'))}))
(deny file-write* (subpath ${q(control)}) (subpath ${q(path.join(workspace, '.cursor'))}) (literal ${q(cliConfig)}))
`;
}
