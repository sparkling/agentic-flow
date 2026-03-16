# API Refactoring Recommendations
**AgentDB v3.0 & Agentic Flow MCP Tools**

Generated: 2026-02-25
Priority: **HIGH** for v3.1.0 release

---

## Executive Summary

Based on comprehensive analysis of 21 AgentDB controllers and 18 MCP tools (3,704 lines), this document identifies specific API inconsistencies and provides actionable refactoring recommendations.

**Key Findings**:
- ✅ **80% consistency** in async/await patterns
- ⚠️ **Mixed naming conventions** across controllers (get/fetch/retrieve)
- ⚠️ **Inconsistent error handling** patterns (throw vs return)
- ❌ **Missing return types** in ~15% of public methods
- ❌ **V1/V2 API compatibility** incomplete in some controllers

---

## 1. Naming Inconsistencies

### 1.1 Get vs Retrieve vs Fetch

**Current State**:
```typescript
// ReasoningBank
getPattern(patternId: number): ReasoningPattern | null
getPatternStats(): PatternStats

// ReflexionMemory
async retrieveRelevant(query: ReflexionQuery): Promise<EpisodeWithEmbedding[]>
async getRecentEpisodes(sessionId: string): Promise<Episode[]>

// SkillLibrary
async retrieveSkills(query: SkillQuery): Promise<Skill[]>
async searchSkills(query: SkillQuery): Promise<Skill[]>  // Alias
```

**❌ Problem**: Three methods doing the same thing with different names
- `retrieveRelevant()` - semantic search
- `retrieveSkills()` - semantic search
- `searchSkills()` - alias for `retrieveSkills()`

**✅ Recommendation**: Standardize to `search` for semantic queries

```typescript
// REFACTOR TO:

// ReasoningBank
async searchPatterns(query: PatternSearchQuery): Promise<ReasoningPattern[]>
getPattern(patternId: number): ReasoningPattern | null  // OK - single item by ID

// ReflexionMemory
async searchEpisodes(query: ReflexionQuery): Promise<EpisodeWithEmbedding[]>
async getRecentEpisodes(sessionId: string): Promise<Episode[]>  // OK - recent items

// SkillLibrary
async searchSkills(query: SkillQuery): Promise<Skill[]>
// Remove retrieveSkills() alias in v4.0
```

**Priority**: Medium
**Breaking Change**: Yes (deprecate in v3.1, remove in v4.0)

---

### 1.2 Store vs Save vs Create

**Current State**:
```typescript
// ReasoningBank
async storePattern(pattern: ReasoningPattern): Promise<number>

// ReflexionMemory
async storeEpisode(episode: Episode): Promise<number>

// SkillLibrary
async createSkill(skill: Skill): Promise<number>
```

**❌ Problem**: Inconsistent verb usage for similar operations

**✅ Recommendation**: Use `store` for initial persistence, `create` for construction

```typescript
// KEEP AS IS (already consistent):
async storePattern(pattern: ReasoningPattern): Promise<number>
async storeEpisode(episode: Episode): Promise<number>
async storeSkill(skill: Skill): Promise<number>  // Rename createSkill()

// Use 'create' only for constructors/factories:
createSession(): Session
createExperiment(config: ExperimentConfig): Experiment
```

**Priority**: Low
**Breaking Change**: Yes (alias old method)

---

## 2. Parameter Inconsistencies

### 2.1 Query Parameter Patterns

**Current State**:
```typescript
// PatternSearchQuery - clean options object
interface PatternSearchQuery {
  task?: string;
  taskEmbedding?: Float32Array;
  k?: number;
  threshold?: number;
  useGNN?: boolean;
  filters?: {
    taskType?: string;
    minSuccessRate?: number;
  };
}

// ReflexionQuery - flat structure
interface ReflexionQuery {
  task: string;
  currentState?: string;
  k?: number;
  minReward?: number;
  onlyFailures?: boolean;
  onlySuccesses?: boolean;
  timeWindowDays?: number;
}

// SkillQuery - minimal
interface SkillQuery {
  task?: string;
  query?: string;  // v1 API
  k?: number;
  minSuccessRate?: number;
}
```

**❌ Problem**: Three different patterns for similar search operations

**✅ Recommendation**: Standardize to nested options

```typescript
// REFACTOR TO: Common base interface
interface BaseSearchQuery<T = any> {
  query: string;              // Primary search text
  embedding?: Float32Array;   // Pre-computed embedding (optimization)
  k?: number;                 // Results count (default: 10)
  threshold?: number;         // Min similarity (default: 0.0)
  filters?: T;               // Type-specific filters
  options?: {                // Advanced options
    useGNN?: boolean;
    preferRecent?: boolean;
    includeEvidence?: boolean;
  };
}

// Specific implementations
interface PatternSearchQuery extends BaseSearchQuery<{
  taskType?: string;
  minSuccessRate?: number;
  tags?: string[];
}> {}

interface EpisodeSearchQuery extends BaseSearchQuery<{
  minReward?: number;
  onlyFailures?: boolean;
  onlySuccesses?: boolean;
  timeWindowDays?: number;
}> {}

interface SkillSearchQuery extends BaseSearchQuery<{
  minSuccessRate?: number;
}> {}
```

**Priority**: High
**Breaking Change**: Yes (v3.1 with deprecated aliases)

---

### 2.2 Optional Parameter Placement

**Current State**:
```typescript
// CausalRecall - good pattern
async recall(
  queryId: string,
  queryText: string,
  k: number = 12,                    // Optional with default
  requirements?: string[],            // Optional
  accessLevel: 'public' | 'internal' = 'internal'
): Promise<CausalRecallResult>

// LearningSystem - inconsistent
async getMetrics(options: {
  sessionId?: string;
  timeWindowDays?: number;
  includeTrends?: boolean;
  groupBy?: 'task' | 'session' | 'skill';
}): Promise<any>  // ❌ 'any' return type
```

**✅ Recommendation**: Keep CausalRecall pattern, fix LearningSystem

```typescript
// REFACTOR LearningSystem to:
interface MetricsOptions {
  sessionId?: string;
  timeWindowDays?: number;
  includeTrends?: boolean;
  groupBy?: 'task' | 'session' | 'skill';
}

interface MetricsResult {
  timeWindow: { days: number; startTimestamp: number; endTimestamp: number };
  overall: { totalEpisodes: number; avgReward: number; successRate: number };
  groupedMetrics: Array<{ key: string; count: number; avgReward: number }>;
  trends: Array<{ date: string; count: number; avgReward: number }>;
  policyImprovement: { versions: number; qValueImprovement: number };
}

async getMetrics(options?: MetricsOptions): Promise<MetricsResult>
```

**Priority**: High (fix `any` return type)
**Breaking Change**: No (internal change only)

---

## 3. Return Value Inconsistencies

### 3.1 Success/Failure Patterns

**Current State**:
```typescript
// Controllers: Throw errors
if (!session) {
  throw new Error(`Session not found: ${sessionId}`);
}

// MCP Tools: Return JSON
return JSON.stringify({
  success: false,
  error: 'Session not found',
  timestamp: new Date().toISOString()
}, null, 2);
```

**✅ Status**: **CORRECT** - Different layers, different patterns
**No Action Required**

---

### 3.2 Missing Return Types

**Current State**:
```typescript
// ❌ BAD: Implicit 'any' return
async getMetrics(options: { /* ... */ }) {
  return {
    timeWindow: { /* ... */ },
    overall: { /* ... */ }
  };
}

// ❌ BAD: Missing Promise wrapper
async explainAction(options: { /* ... */ }) {
  return {
    query,
    recommendations,
    reasoning
  };
}
```

**✅ Recommendation**: Add explicit return types

```typescript
// REFACTOR TO:
interface MetricsResult {
  timeWindow: TimeWindow;
  overall: OverallMetrics;
  groupedMetrics: GroupedMetric[];
  trends: TrendData[];
  policyImprovement: PolicyImprovement;
}

async getMetrics(options?: MetricsOptions): Promise<MetricsResult>

// REFACTOR TO:
interface ActionExplanation {
  query: string;
  recommendations: Recommendation[];
  reasoning: ReasoningData;
  causalChains?: CausalChain[];
  allEvidence?: Evidence[];
}

async explainAction(options: ExplainOptions): Promise<ActionExplanation>
```

**Priority**: **CRITICAL**
**Breaking Change**: No (type-only change)
**Files to Update**:
- `/workspaces/agentic-flow/packages/agentdb/src/controllers/LearningSystem.ts` (lines 853-986)
- `/workspaces/agentic-flow/packages/agentdb/src/controllers/LearningSystem.ts` (lines 1132-1245)

---

### 3.3 Metadata Inclusion

**Current State**:
```typescript
// ReasoningBank - includes metadata
interface ReasoningPattern {
  id?: number;
  taskType: string;
  approach: string;
  successRate: number;
  uses?: number;
  avgReward?: number;
  tags?: string[];
  metadata?: Record<string, any>;  // ✅ Good
  createdAt?: number;               // ✅ Good
  similarity?: number;              // ✅ Good (for search results)
}

// Episode - missing created/updated timestamps
interface Episode {
  id?: number;
  ts?: number;  // ❌ Ambiguous name
  sessionId: string;
  task: string;
  reward: number;
  success: boolean;
  // ❌ Missing: createdAt, updatedAt
}
```

**✅ Recommendation**: Standardize timestamp fields

```typescript
// REFACTOR TO:
interface Episode {
  id?: number;
  sessionId: string;
  task: string;
  reward: number;
  success: boolean;

  // Timestamps (consistent naming)
  createdAt: number;     // Unix timestamp (ms)
  updatedAt?: number;    // Unix timestamp (ms)

  // Optional fields
  input?: string;
  output?: string;
  critique?: string;
  latencyMs?: number;
  tokensUsed?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

// Deprecate 'ts' in v4.0, keep as alias in v3.1
```

**Priority**: Medium
**Breaking Change**: Yes (deprecated alias)

---

## 4. Error Handling Patterns

### 4.1 Error Message Consistency

**Current State**:
```typescript
// GOOD examples
throw new Error(`Session not found: ${sessionId}`);
throw new Error(`Session not active: ${sessionId} (status: ${session.status})`);

// BAD examples
throw new Error('PatternSearchQuery must provide either task (v1) or taskEmbedding (v2)');
// ❌ Too long, should be split

throw new Error(`Unknown metric: ${metric}`);
// ❌ Should suggest valid options
```

**✅ Recommendation**: Standardize error messages

```typescript
// REFACTOR TO:
// 1. Resource not found
throw new Error(`${ResourceType} not found: ${id}`);
// Example: "Pattern not found: 123"

// 2. Invalid state
throw new Error(`${ResourceType} in invalid state: ${id} (expected: ${expected}, got: ${actual})`);
// Example: "Session in invalid state: abc-123 (expected: active, got: completed)"

// 3. Missing required parameter
throw new Error(`Missing required parameter: '${paramName}'. Provide either ${option1} or ${option2}.`);
// Example: "Missing required parameter: 'query'. Provide either task or taskEmbedding."

// 4. Invalid parameter value
throw new Error(`Invalid ${paramName}: '${value}'. Valid options: ${validOptions.join(', ')}`);
// Example: "Invalid metric: 'foo'. Valid options: cosine, euclidean, manhattan"
```

**Priority**: Low
**Breaking Change**: No (error message wording only)

---

### 4.2 Try-Catch Fallback Patterns

**Current State**:
```typescript
// GOOD: Graceful degradation with logging
if (this.vectorBackend) {
  try {
    return this.searchPatternsV2(enrichedQuery);
  } catch {
    // VectorBackend search failed — fall back to legacy SQLite search
    return this.searchPatternsLegacy(enrichedQuery);
  }
}

// ❌ BAD: Silent failure in NightlyLearner
for (const exp of runningExperiments) {
  try {
    this.causalGraph.calculateUplift(exp.id);
    completed++;
  } catch (error) {
    console.error(`   ⚠ Failed to calculate uplift for experiment ${exp.id}:`, error);
    // ❌ Swallows error without recovery strategy
  }
}
```

**✅ Recommendation**: Add recovery strategies

```typescript
// REFACTOR TO:
interface FailureStrategy {
  type: 'skip' | 'retry' | 'fallback' | 'abort';
  retries?: number;
  fallbackFn?: () => Promise<any>;
}

for (const exp of runningExperiments) {
  let attempt = 0;
  const maxRetries = 3;

  while (attempt < maxRetries) {
    try {
      this.causalGraph.calculateUplift(exp.id);
      completed++;
      break;
    } catch (error) {
      attempt++;
      console.warn(`   ⚠ Uplift calculation failed (attempt ${attempt}/${maxRetries}): ${error.message}`);

      if (attempt >= maxRetries) {
        console.error(`   ❌ Skipping experiment ${exp.id} after ${maxRetries} failed attempts`);
        failed.push({ id: exp.id, error: error.message });
      } else {
        await this.delay(1000 * attempt);  // Exponential backoff
      }
    }
  }
}

return { completed, failed };  // Return both success and failure counts
```

**Priority**: Medium
**Breaking Change**: No (internal improvement)

---

## 5. Type Definition Issues

### 5.1 Excessive Use of `any`

**Current Locations**:
```typescript
// Database type from db-fallback
type Database = any;  // ❌ Used in all controllers

// LearningSystem.ts
async getMetrics(options: { /* ... */ }): Promise<any>  // ❌ Line 853

// NightlyLearner.ts
metadata?: Record<string, any>  // ⚠️ Acceptable but can be improved
```

**✅ Recommendation**: Define proper Database interface

```typescript
// REFACTOR TO: packages/agentdb/src/types/database.ts
import type { Database as BetterSQLite3Database } from 'better-sqlite3';

export interface AgentDBDatabase {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  close(): void;
}

export interface Statement {
  run(...params: any[]): RunResult;
  get(...params: any[]): any;
  all(...params: any[]): any[];
  iterate(...params: any[]): IterableIterator<any>;
}

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

// Update all controllers:
import type { AgentDBDatabase } from '../types/database.js';

export class ReasoningBank {
  constructor(
    private db: AgentDBDatabase,  // ✅ Typed
    private embedder: EmbeddingService
  ) { /* ... */ }
}
```

**Priority**: High
**Breaking Change**: No (compatible with `better-sqlite3`)

---

### 5.2 Missing Interface Exports

**Current State**:
```typescript
// ❌ Not exported from index.ts
export interface LearnerConfig { /* ... */ }
export interface LearnerReport { /* ... */ }
export interface RerankConfig { /* ... */ }
export interface ActionPrediction { /* ... */ }
```

**✅ Recommendation**: Export all public interfaces

```typescript
// REFACTOR: packages/agentdb/src/controllers/index.ts
// Add missing exports
export type {
  LearnerConfig,
  LearnerReport,
  RerankConfig,
  RerankCandidate,
  CausalRecallResult,
  ActionPrediction,
  ActionFeedback,
  TrainingResult,
  LearningSession,
  LearningConfig,
} from './LearningSystem.js';

export type {
  PatternSearchQuery,
  PatternStats,
} from './ReasoningBank.js';

export type {
  EpisodeSearchQuery,  // Renamed from ReflexionQuery
  EpisodeWithEmbedding,
} from './ReflexionMemory.js';
```

**Priority**: High
**Breaking Change**: No (additive only)

---

## 6. MCP Tool Improvements

### 6.1 Inconsistent Naming

**Current State**:
```typescript
// RuVector tools - consistent
ruvector_search
ruvector_attention
ruvector_graph_query
ruvector_graph_create
ruvector_route
ruvector_benchmark

// Neural tools - missing prefixes
neural_train
neural_predict
neural_status
neural_explain
neural_trajectory_record
neural_reset
```

**✅ Status**: **ACCEPTABLE**
Tools follow `category_action` pattern consistently.

---

### 6.2 Missing Tools for Controllers

**Gap Analysis**:

| Controller | Methods | MCP Tools | Coverage |
|-----------|---------|-----------|----------|
| ReasoningBank | 9 | 0 | 0% ❌ |
| SkillLibrary | 12 | 0 | 0% ❌ |
| ReflexionMemory | 10 | 0 | 0% ❌ |
| CausalRecall | 4 | 0 | 0% ❌ |
| LearningSystem | 15 | 6 | 40% ⚠️ |
| NightlyLearner | 5 | 0 | 0% ❌ |

**✅ Recommendation**: Add missing MCP tools

```typescript
// NEW TOOLS NEEDED:

// reasoning-tools.ts
reasoning_store_pattern
reasoning_search_patterns
reasoning_get_stats
reasoning_record_outcome
reasoning_train_gnn

// skill-tools.ts
skill_create
skill_search
skill_update_stats
skill_consolidate
skill_get_plan

// episode-tools.ts  // Rename from reflexion
episode_store
episode_search
episode_get_stats
episode_get_critique
episode_get_strategies

// causal-tools.ts
causal_recall
causal_batch_recall
causal_update_config
causal_get_stats

// learner-tools.ts
learner_run
learner_discover
learner_consolidate
learner_update_config
```

**Priority**: **CRITICAL** for ADR-051 completion
**Estimated Effort**: 40 hours (8 tools/day)

---

## 7. Documentation Gaps

### 7.1 Missing Method Documentation

**Controllers Without Complete JSDoc**:
- `LearningSystem.ts` - 6/15 methods missing docs
- `NightlyLearner.ts` - 4/7 methods missing docs
- `CausalMemoryGraph.ts` - 5/8 methods missing docs

**✅ Recommendation**: Add JSDoc to all public methods

Priority: Medium

---

### 7.2 Incomplete Interface Documentation

**Interfaces Missing Descriptions**:
```typescript
// ❌ Missing interface-level docs
export interface ActionFeedback {
  sessionId: string;
  action: string;
  state: string;
  reward: number;
  nextState?: string;
  success: boolean;
  timestamp: number;
}

// ✅ Add comprehensive docs
/**
 * Feedback for a learning system action
 *
 * Used to update the policy after an action is executed,
 * enabling reinforcement learning updates.
 *
 * @see LearningSystem.submitFeedback
 */
export interface ActionFeedback {
  /** Session identifier for grouping related actions */
  sessionId: string;
  /** Action that was executed */
  action: string;
  /** State before the action was taken */
  state: string;
  /** Reward received after action (range: -1 to 1) */
  reward: number;
  /** Resulting state after action (optional for terminal states) */
  nextState?: string;
  /** Whether the action achieved its goal */
  success: boolean;
  /** Unix timestamp (milliseconds) when action was executed */
  timestamp: number;
}
```

**Priority**: Low
**Breaking Change**: No (documentation only)

---

## 8. Performance Optimization Opportunities

### 8.1 Prepared Statement Reuse

**Current State**:
```typescript
// ❌ BAD: Preparing statement inside loop
for (const pair of candidatePairs) {
  const existing = this.db.prepare(`
    SELECT id FROM causal_edges
    WHERE from_memory_id = ? AND to_memory_id = ?
  `).get(pair.from_id, pair.to_id);
}

// ✅ GOOD: Prepare once, reuse
const checkExistingStmt = this.db.prepare(`
  SELECT id FROM causal_edges
  WHERE from_memory_id = ? AND to_memory_id = ?
`);

for (const pair of candidatePairs) {
  const existing = checkExistingStmt.get(pair.from_id, pair.to_id);
}
```

**Locations to Fix**:
- `NightlyLearner.ts` - Line 346 ✅ **ALREADY FIXED**
- `CausalMemoryGraph.ts` - Line 245 ❌ **NEEDS FIX**
- `ReflexionMemory.ts` - Line 238 ❌ **NEEDS FIX**

**Priority**: High (performance impact)
**Breaking Change**: No (internal optimization)

---

### 8.2 Batch Operations

**Current State**:
```typescript
// ❌ BAD: Individual inserts in loop
for (const episode of episodes) {
  await this.storeEpisode(episode);
}

// ✅ GOOD: Batch insert
async storeEpisodesBatch(episodes: Episode[]): Promise<number[]> {
  const stmt = this.db.prepare(`
    INSERT INTO episodes (session_id, task, reward, success)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = this.db.transaction(() => {
    return episodes.map(ep => stmt.run(
      ep.sessionId,
      ep.task,
      ep.reward,
      ep.success ? 1 : 0
    ).lastInsertRowid as number);
  });

  return transaction();
}
```

**New Methods to Add**:
- `ReflexionMemory.storeEpisodesBatch()`
- `ReasoningBank.storePatternsBatch()`
- `SkillLibrary.createSkillsBatch()`

**Priority**: Medium
**Breaking Change**: No (new methods)

---

## 9. Implementation Plan

### Phase 1: Critical Fixes (Sprint 1)
- [ ] Fix `any` return types in LearningSystem
- [ ] Add missing interface exports
- [ ] Define proper Database interface
- [ ] Add prepared statement optimizations

**Estimated Effort**: 8 hours
**Target**: v3.0.1

### Phase 2: API Standardization (Sprint 2)
- [ ] Standardize search method naming (deprecate aliases)
- [ ] Implement BaseSearchQuery interface
- [ ] Fix timestamp field naming
- [ ] Add missing return type annotations

**Estimated Effort**: 16 hours
**Target**: v3.1.0

### Phase 3: MCP Tool Expansion (Sprint 3-5)
- [ ] Add 35+ missing MCP tools
- [ ] Implement batch operation methods
- [ ] Add comprehensive error recovery

**Estimated Effort**: 80 hours
**Target**: v3.2.0

### Phase 4: Documentation (Sprint 6)
- [ ] Complete JSDoc for all public methods
- [ ] Add interface-level documentation
- [ ] Create migration guide for deprecated APIs

**Estimated Effort**: 16 hours
**Target**: v3.2.0

---

## 10. Breaking Changes Summary

### v3.1.0 (Deprecations)
- `SkillLibrary.retrieveSkills()` → use `searchSkills()`
- `ReflexionMemory.retrieveRelevant()` → use `searchEpisodes()`
- `Episode.ts` field → use `createdAt`
- Add deprecation warnings (console.warn)

### v4.0.0 (Removals)
- Remove deprecated method aliases
- Remove deprecated field names
- Require explicit types (no `any` in public APIs)

---

**Document Version**: 1.0
**Last Updated**: 2026-02-25
**Reviewers**: API Design Team, AgentDB Maintainers
