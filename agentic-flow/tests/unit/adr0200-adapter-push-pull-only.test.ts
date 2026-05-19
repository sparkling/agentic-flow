/**
 * ADR-0200 — SyncCoordinatorFederatedAdapter prefers pushOnly()/pullOnly()
 * when available, falls back to bidirectional sync() when not.
 *
 * The agentdb-side `SyncCoordinator` gained `pushOnly()`/`pullOnly()` in
 * ADR-0200. The adapter routes to them when present so callers asking for
 * `push()` no longer pay the cost of an unwanted inbound pull (and vice
 * versa). When the adapter is wrapping an older `SyncCoordinator` that
 * predates ADR-0200, both methods fall back to the bidirectional `sync()`
 * surface for backwards compatibility.
 */

import { describe, it, expect, vi } from 'vitest';
import { SyncCoordinatorFederatedAdapter, type SyncCoordinatorLike } from '../../src/services/sync-coordinator-federated-adapter.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function mkAdapter(coord: SyncCoordinatorLike) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'adr0200-adapter-'));
  return new SyncCoordinatorFederatedAdapter({ syncCoordinator: coord, projectRoot });
}

describe('ADR-0200 — adapter prefers pushOnly/pullOnly when available', () => {
  it('push() calls pushOnly() and does NOT call sync() when pushOnly is present', async () => {
    const sync = vi.fn().mockResolvedValue({ success: true, itemsPushed: 99, itemsPulled: 99 });
    const pushOnly = vi.fn().mockResolvedValue({
      success: true,
      durationMs: 12,
      itemsPushed: 7,
      errors: [],
    });
    const adapter = mkAdapter({ sync, pushOnly });

    const report = await adapter.push();

    expect(pushOnly).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();
    expect(report.itemsTransferred).toBe(7);
    expect(report.success).toBe(true);
    expect(report.conflictsResolved).toBe(0); // push has no conflict resolution
  });

  it('pull() calls pullOnly() and does NOT call sync() when pullOnly is present', async () => {
    const sync = vi.fn().mockResolvedValue({ success: true, itemsPushed: 99, itemsPulled: 99 });
    const pullOnly = vi.fn().mockResolvedValue({
      success: true,
      durationMs: 20,
      itemsPulled: 5,
      conflictsResolved: 2,
      errors: [],
    });
    const adapter = mkAdapter({ sync, pullOnly });

    const report = await adapter.pull();

    expect(pullOnly).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();
    expect(report.itemsTransferred).toBe(5);
    expect(report.conflictsResolved).toBe(2);
  });

  it('push() falls back to bidirectional sync() when pushOnly is absent (legacy)', async () => {
    const sync = vi.fn().mockResolvedValue({
      success: true,
      durationMs: 30,
      itemsPushed: 4,
      itemsPulled: 11,
      conflictsResolved: 1,
      errors: [],
    });
    const adapter = mkAdapter({ sync });

    const report = await adapter.push();

    expect(sync).toHaveBeenCalledTimes(1);
    expect(report.itemsTransferred).toBe(4); // sliced from itemsPushed
    expect(report.conflictsResolved).toBe(1);
  });

  it('pull() falls back to bidirectional sync() when pullOnly is absent (legacy)', async () => {
    const sync = vi.fn().mockResolvedValue({
      success: true,
      durationMs: 30,
      itemsPushed: 4,
      itemsPulled: 11,
      conflictsResolved: 1,
      errors: [],
    });
    const adapter = mkAdapter({ sync });

    const report = await adapter.pull();

    expect(sync).toHaveBeenCalledTimes(1);
    expect(report.itemsTransferred).toBe(11); // sliced from itemsPulled
    expect(report.conflictsResolved).toBe(1);
  });

  it('errors from pushOnly propagate through the adapter report (no swallow)', async () => {
    const pushOnly = vi.fn().mockResolvedValue({
      success: false,
      durationMs: 5,
      itemsPushed: 0,
      errors: ['network unreachable', 'retry exhausted'],
    });
    const adapter = mkAdapter({ sync: vi.fn(), pushOnly });

    const report = await adapter.push();

    expect(report.success).toBe(false);
    expect(report.errors).toEqual(['network unreachable', 'retry exhausted']);
  });

  it('a throw inside pushOnly propagates (per feedback-no-fallbacks)', async () => {
    const pushOnly = vi.fn().mockRejectedValue(new Error('coordinator exploded'));
    const adapter = mkAdapter({ sync: vi.fn(), pushOnly });

    await expect(adapter.push()).rejects.toThrow('coordinator exploded');
  });
});
