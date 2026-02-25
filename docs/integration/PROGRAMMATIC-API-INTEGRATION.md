# Agentic-Flow programmatic API — integration guide

**Audience:** Integrators, build systems, IDEs, CI, and AI agents that need to drive agentic-flow in-process via a typed API. This doc is structured for quick scanning and copy-paste integration.

---

## 1. Entry point (library-safe)

**Do not** `import 'agentic-flow'` for library use — that runs the CLI and starts servers.

**Do** import from the orchestration subpath (side-effect-free):

```ts
import { createOrchestrationClient } from 'agentic-flow/orchestration';
```

- **Entry:** `agentic-flow/orchestration`
- **Behavior on import:** None. No CLI, no health server, no agent execution.
- **Use when:** Your app or agent needs to start runs, poll status, cancel, or use memory from Node.js in the same process.

---

## 2. Preferred interface: generic client

One object handles run lifecycle and memory. Create it once; use it for the duration of your integration.

### Create client

```ts
import { createOrchestrationClient } from 'agentic-flow/orchestration';

const client = createOrchestrationClient({ config: { backend: 'safe-exec' } });
// backend: 'safe-exec' (default) or 'test'
```

### Start a run

```ts
const { runId } = await client.startRun({
  taskDescription: 'Implement feature X; run tests and lint.',
  cwd: '/path/to/repo',                    // optional
  memorySeed: [                            // optional: preload context
    { key: 'ctx', value: 'ref-123', namespace: 'app', metadata: {} },
  ],
  acceptanceCriteria: ['Tests pass', 'Lint clean'],  // optional
  allowedPaths: ['src/'],                  // optional
  forbiddenPaths: ['dist/'],                // optional
  provenance: { runId: 'build-1', cardId: 'card-42' }, // optional
  loopPolicy: {                             // optional
    maxIterations: 5,
    successCriteria: { tests: true, lint: true },
    retryPolicy: { maxAttempts: 2, backoffMs: 500 },
    budgetLimits: { timeMs: 120_000 },
  },
});
// → { runId: string }
```

### Get status

```ts
const status = await client.getStatus(runId);
// → { runId, status, progress, error?, finished?, summary?, commits? }
// status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown'
```

### Cancel (best-effort)

```ts
const result = await client.cancel(runId);
// → { success: boolean, error?: string }
```

### Memory (same runId)

```ts
// Seed more context during/after run
await client.seed(runId, [{ key: 'k', value: 'context', metadata: {} }]);

// Record a learning (included in harvest)
await client.recordLearning(runId, 'Pattern: prefer X when Y', 0.9, { step: 1 });

// Search run-scoped or global memory
const hits = await client.search({ runId }, 'query', 10);
// or client.search('global', 'query', 10);

// Harvest all run-scoped entries + learnings (e.g. after run completes)
const { entries, learnings } = await client.harvest(runId);
```

---

## 3. Client API reference (quick lookup)

| Method | Purpose |
|--------|--------|
| `client.startRun(input)` | Start a run; returns `{ runId }`. Input: taskDescription, cwd?, memorySeed?, acceptanceCriteria?, allowedPaths?, forbiddenPaths?, provenance?, loopPolicy?. |
| `client.getStatus(runId)` | Get run status (status, progress, error?, finished?, summary?, commits?). |
| `client.cancel(runId)` | Best-effort cancel; returns `{ success, error? }`. |
| `client.seed(runId, entries)` | Seed run-scoped memory (entries: `{ key?, value, metadata? }[]`). |
| `client.recordLearning(runId, learning, score?, provenance?)` | Record a learning for the run (included in harvest). |
| `client.search(scope, query, topK)` | Search memory. Scope: `{ runId }` or `'global'`. Returns `{ value, score?, metadata? }[]`. |
| `client.harvest(runId)` | Get all run-scoped entries and learnings. Returns `{ entries, learnings }`. |

---

## 4. When to use client vs low-level API

- **Use the client** when you want one object for run + memory and a stable input shape (StartRunInput). Recommended for build systems, IDEs, CI, and agents.
- **Use the low-level API** when you need direct control: `createOrchestrator`, `orchestrateTask`, `getRunStatus`, `cancelRun`, `getRunArtifacts`, `seedMemory`, `recordLearning`, `searchMemory`, `harvestMemory`. Same entry: `agentic-flow/orchestration`.

Full low-level surface and types: [Orchestration API & Memory Plane](../architecture/orchestration-memory-plane.md).

---

## 5. Minimal integration example

```ts
import { createOrchestrationClient } from 'agentic-flow/orchestration';

const client = createOrchestrationClient({ config: { backend: 'safe-exec' } });
const { runId } = await client.startRun({
  taskDescription: 'Your task here',
  acceptanceCriteria: ['Tests pass'],
  allowedPaths: ['src/'],
});
let status = await client.getStatus(runId);
while (status.status === 'running' || status.status === 'queued') {
  await new Promise((r) => setTimeout(r, 2000));
  status = await client.getStatus(runId);
}
const { entries, learnings } = await client.harvest(runId);
```

---

## 6. Related

- **#110** — Library-unsafe main entry; this subpath fixes it.
- **Orchestration API & Memory Plane** — [docs/architecture/orchestration-memory-plane.md](../architecture/orchestration-memory-plane.md).
