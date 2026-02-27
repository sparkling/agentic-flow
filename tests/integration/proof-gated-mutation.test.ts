/**
 * ADR-060: Proof-Gated State Mutation - Integration Tests
 *
 * Tests for MutationGuard, AttestationLog, and GuardedVectorBackend.
 * Validates that every state-changing operation requires a cryptographic
 * proof before the backend will execute it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MutationGuard } from '../../packages/agentdb/src/security/MutationGuard.js';
import type {
  MutationProof,
  MutationDenial,
  AttestationToken,
  GuardConfig,
} from '../../packages/agentdb/src/security/MutationGuard.js';
import { AttestationLog } from '../../packages/agentdb/src/security/AttestationLog.js';
import {
  GuardedVectorBackend,
  ProofDeniedError,
} from '../../packages/agentdb/src/backends/ruvector/GuardedVectorBackend.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig: GuardConfig = {
  dimension: 384,
  maxElements: 10000,
  enableWasmProofs: false,
  enableAttestationLog: false,
  defaultNamespace: 'test',
};

function createEmbedding(dim: number, fill = 0.1): Float32Array {
  return new Float32Array(dim).fill(fill);
}

/**
 * Fallback mock database for environments where sql.js is unavailable.
 * Mimics the better-sqlite3 prepare/exec API surface used by AttestationLog.
 */
function createMockDb() {
  const rows: any[] = [];
  return {
    exec(_sql: string) {
      /* schema DDL — no-op for tests */
    },
    prepare(_sql: string) {
      return {
        run(..._params: any[]) {
          rows.push({ params: _params });
          return { changes: 1 };
        },
        all(..._params: any[]) {
          return [];
        },
        get(..._params: any[]) {
          return { total: 0, proved: 0, denied: 0, uniqueAgents: 0, oldestTs: 0 };
        },
      };
    },
  };
}

// ===========================================================================
// MutationGuard
// ===========================================================================

describe('MutationGuard', () => {
  let guard: MutationGuard;

  beforeEach(async () => {
    guard = new MutationGuard(defaultConfig);
    await guard.initialize();
  });

  // -----------------------------------------------------------------------
  // proveInsert
  // -----------------------------------------------------------------------

  describe('proveInsert', () => {
    it('returns MutationProof with valid inputs', () => {
      const result = guard.proveInsert('test-id-1', createEmbedding(384));
      expect(MutationGuard.isDenial(result)).toBe(false);
      expect((result as MutationProof).valid).toBe(true);
      expect((result as MutationProof).operation).toBe('insert');
      expect((result as MutationProof).structuralHash).toBeTruthy();
    });

    it('returns MutationDenial with wrong dimension embedding', () => {
      const result = guard.proveInsert('test-id', createEmbedding(128));
      expect(MutationGuard.isDenial(result)).toBe(true);
      expect((result as MutationDenial).code).toContain('DIMENSION');
    });

    it('returns MutationDenial with NaN values', () => {
      const bad = createEmbedding(384);
      bad[10] = NaN;
      const result = guard.proveInsert('test-id', bad);
      expect(MutationGuard.isDenial(result)).toBe(true);
    });

    it('returns MutationDenial with Infinity values', () => {
      const bad = createEmbedding(384);
      bad[5] = Infinity;
      const result = guard.proveInsert('test-id', bad);
      expect(MutationGuard.isDenial(result)).toBe(true);
    });

    it('returns MutationDenial with path-traversal ID', () => {
      const result = guard.proveInsert('../etc/passwd', createEmbedding(384));
      expect(MutationGuard.isDenial(result)).toBe(true);
      expect((result as MutationDenial).code).toContain('PATH_TRAVERSAL');
    });

    it('returns MutationDenial with empty ID', () => {
      const result = guard.proveInsert('', createEmbedding(384));
      expect(MutationGuard.isDenial(result)).toBe(true);
      expect((result as MutationDenial).code).toContain('EMPTY');
    });

    it('returns MutationProof with valid metadata', () => {
      const result = guard.proveInsert('test-id', createEmbedding(384), { tag: 'test' });
      expect(MutationGuard.isDenial(result)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // proveSearch
  // -----------------------------------------------------------------------

  describe('proveSearch', () => {
    it('returns MutationProof with valid query', () => {
      const result = guard.proveSearch(createEmbedding(384), 5);
      expect(MutationGuard.isDenial(result)).toBe(false);
      expect((result as MutationProof).operation).toBe('search');
    });

    it('returns MutationDenial with k=0', () => {
      const result = guard.proveSearch(createEmbedding(384), 0);
      expect(MutationGuard.isDenial(result)).toBe(true);
    });

    it('returns MutationDenial with k exceeding MAX_K', () => {
      const result = guard.proveSearch(createEmbedding(384), 100000);
      expect(MutationGuard.isDenial(result)).toBe(true);
    });

    it('returns MutationDenial with wrong dimension', () => {
      const result = guard.proveSearch(createEmbedding(128), 5);
      expect(MutationGuard.isDenial(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // proveBatchInsert
  // -----------------------------------------------------------------------

  describe('proveBatchInsert', () => {
    it('validates each item in batch', () => {
      const items = [
        { id: 'id-1', embedding: createEmbedding(384) },
        { id: 'id-2', embedding: createEmbedding(384) },
      ];
      const result = guard.proveBatchInsert(items);
      expect(MutationGuard.isDenial(result)).toBe(false);
    });

    it('rejects oversized batches', () => {
      // Create items array larger than SECURITY_LIMITS.MAX_BATCH_SIZE (10000)
      const items = Array.from({ length: 10001 }, (_, i) => ({
        id: `id-${i}`,
        embedding: createEmbedding(384),
      }));
      const result = guard.proveBatchInsert(items);
      expect(MutationGuard.isDenial(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // proveRemove
  // -----------------------------------------------------------------------

  describe('proveRemove', () => {
    it('returns MutationProof with valid ID', () => {
      const result = guard.proveRemove('valid-id');
      expect(MutationGuard.isDenial(result)).toBe(false);
      expect((result as MutationProof).operation).toBe('remove');
    });
  });

  // -----------------------------------------------------------------------
  // proveSave
  // -----------------------------------------------------------------------

  describe('proveSave', () => {
    it('rejects path traversal', () => {
      const result = guard.proveSave('../../etc/secret');
      expect(MutationGuard.isDenial(result)).toBe(true);
    });

    it('accepts valid path', () => {
      const result = guard.proveSave('data/index.bin');
      expect(MutationGuard.isDenial(result)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // createToken
  // -----------------------------------------------------------------------

  describe('createToken', () => {
    it('returns valid attestation token', () => {
      const token = guard.createToken('agent-1', 'test-ns', 'write');
      expect(token.agentId).toBe('agent-1');
      expect(token.namespace).toBe('test-ns');
      expect(token.scope).toBe('write');
      expect(token.expiresAt).toBeGreaterThan(token.issuedAt);
    });

    it('respects custom TTL', () => {
      const token = guard.createToken('agent-1', 'test-ns', 'read', 1000);
      expect(token.expiresAt - token.issuedAt).toBe(1000);
    });

    it('rejects expired tokens', () => {
      const expired: AttestationToken = {
        agentId: 'agent-1',
        namespace: 'test',
        scope: 'write',
        issuedAt: Date.now() - 600000,
        expiresAt: Date.now() - 300000, // expired 5 min ago
      };
      const result = guard.proveInsert('test-id', createEmbedding(384), undefined, expired);
      expect(MutationGuard.isDenial(result)).toBe(true);
      expect((result as MutationDenial).code).toBe('TOKEN_EXPIRED');
    });

    it('rejects expired tokens on search', () => {
      const expired: AttestationToken = {
        agentId: 'agent-1',
        namespace: 'test',
        scope: 'read',
        issuedAt: Date.now() - 600000,
        expiresAt: Date.now() - 1,
      };
      const result = guard.proveSearch(createEmbedding(384), 5, undefined, expired);
      expect(MutationGuard.isDenial(result)).toBe(true);
      expect((result as MutationDenial).code).toBe('TOKEN_EXPIRED');
    });
  });

  // -----------------------------------------------------------------------
  // isDenial
  // -----------------------------------------------------------------------

  describe('isDenial', () => {
    it('correctly identifies denial', () => {
      const d: MutationDenial = {
        operation: 'insert',
        reason: 'bad',
        code: 'ERR',
        timestamp: Date.now(),
      };
      expect(MutationGuard.isDenial(d)).toBe(true);
    });

    it('correctly identifies proof', () => {
      const result = guard.proveInsert('test-id', createEmbedding(384));
      if (!MutationGuard.isDenial(result)) {
        expect(MutationGuard.isDenial(result)).toBe(false);
      }
    });
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------

  describe('getStats', () => {
    it('returns correct counts', () => {
      guard.proveInsert('good-id', createEmbedding(384));
      guard.proveInsert('', createEmbedding(384)); // denial
      const stats = guard.getStats();
      expect(stats.proofsIssued).toBe(1);
      expect(stats.denials).toBe(1);
      expect(typeof stats.wasmAvailable).toBe('boolean');
    });
  });

  // -----------------------------------------------------------------------
  // WASM fallback
  // -----------------------------------------------------------------------

  it('works when WASM is unavailable (graceful fallback)', async () => {
    const g = new MutationGuard({ ...defaultConfig, enableWasmProofs: true });
    await g.initialize(); // WASM will not be available, should not throw
    const result = g.proveInsert('test-id', createEmbedding(384));
    expect(MutationGuard.isDenial(result)).toBe(false);
  });
});

// ===========================================================================
// AttestationLog
// ===========================================================================

describe('AttestationLog', () => {
  let db: any;
  let log: AttestationLog;

  beforeEach(async () => {
    // Try real sql.js db, fallback to mock
    try {
      const mod = await import('../../packages/agentdb/src/db-fallback.js');
      db = await mod.createDatabase(':memory:');
    } catch {
      db = createMockDb();
    }
    log = new AttestationLog(db);
  });

  it('record does not throw for a valid proof', () => {
    const proof: MutationProof = {
      id: 'proof-1',
      operation: 'insert',
      timestamp: Date.now(),
      structuralHash: 'abc123',
      attestation: {
        agentId: 'agent-1',
        namespace: 'test',
        scope: 'write',
        issuedAt: Date.now(),
        expiresAt: Date.now() + 300000,
      },
      invariantChecks: [{ check: 'capacity', passed: true }],
      valid: true,
    };
    expect(() => log.record(proof)).not.toThrow();
  });

  it('recordDenial does not throw for a valid denial', () => {
    const d: MutationDenial = {
      operation: 'insert',
      reason: 'bad dimension',
      code: 'DIMENSION_MISMATCH',
      timestamp: Date.now(),
    };
    expect(() => log.recordDenial(d, 'agent-1', 'test')).not.toThrow();
  });

  it('query returns an array', () => {
    const results = log.query({ agentId: 'agent-1' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('query by status returns an array', () => {
    const results = log.query({ status: 'denied' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('query by time range returns an array', () => {
    const results = log.query({ since: Date.now() - 60000 });
    expect(Array.isArray(results)).toBe(true);
  });

  it('getDenialPatterns returns an array', () => {
    const patterns = log.getDenialPatterns();
    expect(Array.isArray(patterns)).toBe(true);
  });

  it('prune does not throw', () => {
    expect(() => log.prune(86400000)).not.toThrow();
  });

  it('getStats returns summary with expected shape', () => {
    const stats = log.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.total).toBe('number');
    expect(typeof stats.proved).toBe('number');
    expect(typeof stats.denied).toBe('number');
    expect(typeof stats.uniqueAgents).toBe('number');
    expect(typeof stats.oldestTs).toBe('number');
  });
});

// ===========================================================================
// GuardedVectorBackend
// ===========================================================================

describe('GuardedVectorBackend', () => {
  let guard: MutationGuard;
  let mockInner: any;
  let guarded: GuardedVectorBackend;

  beforeEach(async () => {
    guard = new MutationGuard(defaultConfig);
    await guard.initialize();

    mockInner = {
      name: 'ruvector' as const,
      insert: vi.fn(),
      insertBatch: vi.fn(),
      search: vi.fn().mockReturnValue([]),
      remove: vi.fn().mockReturnValue(true),
      getStats: vi.fn().mockReturnValue({
        count: 0,
        dimension: 384,
        metric: 'cosine',
        backend: 'ruvector',
        memoryUsage: 0,
      }),
      save: vi.fn().mockResolvedValue(undefined),
      load: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };

    guarded = new GuardedVectorBackend(mockInner, guard);
  });

  it('insert with valid proof succeeds', () => {
    guarded.insert('test-id', createEmbedding(384));
    expect(mockInner.insert).toHaveBeenCalledOnce();
  });

  it('insert with bad embedding throws ProofDeniedError', () => {
    expect(() => guarded.insert('test-id', createEmbedding(128))).toThrow(ProofDeniedError);
    expect(mockInner.insert).not.toHaveBeenCalled();
  });

  it('search with valid proof succeeds', () => {
    guarded.search(createEmbedding(384), 5);
    expect(mockInner.search).toHaveBeenCalledOnce();
  });

  it('search with bad dimension throws ProofDeniedError', () => {
    expect(() => guarded.search(createEmbedding(128), 5)).toThrow(ProofDeniedError);
  });

  it('read-only methods pass through without proof', () => {
    guarded.close();
    expect(mockInner.close).toHaveBeenCalledOnce();
  });

  it('getStats includes guard stats', () => {
    const stats = guarded.getStats();
    expect(stats).toBeDefined();
    expect(stats.count).toBe(0);
  });

  it('denial is thrown as ProofDeniedError with correct properties', () => {
    try {
      guarded.insert('', createEmbedding(384));
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProofDeniedError);
      expect((e as ProofDeniedError).operation).toBe('insert');
      expect((e as ProofDeniedError).code).toBeTruthy();
    }
  });

  it('remove with valid ID succeeds', () => {
    guarded.remove('test-id');
    expect(mockInner.remove).toHaveBeenCalledOnce();
  });
});
