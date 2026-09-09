#!/usr/bin/env node
// Pre-action policy check. Cursor still owns execution after this returns.
import { checkEvent } from './_check.mjs';
await checkEvent(['preToolUse']);
