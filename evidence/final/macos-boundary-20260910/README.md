# Current-source macOS boundary component result

Status: **PASS for this component**, 3 tests passed, 0 failed, 0 skipped.
Cursor remains **NOT ACCEPTED**. Its authenticated AgentService server-action
contract remains unresolved; this run used neither a Cursor agent nor a Chio
kernel and closes no I01-I08 host acceptance gate.

## Exact skipped case and prior evidence

[Public source CI run 34447190158](https://github.com/backbay-labs/chio-cursor-plugin/actions/runs/34447190158)
checked source `16c213afec93d63aeea7112681084f4336f3766a` on Ubuntu 24.04
with Node 22.19.0. Its unit result is 32 passed and 1 skipped out of 33.
The sole skip is `test/protected-boundary.test.mjs:44`,
`actual macOS process boundary blocks operator reads, aliases, links, writes and unrelated network`.
The test explicitly skips when `process.platform !== 'darwin'`.
The Linux run remains a recorded skip; this local result does not rewrite it.

The older retained `../cursor-protocol-component-suite.txt` already showed
this case passing on macOS. The test and its imported boundary module are
byte-identical at its recorded source `cb39b30d45c9743bd373c2e794e3925bf670291b`
and the current source. The new execution adds explicit current-source,
Node 22.19.0, environment and artifact-byte binding instead of promoting an
undifferentiated older suite transcript.

## Actual local execution

The exact file ran on macOS 26.4, build 25E246, arm64, from a fresh clean
worktree at `16c213afec93d63aeea7112681084f4336f3766a`, tree
`14b90b8e9e7257f39f21ee635eef9da43fae2aee`.
Node was the pinned official 22.19.0 binary, SHA256
`0d005c18e095027ca8f9fe1cc1126f767ee4ad7b004f4d6fb781ec4228a7c5d1`.
Execution began at 2026-09-10 08:23:03 UTC and returned exit 0.
The temporary HOME, TMPDIR and test fixtures were isolated; normal profiles
and credentials were not needed. Test-created fixtures were removed by the
existing test cleanup. No production source or test logic changed.

```sh
/absolute/node-v22.19.0-darwin-arm64/bin/node \
  --test --test-reporter=tap test/protected-boundary.test.mjs
```

`execution.json` records the exact command, clean source, environment, OS,
Node identity, start/end timestamps, input hashes before and after, and
stdout/stderr hashes. All five recorded source inputs were unchanged.

The three passing tests covered configuration authority checks, private
operator configuration/journal file validation, and actual sandboxed processes.
In the sandbox case:

- The scoped fixture configuration was readable, and private profile state
  was writable.
- Operator and journal reads, journal/control/policy writes, Data-volume aliases,
  symlink escape and hardlink creation returned `EPERM`.
- A descendant Node process inherited the operator-read denial; an unapproved
  `/bin/cat` executable could not start.
- The allowed network request returned HTTP 200; the unrelated destination was
  blocked. Independent parent listeners observed exactly 1 allowed request
  and 0 forbidden requests.

`test.stdout` preserves all TAP assertions and the original diagnostic JSON.
`result.json` extracts counts and observations without replacing that raw output.
These process probes are component evidence, not model-driven Cursor effects.

## Artifact byte binding

The tested `bin/protected-boundary.mjs` SHA256 is
`24ae2d108d14c5f4f959be3282f75b8bb4dcb89af6936324b300317775beeb11`.
It exactly matches that member in all four archives below. Supplied archive
checksums also verified. The test itself is SHA256
`0e089c86b396a17b4fe51d461072542bf28a9be2661dc4c9ef149f245f7ae4d6`.

| Archive | SHA256 |
| --- | --- |
| Current CI npm package | `bfbc3a39ae273780b77563106a9dea1298b70375a2abcbf40ac0013665078364` |
| Current CI VSIX | `54d1f8339fef5d5f3aa9e428aa84d2eb5e1833fc4aa865ce9557e53042140b07` |
| Retained candidate npm package | `3bf370db52da7e5b6811ede6e74c5b3d197b96666b80e78c186d441feb4cde4a` |
| Retained candidate VSIX | `e2a8023475fea4ceb9464423e548a1aed0129872fe0d6d75f48bea32e98517f4` |

`artifact-byte-binding.json` records exact archive paths, member names, checksum
comparisons and the prior-source comparison. This binding covers the tested
module; it does not qualify other package code or promote any package to host
acceptance. No archive was rebuilt or replaced.

`hosted-ci.json` retains the exact run/job/source metadata.
`hosted-ci.log.gz` losslessly retains the CI log; its original and compressed
hashes are in `hosted-ci-log-encoding.json`.

Confidence: high in these bounded local component and byte-identity results.
The separate Cursor server enforcement boundary remains unknown.
