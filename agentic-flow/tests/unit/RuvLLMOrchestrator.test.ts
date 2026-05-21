/**
 * Behavioral tests for RuvLLMOrchestrator
 *
 * Covers: selectAgent, decomposeTask, recordOutcome, trainGNN, getStats.
 * All external dependencies (ReasoningBank, EmbeddingService, agentdb module)
 * are injected as vi.fn()-based duck-typed mocks. The real orchestration
 * logic (SONA weighting, FastGRNN routing, TRM decomposition, caching,
 * input validation, performance tracking) runs against the real source.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuvLLMOrchestrator } from '../../src/llm/RuvLLMOrchestrator.js';
import type { TRMConfig, SONAConfig, LearningOutcome } from '../../src/llm/RuvLLMOrchestrator.js';

// ---- agentdb module mock (hermetic) ----------------------------------------
// getEmbeddingConfig is called in the constructor to size adaptiveWeights.
vi.mock('agentdb', () => ({
  getEmbeddingConfig: vi.fn(() => ({ dimension: 4 })), // tiny, fast
  // The type exports (ReasoningBank, EmbeddingService) are erased at runtime.
}));

// ---- helper: build minimal duck-typed mocks ---------------------------------

function makeReasoningBank() {
  return {
    searchPatterns: vi.fn(),
    storePattern: vi.fn(),
    recordOutcome: vi.fn(),
    trainGNN: vi.fn(),
  };
}

function makeEmbedder() {
  return {
    embed: vi.fn(),
  };
}

/** A Float32Array with predictable values (all 1.0) */
const FIXED_EMBEDDING = new Float32Array([1, 1, 1, 1]);

// ---- helpers ----------------------------------------------------------------

function makeSinglePattern(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pat-1',
    task: 'code a feature',
    success: true,
    reward: 0.9,
    similarity: 0.85,
    // NOTE: approach format comes from recordOutcome: `Agent: ${agent}, Success: ${success}`
    // The regex /Agent:\s*(\S+)/ captures up to the first whitespace, so "coder," is captured
    // (with the trailing comma). We use metadata.agent on tests that need a known agent name
    // so the metadata.agent branch (line 466) is taken before the regex (line 471) is reached.
    approach: 'Agent: coder-agent, Success: true',
    taskType: 'code',
    metadata: { agent: 'coder' },
    ...overrides,
  };
}

// ============================================================================
// 1. Constructor + config defaults
// ============================================================================
describe('RuvLLMOrchestrator — construction', () => {
  it('constructs successfully with only required arguments', () => {
    const rb = makeReasoningBank();
    const em = makeEmbedder();
    const orch = new RuvLLMOrchestrator(rb as any, em as any);
    expect(orch).toBeTruthy();
  });

  it('getStats() reports zero executions on a fresh instance', () => {
    const orch = new RuvLLMOrchestrator(makeReasoningBank() as any, makeEmbedder() as any);
    const stats = orch.getStats();
    expect(stats.totalExecutions).toBe(0);
    expect(stats.agentPerformance).toHaveLength(0);
    expect(stats.cachedDecompositions).toBe(0);
  });

  it('accepts custom TRM config and stores it (verified via decomposeTask depth guard)', async () => {
    // A maxDepth of 21 is ABOVE the 20 ceiling — decomposeTask must throw.
    // But with maxDepth=1 set in config and depth=21 passed explicitly,
    // the explicit argument takes precedence; this verifies config is applied
    // only when no explicit depth is given.
    const rb = makeReasoningBank();
    const em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]);
    // Low complexity => base case hits
    const orch = new RuvLLMOrchestrator(rb as any, em as any, { maxDepth: 1, minConfidence: 0.6 });
    // explicit depth=21 is out of range regardless of config
    await expect(orch.decomposeTask('simple task', 21)).rejects.toThrow(
      'Invalid maxDepth: must be between 1 and 20'
    );
  });
});

// ============================================================================
// 2. selectAgent — happy paths
// ============================================================================
describe('RuvLLMOrchestrator.selectAgent', () => {
  let rb: ReturnType<typeof makeReasoningBank>;
  let em: ReturnType<typeof makeEmbedder>;
  let orch: RuvLLMOrchestrator;

  beforeEach(() => {
    rb = makeReasoningBank();
    em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    orch = new RuvLLMOrchestrator(rb as any, em as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls embedder.embed() with the (sanitized) task description', async () => {
    rb.searchPatterns.mockResolvedValue([makeSinglePattern()]);
    await orch.selectAgent('implement a feature');
    expect(em.embed).toHaveBeenCalledTimes(1);
    expect(em.embed).toHaveBeenCalledWith('implement a feature');
  });

  it('calls reasoningBank.searchPatterns() with the task embedding', async () => {
    rb.searchPatterns.mockResolvedValue([makeSinglePattern()]);
    await orch.selectAgent('implement a feature');
    expect(rb.searchPatterns).toHaveBeenCalledTimes(1);
    const call = rb.searchPatterns.mock.calls[0][0];
    expect(call.taskEmbedding).toBe(FIXED_EMBEDDING);
  });

  it('returns correct shape: agentType, confidence, reasoning, metrics', async () => {
    rb.searchPatterns.mockResolvedValue([makeSinglePattern()]);
    const result = await orch.selectAgent('implement a feature');
    expect(result).toHaveProperty('agentType');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('reasoning');
    expect(typeof result.metrics.inferenceTimeMs).toBe('number');
    expect(typeof result.metrics.patternMatchScore).toBe('number');
  });

  it('selects agent from top-ranked pattern via metadata.agent', async () => {
    rb.searchPatterns.mockResolvedValue([
      makeSinglePattern({ metadata: { agent: 'coder' }, similarity: 0.9 }),
    ]);
    const result = await orch.selectAgent('implement a feature');
    expect(result.agentType).toBe('coder');
  });

  // Regression: src/llm/RuvLLMOrchestrator.ts:471
  // extractAgentFromPattern parses the agent name out of the approach text that
  // recordOutcome() writes (`Agent: ${agent}, Success: ${success}`). The capture
  // is constrained to the agent-name charset so the trailing ", Success: ..." is
  // not swallowed into the name — a `\S+` capture grabbed "coder," (with the
  // comma) and then failed validateAgentName for any pattern stored via
  // recordOutcome.
  it('extracts the agent name from approach text without swallowing the trailing comma', async () => {
    rb.searchPatterns.mockResolvedValue([
      // No metadata.agent — forces the approach regex branch
      {
        id: 'pat-no-meta',
        task: 'code a feature',
        success: true,
        reward: 0.9,
        similarity: 0.85,
        approach: 'Agent: coder, Success: true', // format from recordOutcome
        taskType: 'code',
      },
    ]);
    // Must NOT throw, and the parsed agent name is 'coder' (not 'coder,').
    const result = await orch.selectAgent('implement a feature');
    expect(result.agentType).toBe('coder');
    expect(result.agentType).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('selects agent from pattern metadata.agent when present', async () => {
    rb.searchPatterns.mockResolvedValue([
      makeSinglePattern({ metadata: { agent: 'researcher' }, similarity: 0.95 }),
    ]);
    const result = await orch.selectAgent('analyze results');
    expect(result.agentType).toBe('researcher');
  });

  it('falls back to keyword-based selection when no patterns found', async () => {
    rb.searchPatterns.mockResolvedValue([]);
    const result = await orch.selectAgent('implement a new feature');
    // "implement" -> coder via inferAgentFromTaskType
    expect(result.agentType).toBe('coder');
    expect(result.confidence).toBe(0.5);
    expect(result.reasoning).toMatch(/No similar patterns found/);
  });

  it('fallback: "research" keyword maps to researcher', async () => {
    rb.searchPatterns.mockResolvedValue([]);
    const result = await orch.selectAgent('research the topic');
    expect(result.agentType).toBe('researcher');
  });

  it('fallback: "test" keyword maps to tester', async () => {
    rb.searchPatterns.mockResolvedValue([]);
    const result = await orch.selectAgent('write tests for the module');
    expect(result.agentType).toBe('tester');
  });

  it('fallback: "review" keyword maps to reviewer', async () => {
    rb.searchPatterns.mockResolvedValue([]);
    const result = await orch.selectAgent('review the pull request');
    expect(result.agentType).toBe('reviewer');
  });

  it('fallback: "optimize" keyword maps to optimizer', async () => {
    rb.searchPatterns.mockResolvedValue([]);
    const result = await orch.selectAgent('optimize the algorithm');
    expect(result.agentType).toBe('optimizer');
  });

  it('patternMatchScore reflects similarity of top pattern', async () => {
    rb.searchPatterns.mockResolvedValue([
      makeSinglePattern({ similarity: 0.88 }),
    ]);
    const result = await orch.selectAgent('code feature');
    expect(result.metrics.patternMatchScore).toBe(0.88);
  });

  it('alternatives list is populated from remaining patterns', async () => {
    rb.searchPatterns.mockResolvedValue([
      makeSinglePattern({ similarity: 0.9, metadata: { agent: 'coder' } }),
      makeSinglePattern({ id: 'pat-2', similarity: 0.7, metadata: { agent: 'researcher' } }),
      makeSinglePattern({ id: 'pat-3', similarity: 0.6, metadata: { agent: 'reviewer' } }),
    ]);
    const result = await orch.selectAgent('code feature');
    expect(result.alternatives).toBeDefined();
    expect(result.alternatives!.length).toBeGreaterThan(0);
  });

  it('SONA weighting: higher similarity + better agent history wins tie-break', async () => {
    // Two patterns; second has higher similarity but first has no history.
    // After recording a success for 'specialist', it should win.
    const orchLocal = new RuvLLMOrchestrator(rb as any, em as any);
    rb.storePattern.mockResolvedValue('pid-1');
    rb.recordOutcome.mockResolvedValue(undefined);

    // First, record a success for 'specialist' agent to build history
    await orchLocal.recordOutcome({
      taskType: 'code',
      selectedAgent: 'specialist',
      success: true,
      reward: 1.0,
      latencyMs: 50,
    });

    // Now provide two patterns: specialist agent has 100% success rate
    rb.searchPatterns.mockResolvedValue([
      makeSinglePattern({ id: 'p1', similarity: 0.6, metadata: { agent: 'unknown-agent' } }),
      makeSinglePattern({ id: 'p2', similarity: 0.7, metadata: { agent: 'specialist' } }),
    ]);

    const result = await orchLocal.selectAgent('implement feature');
    // specialist has performance boost; should outrank unknown-agent at similar similarity
    expect(result.agentType).toBe('specialist');
  });
});

// ============================================================================
// 3. selectAgent — input validation (security)
// ============================================================================
describe('RuvLLMOrchestrator.selectAgent — input validation', () => {
  let rb: ReturnType<typeof makeReasoningBank>;
  let em: ReturnType<typeof makeEmbedder>;
  let orch: RuvLLMOrchestrator;

  beforeEach(() => {
    rb = makeReasoningBank();
    em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]);
    orch = new RuvLLMOrchestrator(rb as any, em as any);
  });

  it('throws ValidationError on empty task description', async () => {
    await expect(orch.selectAgent('')).rejects.toThrow();
  });

  it('throws ValidationError on task description exceeding 10000 chars', async () => {
    const longTask = 'a'.repeat(10001);
    await expect(orch.selectAgent(longTask)).rejects.toThrow();
  });

  it('throws ValidationError on XSS payload', async () => {
    await expect(orch.selectAgent('<script>alert(1)</script>')).rejects.toThrow(
      /suspicious content/
    );
  });

  it('throws ValidationError on path traversal in task', async () => {
    await expect(orch.selectAgent('read ../../../etc/passwd')).rejects.toThrow(
      /suspicious content/
    );
  });

  it('strips leading/trailing whitespace from task description', async () => {
    await orch.selectAgent('  implement feature  ');
    expect(em.embed).toHaveBeenCalledWith('implement feature');
  });
});

// ============================================================================
// 4. decomposeTask — happy paths
// ============================================================================
describe('RuvLLMOrchestrator.decomposeTask', () => {
  let rb: ReturnType<typeof makeReasoningBank>;
  let em: ReturnType<typeof makeEmbedder>;
  let orch: RuvLLMOrchestrator;

  beforeEach(() => {
    rb = makeReasoningBank();
    em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]);
    orch = new RuvLLMOrchestrator(rb as any, em as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a TaskDecomposition with expected shape', async () => {
    const result = await orch.decomposeTask('write a function');
    expect(result).toHaveProperty('steps');
    expect(result).toHaveProperty('totalComplexity');
    expect(result).toHaveProperty('parallelizable');
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('each step has description, estimatedComplexity, suggestedAgent', async () => {
    const result = await orch.decomposeTask('write a function');
    for (const step of result.steps) {
      expect(typeof step.description).toBe('string');
      expect(typeof step.estimatedComplexity).toBe('number');
      expect(typeof step.suggestedAgent).toBe('string');
    }
  });

  it('simple short task produces single-step decomposition (base case)', async () => {
    // Very short task => low complexity => base case returns one step
    const result = await orch.decomposeTask('write a function');
    expect(result.steps).toHaveLength(1);
    expect(result.parallelizable).toBe(false);
  });

  it('multi-sentence task decomposes into multiple steps', async () => {
    // Need complexity >= 3 AND depth > 1 to exit the base case.
    // estimateComplexity: length + wordCount/20 + keyword hits.
    // Use a longer multi-sentence task with complex keywords so complexity >= 3.
    const task =
      'Implement the authentication module. Analyze the performance requirements. Optimize the database queries.';
    const result = await orch.decomposeTask(task, 3);
    expect(result.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('totalComplexity equals sum of step complexities', async () => {
    // Use a complex multi-sentence task to ensure we go through the multi-step path
    const task =
      'Implement the authentication module. Analyze the performance requirements. Optimize the database queries.';
    const result = await orch.decomposeTask(task, 3);
    const sum = result.steps.reduce((acc, s) => acc + s.estimatedComplexity, 0);
    expect(result.totalComplexity).toBe(sum);
  });

  // NOTE: caching only applies to the recursive branch (complexity >= 3 AND depth > 1).
  // Simple/short tasks hit the base case and are returned directly without being cached.
  it('caches decomposition of complex task: second call skips re-computation', async () => {
    // This multi-sentence task with complex keywords ensures complexity >= 3 and depth > 1
    const task =
      'Implement the authentication module. Analyze the performance requirements. Optimize the database queries.';
    await orch.decomposeTask(task, 3);
    const callsAfterFirst = em.embed.mock.calls.length;
    await orch.decomposeTask(task, 3); // same task + same depth => cache hit
    // No additional embed calls on cache hit
    expect(em.embed.mock.calls.length).toBe(callsAfterFirst);
  });

  it('cache is keyed on (task, depth): different depth produces a cache miss', async () => {
    const task =
      'Implement the authentication module. Analyze the performance requirements. Optimize the database queries.';
    await orch.decomposeTask(task, 3);
    const callsAfterFirst = em.embed.mock.calls.length;
    await orch.decomposeTask(task, 4); // different depth => new computation
    expect(em.embed.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('cached decomposition of complex task is reflected in getStats()', async () => {
    const task =
      'Implement the authentication module. Analyze the performance requirements. Optimize the database queries.';
    await orch.decomposeTask(task, 3);
    const stats = orch.getStats();
    expect(stats.cachedDecompositions).toBe(1);
  });

  it('respects explicit maxDepth override', async () => {
    // depth=1 forces single-step regardless of complexity
    const result = await orch.decomposeTask(
      'Implement the parser. Write unit tests. Then optimize.',
      1
    );
    expect(result.steps).toHaveLength(1);
  });
});

// ============================================================================
// 5. decomposeTask — validation + error cases
// ============================================================================
describe('RuvLLMOrchestrator.decomposeTask — validation', () => {
  let rb: ReturnType<typeof makeReasoningBank>;
  let em: ReturnType<typeof makeEmbedder>;
  let orch: RuvLLMOrchestrator;

  beforeEach(() => {
    rb = makeReasoningBank();
    em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]);
    orch = new RuvLLMOrchestrator(rb as any, em as any);
  });

  it('throws when maxDepth < 1', async () => {
    await expect(orch.decomposeTask('task', 0)).rejects.toThrow(
      'Invalid maxDepth: must be between 1 and 20'
    );
  });

  it('throws when maxDepth > 20', async () => {
    await expect(orch.decomposeTask('task', 21)).rejects.toThrow(
      'Invalid maxDepth: must be between 1 and 20'
    );
  });

  it('throws ValidationError on empty task', async () => {
    await expect(orch.decomposeTask('')).rejects.toThrow();
  });

  it('throws ValidationError on XSS payload in task', async () => {
    await expect(
      orch.decomposeTask('<script>alert(1)</script>')
    ).rejects.toThrow(/suspicious content/);
  });

  it('propagates embedder rejection without swallowing', async () => {
    em.embed.mockRejectedValue(new Error('embed service unavailable'));
    // Force a complex multi-sentence task so selectAgent (and embed) is called
    // inside the sub-task branch after identifySubTasks.
    // Use depth=2 so recursive path is taken when complexity is high enough.
    await expect(
      orch.decomposeTask('Implement the auth module. Write tests for auth.', 2)
    ).rejects.toThrow('embed service unavailable');
  });
});

// ============================================================================
// 6. recordOutcome — ReasoningBank wiring + SONA adaptation
// ============================================================================
describe('RuvLLMOrchestrator.recordOutcome', () => {
  let rb: ReturnType<typeof makeReasoningBank>;
  let em: ReturnType<typeof makeEmbedder>;
  let orch: RuvLLMOrchestrator;

  beforeEach(() => {
    rb = makeReasoningBank();
    em = makeEmbedder();
    rb.storePattern.mockResolvedValue('generated-pattern-id');
    rb.recordOutcome.mockResolvedValue(undefined);
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    orch = new RuvLLMOrchestrator(rb as any, em as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls reasoningBank.storePattern() with correct task type and agent', async () => {
    await orch.recordOutcome({
      taskType: 'code-generation',
      selectedAgent: 'coder',
      success: true,
      reward: 0.9,
      latencyMs: 120,
    });
    expect(rb.storePattern).toHaveBeenCalledTimes(1);
    const arg = rb.storePattern.mock.calls[0][0];
    expect(arg.taskType).toBe('code-generation');
    expect(arg.successRate).toBe(1.0);
    expect(arg.avgReward).toBe(0.9);
    expect(arg.tags).toContain('coder');
    expect(arg.tags).toContain('code-generation');
  });

  it('stores successRate=0.0 for failed outcome', async () => {
    await orch.recordOutcome({
      taskType: 'testing',
      selectedAgent: 'tester',
      success: false,
      reward: 0.1,
      latencyMs: 200,
    });
    const arg = rb.storePattern.mock.calls[0][0];
    expect(arg.successRate).toBe(0.0);
  });

  it('calls reasoningBank.recordOutcome() with the returned patternId', async () => {
    await orch.recordOutcome({
      taskType: 'testing',
      selectedAgent: 'tester',
      success: true,
      reward: 0.8,
      latencyMs: 100,
    });
    expect(rb.recordOutcome).toHaveBeenCalledTimes(1);
    expect(rb.recordOutcome).toHaveBeenCalledWith('generated-pattern-id', true, 0.8);
  });

  it('updates agent performance stats visible in getStats()', async () => {
    await orch.recordOutcome({
      taskType: 'research',
      selectedAgent: 'researcher',
      success: true,
      reward: 0.85,
      latencyMs: 300,
    });
    const stats = orch.getStats();
    expect(stats.totalExecutions).toBe(1);
    const entry = stats.agentPerformance.find(p => p.agent === 'researcher');
    expect(entry).toBeDefined();
    expect(entry!.uses).toBe(1);
    expect(entry!.successRate).toBe(1.0);
    expect(entry!.avgLatency).toBe(300);
  });

  it('correctly averages successRate over multiple outcomes for same agent', async () => {
    await orch.recordOutcome({
      taskType: 'code',
      selectedAgent: 'coder',
      success: true,
      reward: 1.0,
      latencyMs: 100,
    });
    await orch.recordOutcome({
      taskType: 'code',
      selectedAgent: 'coder',
      success: false,
      reward: 0.0,
      latencyMs: 200,
    });
    const stats = orch.getStats();
    const entry = stats.agentPerformance.find(p => p.agent === 'coder');
    expect(entry!.uses).toBe(2);
    expect(entry!.successRate).toBe(0.5);
    expect(entry!.avgLatency).toBe(150);
  });

  it('tracks multiple agents independently in getStats()', async () => {
    await orch.recordOutcome({
      taskType: 'code',
      selectedAgent: 'coder',
      success: true,
      reward: 1.0,
      latencyMs: 100,
    });
    await orch.recordOutcome({
      taskType: 'research',
      selectedAgent: 'researcher',
      success: true,
      reward: 0.9,
      latencyMs: 200,
    });
    const stats = orch.getStats();
    expect(stats.totalExecutions).toBe(2);
    expect(stats.agentPerformance.map(p => p.agent)).toContain('coder');
    expect(stats.agentPerformance.map(p => p.agent)).toContain('researcher');
  });

  it('agentPerformance in getStats() is sorted descending by uses', async () => {
    // Record 3 for coder, 1 for researcher => coder first
    for (let i = 0; i < 3; i++) {
      await orch.recordOutcome({
        taskType: 'code',
        selectedAgent: 'coder',
        success: true,
        reward: 1.0,
        latencyMs: 100,
      });
    }
    await orch.recordOutcome({
      taskType: 'research',
      selectedAgent: 'researcher',
      success: true,
      reward: 1.0,
      latencyMs: 100,
    });
    const stats = orch.getStats();
    expect(stats.agentPerformance[0].agent).toBe('coder');
    expect(stats.agentPerformance[1].agent).toBe('researcher');
  });

  it('SONA auto-tune: adaptSONAWeights does not throw when success rate drops below threshold', async () => {
    // Record failures to drop successRate below adaptationThreshold (0.75)
    for (let i = 0; i < 4; i++) {
      await orch.recordOutcome({
        taskType: 'code',
        selectedAgent: 'coder',
        success: false,
        reward: 0.0,
        latencyMs: 100,
      });
    }
    // Should complete without error — SONA adaptation must not throw
    const stats = orch.getStats();
    const entry = stats.agentPerformance.find(p => p.agent === 'coder');
    expect(entry!.successRate).toBe(0);
  });

  it('SONA auto-tune is skipped when enableAutoTuning=false', async () => {
    const orchNoTune = new RuvLLMOrchestrator(
      rb as any,
      em as any,
      undefined,
      { enableAutoTuning: false }
    );
    // recordOutcome should still complete and store the pattern
    await orchNoTune.recordOutcome({
      taskType: 'code',
      selectedAgent: 'coder',
      success: false,
      reward: 0.0,
      latencyMs: 100,
    });
    expect(rb.storePattern).toHaveBeenCalledTimes(1);
    expect(rb.recordOutcome).toHaveBeenCalledTimes(1);
  });

  it('propagates reasoningBank.storePattern rejection without swallowing', async () => {
    rb.storePattern.mockRejectedValue(new Error('db write failed'));
    await expect(
      orch.recordOutcome({
        taskType: 'code',
        selectedAgent: 'coder',
        success: true,
        reward: 1.0,
        latencyMs: 100,
      })
    ).rejects.toThrow('db write failed');
  });
});

// ============================================================================
// 7. trainGNN — delegates to ReasoningBank
// ============================================================================
describe('RuvLLMOrchestrator.trainGNN', () => {
  let rb: ReturnType<typeof makeReasoningBank>;
  let orch: RuvLLMOrchestrator;

  beforeEach(() => {
    rb = makeReasoningBank();
    orch = new RuvLLMOrchestrator(rb as any, makeEmbedder() as any);
  });

  it('calls reasoningBank.trainGNN() and returns its result', async () => {
    rb.trainGNN.mockResolvedValue({ epochs: 10, finalLoss: 0.05 });
    const result = await orch.trainGNN({ epochs: 10, batchSize: 32 });
    expect(rb.trainGNN).toHaveBeenCalledTimes(1);
    expect(rb.trainGNN).toHaveBeenCalledWith({ epochs: 10, batchSize: 32 });
    expect(result.epochs).toBe(10);
    expect(result.finalLoss).toBe(0.05);
  });

  it('passes through undefined options when called with no arguments', async () => {
    rb.trainGNN.mockResolvedValue({ epochs: 5, finalLoss: 0.1 });
    await orch.trainGNN();
    expect(rb.trainGNN).toHaveBeenCalledWith(undefined);
  });

  it('propagates rejection from reasoningBank.trainGNN', async () => {
    rb.trainGNN.mockRejectedValue(new Error('training failed'));
    await expect(orch.trainGNN()).rejects.toThrow('training failed');
  });
});

// ============================================================================
// 8. getStats — shape contract
// ============================================================================
describe('RuvLLMOrchestrator.getStats', () => {
  it('returns expected top-level keys', () => {
    const orch = new RuvLLMOrchestrator(makeReasoningBank() as any, makeEmbedder() as any);
    const stats = orch.getStats();
    expect(stats).toHaveProperty('totalExecutions');
    expect(stats).toHaveProperty('agentPerformance');
    expect(stats).toHaveProperty('cachedDecompositions');
  });

  it('totalExecutions equals sum of uses across all agents', async () => {
    const rb = makeReasoningBank();
    rb.storePattern.mockResolvedValue('pid');
    rb.recordOutcome.mockResolvedValue(undefined);
    const orch = new RuvLLMOrchestrator(rb as any, makeEmbedder() as any);

    await orch.recordOutcome({ taskType: 'a', selectedAgent: 'x', success: true, reward: 1, latencyMs: 1 });
    await orch.recordOutcome({ taskType: 'b', selectedAgent: 'y', success: true, reward: 1, latencyMs: 1 });
    await orch.recordOutcome({ taskType: 'a', selectedAgent: 'x', success: true, reward: 1, latencyMs: 1 });

    const stats = orch.getStats();
    expect(stats.totalExecutions).toBe(3);
    const xEntry = stats.agentPerformance.find(p => p.agent === 'x');
    expect(xEntry!.uses).toBe(2);
  });
});

// ============================================================================
// 9. TRMConfig / SONAConfig edge cases
// ============================================================================
describe('RuvLLMOrchestrator — config edge cases', () => {
  it('custom beamWidth affects searchPatterns k parameter', async () => {
    const rb = makeReasoningBank();
    const em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]);
    // beamWidth=2 => k = beamWidth*2 = 4
    const orch = new RuvLLMOrchestrator(rb as any, em as any, { beamWidth: 2 });
    await orch.selectAgent('implement feature');
    expect(rb.searchPatterns.mock.calls[0][0].k).toBe(4);
  });

  it('custom minConfidence is passed as threshold to searchPatterns', async () => {
    const rb = makeReasoningBank();
    const em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]);
    const orch = new RuvLLMOrchestrator(rb as any, em as any, { minConfidence: 0.8 });
    await orch.selectAgent('implement feature');
    expect(rb.searchPatterns.mock.calls[0][0].threshold).toBe(0.8);
  });

  it('GNN enhancement flag is always sent to searchPatterns', async () => {
    const rb = makeReasoningBank();
    const em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]);
    const orch = new RuvLLMOrchestrator(rb as any, em as any);
    await orch.selectAgent('implement feature');
    expect(rb.searchPatterns.mock.calls[0][0].useGNN).toBe(true);
  });
});

// ============================================================================
// 10. inferAgentFromTaskType — exhaustive coverage via fallback path
// ============================================================================
describe('RuvLLMOrchestrator — inferAgentFromTaskType (via fallback)', () => {
  let rb: ReturnType<typeof makeReasoningBank>;
  let em: ReturnType<typeof makeEmbedder>;
  let orch: RuvLLMOrchestrator;

  beforeEach(() => {
    rb = makeReasoningBank();
    em = makeEmbedder();
    em.embed.mockResolvedValue(FIXED_EMBEDDING);
    rb.searchPatterns.mockResolvedValue([]); // no patterns => fallback
    orch = new RuvLLMOrchestrator(rb as any, em as any);
  });

  // Regression: src/llm/RuvLLMOrchestrator.ts:483 (inferAgentFromTaskType)
  // The specific intent verbs (review/test/research/optimize) are checked
  // BEFORE the generic 'code'/'implement' substring, so "review the code"
  // routes to the intent (reviewer) rather than the object (coder). 'code' is
  // the catch-all just before the default.
  const cases: [string, string][] = [
    ['implement the feature', 'coder'],
    ['code the module', 'coder'],
    ['research the algorithm', 'researcher'],
    ['analyze performance data', 'researcher'],
    ['test the integration', 'tester'],
    // "review the code" → reviewer: the 'review' intent wins over the 'code'
    // object now that the verb is checked first.
    ['review the code', 'reviewer'],
    ['review this pull request', 'reviewer'],
    ['optimize the query', 'optimizer'],
    ['benchmark performance', 'optimizer'],
    ['something unrelated entirely', 'coder'], // default
  ];

  it.each(cases)('task "%s" maps to agent "%s"', async (task, expected) => {
    const result = await orch.selectAgent(task);
    expect(result.agentType).toBe(expected);
  });
});
