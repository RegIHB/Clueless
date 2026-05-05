/**
 * Feature flags for the v2 wardrobe persistence rollout. These reflect server-
 * side env so the same code can run dual-write or v2-only deployments.
 *
 * Phase 1: dual-write to v1 + v2, read v1 (`SYNC_DUAL_WRITE=1`, `SYNC_READ_V2=0`).
 * Phase 2: read v2, dual-write (`SYNC_DUAL_WRITE=1`, `SYNC_READ_V2=1`).
 * Phase 3: v2 only (`SYNC_DUAL_WRITE=0`, `SYNC_READ_V2=1`).
 */

const truthy = (v?: string | null) => v === '1' || v?.toLowerCase() === 'true';

/**
 * Read default: v2 (the redesign). Set `SYNC_READ_V2=0` to fall back to v1
 * during rollback. The browser-visible flag is `NEXT_PUBLIC_SYNC_READ_V2`.
 */
export function readFromV2(): boolean {
  if (typeof process === 'undefined') return true;
  const browser = process.env.NEXT_PUBLIC_SYNC_READ_V2;
  if (browser !== undefined) return truthy(browser);
  return !truthy(process.env.SYNC_READ_V2_DISABLED);
}

/**
 * Dual-write default: on. Keeps v1 in sync with v2 during the cut-over so we
 * can revert reads without data loss. Disable once v2 is the source of truth.
 */
export function dualWriteEnabled(): boolean {
  if (typeof process === 'undefined') return true;
  const explicit = process.env.SYNC_DUAL_WRITE;
  if (explicit !== undefined) return truthy(explicit);
  return true;
}

export type SyncRolloutSnapshot = {
  readFromV2: boolean;
  dualWrite: boolean;
};

export function snapshotSyncRollout(): SyncRolloutSnapshot {
  return {
    readFromV2: readFromV2(),
    dualWrite: dualWriteEnabled(),
  };
}
