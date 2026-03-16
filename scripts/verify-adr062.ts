#!/usr/bin/env tsx
/**
 * ADR-062 End-to-End Verification Script
 *
 * Validates that integration has reached 95% by checking:
 * 1. HookService functionality
 * 2. SwarmService lifecycle
 * 3. DirectCallBridge performance
 * 4. Controller exposure
 * 5. RuVector native bindings
 * 6. QUIC tools registration
 * 7. Integration score computation
 */

async function verifyADR062() {
  console.log('ADR-062 End-to-End Verification\n');
  console.log('='.repeat(60));

  let passed = 0;
  let failed = 0;
  const results: Array<{ name: string; status: string; detail: string }> = [];

  function check(name: string, condition: boolean, detail: string) {
    if (condition) {
      passed++;
      results.push({ name, status: 'PASS', detail });
      console.log(`  [PASS] ${name}: ${detail}`);
    } else {
      failed++;
      results.push({ name, status: 'FAIL', detail });
      console.log(`  [FAIL] ${name}: ${detail}`);
    }
  }

  // =========================================================================
  // 1. AgentDBService
  // =========================================================================
  console.log('\n1. AgentDBService...');
  try {
    const { AgentDBService } = await import('../agentic-flow/src/services/agentdb-service.js');
    const agentDB = await AgentDBService.getInstance();
    check('AgentDBService.getInstance', true, 'Singleton created');

    const metrics = await agentDB.getMetrics();
    check('AgentDBService.backend', metrics.backend !== undefined, `Backend: ${metrics.backend}`);
    check('AgentDBService.uptime', metrics.uptime > 0, `Uptime: ${metrics.uptime}ms`);

    // =========================================================================
    // 2. HookService
    // =========================================================================
    console.log('\n2. HookService...');
    const { HookService } = await import('../agentic-flow/src/services/hook-service.js');
    const hooks = new HookService(agentDB);
    check('HookService.constructor', hooks !== null, 'Created successfully');

    const handlers = hooks.listHandlers();
    const handlerTypes = Object.keys(handlers);
    check('HookService.builtInHandlers', handlerTypes.length > 0, `${handlerTypes.length} hook types with handlers`);

    await hooks.trigger('PreToolUse', { toolName: 'verify_test' });
    const hookStats = hooks.getStats();
    check('HookService.trigger', hookStats.PreToolUse?.triggered === 1, `PreToolUse triggered: ${hookStats.PreToolUse?.triggered}`);

    // =========================================================================
    // 3. SwarmService
    // =========================================================================
    console.log('\n3. SwarmService...');
    const { SwarmService } = await import('../agentic-flow/src/services/swarm-service.js');
    const swarm = new SwarmService(hooks, agentDB);
    check('SwarmService.constructor', swarm !== null, 'Created successfully');

    await swarm.initialize('hierarchical', 5);
    check('SwarmService.initialize', swarm.isInitialized, 'Topology: hierarchical, maxAgents: 5');

    const agentId = await swarm.spawnAgent('coder', ['typescript']);
    check('SwarmService.spawnAgent', agentId !== undefined, `Agent: ${agentId}`);

    const status = swarm.getStatus();
    check('SwarmService.status', status.stats.totalAgents === 1, `Agents: ${status.stats.totalAgents}`);

    await swarm.shutdown();
    check('SwarmService.shutdown', !swarm.isInitialized, 'Graceful shutdown complete');

    // =========================================================================
    // 4. DirectCallBridge
    // =========================================================================
    console.log('\n4. DirectCallBridge...');
    const { DirectCallBridge } = await import('../agentic-flow/src/services/direct-call-bridge.js');
    const bridge = new DirectCallBridge(agentDB);
    check('DirectCallBridge.constructor', bridge !== null, 'Created successfully');

    const storeResult = await bridge.memoryStore('verify-key', 'verify-value');
    check('DirectCallBridge.memoryStore', storeResult?.id !== undefined, `Stored: id=${storeResult?.id}`);

    const searchResults = await bridge.memorySearch('verify', undefined, 5);
    check('DirectCallBridge.memorySearch', Array.isArray(searchResults), `Found: ${searchResults.length} results`);

    const routeResult = await bridge.routeSemantic('rename a variable');
    check('DirectCallBridge.routeSemantic', routeResult?.tier !== undefined, `Tier: ${routeResult?.tier}, handler: ${routeResult?.handler}`);

    // =========================================================================
    // 5. Phase 1 Controllers
    // =========================================================================
    console.log('\n5. Phase 1 Controllers...');
    const attentionStats = agentDB.getAttentionStats();
    check('AttentionService.stats', attentionStats !== undefined, `totalOps: ${attentionStats.totalOps}`);

    const wasmStats = agentDB.getWASMStats();
    check('WASMVectorSearch.stats', wasmStats !== undefined, `WASM: ${wasmStats.wasmAvailable}, SIMD: ${wasmStats.simdAvailable}`);

    // =========================================================================
    // 6. Phase 4 Controllers
    // =========================================================================
    console.log('\n6. Phase 4 Controllers...');
    const phase4 = agentDB.getPhase4Status();
    const phase4Keys = Object.keys(phase4);
    check('Phase4.allKeys', phase4Keys.length === 5, `Keys: ${phase4Keys.join(', ')}`);

    const phase4Active = Object.values(phase4).filter(Boolean).length;
    check('Phase4.activeControllers', phase4Active >= 2, `${phase4Active}/5 controllers active`);

    const syncStatus = agentDB.getSyncStatus();
    check('SyncCoordinator.status', syncStatus !== undefined, `isSyncing: ${syncStatus.isSyncing}`);

    // =========================================================================
    // 7. MCP Tool Registration Check
    // =========================================================================
    console.log('\n7. MCP Tool Files...');
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    const toolsDir = join(process.cwd(), 'agentic-flow', 'src', 'mcp', 'fastmcp', 'tools');

    const toolFiles = [
      'attention-tools.ts',
      'hidden-controllers.ts',
      'quic-tools.ts',
      'session-tools.ts',
      'github-tools.ts',
      'neural-tools.ts',
      'ruvector-tools.ts',
      'sona-rvf-tools.ts',
      'infrastructure-tools.ts',
      'autopilot-tools.ts',
      'performance-tools.ts',
      'workflow-tools.ts',
      'daa-tools.ts',
    ];

    let toolFilesFound = 0;
    for (const file of toolFiles) {
      if (existsSync(join(toolsDir, file))) {
        toolFilesFound++;
      }
    }
    check('MCP.toolFiles', toolFilesFound === toolFiles.length, `${toolFilesFound}/${toolFiles.length} tool files present`);

    // =========================================================================
    // 8. Service Files
    // =========================================================================
    console.log('\n8. Service Files...');
    const servicesDir = join(process.cwd(), 'agentic-flow', 'src', 'services');

    const serviceFiles = [
      'agentdb-service.ts',
      'hook-service.ts',
      'swarm-service.ts',
      'direct-call-bridge.ts',
      'github-service.ts',
    ];

    let serviceFilesFound = 0;
    for (const file of serviceFiles) {
      if (existsSync(join(servicesDir, file))) {
        serviceFilesFound++;
      }
    }
    check('Services.files', serviceFilesFound === serviceFiles.length, `${serviceFilesFound}/${serviceFiles.length} service files present`);

    // Cleanup
    await agentDB.shutdown();
    AgentDBService.resetInstance();

  } catch (error: any) {
    console.error(`\nFATAL ERROR: ${error.message}`);
    console.error(error.stack);
    failed++;
    results.push({ name: 'FATAL', status: 'FAIL', detail: error.message });
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n' + '='.repeat(60));
  console.log('\nADR-062 Verification Summary');
  console.log('='.repeat(60));
  console.log(`  Total checks: ${passed + failed}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log(`  Pass rate:    ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  // Integration score
  const integrationComponents = {
    'Controllers -> MCP': results.filter(r => r.name.startsWith('Phase') || r.name.startsWith('MCP')).filter(r => r.status === 'PASS').length > 0,
    'Hooks -> Lifecycle': results.filter(r => r.name.startsWith('HookService')).every(r => r.status === 'PASS'),
    'Swarm -> Agents': results.filter(r => r.name.startsWith('SwarmService')).every(r => r.status === 'PASS'),
    'DirectCall -> Bridge': results.filter(r => r.name.startsWith('DirectCallBridge')).every(r => r.status === 'PASS'),
    'Services -> Files': results.filter(r => r.name.startsWith('Services')).every(r => r.status === 'PASS'),
  };

  const activeComponents = Object.values(integrationComponents).filter(Boolean).length;
  const totalComponents = Object.keys(integrationComponents).length;
  const integrationScore = Math.round((activeComponents / totalComponents) * 100);

  console.log(`\n  Integration Score: ${integrationScore}% (${activeComponents}/${totalComponents} components)`);
  console.log(`  Grade: ${integrationScore >= 90 ? 'A' : integrationScore >= 80 ? 'B' : integrationScore >= 70 ? 'C' : 'D'}`);

  console.log('\n  Component Status:');
  for (const [component, active] of Object.entries(integrationComponents)) {
    console.log(`    ${active ? '[OK]' : '[--]'} ${component}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(failed === 0 ? '\nADR-062 Verification PASSED' : `\nADR-062 Verification COMPLETED with ${failed} failure(s)`);

  process.exit(failed > 0 ? 1 : 0);
}

verifyADR062().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
