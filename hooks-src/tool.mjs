#!/usr/bin/env node
/**
 * Cursor hook: `beforeMCPExecution`. Fires before any MCP tool call,
 * whether from the Agent tab, Composer, or inline AI.
 *
 * stdin:
 *   {
 *     tool_name: "search",
 *     tool_input: { ... },
 *     url | command: "<mcp server address>",
 *     ...base fields
 *   }
 *
 * We route the call through `ChioBridge.check` (which hits arc's
 * evaluation path for the tool) and translate the verdict into the
 * Cursor hook output shape.
 */

import process from "node:process";
import { emit, readStdinJson, resolvePolicyPath, loadBridge } from "./_lib.mjs";

async function main() {
  const input = await readStdinJson();
  const tool = input.tool_name;
  if (!tool) {
    emit({ permission: "allow" }, 0);
    return;
  }

  const policyPath = resolvePolicyPath(input);
  if (!policyPath) {
    emit(
      {
        permission: "deny",
        user_message: "Chio: no .chio/policy.yaml; refusing MCP tool until /chio-init runs.",
      },
      2,
    );
    return;
  }

  const bridge = await loadBridge();

  // Prefer the CLI path (chio check --policy) for tool checks so we get
  // a receipt persisted to the local receipt DB, which the PR evidence
  // bundle will harvest later. The trust URL + token come from env when
  // set by chio-test-harness.
  const trustUrl = process.env.CHIO_TRUST_URL || "http://127.0.0.1:8940";
  const mcpUrl = process.env.CHIO_MCP_URL || "http://127.0.0.1:8931";
  const token = process.env.CHIO_TOKEN || "";

  let instance;
  if (token) {
    instance = bridge.ChioBridge.fromDaemon({
      trustUrl,
      mcpEdgeUrl: mcpUrl,
      token,
      ...(process.env.CHIO_RECEIPT_DB ? { receiptDbPath: process.env.CHIO_RECEIPT_DB } : {}),
    });
  } else {
    instance = bridge.ChioBridge.fromCli({});
  }

  let verdict;
  try {
    verdict = await instance.check({
      tool,
      params: input.tool_input ?? {},
      policyPath,
      ...(typeof input.server === "string" ? { serverId: input.server } : {}),
    });
  } catch (err) {
    emit(
      {
        permission: "deny",
        user_message: `Chio: MCP check failed: ${err.message}`,
        agent_message: `check_failed: ${err.message}`,
      },
      2,
    );
    return;
  }

  if (verdict.decision === "allow") {
    emit({ permission: "allow" }, 0);
    return;
  }
  emit(
    {
      permission: "deny",
      user_message: `Chio denied MCP tool ${tool}: ${verdict.reason ?? verdict.guard ?? "policy denied"}`,
      agent_message: `${verdict.decision}${verdict.guard ? ` [${verdict.guard}]` : ""}: ${verdict.reason ?? ""}`,
    },
    2,
  );
}

main().catch((err) => {
  try {
    process.stdout.write(
      JSON.stringify({
        permission: "deny",
        user_message: `Chio tool hook crashed: ${err && err.message ? err.message : String(err)}`,
      }),
    );
  } catch {
    /* noop */
  }
  process.exit(2);
});
