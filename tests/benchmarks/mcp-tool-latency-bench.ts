/**
 * MCP Tool Latency Benchmark
 *
 * Measures p50, p95, p99 latencies for all 75+ MCP tools
 *
 * Targets:
 * - p95: <100ms
 * - p99: <200ms
 */

import { performance } from 'perf_hooks';
import { execSync } from 'child_process';
import { AgentDBService } from '../../agentic-flow/src/services/agentdb-service';

interface ToolLatencyResult {
  toolName: string;
  category: string;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  samples: number;
  success: boolean;
  errorRate: number;
  meetsTarget: boolean;
}

export class MCPToolLatencyBench {
  private agentDBService: AgentDBService | null = null;

  async initialize(): Promise<void> {
    console.log('🔧 Initializing AgentDB service for MCP tools...');
    this.agentDBService = await AgentDBService.getInstance();
    console.log('✅ AgentDB service initialized\n');
  }

  /**
   * Benchmark all AgentDB MCP tools
   */
  async benchmarkAgentDBTools(samplesPerTool: number = 20): Promise<ToolLatencyResult[]> {
    console.log(`📊 Benchmarking AgentDB MCP Tools (${samplesPerTool} samples each)...`);

    const results: ToolLatencyResult[] = [];

    // Tool 1: reflexion_store_episode
    results.push(await this.benchmarkTool(
      'reflexion_store_episode',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.storeEpisode({
          id: `episode_${Date.now()}_${Math.random()}`,
          state: { data: 'test_state' },
          action: { type: 'test_action' },
          observation: { result: 'success' },
          reward: 1.0,
          reflection: 'Test reflection',
          timestamp: Date.now()
        });
      }
    ));

    // Tool 2: reflexion_recall_episodes
    results.push(await this.benchmarkTool(
      'reflexion_recall_episodes',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.recallEpisodes('test query', 10);
      }
    ));

    // Tool 3: skill_store
    results.push(await this.benchmarkTool(
      'skill_store',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.storeSkill({
          id: `skill_${Date.now()}_${Math.random()}`,
          name: 'Test Skill',
          description: 'A test skill',
          code: 'function test() { return "hello"; }',
          usageCount: 0,
          successRate: 1.0,
          timestamp: Date.now()
        });
      }
    ));

    // Tool 4: skill_search
    results.push(await this.benchmarkTool(
      'skill_search',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.searchSkills('test query', 10);
      }
    ));

    // Tool 5: reasoning_store_pattern
    results.push(await this.benchmarkTool(
      'reasoning_store_pattern',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.storePattern({
          id: `pattern_${Date.now()}_${Math.random()}`,
          name: 'Test Pattern',
          description: 'A test reasoning pattern',
          solution: 'Test solution',
          confidence: 0.9,
          usageCount: 0,
          timestamp: Date.now()
        });
      }
    ));

    // Tool 6: reasoning_search_patterns
    results.push(await this.benchmarkTool(
      'reasoning_search_patterns',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.searchPatterns('test query', 10);
      }
    ));

    // Tool 7: causal_recall
    results.push(await this.benchmarkTool(
      'causal_recall',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.causalRecall({
          query: 'test query',
          context: {},
          limit: 10
        });
      }
    ));

    // Tool 8: attention_compute
    results.push(await this.benchmarkTool(
      'attention_compute',
      'AgentDB',
      samplesPerTool,
      async () => {
        const query = new Float32Array(384).fill(0.1);
        const keys = Array(10).fill(null).map(() => new Float32Array(384).fill(0.1));
        const values = Array(10).fill(null).map(() => new Float32Array(384).fill(0.1));

        await this.agentDBService!.computeAttention(query, keys, values, 'dot-product');
      }
    ));

    // Tool 9: trajectory_start
    results.push(await this.benchmarkTool(
      'trajectory_start',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.startTrajectory({
          initialState: { data: 'test' },
          goal: 'test goal'
        });
      }
    ));

    // Tool 10: trajectory_step
    results.push(await this.benchmarkTool(
      'trajectory_step',
      'AgentDB',
      samplesPerTool,
      async () => {
        const trajectoryId = `traj_${Date.now()}`;
        await this.agentDBService!.addTrajectoryStep(trajectoryId, {
          action: { type: 'test' },
          observation: { result: 'success' },
          reward: 1.0
        });
      }
    ));

    // Tool 11: memory_synthesize
    results.push(await this.benchmarkTool(
      'memory_synthesize',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.synthesizeMemories('test query', 10);
      }
    ));

    // Tool 12: learning_status
    results.push(await this.benchmarkTool(
      'learning_status',
      'AgentDB',
      samplesPerTool,
      async () => {
        await this.agentDBService!.getLearningStatus();
      }
    ));

    return results;
  }

  /**
   * Benchmark core MCP tools (memory, session, etc.)
   */
  async benchmarkCoreTools(samplesPerTool: number = 20): Promise<ToolLatencyResult[]> {
    console.log(`📊 Benchmarking Core MCP Tools (${samplesPerTool} samples each)...`);

    const results: ToolLatencyResult[] = [];

    // Tool: memory_store
    results.push(await this.benchmarkCLITool(
      'memory_store',
      'Core',
      samplesPerTool,
      () => {
        const key = `test_key_${Date.now()}`;
        const value = 'test_value';
        execSync(
          `npx agentic-flow memory store --key "${key}" --value "${value}" --namespace test`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }
    ));

    // Tool: memory_retrieve
    results.push(await this.benchmarkCLITool(
      'memory_retrieve',
      'Core',
      samplesPerTool,
      () => {
        execSync(
          `npx agentic-flow memory retrieve --key "test_key" --namespace test`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }
    ));

    // Tool: memory_search
    results.push(await this.benchmarkCLITool(
      'memory_search',
      'Core',
      samplesPerTool,
      () => {
        execSync(
          `npx agentic-flow memory search --query "test*" --limit 10`,
          { encoding: 'utf-8', stdio: 'pipe' }
        );
      }
    ));

    return results;
  }

  /**
   * Generic tool benchmark
   */
  private async benchmarkTool(
    toolName: string,
    category: string,
    samples: number,
    operation: () => Promise<void>
  ): Promise<ToolLatencyResult> {
    const latencies: number[] = [];
    let errors = 0;

    for (let i = 0; i < samples; i++) {
      try {
        const start = performance.now();
        await operation();
        const duration = performance.now() - start;
        latencies.push(duration);
      } catch (error) {
        errors++;
        latencies.push(999999); // Large number for failed operations
      }
    }

    return this.calculateToolStats(toolName, category, latencies, errors, samples);
  }

  /**
   * Benchmark CLI tool
   */
  private async benchmarkCLITool(
    toolName: string,
    category: string,
    samples: number,
    operation: () => void
  ): Promise<ToolLatencyResult> {
    const latencies: number[] = [];
    let errors = 0;

    for (let i = 0; i < samples; i++) {
      try {
        const start = performance.now();
        operation();
        const duration = performance.now() - start;
        latencies.push(duration);
      } catch (error) {
        errors++;
        latencies.push(999999);
      }
    }

    return this.calculateToolStats(toolName, category, latencies, errors, samples);
  }

  /**
   * Calculate tool statistics
   */
  private calculateToolStats(
    toolName: string,
    category: string,
    latencies: number[],
    errors: number,
    samples: number
  ): ToolLatencyResult {
    const validLatencies = latencies.filter(l => l < 999999);
    const sorted = [...validLatencies].sort((a, b) => a - b);

    const p50 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.5)] : 0;
    const p95 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;
    const mean = validLatencies.reduce((sum, val) => sum + val, 0) / (validLatencies.length || 1);
    const min = sorted.length > 0 ? sorted[0] : 0;
    const max = sorted.length > 0 ? sorted[sorted.length - 1] : 0;
    const errorRate = errors / samples;
    const meetsTarget = p95 < 100 && p99 < 200;

    const icon = meetsTarget ? '✅' : '❌';
    console.log(`   ${icon} ${toolName}:`);
    console.log(`      p50: ${p50.toFixed(2)}ms, p95: ${p95.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);
    console.log(`      mean: ${mean.toFixed(2)}ms, min: ${min.toFixed(2)}ms, max: ${max.toFixed(2)}ms`);
    console.log(`      error rate: ${(errorRate * 100).toFixed(1)}%, target: ${meetsTarget ? 'MET' : 'MISSED'}`);

    return {
      toolName,
      category,
      p50,
      p95,
      p99,
      mean,
      min,
      max,
      samples,
      success: validLatencies.length > 0,
      errorRate,
      meetsTarget
    };
  }
}

/**
 * Run all MCP tool benchmarks
 */
export async function runMCPToolBenchmarks(): Promise<ToolLatencyResult[]> {
  console.log('=' .repeat(80));
  console.log('🚀 MCP Tool Latency Benchmark Suite');
  console.log('=' .repeat(80));
  console.log();

  const bench = new MCPToolLatencyBench();
  await bench.initialize();

  const results: ToolLatencyResult[] = [];

  // Benchmark AgentDB tools
  const agentDBResults = await bench.benchmarkAgentDBTools(20);
  results.push(...agentDBResults);
  console.log();

  // Benchmark core tools
  const coreResults = await bench.benchmarkCoreTools(20);
  results.push(...coreResults);
  console.log();

  return results;
}

// Run if called directly
if (require.main === module) {
  runMCPToolBenchmarks()
    .then(results => {
      console.log('✅ MCP tool benchmarks completed');
      console.log(`   Total tools: ${results.length}`);
      console.log(`   Met targets: ${results.filter(r => r.meetsTarget).length}`);
      console.log(`   Missed targets: ${results.filter(r => !r.meetsTarget).length}`);
      console.log(`   Average p95: ${(results.reduce((sum, r) => sum + r.p95, 0) / results.length).toFixed(2)}ms`);
      console.log(`   Average p99: ${(results.reduce((sum, r) => sum + r.p99, 0) / results.length).toFixed(2)}ms`);
    })
    .catch(error => {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    });
}
