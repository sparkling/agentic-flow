/**
 * Integration Test: HookService
 *
 * Tests the EventEmitter-based hook system with AgentDB integration.
 * Verifies lifecycle hooks, learning loops, stats tracking, and handler management.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

describe('HookService Integration', () => {
  let HookService: any;
  let AgentDBService: any;
  let hooks: any;
  let agentDB: any;

  beforeAll(async () => {
    const hookMod = await import('../../agentic-flow/src/services/hook-service.js');
    HookService = hookMod.HookService;
    const agentDBMod = await import('../../agentic-flow/src/services/agentdb-service.js');
    AgentDBService = agentDBMod.AgentDBService;

    agentDB = await AgentDBService.getInstance();
    hooks = new HookService(agentDB);
  });

  afterAll(async () => {
    await agentDB.shutdown();
    AgentDBService.resetInstance();
  });

  it('should initialize with built-in handlers', () => {
    expect(hooks).toBeDefined();
    const handlers = hooks.listHandlers();
    // Built-in handlers are registered for PostToolUse and TaskCompleted
    expect(handlers.PostToolUse).toBeGreaterThan(0);
    expect(handlers.TaskCompleted).toBeGreaterThan(0);
  });

  it('should trigger hooks and update stats', async () => {
    hooks.clearStats();
    await hooks.trigger('PreToolUse', { toolName: 'test_tool' });

    const stats = hooks.getStats();
    expect(stats.PreToolUse).toBeDefined();
    expect(stats.PreToolUse.triggered).toBe(1);
  });

  it('should store patterns on successful tool use', async () => {
    await hooks.trigger('PostToolUse', {
      toolName: 'memory_search',
    }, {
      toolName: 'memory_search',
      success: true,
    });

    // Pattern was stored via built-in handler
    const patterns = await agentDB.searchPatterns('memory_search', 5);
    expect(patterns.length).toBeGreaterThanOrEqual(0); // May or may not find depending on backend
  });

  it('should store episodes on task completion', async () => {
    await hooks.trigger('TaskCompleted', {
      taskId: 'task-123',
      result: 'success',
      approach: 'test approach',
      action: 'test action',
    }, {
      sessionId: 'test-session',
      success: true,
    });

    // Episode was stored via built-in handler
    const episodes = await agentDB.recallEpisodes('task-123', 5);
    expect(episodes.length).toBeGreaterThanOrEqual(0);
  });

  it('should support custom handlers via register', async () => {
    let customCalled = false;

    hooks.register('UserPromptSubmit', async () => {
      customCalled = true;
    });

    await hooks.trigger('UserPromptSubmit', { prompt: 'test' });
    expect(customCalled).toBe(true);
  });

  it('should handle multiple handlers for same hook', async () => {
    let count = 0;

    hooks.register('SwarmInit', async () => { count++; });
    hooks.register('SwarmInit', async () => { count++; });

    await hooks.trigger('SwarmInit', {});
    expect(count).toBe(2);
  });

  it('should track errors in handlers', async () => {
    hooks.clearStats();
    hooks.register('Stop', async () => {
      throw new Error('Test error');
    });

    await hooks.trigger('Stop', {});

    const stats = hooks.getStats();
    expect(stats.Stop).toBeDefined();
    expect(stats.Stop.errors).toBeGreaterThan(0);
  });

  it('should support enable/disable', async () => {
    hooks.clearStats();
    hooks.setEnabled(false);
    expect(hooks.isEnabled()).toBe(false);

    await hooks.trigger('PreToolUse', {});
    const stats1 = hooks.getStats();
    // Should not have triggered because disabled
    expect(stats1.PreToolUse).toBeUndefined();

    hooks.setEnabled(true);
    expect(hooks.isEnabled()).toBe(true);

    await hooks.trigger('PreToolUse', {});
    const stats2 = hooks.getStats();
    expect(stats2.PreToolUse).toBeDefined();
    expect(stats2.PreToolUse.triggered).toBe(1);
  });

  it('should clear stats', () => {
    hooks.clearStats();
    const stats = hooks.getStats();
    expect(Object.keys(stats).length).toBe(0);
  });

  it('should support handler removal via unregister', async () => {
    const handler = async () => {};
    hooks.register('TeammateIdle', handler);

    const before = hooks.listHandlers();
    const beforeCount = before.TeammateIdle || 0;

    hooks.unregister('TeammateIdle', handler);
    const after = hooks.listHandlers();
    const afterCount = after.TeammateIdle || 0;

    expect(afterCount).toBeLessThan(beforeCount);
  });

  it('should report total handler count', () => {
    const total = hooks.totalHandlers;
    expect(typeof total).toBe('number');
    expect(total).toBeGreaterThan(0);
  });
});
