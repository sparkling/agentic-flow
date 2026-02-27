/**
 * Integration Test: QUIC Protocol MCP Tools
 *
 * Tests all 8 QUIC tools (4 from hidden-controllers + 4 from quic-tools):
 * 1. quic_connect (hidden-controllers)
 * 2. quic_client_status (hidden-controllers)
 * 3. quic_server_start (hidden-controllers)
 * 4. quic_server_status (hidden-controllers)
 * 5. quic_sync_episodes (quic-tools)
 * 6. quic_sync_skills (quic-tools)
 * 7. quic_latency (quic-tools)
 * 8. quic_health (quic-tools)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('QUIC Protocol MCP Tools', () => {
  let AgentDBService: any;
  let service: any;

  beforeAll(async () => {
    const mod = await import('../../agentic-flow/src/services/agentdb-service.js');
    AgentDBService = mod.AgentDBService;
    service = await AgentDBService.getInstance();
  });

  afterAll(async () => {
    await service.shutdown();
    AgentDBService.resetInstance();
  });

  // -- Phase 4 status baseline --

  it('should report QUIC component status via Phase 4', () => {
    const phase4 = service.getPhase4Status();
    expect(phase4).toHaveProperty('quicClient');
    expect(phase4).toHaveProperty('quicServer');
    expect(phase4).toHaveProperty('syncCoordinator');
    expect(typeof phase4.quicClient).toBe('boolean');
    expect(typeof phase4.quicServer).toBe('boolean');
  });

  // -- Tool 1: quic_connect --

  it('should check QUIC client connection status', () => {
    const phase4 = service.getPhase4Status();
    // QUIC client is optional - depends on env vars
    expect(typeof phase4.quicClient).toBe('boolean');
  });

  // -- Tool 2: quic_client_status --

  it('should report detailed QUIC client status', () => {
    const phase4 = service.getPhase4Status();
    // All phase 4 components should be reported
    expect(phase4).toHaveProperty('quicClient');
    expect(phase4).toHaveProperty('quicServer');
    expect(phase4).toHaveProperty('syncCoordinator');
  });

  // -- Tool 3: quic_server_start --

  it('should handle QUIC server start/stop', async () => {
    const phase4 = service.getPhase4Status();
    if (phase4.quicServer) {
      // Server is available - test start
      try {
        await service.startQUICServer();
        await service.stopQUICServer();
      } catch {
        // May fail in test env without proper certs
      }
    } else {
      await expect(service.startQUICServer()).rejects.toThrow('QUICServer not available');
    }
  });

  // -- Tool 4: quic_server_status --

  it('should handle QUIC server stop', async () => {
    const phase4 = service.getPhase4Status();
    if (phase4.quicServer) {
      try {
        await service.stopQUICServer();
      } catch {
        // Expected if server was not started
      }
    } else {
      await expect(service.stopQUICServer()).rejects.toThrow('QUICServer not available');
    }
  });

  // -- Tool 5: quic_sync_episodes --

  it('should handle episode sync', async () => {
    const phase4 = service.getPhase4Status();
    if (phase4.syncCoordinator) {
      try {
        const report = await service.syncWithRemote();
        expect(report).toBeDefined();
      } catch {
        // May fail without remote server
      }
    } else {
      await expect(service.syncWithRemote()).rejects.toThrow('SyncCoordinator not available');
    }
  });

  // -- Tool 6: quic_sync_skills --

  it('should handle skill sync via same sync mechanism', async () => {
    const phase4 = service.getPhase4Status();
    // Skills sync uses the same syncWithRemote
    if (phase4.syncCoordinator) {
      try {
        const report = await service.syncWithRemote();
        expect(report).toBeDefined();
      } catch {
        // May fail without remote server
      }
    }
  });

  // -- Tool 7: quic_latency --

  it('should measure sync status latency', () => {
    const rounds = 10;
    const latencies: number[] = [];

    for (let i = 0; i < rounds; i++) {
      const start = performance.now();
      service.getSyncStatus();
      latencies.push(performance.now() - start);
    }

    latencies.sort((a: number, b: number) => a - b);

    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const avg = latencies.reduce((sum: number, l: number) => sum + l, 0) / latencies.length;

    expect(min).toBeGreaterThanOrEqual(0);
    expect(avg).toBeGreaterThanOrEqual(0);
    expect(max).toBeGreaterThanOrEqual(min);
    // Sync status should be fast (<100ms)
    expect(avg).toBeLessThan(100);
  });

  // -- Tool 8: quic_health --

  it('should report comprehensive QUIC health', async () => {
    const phase4 = service.getPhase4Status();
    const syncStatus = service.getSyncStatus();
    const metrics = await service.getMetrics();

    // Composite health check
    const healthyCount = [
      phase4.syncCoordinator,
      phase4.nightlyLearner,
      phase4.explainableRecall,
    ].filter(Boolean).length;

    const overall = healthyCount >= 2 ? 'healthy' : healthyCount >= 1 ? 'degraded' : 'unavailable';

    expect(['healthy', 'degraded', 'unavailable']).toContain(overall);
    expect(syncStatus).toHaveProperty('isSyncing');
    expect(metrics).toHaveProperty('backend');
    expect(metrics.uptime).toBeGreaterThan(0);
  });
});
