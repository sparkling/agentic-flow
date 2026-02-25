# Orchestration API & Memory Plane

## Library-safe programmatic API

**Use this entry from another Node application** when you need the orchestration API (createOrchestrator, orchestrateTask, getRunStatus, cancelRun) **without** starting the CLI, health server, or any agent run.

```ts
import {
  createOrchestrator,
  getRunStatus,
  cancelRun,
  getRunArtifacts,
  seedMemory,
  searchMemory,
  type Orchestrator,
  type RunHandle,
  type RunStatus,
  type OrchestrateTaskInput,
} from 'agentic-flow/orchestration';

const orchestrator = createOrchestrator({ backend: 'test' });
const { runId } = await orchestrator.orchestrateTask({
  description: 'Your task description',
  initialMemoryEntries: [{ key: 'ctx', value: 'some context', metadata: {} }],
});
const status = await getRunStatus(runId);
```

- **Entry:** `agentic-flow/orchestration` — side-effect-free; no CLI, no servers, no agent execution on import.
- **Do not** use the default entry (`import 'agentic-flow'`) for library use; it runs the CLI and starts servers.

See [Orchestration Runtime API](#orchestration-runtime-api) and [Memory Plane Contract](#memory-plane-contract) below for the full surface.

### Generic orchestration client

For a stable input/output shape (task description, memory seed, acceptance criteria, paths, provenance → runId, status, cancel), use the generic client. Map your app payload to `StartRunInput`; use the returned `runId` for `getStatus` and `cancel`.

```ts
import {
  createOrchestrationClient,
  type StartRunInput,
} from 'agentic-flow/orchestration';

const client = createOrchestrationClient({ config: { backend: 'test' } });
const { runId } = await client.startRun({
  taskDescription: 'Implement feature X',
  cwd: '/path/to/repo',
  memorySeed: [{ key: 'ctx', value: 'ref-123', namespace: 'app' }],
  acceptanceCriteria: ['Tests pass', 'Lint clean'],
  allowedPaths: ['src/'],
  forbiddenPaths: ['dist/'],
  provenance: { runId: 'build-1', cardId: 'card-42' },
});
const status = await client.getStatus(runId);
await client.cancel(runId); // best-effort
```

- **`createOrchestrationClient(options)`** — Returns `OrchestrationClient` with `startRun`, `getStatus`, `cancel`.
- **`StartRunInput`** — taskDescription, cwd?, memorySeed?, acceptanceCriteria?, allowedPaths?, forbiddenPaths?, provenance?.
- **`ClientRunStatus`** — runId, status (queued|running|completed|failed|cancelled|unknown), progress, error?, finished?, summary?, commits?.

---

## Overview

The stable programmatic orchestration API provides a **non–MCP-only** surface for running tasks and managing run lifecycle and memory. The **memory plane** defines explicit methods so that vector memorization and run context are **guaranteed** and callable from code, not only via prompts.

## Orchestration Runtime API

- **`createOrchestrator(config)`** — Factory; config includes `backend` (e.g. `'safe-exec'`, `'test'`).
- **`orchestrator.orchestrateTask(input)`** — Returns `Promise<RunHandle>`; starts a run (handle contains `runId`).
- **`getRunStatus(runId)`** — Returns `RunStatus` (phase, progress, error?, finished?).
- **`cancelRun(runId)`** — Best-effort cancel; no-op when backend does not support it.
- **`getRunArtifacts(runId)`** — Returns `RunArtifacts` (commits?, testLogs?, memoryWrites?).

Loop controls (PR2) are part of the task input: **`loopPolicy`** with `maxIterations`, `successCriteria`, `retryPolicy`, `budgetLimits`. Behavior depends on the backend.

## Memory Plane Contract

Explicit methods (not prompt-only):

| Method | Purpose |
|--------|--------|
| **`seedMemory(runId, entries[])`** | Preload run context. Entries are stored in a run-scoped namespace so the run sees them. Guaranteed. |
| **`recordLearning(runId, learning, score?, provenance?)`** | Record a learning/pattern for the run (e.g. for ReasoningBank/pattern store with runId in metadata). |
| **`searchMemory(scope, query, topK)`** | Scope is `{ runId }` (run-scoped) or `'global'`. Returns `Array<{ value, score?, metadata? }>`. |

- **Run-scoped**: Only data seeded or recorded for that `runId` is visible when scope is `{ runId }`.
- **Global**: All stored entries and learnings across runs (implementation-dependent).
- Backend mapping: The default in-repo implementation uses an in-memory store. Production can wire to AgentDB, ReasoningBank, or key-value memory (e.g. claude-flow memory) with run-scoped namespaces or metadata.

## Run Lifecycle Integration

- **`OrchestrateTaskInput.initialMemoryEntries`** — Optional. When provided, the orchestrator calls `seedMemory(runId, initialMemoryEntries)` before starting the task so context is guaranteed for the run.

## References

- Plan: Stable Programmatic Orchestration API (PR1–PR3).
- **Library entry:** `import … from 'agentic-flow/orchestration'` — use this for in-process orchestration from build systems, IDEs, CI, or other Node apps ([#110](https://github.com/ruvnet/agentic-flow/issues/110)).
- **Integration guide (agent-friendly):** [Programmatic API Integration](../integration/PROGRAMMATIC-API-INTEGRATION.md) — entry point, client API reference, when to use client vs low-level API, minimal examples for easy integration.
- SDK: `agentic-flow/sdk` also re-exports orchestration (and other integrations); for orchestration-only usage, `agentic-flow/orchestration` is the minimal, side-effect-free entry.
- MCP/CLI: Existing tools remain; they can be refactored to call this API for a single code path.
