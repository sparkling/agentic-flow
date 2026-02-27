# MCP Tools Reference

> **Complete documentation** for all 85+ MCP tools with examples, parameters, and usage patterns

---

## Table of Contents

1. [Memory & Storage (11 tools)](#memory--storage)
2. [Agent Management (12 tools)](#agent-management)
3. [Swarm Coordination (8 tools)](#swarm-coordination)
4. [GitHub Integration (8 tools)](#github-integration)
5. [Neural & Learning (18 tools)](#neural--learning)
6. [Performance & Analytics (6 tools)](#performance--analytics)
7. [Workflow Automation (8 tools)](#workflow-automation)
8. [Autopilot (7 tools)](#autopilot)
9. [Advanced Features (7 tools)](#advanced-features)

---

## Memory & Storage

### `memory_store`

Store data in persistent memory with optional TTL and tags.

**Parameters:**
```json
{
  "key": "string (required)",
  "value": "any (required)",
  "namespace": "string (optional, default: 'default')",
  "ttl": "number (optional, seconds)",
  "tags": "string[] (optional)"
}
```

**Example:**
```typescript
await mcp__claude-flow__memory_store({
  key: "swarm/config",
  value: { topology: "hierarchical", maxAgents: 8 },
  namespace: "coordination",
  ttl: 3600,
  tags: ["swarm", "config"]
});
```

**Performance:** <1ms latency

---

### `memory_retrieve`

Retrieve data from memory by key.

**Parameters:**
```json
{
  "key": "string (required)",
  "namespace": "string (optional, default: 'default')"
}
```

**Example:**
```typescript
const config = await mcp__claude-flow__memory_retrieve({
  key: "swarm/config",
  namespace: "coordination"
});
```

**Performance:** <1ms latency (cached)

---

### `memory_search`

Semantic search across stored memories.

**Parameters:**
```json
{
  "query": "string (required)",
  "namespace": "string (optional)",
  "limit": "number (optional, default: 10)",
  "threshold": "number (optional, 0.0-1.0, default: 0.7)"
}
```

**Example:**
```typescript
const results = await mcp__claude-flow__memory_search({
  query: "authentication patterns",
  namespace: "patterns",
  limit: 5,
  threshold: 0.8
});
```

**Performance:** 32.6M ops/sec (ultra-fast with caching)

---

### `memory_list`

List all keys in a namespace.

**Parameters:**
```json
{
  "namespace": "string (optional)",
  "limit": "number (optional, default: 100)"
}
```

**Example:**
```typescript
const keys = await mcp__claude-flow__memory_list({
  namespace: "patterns",
  limit: 50
});
```

---

### `memory_delete`

Delete memory by key.

**Parameters:**
```json
{
  "key": "string (required)",
  "namespace": "string (optional)"
}
```

**Example:**
```typescript
await mcp__claude-flow__memory_delete({
  key: "old-pattern",
  namespace: "patterns"
});
```

---

### `memory_stats`

Get memory usage statistics.

**Parameters:**
```json
{
  "namespace": "string (optional)"
}
```

**Example:**
```typescript
const stats = await mcp__claude-flow__memory_stats({
  namespace: "patterns"
});
// { totalKeys: 500, totalSize: "15MB", namespaces: 5 }
```

---

### `memory_namespace`

Create or configure a namespace.

**Parameters:**
```json
{
  "name": "string (required)",
  "ttl": "number (optional, seconds)",
  "maxSize": "number (optional, bytes)"
}
```

---

### `memory_migrate`

Migrate data between namespaces.

**Parameters:**
```json
{
  "fromNamespace": "string (required)",
  "toNamespace": "string (required)",
  "pattern": "string (optional, key pattern)"
}
```

---

### `pattern_store`

Store reasoning pattern.

**Parameters:**
```json
{
  "taskType": "string (required)",
  "approach": "string (required)",
  "successRate": "number (required, 0.0-1.0)",
  "tags": "string[] (optional)",
  "metadata": "object (optional)"
}
```

**Example:**
```typescript
await mcp__claude-flow__pattern_store({
  taskType: "code_review",
  approach: "Security → Type safety → Code quality",
  successRate: 0.94,
  tags: ["security", "typescript"]
});
```

**Performance:** 388K ops/sec

---

### `pattern_search`

Search for similar patterns.

**Parameters:**
```json
{
  "task": "string (required)",
  "k": "number (optional, default: 10)",
  "threshold": "number (optional, default: 0.7)"
}
```

**Example:**
```typescript
const patterns = await mcp__claude-flow__pattern_search({
  task: "security code review",
  k: 5,
  threshold: 0.8
});
```

**Performance:** 32.6M ops/sec

---

### `pattern_stats`

Get pattern statistics.

**Parameters:** None

**Example:**
```typescript
const stats = await mcp__claude-flow__pattern_stats();
// { totalPatterns: 5000, avgSuccessRate: 0.87 }
```

---

## Agent Management

### `agent_spawn`

Spawn a new agent.

**Parameters:**
```json
{
  "type": "string (required)",
  "name": "string (optional)",
  "config": "object (optional)"
}
```

**Example:**
```typescript
const agent = await mcp__claude-flow__agent_spawn({
  type: "coder",
  name: "backend-dev",
  config: {
    specialization: "backend",
    language: "typescript"
  }
});
```

**Performance:** <100ms spawn time

---

### `agent_list`

List all active agents.

**Parameters:**
```json
{
  "type": "string (optional)",
  "status": "string (optional, 'active' | 'idle' | 'error')"
}
```

**Example:**
```typescript
const agents = await mcp__claude-flow__agent_list({
  type: "coder",
  status: "active"
});
```

---

### `agent_execute`

Execute task with specific agent.

**Parameters:**
```json
{
  "agentId": "string (required)",
  "task": "string (required)",
  "priority": "string (optional, 'low' | 'medium' | 'high')",
  "timeout": "number (optional, ms)"
}
```

**Example:**
```typescript
const result = await mcp__claude-flow__agent_execute({
  agentId: "agent-123",
  task: "Refactor authentication module",
  priority: "high",
  timeout: 60000
});
```

---

### `agent_metrics`

Get agent performance metrics.

**Parameters:**
```json
{
  "agentId": "string (optional)",
  "timeRange": "string (optional, '1h' | '24h' | '7d')"
}
```

**Example:**
```typescript
const metrics = await mcp__claude-flow__agent_metrics({
  agentId: "agent-123",
  timeRange: "24h"
});
// { tasksCompleted: 50, avgDuration: 15000, successRate: 0.95 }
```

---

### `agent_terminate`

Terminate agent.

**Parameters:**
```json
{
  "agentId": "string (required)",
  "graceful": "boolean (optional, default: true)"
}
```

---

### `agent_health`

Check agent health status.

**Parameters:**
```json
{
  "agentId": "string (required)"
}
```

**Returns:**
```json
{
  "status": "healthy | degraded | unhealthy",
  "cpu": 0.45,
  "memory": 512000000,
  "uptime": 3600000
}
```

---

### `agent_pool`

Manage agent pool.

**Parameters:**
```json
{
  "action": "create | scale | destroy",
  "poolId": "string (required)",
  "size": "number (optional)"
}
```

---

### `agent_status`

Get detailed agent status.

**Parameters:**
```json
{
  "agentId": "string (required)"
}
```

---

### `agent_update`

Update agent configuration.

**Parameters:**
```json
{
  "agentId": "string (required)",
  "config": "object (required)"
}
```

---

### `agent_info`

Get agent information.

**Parameters:**
```json
{
  "agentId": "string (required)"
}
```

---

### `agent_add`

Add agent to registry.

**Parameters:**
```json
{
  "type": "string (required)",
  "definition": "object (required)"
}
```

---

### `command_add`

Add custom command.

**Parameters:**
```json
{
  "name": "string (required)",
  "handler": "function (required)"
}
```

---

## Swarm Coordination

### `swarm_init`

Initialize swarm with topology.

**Parameters:**
```json
{
  "topology": "string (required, 'hierarchical' | 'mesh' | 'adaptive')",
  "maxAgents": "number (optional, default: 10)",
  "memory": "string (optional, 'shared' | 'hybrid' | 'local')",
  "consensus": "string (optional, 'raft' | 'gossip' | 'byzantine')"
}
```

**Example:**
```typescript
await mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  memory: "hybrid",
  consensus: "raft"
});
```

**Performance:** <50ms initialization

---

### `swarm_status`

Get swarm status.

**Parameters:**
```json
{
  "swarmId": "string (optional)"
}
```

**Returns:**
```json
{
  "status": "active",
  "topology": "hierarchical",
  "agents": 8,
  "tasks": { "running": 3, "completed": 15, "failed": 0 }
}
```

---

### `task_orchestrate`

Orchestrate task across swarm.

**Parameters:**
```json
{
  "task": "string (required)",
  "strategy": "string (required, 'parallel' | 'specialized' | 'collaborative')",
  "priority": "string (optional, 'low' | 'medium' | 'high')",
  "maxAgents": "number (optional)"
}
```

**Example:**
```typescript
const result = await mcp__claude-flow__task_orchestrate({
  task: "Build payment processing system",
  strategy: "specialized",
  priority: "high",
  maxAgents: 6
});
```

**Performance:** 2.8-4.4x faster than sequential

---

### `task_status`

Get task status.

**Parameters:**
```json
{
  "taskId": "string (required)"
}
```

---

### `task_results`

Get task results.

**Parameters:**
```json
{
  "taskId": "string (required)"
}
```

---

### `task_create`

Create new task.

**Parameters:**
```json
{
  "description": "string (required)",
  "assignee": "string (optional)",
  "priority": "string (optional)"
}
```

---

### `task_cancel`

Cancel running task.

**Parameters:**
```json
{
  "taskId": "string (required)"
}
```

---

### `task_update`

Update task status.

**Parameters:**
```json
{
  "taskId": "string (required)",
  "status": "string (required)",
  "metadata": "object (optional)"
}
```

---

## GitHub Integration

### `github_repo_analyze`

Analyze GitHub repository.

**Parameters:**
```json
{
  "owner": "string (required)",
  "repo": "string (required)",
  "depth": "string (optional, 'basic' | 'full')"
}
```

**Example:**
```typescript
const analysis = await mcp__claude-flow__github_repo_analyze({
  owner: "ruvnet",
  repo: "agentic-flow",
  depth: "full"
});
// { languages: {...}, contributors: [...], health: 0.9 }
```

---

### `github_pr_manage`

Manage pull requests.

**Parameters:**
```json
{
  "action": "create | review | merge | close",
  "owner": "string (required)",
  "repo": "string (required)",
  "prNumber": "number (optional)"
}
```

---

### `github_issue_track`

Track and manage issues.

**Parameters:**
```json
{
  "action": "create | update | close | label",
  "owner": "string (required)",
  "repo": "string (required)",
  "issueNumber": "number (optional)"
}
```

---

### `github_code_review`

Automated code review.

**Parameters:**
```json
{
  "owner": "string (required)",
  "repo": "string (required)",
  "prNumber": "number (required)",
  "checks": "string[] (optional, ['security', 'quality', 'performance'])"
}
```

---

### `github_release_coord`

Coordinate releases.

**Parameters:**
```json
{
  "owner": "string (required)",
  "repo": "string (required)",
  "version": "string (required)",
  "generateChangelog": "boolean (optional)"
}
```

---

### `github_workflow`

Manage GitHub Actions workflows.

**Parameters:**
```json
{
  "action": "list | run | cancel",
  "owner": "string (required)",
  "repo": "string (required)",
  "workflowId": "string (optional)"
}
```

---

### `github_sync`

Multi-repo synchronization.

**Parameters:**
```json
{
  "repos": "array (required)",
  "syncType": "string (required, 'config' | 'workflows' | 'docs')"
}
```

---

### `github_metrics`

Repository metrics and analytics.

**Parameters:**
```json
{
  "owner": "string (required)",
  "repo": "string (required)",
  "timeRange": "string (optional, '7d' | '30d' | '90d')"
}
```

---

## Neural & Learning

### `neural_train`

Train neural patterns.

**Parameters:**
```json
{
  "data": "array (required)",
  "epochs": "number (optional, default: 10)",
  "learningRate": "number (optional, default: 0.001)"
}
```

---

### `neural_predict`

Predict using learned patterns.

**Parameters:**
```json
{
  "input": "any (required)",
  "modelId": "string (optional)"
}
```

---

### `neural_patterns`

List/manage neural patterns.

**Parameters:**
```json
{
  "action": "list | export | import",
  "modelId": "string (optional)"
}
```

---

### `neural_compress`

Compress and optimize patterns.

**Parameters:**
```json
{
  "modelId": "string (required)",
  "compressionRatio": "number (optional, default: 0.5)"
}
```

---

### `neural_status`

Learning system status.

**Parameters:** None

---

### `learning_adapt`

Adaptive learning configuration.

**Parameters:**
```json
{
  "strategy": "string (required)",
  "parameters": "object (optional)"
}
```

---

### `learning_start_session`

Start RL session.

**Parameters:**
```json
{
  "sessionId": "string (required)",
  "algorithm": "string (required, 'q-learning' | 'ppo' | 'dqn' | ...)",
  "config": "object (optional)"
}
```

---

### `learning_predict`

Get AI recommendation.

**Parameters:**
```json
{
  "sessionId": "string (required)",
  "state": "object (required)"
}
```

---

### `learning_feedback`

Submit action feedback.

**Parameters:**
```json
{
  "sessionId": "string (required)",
  "actionId": "string (required)",
  "reward": "number (required)",
  "metadata": "object (optional)"
}
```

---

### `learning_train`

Batch policy training.

**Parameters:**
```json
{
  "sessionId": "string (required)",
  "epochs": "number (optional)",
  "batchSize": "number (optional)"
}
```

---

### `learning_metrics`

Performance analytics.

**Parameters:**
```json
{
  "sessionId": "string (required)"
}
```

---

### `learning_transfer`

Transfer learning between sessions.

**Parameters:**
```json
{
  "sourceSessionId": "string (required)",
  "targetSessionId": "string (required)"
}
```

---

### `learning_explain`

Explainable AI reasoning.

**Parameters:**
```json
{
  "sessionId": "string (required)",
  "actionId": "string (required)"
}
```

---

### `experience_record`

Record tool execution.

**Parameters:**
```json
{
  "toolName": "string (required)",
  "execution": "object (required)"
}
```

---

### `reward_signal`

Calculate rewards.

**Parameters:**
```json
{
  "execution": "object (required)",
  "criteria": "object (optional)"
}
```

---

### `reflexion_store`

Store episode with critique.

**Parameters:**
```json
{
  "sessionId": "string (required)",
  "task": "string (required)",
  "reward": "number (required)",
  "success": "boolean (required)",
  "critique": "string (required)"
}
```

---

### `reflexion_retrieve`

Retrieve similar episodes.

**Parameters:**
```json
{
  "task": "string (required)",
  "k": "number (optional, default: 10)",
  "onlySuccesses": "boolean (optional)"
}
```

---

### `skill_create`

Create reusable skill.

**Parameters:**
```json
{
  "name": "string (required)",
  "description": "string (required)",
  "signature": "object (required)",
  "code": "string (required)"
}
```

---

### `skill_search`

Search for applicable skills.

**Parameters:**
```json
{
  "task": "string (required)",
  "k": "number (optional, default: 10)",
  "minSuccessRate": "number (optional)"
}
```

---

## Performance & Analytics

### `performance_metrics`

System performance metrics.

**Parameters:**
```json
{
  "timeRange": "string (optional, '1h' | '24h' | '7d')",
  "metrics": "string[] (optional)"
}
```

---

### `performance_benchmark`

Run performance benchmarks.

**Parameters:**
```json
{
  "suite": "string (required)",
  "iterations": "number (optional, default: 100)"
}
```

---

### `performance_bottleneck`

Detect performance bottlenecks.

**Parameters:**
```json
{
  "component": "string (optional)"
}
```

---

### `performance_optimize`

Optimize performance.

**Parameters:**
```json
{
  "target": "string (required)",
  "strategy": "string (optional)"
}
```

---

### `performance_profile`

Profile execution.

**Parameters:**
```json
{
  "taskId": "string (required)"
}
```

---

### `performance_report`

Generate performance report.

**Parameters:**
```json
{
  "format": "string (optional, 'json' | 'html' | 'pdf')",
  "timeRange": "string (optional)"
}
```

---

## Workflow Automation

### `workflow_create`

Create automated workflow.

**Parameters:**
```json
{
  "name": "string (required)",
  "steps": "array (required)",
  "trigger": "string (optional)"
}
```

---

### `workflow_execute`

Execute workflow.

**Parameters:**
```json
{
  "workflowId": "string (required)",
  "inputs": "object (optional)"
}
```

---

### `workflow_status`

Get workflow status.

**Parameters:**
```json
{
  "workflowId": "string (required)"
}
```

---

### `workflow_pause`

Pause running workflow.

**Parameters:**
```json
{
  "workflowId": "string (required)"
}
```

---

### `workflow_resume`

Resume paused workflow.

**Parameters:**
```json
{
  "workflowId": "string (required)"
}
```

---

### `workflow_cancel`

Cancel workflow.

**Parameters:**
```json
{
  "workflowId": "string (required)"
}
```

---

### `workflow_template`

Use workflow template.

**Parameters:**
```json
{
  "templateId": "string (required)",
  "parameters": "object (optional)"
}
```

---

### `workflow_list`

List workflows.

**Parameters:**
```json
{
  "status": "string (optional)"
}
```

---

## Autopilot

### `autopilot_status`

Get autopilot status.

**Parameters:** None

---

### `autopilot_config`

Configure autopilot.

**Parameters:**
```json
{
  "maxIterations": "number (optional)",
  "timeout": "number (optional)",
  "strategy": "string (optional)"
}
```

---

### `autopilot_start`

Start autopilot mode.

**Parameters:**
```json
{
  "task": "string (required)",
  "config": "object (optional)"
}
```

---

### `autopilot_stop`

Stop autopilot mode.

**Parameters:** None

---

### `autopilot_progress`

Get autopilot progress.

**Parameters:** None

---

### `autopilot_results`

Get autopilot results.

**Parameters:** None

---

### `autopilot_retry`

Retry failed autopilot task.

**Parameters:**
```json
{
  "taskId": "string (required)"
}
```

---

## Advanced Features

### `hooks_list`

List available hooks.

**Parameters:** None

---

### `session_save`

Save session state.

**Parameters:**
```json
{
  "sessionId": "string (required)",
  "name": "string (optional)"
}
```

---

### `session_restore`

Restore session state.

**Parameters:**
```json
{
  "sessionId": "string (required)"
}
```

---

### `daemon_start`

Start daemon process.

**Parameters:**
```json
{
  "config": "object (optional)"
}
```

---

### `daemon_stop`

Stop daemon process.

**Parameters:** None

---

### `hivemind_init`

Initialize hive-mind consensus.

**Parameters:**
```json
{
  "nodes": "number (required)",
  "algorithm": "string (optional)"
}
```

---

### `hivemind_status`

Get hive-mind status.

**Parameters:** None

---

## Usage Patterns

### Pattern 1: Multi-Agent Research

```typescript
// Initialize swarm
await mcp__claude-flow__swarm_init({
  topology: "mesh",
  maxAgents: 5
});

// Spawn research agents
const agents = await Promise.all([
  mcp__claude-flow__agent_spawn({ type: "researcher", name: "r1" }),
  mcp__claude-flow__agent_spawn({ type: "researcher", name: "r2" }),
  mcp__claude-flow__agent_spawn({ type: "code-analyzer", name: "a1" })
]);

// Store research task
await mcp__claude-flow__memory_store({
  key: "research/task",
  value: "Analyze microservices patterns",
  namespace: "coordination"
});

// Orchestrate research
const result = await mcp__claude-flow__task_orchestrate({
  task: "Comprehensive microservices research",
  strategy: "collaborative"
});
```

### Pattern 2: Learning Code Review Agent

```typescript
// Store successful pattern
await mcp__claude-flow__pattern_store({
  taskType: "code_review",
  approach: "Security → Types → Quality",
  successRate: 0.94
});

// Store review episode
await mcp__claude-flow__reflexion_store({
  sessionId: "review-1",
  task: "Review auth PR",
  reward: 0.9,
  success: true,
  critique: "Found SQL injection vulnerability"
});

// Next review: search similar patterns
const patterns = await mcp__claude-flow__pattern_search({
  task: "security code review",
  k: 5
});
```

---

## Next Steps

- **[API Reference](./API-REFERENCE.md)** — Controller documentation
- **[Getting Started](./GETTING-STARTED.md)** — Quick start guide
- **[Swarm Cookbook](./SWARM-COOKBOOK.md)** — Orchestration recipes

---

**Questions?** See [GitHub Issues](https://github.com/ruvnet/agentic-flow/issues).
