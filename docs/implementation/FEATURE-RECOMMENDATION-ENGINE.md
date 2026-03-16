# Agentic-Flow Feature Recommendation Engine

**Version**: 1.10.3 | **Updated**: 2026-02-25

## Purpose

This document provides intelligent recommendations for **when to use what** based on your specific use case, scale, and requirements.

---

## 🎯 Use Case Matcher

### I Want To...

#### Build a REST API
**Recommended Stack**:
1. **Agent**: `backend-dev` (primary) + `tester` (parallel)
2. **Topology**: `hierarchical` (coordinator → backend-dev, tester, reviewer)
3. **MCP Tools**: `memory_store` (store API patterns), `github_pr_manage` (auto-PR)
4. **Hooks**: `post-edit` (auto-format), `post-task` (learn patterns)
5. **Controllers**: `SkillLibrary` (reuse API patterns), `ReflexionMemory` (learn from past APIs)

**Example Workflow**:
```bash
# 1. Initialize swarm
npx agentic-flow swarm init --topology hierarchical --max-agents 6

# 2. Enable autopilot
npx agentic-flow autopilot enable

# 3. Spawn agents via Claude Code Task tool
Task("Backend Developer", "Build REST API with Express, JWT auth, PostgreSQL. Use hooks.", "backend-dev")
Task("Database Architect", "Design normalized schema. Store in memory.", "code-analyzer")
Task("Test Engineer", "Write Jest tests with 90% coverage.", "tester")
Task("API Docs Generator", "Generate OpenAPI spec and docs.", "api-docs")
```

**Why This Works**:
- Hierarchical topology: Clear task delegation (coordinator → specialists)
- Autopilot: Ensures all tests + docs complete before stopping
- Memory + Hooks: Learn API patterns for future reuse
- Parallel execution: Backend + DB + tests run concurrently

---

#### Review Code for Security
**Recommended Stack**:
1. **Agent**: `reviewer` (security focus) + `security-manager`
2. **Topology**: `mesh` (peer review, consensus)
3. **MCP Tools**: `github_security_scan`, `memory_episode_store` (record findings)
4. **Hooks**: `pre-edit` (backup before fixes), `post-task` (learn security patterns)
5. **Controllers**: `ExplainableRecall` (audit trail), `CausalMemoryGraph` (vulnerability chains)

**Example Workflow**:
```bash
# 1. Initialize mesh swarm (peer review)
npx agentic-flow swarm init --topology mesh --max-agents 5

# 2. Spawn reviewers via Claude Code Task tool
Task("Security Reviewer", "Check for OWASP Top 10 vulnerabilities. Log findings.", "security-manager")
Task("Performance Reviewer", "Check for N+1 queries, memory leaks.", "perf-analyzer")
Task("Style Reviewer", "Check ESLint, Prettier compliance.", "code-analyzer")
Task("Test Coverage Reviewer", "Verify 90% coverage, edge cases.", "tester")
```

**Why This Works**:
- Mesh topology: All reviewers collaborate, build consensus
- Multiple perspectives: Security, performance, style, tests
- Explainable recall: Audit trail for compliance
- Causal graph: Track vulnerability root causes

---

#### Implement Large Feature (Multi-File)
**Recommended Stack**:
1. **Agent**: `coder` (primary) + `planner` + `reviewer`
2. **Topology**: `hierarchical` (coordinator → planners → coders)
3. **MCP Tools**: `task_orchestrate`, `workflow_create`, `autopilot_status`
4. **Hooks**: `session-save` (checkpoints), `post-task` (learn patterns)
5. **Controllers**: `LearningSystem` (trajectory learning), `AutopilotLearning` (completion patterns)
6. **Autopilot**: **REQUIRED** (ensures multi-phase completion)

**Example Workflow**:
```bash
# 1. Initialize hierarchical swarm
npx agentic-flow swarm init --topology hierarchical --max-agents 10

# 2. Enable autopilot (CRITICAL for large features)
npx agentic-flow autopilot config --max-iterations 100 --timeout 180
npx agentic-flow autopilot enable

# 3. Create workflow
npx agentic-flow workflow create user-auth-feature --steps "plan,design,implement,test,review"

# 4. Spawn agents via Claude Code Task tool
Task("Feature Planner", "Break down user auth into tasks. Store in memory.", "planner")
Task("System Architect", "Design auth architecture. Save diagrams.", "system-architect")
Task("Backend Dev 1", "Implement JWT service. Coordinate via hooks.", "backend-dev")
Task("Backend Dev 2", "Implement password hashing. Coordinate via hooks.", "backend-dev")
Task("Tester", "Write unit + integration tests.", "tester")
Task("Reviewer", "Review code quality and security.", "reviewer")
Task("DevOps", "Setup CI/CD pipeline for auth.", "cicd-engineer")
```

**Why This Works**:
- Hierarchical: 10+ agents need clear coordination
- Autopilot: Ensures ALL tasks (plan, implement, test, review, deploy) complete
- Workflow: Track multi-phase progress
- Learning: Record successful patterns for future features

---

#### Optimize Performance
**Recommended Stack**:
1. **Agent**: `perf-analyzer` + `performance-benchmarker`
2. **Topology**: `star` (centralized profiling)
3. **MCP Tools**: `performance_benchmark`, `performance_bottleneck`, `performance_profile`
4. **Hooks**: `post-command` (profile every command)
5. **Controllers**: `WASMVectorSearch` (fast search), `HNSWIndex` (fast indexing)

**Example Workflow**:
```bash
# 1. Run benchmarks
npx agentic-flow performance benchmark --benchmark-type full-stack

# 2. Detect bottlenecks
npx agentic-flow performance bottleneck --threshold 0.7

# 3. Spawn analyzer via Claude Code Task tool
Task("Performance Analyzer", "Profile app, find bottlenecks, recommend fixes.", "perf-analyzer")

# 4. Generate report
npx agentic-flow performance report --format json > perf-report.json
```

**Why This Works**:
- Star topology: Centralized profiling hub
- Comprehensive tools: Benchmark + bottleneck + profile
- WASM: Fastest vector operations for search optimization

---

#### Train Agent on Past Successes
**Recommended Stack**:
1. **Agent**: `smart-agent` (self-optimizing)
2. **Topology**: N/A (single agent learning)
3. **MCP Tools**: `autopilot_learn`, `learning_trajectory`, `neural_train`
4. **Hooks**: `intelligence_trajectory-step` (record every step)
5. **Controllers**: `LearningSystem`, `ReasoningBank`, `NightlyLearner`

**Example Workflow**:
```bash
# 1. Discover patterns from past completions
npx agentic-flow autopilot learn --json > patterns.json

# 2. Search past episodes
npx agentic-flow autopilot history --query "API development" --limit 20 > episodes.json

# 3. Train policy
npx agentic-flow --agent smart-agent --task "Train policy from successful episodes"

# 4. Predict next action
npx agentic-flow autopilot predict --json
```

**Why This Works**:
- Learn from real experience: Episodes from past swarms
- Pattern discovery: ReasoningBank extracts common patterns
- Policy learning: LearningSystem trains optimal action policy

---

#### Automate GitHub Workflow
**Recommended Stack**:
1. **Agent**: `pr-manager` + `issue-tracker` + `release-manager`
2. **Topology**: `hierarchical` (coordinator → GitHub agents)
3. **MCP Tools**: `github_pr_manage`, `github_issue_track`, `github_workflow`, `github_release_manage`
4. **Hooks**: `post-task` (auto-create PR)
5. **Controllers**: `SkillLibrary` (store PR templates)

**Example Workflow**:
```bash
# 1. Spawn GitHub automation agents via Claude Code Task tool
Task("PR Manager", "Create PR for feature-x, auto-assign reviewers.", "pr-manager")
Task("Issue Tracker", "Triage new issues, assign labels, close duplicates.", "issue-tracker")
Task("Release Manager", "Prepare v2.0.0 release notes, tag, publish.", "release-manager")

# 2. Enable workflow automation
npx agentic-flow --agent workflow-automation --task "Setup CI/CD for PRs"
```

**Why This Works**:
- Specialized GitHub agents: PR, issue, release management
- Automation: Reduce manual work, faster releases
- Skill library: Reuse PR templates, release checklists

---

#### Migrate Legacy System
**Recommended Stack**:
1. **Agent**: `migration-planner` + `system-architect` + `reviewer`
2. **Topology**: `hierarchical` (phased migration)
3. **MCP Tools**: `workflow_create`, `task_orchestrate`, `memory_store` (migration plan)
4. **Hooks**: `session-save` (checkpoint after each phase)
5. **Controllers**: `CausalMemoryGraph` (dependency mapping)
6. **Autopilot**: **REQUIRED** (multi-phase migrations need completion)

**Example Workflow**:
```bash
# 1. Plan migration
npx agentic-flow --agent migration-planner --task "Plan migration from MongoDB to PostgreSQL"

# 2. Create workflow
npx agentic-flow workflow create db-migration --steps "analysis,schema,data,validation"

# 3. Enable autopilot
npx agentic-flow autopilot config --max-iterations 150 --timeout 240
npx agentic-flow autopilot enable

# 4. Spawn migration agents via Claude Code Task tool
Task("System Architect", "Design target PostgreSQL schema.", "system-architect")
Task("Migration Coder", "Implement data migration scripts.", "coder")
Task("Validator", "Verify data integrity, run tests.", "production-validator")
Task("Reviewer", "Review migration plan and scripts.", "reviewer")
```

**Why This Works**:
- Phased approach: Analysis → Schema → Data → Validation
- Autopilot: Ensures ALL phases complete without manual intervention
- Causal graph: Map dependencies between old/new systems
- Checkpointing: Session-save after each phase for safety

---

## 📊 Decision Matrix

### Swarm Topology Selection

| Scenario | Agents | Topology | Why |
|----------|--------|----------|-----|
| **Simple task, 1-2 agents** | 1-2 | N/A | Single agent or pair programming |
| **Collaborative review, 3-6 agents** | 3-6 | `mesh` | Peer review, consensus building |
| **Feature development, 5-15 agents** | 5-15 | `hierarchical` | Clear task delegation, coordinator → workers |
| **Pipeline processing, 3-10 agents** | 3-10 | `ring` | Sequential processing, ordered flow |
| **Load balancing, 5-20 agents** | 5-20 | `star` | Centralized hub, fan-out/fan-in |
| **Large-scale (20+ agents)** | 20+ | `hierarchical` | Multi-level hierarchy, sub-coordinators |

### Agent Selection by Task Complexity

| Task Complexity | Agent Type | Reasoning |
|-----------------|------------|-----------|
| **Simple (1-2 files)** | `coder` | General-purpose, fast |
| **Medium (3-10 files)** | `backend-dev`, `coder`, `tester` | Specialized agents for different concerns |
| **Large (10+ files)** | `planner` → specialized agents | Break down first, then delegate |
| **Architecture** | `system-architect` | High-level design, diagrams |
| **Security-critical** | `security-manager` → `reviewer` | Security-first, then review |
| **Performance-critical** | `perf-analyzer` → `coder` | Profile first, optimize second |

### MCP Tool Selection by Goal

| Goal | Primary Tools | Secondary Tools |
|------|---------------|-----------------|
| **Store knowledge** | `memory_store`, `memory_episode_store` | `skill_publish` |
| **Retrieve knowledge** | `memory_search`, `memory_synthesize` | `memory_episode_recall` |
| **Learn patterns** | `autopilot_learn`, `learning_trajectory` | `neural_train` |
| **Route tasks** | `route_semantic`, `route_causal` | `attention_coordinate` |
| **Coordinate agents** | `swarm_init`, `agent_spawn`, `task_orchestrate` | `attention_coordinate` |
| **GitHub automation** | `github_pr_manage`, `github_issue_track` | `github_workflow` |
| **Performance** | `performance_benchmark`, `performance_bottleneck` | `performance_optimize` |
| **Workflows** | `workflow_create`, `workflow_execute` | `workflow_template` |

### Controller Selection by Use Case

| Use Case | Primary Controller | Secondary Controllers |
|----------|-------------------|----------------------|
| **Semantic search** | `WASMVectorSearch` | `HNSWIndex`, `EmbeddingService` |
| **Episode replay** | `ReflexionMemory` | `ContextSynthesizer` |
| **Skill reuse** | `SkillLibrary` | `ReasoningBank` |
| **Learning** | `LearningSystem` | `NightlyLearner`, `SonaTrajectoryService` |
| **Causal reasoning** | `CausalMemoryGraph` | `CausalRecall` |
| **Explainability** | `ExplainableRecall` | `MutationGuard`, `AttestationLog` |
| **Routing** | `SemanticRouter` | `LLMRouter` |
| **Graph intelligence** | `GraphTransformerService` | `CausalMemoryGraph` |
| **Attention** | `AttentionService` | `MMRDiversityRanker` |

---

## 🚀 Performance Optimization Recommendations

### Scenario: High Token Usage

**Symptoms**:
- Token costs exceeding budget
- Long completion times
- Repeated similar tasks

**Recommendations**:
1. **Enable Agent Booster** (ADR-026):
   ```bash
   export AGENTIC_FLOW_AGENT_BOOSTER=true
   ```
   - Tier 1 (WASM): <1ms, $0 (simple transforms)
   - Tier 2 (Haiku): ~500ms, $0.0002 (simple tasks)
   - Tier 3 (Sonnet): 2-5s, $0.003 (complex reasoning)

2. **Use Memory Effectively**:
   ```bash
   # Store patterns for reuse
   npx agentic-flow memory store --key "api-pattern" --value "REST with JWT"

   # Synthesize context instead of full episodes
   npx agentic-flow memory synthesize --query "API patterns" --limit 10
   ```

3. **Learn from Experience**:
   ```bash
   # Train patterns after successful completions
   npx agentic-flow autopilot learn

   # Use learned patterns for future tasks
   npx agentic-flow autopilot predict
   ```

**Expected Impact**: 30-50% token reduction, 2-3x speedup for repeated tasks

---

### Scenario: Slow Semantic Search

**Symptoms**:
- Memory recall taking >1s
- Embedding generation slow
- Large memory datasets (10k+ episodes)

**Recommendations**:
1. **Use WASM Acceleration**:
   ```typescript
   import { WASMVectorSearch } from 'agentdb';

   const search = new WASMVectorSearch();
   await search.initialize({ backend: 'wasm' });
   ```

2. **Enable HNSW Indexing**:
   ```typescript
   import { HNSWIndex } from 'agentdb';

   const index = new HNSWIndex();
   await index.build(vectors, { M: 16, efConstruction: 200 });
   ```

3. **Use Enhanced Embedding Service**:
   ```typescript
   import { EnhancedEmbeddingService } from 'agentdb';

   const embedder = new EnhancedEmbeddingService({
     cache: true,
     batchSize: 32
   });
   ```

**Expected Impact**: 5-10x faster search, 50-70% lower latency

---

### Scenario: Swarm Coordination Overhead

**Symptoms**:
- High inter-agent communication latency
- Agents waiting for each other
- Deadlocks or race conditions

**Recommendations**:
1. **Optimize Topology**:
   - Mesh: High overhead, use for 3-6 agents only
   - Hierarchical: Low overhead, best for 5-50 agents
   - Star: Lowest overhead, use for 5-20 agents

2. **Use QUIC Transport** (ADR-057):
   ```bash
   npx agentic-flow quic --port 4433
   ```
   - 50-70% faster than TCP
   - 0-RTT reconnection
   - 100+ concurrent streams

3. **Enable Attention Coordination**:
   ```typescript
   mcp__claude-flow__attention_coordinate({
     agents: ['coder-1', 'coder-2', 'tester'],
     task: 'Implement feature X',
     mechanism: 'softmax'
   })
   ```

**Expected Impact**: 40-60% lower coordination latency, fewer deadlocks

---

### Scenario: Incomplete Task Execution

**Symptoms**:
- Agents stop before all tasks done
- Partial implementations
- Manual re-engagement needed

**Recommendations**:
1. **Enable Autopilot** (ADR-058):
   ```bash
   npx agentic-flow autopilot enable
   npx agentic-flow autopilot config --max-iterations 100 --timeout 120
   ```

2. **Use Workflows**:
   ```bash
   npx agentic-flow workflow create my-workflow --steps "plan,implement,test,review"
   npx agentic-flow workflow execute my-workflow
   ```

3. **Enable Hooks**:
   ```json
   {
     "hooks": {
       "post-task": [
         {
           "name": "check-completion",
           "command": "npx agentic-flow autopilot status",
           "enabled": true
         }
       ]
     }
   }
   ```

**Expected Impact**: 100% task completion rate, zero manual re-engagements

---

## 🧠 Learning & Adaptation Recommendations

### Scenario: Repeating Similar Tasks

**Current State**: Manually creating similar APIs, components, tests each time

**Recommendation**: Enable learning pipeline

**Setup**:
```bash
# 1. Enable episode recording
# (Use memory_episode_store MCP tool after each task)

# 2. Enable autopilot learning
npx agentic-flow autopilot enable

# 3. Schedule nightly learning
# Add to cron:
0 2 * * * cd /path/to/project && npx agentic-flow hooks intelligence_learn

# 4. Use learned patterns
npx agentic-flow autopilot learn --json > patterns.json
npx agentic-flow --agent smart-agent --task "Use learned patterns for new API"
```

**Controllers to Use**:
- `ReflexionMemory`: Store episodes
- `SkillLibrary`: Store reusable skills
- `NightlyLearner`: Batch learning
- `LearningSystem`: Policy optimization

**Expected Impact**: 50-70% faster for repeated tasks, auto-improvements

---

### Scenario: Need Explainability/Audit

**Current State**: Cannot explain why agent made certain decisions

**Recommendation**: Enable explainable recall with proof generation

**Setup**:
```typescript
import { ExplainableRecall, MutationGuard } from 'agentdb';

// Enable explainable recall
const recall = new ExplainableRecall();
const results = await recall.recall(query, 10);

// Get Merkle proof for decision
const proof = await recall.getProof(results.decisionId);

// Verify proof integrity
const isValid = await recall.verifyProof(proof);

// Human-readable explanation
const explanation = await recall.explainDecision(results.decisionId);
console.log(explanation);
```

**MCP Tools to Use**:
- `explain_decision`: Get Merkle proof for recall
- `mcp__claude-flow__autopilot_history`: Search past episodes with audit trail

**Controllers to Use**:
- `ExplainableRecall`: Merkle-proof-based recall
- `MutationGuard`: Proof-gated mutations (ADR-060)
- `AttestationLog`: Tamper-proof audit log

**Expected Impact**: Full audit trail, compliance-ready, debugging easier

---

## 🎯 Scale-Based Recommendations

### Startup/Solo Developer (1-3 developers)

**Recommended Setup**:
- **Agents**: `coder`, `tester`, `reviewer`
- **Topology**: `mesh` (3-6 agents max)
- **MCP Tools**: `memory_store`, `memory_synthesize`, `autopilot_enable`
- **Focus**: Speed, learning, knowledge building

**Why**:
- Small team = simple coordination
- Learn patterns early for future reuse
- Autopilot ensures thorough completion

---

### Small Team (4-10 developers)

**Recommended Setup**:
- **Agents**: `coder`, `backend-dev`, `tester`, `reviewer`, `pr-manager`
- **Topology**: `hierarchical` (coordinator + 5-10 workers)
- **MCP Tools**: Memory, GitHub, Autopilot, Workflow
- **Focus**: Coordination, GitHub automation, CI/CD

**Why**:
- Hierarchical: Clear delegation with coordinator
- GitHub automation: Faster PR reviews, releases
- Workflows: Track multi-phase projects

---

### Medium Company (10-50 developers)

**Recommended Setup**:
- **Agents**: Full suite (60+ agents)
- **Topology**: Multi-level hierarchical (coordinator → sub-coordinators → workers)
- **MCP Tools**: All 133+ tools
- **Focus**: Performance, learning, security, compliance

**Why**:
- Scale requires optimization (WASM, HNSW, QUIC)
- Security + compliance (MutationGuard, AttestationLog)
- Learning from 10+ teams

---

### Enterprise (50+ developers)

**Recommended Setup**:
- **Agents**: Full suite + custom agents
- **Topology**: Distributed (multiple hierarchical swarms)
- **MCP Tools**: All tools + custom integrations
- **Focus**: Governance, compliance, observability, cost

**Why**:
- Multi-team coordination (distributed swarms)
- Strict governance (proof-gated mutations)
- Cost optimization (Agent Booster, neural compression)
- Observability (performance tools, hooks)

---

## 📈 ROI Calculator

### Time Savings

| Task | Manual Time | Agentic-Flow Time | Savings |
|------|-------------|-------------------|---------|
| **Simple API (CRUD)** | 4 hours | 1 hour | 75% |
| **Complex Feature (multi-file)** | 2-3 days | 6-8 hours | 70-80% |
| **Code review (manual)** | 1-2 hours | 10-15 minutes | 80-90% |
| **Release process** | 2-4 hours | 15-30 minutes | 85-90% |
| **Migration planning** | 1-2 weeks | 2-3 days | 60-80% |

### Token Cost Optimization

| Optimization | Token Reduction | Cost Savings |
|--------------|-----------------|--------------|
| **Agent Booster (ADR-026)** | 30-50% | 30-50% |
| **Memory reuse** | 20-40% | 20-40% |
| **Neural compression** | 10-20% | 10-20% |
| **Skill library** | 15-30% | 15-30% |
| **Combined** | 50-70% | 50-70% |

---

## 🔗 Next Steps

1. **Assess your use case** using the matcher above
2. **Choose appropriate stack** (agents, topology, tools, controllers)
3. **Set up recommended configuration**
4. **Enable autopilot** for completion
5. **Enable learning** for continuous improvement
6. **Monitor performance** and optimize

---

**Remember**: Start simple, scale gradually. Enable autopilot + learning from day 1 to build knowledge base!
