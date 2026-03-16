/**
 * AgentDB Integration for Agentic-Flow
 * Replaces in-memory Maps with persistent AgentDB-backed storage.
 * Falls back to in-memory Maps when AgentDB is unavailable.
 */

// Lazy-loaded AgentDB controller constructors
let ReflexionMemoryClass: any = null;
let SkillLibraryClass: any = null;
let ReasoningBankClass: any = null;
let EmbeddingServiceClass: any = null;
let createDatabaseFn: any = null;

// In-memory fallback stores (used when AgentDB is unavailable)
const episodeStore = new Map<string, any[]>();
const skillStore = new Map<string, any[]>();
const patternStore = new Map<string, any>();

async function loadAgentDB(): Promise<boolean> {
  try {
    const agentdb = await import('agentdb');
    ReflexionMemoryClass = agentdb.ReflexionMemory;
    SkillLibraryClass = agentdb.SkillLibrary;
    ReasoningBankClass = agentdb.ReasoningBank;
    EmbeddingServiceClass = agentdb.EmbeddingService;
    createDatabaseFn = agentdb.createDatabase;
    return true;
  } catch {
    return false;
  }
}

export class AgentDBIntegration {
  private reflexion: any = null;
  private skills: any = null;
  private reasoning: any = null;
  private initialized = false;
  private useAgentDB = false;

  /**
   * Initialize with real AgentDB controllers, falling back to in-memory Maps.
   */
  async initialize(dbPath?: string): Promise<boolean> {
    if (this.initialized) return this.useAgentDB;

    const loaded = await loadAgentDB();
    if (loaded && createDatabaseFn && EmbeddingServiceClass) {
      try {
        const db = await createDatabaseFn(dbPath || ':memory:');
        const embedder = new EmbeddingServiceClass();

        if (ReflexionMemoryClass) {
          this.reflexion = new ReflexionMemoryClass(db, embedder);
        }
        if (SkillLibraryClass) {
          this.skills = new SkillLibraryClass(db, embedder);
        }
        if (ReasoningBankClass) {
          this.reasoning = new ReasoningBankClass(db, embedder);
        }

        this.useAgentDB = true;
      } catch {
        // AgentDB init failed, use fallback Maps
        this.useAgentDB = false;
      }
    }

    this.initialized = true;
    return this.useAgentDB;
  }

  /**
   * Store an episode (task execution record) for reflexion learning.
   */
  async storeEpisode(episode: {
    taskType: string;
    agentType: string;
    actions: string[];
    outcome: string;
    reward: number;
  }): Promise<void> {
    if (this.reflexion) {
      try {
        await this.reflexion.storeEpisode({
          sessionId: `session-${Date.now()}`,
          task: `${episode.taskType}:${episode.agentType}`,
          input: JSON.stringify(episode.actions),
          output: episode.outcome,
          reward: episode.reward,
          success: episode.reward > 0.5,
          metadata: { taskType: episode.taskType, agentType: episode.agentType },
        });
        return;
      } catch { /* fall through to Map */ }
    }

    const key = episode.taskType;
    const existing = episodeStore.get(key) || [];
    existing.push({ ...episode, timestamp: Date.now() });
    episodeStore.set(key, existing);
  }

  /**
   * Recall episodes similar to a query string.
   */
  async recallSimilarEpisodes(query: string, limit = 5): Promise<any[]> {
    if (this.reflexion) {
      try {
        const results = await this.reflexion.retrieveRelevant({
          task: query,
          k: limit,
        });
        return results;
      } catch { /* fall through to Map */ }
    }

    // Fallback: linear scan with simple word overlap
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const scored: { episode: any; score: number }[] = [];

    for (const episodes of episodeStore.values()) {
      for (const ep of episodes) {
        const text = `${ep.taskType} ${ep.agentType} ${ep.outcome}`.toLowerCase();
        const words = text.split(/\s+/);
        const overlap = words.filter(w => queryWords.has(w)).length;
        if (overlap > 0) {
          scored.push({ episode: ep, score: overlap / queryWords.size });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.episode);
  }

  /**
   * Publish a reusable skill to the library.
   */
  async publishSkill(skill: {
    name: string;
    code: string;
    taskType: string;
    successRate: number;
    agentType: string;
  }): Promise<void> {
    if (this.skills) {
      try {
        await this.skills.createSkill({
          name: skill.name,
          description: `${skill.taskType} skill for ${skill.agentType}`,
          code: skill.code,
          successRate: skill.successRate,
          metadata: { taskType: skill.taskType, agentType: skill.agentType },
        });
        return;
      } catch { /* fall through to Map */ }
    }

    const key = skill.taskType;
    const existing = skillStore.get(key) || [];
    existing.push({ ...skill, timestamp: Date.now() });
    skillStore.set(key, existing);
  }

  /**
   * Find skills applicable to a task description.
   */
  async findApplicableSkills(description: string, limit = 3): Promise<any[]> {
    if (this.skills) {
      try {
        const results = await this.skills.retrieveSkills({
          task: description,
          k: limit,
        });
        return results;
      } catch { /* fall through to Map */ }
    }

    // Fallback: linear scan with word overlap
    const queryWords = new Set(description.toLowerCase().split(/\s+/));
    const scored: { skill: any; score: number }[] = [];

    for (const skills of skillStore.values()) {
      for (const sk of skills) {
        const text = `${sk.name} ${sk.taskType} ${sk.agentType}`.toLowerCase();
        const words = text.split(/\s+/);
        const overlap = words.filter(w => queryWords.has(w)).length;
        scored.push({ skill: sk, score: overlap / Math.max(queryWords.size, 1) });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.skill);
  }

  /**
   * Store a reasoning pattern by key.
   */
  async storePattern(key: string, pattern: any): Promise<void> {
    if (this.reasoning) {
      try {
        await this.reasoning.storePattern({
          taskType: key,
          approach: typeof pattern === 'string' ? pattern : JSON.stringify(pattern),
          successRate: pattern.successRate ?? 0.5,
          tags: pattern.tags ?? [key],
          metadata: typeof pattern === 'object' ? pattern : { value: pattern },
        });
        return;
      } catch { /* fall through to Map */ }
    }

    patternStore.set(key, { ...pattern, timestamp: Date.now() });
  }

  /**
   * Search reasoning patterns by query string.
   */
  async searchPatterns(query: string, limit = 10): Promise<any[]> {
    if (this.reasoning) {
      try {
        const results = await this.reasoning.searchPatterns({
          task: query,
          k: limit,
        });
        return results;
      } catch { /* fall through to Map */ }
    }

    // Fallback: linear scan over patternStore
    const queryLower = query.toLowerCase();
    const matches: any[] = [];

    for (const [key, pattern] of patternStore.entries()) {
      const text = `${key} ${JSON.stringify(pattern)}`.toLowerCase();
      if (text.includes(queryLower) || queryLower.split(/\s+/).some(w => text.includes(w))) {
        matches.push({ key, ...pattern });
      }
    }

    return matches.slice(0, limit);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isUsingAgentDB(): boolean {
    return this.useAgentDB;
  }
}

export const agentDBIntegration = new AgentDBIntegration();
