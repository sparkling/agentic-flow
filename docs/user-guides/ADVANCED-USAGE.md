# Advanced Usage Patterns

> **Master Agentic Flow** — Multi-agent coordination, custom hooks, performance optimization, and distributed deployments

This guide covers advanced patterns for production systems using Agentic Flow.

---

## Table of Contents

1. [Multi-Agent Coordination](#multi-agent-coordination)
2. [Custom Hooks Creation](#custom-hooks-creation)
3. [Performance Tuning](#performance-tuning)
4. [Distributed Deployments](#distributed-deployments)
5. [Production Best Practices](#production-best-practices)

---

## Multi-Agent Coordination

### Pattern 1: Hierarchical Coding Swarm

**Use Case:** Complex feature development with specialized roles

```typescript
import { SwarmOrchestrator } from 'agentic-flow';

const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 10,
  memory: 'hybrid',
  consensus: 'raft'  // Leader-based consensus
});

await swarm.init();

// Spawn coordinator
const coordinator = await swarm.spawnCoordinator({
  type: 'hierarchical-coordinator',
  name: 'lead-architect'
});

// Spawn specialist agents
const agents = await swarm.spawnAgents([
  { type: 'backend-dev', name: 'api-dev', parent: 'lead-architect' },
  { type: 'coder', name: 'frontend-dev', parent: 'lead-architect' },
  { type: 'ml-developer', name: 'ml-engineer', parent: 'lead-architect' },
  { type: 'security-architect', name: 'security-lead', parent: 'lead-architect' },
  { type: 'tester', name: 'qa-engineer', parent: 'lead-architect' },
  { type: 'cicd-engineer', name: 'devops-lead', parent: 'lead-architect' }
]);

// Orchestrate with automatic load balancing
const result = await swarm.orchestrate({
  task: 'Build ML-powered recommendation engine with REST API',
  strategy: 'specialized',
  priority: 'high',
  timeout: 3600000  // 1 hour
});

console.log(`Completed in ${result.durationMs}ms`);
console.log(`Agents used: ${result.agentsUsed}`);
console.log(`Success rate: ${result.successRate}`);
```

**Benefits:**
- Clear hierarchy and accountability
- Automatic task delegation
- Built-in conflict resolution
- Progress tracking and rollback

### Pattern 2: Mesh Research Swarm

**Use Case:** Open-ended research with peer collaboration

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'mesh',  // All agents can communicate directly
  maxAgents: 6,
  memory: 'shared',  // Single shared memory space
  consensus: 'gossip'  // Peer-to-peer consensus
});

await swarm.init();

// All agents are peers
const agents = await swarm.spawnAgents([
  { type: 'researcher', name: 'research-1' },
  { type: 'researcher', name: 'research-2' },
  { type: 'researcher', name: 'research-3' },
  { type: 'code-analyzer', name: 'analyzer-1' },
  { type: 'planner', name: 'strategist-1' }
]);

// Coordinate without hierarchy
const result = await swarm.orchestrate({
  task: 'Research and propose microservices architecture for enterprise system',
  strategy: 'collaborative',
  priority: 'high'
});
```

**Benefits:**
- No single point of failure
- Faster convergence for brainstorming
- Natural load distribution
- Resilient to agent failures

### Pattern 3: Adaptive Swarm (Topology Switching)

**Use Case:** Dynamic workloads with changing requirements

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'adaptive',  // Switches automatically
  maxAgents: 12,
  memory: 'hybrid',
  autoScale: true  // Scale agents dynamically
});

await swarm.init();

// Start with research (mesh topology)
await swarm.orchestrate({
  task: 'Research best practices for payment processing',
  phase: 'research'
});

// Switch to hierarchical for implementation
// (happens automatically based on task complexity)
await swarm.orchestrate({
  task: 'Implement payment processing with Stripe integration',
  phase: 'implementation'
});

// Switch back to mesh for testing
await swarm.orchestrate({
  task: 'Comprehensive testing of payment flows',
  phase: 'testing'
});
```

**Benefits:**
- Optimal topology for each phase
- No manual topology management
- Better resource utilization
- Learns from past task patterns

---

## Custom Hooks Creation

Hooks let you intercept and augment agent operations. Perfect for:
- Custom logging and metrics
- Security validation
- Automatic code formatting
- Pattern learning
- Cost tracking

### Hook Types

| Hook | Fires | Use Cases |
|------|-------|-----------|
| `pre-task` | Before task starts | Validation, resource allocation |
| `post-task` | After task completes | Metrics, pattern storage, cleanup |
| `pre-command` | Before CLI command | Authorization, rate limiting |
| `post-command` | After CLI command | Logging, notifications |
| `pre-edit` | Before code edit | Linting, backup |
| `post-edit` | After code edit | Formatting, testing, memory update |
| `session-start` | Session begins | Context restoration, setup |
| `session-end` | Session ends | State persistence, reporting |

### Example 1: Custom Cost Tracking Hook

```typescript
import { HookRegistry } from 'agentic-flow';

// Register custom post-task hook
HookRegistry.register('post-task', async (context) => {
  const { task, result, agent } = context;

  // Calculate cost
  const inputTokens = result.tokensUsed?.input || 0;
  const outputTokens = result.tokensUsed?.output || 0;

  const cost = (inputTokens * 0.003 / 1000) + (outputTokens * 0.015 / 1000);

  // Store in analytics database
  await db.query(`
    INSERT INTO task_costs (task_id, agent_type, cost, tokens_input, tokens_output)
    VALUES (?, ?, ?, ?, ?)
  `, [task.id, agent.type, cost, inputTokens, outputTokens]);

  // Alert if cost exceeds threshold
  if (cost > 1.0) {
    console.warn(`⚠️ High cost detected: $${cost.toFixed(2)} for task ${task.id}`);
  }

  console.log(`💰 Task cost: $${cost.toFixed(4)}`);
});
```

### Example 2: Automatic Pattern Learning Hook

```typescript
import { HookRegistry } from 'agentic-flow';
import { ReasoningBank } from 'agentdb';

const reasoningBank = new ReasoningBank(db, embedder);

HookRegistry.register('post-task', async (context) => {
  const { task, result, agent } = context;

  // Only store successful patterns
  if (result.success && result.successRate >= 0.8) {
    await reasoningBank.storePattern({
      taskType: task.type,
      approach: result.approach || task.description,
      successRate: result.successRate,
      tags: [agent.type, task.category],
      metadata: {
        durationMs: result.durationMs,
        tokensUsed: result.tokensUsed?.total,
        agent: agent.name
      }
    });

    console.log(`🧠 Learned new pattern for ${task.type}`);
  }
});
```

### Example 3: Security Validation Hook

```typescript
HookRegistry.register('pre-edit', async (context) => {
  const { file, content, agent } = context;

  // Check for hardcoded secrets
  const secretPatterns = [
    /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
    /password\s*=\s*['"][^'"]+['"]/i,
    /secret\s*=\s*['"][^'"]+['"]/i,
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      throw new Error(`❌ Security: Hardcoded secret detected in ${file}`);
    }
  }

  // Check file permissions
  if (file.includes('/config/') || file.includes('/.env')) {
    console.warn(`⚠️ Editing sensitive file: ${file}`);
  }

  return true;
});
```

### Example 4: Automatic Testing Hook

```typescript
HookRegistry.register('post-edit', async (context) => {
  const { file, content, agent } = context;

  // Only run for code files
  if (!file.match(/\.(ts|js|tsx|jsx)$/)) return;

  // Skip test files
  if (file.includes('.test.') || file.includes('.spec.')) return;

  console.log(`🧪 Running tests for ${file}...`);

  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);

  try {
    // Run tests related to this file
    const testFile = file.replace(/\.(ts|js)$/, '.test.$1');
    const { stdout, stderr } = await execAsync(`npm test -- ${testFile}`);

    if (stderr) {
      console.warn(`⚠️ Test warnings: ${stderr}`);
    }

    console.log(`✅ Tests passed for ${file}`);
  } catch (error) {
    console.error(`❌ Tests failed for ${file}:`, error.message);
    // Don't throw - just log the failure
  }
});
```

### Registering Hooks via CLI

```bash
# Enable built-in hooks
npx agentic-flow hooks enable pre-task
npx agentic-flow hooks enable post-edit

# List available hooks
npx agentic-flow hooks list

# Test a hook
npx agentic-flow hooks test pre-task --dry-run

# Get hook metrics
npx agentic-flow hooks metrics --format json
```

---

## Performance Tuning

### 1. Backend Selection Strategy

AgentDB auto-selects the optimal backend, but you can override:

```typescript
import { createDatabase } from 'agentdb';

// Force RuVector backend (150x faster)
const db = await createDatabase('./memory.db', {
  backend: 'ruvector',
  dimension: 768
});

// Force HNSWLib (100x faster, C++ HNSW)
const db2 = await createDatabase('./memory.db', {
  backend: 'hnswlib',
  dimension: 384
});

// Force SQLite (most compatible)
const db3 = await createDatabase('./memory.db', {
  backend: 'sqlite',
  dimension: 384
});
```

**Benchmark Results:**
- RuVector: 61µs p50 latency, 150x faster than SQLite
- HNSWLib: 100x faster than SQLite
- SQLite: Universal compatibility, works everywhere

### 2. WASM Optimization

Enable WASM acceleration for compute-intensive operations:

```typescript
import { WASMVectorSearch } from 'agentdb/controllers';

const wasmSearch = new WASMVectorSearch({
  dimension: 384,
  enableSIMD: true,  // Enable SIMD operations
  threads: 4         // Parallel threads
});

await wasmSearch.initialize();

// Ultra-fast search
const results = await wasmSearch.search(queryEmbedding, 10);
```

**Performance:**
- 352x faster code operations vs traditional agents
- SIMD acceleration: 2-4x additional speedup
- Multi-threading: Linear scaling up to CPU core count

### 3. Memory Management

Optimize memory usage for large-scale deployments:

```typescript
import { BatchOperations } from 'agentdb/optimizations';

const batchOps = new BatchOperations(db, embedder, {
  batchSize: 100,      // Process 100 items per batch
  parallelism: 8,      // 8 concurrent embeddings
  enableCompression: true,  // Compress vectors
  pruneOldData: true   // Auto-prune old memories
});

// Batch insert (3-4x faster)
const skillIds = await batchOps.insertSkills([...1000 skills]);

// Automatic pruning
const pruned = await batchOps.pruneData({
  maxAge: 90,          // Keep last 90 days
  minReward: 0.3,      // Keep high-quality memories
  maxRecords: 100000   // Cap at 100k records
});
```

**Benefits:**
- 3-4x faster bulk operations
- Automatic memory management
- Reduced disk usage
- Better query performance

### 4. Batch Operation Patterns

```typescript
// Pattern 1: Bulk pattern storage
const patterns = Array.from({ length: 500 }, (_, i) => ({
  taskType: 'code_review',
  approach: `Approach ${i}`,
  successRate: 0.8 + Math.random() * 0.2
}));

const patternIds = await batchOps.insertPatterns(patterns);
// 4x faster than sequential inserts

// Pattern 2: Bulk episode storage
const episodes = Array.from({ length: 200 }, (_, i) => ({
  sessionId: `session-${i}`,
  task: `Task ${i}`,
  reward: 0.7 + Math.random() * 0.3,
  success: true
}));

const episodeIds = await batchOps.insertEpisodes(episodes);
// 3.3x faster than sequential
```

### 5. Caching Strategies

```typescript
import { ToolCache, MCPToolCaches } from 'agentdb/optimizations';

// Use specialized caches
const caches = new MCPToolCaches();
// Automatically optimized TTLs for different data types

// Custom cache
const customCache = new ToolCache(1000, 60000);  // 1000 items, 60s TTL

// Set with custom TTL
customCache.set('expensive-computation', result, 120000);  // 2 min

// Get with automatic expiration
const cached = customCache.get('expensive-computation');

// Pattern-based clearing
customCache.clear('stats:*');  // Clear all stats caches

// Get metrics
const stats = customCache.getStats();
console.log(`Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

**Performance Impact:**
- 8.8x faster stats queries
- 80%+ hit rates for frequently accessed data
- Reduced database load
- Lower latency

---

## Distributed Deployments

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Load Balancer (Nginx)                  │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
┌───────▼────────┐ ┌──────▼────────┐ ┌─────▼──────────┐
│   Agent Node 1  │ │  Agent Node 2  │ │  Agent Node 3  │
│  (Coordinator)  │ │   (Workers)    │ │   (Workers)    │
└────────┬────────┘ └───────┬────────┘ └────────┬───────┘
         │                  │                    │
         └──────────────────┼────────────────────┘
                            │
                  ┌─────────▼────────┐
                  │ Shared AgentDB    │
                  │  (PostgreSQL)     │
                  └───────────────────┘
```

### Pattern 1: Kubernetes Deployment

```yaml
# kubernetes/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentic-flow-coordinator
spec:
  replicas: 1  # Single coordinator
  selector:
    matchLabels:
      app: agentic-flow
      role: coordinator
  template:
    metadata:
      labels:
        app: agentic-flow
        role: coordinator
    spec:
      containers:
      - name: coordinator
        image: agentic-flow:latest
        env:
        - name: NODE_ROLE
          value: "coordinator"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: anthropic-key
        - name: DATABASE_URL
          valueFrom:
            configMapKeyRef:
              name: config
              key: database-url
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentic-flow-workers
spec:
  replicas: 5  # Scale workers horizontally
  selector:
    matchLabels:
      app: agentic-flow
      role: worker
  template:
    metadata:
      labels:
        app: agentic-flow
        role: worker
    spec:
      containers:
      - name: worker
        image: agentic-flow:latest
        env:
        - name: NODE_ROLE
          value: "worker"
        - name: COORDINATOR_URL
          value: "http://coordinator-service:8080"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
```

### Pattern 2: Docker Compose Stack

```yaml
# docker-compose.yml
version: '3.8'

services:
  coordinator:
    image: agentic-flow:latest
    environment:
      - NODE_ROLE=coordinator
      - DATABASE_URL=postgresql://user:pass@postgres:5432/agentdb
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "8080:8080"
    depends_on:
      - postgres
    networks:
      - agent-network

  worker-1:
    image: agentic-flow:latest
    environment:
      - NODE_ROLE=worker
      - COORDINATOR_URL=http://coordinator:8080
      - DATABASE_URL=postgresql://user:pass@postgres:5432/agentdb
    depends_on:
      - coordinator
    networks:
      - agent-network

  worker-2:
    image: agentic-flow:latest
    environment:
      - NODE_ROLE=worker
      - COORDINATOR_URL=http://coordinator:8080
      - DATABASE_URL=postgresql://user:pass@postgres:5432/agentdb
    depends_on:
      - coordinator
    networks:
      - agent-network

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=agentdb
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - agent-network

volumes:
  pgdata:

networks:
  agent-network:
    driver: bridge
```

### Pattern 3: Multi-Region Deployment

```typescript
import { DistributedSwarm } from 'agentic-flow';

const swarm = new DistributedSwarm({
  regions: [
    { name: 'us-east-1', coordinatorUrl: 'https://coord-us.example.com' },
    { name: 'eu-west-1', coordinatorUrl: 'https://coord-eu.example.com' },
    { name: 'ap-south-1', coordinatorUrl: 'https://coord-ap.example.com' }
  ],
  sharedDatabase: 'postgresql://...',
  replicationStrategy: 'multi-master',
  failover: {
    enabled: true,
    healthCheckInterval: 30000,  // 30s
    failoverThreshold: 3  // 3 failed checks
  }
});

await swarm.init();

// Orchestrate globally
const result = await swarm.orchestrate({
  task: 'Process 1M records',
  strategy: 'geo-distributed',
  affinityRules: {
    'data-processing': 'us-east-1',  // Data in US
    'ml-inference': 'eu-west-1',     // GPU in EU
    'api-serving': 'ap-south-1'      // Serve Asia
  }
});
```

---

## Production Best Practices

### 1. Error Handling and Retry Logic

```typescript
import { SwarmOrchestrator, RetryPolicy } from 'agentic-flow';

const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 10,
  retryPolicy: {
    maxRetries: 3,
    backoffMs: 1000,
    backoffMultiplier: 2,  // Exponential backoff
    retryableErrors: ['RATE_LIMIT', 'TIMEOUT', 'NETWORK_ERROR']
  },
  errorHandling: {
    onError: async (error, context) => {
      // Log to monitoring service
      await logger.error('Agent error', {
        agent: context.agent.name,
        task: context.task.id,
        error: error.message,
        stack: error.stack
      });

      // Notify team on critical errors
      if (error.severity === 'critical') {
        await notifyOnCall(error);
      }
    },
    onRetry: (attempt, maxRetries, error) => {
      console.log(`⚠️ Retry ${attempt}/${maxRetries}: ${error.message}`);
    }
  }
});
```

### 2. Monitoring and Observability

```typescript
import { MetricsCollector } from 'agentic-flow';

const metrics = new MetricsCollector({
  provider: 'prometheus',  // or 'datadog', 'cloudwatch'
  pushInterval: 10000,     // Push every 10s
  labels: {
    environment: 'production',
    region: 'us-east-1',
    version: '1.0.0'
  }
});

// Track agent performance
metrics.track('agent.task.duration', result.durationMs, {
  agent: agent.name,
  task: task.type,
  success: result.success
});

// Track memory usage
metrics.gauge('agentdb.memory.size', db.getMemorySize());

// Track swarm coordination
metrics.counter('swarm.agents.spawned', 1, { topology: 'hierarchical' });

// Alert on anomalies
metrics.alert('agent.failure.rate', failureRate, {
  threshold: 0.1,  // Alert if >10% failure rate
  window: '5m'
});
```

### 3. Security Best Practices

```typescript
// ✅ DO: Use environment variables
const apiKey = process.env.ANTHROPIC_API_KEY;

// ❌ DON'T: Hardcode secrets
const apiKey = 'sk-ant-...';  // NEVER DO THIS

// ✅ DO: Validate all inputs
import { validateTaskString } from 'agentdb/security/input-validation';

try {
  const task = validateTaskString(userInput, 'task');
  // Checks for XSS, SQL injection, length limits
} catch (error) {
  console.error('Invalid input:', error.message);
}

// ✅ DO: Use least privilege
const agent = await swarm.spawnAgent({
  type: 'coder',
  permissions: {
    filesystem: 'read-write',
    network: 'none',  // No network access
    exec: 'restricted'  // Limited shell access
  }
});

// ✅ DO: Enable audit logging
const db = await createDatabase('./memory.db', {
  auditLog: true,
  logPath: '/var/log/agentdb/audit.log'
});
```

### 4. Cost Optimization

```typescript
import { ModelRouter } from 'agentic-flow/router';

const router = new ModelRouter({
  defaultProvider: 'openrouter',
  costOptimization: {
    enabled: true,
    priority: 'cost',  // or 'quality', 'speed'
    budget: {
      daily: 100,      // $100/day
      perTask: 1       // $1/task max
    },
    fallback: {
      onBudgetExceeded: 'use-cheaper-model',
      cheapestModel: 'meta-llama/llama-3.1-8b-instruct'
    }
  }
});

// Route automatically to cheapest model
const response = await router.chat({
  model: 'auto',
  messages: [{ role: 'user', content: task }]
});

console.log(`Cost: $${response.metadata.cost.toFixed(4)}`);
console.log(`Model: ${response.metadata.model}`);
```

### 5. Graceful Degradation

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 10,
  degradation: {
    enabled: true,
    strategies: [
      {
        condition: 'high-latency',
        threshold: 5000,  // >5s latency
        action: 'reduce-agents',
        target: 5  // Scale down to 5 agents
      },
      {
        condition: 'low-memory',
        threshold: 0.8,  // <20% memory available
        action: 'use-simpler-model',
        model: 'claude-3-haiku'
      },
      {
        condition: 'rate-limit',
        action: 'queue-tasks',
        maxQueueSize: 100
      }
    ]
  }
});
```

---

## Next Steps

- **[API Reference](./API-REFERENCE.md)** — Complete controller documentation
- **[Performance Tuning](./PERFORMANCE-TUNING.md)** — Deep optimization guide
- **[Swarm Cookbook](./SWARM-COOKBOOK.md)** — More orchestration recipes
- **[Troubleshooting](./TROUBLESHOOTING.md)** — Common issues

---

**Questions?** Open an issue on [GitHub](https://github.com/ruvnet/agentic-flow/issues).
