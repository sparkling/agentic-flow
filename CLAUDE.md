# Claude Code Configuration - Claude Flow V3

## Behavioral Rules (Always Enforced)

- ALWAYS implement fully — continue working until the task is 100% complete with zero remaining items
- NEVER leave partial implementations, stubs, or TODOs — finish everything before stopping
- When implementing a plan or ADR, complete ALL items end-to-end; do not stop at "phase 1" or "partial"
- If a task has multiple phases, implement ALL phases in sequence without waiting for user prompts
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Project Config

- **Topology**: hierarchical-mesh
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

## Build & Test

```bash
# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit .env files or any file containing secrets
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- Run `npx agentic-flow security scan` after security-related changes

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Task tool for spawning agents, not just MCP
- ALWAYS batch ALL todos in ONE TodoWrite call (5-10+ minimum)
- ALWAYS spawn ALL agents in ONE message with full instructions via Task tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Task tool
- Never use CLI tools alone for execution — Task tool agents do the actual work
- MUST call CLI tools AND Task tool in ONE message for complex work

### 3-Tier Model Routing (ADR-026)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Agent Booster (WASM) | <1ms | $0 | Simple transforms (var→const, add types) — Skip LLM |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- Always check for `[AGENT_BOOSTER_AVAILABLE]` or `[TASK_MODEL_RECOMMENDATION]` before spawning agents
- Use Edit tool directly when `[AGENT_BOOSTER_AVAILABLE]`

## Swarm Configuration & Anti-Drift

- ALWAYS use hierarchical topology for coding swarms
- Keep maxAgents at 6-8 for tight coordination
- Use specialized strategy for clear role boundaries
- Use `raft` consensus for hive-mind (leader maintains authoritative state)
- Run frequent checkpoints via `post-task` hooks
- Keep shared memory namespace for all agents

```bash
npx agentic-flow swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

## Swarm Execution Rules

- ALWAYS use `run_in_background: true` for all agent Task calls
- ALWAYS put ALL agent Task calls in ONE message for parallel execution
- After spawning, STOP — do NOT add more tool calls or check status
- Never poll TaskOutput or check swarm status — trust agents to return
- When agent results arrive, review ALL results before proceeding

## CLI Commands

### Core Commands

| Command | Subcommands | Status |
|---------|-------------|--------|
| `init` | 4 | [STABLE] CLI: config wizard |
| `agent` | 8 | [STABLE] CLI: 4 commands (list, create, info, conflicts) |
| `swarm` | 6 | [STABLE] CLI + MCP |
| `memory` | 11 | [STABLE] CLI + MCP |
| `task` | 6 | [STABLE] CLI + MCP |
| `session` | 7 | [STABLE] CLI + MCP |
| `hooks` | 17 | [STABLE] CLI + settings |
| `hive-mind` | 6 | [STABLE] CLI + MCP |
| `daemon` | 5 | [STABLE] CLI |
| `doctor` | 2 | [STABLE] CLI |
| `autopilot` | 6 | [STABLE] CLI + MCP (ADR-058) |

### Quick CLI Examples

```bash
npx agentic-flow init --wizard
npx agentic-flow agent spawn -t coder --name my-coder
npx agentic-flow swarm init
npx agentic-flow memory search --query "authentication patterns"
npx agentic-flow doctor --fix
npx agentic-flow autopilot status
npx agentic-flow autopilot config --max-iterations 100 --timeout 120
```

## Available Agents (60+ Types)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Specialized
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### Swarm Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`

### GitHub & Repository
`pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

### SPARC Methodology
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`

## Memory Commands Reference

```bash
# Store (REQUIRED: --key, --value; OPTIONAL: --namespace, --ttl, --tags)
npx agentic-flow memory store --key "pattern-auth" --value "JWT with refresh" --namespace patterns

# Search (REQUIRED: --query; OPTIONAL: --namespace, --limit, --threshold)
npx agentic-flow memory search --query "authentication patterns"

# List (OPTIONAL: --namespace, --limit)
npx agentic-flow memory list --namespace patterns --limit 10

# Retrieve (REQUIRED: --key; OPTIONAL: --namespace)
npx agentic-flow memory retrieve --key "pattern-auth" --namespace patterns
```

## Quick Setup

```bash
claude mcp add claude-flow -- npx -y claude-flow@alpha mcp start
npx agentic-flow doctor --fix
npx agentic-flow daemon start
```

## Claude Code vs CLI Tools

- Claude Code's Task tool handles ALL execution: agents, file ops, code generation, git
- CLI tools handle coordination via Bash: swarm init, memory, hooks, routing
- NEVER use CLI tools as a substitute for Task tool agents

## HuggingFace Chat UI with Embedded ruvllm

### Overview

The `packages/agentdb-chat-ui` package provides a full-featured chat interface powered by the embedded ruvllm backend. This is a self-contained chat system with a GGUF LLM (Qwen2 0.5B quantized) that runs entirely locally.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ HuggingFace Chat UI (SvelteKit)                             │
│ Port: 5173                                                  │
│ - Full-featured chat interface                              │
│ - Model selection dropdown                                  │
│ - Conversation management                                   │
│ - Tool calling support                                      │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP: OpenAI-compatible API
                  │ OPENAI_BASE_URL=http://localhost:3000/v1
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ RVF Backend (agentdb-chat)                                  │
│ Port: 3000                                                  │
│ - OpenAI-compatible endpoints (/v1/chat/completions)        │
│ - Model registry (/v1/models)                               │
│ - Embeddings endpoint (/v1/embeddings)                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
      ┌───────────┴───────────┐
      ▼                       ▼
┌─────────────────┐   ┌──────────────────┐
│ ruvltra-small   │   │ ruvllm-engine    │
│ (GGUF Model)    │   │ (Inference)      │
│                 │   │                  │
│ • 0.5B params   │   │ • SONA learning  │
│ • q4_k_m quant  │   │ • HNSW memory    │
│ • Tool support  │   │ • SIMD inference │
│ • Lazy-loaded   │   │ • FastGRNN route │
└─────────────────┘   └──────────────────┘
```

### Quick Start

#### 1. Install Dependencies

The following packages are required and should already be installed:

```bash
# Core dependencies (already in package.json)
npm install @ruvector/ruvllm@2.5.1      # ruvllm orchestration engine
npm install node-llama-cpp               # GGUF model loading
npm install @ruvector/rvf                # RVF format support
```

#### 2. Configure Environment

Create or update `packages/agentdb-chat-ui/.env.local`:

```env
OPENAI_BASE_URL=http://localhost:3000/v1
OPENAI_API_KEY=rvf-ruvllm-dev
MONGODB_URL=
```

**Important:** The base URL must include `/v1` because the HF UI appends `/models` to fetch the model list.

#### 3. Start RVF Backend

```bash
cd packages/agentdb-chat
node dist/bin/agentdb-chat.js serve --port 3000 --rvf chat.rvf --model ruvllm
```

The backend will:
- Start HTTP server on port 3000
- Load ruvllm engine (@ruvector/ruvllm)
- Lazy-load GGUF model on first inference (downloads if needed)
- Store model at `.models/ruvltra-small-0.5b-q4_k_m.gguf`

#### 4. Start HuggingFace Chat UI

```bash
cd packages/agentdb-chat-ui
npm run dev
```

The UI will:
- Start on port 5173
- Fetch models from RVF backend
- Display 2 available models in dropdown
- Enable chat with tool calling support

#### 5. Access the UI

Open http://localhost:5173 in your browser and start chatting!

### Available Models

| Model | Type | Size | Features | Use Case |
|-------|------|------|----------|----------|
| **ruvltra-small** | GGUF | 0.5B params (q4_k_m) | Tool calling, lazy-loaded | Primary text generation |
| **ruvllm-engine** | Inference | N/A | SONA learning, HNSW memory | RAG, semantic search |

### API Endpoints

The RVF backend exposes OpenAI-compatible endpoints:

```bash
# List models
GET http://localhost:3000/v1/models

# Chat completion
POST http://localhost:3000/v1/chat/completions
Content-Type: application/json

{
  "model": "ruvltra-small",
  "messages": [{"role": "user", "content": "Hello!"}],
  "max_tokens": 100
}

# Embeddings
POST http://localhost:3000/v1/embeddings
Content-Type: application/json

{
  "input": "text to embed",
  "model": "ruvllm-engine"
}

# Health check
GET http://localhost:3000/api/health
```

### Configuration Details

#### Environment Variables

**HuggingFace Chat UI** (`packages/agentdb-chat-ui/.env.local`):
- `OPENAI_BASE_URL` - Must be `http://localhost:3000/v1` (include /v1!)
- `OPENAI_API_KEY` - Any string (e.g., `rvf-ruvllm-dev`)
- `MONGODB_URL` - Leave empty for in-memory storage
- `MCP_SERVERS` - Optional MCP server configuration

**RVF Backend** (CLI flags):
- `--port` - HTTP server port (default: 3000)
- `--rvf` - Path to RVF store file (e.g., `chat.rvf`)
- `--model` - Model provider (`ruvllm`, `ruvbot`, or custom)
- `--openai-url` - Optional OpenAI-compatible API fallback
- `--openai-key` - API key for fallback endpoint

### GGUF Model Details

The ruvltra-small model is automatically downloaded on first inference:

**Model Specifications:**
- **Base Model:** Qwen2 0.5B
- **Quantization:** q4_k_m (4-bit quantization, k-means)
- **Size:** ~280 MB on disk
- **Location:** `packages/agentdb-chat/.models/ruvltra-small-0.5b-q4_k_m.gguf`
- **Loader:** node-llama-cpp
- **Context Size:** 2048 tokens (configurable)

**Loading Behavior:**
1. Server starts without loading GGUF (fast startup)
2. First chat request triggers lazy load
3. ModelDownloader checks for model in `.models/` directory
4. Downloads from ruvllm registry if missing
5. Caches loaded model in memory for subsequent requests

### Troubleshooting

#### "No models available" Error

**Symptom:** UI shows "No chat models are configured"

**Cause:** Environment variables not loaded correctly

**Solution:**
```bash
# 1. Verify .env.local has correct URL (must include /v1)
cd packages/agentdb-chat-ui
cat .env.local
# Should show: OPENAI_BASE_URL=http://localhost:3000/v1

# 2. Restart the UI to pick up changes
lsof -ti:5173 | xargs kill -9
npm run dev

# 3. Verify models endpoint
curl http://localhost:3000/v1/models
```

#### "Failed to fetch models: 404 Not Found"

**Symptom:** UI logs show `Failed to fetch http://localhost:3000/models: 404`

**Cause:** `OPENAI_BASE_URL` is missing `/v1` suffix

**Solution:**
```bash
# Update .env.local to include /v1
echo "OPENAI_BASE_URL=http://localhost:3000/v1" > .env.local
echo "OPENAI_API_KEY=rvf-ruvllm-dev" >> .env.local
echo "MONGODB_URL=" >> .env.local
```

#### "Cannot find package 'node-llama-cpp'"

**Symptom:** RVF backend logs show GGUF model load failed

**Cause:** node-llama-cpp not installed

**Solution:**
```bash
npm install node-llama-cpp --save
# Restart RVF backend
```

#### "Cannot find package '@ruvector/ruvllm'"

**Symptom:** Backend falls back to stub model

**Cause:** @ruvector/ruvllm not installed

**Solution:**
```bash
npm install @ruvector/ruvllm@2.5.1 --save
# Restart RVF backend
```

#### Models not appearing in UI dropdown

**Symptom:** UI loads but no models in dropdown

**Cause:** Models loaded but UI cache not refreshed

**Solution:**
```bash
# Hard refresh browser: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
# Or check developer console for errors
```

### Advanced Configuration

#### Custom GGUF Model

To use a different GGUF model:

```bash
# Place your model in .models/ directory
cp /path/to/your-model.gguf packages/agentdb-chat/.models/

# Start with --gguf-model flag
node dist/bin/agentdb-chat.js serve \
  --port 3000 \
  --rvf chat.rvf \
  --model ruvllm \
  --gguf-model "custom"
```

#### Memory Configuration

Control HNSW memory settings:

```typescript
// In ChatPersistence config
{
  dimension: 768,        // Embedding dimension
  metric: 'cosine',      // Distance metric
  maxElements: 10000,    // HNSW index capacity
}
```

#### External OpenAI API Fallback

Use external API when GGUF unavailable:

```bash
node dist/bin/agentdb-chat.js serve \
  --port 3000 \
  --rvf chat.rvf \
  --model ruvllm \
  --openai-url "https://api.openai.com/v1" \
  --openai-key "sk-..."
```

### File Structure

```
packages/
├── agentdb-chat/                 # RVF Backend
│   ├── src/
│   │   ├── ChatServer.ts         # HTTP server + routing
│   │   ├── ChatInference.ts      # Model loading + inference
│   │   ├── ChatPersistence.ts    # RVF storage + HNSW
│   │   └── bin/
│   │       └── agentdb-chat.ts   # CLI entry point
│   ├── chat.rvf                  # Binary vector store (18KB)
│   ├── .models/                  # GGUF model cache
│   │   └── ruvltra-small-0.5b-q4_k_m.gguf
│   └── .swarm/                   # HNSW index + memory.db
│       ├── hnsw.index            # Vector index (1.6MB)
│       └── memory.db             # SQLite persistence (152KB)
│
└── agentdb-chat-ui/              # HuggingFace Chat UI
    ├── src/
    │   ├── lib/
    │   │   ├── server/
    │   │   │   ├── models.ts     # Model registry + fetching
    │   │   │   ├── config.ts     # Environment loading
    │   │   │   └── endpoints/    # OpenAI client
    │   │   └── components/
    │   │       └── chat/         # Chat UI components
    │   └── routes/
    │       └── conversation/     # Chat page + streaming
    └── .env.local                # Environment configuration
```

### Health Monitoring

Check system health and stats:

```bash
curl http://localhost:3000/api/health | jq '.'
```

Response includes:
- **conversationCount**: Total conversations stored
- **messageCount**: Total messages in DB
- **vectorStats**: HNSW index statistics
- **ruvllm.ggufLoaded**: GGUF model load status
- **ruvllm.hasSimd**: SIMD acceleration available
- **sonaStats**: SONA learning statistics
- **federatedStats**: Federated learning stats

### Performance Notes

**First Request Latency:**
- Cold start (GGUF download): ~30-60 seconds
- Warm start (model cached): ~2-5 seconds
- Subsequent requests: ~200-500ms

**Memory Usage:**
- RVF Backend: ~200-400 MB (without GGUF)
- With GGUF loaded: ~500-800 MB
- HF UI (dev): ~100-200 MB

**Optimization Tips:**
1. Keep GGUF model cached in `.models/` directory
2. Use smaller context window if memory constrained
3. Enable SIMD for faster embeddings (auto-detected)
4. Monitor `ruvllm.cacheHitRate` in health endpoint

## Support

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues
