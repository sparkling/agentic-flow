/**
 * Unit tests for GNNRouterService.
 *
 * Strategy: The service wraps a GNNServiceStub that calls getEmbeddingConfig()
 * from the optional 'agentdb' package. We mock 'agentdb' so that import
 * resolves to a hermetic stub. The GNNServiceStub is then exercised through
 * the real routing/scoring logic in GNNRouterService — only the underlying
 * GNN stub's method responses are controlled via vi.spyOn.
 *
 * Discrepancies between IGNNService interface and actual call-sites are noted
 * in comments as BUG reports (no source edits — per task constraint).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GNNRouterService, type SkillNode, type AgentProfile, type Task, type RoutingDecision } from '../../src/services/gnn-router-service.js';

// ---------------------------------------------------------------------------
// agentdb mock — must come before service import resolution in vitest
// ---------------------------------------------------------------------------
vi.mock('agentdb', () => ({
  getEmbeddingConfig: vi.fn(() => ({ dimension: 768 })),
}));

// ---------------------------------------------------------------------------
// Test-data factories
// ---------------------------------------------------------------------------

function makeEmbedding(value: number, dim = 4): Float32Array {
  return new Float32Array(dim).fill(value);
}

function makeSkillNode(name: string, category = 'general', successRate = 0.9): SkillNode {
  return {
    name,
    embedding: makeEmbedding(0.1),
    neighbors: [],
    category,
    successRate,
  };
}

function makeAgent(id: string, skills: string[], accuracy = 0.8): AgentProfile {
  return {
    id,
    name: `Agent ${id}`,
    skills,
    embedding: makeEmbedding(0.5),
    performance: {
      accuracy,
      avgResponseTime: 100,
      tasksCompleted: 10,
    },
  };
}

function makeTask(id: string, complexity = 0.5): Task {
  return {
    id,
    description: `Task ${id}`,
    embedding: makeEmbedding(0.3),
    priority: 'medium',
    estimatedComplexity: complexity,
    requiredSkills: [],
  };
}

// ---------------------------------------------------------------------------
// GNNServiceStub real-call-site compatibility shims
//
// FIXED REGRESSIONS (gnn-router-service.ts) — the IGNNService interface and the
// default GNNServiceStub were realigned to the call sites in this file, which
// were written for the agentdb@3.x GNN engine. Previously the stub crashed (or
// silently returned the wrong shape) on the GNN-less default path:
//
//   - classifyNode (line ~268) is called with (embedding, neighborEmbeddings,
//     categories); the interface/stub now accept the extra optional args.
//   - predictLinks (line ~323) is called with (source, candidates, existingDeps,
//     limit) and the caller reads `.probability`/`.targetId`; the stub now
//     returns Array<{ probability, targetId }> ([] when GNN-less) instead of a
//     number[][] matrix (which threw on `{id,embedding}.map`).
//   - processHeterogeneousGraph (line ~428) is called with (graph, queryNodeId)
//     and the caller reads `.relatedNodes`/`.pathways`; the stub now returns
//     { relatedNodes: [], pathways: [] } instead of { nodes, edges }.
//   - matchSkillsGCN (line ~539) feeds routeTask's flat skillMatches array; the
//     stub now returns Array<{ skill, score, confidence }> ([]) instead of
//     { matches, scores } (which was not iterable).
//
// The tests below spy these methods to inject controlled GNN responses so the
// real routing/scoring logic is exercised deterministically.
// ---------------------------------------------------------------------------

// Helper: intercept the internal GNNServiceStub methods AFTER construction.
// Since GNNRouterService constructs the stub in its constructor (not injectable),
// we use vi.spyOn on the prototype before each test that needs controlled stubs.

// ---------------------------------------------------------------------------
// Section 1: Registration (initialize, skillGraph, agentProfiles)
// ---------------------------------------------------------------------------

describe('GNNRouterService — registration', () => {
  let router: GNNRouterService;

  beforeEach(() => {
    router = new GNNRouterService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with zero agents, zero skills, zero tasks routed', async () => {
    await router.initialize();
    const stats = router.getStats();
    expect(stats.totalAgents).toBe(0);
    expect(stats.totalSkills).toBe(0);
    expect(stats.tasksRouted).toBe(0);
    expect(stats.avgRoutingAccuracy).toBe(0);
  });

  it('registers agents supplied via initialize options', async () => {
    const agents = [makeAgent('a1', ['TypeScript']), makeAgent('a2', ['Python'])];
    await router.initialize({ agentProfiles: agents });
    const stats = router.getStats();
    expect(stats.totalAgents).toBe(2);
  });

  it('registers skill graph supplied via initialize options', async () => {
    const graph: Record<string, SkillNode> = {
      TypeScript: makeSkillNode('TypeScript'),
      Python: makeSkillNode('Python'),
    };
    await router.initialize({ skillGraph: graph });
    const stats = router.getStats();
    expect(stats.totalSkills).toBe(2);
  });

  it('registers both agents and skill graph in a single initialize call', async () => {
    await router.initialize({
      agentProfiles: [makeAgent('a1', ['Go'])],
      skillGraph: { Go: makeSkillNode('Go'), Rust: makeSkillNode('Rust') },
    });
    const stats = router.getStats();
    expect(stats.totalAgents).toBe(1);
    expect(stats.totalSkills).toBe(2);
  });

  it('initialize with no options leaves router in empty state', async () => {
    await router.initialize();
    const stats = router.getStats();
    expect(stats.totalAgents).toBe(0);
    expect(stats.totalSkills).toBe(0);
  });

  it('engineType from getStats matches stub return value ("stub")', async () => {
    await router.initialize();
    const stats = router.getStats();
    expect(stats.engineType).toBe('stub');
  });
});

// ---------------------------------------------------------------------------
// Section 2: routeTask — deterministic scoring
//
// matchSkillsGCN now returns Array<{ skill, score, confidence }> ([] from the
// GNN-less stub). We spy on it to inject controlled skill matches so the real
// scoring arithmetic in routeTask() is exercised deterministically — not to
// mock business logic.
// ---------------------------------------------------------------------------

describe('GNNRouterService — routeTask scoring', () => {
  let router: GNNRouterService;

  beforeEach(async () => {
    router = new GNNRouterService();

    // Spy on the prototype-level matchSkillsGCN (via the internal stub
    // instance) to return a well-formed skill-match array.
    // We access private gnnService via cast to reach the spy target.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'matchSkillsGCN').mockResolvedValue([
      { skill: 'TypeScript', score: 0.9, confidence: 0.85 },
      { skill: 'Node.js', score: 0.7, confidence: 0.8 },
    ]);

    await router.initialize({
      agentProfiles: [
        makeAgent('expert', ['TypeScript', 'Node.js'], 0.95),
        makeAgent('junior', ['TypeScript'], 0.6),
        makeAgent('irrelevant', ['Python'], 0.9),
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a RoutingDecision with required shape', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert', 'junior', 'irrelevant']);
    expect(decision).toHaveProperty('agentId');
    expect(decision).toHaveProperty('confidence');
    expect(decision).toHaveProperty('reasoning');
    expect(decision).toHaveProperty('alternativeAgents');
    expect(decision).toHaveProperty('estimatedSuccessRate');
    expect(Array.isArray(decision.alternativeAgents)).toBe(true);
  });

  it('selects the agent with highest skill coverage over one with higher raw accuracy', async () => {
    // 'expert' has both skills → higher skillScore (0.6 weight)
    // 'irrelevant' has high accuracy (0.9) but no matching skills → lower total
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert', 'junior', 'irrelevant']);
    expect(decision.agentId).toBe('expert');
  });

  it('routing is deterministic: same inputs always produce same agentId', async () => {
    const task = makeTask('t1');
    const d1 = await router.routeTask(task, ['expert', 'junior', 'irrelevant']);
    const d2 = await router.routeTask(task, ['expert', 'junior', 'irrelevant']);
    expect(d1.agentId).toBe(d2.agentId);
    expect(d1.confidence).toBe(d2.confidence);
  });

  it('confidence is numeric in [0, 1] range', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert']);
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  it('reasoning string mentions matched skills', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert', 'junior']);
    expect(decision.reasoning).toContain('TypeScript');
  });

  it('alternativeAgents are sorted by descending confidence (best alt first)', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert', 'junior', 'irrelevant']);
    const confidences = decision.alternativeAgents.map(a => a.confidence);
    for (let i = 1; i < confidences.length; i++) {
      expect(confidences[i]).toBeLessThanOrEqual(confidences[i - 1]);
    }
  });

  it('top agent is NOT in alternativeAgents list', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert', 'junior', 'irrelevant']);
    const altIds = decision.alternativeAgents.map(a => a.agentId);
    expect(altIds).not.toContain(decision.agentId);
  });

  it('estimatedSuccessRate is numeric in [0, 1] range', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert']);
    expect(decision.estimatedSuccessRate).toBeGreaterThanOrEqual(0);
    expect(decision.estimatedSuccessRate).toBeLessThanOrEqual(1);
  });

  it('agent with no matching skills scores lower than skilled agent', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['expert', 'irrelevant']);
    // irrelevant only has Python, which is not in skillMatches
    expect(decision.agentId).toBe('expert');
    const irrelevantEntry = decision.alternativeAgents.find(a => a.agentId === 'irrelevant');
    expect(irrelevantEntry).toBeDefined();
    expect(irrelevantEntry!.confidence).toBeLessThan(decision.confidence);
  });
});

// ---------------------------------------------------------------------------
// Section 3: routeTask — edge cases
// ---------------------------------------------------------------------------

describe('GNNRouterService — routeTask edge cases', () => {
  let router: GNNRouterService;

  beforeEach(async () => {
    router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'matchSkillsGCN').mockResolvedValue([]);
    await router.initialize({
      agentProfiles: [makeAgent('a1', ['Go'], 0.7)],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when no agents are registered and availableAgents list is provided but empty', async () => {
    const task = makeTask('t1');
    await expect(router.routeTask(task, [])).rejects.toThrow('No suitable agents found');
  });

  it('throws when availableAgents list contains only unknown agent IDs (not in profiles)', async () => {
    const task = makeTask('t1');
    await expect(router.routeTask(task, ['unknown-agent'])).rejects.toThrow(
      'No suitable agents found'
    );
  });

  it('with empty skillMatches, performance accuracy alone determines winner', async () => {
    // Both agents have no matching skills; only performance score remains.
    // Re-initialize with two agents of different accuracies.
    router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub2 = (router as any).gnnService;
    vi.spyOn(stub2, 'matchSkillsGCN').mockResolvedValue([]);
    await router.initialize({
      agentProfiles: [makeAgent('slow', ['Go'], 0.5), makeAgent('fast', ['Go'], 0.95)],
    });
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['slow', 'fast']);
    // skillScore is 0 for both; perfScore * 0.2 dominates → 'fast' wins
    expect(decision.agentId).toBe('fast');
  });

  it('with single available agent, that agent is selected with no alternatives', async () => {
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['a1']);
    expect(decision.agentId).toBe('a1');
    expect(decision.alternativeAgents).toHaveLength(0);
  });

  it('context nodes with zero attention weights do not change winner', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    // understandContextGAT returns empty attentionWeights → contextScore = 0
    vi.spyOn(stub, 'understandContextGAT').mockResolvedValue({
      attentionWeights: {},
      aggregatedContext: new Float32Array(4),
    });
    const task = makeTask('t1');
    const context = [{ id: 'ctx1', embedding: makeEmbedding(0.1), type: 'task' }];
    const decision = await router.routeTask(task, ['a1'], context);
    expect(decision.agentId).toBe('a1');
  });

  it('context score contribution is reflected in reasoning when attention weights are non-zero', async () => {
    router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub3 = (router as any).gnnService;
    vi.spyOn(stub3, 'matchSkillsGCN').mockResolvedValue([]);
    vi.spyOn(stub3, 'understandContextGAT').mockResolvedValue({
      attentionWeights: { ctx1: 0.8 },
      aggregatedContext: new Float32Array(4),
    });
    await router.initialize({
      agentProfiles: [makeAgent('a1', ['Go'], 0.7)],
    });
    const task = makeTask('t1');
    const context = [{ id: 'ctx1', embedding: makeEmbedding(0.1), type: 'task' }];
    const decision = await router.routeTask(task, ['a1'], context);
    expect(decision.reasoning).toContain('Context alignment');
  });
});

// ---------------------------------------------------------------------------
// Section 4: routeTask — tie-breaking
// ---------------------------------------------------------------------------

describe('GNNRouterService — tie-breaking', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('when two agents have equal scores, the one earlier in availableAgents order is chosen', async () => {
    const router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    // No skill matches → scores purely from performance weight (0.2)
    vi.spyOn(stub, 'matchSkillsGCN').mockResolvedValue([]);
    await router.initialize({
      agentProfiles: [
        makeAgent('alpha', ['Go'], 0.8), // identical accuracy
        makeAgent('beta', ['Go'], 0.8),
      ],
    });
    const task = makeTask('t1');
    // Sort is not stable in all engines for equal scores, but Array.sort
    // in V8 (timsort) is stable since Node 11, so insertion order holds.
    const decision = await router.routeTask(task, ['alpha', 'beta']);
    // Both have identical score. Stable sort preserves 'alpha' first.
    expect(decision.agentId).toBe('alpha');
  });
});

// ---------------------------------------------------------------------------
// Section 5: classifyTask
//
// classifyNode accepts (embedding, neighborEmbeddings, categories). We spy on
// it to supply a controlled { category, confidence } return.
// ---------------------------------------------------------------------------

describe('GNNRouterService — classifyTask', () => {
  let router: GNNRouterService;

  beforeEach(async () => {
    router = new GNNRouterService();
    await router.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const categories = ['simple', 'moderate', 'complex', 'expert', 'research'] as const;

  for (const cat of categories) {
    it(`returns suggestedApproach for category "${cat}"`, async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stub = (router as any).gnnService;
      vi.spyOn(stub, 'classifyNode').mockResolvedValue({ category: cat, confidence: 0.9 });
      const task = makeTask('t1');
      const result = await router.classifyTask(task);
      expect(result.category).toBe(cat);
      expect(result.confidence).toBe(0.9);
      expect(result.suggestedApproach).toBeTruthy();
      expect(typeof result.suggestedApproach).toBe('string');
    });
  }

  it('passes neighbor embeddings to classifyNode when relatedTasks provided', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    const classifyNodeSpy = vi.spyOn(stub, 'classifyNode').mockResolvedValue({
      category: 'simple',
      confidence: 0.7,
    });
    const task = makeTask('t1');
    const related = [
      { id: 'r1', embedding: makeEmbedding(0.2), category: 'simple' },
    ];
    await router.classifyTask(task, related);
    expect(classifyNodeSpy).toHaveBeenCalledTimes(1);
    // Second arg should be the neighbor embeddings array
    const callArgs = classifyNodeSpy.mock.calls[0];
    // classifyNode receives: (task.embedding, neighborEmbeddings, categories)
    expect(callArgs[1]).toBeInstanceOf(Array);
    expect(callArgs[1]).toHaveLength(1); // one related task
  });

  it('passes empty neighbors array when no relatedTasks', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    const classifyNodeSpy = vi.spyOn(stub, 'classifyNode').mockResolvedValue({
      category: 'moderate',
      confidence: 0.6,
    });
    const task = makeTask('t1');
    await router.classifyTask(task);
    const callArgs = classifyNodeSpy.mock.calls[0];
    expect(callArgs[1]).toEqual([]);
  });

  it('unknown category from classifyNode produces empty suggestedApproach', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'classifyNode').mockResolvedValue({ category: 'alien', confidence: 0.5 });
    const task = makeTask('t1');
    const result = await router.classifyTask(task);
    expect(result.category).toBe('alien');
    // No switch case matches — suggestedApproach should be empty string
    expect(result.suggestedApproach).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Section 6: optimizeWorkflow
//
// predictLinks returns Array<{ probability, targetId }> ([] from the GNN-less
// stub). We spy to inject controlled link predictions for the workflow logic.
// ---------------------------------------------------------------------------

describe('GNNRouterService — optimizeWorkflow', () => {
  let router: GNNRouterService;

  beforeEach(async () => {
    router = new GNNRouterService();
    await router.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array for a single task (no pairs to predict)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'predictLinks').mockResolvedValue([]);
    const tasks = [makeTask('t1')];
    const suggestions = await router.optimizeWorkflow(tasks, []);
    expect(suggestions).toEqual([]);
  });

  it('generates a sequential suggestion when predictLinks returns high-confidence pairs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'predictLinks').mockResolvedValue([
      { targetId: 't2', probability: 0.9 },
    ]);
    const tasks = [makeTask('t1'), makeTask('t2')];
    const suggestions = await router.optimizeWorkflow(tasks, []);
    expect(suggestions.length).toBeGreaterThan(0);
    const seq = suggestions.find(s => s.type === 'sequential');
    expect(seq).toBeDefined();
    expect(seq!.tasks).toContain('t1');
    expect(seq!.tasks).toContain('t2');
  });

  it('generates a parallel suggestion when predictLinks returns medium-confidence pairs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    // Return 2 medium-confidence candidates so parallelTasks.length > 1 check passes
    vi.spyOn(stub, 'predictLinks').mockResolvedValue([
      { targetId: 't2', probability: 0.6 },
      { targetId: 't3', probability: 0.7 },
    ]);
    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3')];
    const suggestions = await router.optimizeWorkflow(tasks, []);
    const par = suggestions.find(s => s.type === 'parallel');
    expect(par).toBeDefined();
    expect(par!.tasks.length).toBeGreaterThanOrEqual(2);
  });

  it('sequential suggestion carries correct dependency shape', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'predictLinks').mockResolvedValue([
      { targetId: 't2', probability: 0.85 },
    ]);
    const tasks = [makeTask('t1'), makeTask('t2')];
    const suggestions = await router.optimizeWorkflow(tasks, []);
    const seq = suggestions.find(s => s.type === 'sequential');
    expect(seq!.dependencies).toEqual(
      expect.arrayContaining([{ from: 't1', to: 't2' }])
    );
  });

  it('deduplicates identical suggestions (same type + task set)', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    // Both t1 and t2 predict high-confidence links to each other's IDs
    vi.spyOn(stub, 'predictLinks').mockResolvedValue([
      { targetId: 't2', probability: 0.9 },
    ]);
    const tasks = [makeTask('t1'), makeTask('t2')];
    const suggestions = await router.optimizeWorkflow(tasks, []);
    // Count sequential suggestions — deduplication should prevent exact duplicates
    const seqSuggestions = suggestions.filter(s => s.type === 'sequential');
    const keys = seqSuggestions.map(s => `${s.type}:${s.tasks.slice().sort().join(',')}`);
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });

  it('results are sorted by descending expectedEfficiency', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'predictLinks').mockResolvedValue([
      { targetId: 't2', probability: 0.6 },
      { targetId: 't3', probability: 0.65 },
      { targetId: 't4', probability: 0.9 },
    ]);
    const tasks = [makeTask('t1'), makeTask('t2'), makeTask('t3'), makeTask('t4')];
    const suggestions = await router.optimizeWorkflow(tasks, []);
    const efficiencies = suggestions.map(s => s.expectedEfficiency);
    for (let i = 1; i < efficiencies.length; i++) {
      expect(efficiencies[i]).toBeLessThanOrEqual(efficiencies[i - 1]);
    }
  });

  it('existingDependencies filter suppresses a parallel candidate for its source task', async () => {
    // The filter at line 337 is:
    //   !existingDependencies.some(d => d.from === sourceTask.id && d.to === p.targetId)
    // So {from:'t1', to:'t2'} causes p.targetId='t2' to be excluded from t1's
    // parallel candidates. Use a single source task (t1 only) so we control
    // exactly which calls happen, plus a single other task in the task list
    // so t1 is the only source that iterates over candidates. We give t1 two
    // medium-confidence predictions: t2 (dep-filtered) and t-other. After
    // filtering, only t-other remains → parallelTasks.length === 1 → no
    // parallel suggestion is pushed (the `> 1` guard prevents it).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'predictLinks').mockResolvedValue([
      { targetId: 't2', probability: 0.6 },   // excluded by existingDependencies
      { targetId: 'tX', probability: 0.65 },  // only 1 remains after filter
    ]);
    // Two tasks: t1 (source) + t2 (candidate). tX is returned by mock but
    // is not a real task node — the filter only cares about the dep match,
    // not whether targetId is a real task, so this is a valid unit test.
    const tasks = [makeTask('t1'), makeTask('t2')];
    const existing = [{ from: 't1', to: 't2' }];
    const suggestions = await router.optimizeWorkflow(tasks, existing);
    // After filtering t2: parallelTasks = [{targetId:'tX'}] → length === 1,
    // which does NOT satisfy > 1 → no parallel suggestion from t1.
    // t2 as source task: predictLinks returns the same mock. t2's filter
    // checks d.from==='t2', which is false for {from:'t1',...} — so t2's
    // own results are not filtered. But with only {targetId:'t2'} and
    // {targetId:'tX'}, both pass, giving parallelTasks.length === 2 for t2.
    // The test specifically pins that t1→t2 is excluded from t1's parallel
    // suggestion, not t2's.
    const parallelForT1 = suggestions.find(
      s => s.type === 'parallel' && s.tasks[0] === 't1'
    );
    expect(parallelForT1).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Section 7: analyzeSystemGraph
//
// processHeterogeneousGraph returns { relatedNodes, pathways } ({ [], [] } from
// the GNN-less stub). We spy to inject controlled graph results for insights.
// ---------------------------------------------------------------------------

describe('GNNRouterService — analyzeSystemGraph', () => {
  let router: GNNRouterService;

  const validGraphResult = {
    embedding: new Float32Array(4),
    relatedNodes: [
      { id: 'agent:a1', type: 'agent', relevance: 0.9 },
      { id: 'skill:TypeScript', type: 'skill', relevance: 0.8 },
    ],
    pathways: [
      { path: ['agent:a1', 'skill:TypeScript'], strength: 0.75 },
    ],
  };

  beforeEach(async () => {
    router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'processHeterogeneousGraph').mockResolvedValue(validGraphResult);
    await router.initialize({
      agentProfiles: [makeAgent('a1', ['TypeScript'], 0.8)],
      skillGraph: { TypeScript: makeSkillNode('TypeScript') },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns embedding, relatedNodes, pathways, and insights', async () => {
    const result = await router.analyzeSystemGraph('agent', 'a1');
    expect(result).toHaveProperty('embedding');
    expect(result).toHaveProperty('relatedNodes');
    expect(result).toHaveProperty('pathways');
    expect(result).toHaveProperty('insights');
    expect(Array.isArray(result.insights)).toBe(true);
  });

  it('generates insights mentioning agent nodes', async () => {
    const result = await router.analyzeSystemGraph('agent', 'a1');
    const agentInsight = result.insights.find(i => i.includes('agent:a1'));
    expect(agentInsight).toBeDefined();
  });

  it('generates insights mentioning skill nodes', async () => {
    const result = await router.analyzeSystemGraph('skill', 'TypeScript');
    const skillInsight = result.insights.find(i => i.includes('skill:TypeScript'));
    expect(skillInsight).toBeDefined();
  });

  it('generates pathway insight when pathways exist', async () => {
    const result = await router.analyzeSystemGraph('agent', 'a1');
    const pathwayInsight = result.insights.find(i => i.includes('Strongest pathway'));
    expect(pathwayInsight).toBeDefined();
    expect(pathwayInsight).toContain('0.75');
  });

  it('produces no insights when processHeterogeneousGraph returns empty related/pathways', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'processHeterogeneousGraph').mockResolvedValue({
      embedding: new Float32Array(4),
      relatedNodes: [],
      pathways: [],
    });
    const result = await router.analyzeSystemGraph('task', 'unknown');
    expect(result.insights).toHaveLength(0);
  });

  it('includes agent nodes from registered agentProfiles in the heterogeneous graph', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    const processGraphSpy = vi.spyOn(stub, 'processHeterogeneousGraph').mockResolvedValue(
      validGraphResult
    );
    await router.analyzeSystemGraph('agent', 'a1');
    const callArgs = processGraphSpy.mock.calls[0];
    const graph = callArgs[0] as { nodes: Array<{ id: string; type: string }> };
    const agentNode = graph.nodes.find(n => n.id === 'agent:a1');
    expect(agentNode).toBeDefined();
    expect(agentNode!.type).toBe('agent');
  });

  it('includes skill nodes from registered skillGraph in the heterogeneous graph', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    const processGraphSpy = vi.spyOn(stub, 'processHeterogeneousGraph').mockResolvedValue(
      validGraphResult
    );
    await router.analyzeSystemGraph('skill', 'TypeScript');
    const callArgs = processGraphSpy.mock.calls[0];
    const graph = callArgs[0] as { nodes: Array<{ id: string; type: string }> };
    const skillNode = graph.nodes.find(n => n.id === 'skill:TypeScript');
    expect(skillNode).toBeDefined();
    expect(skillNode!.type).toBe('skill');
  });
});

// ---------------------------------------------------------------------------
// Section 8: recordTaskExecution + getStats
// ---------------------------------------------------------------------------

describe('GNNRouterService — recordTaskExecution and getStats', () => {
  let router: GNNRouterService;

  beforeEach(async () => {
    router = new GNNRouterService();
    await router.initialize({
      agentProfiles: [makeAgent('a1', ['TypeScript'], 0.8)],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('increments tasksRouted after each recordTaskExecution call', () => {
    router.recordTaskExecution('t1', 'a1', true, 100);
    expect(router.getStats().tasksRouted).toBe(1);
    router.recordTaskExecution('t2', 'a1', false, 200);
    expect(router.getStats().tasksRouted).toBe(2);
  });

  it('avgRoutingAccuracy reflects success/failure ratio', () => {
    router.recordTaskExecution('t1', 'a1', true, 100);
    router.recordTaskExecution('t2', 'a1', true, 100);
    router.recordTaskExecution('t3', 'a1', false, 100);
    const stats = router.getStats();
    // 2 successes out of 3 = 0.666...
    expect(stats.avgRoutingAccuracy).toBeCloseTo(2 / 3, 5);
  });

  it('avgRoutingAccuracy is 0 when no tasks have been recorded', () => {
    expect(router.getStats().avgRoutingAccuracy).toBe(0);
  });

  it('avgRoutingAccuracy is 1 when all recorded tasks succeeded', () => {
    router.recordTaskExecution('t1', 'a1', true, 100);
    router.recordTaskExecution('t2', 'a1', true, 100);
    expect(router.getStats().avgRoutingAccuracy).toBe(1);
  });

  it('updates agent performance.accuracy based on rolling last-20-tasks window', () => {
    // Record 5 tasks: 3 success, 2 fail → accuracy should be 0.6
    router.recordTaskExecution('t1', 'a1', true, 50);
    router.recordTaskExecution('t2', 'a1', true, 60);
    router.recordTaskExecution('t3', 'a1', true, 70);
    router.recordTaskExecution('t4', 'a1', false, 80);
    router.recordTaskExecution('t5', 'a1', false, 90);
    // Inspect agent accuracy via subsequent routeTask decision
    // We verify it indirectly: a1's accuracy is now 0.6
    // Direct check via cast:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = (router as any).agentProfiles as Map<string, AgentProfile>;
    const agent = profiles.get('a1');
    expect(agent).toBeDefined();
    expect(agent!.performance.accuracy).toBeCloseTo(0.6, 5);
  });

  it('updates agent performance.tasksCompleted monotonically', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = (router as any).agentProfiles as Map<string, AgentProfile>;
    const agent = profiles.get('a1')!;
    const initial = agent.performance.tasksCompleted;
    router.recordTaskExecution('t1', 'a1', true, 100);
    router.recordTaskExecution('t2', 'a1', true, 100);
    expect(agent.performance.tasksCompleted).toBe(initial + 2);
  });

  it('does not throw when recording for an unknown agentId (no profile)', () => {
    expect(() => router.recordTaskExecution('t1', 'ghost-agent', true, 100)).not.toThrow();
    // Task is still counted in global history
    expect(router.getStats().tasksRouted).toBe(1);
  });

  it('avgResponseTime reflects average duration of recent tasks', () => {
    router.recordTaskExecution('t1', 'a1', true, 100);
    router.recordTaskExecution('t2', 'a1', true, 200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = (router as any).agentProfiles as Map<string, AgentProfile>;
    const agent = profiles.get('a1')!;
    expect(agent.performance.avgResponseTime).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Section 9: estimateSuccessRate (private, exercised via routeTask)
// ---------------------------------------------------------------------------

describe('GNNRouterService — estimateSuccessRate (via routeTask)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('experience boost increases estimatedSuccessRate capped at 0.99', async () => {
    const router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'matchSkillsGCN').mockResolvedValue([
      { skill: 'Go', score: 1.0, confidence: 1.0 },
    ]);
    // High accuracy + many tasks completed → rate approaches but stays ≤ 0.99
    const highPerf: AgentProfile = {
      id: 'veteran',
      name: 'Veteran',
      skills: ['Go'],
      embedding: makeEmbedding(0.5),
      performance: { accuracy: 0.99, avgResponseTime: 10, tasksCompleted: 1000 },
    };
    await router.initialize({ agentProfiles: [highPerf] });
    const task = makeTask('t1');
    const decision = await router.routeTask(task, ['veteran']);
    expect(decision.estimatedSuccessRate).toBeLessThanOrEqual(0.99);
    expect(decision.estimatedSuccessRate).toBeGreaterThan(0);
  });

  it('estimatedSuccessRate is 0.5 for agentId that is no longer in profiles', async () => {
    // estimateSuccessRate returns 0.5 when agent not found
    const router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    vi.spyOn(stub, 'matchSkillsGCN').mockResolvedValue([]);
    await router.initialize({
      agentProfiles: [makeAgent('a1', ['Go'], 0.7)],
    });
    // Manually delete agent from map to simulate the "not found" branch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = (router as any).agentProfiles as Map<string, AgentProfile>;
    profiles.delete('a1');
    // Re-add 'a1' back just to pass routing (routeTask checks availableAgents in profiles)
    // This test exercises the path where estimateSuccessRate is called with an
    // agentId that resolves in availableAgents scoring but is then missing from profiles.
    // We test the branch directly via the formula: if !agent return 0.5.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routerPrivate = router as any;
    const result = routerPrivate.estimateSuccessRate('ghost', []);
    expect(result).toBe(0.5);
  });

  it('returns a finite probability (not NaN) when skillMatches is empty', async () => {
    // Regression (gnn-router-service.ts line 553): an empty skillMatches array
    // gave avgSkillScore = 0 / 0 = NaN, poisoning the returned rate. The
    // Math.max(length, 1) guard (mirroring routeTask line 197) keeps it finite:
    //   avgSkillScore = 0  ->  rate = accuracy*0.6 + 0*0.4 = 0.48  (accuracy 0.8)
    //   experienceBoost = min(tasksCompleted/100, 0.1) = 0.1  (tasksCompleted 10)
    //   => 0.48 + 0.1 = 0.58
    const router = new GNNRouterService();
    await router.initialize({ agentProfiles: [makeAgent('a1', [], 0.8)] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const routerPrivate = router as any;
    const result = routerPrivate.estimateSuccessRate('a1', []);
    expect(Number.isNaN(result)).toBe(false);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeCloseTo(0.58, 5);
  });
});

// ---------------------------------------------------------------------------
// Section 10: deduplicateSuggestions (private, exercised via optimizeWorkflow)
// ---------------------------------------------------------------------------

describe('GNNRouterService — deduplicateSuggestions (via optimizeWorkflow)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('canonical de-dup key uses sorted task list (order-independent)', async () => {
    const router = new GNNRouterService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stub = (router as any).gnnService;
    // Force predictLinks for t1→t2 and t2→t1 to both return high-confidence
    // links to each other — creates two sequential suggestions with reversed
    // task arrays that should deduplicate to one.
    let callCount = 0;
    vi.spyOn(stub, 'predictLinks').mockImplementation(async () => {
      const otherTaskId = callCount++ === 0 ? 't2' : 't1';
      return [{ targetId: otherTaskId, probability: 0.9 }];
    });
    await router.initialize();
    const tasks = [makeTask('t1'), makeTask('t2')];
    const suggestions = await router.optimizeWorkflow(tasks, []);
    // Both produce sequential suggestions with tasks ['t1','t2'] in some order.
    // deduplicateSuggestions uses sort() on the task list → same key → 1 result.
    const seqSuggestions = suggestions.filter(s => s.type === 'sequential');
    const keys = seqSuggestions.map(s => s.tasks.slice().sort().join(','));
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});
