# ADR-058: Autopilot Persistent Swarm Completion

## Status

**Implemented** (2026-02-25)

## Date

2026-02-24

## Context

When orchestrating multi-agent swarms, agents may exit prematurely before all tasks are complete. This results in partial implementations, orphaned tasks, and the need for manual re-engagement. The problem is especially acute for complex tasks that span many files and require iterative refinement.

The "Autopilot" pattern — inspired by the "Ralph Wiggum" persistent loop popularized by Geoffrey Huntley and Anthropic's Boris Cherny — solves this by intercepting agent exit events via Claude Code's **Stop hooks**. When an agent attempts to stop, the hook checks whether all tasks are genuinely complete. If not, it re-injects the remaining task context to keep the agent working.

### Research Sources

- [The Register: Ralph Wiggum loop for Claude Code](https://www.theregister.com/2026/01/27/ralph_wiggum_claude_loops/)
- [VentureBeat: How Ralph Wiggum became the biggest name in AI](https://venturebeat.com/technology/how-ralph-wiggum-went-from-the-simpsons-to-the-biggest-name-in-ai-right-now/)
- [GitHub: snarktank/ralph](https://github.com/snarktank/ralph) — Original implementation
- [GitHub: frankbria/ralph-claude-code](https://github.com/frankbria/ralph-claude-code) — Refined version
- [Anthropic claude-code/plugins/ralph-wiggum](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md) — Official plugin
- [DEV Community: Running AI Coding Agents for Hours](https://dev.to/sivarampg/the-ralph-wiggum-approach-running-ai-coding-agents-for-hours-not-minutes-57c1)
- [Alibaba Cloud: From ReAct to Ralph Loop](https://www.alibabacloud.com/blog/from-react-to-ralph-loop-a-continuous-iteration-paradigm-for-ai-agents_602799)

### Key Principles

1. **Stop Hook Interception**: Claude Code's `Stop` hook fires when an agent is about to exit. A script can inspect the task list and either allow the stop or produce output that re-engages the agent.
2. **Task List as Source of Truth**: The swarm's task list (or a file-based checklist) is the single source of truth for completion. The hook reads it and determines whether pending tasks remain.
3. **Configurable Limits**: To prevent runaway loops, the system enforces a maximum iteration count and a wall-clock timeout.
4. **Graceful Degradation**: If the max iterations or timeout is reached, the hook exits cleanly and logs what remains.

## Decision

Implement an **Autopilot Swarm Completion System** consisting of:

1. **`.claude/helpers/autopilot-hook.mjs`** — Stop hook script that:
   - Reads the task list from `~/.claude/tasks/{team-name}/` or `.claude-flow/swarm-tasks.json`
   - Counts pending/in-progress vs completed tasks
   - If incomplete tasks remain AND iteration count < max (default 50) AND elapsed time < timeout (default 4h):
     - Prints a re-engagement prompt listing remaining tasks
     - This output is injected back into the agent context, keeping it running
   - If all tasks are complete OR limits are reached:
     - Prints a completion summary and allows the agent to stop

2. **`agentic-flow/src/coordination/swarm-completion.ts`** — TypeScript service that:
   - Tracks swarm completion state (tasks, iterations, start time)
   - Provides `isComplete()`, `getRemainingTasks()`, `getProgress()` methods
   - Integrates with the existing self-improvement pipeline for learning from completion patterns

3. **Settings integration** — New `Stop` hook entry in `.claude/settings.json` that triggers the autopilot-hook

## Architecture

```
┌───────────────────────────────────────────────┐
│                Agent Running                   │
│                                                │
│  ┌─────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Task 1  │  │ Task 2   │  │ Task N       │ │
│  │  Done   │  │   WIP    │  │  Pending     │ │
│  └─────────┘  └──────────┘  └──────────────┘ │
│                                                │
│  Agent signals STOP                            │
│  ─────────────────┐                            │
│                    ▼                            │
│  ┌─────────────────────────────────────────┐  │
│  │ Stop Hook: autopilot-hook.mjs           │  │
│  │                                         │  │
│  │ 1. Read task list                       │  │
│  │ 2. Check: all complete?                 │  │
│  │ 3. Check: under max iterations?         │  │
│  │ 4. Check: under time limit?             │  │
│  │                                         │  │
│  │ If incomplete → print remaining tasks   │  │
│  │   → agent continues working             │  │
│  │                                         │  │
│  │ If complete → print summary             │  │
│  │   → agent stops gracefully              │  │
│  └─────────────────────────────────────────┘  │
│                                                │
└───────────────────────────────────────────────┘
```

## Configuration

```json
{
  "claudeFlow": {
    "autopilot": {
      "enabled": true,
      "maxIterations": 50,
      "timeoutMinutes": 240,
      "taskSources": ["team-tasks", "swarm-tasks", "file-checklist"],
      "completionCriteria": "all-tasks-done",
      "logFile": ".claude-flow/data/autopilot-log.json"
    }
  }
}
```

## Consequences

### Positive

- Swarms run to completion without manual intervention
- Complex multi-phase tasks are fully implemented end-to-end
- Reduces context-switching overhead for operators
- Integrates with existing hook infrastructure (Stop hooks)
- Configurable safety limits prevent runaway execution

### Negative

- Higher token consumption per session (agents run longer)
- Requires careful tuning of max iterations to avoid cost overruns
- Stop hook adds latency to every agent exit check (~100ms)

### Risks

- **Infinite loop**: Mitigated by maxIterations and timeoutMinutes
- **Stale tasks**: Hook checks real task state, not cached
- **Cost**: Configurable limits; operators can set conservative defaults

## Implementation

### Phase 1: Stop Hook (autopilot-hook.mjs)
- Read task files from team/swarm directories
- Count task states, enforce limits
- Print re-engagement prompt or completion summary

### Phase 2: TypeScript Service (swarm-completion.ts)
- Track completion state, provide programmatic API
- Integrate with self-improvement pipeline

### Phase 3: Settings Integration
- Add Stop hook to settings.json
- Add `autopilot` config section to `claudeFlow`

## Progress

- [x] ADR written and accepted
- [x] autopilot-hook.mjs Stop hook implemented
- [x] swarm-completion.ts TypeScript service implemented
- [x] Settings.json updated with Stop hook + autopilot config
- [x] CLI module: `autopilot-cli.ts` (status/enable/disable/config/reset/log)
- [x] MCP tools: `autopilot-tools.ts` (7 tools: autopilot_status/enable/disable/config/reset/log/progress)
- [x] CLI routing in cli-proxy.ts (`npx agentic-flow autopilot <cmd>`)
- [x] MCP registration in stdio-full.ts (82 total tools)
- [x] Tests: 45 passing (32 coordinator + 13 CLI/MCP)
