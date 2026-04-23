/**
 * Thin wrapper around `@chio/bridge` + local state for the VS Code
 * extension. Holds the live `ChioBridge`, the active passport, and
 * the snapshot that drives the status bar + sidebar. Every enforcement
 * path is delegated to the bridge (i.e. to arc), never stubbed.
 */
import * as vscode from "vscode";
import {
  ChioBridge,
  ChioBridgeError,
  type Passport,
  type BondStatus,
  type McpServerInfo,
  type AttenuationDelta,
  type ArcReceipt,
} from "@chio/bridge";

import { checkPatch, type PatchCheckInput, type PatchCheckResult } from "./patch.ts";

export type BondState = "bonded" | "at-risk" | "revoked" | "unbonded";

export interface BondSnapshot {
  state: BondState;
  policy?: string;
  agent?: string;
  passportId?: string;
  capabilityId?: string;
  budgetUsedMin: number;
  budgetTotalMin: number;
  receiptCount: number;
  lastReason?: string;
}

export interface ClientOptions {
  trustUrl: string;
  mcpUrl: string;
  token: string;
  receiptDbPath?: string;
}

export class ChioClient {
  private bridge: ChioBridge | null = null;
  private passport: Passport | null = null;
  private readonly emitter = new vscode.EventEmitter<BondSnapshot>();
  readonly onDidChange = this.emitter.event;

  private snapshot: BondSnapshot = {
    state: "unbonded",
    budgetUsedMin: 0,
    budgetTotalMin: 5,
    receiptCount: 0,
  };

  constructor(private options: ClientOptions) {}

  get current(): BondSnapshot {
    return this.snapshot;
  }

  get currentPassport(): Passport | null {
    return this.passport;
  }

  setOptions(next: Partial<ClientOptions>): void {
    this.options = { ...this.options, ...next };
    // Recreate bridge on next call so new URLs take effect.
    this.bridge = null;
  }

  private ensureBridge(): ChioBridge {
    if (this.bridge) return this.bridge;
    const opts: { trustUrl: string; mcpEdgeUrl: string; token: string; receiptDbPath?: string } = {
      trustUrl: this.options.trustUrl,
      mcpEdgeUrl: this.options.mcpUrl,
      token: this.options.token,
    };
    if (this.options.receiptDbPath) opts.receiptDbPath = this.options.receiptDbPath;
    this.bridge = ChioBridge.fromDaemon(opts);
    return this.bridge;
  }

  async bond(policyPath: string): Promise<BondSnapshot> {
    try {
      const b = this.ensureBridge();
      this.passport = await b.bond({ policyPath });
      const status = await this.safeStatus();
      const next: BondSnapshot = {
        state: "bonded",
        policy: policyPath,
        agent: this.passport.did,
        budgetUsedMin: status?.budgetUsedUsd ?? 0,
        budgetTotalMin: status?.budgetCapUsd ?? 5,
        receiptCount: 0,
      };
      if (this.passport.passportId) next.passportId = this.passport.passportId;
      if (this.passport.capabilityId) next.capabilityId = this.passport.capabilityId;
      this.update(next);
    } catch (err) {
      const msg = err instanceof ChioBridgeError ? err.message : (err as Error).message;
      this.update({ ...this.snapshot, state: "at-risk", lastReason: msg });
      throw err;
    }
    return this.snapshot;
  }

  async revoke(): Promise<void> {
    try {
      if (this.bridge && this.passport) {
        const target = this.passport.passportId ?? this.passport.did;
        await this.bridge.revoke(target);
      }
    } finally {
      this.passport = null;
      this.bridge = null;
      this.update({
        state: "revoked",
        budgetUsedMin: 0,
        budgetTotalMin: 5,
        receiptCount: 0,
      });
    }
  }

  /** Real patch-integrity check. */
  checkPatch(input: PatchCheckInput): Promise<PatchCheckResult> {
    return checkPatch(input);
  }

  async discoverMcpServers(): Promise<McpServerInfo[]> {
    try {
      const b = this.ensureBridge();
      return await b.discoverMcpServers();
    } catch (err) {
      // Surface as empty list but record the reason so the sidebar can show it.
      this.update({
        ...this.snapshot,
        lastReason: `mcp_discover_failed: ${(err as Error).message}`,
      });
      return [];
    }
  }

  async attenuate(capabilityId: string, delta: AttenuationDelta): Promise<string> {
    const b = this.ensureBridge();
    const token = await b.attenuate(capabilityId, delta);
    // CapabilityToken shape: { id, issuer, subject, scope, ... }
    const anyTok = token as unknown as { id?: string };
    return anyTok.id ?? capabilityId;
  }

  async recentReceipts(since: Date, limit = 100): Promise<ArcReceipt[]> {
    const b = this.ensureBridge();
    return b.receipts({ since, limit });
  }

  async verifyReceipt(r: ArcReceipt): Promise<boolean> {
    const b = this.ensureBridge();
    return b.verifyReceipt(r);
  }

  async exportEvidence(opts: { since: Date; until?: Date; outPath: string }): Promise<string> {
    const b = this.ensureBridge();
    return b.exportEvidence(opts);
  }

  bridgeOrNull(): ChioBridge | null {
    try {
      return this.ensureBridge();
    } catch {
      return null;
    }
  }

  private async safeStatus(): Promise<BondStatus | null> {
    if (!this.bridge || !this.passport) return null;
    try {
      const pid = this.passport.passportId ?? this.passport.did;
      return await this.bridge.status(pid);
    } catch {
      return null;
    }
  }

  private update(next: BondSnapshot): void {
    this.snapshot = next;
    this.emitter.fire(next);
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
