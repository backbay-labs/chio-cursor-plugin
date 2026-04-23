# VERIFY — chio-cursor-plugin

## Build

```
$ npm install
added 7 packages, and audited 9 packages
$ npm run build
  dist/extension.js      168.1kb
  dist/extension.js.map  685.3kb
  Done in ~30ms
$ npx tsc --noEmit
# (clean, no output)
```

## Tests

```
$ npm test
✔ test/secrets.test.ts    12/12 pass
✔ test/patch.test.ts       6/6 pass
✔ test/hooks.test.mjs      8/8 pass
tests 26  pass 26  fail 0
```

## Manual hook probe

```
$ echo '{"hook_event_name":"afterFileEdit","file_path":"/tmp/chio-probe/src/leak.ts",
 "edits":[{"old_string":"","new_string":"const k=\"AKIAIOSFODNN7EXAMPLE\";"}],
 "workspace_roots":["/tmp/chio-probe"]}' | node hooks-src/composer.mjs
{"permission":"deny",
 "user_message":"Chio denied leak.ts: secrets_scan: 1 finding(s) — aws.access_key",
 "agent_message":"secrets_scan: 1 finding(s) — aws.access_key; path_allowlist.write: ..."}
EXIT=2   # Cursor block signal
```

Real deny on a real AWS access key id, fed through the real
`@chio/bridge` `loadPolicy` + `lintPolicy` path, emitted with the exact
`{permission: "deny"}` + exit 2 contract Cursor's hook docs specify.
