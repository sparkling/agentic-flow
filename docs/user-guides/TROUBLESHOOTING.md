# Troubleshooting Guide

> **Common issues and solutions** — Quick fixes for 90% of problems

---

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Configuration Problems](#configuration-problems)
3. [Runtime Errors](#runtime-errors)
4. [Performance Issues](#performance-issues)
5. [Integration Problems](#integration-problems)
6. [Error Reference](#error-reference)

---

## Installation Issues

### Issue: `npm install` fails with native module errors

**Symptoms:**
```
error: failed to build ruvector-native
gyp ERR! build error
```

**Solutions:**

1. **Install build tools:**
```bash
# macOS
xcode-select --install

# Ubuntu/Debian
sudo apt-get install build-essential python3

# Windows
npm install --global windows-build-tools
```

2. **Use fallback backend:**
```typescript
// Skip native modules
const db = await createDatabase('./memory.db', {
  backend: 'sqlite'  // Works without native compilation
});
```

3. **Use pre-built binaries:**
```bash
npm install agentdb --no-optional
```

---

### Issue: "Module not found" errors

**Symptoms:**
```
Error: Cannot find module 'agentdb'
```

**Solutions:**

1. **Verify installation:**
```bash
npm list agentdb
npm list agentic-flow
```

2. **Reinstall packages:**
```bash
rm -rf node_modules package-lock.json
npm install
```

3. **Check import paths:**
```typescript
// ✅ Correct
import { createDatabase } from 'agentdb';

// ❌ Wrong
import { createDatabase } from 'agentdb/src/core/AgentDB';
```

---

### Issue: TypeScript type errors

**Symptoms:**
```
TS2307: Cannot find module 'agentdb' or its corresponding type declarations
```

**Solutions:**

1. **Install types:**
```bash
npm install --save-dev @types/node
```

2. **Update tsconfig.json:**
```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

3. **Use explicit types:**
```typescript
import type { AgentDB, ReasoningBank } from 'agentdb';
```

---

## Configuration Problems

### Issue: API key not recognized

**Symptoms:**
```
Error: ANTHROPIC_API_KEY not found
```

**Solutions:**

1. **Set environment variable:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

2. **Use .env file:**
```bash
echo 'ANTHROPIC_API_KEY=sk-ant-your-key' > .env
npm install dotenv
```

```typescript
import 'dotenv/config';
// API key now available
```

3. **Verify key is loaded:**
```typescript
if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('API key not set!');
}
```

---

### Issue: MCP tools not available in Claude Code

**Symptoms:**
Claude Code doesn't show MCP tools or says "No MCP servers available"

**Solutions:**

1. **Verify MCP server is added:**
```bash
claude mcp list
```

2. **Add MCP server if missing:**
```bash
claude mcp add agentic-flow npx agentic-flow@alpha mcp start
```

3. **Check configuration file:**
```bash
cat ~/.config/claude/claude_desktop_config.json
```

Should contain:
```json
{
  "mcpServers": {
    "agentic-flow": {
      "command": "npx",
      "args": ["agentic-flow@alpha", "mcp", "start"]
    }
  }
}
```

4. **Restart Claude Code:**
```bash
# Force restart
killall "Claude Code"
open -a "Claude Code"
```

---

### Issue: Database initialization fails

**Symptoms:**
```
Error: Failed to initialize database
SQLITE_CANTOPEN: unable to open database file
```

**Solutions:**

1. **Check file permissions:**
```bash
ls -la ./agent-memory.db
chmod 644 ./agent-memory.db
```

2. **Create directory if missing:**
```bash
mkdir -p ./data
const db = await createDatabase('./data/memory.db');
```

3. **Use absolute path:**
```typescript
import path from 'path';

const dbPath = path.resolve(__dirname, 'memory.db');
const db = await createDatabase(dbPath);
```

---

## Runtime Errors

### Issue: "Vector dimension mismatch"

**Symptoms:**
```
Error: Expected dimension 384, got 768
```

**Solutions:**

1. **Match embedding dimensions:**
```typescript
// Ensure embedder and db use same dimension
const embedder = new EmbeddingService({
  model: 'Xenova/all-MiniLM-L6-v2',
  dimension: 384  // Must match db
});

const db = await createDatabase('./memory.db', {
  dimension: 384  // Must match embedder
});
```

2. **Check model dimensions:**
```
all-MiniLM-L6-v2: 384 dimensions
bge-small-en-v1.5: 384 dimensions
bge-base-en-v1.5: 768 dimensions
all-mpnet-base-v2: 768 dimensions
```

3. **Migrate existing database:**
```typescript
// Recreate with correct dimension
const oldDb = await createDatabase('./old.db', { dimension: 384 });
const newDb = await createDatabase('./new.db', { dimension: 768 });

// Migrate data
await migrateDatabase(oldDb, newDb);
```

---

### Issue: "Embedding service not initialized"

**Symptoms:**
```
Error: EmbeddingService.embed() called before initialize()
```

**Solutions:**

1. **Always call initialize():**
```typescript
const embedder = new EmbeddingService({
  model: 'Xenova/all-MiniLM-L6-v2'
});

await embedder.initialize();  // Don't forget this!

// Now safe to use
const embedding = await embedder.embed('text');
```

2. **Check initialization status:**
```typescript
if (!embedder.isInitialized()) {
  await embedder.initialize();
}
```

---

### Issue: Swarm agents not coordinating

**Symptoms:**
- Agents work independently
- No shared context
- Duplicate work

**Solutions:**

1. **Initialize swarm before spawning agents:**
```typescript
const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 8,
  memory: 'hybrid'
});

await swarm.init();  // Must call before spawning

// Now spawn agents
const agents = await swarm.spawnAgents([...]);
```

2. **Verify memory mode:**
```typescript
const status = await swarm.getStatus();
console.log(`Memory: ${status.memory}`);  // Should be 'hybrid' or 'shared'

if (status.memory === 'local') {
  // Agents won't share context
  await swarm.reconfigure({ memory: 'hybrid' });
}
```

3. **Check agent connectivity:**
```typescript
const agents = await swarm.getAgents();
for (const agent of agents) {
  console.log(`${agent.name}: ${agent.status} (last seen: ${agent.lastSeen}ms ago)`);

  if (agent.lastSeen > 30000) {
    console.warn(`⚠️ ${agent.name} appears disconnected`);
  }
}
```

---

### Issue: "Task stuck" or "Agent not responding"

**Symptoms:**
Tasks remain in "pending" or "running" state indefinitely

**Solutions:**

1. **Check task status:**
```typescript
const status = await swarm.getTaskStatus(taskId);
console.log(`Status: ${status.status}`);
console.log(`Agent: ${status.assignedAgent}`);
console.log(`Duration: ${Date.now() - status.startTime}ms`);
console.log(`Dependencies: ${status.blockedBy.join(', ')}`);
```

2. **Identify blocker:**
```typescript
if (status.blockedBy.length > 0) {
  console.log('Task is blocked by:', status.blockedBy);

  // Check blocker status
  for (const blockerId of status.blockedBy) {
    const blockerStatus = await swarm.getTaskStatus(blockerId);
    console.log(`${blockerId}: ${blockerStatus.status}`);
  }
}
```

3. **Force reassignment:**
```typescript
if (status.status === 'stuck') {
  await swarm.reassignTask(taskId, {
    agent: 'backup-agent',
    priority: 'high'
  });
}
```

4. **Set timeouts:**
```typescript
await swarm.orchestrate({
  task: 'Long-running task',
  timeout: 600000,  // 10 minutes
  retries: 3,
  retryDelay: 5000
});
```

---

### Issue: Memory leak or high memory usage

**Symptoms:**
- Memory usage grows over time
- Process killed with "out of memory"
- Performance degradation

**Solutions:**

1. **Enable automatic pruning:**
```typescript
import { BatchOperations } from 'agentdb/optimizations';

const batchOps = new BatchOperations(db, embedder, {
  autoPrune: true,
  pruneConfig: {
    maxAge: 90,
    minReward: 0.3,
    maxRecords: 100000
  }
});
```

2. **Manual cleanup:**
```typescript
// Prune old data
const pruned = await batchOps.pruneData({
  maxAge: 60,
  minReward: 0.5,
  maxRecords: 50000
});

// Clear caches
caches.clearAll();

// Force garbage collection (Node.js)
if (global.gc) {
  global.gc();
}
```

3. **Monitor memory:**
```typescript
setInterval(() => {
  const usage = process.memoryUsage();
  console.log(`Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB`);

  if (usage.heapUsed > 1024 * 1024 * 1000) {  // 1GB
    console.warn('⚠️ High memory usage detected');
    // Trigger cleanup
  }
}, 60000);  // Check every minute
```

---

## Performance Issues

### Issue: Slow vector search

**Symptoms:**
Search takes >1 second per query

**Solutions:**

1. **Use faster backend:**
```typescript
// ❌ Slow
const db = await createDatabase('./memory.db', {
  backend: 'sqlite'
});

// ✅ Fast
const db = await createDatabase('./memory.db', {
  backend: 'ruvector'
});
```

2. **Optimize HNSW parameters:**
```typescript
const db = await createDatabase('./memory.db', {
  backend: 'ruvector',
  config: {
    M: 32,              // More connections = better recall, slower build
    efConstruction: 200, // Higher = better quality, slower build
    efSearch: 50        // Higher = better recall, slower search
  }
});
```

3. **Enable caching:**
```typescript
import { MCPToolCaches } from 'agentdb/optimizations';

const caches = new MCPToolCaches();
// Automatically caches frequent queries
```

4. **Use batch operations:**
```typescript
// ❌ Slow: One at a time
for (const query of queries) {
  await db.search(query);
}

// ✅ Fast: Batch search
const results = await db.searchBatch(queries);
```

---

### Issue: High API costs

**Symptoms:**
API bills higher than expected

**Solutions:**

1. **Use model router with cost optimization:**
```typescript
import { ModelRouter } from 'agentic-flow/router';

const router = new ModelRouter({
  costOptimization: {
    enabled: true,
    priority: 'cost',
    budget: { daily: 10, perTask: 0.10 }
  }
});
```

2. **Track costs:**
```typescript
let totalCost = 0;

router.on('completion', (event) => {
  totalCost += event.cost;
  console.log(`Cost: $${event.cost.toFixed(4)} (total: $${totalCost.toFixed(2)})`);

  if (totalCost > 10) {
    console.warn('⚠️ Daily budget exceeded!');
  }
});
```

3. **Use cheaper models:**
```typescript
// ❌ Expensive: Claude Sonnet ($3/$15 per 1M tokens)
const result = await router.chat({
  model: 'claude-sonnet-4-5',
  messages: [...]
});

// ✅ Cheap: DeepSeek R1 ($0.55/$2.19 per 1M tokens)
const result = await router.chat({
  model: 'deepseek/deepseek-r1',
  messages: [...]
});
// 85% cost savings
```

4. **Optimize prompts:**
```typescript
// ❌ Verbose (high token cost)
const task = `Please analyze the code very carefully and provide a detailed comprehensive review...`;

// ✅ Concise (low token cost)
const task = `Code review: security, performance, best practices`;
```

---

### Issue: Slow agent startup

**Symptoms:**
Agent takes >10 seconds to spawn

**Solutions:**

1. **Pre-initialize embeddings:**
```typescript
// Initialize once at startup
const embedder = new EmbeddingService({
  model: 'Xenova/all-MiniLM-L6-v2'
});
await embedder.initialize();  // Takes 2-5s

// Reuse for all agents
const agent1 = new Agent({ embedder });
const agent2 = new Agent({ embedder });
// No additional initialization time
```

2. **Use agent pools:**
```typescript
// Pre-spawn agents
const pool = new AgentPool({
  types: ['coder', 'tester', 'reviewer'],
  poolSize: 3
});

await pool.initialize();  // Warm up pool

// Get agent instantly
const agent = await pool.getAgent('coder');
// <1ms
```

3. **Lazy load models:**
```typescript
const embedder = new EmbeddingService({
  model: 'Xenova/all-MiniLM-L6-v2',
  lazyLoad: true  // Load on first use
});

// First call: 2-5s (loads model)
await embedder.embed('text');

// Subsequent calls: <1ms
await embedder.embed('more text');
```

---

## Integration Problems

### Issue: Docker container fails to start

**Symptoms:**
```
Error: Cannot start container agentic-flow
```

**Solutions:**

1. **Check environment variables:**
```bash
docker run -e ANTHROPIC_API_KEY=sk-ant-... agentic-flow
```

2. **Use docker-compose:**
```yaml
version: '3.8'
services:
  agentic-flow:
    image: agentic-flow:latest
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./data:/app/data
```

3. **Check logs:**
```bash
docker logs agentic-flow
```

---

### Issue: Kubernetes pod crashes

**Symptoms:**
```
CrashLoopBackOff
```

**Solutions:**

1. **Check pod logs:**
```bash
kubectl logs -f pod/agentic-flow-xxx
```

2. **Verify secrets:**
```bash
kubectl get secret api-keys -o yaml
```

3. **Check resource limits:**
```yaml
resources:
  requests:
    memory: "2Gi"  # Increase if OOMKilled
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

---

### Issue: GitHub Actions workflow fails

**Symptoms:**
CI/CD pipeline fails at agent execution step

**Solutions:**

1. **Set secrets in repository:**
```
Settings → Secrets → New repository secret
Name: ANTHROPIC_API_KEY
Value: sk-ant-...
```

2. **Use secrets in workflow:**
```yaml
- name: Run agent
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: npx agentic-flow --agent coder --task "..."
```

3. **Add timeout:**
```yaml
- name: Run agent
  timeout-minutes: 10
  run: npx agentic-flow --agent coder --task "..."
```

---

## Error Reference

### Common Error Codes

| Code | Error | Cause | Solution |
|------|-------|-------|----------|
| `EAPI001` | API key not found | Missing ANTHROPIC_API_KEY | Set environment variable |
| `EAPI002` | API key invalid | Wrong or expired key | Check key format |
| `EAPI003` | Rate limit exceeded | Too many requests | Wait or upgrade plan |
| `EDB001` | Database not initialized | Missing await init() | Call await db.initialize() |
| `EDB002` | Vector dimension mismatch | Embedder ≠ database dimension | Match dimensions |
| `EDB003` | Database locked | Concurrent writes | Use transactions |
| `EEMBED001` | Embedder not initialized | Missing await initialize() | Call await embedder.initialize() |
| `EEMBED002` | Model not found | Wrong model name | Check model list |
| `ESWARM001` | Swarm not initialized | Missing await init() | Call await swarm.init() |
| `ESWARM002` | Agent not found | Wrong agent ID | Check agent list |
| `ESWARM003` | Task timeout | Task took too long | Increase timeout |

### Error Handling Pattern

```typescript
try {
  const result = await agent.execute(task);
} catch (error) {
  if (error.code === 'EAPI003') {
    // Rate limit: wait and retry
    await sleep(60000);
    return await agent.execute(task);
  } else if (error.code === 'ESWARM003') {
    // Timeout: break into smaller tasks
    return await agent.executeBatch(splitTask(task));
  } else if (error.code.startsWith('EDB')) {
    // Database error: reinitialize
    await db.initialize();
    return await agent.execute(task);
  } else {
    // Unknown error: log and rethrow
    console.error('Unexpected error:', error);
    throw error;
  }
}
```

---

## Getting Help

### Before Opening an Issue

1. Check this troubleshooting guide
2. Search [existing issues](https://github.com/ruvnet/agentic-flow/issues)
3. Enable debug logging:
```typescript
process.env.DEBUG = 'agentic-flow:*';
```

### Information to Include

1. **Environment:**
   - OS: macOS 14.3, Ubuntu 22.04, Windows 11, etc.
   - Node.js version: `node --version`
   - Package version: `npm list agentic-flow agentdb`

2. **Error message:**
   - Full error stack trace
   - Error code if available

3. **Reproduction:**
   - Minimal code example
   - Steps to reproduce

4. **Logs:**
   - Debug logs
   - Console output

### Community Support

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and discussions
- **Documentation**: Check all docs in `/docs` folder

---

## Next Steps

- **[Getting Started](./GETTING-STARTED.md)** — Quick start guide
- **[Advanced Usage](./ADVANCED-USAGE.md)** — Advanced patterns
- **[Performance Tuning](./PERFORMANCE-TUNING.md)** — Optimization guide

---

**Still stuck?** Open an issue on [GitHub](https://github.com/ruvnet/agentic-flow/issues) with:
1. Environment details
2. Full error message
3. Code to reproduce
4. Debug logs
