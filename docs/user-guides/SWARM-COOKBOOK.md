# Swarm Orchestration Cookbook

> **Production-ready recipes** for multi-agent coordination patterns

This cookbook provides battle-tested orchestration recipes for common development scenarios.

---

## Table of Contents

1. [Common Swarm Patterns](#common-swarm-patterns)
2. [Topology Selection Guide](#topology-selection-guide)
3. [Agent Coordination Examples](#agent-coordination-examples)
4. [Debugging Swarms](#debugging-swarms)
5. [Performance Optimization](#performance-optimization)

---

## Common Swarm Patterns

### Pattern 1: Full-Stack Development Swarm

**Use Case:** Building a complete web application with frontend, backend, database, and tests.

**Topology:** Hierarchical (tree structure with coordinator)

```typescript
import { SwarmOrchestrator } from 'agentic-flow';

const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 8,
  memory: 'hybrid',
  consensus: 'raft'
});

await swarm.init();

// Spawn coordinator
const coordinator = await swarm.spawnCoordinator({
  type: 'system-architect',
  name: 'lead-architect'
});

// Spawn specialist agents
const agents = await swarm.spawnAgents([
  // Backend team
  { type: 'backend-dev', name: 'api-developer', parent: 'lead-architect' },
  { type: 'backend-dev', name: 'auth-specialist', parent: 'lead-architect' },

  // Frontend team
  { type: 'coder', name: 'ui-developer', parent: 'lead-architect' },
  { type: 'coder', name: 'state-manager', parent: 'lead-architect' },

  // Support team
  { type: 'tester', name: 'qa-engineer', parent: 'lead-architect' },
  { type: 'cicd-engineer', name: 'devops', parent: 'lead-architect' },
  { type: 'security-architect', name: 'security', parent: 'lead-architect' }
]);

// Orchestrate with phases
const result = await swarm.orchestrate({
  task: 'Build e-commerce platform with React frontend, Express backend, PostgreSQL',
  strategy: 'specialized',
  priority: 'high',
  phases: [
    {
      name: 'architecture',
      agents: ['lead-architect'],
      outputs: ['system-design.md', 'api-spec.yaml']
    },
    {
      name: 'backend',
      agents: ['api-developer', 'auth-specialist'],
      dependsOn: ['architecture'],
      outputs: ['src/server.ts', 'src/auth.ts', 'src/database.ts']
    },
    {
      name: 'frontend',
      agents: ['ui-developer', 'state-manager'],
      dependsOn: ['architecture'],
      outputs: ['src/components/', 'src/store/']
    },
    {
      name: 'testing',
      agents: ['qa-engineer'],
      dependsOn: ['backend', 'frontend'],
      outputs: ['tests/']
    },
    {
      name: 'deployment',
      agents: ['devops', 'security'],
      dependsOn: ['testing'],
      outputs: ['Dockerfile', 'k8s/']
    }
  ]
});

console.log(`✅ Complete! Duration: ${result.durationMs}ms`);
console.log(`Files created: ${result.filesCreated}`);
console.log(`Tests passed: ${result.testsPassed}/${result.testsTotal}`);
```

**Expected Results:**
- Duration: 5-15 minutes
- Files: 50-100 source files
- Test coverage: 85-95%
- Success rate: 90%+

---

### Pattern 2: Research & Analysis Swarm

**Use Case:** Deep research with multiple perspectives.

**Topology:** Mesh (peer-to-peer collaboration)

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'mesh',
  maxAgents: 6,
  memory: 'shared',
  consensus: 'gossip'
});

await swarm.init();

// All agents are peers
const agents = await swarm.spawnAgents([
  { type: 'researcher', name: 'tech-researcher' },
  { type: 'researcher', name: 'market-researcher' },
  { type: 'researcher', name: 'competitor-analyst' },
  { type: 'code-analyzer', name: 'code-analyst' },
  { type: 'planner', name: 'strategist' },
  { type: 'researcher', name: 'trend-analyst' }
]);

// Orchestrate collaborative research
const result = await swarm.orchestrate({
  task: `Research enterprise AI agent platforms for 2025:
    - Technical capabilities comparison
    - Market positioning and pricing
    - Code quality analysis (if open source)
    - Competitive advantages
    - Future trends`,
  strategy: 'collaborative',
  priority: 'high',
  deliverables: [
    'research-report.md',
    'competitive-matrix.csv',
    'recommendations.md'
  ]
});

// Results are synthesized from all perspectives
console.log(`Research completed by ${result.agentsParticipated} agents`);
console.log(`Insights generated: ${result.insights.length}`);
console.log(`Recommendations: ${result.recommendations.length}`);
```

**Expected Results:**
- Duration: 3-10 minutes
- Insights: 50-100 findings
- Recommendations: 10-20 actionable items
- Confidence: 85%+

---

### Pattern 3: Code Migration Swarm

**Use Case:** Large-scale codebase migration or refactoring.

**Topology:** Adaptive (switches automatically)

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'adaptive',  // Starts mesh, switches to hierarchical
  maxAgents: 12,
  memory: 'hybrid',
  autoScale: true
});

await swarm.init();

// Analysis phase (mesh topology)
const analysisResult = await swarm.orchestrate({
  task: 'Analyze codebase for migration from JavaScript to TypeScript',
  phase: 'analysis',
  strategy: 'collaborative',
  agents: [
    'code-analyzer',
    'code-analyzer',
    'code-analyzer'
  ]
});

// Migration phase (switches to hierarchical automatically)
const migrationResult = await swarm.orchestrate({
  task: 'Migrate identified files to TypeScript with proper types',
  phase: 'implementation',
  strategy: 'specialized',
  parallelism: 8,  // Process 8 files concurrently
  files: analysisResult.filesToMigrate
});

// Testing phase (back to mesh for collaborative testing)
const testingResult = await swarm.orchestrate({
  task: 'Create comprehensive tests for migrated code',
  phase: 'testing',
  strategy: 'collaborative',
  agents: ['tester', 'tester', 'tester']
});

console.log(`Migrated ${migrationResult.filesCompleted} files`);
console.log(`Test coverage: ${testingResult.coverage}%`);
console.log(`Type safety: ${migrationResult.typeErrors === 0 ? 'Perfect' : `${migrationResult.typeErrors} errors`}`);
```

**Expected Results:**
- Duration: 15-60 minutes (depends on codebase size)
- Files migrated: 100-1000
- Type coverage: 95%+
- Zero type errors

---

### Pattern 4: Security Audit Swarm

**Use Case:** Comprehensive security review.

**Topology:** Hierarchical (security lead + specialists)

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 6,
  memory: 'hybrid'
});

await swarm.init();

const coordinator = await swarm.spawnCoordinator({
  type: 'security-architect',
  name: 'security-lead'
});

const agents = await swarm.spawnAgents([
  { type: 'security-auditor', name: 'auth-auditor', parent: 'security-lead' },
  { type: 'security-auditor', name: 'crypto-auditor', parent: 'security-lead' },
  { type: 'security-auditor', name: 'api-auditor', parent: 'security-lead' },
  { type: 'code-analyzer', name: 'static-analyzer', parent: 'security-lead' },
  { type: 'tester', name: 'penetration-tester', parent: 'security-lead' }
]);

const result = await swarm.orchestrate({
  task: 'Comprehensive security audit of authentication system',
  strategy: 'specialized',
  audits: [
    {
      type: 'authentication',
      agent: 'auth-auditor',
      checks: ['oauth2', 'jwt', 'session', 'passwords']
    },
    {
      type: 'cryptography',
      agent: 'crypto-auditor',
      checks: ['encryption', 'hashing', 'key-management']
    },
    {
      type: 'api-security',
      agent: 'api-auditor',
      checks: ['rate-limiting', 'input-validation', 'cors', 'csrf']
    },
    {
      type: 'static-analysis',
      agent: 'static-analyzer',
      checks: ['sql-injection', 'xss', 'secrets', 'dependencies']
    },
    {
      type: 'penetration-testing',
      agent: 'penetration-tester',
      checks: ['brute-force', 'token-replay', 'privilege-escalation']
    }
  ]
});

// Generate security report
console.log(`Security Score: ${result.score}/100`);
console.log(`Critical Issues: ${result.findings.critical.length}`);
console.log(`High Severity: ${result.findings.high.length}`);
console.log(`Recommendations: ${result.recommendations.length}`);
```

**Expected Results:**
- Duration: 10-30 minutes
- Vulnerabilities found: 0-20
- Recommendations: 10-50
- Report: Comprehensive with CVSS scores

---

### Pattern 5: Documentation Generation Swarm

**Use Case:** Auto-generate comprehensive documentation.

**Topology:** Mesh (collaborative documentation)

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'mesh',
  maxAgents: 5,
  memory: 'shared'
});

await swarm.init();

const agents = await swarm.spawnAgents([
  { type: 'api-docs', name: 'api-documenter' },
  { type: 'coder', name: 'code-documenter' },
  { type: 'planner', name: 'architecture-documenter' },
  { type: 'coder', name: 'tutorial-writer' },
  { type: 'reviewer', name: 'doc-reviewer' }
]);

const result = await swarm.orchestrate({
  task: 'Generate complete documentation suite for API platform',
  strategy: 'collaborative',
  deliverables: [
    {
      type: 'api-reference',
      agent: 'api-documenter',
      format: 'openapi-3.0',
      output: 'docs/api-reference.yaml'
    },
    {
      type: 'code-comments',
      agent: 'code-documenter',
      style: 'jsdoc',
      coverage: 0.95
    },
    {
      type: 'architecture',
      agent: 'architecture-documenter',
      diagrams: ['system', 'component', 'deployment'],
      output: 'docs/architecture.md'
    },
    {
      type: 'tutorials',
      agent: 'tutorial-writer',
      topics: ['quickstart', 'authentication', 'advanced-usage'],
      output: 'docs/tutorials/'
    },
    {
      type: 'review',
      agent: 'doc-reviewer',
      checks: ['accuracy', 'completeness', 'clarity']
    }
  ]
});

console.log(`Documentation complete!`);
console.log(`API endpoints: ${result.apiEndpoints}`);
console.log(`Code coverage: ${result.codeCoverage}%`);
console.log(`Tutorials: ${result.tutorials.length}`);
```

**Expected Results:**
- Duration: 5-15 minutes
- API endpoints: 100% coverage
- Code comments: 95%+ coverage
- Tutorials: 5-10 comprehensive guides

---

## Topology Selection Guide

### Decision Matrix

| Factor | Hierarchical | Mesh | Adaptive |
|--------|-------------|------|----------|
| **Task Complexity** | High (many steps) | Medium | Variable |
| **Agent Count** | 5-20 | 3-8 | Any |
| **Coordination** | Centralized | Distributed | Dynamic |
| **Performance** | Predictable | Fast convergence | Optimal |
| **Failure Handling** | Leader election | Peer failover | Automatic |
| **Use Cases** | Development, Migration | Research, Analysis | Multi-phase |

### When to Use Each

**Hierarchical:**
- ✅ Clear hierarchy needed
- ✅ Specialized roles
- ✅ Complex workflows
- ✅ Accountability required
- ❌ Single point of failure
- ❌ Slower for brainstorming

**Mesh:**
- ✅ Collaborative work
- ✅ Brainstorming
- ✅ No hierarchy
- ✅ Fast consensus
- ❌ Can be chaotic
- ❌ Harder to track progress

**Adaptive:**
- ✅ Multi-phase projects
- ✅ Uncertain requirements
- ✅ Optimal performance
- ✅ Automatic optimization
- ❌ More complex setup
- ❌ Harder to predict

---

## Agent Coordination Examples

### Example 1: Synchronized File Operations

```typescript
// Problem: Multiple agents modifying same files causes conflicts

// Solution: Use coordination primitives
const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 5,
  coordination: {
    lockTimeout: 5000,
    conflictResolution: 'coordinator-decides'
  }
});

// Agents automatically coordinate file access
await swarm.orchestrate({
  task: 'Refactor authentication module',
  coordination: {
    locks: {
      'src/auth.ts': 'exclusive',  // Only one agent at a time
      'src/types.ts': 'shared'     // Multiple readers OK
    }
  }
});
```

### Example 2: Task Dependencies

```typescript
// Problem: Tasks must execute in order

// Solution: Define dependencies explicitly
await swarm.orchestrate({
  task: 'Build payment system',
  subtasks: [
    {
      id: 'design',
      description: 'Design payment flow',
      agent: 'system-architect',
      dependencies: []
    },
    {
      id: 'implement-api',
      description: 'Implement payment API',
      agent: 'backend-dev',
      dependencies: ['design']
    },
    {
      id: 'implement-ui',
      description: 'Implement payment UI',
      agent: 'coder',
      dependencies: ['design']
    },
    {
      id: 'integrate',
      description: 'Integrate API and UI',
      agent: 'coder',
      dependencies: ['implement-api', 'implement-ui']
    },
    {
      id: 'test',
      description: 'End-to-end testing',
      agent: 'tester',
      dependencies: ['integrate']
    }
  ]
});
```

### Example 3: Progress Tracking

```typescript
// Problem: Need to monitor long-running swarms

// Solution: Use progress events
swarm.on('progress', (event) => {
  console.log(`Agent ${event.agentName}: ${event.status}`);
  console.log(`Progress: ${event.percentComplete}%`);
  console.log(`ETA: ${event.etaSeconds}s`);
});

swarm.on('task-complete', (event) => {
  console.log(`✅ ${event.taskId} completed by ${event.agentName}`);
});

swarm.on('error', (event) => {
  console.error(`❌ ${event.taskId} failed: ${event.error.message}`);
  console.log(`Retrying with backup agent...`);
});
```

---

## Debugging Swarms

### Common Issues

**Issue 1: Agents Not Coordinating**

```typescript
// Check swarm status
const status = await swarm.getStatus();
console.log(`Topology: ${status.topology}`);
console.log(`Agents: ${status.agents.length}`);
console.log(`Memory: ${status.memory}`);

// Check agent connectivity
for (const agent of status.agents) {
  console.log(`${agent.name}: ${agent.status} (last seen: ${agent.lastSeen}ms ago)`);
}

// Enable debug logging
swarm.setLogLevel('debug');
```

**Issue 2: Tasks Stuck**

```typescript
// Check task status
const taskStatus = await swarm.getTaskStatus(taskId);
console.log(`Status: ${taskStatus.status}`);
console.log(`Agent: ${taskStatus.assignedAgent}`);
console.log(`Started: ${taskStatus.startTime}`);
console.log(`Dependencies: ${taskStatus.blockedBy.join(', ')}`);

// Force task reassignment
if (taskStatus.status === 'stuck') {
  await swarm.reassignTask(taskId, 'backup-agent');
}
```

**Issue 3: Memory Issues**

```typescript
// Check memory usage
const memStats = await swarm.getMemoryStats();
console.log(`Shared memory: ${memStats.shared}MB`);
console.log(`Local memory: ${memStats.local}MB`);
console.log(`Total: ${memStats.total}MB`);

// Clear stale data
if (memStats.total > 1000) {
  await swarm.pruneMemory({
    maxAge: 3600000,  // 1 hour
    keepRecent: 100
  });
}
```

### Debug Checklist

- [ ] Verify swarm initialized: `await swarm.init()`
- [ ] Check agent count: `status.agents.length > 0`
- [ ] Verify topology: `status.topology === 'hierarchical'`
- [ ] Check memory mode: `status.memory === 'hybrid'`
- [ ] Verify consensus: `status.consensus === 'raft'`
- [ ] Check coordinator: `status.coordinator !== null`
- [ ] Verify connectivity: All agents' `lastSeen < 5000ms`
- [ ] Check task queue: `status.tasks.pending < maxAgents * 2`

---

## Performance Optimization

### Optimization 1: Parallel Execution

```typescript
// ❌ Bad: Sequential (slow)
for (const file of files) {
  await agent.processFile(file);
}

// ✅ Good: Parallel (2.8-4.4x faster)
await swarm.orchestrate({
  task: 'Process files',
  strategy: 'parallel',
  parallelism: 8,  // 8 concurrent agents
  files: files
});
```

### Optimization 2: Batch Operations

```typescript
// ❌ Bad: One at a time
for (const pattern of patterns) {
  await reasoningBank.storePattern(pattern);
}

// ✅ Good: Batched (3-4x faster)
import { BatchOperations } from 'agentdb/optimizations';

const batchOps = new BatchOperations(db, embedder, {
  batchSize: 100,
  parallelism: 4
});

await batchOps.insertPatterns(patterns);
```

### Optimization 3: Caching

```typescript
// Enable aggressive caching for read-heavy workloads
const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 10,
  cache: {
    enabled: true,
    ttl: 60000,  // 60s
    maxSize: 1000,
    strategy: 'lru'  // Least Recently Used
  }
});
```

### Optimization 4: Auto-Scaling

```typescript
// Scale agents dynamically based on load
const swarm = new SwarmOrchestrator({
  topology: 'adaptive',
  maxAgents: 20,
  autoScale: {
    enabled: true,
    minAgents: 5,
    maxAgents: 20,
    scaleUpThreshold: 0.8,   // Scale up at 80% capacity
    scaleDownThreshold: 0.3, // Scale down at 30% capacity
    cooldownMs: 30000        // Wait 30s between scaling
  }
});
```

### Performance Metrics

| Optimization | Speedup | Cost | Complexity |
|-------------|---------|------|------------|
| Parallel execution | 2.8-4.4x | None | Low |
| Batch operations | 3-4x | None | Low |
| Caching | 8.8x | Memory | Medium |
| Auto-scaling | 2-3x | Token cost | Medium |
| Adaptive topology | 1.5-2x | None | High |

---

## Next Steps

- **[Performance Tuning](./PERFORMANCE-TUNING.md)** — Deep optimization guide
- **[API Reference](./API-REFERENCE.md)** — Controller documentation
- **[Troubleshooting](./TROUBLESHOOTING.md)** — Common issues

---

**Questions?** Open an issue on [GitHub](https://github.com/ruvnet/agentic-flow/issues).
