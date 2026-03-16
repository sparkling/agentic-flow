# API Design Guidelines
**AgentDB v3.0 & Agentic Flow MCP Tools**

Generated: 2026-02-25
Status: **APPROVED** for v3.x development

---

## 1. Method Naming Conventions

### 1.1 CRUD Operations

| Operation | Preferred Verbs | Examples | Avoid |
|-----------|----------------|----------|-------|
| **Create** | `create`, `store`, `add` | `createSkill()`, `storeEpisode()`, `addCausalEdge()` | `save`, `insert`, `new` |
| **Read** | `get`, `retrieve`, `search` | `getPattern()`, `retrieveSkills()`, `searchPatterns()` | `fetch`, `find`, `load` |
| **Update** | `update` | `updatePatternStats()`, `updateSkillStats()` | `modify`, `change`, `set` |
| **Delete** | `delete`, `prune`, `remove` | `deletePattern()`, `pruneSkills()` | `destroy`, `erase` |
| **List** | `list`, `getAll` | `listSessions()` | `fetchAll`, `getMany` |

**Rule 1.1.1**: Use `store` for initial persistence, `create` for object construction
**Rule 1.1.2**: Use `get` for single items by ID, `retrieve` for filtered queries
**Rule 1.1.3**: Use `search` for semantic/similarity-based queries
**Rule 1.1.4**: Use `prune` for bulk cleanup based on criteria

### 1.2 Controller Method Patterns

#### **Synchronous Methods**
```typescript
// GOOD: Clear, imperative naming
getPattern(patternId: number): ReasoningPattern | null
getPatternStats(): PatternStats
updateConfig(config: Partial<RerankConfig>): void

// BAD: Inconsistent naming
fetchPattern(id: number)  // Use 'get' instead
saveConfig(config)        // Use 'update' instead
```

#### **Asynchronous Methods**
```typescript
// GOOD: Async operations return Promises
async storePattern(pattern: ReasoningPattern): Promise<number>
async searchPatterns(query: PatternSearchQuery): Promise<ReasoningPattern[]>
async trainGNN(options?: { epochs?: number }): Promise<{ epochs: number; finalLoss: number }>

// BAD: Missing return types, unclear promises
async storePattern(pattern)  // No return type
async search(query)          // Too generic
```

---

## 2. Parameter Patterns

### 2.1 Parameter Ordering

**Standard Order**:
1. Required parameters (by importance)
2. Optional parameters
3. Configuration objects

```typescript
// GOOD: Logical parameter ordering
async recall(
  queryId: string,          // 1. Primary identifier
  queryText: string,         // 2. Main input
  k: number = 12,           // 3. Common option with default
  requirements?: string[],   // 4. Optional params
  accessLevel: 'public' | 'internal' = 'internal'  // 5. Optional with default
): Promise<CausalRecallResult>

// BAD: Mixed optional/required params
async recall(
  k: number = 12,           // Optional first (confusing)
  queryId: string,
  queryText: string
)
```

### 2.2 Options Objects

For methods with >3 parameters, use an options object:

```typescript
// GOOD: Options object for complex parameters
async getMetrics(options: {
  sessionId?: string;
  timeWindowDays?: number;
  includeTrends?: boolean;
  groupBy?: 'task' | 'session' | 'skill';
}): Promise<MetricsResult>

// BAD: Long parameter list
async getMetrics(
  sessionId?: string,
  timeWindowDays?: number,
  includeTrends?: boolean,
  groupBy?: 'task' | 'session' | 'skill'
)
```

### 2.3 Backward Compatibility

Support both v1 and v2 APIs using optional parameters:

```typescript
// GOOD: V1/V2 compatibility
export interface SkillQuery {
  task?: string;      // v2 API
  query?: string;     // v1 API (alias for task)
  k?: number;
}

// In implementation:
const taskQuery = query.task || query.query;
if (!taskQuery) {
  throw new Error('SkillQuery must provide either task (v2) or query (v1)');
}
```

---

## 3. Return Value Structures

### 3.1 Success Response Pattern

**Consistent Structure**:
```typescript
{
  success: true,
  data: T,           // Actual payload
  metadata?: {       // Optional metadata
    timestamp?: number,
    duration?: number,
    version?: string
  }
}
```

**Example**:
```typescript
// GOOD: Structured response
interface CausalRecallResult {
  candidates: RerankCandidate[];
  certificate: RecallCertificate;
  queryId: string;
  totalLatencyMs: number;
  metrics: {
    vectorSearchMs: number;
    causalLookupMs: number;
    rerankMs: number;
    certificateMs: number;
  };
}

// BAD: Flat, unstructured
interface RecallResult {
  candidates: any[];
  certificate: any;
  queryId: string;
  latency: number;
  vectorMs: number;
  causalMs: number;
  // Mixed concerns
}
```

### 3.2 Error Response Pattern

**Controller Methods**: Throw typed errors
```typescript
// GOOD: Throw descriptive errors
if (!session) {
  throw new Error(`Session not found: ${sessionId}`);
}

if (session.status !== 'active') {
  throw new Error(`Session not active: ${sessionId} (status: ${session.status})`);
}
```

**MCP Tools**: Return JSON with error flag
```typescript
// GOOD: Structured error response
return JSON.stringify({
  success: false,
  error: error.message,
  timestamp: new Date().toISOString()
}, null, 2);

// BAD: Throwing errors in MCP tools (breaks MCP protocol)
throw new Error('Something failed');
```

### 3.3 Return Types

**Explicit Types Always**:
```typescript
// GOOD: Explicit return types
async getPattern(id: number): Promise<ReasoningPattern | null>
getPatternStats(): PatternStats
updateConfig(config: Partial<Config>): void

// BAD: Implicit return types
async getPattern(id: number) {  // What does it return?
  return this.db.prepare('...').get(id);
}
```

---

## 4. TypeScript Type Usage

### 4.1 Interfaces vs Types

**Use Interfaces For**:
- Public API contracts
- Extensible structures
- Class implementations

```typescript
// GOOD: Interface for public API
export interface ReasoningPattern {
  id?: number;
  taskType: string;
  approach: string;
  successRate: number;
  metadata?: Record<string, any>;
}

export interface PatternSearchQuery {
  task?: string;
  taskEmbedding?: Float32Array;
  k?: number;
  filters?: {
    taskType?: string;
    minSuccessRate?: number;
  };
}
```

**Use Types For**:
- Unions and intersections
- Utility types
- Complex computed types

```typescript
// GOOD: Type for unions
type SessionStatus = 'active' | 'completed' | 'failed';
type MemoryType = 'episode' | 'skill' | 'pattern';

// GOOD: Type for intersections
type EpisodeWithEmbedding = Episode & { embedding?: Float32Array; similarity?: number };
```

### 4.2 Generic Type Parameters

**Consistent Naming**:
- `T` - Primary type parameter
- `K` - Key type
- `V` - Value type
- `R` - Return type

```typescript
// GOOD: Clear generic usage
interface SearchResult<T> {
  id: string;
  data: T;
  similarity: number;
}

// GOOD: Multiple type parameters
async batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>
): Promise<R[]>
```

---

## 5. Async/Await Patterns

### 5.1 Always Use Async/Await

```typescript
// GOOD: Async/await for all async operations
async storeEpisode(episode: Episode): Promise<number> {
  const taskEmbedding = await this.embedder.embed(episode.task);
  const nodeId = await this.graphBackend.storeEpisode(episode, taskEmbedding);
  return parseInt(nodeId.split('-').pop() || '0', 36);
}

// BAD: Promise chains
storeEpisode(episode: Episode): Promise<number> {
  return this.embedder.embed(episode.task)
    .then(embedding => this.graphBackend.storeEpisode(episode, embedding))
    .then(nodeId => parseInt(nodeId.split('-').pop() || '0', 36));
}
```

### 5.2 Error Handling

```typescript
// GOOD: Try-catch for async operations
async searchWithFallback(query: string): Promise<Result[]> {
  try {
    return await this.vectorBackend.search(query);
  } catch (error) {
    console.warn('[Service] Vector search failed, falling back to SQL');
    return await this.sqlSearch(query);
  }
}

// BAD: Unhandled promise rejections
async search(query: string) {
  return this.vectorBackend.search(query);  // No error handling
}
```

---

## 6. Documentation Standards

### 6.1 JSDoc Comments

**Required For**:
- All public methods
- All interfaces
- Complex algorithms

```typescript
/**
 * Search patterns by semantic similarity
 *
 * v1 (legacy): Uses SQLite with cosine similarity computation
 * v2 (VectorBackend): Uses high-performance vector search (8x faster)
 * v2 + GNN: Optionally enhances query with learned patterns
 *
 * @param query - Search query parameters
 * @param query.task - Task string to search for (v1 API)
 * @param query.taskEmbedding - Pre-computed embedding (v2 API)
 * @param query.k - Number of results to return (default: 10)
 * @param query.threshold - Minimum similarity threshold (default: 0.0)
 * @param query.useGNN - Enable GNN enhancement (default: false)
 * @returns Array of matching patterns with similarity scores
 * @throws Error if neither task nor taskEmbedding is provided
 */
async searchPatterns(query: PatternSearchQuery): Promise<ReasoningPattern[]>
```

### 6.2 Inline Comments

```typescript
// GOOD: Explain WHY, not WHAT
// Use reward as weight - higher reward patterns are more important
weights.push(Math.max(0.1, ep.reward));

// BAD: Obvious comments
// Push to weights array
weights.push(Math.max(0.1, ep.reward));
```

---

## 7. MCP Tool Specific Guidelines

### 7.1 Tool Parameter Validation

Use Zod schemas for all MCP tool parameters:

```typescript
// GOOD: Comprehensive Zod schema
server.addTool({
  name: 'neural_train',
  description: 'Train the learning system on trajectory data (state-action-reward sequences)',
  parameters: z.object({
    steps: z.array(z.object({
      state: z.string().describe('State description'),
      action: z.string().describe('Action taken'),
      reward: z.number().describe('Reward signal'),
      nextState: z.string().optional().describe('Resulting state'),
    })).min(1).describe('Training trajectory steps'),
    totalReward: z.number().describe('Total trajectory reward'),
  }),
  execute: async ({ steps, totalReward }) => { /* ... */ }
});
```

### 7.2 Tool Naming Convention

Pattern: `category_action`

```typescript
// GOOD: Consistent naming
neural_train
neural_predict
neural_status
ruvector_search
ruvector_attention
memory_store
memory_search

// BAD: Inconsistent naming
trainNeural
predict
statusCheck
search_ruvector
```

### 7.3 Tool Response Format

**Always return JSON strings**:

```typescript
// GOOD: Structured JSON response
return JSON.stringify({
  success: true,
  data: {
    stepsProcessed: steps.length,
    totalReward,
    trained: true
  },
  timestamp: new Date().toISOString()
}, null, 2);

// BAD: Plain text or mixed responses
return `Processed ${steps.length} steps`;
```

---

## 8. Testing Requirements

### 8.1 Unit Test Patterns

```typescript
describe('ReasoningBank', () => {
  it('should store and retrieve patterns with embeddings', async () => {
    const pattern = {
      taskType: 'code_review',
      approach: 'Use static analysis first',
      successRate: 0.85
    };

    const patternId = await bank.storePattern(pattern);
    expect(patternId).toBeGreaterThan(0);

    const retrieved = bank.getPattern(patternId);
    expect(retrieved).toBeDefined();
    expect(retrieved?.taskType).toBe('code_review');
  });
});
```

### 8.2 Integration Test Patterns

```typescript
describe('CausalRecall Integration', () => {
  it('should perform end-to-end recall with certificate', async () => {
    const result = await causalRecall.recall(
      'query-123',
      'Find authentication patterns',
      5
    );

    expect(result.candidates).toHaveLength(5);
    expect(result.certificate).toBeDefined();
    expect(result.certificate.issuer).toBe('ExplainableRecall');
    expect(result.totalLatencyMs).toBeGreaterThan(0);
  });
});
```

---

## 9. Migration Checklist

When updating existing APIs:

- [ ] Maintain backward compatibility (v1 API support)
- [ ] Add deprecation warnings for old patterns
- [ ] Update JSDoc with version notes
- [ ] Add migration examples in docs
- [ ] Update integration tests
- [ ] Bump minor version (v3.x.0 → v3.x+1.0)

---

## 10. Code Review Checklist

Before merging API changes:

- [ ] All methods have explicit return types
- [ ] Async methods use `async`/`await` consistently
- [ ] Error messages are descriptive and actionable
- [ ] JSDoc comments are complete
- [ ] Parameters follow naming conventions
- [ ] Options objects used for >3 parameters
- [ ] MCP tools return JSON strings
- [ ] Tests cover happy path and error cases
- [ ] No `any` types in public APIs
- [ ] Interfaces preferred over types for public APIs

---

## Examples from Codebase

### ✅ GOOD Examples

**ReasoningBank** - Clean async patterns, typed returns:
```typescript
async storePattern(pattern: ReasoningPattern): Promise<number> {
  const embedding = await this.embedder.embed(
    `${pattern.taskType}: ${pattern.approach}`
  );
  // ... implementation
  return patternId;
}
```

**CausalRecall** - Structured response object:
```typescript
async recall(
  queryId: string,
  queryText: string,
  k: number = 12
): Promise<CausalRecallResult> {
  return {
    candidates: topK,
    certificate,
    queryId,
    totalLatencyMs,
    metrics
  };
}
```

**SkillLibrary** - V1/V2 compatibility:
```typescript
export interface SkillQuery {
  task?: string;      // v2 API
  query?: string;     // v1 API (alias)
  k?: number;
}
```

### ❌ BAD Examples (To Avoid)

**Mixed naming conventions**:
```typescript
// Inconsistent: fetch vs get vs retrieve
fetchPattern(id: number)
getSkill(id: number)
retrieveEpisode(id: number)
```

**Unclear return types**:
```typescript
// What does this return?
async search(query) {
  return this.db.prepare('...').all();
}
```

**Long parameter lists**:
```typescript
// Use options object instead
async process(
  id: string,
  type: string,
  config: Config,
  timeout: number,
  retry: boolean,
  cache: boolean,
  validate: boolean
)
```

---

**Document Version**: 1.0
**Last Updated**: 2026-02-25
**Maintainer**: API Design Review Team
