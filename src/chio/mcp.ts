/**
 * MCP mesh discovery + registration into Cursor.
 *
 * Discovery hits `ChioBridge.discoverMcpServers()` (which talks to the
 * arc MCP edge's `/admin/sessions`). For each newly-seen server we:
 *
 *   1. Compute an attenuation scope from the active policy's
 *      `rules.tool_access` block (default-block → enumerate allows).
 *   2. Register the attenuated server in `.cursor/mcp.json` under the
 *      `mcpServers` map, pointing at the arc MCP edge URL with the
 *      capability id we just attenuated.
 *
 * The result is that every MCP server discovered on the mesh becomes a
 * real Cursor-registered MCP server whose traffic is mediated by arc.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { loadPolicy, type McpServerInfo, type AttenuationDelta } from "@chio/bridge";
import type { ChioClient } from "./client.ts";

export interface MeshDiscoveryResult {
  discovered: McpServerInfo[];
  registered: RegisteredServer[];
  errors: Array<{ server: string; error: string }>;
}

export interface RegisteredServer {
  id: string;
  url: string;
  allowedTools: string[];
  deniedTools: string[];
  capabilityId?: string;
}

/**
 * Fetch live MCP servers from the arc MCP edge, attenuate them to the
 * current policy, and write them into `.cursor/mcp.json` inside the
 * workspace. This is the real `/chio-attach-mcp` / sidebar action.
 */
export async function discoverAndRegister(opts: {
  client: ChioClient;
  workspaceRoot: string;
  policyPath: string;
  mcpEdgeUrl: string;
}): Promise<MeshDiscoveryResult> {
  const servers = await opts.client.discoverMcpServers();
  const registered: RegisteredServer[] = [];
  const errors: Array<{ server: string; error: string }> = [];

  const policy = await loadPolicy(opts.policyPath).catch(() => null);
  const ta = (policy?.rules as { tool_access?: unknown } | undefined)?.tool_access as
    | { allow?: unknown; deny?: unknown; default?: string }
    | undefined;
  const policyAllow = new Set(asStringArray(ta?.allow));
  const policyDeny = new Set(asStringArray(ta?.deny));
  const defaultAllow = ta?.default !== "block";

  for (const s of servers) {
    try {
      const tools = s.tools ?? [];
      const allowed: string[] = [];
      const denied: string[] = [];
      for (const t of tools) {
        const qualified = `${s.id}.${t}`;
        if (policyDeny.has(t) || policyDeny.has(qualified)) {
          denied.push(t);
          continue;
        }
        if (policyAllow.size > 0) {
          if (policyAllow.has(t) || policyAllow.has(qualified)) allowed.push(t);
          else denied.push(t);
        } else if (defaultAllow) {
          allowed.push(t);
        } else {
          denied.push(t);
        }
      }

      let capabilityId: string | undefined;
      const passport = opts.client.currentPassport;
      if (passport?.capabilityId && allowed.length > 0) {
        const delta: AttenuationDelta = {
          scope: {
            grants: allowed.map((tool_name) => ({ server_id: s.id, tool_name })),
          },
        };
        try {
          capabilityId = await opts.client.attenuate(passport.capabilityId, delta);
        } catch (err) {
          errors.push({
            server: s.id,
            error: `attenuate_failed: ${(err as Error).message}`,
          });
        }
      }

      registered.push({
        id: s.id,
        url: s.url ?? opts.mcpEdgeUrl,
        allowedTools: allowed,
        deniedTools: denied,
        ...(capabilityId ? { capabilityId } : {}),
      });
    } catch (err) {
      errors.push({ server: s.id, error: (err as Error).message });
    }
  }

  await writeCursorMcp(opts.workspaceRoot, registered, opts.mcpEdgeUrl);

  return { discovered: servers, registered, errors };
}

/**
 * Update `.cursor/mcp.json` with the chio-attenuated server set. We
 * preserve unrelated entries the user may have added by hand: we only
 * touch keys we own, namespaced with the `chio.` prefix.
 */
async function writeCursorMcp(
  workspaceRoot: string,
  registered: RegisteredServer[],
  edgeUrl: string,
): Promise<void> {
  const p = path.join(workspaceRoot, ".cursor", "mcp.json");
  let existing: Record<string, unknown> = {};
  try {
    const text = await fs.readFile(p, "utf8");
    existing = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // missing is fine.
  }
  const mcpServers = ((existing.mcpServers as Record<string, unknown>) ?? {}) as Record<
    string,
    unknown
  >;
  // Drop any old chio-owned entries before rewriting.
  for (const key of Object.keys(mcpServers)) {
    if (key.startsWith("chio.")) delete mcpServers[key];
  }
  for (const r of registered) {
    const entry: Record<string, unknown> = {
      url: `${edgeUrl}/mcp`,
      type: "http",
      headers: {
        "X-Chio-Upstream": r.id,
      },
    };
    if (r.capabilityId) {
      (entry.headers as Record<string, string>)["X-Chio-Capability"] = r.capabilityId;
    }
    if (r.allowedTools.length > 0) entry.allowedTools = r.allowedTools;
    mcpServers[`chio.${r.id}`] = entry;
  }
  existing.mcpServers = mcpServers;
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(existing, null, 2), "utf8");
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((s): s is string => typeof s === "string");
  return [];
}
