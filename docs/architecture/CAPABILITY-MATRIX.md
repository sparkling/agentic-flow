# Agentic-Flow Capability Matrix

**Version**: 1.10.3
**Last Updated**: 2026-02-25
**Status**: Production-Ready

## Table of Contents

1. [Overview](#overview)
2. [MCP Tools (133+)](#mcp-tools-133)
3. [CLI Commands (11 Modules, 58+ Subcommands)](#cli-commands-11-modules-58-subcommands)
4. [AgentDB Controllers (27 Controllers)](#agentdb-controllers-27-controllers)
5. [Agent Types (60+)](#agent-types-60)
6. [RuVector Integration (8 Packages)](#ruvector-integration-8-packages)
7. [Hooks System (17 Types)](#hooks-system-17-types)
8. [Swarm Topologies (4 Types)](#swarm-topologies-4-types)
9. [Integration Surfaces](#integration-surfaces)
10. [Architecture Decision Records](#architecture-decision-records)

---

## Overview

Agentic-Flow is a production-ready AI agent orchestration platform featuring:

- **133+ MCP Tools** across 10 functional domains
- **11 CLI Modules** with 58+ subcommands
- **27 AgentDB Controllers** for memory, learning, and graph intelligence
- **60+ Specialized Agent Types** for diverse development tasks
- **8 RuVector Packages** for vector operations and graph transformers
- **17 Hook Types** for pre/post operation automation
- **4 Swarm Topologies** for distributed coordination

---

## MCP Tools (133+)

### Core Tools (23 Tools)

#### Memory Management (4 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `memory_store` | key, value, namespace?, ttl? | Persist key-value data with optional TTL |
| `memory_retrieve` | key, namespace? | Retrieve stored values |
| `memory_search` | pattern, namespace?, limit? | Search with wildcard patterns (* and ?) |
| `memory_synthesize` | query, limit?, namespace?, includeRecommendations? | Generate coherent context summary from episodes |

#### Swarm Orchestration (3 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `swarm_init` | topology, maxAgents?, strategy? | Initialize mesh/hierarchical/ring/star topology |
| `agent_spawn` | type, capabilities?, name? | Spawn researcher/coder/analyst/optimizer/coordinator |
| `task_orchestrate` | task, strategy?, priority?, maxAgents? | Orchestrate tasks with parallel/sequential/adaptive strategy |

#### Agent Execution (4 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `agent_execute` | agent, task, stream? | Execute specific agent with task |
| `agent_parallel` | topic?, diff?, dataset?, streaming? | Run 3 agents in parallel (research, code review, data) |
| `agent_list` | format? | List all 60+ agents (summary/detailed/json) |
| `agent_add` | name, description, systemPrompt, category?, capabilities? | Add custom agent markdown definition |

#### Custom Commands (1 Tool)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `command_add` | name, description, usage, parameters?, examples? | Add custom command markdown definition |

### AgentDB Tools (12 Tools)

#### Episode Memory (2 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `memory_episode_store` | sessionId, task, input?, output?, critique?, reward, success, tags? | Store agent episode for replay (ReflexionMemory) |
| `memory_episode_recall` | query, limit? | Recall similar past episodes via semantic search |

#### Skill Library (2 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `skill_publish` | name, description?, code?, successRate, metadata? | Publish reusable skill to library |
| `skill_find` | description, limit? | Find applicable skills via semantic search |

#### Routing & Coordination (3 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `route_semantic` | taskDescription | Route task to optimal tier (ADR-026: Booster/Haiku/Sonnet) |
| `route_causal` | taskType, agentTypes | Causal routing via CausalMemoryGraph |
| `attention_coordinate` | agents, task, mechanism? | Attention-weighted task assignment (softmax/uniform/priority) |

#### Graph Operations (2 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `graph_query` | query, limit? | Query agent knowledge graph (natural language or keyword) |
| `graph_store` | nodes, edges | Store nodes/edges in knowledge graph |

#### Learning & Prediction (2 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `learning_trajectory` | steps, reward | Record state-action-reward sequence |
| `learning_predict` | state | Predict optimal action using learned policy |

#### Explainability (1 Tool)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `explain_decision` | decisionId | Get Merkle proof for recall decision |

### Session Tools (8 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `session_save` | sessionId, metadata? | Persist session state |
| `session_restore` | sessionId | Restore session context |
| `session_list` | limit? | List all sessions |
| `session_info` | sessionId | Get session details |
| `session_delete` | sessionId | Delete session |
| `session_metrics` | sessionId? | Get session performance metrics |
| `session_export` | sessionId, format? | Export session data (JSON/CSV) |
| `session_import` | data | Import session data |

### GitHub Tools (8 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `github_repo_analyze` | owner, repo | Analyze repository structure and patterns |
| `github_pr_manage` | owner, repo, action, prNumber?, options? | Create/review/merge PRs |
| `github_issue_track` | owner, repo, action, issueNumber?, options? | Create/update/close issues |
| `github_workflow` | owner, repo, action, workflowFile?, options? | Trigger/monitor GitHub Actions |
| `github_metrics` | owner, repo, since?, until? | Get repo metrics (commits, PRs, issues) |
| `github_branch_sync` | owner, repo, sourceBranch, targetBranch | Sync branches with conflict resolution |
| `github_release_manage` | owner, repo, action, tag?, options? | Create/publish releases |
| `github_security_scan` | owner, repo, scanType? | Run security scans (dependabot, code scanning) |

### Neural Tools (6 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `neural_train` | dataset, config | Train neural model on dataset |
| `neural_predict` | input, modelId? | Run prediction with trained model |
| `neural_status` | modelId? | Get training status/metrics |
| `neural_patterns` | query, limit? | Discover learned patterns |
| `neural_compress` | modelId, compressionRatio? | Compress model via pruning/quantization |
| `neural_optimize` | modelId, targetDevice? | Optimize model for target (CPU/GPU/Edge) |

### RuVector Tools (6 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `ruvector_init` | backend, config? | Initialize RuVector backend |
| `ruvector_store` | vectors, metadata? | Store vectors with metadata |
| `ruvector_search` | query, k?, threshold? | Semantic vector search |
| `ruvector_attention` | query, context, mechanism? | Apply attention mechanism (softmax/scaled-dot/multi-head) |
| `ruvector_graph_transform` | graphData, transformType | Transform graph using GNN |
| `ruvector_status` | | Get RuVector backend status |

### Sona RVF Tools (11 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `sona_trajectory_store` | steps, reward, metadata? | Store agent trajectory |
| `sona_trajectory_replay` | trajectoryId | Replay trajectory |
| `sona_trajectory_search` | query, limit? | Search similar trajectories |
| `rvf_encode` | data, schema? | Encode data to RVF format |
| `rvf_decode` | encoded | Decode RVF data |
| `rvf_validate` | data | Validate RVF schema |
| `sona_policy_train` | trajectories, config? | Train policy from trajectories |
| `sona_policy_evaluate` | policyId, testData | Evaluate policy performance |
| `sona_router_route` | input, routingType? | Route input via semantic router |
| `sona_router_config` | config | Configure routing rules |
| `sona_stats` | | Get Sona/RVF system stats |

### Infrastructure Tools (13 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `system_health` | | Check system health |
| `system_metrics` | | Get CPU/memory/disk metrics |
| `system_info` | | Get system information |
| `system_status` | | Get overall system status |
| `system_reset` | | Reset system state |
| `config_get` | key | Get config value |
| `config_set` | key, value | Set config value |
| `config_list` | | List all config |
| `config_export` | | Export config to JSON |
| `config_import` | data | Import config from JSON |
| `config_reset` | | Reset config to defaults |
| `terminal_execute` | command, cwd? | Execute terminal command |
| `terminal_history` | limit? | Get command history |

### Autopilot Tools (10 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `autopilot_status` | | Get autopilot state (iterations, elapsed, progress) |
| `autopilot_enable` | | Enable persistent swarm completion |
| `autopilot_disable` | | Disable autopilot |
| `autopilot_config` | maxIterations?, timeoutMinutes?, enabled? | Configure autopilot limits |
| `autopilot_reset` | | Reset iteration counter |
| `autopilot_log` | last?, clear? | View/clear autopilot event log |
| `autopilot_progress` | source? | Get detailed task progress |
| `autopilot_learn` | sessionId? | Discover success patterns from past completions |
| `autopilot_history` | query, limit?, onlyFailures?, onlySuccesses? | Search past task episodes |
| `autopilot_predict` | currentState | Predict optimal next action |

### Performance Tools (15 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `performance_benchmark` | benchmarkType, config? | Run performance benchmarks |
| `performance_metrics` | agentId?, sessionId? | Get performance metrics |
| `performance_profile` | operation, duration? | Profile operation |
| `performance_optimize` | target, strategy? | Auto-optimize performance |
| `performance_report` | format? | Generate performance report |
| `performance_bottleneck` | threshold? | Detect bottlenecks |
| `token_usage` | agentId?, sessionId? | Get token usage stats |
| `latency_analyze` | operation?, since? | Analyze latency patterns |
| `throughput_measure` | operations?, duration? | Measure throughput |
| `memory_profile` | detailed? | Profile memory usage |
| `cpu_profile` | duration? | Profile CPU usage |
| `network_profile` | endpoint?, duration? | Profile network calls |
| `cache_stats` | cacheType? | Get cache statistics |
| `cache_clear` | cacheType? | Clear caches |
| `cache_optimize` | | Optimize cache settings |

### Workflow Tools (11 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `workflow_create` | name, steps, config? | Create workflow definition |
| `workflow_execute` | workflowId, inputs? | Execute workflow |
| `workflow_status` | workflowId | Get workflow execution status |
| `workflow_cancel` | workflowId | Cancel running workflow |
| `workflow_pause` | workflowId | Pause workflow execution |
| `workflow_resume` | workflowId | Resume paused workflow |
| `workflow_list` | status?, limit? | List workflows |
| `workflow_delete` | workflowId | Delete workflow |
| `workflow_template` | templateName | Get workflow template |
| `workflow_export` | workflowId, format? | Export workflow definition |
| `workflow_import` | workflowData | Import workflow definition |

### DAA (Dynamic Agent Adaptation) Tools (10 Tools)
| Tool | Parameters | Use Case |
|------|-----------|----------|
| `daa_init` | config? | Initialize DAA system |
| `daa_agent_create` | type, capabilities, learningConfig? | Create adaptive agent |
| `daa_agent_adapt` | agentId, feedback | Adapt agent based on feedback |
| `daa_cognitive_pattern` | patternType, context? | Generate cognitive pattern |
| `daa_knowledge_share` | sourceAgentId, targetAgentId, knowledgeType | Share knowledge between agents |
| `daa_learning_status` | agentId? | Get learning status |
| `daa_performance_metrics` | agentId, since? | Get agent performance metrics |
| `daa_workflow_create` | workflow, adaptationRules? | Create adaptive workflow |
| `daa_workflow_execute` | workflowId, inputs? | Execute adaptive workflow |
| `daa_meta_learning` | agentIds, strategy? | Perform meta-learning across agents |

---

## CLI Commands (11 Modules, 58+ Subcommands)

### 1. `init` Command (4 Subcommands)
```bash
npx agentic-flow init               # Interactive wizard
npx agentic-flow init --wizard      # Interactive wizard (explicit)
npx agentic-flow init --skip-deps   # Skip dependency check
npx agentic-flow init --clean       # Clean install
```

**Purpose**: Initialize project configuration

### 2. `agent` Command (8 Subcommands)
```bash
npx agentic-flow agent list [format]        # List agents (summary/detailed/json)
npx agentic-flow agent create               # Interactive agent creator
npx agentic-flow agent info <name>          # Show agent details
npx agentic-flow agent conflicts            # Check package/local conflicts
npx agentic-flow agent spawn -t <type>      # Spawn agent
npx agentic-flow agent status <id>          # Get agent status
npx agentic-flow agent terminate <id>       # Terminate agent
npx agentic-flow agent update <id>          # Update agent config
```

**Purpose**: Agent lifecycle management

### 3. `swarm` Command (6 Subcommands)
```bash
npx agentic-flow swarm init [opts]          # Initialize swarm topology
npx agentic-flow swarm status               # Get swarm status
npx agentic-flow swarm spawn <agent>        # Spawn agent in swarm
npx agentic-flow swarm scale <count>        # Scale swarm size
npx agentic-flow swarm shutdown             # Shutdown swarm
npx agentic-flow swarm health               # Health check
```

**Purpose**: Multi-agent swarm orchestration

### 4. `memory` Command (11 Subcommands)
```bash
npx agentic-flow memory store --key K --value V [opts]  # Store value
npx agentic-flow memory retrieve --key K [opts]         # Retrieve value
npx agentic-flow memory search --query Q [opts]         # Search memories
npx agentic-flow memory list [opts]                     # List all memories
npx agentic-flow memory delete --key K [opts]           # Delete memory
npx agentic-flow memory migrate --source S --dest D     # Migrate memories
npx agentic-flow memory stats [opts]                    # Get statistics
npx agentic-flow memory export --output FILE            # Export memories
npx agentic-flow memory import --input FILE             # Import memories
npx agentic-flow memory clear --namespace N             # Clear namespace
npx agentic-flow memory synthesize --query Q [opts]     # Synthesize context
```

**Purpose**: Persistent memory management

### 5. `task` Command (6 Subcommands)
```bash
npx agentic-flow task create <name> [opts]      # Create task
npx agentic-flow task list [opts]               # List tasks
npx agentic-flow task status <id>               # Get task status
npx agentic-flow task cancel <id>               # Cancel task
npx agentic-flow task update <id> [opts]        # Update task
npx agentic-flow task complete <id>             # Mark complete
```

**Purpose**: Task lifecycle management

### 6. `session` Command (7 Subcommands)
```bash
npx agentic-flow session save <id> [opts]       # Save session
npx agentic-flow session restore <id>           # Restore session
npx agentic-flow session list [opts]            # List sessions
npx agentic-flow session info <id>              # Get session info
npx agentic-flow session delete <id>            # Delete session
npx agentic-flow session export <id> [opts]     # Export session
npx agentic-flow session import <file>          # Import session
```

**Purpose**: Session state management

### 7. `hooks` Command (17 Subcommands)
```bash
npx agentic-flow hooks list                     # List all hooks
npx agentic-flow hooks pre-task <desc>          # Pre-task hook
npx agentic-flow hooks post-task <id>           # Post-task hook
npx agentic-flow hooks pre-edit <file>          # Pre-edit hook
npx agentic-flow hooks post-edit <file>         # Post-edit hook
npx agentic-flow hooks pre-command <cmd>        # Pre-command hook
npx agentic-flow hooks post-command <cmd>       # Post-command hook
npx agentic-flow hooks session-start <id>       # Session start hook
npx agentic-flow hooks session-end <id>         # Session end hook
npx agentic-flow hooks session-restore <id>     # Session restore hook
npx agentic-flow hooks notify --message M       # Notify hook
npx agentic-flow hooks route <task>             # Route hook
npx agentic-flow hooks model-route <task>       # Model routing hook
npx agentic-flow hooks model-outcome <result>   # Model outcome hook
npx agentic-flow hooks intelligence <cmd>       # Intelligence hook
npx agentic-flow hooks metrics                  # Get hook metrics
npx agentic-flow hooks explain                  # Explain hooks
```

**Purpose**: Hook-based automation

### 8. `hive-mind` Command (6 Subcommands)
```bash
npx agentic-flow hive-mind init [opts]          # Initialize hive-mind
npx agentic-flow hive-mind join <id>            # Join hive-mind
npx agentic-flow hive-mind leave                # Leave hive-mind
npx agentic-flow hive-mind status               # Get status
npx agentic-flow hive-mind broadcast <msg>      # Broadcast message
npx agentic-flow hive-mind shutdown             # Shutdown hive-mind
```

**Purpose**: Collective intelligence coordination

### 9. `daemon` Command (5 Subcommands)
```bash
npx agentic-flow daemon start [opts]            # Start daemon
npx agentic-flow daemon stop                    # Stop daemon
npx agentic-flow daemon status                  # Get daemon status
npx agentic-flow daemon restart                 # Restart daemon
npx agentic-flow daemon logs [opts]             # View logs
```

**Purpose**: Background service management

### 10. `doctor` Command (2 Subcommands)
```bash
npx agentic-flow doctor                         # Health check
npx agentic-flow doctor --fix                   # Auto-fix issues
```

**Purpose**: System diagnostics and repair

### 11. `autopilot` Command (9 Subcommands)
```bash
npx agentic-flow autopilot status [opts]        # Get status
npx agentic-flow autopilot enable               # Enable autopilot
npx agentic-flow autopilot disable              # Disable autopilot
npx agentic-flow autopilot config [opts]        # Configure limits
npx agentic-flow autopilot reset                # Reset state
npx agentic-flow autopilot log [opts]           # View/clear log
npx agentic-flow autopilot learn [opts]         # Discover patterns
npx agentic-flow autopilot history --query Q    # Search episodes
npx agentic-flow autopilot predict [opts]       # Predict next action
```

**Purpose**: Persistent swarm completion (ADR-058)

---

## AgentDB Controllers (27 Controllers)

### Memory & Recall (6 Controllers)

#### 1. ReflexionMemory
**Purpose**: Store and recall agent episodes with self-critique

**Methods**:
- `storeEpisode(episode)` - Store episode with embedding
- `recallSimilar(query, limit)` - Semantic search for similar episodes
- `getEpisode(id)` - Retrieve specific episode
- `updateEpisode(id, updates)` - Update episode
- `deleteEpisode(id)` - Delete episode
- `getStats()` - Get memory statistics

**Use Cases**: Experience replay, learning from past mistakes, self-improvement

#### 2. CausalMemoryGraph
**Purpose**: Build causal relationship graph for reasoning

**Methods**:
- `addNode(id, data)` - Add graph node
- `addEdge(from, to, causalStrength)` - Add causal edge
- `queryPath(start, end)` - Find causal paths
- `getCausalInfluence(nodeId)` - Compute influence score
- `prune(threshold)` - Remove weak edges

**Use Cases**: Root cause analysis, causal reasoning, knowledge graphs

#### 3. CausalRecall
**Purpose**: Recall with causal re-ranking

**Methods**:
- `recall(query, limit, rerankConfig?)` - Causal-aware recall
- `rerank(candidates, causalContext)` - Re-rank by causality
- `explainRanking(candidates)` - Explain ranking decisions

**Use Cases**: Contextual retrieval, causal reasoning chains

#### 4. ExplainableRecall
**Purpose**: Merkle-proof-based explainable recall

**Methods**:
- `recall(query, limit)` - Recall with proof generation
- `getProof(decisionId)` - Get Merkle proof for decision
- `verifyProof(proof)` - Verify proof integrity
- `explainDecision(decisionId)` - Human-readable explanation

**Use Cases**: Auditable AI, compliance, debugging recall logic

#### 5. ContextSynthesizer
**Purpose**: Synthesize coherent summaries from memories

**Methods**:
- `synthesize(episodes, options?)` - Generate summary
- `extractPatterns(episodes)` - Extract common patterns
- `generateRecommendations(synthesis)` - Generate actionable insights

**Use Cases**: Context building, pattern discovery, decision support

#### 6. MetadataFilter
**Purpose**: Advanced metadata filtering for recall

**Methods**:
- `filter(items, filters)` - Apply metadata filters
- `buildQuery(filters)` - Build SQL WHERE clause
- `validateFilter(filter)` - Validate filter syntax

**Use Cases**: Filtered retrieval, multi-faceted search

### Learning & Skill (4 Controllers)

#### 7. SkillLibrary
**Purpose**: Manage reusable agent skills

**Methods**:
- `publishSkill(skill)` - Publish skill
- `findSkills(description, limit)` - Search skills
- `getSkill(id)` - Get skill by ID
- `updateSkill(id, updates)` - Update skill
- `deleteSkill(id)` - Delete skill
- `linkSkills(skillA, skillB, relation)` - Create skill relationships

**Use Cases**: Skill reuse, compositional reasoning, transfer learning

#### 8. LearningSystem
**Purpose**: Reinforcement learning for agents

**Methods**:
- `recordTrajectory(steps, reward)` - Record trajectory
- `predictAction(state)` - Predict optimal action
- `trainPolicy(trajectories)` - Train policy network
- `evaluatePolicy(testData)` - Evaluate policy
- `getStats()` - Get learning statistics

**Use Cases**: Policy learning, decision optimization, adaptive agents

#### 9. NightlyLearner
**Purpose**: Batch learning from accumulated episodes

**Methods**:
- `run()` - Run nightly learning job
- `discoverPatterns()` - Discover success patterns
- `updatePolicies()` - Update agent policies
- `generateReport()` - Generate learning report

**Use Cases**: Batch training, pattern discovery, offline learning

#### 10. ReasoningBank
**Purpose**: Store and retrieve reasoning patterns

**Methods**:
- `storePattern(pattern)` - Store reasoning pattern
- `searchPatterns(query, limit)` - Search patterns
- `getPattern(id)` - Get pattern by ID
- `updatePattern(id, updates)` - Update pattern
- `getStats()` - Get pattern statistics

**Use Cases**: Reasoning reuse, template-based reasoning, knowledge transfer

### Embedding & Search (4 Controllers)

#### 11. EmbeddingService
**Purpose**: Generate text embeddings

**Methods**:
- `embed(text)` - Generate embedding
- `batchEmbed(texts)` - Batch embedding generation
- `similarity(embedding1, embedding2)` - Compute similarity
- `getConfig()` - Get embedding config

**Use Cases**: Semantic search, similarity comparison, clustering

#### 12. EnhancedEmbeddingService
**Purpose**: Advanced embedding with caching and batching

**Methods**:
- `embed(text, config?)` - Generate with optimizations
- `batchEmbed(texts, config?)` - Optimized batch embedding
- `getCached(text)` - Get cached embedding
- `clearCache()` - Clear embedding cache

**Use Cases**: High-performance embedding, production workloads

#### 13. WASMVectorSearch
**Purpose**: WASM-accelerated vector search

**Methods**:
- `initialize(config?)` - Initialize WASM backend
- `addVectors(vectors, metadata)` - Add vectors to index
- `search(query, k, threshold?)` - Search similar vectors
- `delete(ids)` - Delete vectors
- `getStats()` - Get index statistics

**Use Cases**: Fast semantic search, real-time retrieval

#### 14. HNSWIndex
**Purpose**: Hierarchical navigable small world index

**Methods**:
- `build(vectors, config?)` - Build HNSW index
- `search(query, k)` - Fast approximate search
- `insert(vector, id)` - Insert vector
- `delete(id)` - Delete vector
- `rebuild()` - Rebuild index
- `getStats()` - Get index statistics

**Use Cases**: Large-scale vector search, low-latency retrieval

### Attention & Coordination (1 Controller)

#### 15. AttentionService
**Purpose**: Attention mechanisms for agent coordination

**Methods**:
- `softmaxAttention(query, keys, values)` - Softmax attention
- `scaledDotProductAttention(query, keys, values, scale?)` - Scaled dot-product
- `multiHeadAttention(query, keys, values, numHeads)` - Multi-head attention
- `crossAttention(querySeq, kvSeq)` - Cross-attention
- `selfAttention(sequence)` - Self-attention

**Use Cases**: Task assignment, resource allocation, focus management

### Ranking & Diversity (1 Controller)

#### 16. MMRDiversityRanker
**Purpose**: Maximal marginal relevance ranking

**Methods**:
- `rank(candidates, query, lambda?)` - MMR ranking
- `rerank(results, diversityWeight?)` - Re-rank for diversity

**Use Cases**: Diverse results, avoiding redundancy

### Synchronization & QUIC (3 Controllers)

#### 17. QUICServer
**Purpose**: QUIC transport server

**Methods**:
- `start(port, config?)` - Start QUIC server
- `stop()` - Stop server
- `send(clientId, message)` - Send message
- `broadcast(message)` - Broadcast to all clients
- `getStats()` - Get server statistics

**Use Cases**: Low-latency communication, agent coordination

#### 18. QUICClient
**Purpose**: QUIC transport client

**Methods**:
- `connect(host, port)` - Connect to server
- `disconnect()` - Disconnect
- `send(message)` - Send message
- `subscribe(callback)` - Subscribe to messages

**Use Cases**: Agent communication, distributed systems

#### 19. SyncCoordinator
**Purpose**: State synchronization across agents

**Methods**:
- `syncState(state, peers)` - Synchronize state
- `getConsensus(proposals)` - Reach consensus
- `detectConflicts(states)` - Detect state conflicts
- `resolveConflicts(conflicts, strategy)` - Resolve conflicts

**Use Cases**: Distributed coordination, consistency

### RuVector Integration (4 Controllers)

#### 20. SemanticRouter
**Purpose**: Route inputs based on semantic similarity

**Methods**:
- `route(input, routes, config?)` - Route to best match
- `addRoute(name, description, handler)` - Add routing rule
- `updateRoute(name, updates)` - Update rule
- `getStats()` - Get routing statistics

**Use Cases**: Intent routing, command dispatch

#### 21. SonaTrajectoryService
**Purpose**: Store and analyze agent trajectories

**Methods**:
- `storeTrajectory(steps, reward, metadata?)` - Store trajectory
- `replayTrajectory(id)` - Replay trajectory
- `searchTrajectories(query, limit)` - Search similar trajectories
- `getStats()` - Get trajectory statistics

**Use Cases**: Trajectory learning, policy improvement

#### 22. LLMRouter
**Purpose**: Route queries to optimal LLM

**Methods**:
- `route(query, availableModels)` - Select best model
- `getModelCapabilities(modelId)` - Get model info
- `updateCosts(modelId, cost)` - Update cost data

**Use Cases**: Cost optimization, model selection

#### 23. GraphTransformerService
**Purpose**: Transform graphs using GNN

**Methods**:
- `transform(graph, transformType)` - Apply GNN transformation
- `train(graphs, labels)` - Train GNN
- `predict(graph)` - Predict on graph
- `getStats()` - Get transformation statistics

**Use Cases**: Graph neural networks, knowledge graph reasoning

### Security & Proof (4 Controllers)

#### 24. MutationGuard
**Purpose**: Proof-gated mutation protection (ADR-060)

**Methods**:
- `requestMutation(operation, proof)` - Request mutation with proof
- `verifyProof(proof)` - Verify mutation proof
- `denyMutation(reason)` - Deny mutation
- `getAttestationLog()` - Get audit log

**Use Cases**: Secure mutations, audit trails

#### 25. AttestationLog
**Purpose**: Tamper-proof log for mutations

**Methods**:
- `append(entry)` - Append log entry
- `verify(proof)` - Verify log integrity
- `getEntries(filter?)` - Get log entries
- `export(format?)` - Export log

**Use Cases**: Compliance, forensics

#### 26. GuardedVectorBackend
**Purpose**: Proof-gated vector operations

**Methods**:
- `insert(vector, proof)` - Insert with proof
- `update(id, vector, proof)` - Update with proof
- `delete(id, proof)` - Delete with proof
- `getGuardLog()` - Get guard log

**Use Cases**: Secure vector storage, tamper detection

### Batch & Query Optimization (1 Controller)

#### 27. BatchOperations & QueryOptimizer
**Purpose**: Optimize database operations

**Methods**:
- `batchInsert(items)` - Batch insert
- `batchUpdate(items)` - Batch update
- `optimizeQuery(query)` - Optimize SQL query
- `getStats()` - Get optimization statistics

**Use Cases**: Performance optimization, bulk operations

---

## Agent Types (60+)

### Core Development (5)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `coder` | General-purpose coding agent | Feature implementation, bug fixes |
| `reviewer` | Code review and quality assurance | PR reviews, code quality |
| `tester` | Test creation and execution | Unit/integration/e2e tests |
| `planner` | Project planning and task breakdown | Sprint planning, task decomposition |
| `researcher` | Research and analysis | Technology research, feasibility studies |

### Specialized Development (8)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `backend-dev` | Backend development (APIs, databases) | REST APIs, GraphQL, microservices |
| `mobile-dev` | Mobile app development | iOS, Android, React Native |
| `ml-developer` | Machine learning and AI | Model training, ML pipelines |
| `cicd-engineer` | CI/CD pipeline management | GitHub Actions, deployment automation |
| `api-docs` | API documentation generation | OpenAPI, Swagger, docs generation |
| `system-architect` | System architecture design | High-level design, architecture diagrams |
| `code-analyzer` | Static code analysis | Linting, security scans, complexity analysis |
| `base-template-generator` | Project template generation | Boilerplate creation, starter kits |

### Swarm Coordination (5)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `hierarchical-coordinator` | Hierarchical swarm coordination | Leader-follower patterns, tree topologies |
| `mesh-coordinator` | Peer-to-peer mesh coordination | Distributed swarms, resilient coordination |
| `adaptive-coordinator` | Dynamic topology adaptation | Self-organizing swarms, fault tolerance |
| `collective-intelligence-coordinator` | Hive-mind collective intelligence | Consensus building, emergent behavior |
| `swarm-memory-manager` | Shared swarm memory management | Context sharing, state synchronization |

### Consensus & Distributed (7)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `byzantine-coordinator` | Byzantine fault-tolerant coordination | Byzantine consensus, malicious node handling |
| `raft-manager` | Raft consensus protocol | Leader election, log replication |
| `gossip-coordinator` | Gossip protocol coordination | Eventual consistency, large-scale swarms |
| `consensus-builder` | Multi-agent consensus | Decision making, voting protocols |
| `crdt-synchronizer` | Conflict-free replicated data types | Distributed state, offline-first |
| `quorum-manager` | Quorum-based decision making | Majority voting, read/write quorums |
| `security-manager` | Security and access control | Authentication, authorization, encryption |

### Performance & Optimization (5)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `perf-analyzer` | Performance analysis | Profiling, bottleneck detection |
| `performance-benchmarker` | Benchmark execution and reporting | Load testing, performance regression |
| `task-orchestrator` | Task scheduling and orchestration | Workflow management, task dependencies |
| `memory-coordinator` | Memory optimization | Memory profiling, leak detection |
| `smart-agent` | Self-optimizing agent | Adaptive behavior, auto-tuning |

### GitHub & Repository (9)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `github-modes` | GitHub modes automation | PR templates, issue templates |
| `pr-manager` | Pull request management | PR creation, review, merge |
| `code-review-swarm` | Coordinated code reviews | Multi-agent reviews, consensus |
| `issue-tracker` | GitHub issue tracking | Issue creation, triage, closing |
| `release-manager` | Release management | Version tagging, release notes, publishing |
| `workflow-automation` | GitHub Actions automation | Workflow creation, CI/CD setup |
| `project-board-sync` | Project board synchronization | Kanban automation, status updates |
| `repo-architect` | Repository architecture design | Monorepo setup, module structure |
| `multi-repo-swarm` | Multi-repository coordination | Cross-repo changes, dependency updates |

### SPARC Methodology (6)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `sparc-coord` | SPARC workflow coordination | Full SPARC pipeline orchestration |
| `sparc-coder` | SPARC-aware coder | TDD implementation, specification-driven coding |
| `specification` | Specification generation | Requirements analysis, user stories |
| `pseudocode` | Pseudocode design | Algorithm design, logic planning |
| `architecture` | Architecture design | System design, component diagrams |
| `refinement` | Refinement and iteration | Code refactoring, optimization |

### Testing & Validation (2)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `tdd-london-swarm` | TDD London School (mock-first) | Outside-in TDD, test doubles |
| `production-validator` | Production validation | Smoke tests, health checks |

### Migration & Planning (2)
| Agent | Description | Primary Use Case |
|-------|-------------|------------------|
| `migration-planner` | Migration planning | Database migrations, API versioning |
| `swarm-init` | Swarm initialization | Topology setup, agent spawning |

### Custom Agents (10+)
Custom agents can be added via:
- `npx agentic-flow agent create` (interactive)
- `agent_add` MCP tool (programmatic)
- Manual markdown in `.claude/agents/<category>/<name>.md`

---

## RuVector Integration (8 Packages)

### 1. @ruvector/core (v0.1.30)
**Purpose**: Core vector operations and data structures

**Features**:
- Vector creation and manipulation
- Similarity metrics (cosine, euclidean, dot product)
- Batch operations
- Type-safe vector interfaces

**Usage**:
```typescript
import { Vector, cosineSimilarity } from '@ruvector/core';

const v1 = Vector.from([0.1, 0.2, 0.3]);
const v2 = Vector.from([0.4, 0.5, 0.6]);
const similarity = cosineSimilarity(v1, v2);
```

### 2. @ruvector/attention (v0.1.31)
**Purpose**: Attention mechanisms for vector operations

**Features**:
- Softmax attention
- Scaled dot-product attention
- Multi-head attention
- Cross-attention
- Self-attention

**Usage**:
```typescript
import { SoftmaxAttention } from '@ruvector/attention';

const attention = new SoftmaxAttention();
const result = attention.forward(query, keys, values);
```

### 3. @ruvector/gnn (v0.1.23)
**Purpose**: Graph neural network operations

**Features**:
- Graph convolution layers
- Graph attention networks
- Message passing
- Node classification
- Link prediction

**Usage**:
```typescript
import { GraphConvLayer } from '@ruvector/gnn';

const gcn = new GraphConvLayer(inputDim, outputDim);
const transformed = gcn.forward(nodeFeatures, adjacencyMatrix);
```

### 4. @ruvector/graph-node (v0.1.15)
**Purpose**: Graph node management and traversal

**Features**:
- Node creation and management
- Edge management
- Graph traversal (BFS, DFS)
- Shortest path algorithms
- Centrality measures

**Usage**:
```typescript
import { Graph, Node } from '@ruvector/graph-node';

const graph = new Graph();
const node = graph.addNode('node1', { data: 'value' });
graph.addEdge('node1', 'node2', 0.8);
```

### 5. @ruvector/router (v0.1.15)
**Purpose**: Semantic routing and intent classification

**Features**:
- Intent-based routing
- Semantic similarity routing
- Multi-route support
- Dynamic route updates
- Fallback handling

**Usage**:
```typescript
import { SemanticRouter } from '@ruvector/router';

const router = new SemanticRouter();
router.addRoute('coding', 'Write code, implement features', codeHandler);
const route = router.route('Create a React component');
```

### 6. @ruvector/sona (v0.1.5)
**Purpose**: Trajectory storage and replay

**Features**:
- Trajectory recording
- Experience replay
- Trajectory search
- Policy learning
- Reward tracking

**Usage**:
```typescript
import { SonaTrajectory } from '@ruvector/sona';

const sona = new SonaTrajectory();
sona.recordStep(state, action, reward, nextState);
const similar = sona.searchTrajectories(query, 10);
```

### 7. @ruvector/rvf (Included in sona)
**Purpose**: RuVector format encoding/decoding

**Features**:
- Binary encoding
- Schema validation
- Compression
- Type preservation

**Usage**:
```typescript
import { RVFEncoder } from '@ruvector/rvf';

const encoder = new RVFEncoder();
const encoded = encoder.encode({ vectors: [...], metadata: {...} });
const decoded = encoder.decode(encoded);
```

### 8. ruvector (v0.1.24)
**Purpose**: Unified RuVector interface (75 versions behind v0.1.99)

**Note**: This is the main package that re-exports all sub-packages. Consider upgrading to v0.1.99 for latest features.

**Features**:
- Unified API across all RuVector packages
- Single import for all functionality
- Backward compatibility

**Usage**:
```typescript
import { Vector, SemanticRouter, Graph } from 'ruvector';
```

---

## Hooks System (17 Types)

### Pre-Operation Hooks (3)
| Hook | Trigger | Use Case |
|------|---------|----------|
| `pre-task` | Before task execution | Validation, resource allocation, planning |
| `pre-edit` | Before file edit | Backup, permission check, conflict detection |
| `pre-command` | Before CLI command | Security check, parameter validation |

### Post-Operation Hooks (3)
| Hook | Trigger | Use Case |
|------|---------|----------|
| `post-task` | After task completion | Cleanup, metrics recording, notification |
| `post-edit` | After file edit | Auto-format, linting, memory update |
| `post-command` | After CLI command | Logging, result caching, learning |

### Session Hooks (3)
| Hook | Trigger | Use Case |
|------|---------|----------|
| `session-start` | Session initialization | Context loading, resource setup |
| `session-end` | Session termination | State persistence, metrics export |
| `session-restore` | Session restoration | Context recovery, state reload |

### Routing Hooks (3)
| Hook | Trigger | Use Case |
|------|---------|----------|
| `route` | Task routing decision | Topology selection, agent assignment |
| `model-route` | Model selection | Cost optimization, capability matching |
| `model-outcome` | Model response received | Outcome logging, learning update |

### Intelligence Hooks (5)
| Hook | Trigger | Use Case |
|------|---------|----------|
| `intelligence` | General intelligence operation | Pattern recognition, prediction |
| `intelligence_learn` | Learning update | Pattern storage, policy update |
| `intelligence_attention` | Attention operation | Focus allocation, resource distribution |
| `intelligence_trajectory-start` | Trajectory recording start | Episode initialization |
| `intelligence_trajectory-step` | Trajectory step recorded | Step-by-step learning |
| `intelligence_trajectory-end` | Trajectory recording end | Episode finalization, reward assignment |

---

## Swarm Topologies (4 Types)

### 1. Mesh Topology
**Structure**: Peer-to-peer, all-to-all connections

**Characteristics**:
- Fully connected
- High resilience (no single point of failure)
- High communication overhead
- Ideal for: 3-10 agents, collaborative tasks

**Use Cases**:
- Code review swarms
- Consensus building
- Distributed decision making

**Configuration**:
```bash
npx agentic-flow swarm init --topology mesh --max-agents 8
```

### 2. Hierarchical Topology
**Structure**: Tree-like, leader-follower relationships

**Characteristics**:
- Clear hierarchy (coordinator → workers)
- Lower communication overhead
- Single point of failure (coordinator)
- Ideal for: Task decomposition, 5-50 agents

**Use Cases**:
- SPARC workflows (coordinator → spec/pseudo/arch agents)
- CI/CD pipelines (orchestrator → build/test/deploy agents)
- Large-scale feature development

**Configuration**:
```bash
npx agentic-flow swarm init --topology hierarchical --max-agents 20
```

### 3. Ring Topology
**Structure**: Circular, each agent connects to two neighbors

**Characteristics**:
- Token-passing coordination
- Predictable communication flow
- Moderate resilience
- Ideal for: Sequential processing, 3-15 agents

**Use Cases**:
- Pipeline processing (data → transform → validate → store)
- Sequential code refactoring
- Iterative optimization

**Configuration**:
```bash
npx agentic-flow swarm init --topology ring --max-agents 10
```

### 4. Star Topology
**Structure**: Central hub, all agents connect to hub

**Characteristics**:
- Centralized coordination
- Low communication overhead
- Single point of failure (hub)
- Ideal for: Centralized orchestration, 2-20 agents

**Use Cases**:
- API gateway pattern
- Load balancing
- Fan-out/fan-in patterns

**Configuration**:
```bash
npx agentic-flow swarm init --topology star --max-agents 15
```

---

## Integration Surfaces

### 1. GitHub Integration (8 Tools)
**Tools**: `github_repo_analyze`, `github_pr_manage`, `github_issue_track`, `github_workflow`, `github_metrics`, `github_branch_sync`, `github_release_manage`, `github_security_scan`

**Features**:
- Repository analysis and metrics
- PR creation, review, merge automation
- Issue tracking and triage
- GitHub Actions workflow management
- Branch synchronization with conflict resolution
- Release management and publishing
- Security scanning (Dependabot, code scanning)

**Use Cases**:
- Automated PR workflows
- Issue triage automation
- Release automation
- Multi-repo coordination

### 2. Neural/Learning Integration (10 Tools)
**Tools**: `neural_train`, `neural_predict`, `neural_status`, `neural_patterns`, `neural_compress`, `neural_optimize`, `learning_trajectory`, `learning_predict`, `daa_meta_learning`, `autopilot_learn`

**Features**:
- Model training and prediction
- Pattern discovery
- Model optimization (compression, quantization)
- Trajectory-based learning
- Meta-learning across agents
- Success pattern discovery

**Use Cases**:
- Adaptive agents
- Policy optimization
- Pattern-based automation
- Transfer learning

### 3. Performance Integration (15 Tools)
**Tools**: `performance_benchmark`, `performance_metrics`, `performance_profile`, `performance_optimize`, `performance_report`, `performance_bottleneck`, `token_usage`, `latency_analyze`, `throughput_measure`, `memory_profile`, `cpu_profile`, `network_profile`, `cache_stats`, `cache_clear`, `cache_optimize`

**Features**:
- Comprehensive benchmarking
- Real-time metrics collection
- Profiling (CPU, memory, network)
- Bottleneck detection
- Auto-optimization
- Token usage tracking
- Cache management

**Use Cases**:
- Performance regression detection
- Cost optimization
- Resource monitoring
- Production optimization

### 4. Workflow Integration (11 Tools)
**Tools**: `workflow_create`, `workflow_execute`, `workflow_status`, `workflow_cancel`, `workflow_pause`, `workflow_resume`, `workflow_list`, `workflow_delete`, `workflow_template`, `workflow_export`, `workflow_import`

**Features**:
- Workflow definition and execution
- Workflow templates
- Pause/resume support
- Import/export workflows
- Status monitoring

**Use Cases**:
- CI/CD pipelines
- Complex multi-step tasks
- Reusable workflows
- Workflow sharing

---

## Architecture Decision Records

### Implemented ADRs

#### ADR-051: MCP Tool Implementation Gap
**Date**: 2026-02-24
**Status**: Implemented
**Summary**: Identified 8.5% parity (18 of 213 documented MCP tools). Implemented 115+ new tools across 10 domains to reach 133+ tools.

#### ADR-052: CLI Tool Gap Remediation
**Date**: 2026-02-24
**Status**: Implemented
**Summary**: Fixed CLI entry point (agentic-flow vs @claude-flow/cli), implemented 11 CLI modules with 58+ subcommands.

#### ADR-053: Security Review Remediation
**Date**: 2026-02-24
**Status**: Implemented
**Summary**: Security hardening (input validation, secret detection, file path sanitization).

#### ADR-054: AgentDB v3 Architecture Review
**Date**: 2026-02-24
**Status**: Implemented
**Summary**: Added 6 missing controllers (CausalMemoryGraph, CausalRecall, ExplainableRecall, NightlyLearner, LearningSystem, ReasoningBank), exported in barrel files.

#### ADR-055: Documentation Implementation Parity
**Date**: 2026-02-24
**Status**: Implemented
**Summary**: Aligned documentation with actual implementation (CLI commands, MCP tools, agent types).

#### ADR-056: RVF RuVector Integration Roadmap
**Date**: 2026-02-24
**Status**: Implemented
**Summary**: Integrated @ruvector packages (core, attention, gnn, graph-node, router, sona, rvf) with 11 new MCP tools.

#### ADR-057: AgentDB RuVector v2 Integration
**Date**: 2026-02-24
**Status**: Implemented
**Summary**: Deep integration of RuVector backends with AgentDB controllers.

#### ADR-058: Autopilot Swarm Completion
**Date**: 2026-02-25
**Status**: Implemented
**Summary**: Persistent swarm completion via Stop hooks (Ralph Wiggum pattern). 9 CLI subcommands, 10 MCP tools, autopilot-hook.mjs.

#### ADR-059: AgentDB RuVector Deep Optimization
**Date**: 2026-02-25
**Status**: In Progress
**Summary**: Phase 1 - GuardedVectorBackend with proof-gated mutations, AttestationLog for audit trails.

#### ADR-060: AgentDB v3 Proof-Gated Graph Intelligence
**Date**: 2026-02-25
**Status**: In Progress
**Summary**: Proof-gated mutations with MutationGuard, GuardedVectorBackend, AttestationLog. Security hardening for vector operations.

#### ADR-061: Performance Benchmarks Optimization
**Date**: 2026-02-25
**Status**: In Progress
**Summary**: Comprehensive benchmark infrastructure, CI/CD integration, automated regression detection.

---

## Version History

### v1.10.3 (Current)
- 133+ MCP tools (86 core + 47 modular)
- 11 CLI modules (58+ subcommands)
- 27 AgentDB controllers
- 60+ agent types
- 8 RuVector packages integrated
- 17 hook types
- 4 swarm topologies
- Autopilot completion system (ADR-058)
- Proof-gated mutations (ADR-060)

### v1.9.4
- 75 MCP tools
- 8 CLI modules
- 21 AgentDB controllers
- Basic RuVector integration

### v1.8.0
- Initial MCP tool implementation
- Basic CLI commands
- Core AgentDB controllers

---

## License

MIT License - Copyright (c) 2024 ruv (https://github.com/ruvnet)

## Support

- **Repository**: https://github.com/ruvnet/agentic-flow
- **Issues**: https://github.com/ruvnet/agentic-flow/issues
- **Documentation**: https://github.com/ruvnet/agentic-flow#readme
- **Contact**: contact@ruv.io
