#!/usr/bin/env node
// Reads are checked before disclosure. Writes use preToolUse, never afterFileEdit.
import { checkEvent } from './_check.mjs';
await checkEvent(['beforeReadFile', 'beforeTabFileRead']);
