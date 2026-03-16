# Getting Started with Agentic Flow

> **Get running in 5 minutes** — from zero to your first intelligent AI agent

Agentic Flow is the first AI agent framework that gets **faster AND smarter** every time it runs. This guide walks you through installation, your first agent, and essential concepts.

---

## 📦 Installation (2 minutes)

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn**
- An **Anthropic API key** (or OpenRouter/Gemini for alternatives)

### Quick Install

```bash
# Global installation (recommended)
npm install -g agentic-flow

# Verify installation
npx agentic-flow --help

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Alternative: Direct Usage (No Installation)

```bash
# Run directly with npx (no installation needed)
npx agentic-flow --agent researcher --task "Your task here"
```

---

## 🚀 Your First Agent (1 minute)

### Example 1: Research Agent

```bash
npx agentic-flow \
  --agent researcher \
  --task "Analyze the top 3 trends in microservices architecture for 2025"
```

**What happens:**
- Agent researches microservices patterns
- Generates comprehensive analysis
- Returns structured findings

### Example 2: Code Generation

```bash
npx agentic-flow \
  --agent coder \
  --task "Build a REST API with Express.js and authentication"
```

**What happens:**
- Agent creates project structure
- Implements authentication middleware
- Generates comprehensive tests
- Documents API endpoints

### Example 3: Cost-Optimized Agent

```bash
# Use DeepSeek R1 for 85% cost savings
export OPENROUTER_API_KEY=sk-or-v1-your-key-here

npx agentic-flow \
  --agent coder \
  --task "Refactor this codebase for better performance" \
  --model "deepseek/deepseek-r1" \
  --optimize
```

---

## 🧠 AgentDB: First Memory Instance (3 minutes)

AgentDB is the intelligent memory system that makes agents learn and improve. Let's create your first database:

### Initialize AgentDB

```typescript
import { createDatabase, ReasoningBank, EmbeddingService } from 'agentdb';

// Initialize database
const db = await createDatabase('./agent-memory.db');

// Initialize embedding service (runs locally, no API key needed)
const embedder = new EmbeddingService({
  model: 'Xenova/all-MiniLM-L6-v2',
  dimension: 384
});
await embedder.initialize();

// Create reasoning bank for pattern learning
const reasoningBank = new ReasoningBank(db, embedder);

console.log('✅ AgentDB initialized successfully!');
```

### Store Your First Pattern

```typescript
// Store a successful approach
await reasoningBank.storePattern({
  taskType: 'api_development',
  approach: 'Use Express.js → JWT auth → OpenAPI docs → Jest tests',
  successRate: 0.95,
  tags: ['backend', 'rest-api', 'authentication'],
  metadata: { avgTimeMs: 15000, tokensUsed: 2500 }
});

console.log('✅ Pattern stored! Agent will remember this approach.');
```

### Search for Similar Patterns

```typescript
// Find similar successful patterns (32.6M ops/sec!)
const patterns = await reasoningBank.searchPatterns({
  task: 'build authenticated REST API',
  k: 5,
  threshold: 0.7
});

console.log(`Found ${patterns.length} relevant patterns:`);
patterns.forEach((p, i) => {
  console.log(`${i + 1}. ${p.approach} (success: ${p.successRate})`);
});
```

**Result:** Your agent now learns from past successes! 🎉

---

## 🎯 First MCP Tool Call (2 minutes)

MCP (Model Context Protocol) tools let Claude Code agents interact with Agentic Flow directly.

### Setup MCP Integration

```bash
# Add Agentic Flow MCP server to Claude Code
claude mcp add agentic-flow npx agentic-flow@alpha mcp start

# Verify MCP tools are available
claude mcp list
```

**Available MCP Tools:** 85+ tools for memory, agents, swarms, GitHub, neural learning, and more.

### Use MCP Tools in Claude Code

Now in Claude Code, you can:

```
User: "Store this successful debugging pattern in memory"
Claude: [Uses mcp__claude-flow__memory_store automatically]

User: "Find similar code review patterns"
Claude: [Uses mcp__claude-flow__memory_search automatically]

User: "Initialize a hierarchical swarm for this feature"
Claude: [Uses mcp__claude-flow__swarm_init automatically]
```

---

## 🌊 First Swarm Orchestration (3 minutes)

Swarms coordinate multiple agents working together in parallel.

### Example: Full-Stack Development Swarm

```typescript
import { SwarmOrchestrator } from 'agentic-flow';

// Initialize swarm
const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',  // Tree structure with coordinator
  maxAgents: 6,
  memory: 'hybrid'           // Shared + local memory
});

// Initialize coordination
await swarm.init();

// Spawn agents with roles
const agents = await swarm.spawnAgents([
  { type: 'backend-dev', name: 'backend-agent' },
  { type: 'coder', name: 'frontend-agent' },
  { type: 'tester', name: 'test-agent' },
  { type: 'reviewer', name: 'review-agent' }
]);

// Orchestrate task
const result = await swarm.orchestrate({
  task: 'Build a todo app with React frontend and Express backend',
  strategy: 'parallel',
  priority: 'high'
});

console.log(`✅ Swarm completed task in ${result.durationMs}ms`);
console.log(`Agents: ${result.agentsUsed}, Tasks: ${result.tasksCompleted}`);
```

### CLI Alternative

```bash
# Initialize swarm
npx agentic-flow swarm init \
  --topology hierarchical \
  --max-agents 6 \
  --strategy specialized

# Spawn agents
npx agentic-flow agent spawn \
  --type backend-dev \
  --name backend-agent

npx agentic-flow agent spawn \
  --type coder \
  --name frontend-agent

# Orchestrate task
npx agentic-flow task orchestrate \
  --task "Build todo app" \
  --strategy parallel \
  --priority high
```

---

## 📚 Core Concepts

### 1. Agents

**What:** Specialized AI workers with specific capabilities

**Types:**
- `coder` — Implementation specialist
- `researcher` — Deep research and analysis
- `tester` — Comprehensive testing (90%+ coverage)
- `reviewer` — Code review and quality assurance
- `planner` — Strategic planning and task decomposition

**Usage:**
```bash
npx agentic-flow --agent <type> --task "<task description>"
```

### 2. AgentDB (Memory System)

**What:** Intelligent vector database that learns from agent experiences

**Key Features:**
- **ReasoningBank** — Learn successful patterns (388K ops/sec storage)
- **Reflexion Memory** — Store episodes with self-critique
- **Skill Library** — Reusable, composable skills
- **Causal Memory** — Understand cause-effect relationships

**Performance:**
- Pattern search: **32.6M ops/sec** (ultra-fast)
- 150x faster than SQLite
- Zero API costs (runs locally)

### 3. Swarms

**What:** Multiple agents working together in coordination

**Topologies:**
- **Hierarchical** — Tree structure with coordinator (best for coding)
- **Mesh** — Peer-to-peer (best for research)
- **Adaptive** — Switches topology based on task

**Benefits:**
- 2.8-4.4x faster execution
- 32% token reduction
- Parallel task processing
- Automatic load balancing

### 4. MCP Tools

**What:** Protocol for AI assistants to interact with external tools

**Categories:**
- Memory (11 tools) — Store/retrieve patterns
- Agents (12 tools) — Spawn/manage agents
- Swarms (8 tools) — Orchestrate coordination
- GitHub (8 tools) — Repository management
- Neural (18 tools) — Learning and training

---

## 🎓 Next Steps

### Beginner Path

1. ✅ Complete this Getting Started guide
2. 📖 Read [Advanced Usage Patterns](./ADVANCED-USAGE.md)
3. 🧪 Try the [Swarm Cookbook](./SWARM-COOKBOOK.md) examples
4. 🎯 Build your first multi-agent project

### Intermediate Path

1. 📊 Explore [Performance Tuning](./PERFORMANCE-TUNING.md)
2. 🔧 Learn [Controller API Reference](./API-REFERENCE.md)
3. 🌐 Deploy to production with Docker
4. 🧠 Implement custom memory patterns

### Advanced Path

1. 🏗️ Study [Architecture Diagrams](./architecture/)
2. 🔌 Build custom MCP tools
3. 🎛️ Create specialized agent types
4. 🚀 Contribute to the framework

---

## 💡 Common Patterns

### Pattern 1: Learning Code Review Agent

```typescript
import { createDatabase, ReasoningBank, ReflexionMemory, EmbeddingService } from 'agentdb';

const db = await createDatabase('./reviewer-memory.db');
const embedder = new EmbeddingService({ model: 'Xenova/all-MiniLM-L6-v2' });
await embedder.initialize();

const reasoning = new ReasoningBank(db, embedder);
const reflexion = new ReflexionMemory(db, embedder);

// Store successful review pattern
await reasoning.storePattern({
  taskType: 'code_review',
  approach: 'Security → Type safety → Code quality → Performance',
  successRate: 0.94
});

// Store review episode
await reflexion.storeEpisode({
  sessionId: 'review-1',
  task: 'Review authentication PR',
  reward: 0.9,
  success: true,
  critique: 'Found SQL injection vulnerability - security checks work!',
  input: codeToReview,
  output: findings
});

// Next time: retrieve similar reviews
const similar = await reflexion.retrieveRelevant({
  task: 'authentication code review',
  k: 5,
  onlySuccesses: true
});
```

### Pattern 2: Cost-Optimized Multi-Agent

```bash
# Use DeepSeek R1 (85% cheaper than Claude)
export OPENROUTER_API_KEY=sk-or-v1-...

npx agentic-flow \
  --agent coder \
  --task "Build payment processing system" \
  --model "deepseek/deepseek-r1" \
  --optimize \
  --priority cost
```

### Pattern 3: Hierarchical Coding Swarm

```typescript
const swarm = new SwarmOrchestrator({
  topology: 'hierarchical',
  maxAgents: 8,
  memory: 'hybrid'
});

await swarm.init();

// Coordinator manages specialists
await swarm.orchestrate({
  task: 'Implement e-commerce checkout flow',
  strategy: 'specialized',
  agents: [
    'backend-dev',   // Payment API
    'coder',         // Frontend UI
    'security-architect', // Security review
    'tester'         // Testing
  ]
});
```

---

## 🆘 Troubleshooting

### Issue: "API key not found"

**Solution:**
```bash
# Set API key permanently
echo 'export ANTHROPIC_API_KEY=sk-ant-your-key' >> ~/.bashrc
source ~/.bashrc

# Or use .env file
echo 'ANTHROPIC_API_KEY=sk-ant-your-key' > .env
```

### Issue: "AgentDB initialization failed"

**Solution:**
```typescript
// Ensure embedding service is initialized
const embedder = new EmbeddingService({
  model: 'Xenova/all-MiniLM-L6-v2'
});
await embedder.initialize(); // Don't forget this!

const db = await createDatabase('./memory.db');
```

### Issue: "MCP tools not available in Claude Code"

**Solution:**
```bash
# Verify MCP server is added
claude mcp list

# If not present, add it
claude mcp add agentic-flow npx agentic-flow@alpha mcp start

# Restart Claude Code
```

### Issue: "Swarm agents not coordinating"

**Solution:**
```bash
# Initialize swarm before spawning agents
npx agentic-flow swarm init --topology hierarchical

# Ensure memory is shared
npx agentic-flow memory store \
  --key "swarm/coordination" \
  --value "topology=hierarchical" \
  --namespace "swarm"
```

---

## 📖 Documentation Index

- **[Advanced Usage](./ADVANCED-USAGE.md)** — Multi-agent patterns, hooks, custom agents
- **[API Reference](./API-REFERENCE.md)** — Complete controller documentation
- **[MCP Tools](./MCP-TOOLS-REFERENCE.md)** — All 85+ tools documented
- **[Swarm Cookbook](./SWARM-COOKBOOK.md)** — Orchestration recipes
- **[Performance Tuning](./PERFORMANCE-TUNING.md)** — Optimization guide
- **[Troubleshooting](./TROUBLESHOOTING.md)** — Common issues and solutions
- **[Architecture](./architecture/)** — System diagrams

---

## 🎉 You're Ready!

You now have:
- ✅ Agentic Flow installed
- ✅ Your first agent running
- ✅ AgentDB memory initialized
- ✅ MCP tools configured
- ✅ Understanding of core concepts

**Next:** Dive into [Advanced Usage Patterns](./ADVANCED-USAGE.md) to build production systems.

---

**Questions?** See [Troubleshooting](./TROUBLESHOOTING.md) or open an issue on [GitHub](https://github.com/ruvnet/agentic-flow/issues).
