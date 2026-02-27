# Agentic-Flow Quick Reference

**Version**: 1.10.3 | **Updated**: 2026-02-25 | **[Full Capability Matrix](./CAPABILITY-MATRIX.md)**

## 🚀 Quick Start

```bash
# Install
npm install agentic-flow@alpha

# Add MCP server
claude mcp add claude-flow -- npx claude-flow@alpha mcp start

# Initialize
npx agentic-flow init --wizard

# Fix any issues
npx agentic-flow doctor --fix
```

## ⚡ Most Used Commands

### Memory Operations
```bash
# Store memory
npx agentic-flow memory store --key "api-pattern" --value "REST with JWT" --namespace "patterns"

# Search memories
npx agentic-flow memory search --query "authentication" --limit 10

# Synthesize context
npx agentic-flow memory synthesize --query "API design patterns" --limit 20
```

### Swarm Orchestration
```bash
# Initialize hierarchical swarm (best for complex tasks)
npx agentic-flow swarm init --topology hierarchical --max-agents 8 --strategy specialized

# Initialize mesh swarm (best for collaboration)
npx agentic-flow swarm init --topology mesh --max-agents 6 --strategy balanced

# Check swarm status
npx agentic-flow swarm status
```

### Agent Execution
```bash
# List all agents
npx agentic-flow agent list

# Execute agent
npx agentic-flow --agent coder --task "Create REST API with Express"

# Create custom agent
npx agentic-flow agent create
```

### Autopilot (Persistent Completion)
```bash
# Enable autopilot (keeps swarms running until all tasks done)
npx agentic-flow autopilot enable

# Configure limits
npx agentic-flow autopilot config --max-iterations 100 --timeout 120

# Check status
npx agentic-flow autopilot status

# View learning patterns
npx agentic-flow autopilot learn --json
```

### Session Management
```bash
# Save current session
npx agentic-flow session save my-session --metadata '{"project":"api-v2"}'

# Restore session
npx agentic-flow session restore my-session

# List sessions
npx agentic-flow session list --limit 10
```

## 🎯 Common Use Cases

### Full-Stack Development
```bash
# 1. Initialize hierarchical swarm
npx agentic-flow swarm init --topology hierarchical --max-agents 8

# 2. Use Claude Code Task tool to spawn agents concurrently:
# Task("Backend Developer", "Build REST API...", "backend-dev")
# Task("Frontend Developer", "Create React UI...", "coder")
# Task("Database Architect", "Design schema...", "code-analyzer")
# Task("Test Engineer", "Write tests...", "tester")
# Task("DevOps Engineer", "Setup CI/CD...", "cicd-engineer")

# 3. Enable autopilot for completion
npx agentic-flow autopilot enable
```

### Code Review Swarm
```bash
# 1. Initialize mesh swarm (peer review)
npx agentic-flow swarm init --topology mesh --max-agents 5

# 2. Spawn reviewers via Claude Code Task tool:
# Task("Security Reviewer", "Check for vulnerabilities...", "reviewer")
# Task("Performance Reviewer", "Check for bottlenecks...", "perf-analyzer")
# Task("Style Reviewer", "Check code style...", "code-analyzer")
# Task("Test Reviewer", "Check test coverage...", "tester")
```

### SPARC TDD Workflow
```bash
# Run complete SPARC TDD pipeline
npx agentic-flow sparc tdd "Create user authentication system"

# Or step-by-step:
npx agentic-flow sparc run spec-pseudocode "User auth"
npx agentic-flow sparc run architect "User auth"
npx agentic-flow sparc run coder "Implement auth"
npx agentic-flow sparc run tester "Test auth"
```

### GitHub Automation
```bash
# Analyze repository
npx agentic-flow --agent github-modes --task "Analyze repo structure"

# Create and manage PR
npx agentic-flow --agent pr-manager --task "Create PR for feature-x"

# Automate releases
npx agentic-flow --agent release-manager --task "Prepare v2.0.0 release"
```

### Learning from Experience
```bash
# Record successful episode
# (via MCP tool: memory_episode_store)

# Recall similar episodes
npx agentic-flow --agent researcher --task "Find similar authentication patterns"

# Discover patterns
npx agentic-flow autopilot learn --json

# Search history
npx agentic-flow autopilot history --query "API design" --limit 10
```

## 🧠 MCP Tool Cheat Sheet

### Most Used MCP Tools

#### Memory
```typescript
// Store memory
mcp__claude-flow__memory_store({
  key: "pattern-auth",
  value: "JWT with refresh tokens",
  namespace: "patterns",
  ttl: 86400 // 24 hours
})

// Synthesize context
mcp__claude-flow__memory_synthesize({
  query: "authentication patterns",
  limit: 10,
  includeRecommendations: true
})
```

#### AgentDB
```typescript
// Store episode
mcp__claude-flow__memory_episode_store({
  sessionId: "session-123",
  task: "Implement JWT auth",
  input: "User requirements...",
  output: "Implementation code...",
  critique: "Could improve error handling",
  reward: 0.8,
  success: true,
  tags: ["authentication", "jwt", "security"]
})

// Recall episodes
mcp__claude-flow__memory_episode_recall({
  query: "JWT authentication",
  limit: 5
})

// Route task semantically
mcp__claude-flow__route_semantic({
  taskDescription: "Simple variable renaming"
})
// Returns: { tier: 1, handler: "WASM", latency: "<1ms" }
```

#### GitHub
```typescript
// Analyze repo
mcp__claude-flow__github_repo_analyze({
  owner: "ruvnet",
  repo: "agentic-flow"
})

// Manage PR
mcp__claude-flow__github_pr_manage({
  owner: "ruvnet",
  repo: "agentic-flow",
  action: "create",
  options: {
    title: "Add new feature",
    body: "Feature description",
    base: "main",
    head: "feature-x"
  }
})
```

#### Swarm
```typescript
// Initialize swarm
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized"
})

// Spawn agent
mcp__claude-flow__agent_spawn({
  type: "coder",
  capabilities: ["python", "testing"],
  name: "python-coder-1"
})

// Orchestrate task
mcp__claude-flow__task_orchestrate({
  task: "Build REST API",
  strategy: "adaptive",
  priority: "high",
  maxAgents: 5
})
```

#### Autopilot
```typescript
// Get status
mcp__claude-flow__autopilot_status({})

// Learn patterns
mcp__claude-flow__autopilot_learn({
  sessionId: "session-123"
})

// Predict action
mcp__claude-flow__autopilot_predict({
  currentState: {
    total: 10,
    completed: 7,
    pending: 2,
    blocked: 1,
    iterations: 5
  }
})
```

## 📊 Agent Selection Guide

### When to Use Which Agent

| Task Type | Recommended Agent | Alternative |
|-----------|------------------|-------------|
| **API Development** | `backend-dev` | `coder` |
| **React/Vue UI** | `coder` | `mobile-dev` |
| **Database Design** | `code-analyzer` | `system-architect` |
| **Testing** | `tester` | `tdd-london-swarm` |
| **Code Review** | `reviewer` | `code-review-swarm` |
| **CI/CD Setup** | `cicd-engineer` | `task-orchestrator` |
| **Documentation** | `api-docs` | `coder` |
| **Architecture** | `system-architect` | `architecture` (SPARC) |
| **Research** | `researcher` | `planner` |
| **ML/AI** | `ml-developer` | `smart-agent` |
| **Performance** | `perf-analyzer` | `performance-benchmarker` |
| **Security** | `security-manager` | `reviewer` |
| **GitHub** | `pr-manager` | `github-modes` |
| **Multi-repo** | `multi-repo-swarm` | `repo-architect` |
| **Migration** | `migration-planner` | `planner` |

### Agent Capabilities Matrix

| Agent | Code | Test | Review | Design | Deploy | Learn |
|-------|------|------|--------|--------|--------|-------|
| `coder` | ✅✅✅ | ✅✅ | ✅ | ✅ | ❌ | ✅ |
| `backend-dev` | ✅✅✅ | ✅ | ✅ | ✅✅ | ✅ | ✅ |
| `tester` | ✅ | ✅✅✅ | ✅✅ | ❌ | ❌ | ✅ |
| `reviewer` | ✅ | ✅ | ✅✅✅ | ✅ | ❌ | ✅✅ |
| `system-architect` | ✅ | ❌ | ✅✅ | ✅✅✅ | ❌ | ✅ |
| `cicd-engineer` | ✅ | ✅ | ✅ | ✅✅ | ✅✅✅ | ✅ |
| `ml-developer` | ✅✅✅ | ✅ | ✅ | ✅✅ | ✅ | ✅✅✅ |

Legend: ✅ = Basic, ✅✅ = Good, ✅✅✅ = Expert

## 🔧 Configuration Patterns

### Hierarchical Swarm (Complex Tasks)
```bash
# Best for: Feature development, SPARC workflows, CI/CD
npx agentic-flow swarm init --topology hierarchical --max-agents 8 --strategy specialized

# Coordinator agent routes tasks to specialized workers
# Workers execute independently, report back to coordinator
# Good for: 5-50 agents, clear task hierarchy
```

### Mesh Swarm (Collaboration)
```bash
# Best for: Code review, consensus, distributed decisions
npx agentic-flow swarm init --topology mesh --max-agents 6 --strategy balanced

# All agents communicate peer-to-peer
# High resilience, no single point of failure
# Good for: 3-10 agents, collaborative tasks
```

### Ring Swarm (Sequential)
```bash
# Best for: Pipelines, sequential processing
npx agentic-flow swarm init --topology ring --max-agents 8 --strategy balanced

# Agents pass tasks in circular order
# Predictable flow, moderate resilience
# Good for: 3-15 agents, ordered processing
```

### Star Swarm (Centralized)
```bash
# Best for: Load balancing, fan-out/fan-in
npx agentic-flow swarm init --topology star --max-agents 12 --strategy balanced

# Central hub coordinates all agents
# Low communication overhead
# Good for: 2-20 agents, centralized control
```

## 🎨 Hook Automation Patterns

### Auto-format After Edit
```json
{
  "hooks": {
    "post-edit": [
      {
        "name": "auto-format",
        "command": "npx prettier --write {{file}}",
        "enabled": true
      }
    ]
  }
}
```

### Neural Learning After Task
```json
{
  "hooks": {
    "post-task": [
      {
        "name": "learn-patterns",
        "command": "npx agentic-flow hooks intelligence_learn --task-id {{taskId}}",
        "enabled": true
      }
    ]
  }
}
```

### Smart Routing Before Task
```json
{
  "hooks": {
    "pre-task": [
      {
        "name": "route-task",
        "command": "npx agentic-flow hooks model-route --task '{{task}}'",
        "enabled": true
      }
    ]
  }
}
```

## 📈 Performance Optimization

### Token Usage Optimization
```bash
# 1. Enable Agent Booster (WASM pre-processing)
export AGENTIC_FLOW_AGENT_BOOSTER=true

# 2. Use semantic routing (ADR-026)
# Simple tasks → Tier 1 (WASM, <1ms, $0)
# Medium tasks → Tier 2 (Haiku, ~500ms, $0.0002)
# Complex tasks → Tier 3 (Sonnet, 2-5s, $0.003)

# 3. Enable neural compression
npx agentic-flow hooks intelligence_learn --enable-compression
```

### Memory Optimization
```bash
# 1. Use batch operations
# Store multiple memories in one call

# 2. Set TTL for temporary data
npx agentic-flow memory store --key temp-data --value "..." --ttl 3600

# 3. Clear unused caches
npx agentic-flow performance cache-clear --cache-type embedding
```

### Swarm Optimization
```bash
# 1. Use appropriate topology
# Hierarchical: Low communication overhead
# Mesh: High resilience, high overhead
# Ring: Moderate both
# Star: Lowest overhead

# 2. Limit max agents (6-8 for tight coordination)
npx agentic-flow swarm init --max-agents 8

# 3. Use specialized strategy
npx agentic-flow swarm init --strategy specialized
```

## 🔍 Debugging & Troubleshooting

### Check System Health
```bash
# Run doctor
npx agentic-flow doctor --fix

# Check swarm status
npx agentic-flow swarm status

# View autopilot log
npx agentic-flow autopilot log --last 50

# Get session info
npx agentic-flow session info <session-id>
```

### Performance Profiling
```bash
# Profile operation
npx agentic-flow performance profile --operation "swarm-init" --duration 60

# Find bottlenecks
npx agentic-flow performance bottleneck --threshold 0.8

# Generate report
npx agentic-flow performance report --format json > perf-report.json
```

### Memory Issues
```bash
# Check memory usage
npx agentic-flow performance memory-profile --detailed

# Clear caches
npx agentic-flow performance cache-clear

# Optimize settings
npx agentic-flow performance optimize --target memory
```

## 🚨 Common Pitfalls

### ❌ Don't Do This
```bash
# DON'T use multiple messages for related operations
Message 1: npx agentic-flow swarm init
Message 2: npx agentic-flow agent spawn
Message 3: Write file

# DON'T use MCP tools alone for execution
mcp__claude-flow__agent_spawn(...)  # This only registers the agent
# Agent won't actually run until you use Claude Code's Task tool

# DON'T save files to root
Write "/workspaces/agentic-flow/file.js"  # ❌ Wrong
```

### ✅ Do This Instead
```bash
# DO batch ALL operations in ONE message
[Single Message]:
  Bash "npx agentic-flow swarm init --topology hierarchical"
  Task("Coder", "Implement feature...", "coder")
  Task("Tester", "Write tests...", "tester")
  Write "/workspaces/agentic-flow/src/feature.ts"
  Write "/workspaces/agentic-flow/tests/feature.test.ts"

# DO use Claude Code's Task tool for execution
Task("Backend Developer", "Build REST API. Use hooks for coordination.", "backend-dev")

# DO organize files properly
Write "/workspaces/agentic-flow/src/api.ts"      # ✅ Correct
Write "/workspaces/agentic-flow/tests/api.test.ts"  # ✅ Correct
Write "/workspaces/agentic-flow/docs/API.md"    # ✅ Correct
```

## 🔗 Key Resources

### Documentation
- **Full Capability Matrix**: [CAPABILITY-MATRIX.md](./CAPABILITY-MATRIX.md)
- **Feature Recommendations**: [FEATURE-RECOMMENDATION-ENGINE.md](./FEATURE-RECOMMENDATION-ENGINE.md)
- **Integration Map**: [INTEGRATION-MAP.svg](./INTEGRATION-MAP.svg)

### ADRs (Architecture Decision Records)
- **ADR-058**: Autopilot Swarm Completion
- **ADR-060**: Proof-Gated Graph Intelligence
- **ADR-026**: 3-Tier Model Routing

### Links
- **GitHub**: https://github.com/ruvnet/agentic-flow
- **Issues**: https://github.com/ruvnet/agentic-flow/issues
- **NPM**: https://www.npmjs.com/package/agentic-flow

## 📞 Getting Help

### Discord Community
- Ask questions, share patterns, get help
- Invite: https://discord.gg/agentic-flow (placeholder)

### GitHub Discussions
- Feature requests: https://github.com/ruvnet/agentic-flow/discussions
- Bug reports: https://github.com/ruvnet/agentic-flow/issues

### Email Support
- Contact: contact@ruv.io

---

**Pro Tip**: Use `npx agentic-flow autopilot enable` for long-running swarms to ensure all tasks complete without manual re-engagement!
