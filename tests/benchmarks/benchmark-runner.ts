#!/usr/bin/env tsx
/**
 * Master Benchmark Runner
 *
 * Runs all performance benchmarks and generates comprehensive reports:
 * 1. Controller Operations
 * 2. MCP Tool Latency
 * 3. WASM Load Time
 * 4. Attention Mechanisms
 * 5. Memory Usage
 */

import * as fs from 'fs';
import * as path from 'path';
import { performance } from 'perf_hooks';
import { runControllerBenchmarks } from './controller-operations-bench';
import { runMCPToolBenchmarks } from './mcp-tool-latency-bench';
import { runWASMLoadBenchmarks } from './wasm-load-time-bench';
import { runAttentionBenchmarks } from './attention-mechanisms-bench';
import { runMemoryBenchmarks } from './memory-usage-bench';

interface BenchmarkSummary {
  timestamp: string;
  duration: number;
  totalBenchmarks: number;
  passedBenchmarks: number;
  failedBenchmarks: number;
  categories: {
    controllerOps: any;
    mcpTools: any;
    wasmLoad: any;
    attention: any;
    memory: any;
  };
  recommendations: string[];
}

export class MasterBenchmarkRunner {
  private outputDir: string;

  constructor(outputDir: string = 'tests/benchmarks/reports') {
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<BenchmarkSummary> {
    console.log('=' .repeat(100));
    console.log('🚀 Agentic Flow Integration Performance Benchmark Suite');
    console.log('=' .repeat(100));
    console.log();

    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    let totalBenchmarks = 0;
    let passedBenchmarks = 0;
    let failedBenchmarks = 0;

    // 1. Controller Operations
    console.log('\n' + '🔧 PHASE 1: Controller Operations'.padEnd(100, '─'));
    const controllerResults = await runControllerBenchmarks();
    totalBenchmarks += controllerResults.length;
    passedBenchmarks += controllerResults.filter(r => r.meetsTarget !== false).length;
    failedBenchmarks += controllerResults.filter(r => r.meetsTarget === false).length;

    // 2. MCP Tool Latency
    console.log('\n' + '🔌 PHASE 2: MCP Tool Latency'.padEnd(100, '─'));
    const mcpResults = await runMCPToolBenchmarks();
    totalBenchmarks += mcpResults.length;
    passedBenchmarks += mcpResults.filter(r => r.meetsTarget).length;
    failedBenchmarks += mcpResults.filter(r => !r.meetsTarget).length;

    // 3. WASM Load Time
    console.log('\n' + '⚡ PHASE 3: WASM Load Time'.padEnd(100, '─'));
    const wasmResults = await runWASMLoadBenchmarks();

    // 4. Attention Mechanisms
    console.log('\n' + '🧠 PHASE 4: Attention Mechanisms'.padEnd(100, '─'));
    const attentionResults = await runAttentionBenchmarks();
    totalBenchmarks += attentionResults.length;
    passedBenchmarks += attentionResults.filter(r => r.meetsTarget).length;
    failedBenchmarks += attentionResults.filter(r => !r.meetsTarget).length;

    // 5. Memory Usage
    console.log('\n' + '💾 PHASE 5: Memory Usage'.padEnd(100, '─'));
    const memoryResults = await runMemoryBenchmarks();

    const duration = performance.now() - startTime;

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      controllerOps: controllerResults,
      mcpTools: mcpResults,
      wasmLoad: wasmResults,
      attention: attentionResults,
      memory: memoryResults
    });

    const summary: BenchmarkSummary = {
      timestamp,
      duration,
      totalBenchmarks,
      passedBenchmarks,
      failedBenchmarks,
      categories: {
        controllerOps: controllerResults,
        mcpTools: mcpResults,
        wasmLoad: wasmResults,
        attention: attentionResults,
        memory: memoryResults
      },
      recommendations
    };

    // Generate reports
    await this.generateReports(summary);

    return summary;
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(results: any): string[] {
    const recommendations: string[] = [];

    // Controller operations analysis
    const slowInserts = results.controllerOps.filter(
      (r: any) => r.name.includes('Insert') && r.p95 > 10
    );
    if (slowInserts.length > 0) {
      recommendations.push(
        `⚠️  Vector insert p95 exceeds 10ms target. Consider enabling batch insert optimization.`
      );
    }

    const slowSearches = results.controllerOps.filter(
      (r: any) => r.name.includes('Search') && r.p95 > 5
    );
    if (slowSearches.length > 0) {
      recommendations.push(
        `⚠️  HNSW search p95 exceeds 5ms target. Tune efConstruction and M parameters.`
      );
    }

    // MCP tool analysis
    const slowTools = results.mcpTools.filter((r: any) => r.p95 > 100);
    if (slowTools.length > 0) {
      recommendations.push(
        `⚠️  ${slowTools.length} MCP tools exceed 100ms p95 target. Implement connection pooling.`
      );
      recommendations.push(
        `   Slow tools: ${slowTools.map((t: any) => t.toolName).join(', ')}`
      );
    }

    // Attention mechanism analysis
    const slowAttention = results.attention.filter(
      (r: any) => !r.meetsTarget && r.speedupVsJS < r.targetSpeedup
    );
    if (slowAttention.length > 0) {
      recommendations.push(
        `⚠️  ${slowAttention.length} attention mechanisms below speedup targets. Verify WASM compilation.`
      );
    }

    // Memory analysis
    if (results.memory.memory10K.finalMemory > 500 * 1024 * 1024) {
      recommendations.push(
        `⚠️  10K vector memory usage exceeds 500MB target. Consider quantization (4-bit/8-bit).`
      );
    }

    if (results.memory.leakDetection.hasLeak) {
      recommendations.push(
        `⚠️  Potential memory leak detected (${(results.memory.leakDetection.growthRate * 100).toFixed(1)}% growth). Review cleanup logic.`
      );
    }

    // WASM analysis
    const slowWASMLoads = [
      ...results.wasmLoad.reasoningBank,
      ...results.wasmLoad.quic
    ].filter((r: any) => !r.meetsTarget);
    if (slowWASMLoads.length > 0) {
      recommendations.push(
        `⚠️  WASM modules exceed load time targets. Implement lazy loading and module caching.`
      );
    }

    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push(
        `✅ All performance targets met! System is operating optimally.`
      );
    } else {
      recommendations.push(
        `\n📊 Priority actions: Address the ${recommendations.length} items above for optimal performance.`
      );
    }

    return recommendations;
  }

  /**
   * Generate comprehensive reports
   */
  private async generateReports(summary: BenchmarkSummary): Promise<void> {
    console.log('\n' + '=' .repeat(100));
    console.log('📈 Generating Performance Reports');
    console.log('=' .repeat(100));

    // JSON report
    await this.generateJSONReport(summary);

    // Markdown report
    await this.generateMarkdownReport(summary);

    // HTML report
    await this.generateHTMLReport(summary);

    console.log('\n📄 Reports generated:');
    console.log(`   - JSON: ${path.join(this.outputDir, 'performance-report.json')}`);
    console.log(`   - Markdown: ${path.join(this.outputDir, 'performance-report.md')}`);
    console.log(`   - HTML: ${path.join(this.outputDir, 'performance-report.html')}`);
  }

  /**
   * Generate JSON report
   */
  private async generateJSONReport(summary: BenchmarkSummary): Promise<void> {
    const reportPath = path.join(this.outputDir, 'performance-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  }

  /**
   * Generate Markdown report
   */
  private async generateMarkdownReport(summary: BenchmarkSummary): Promise<void> {
    const reportPath = path.join(this.outputDir, 'performance-report.md');

    let markdown = `# Agentic Flow Performance Benchmark Report

**Generated:** ${summary.timestamp}
**Duration:** ${(summary.duration / 1000).toFixed(2)}s
**Total Benchmarks:** ${summary.totalBenchmarks}
**Passed:** ${summary.passedBenchmarks} ✅
**Failed:** ${summary.failedBenchmarks} ❌

---

## Executive Summary

`;

    // Pass rate
    const passRate = (summary.passedBenchmarks / summary.totalBenchmarks) * 100;
    markdown += `**Overall Pass Rate:** ${passRate.toFixed(1)}%\n\n`;

    // Recommendations
    markdown += `## Recommendations\n\n`;
    for (const rec of summary.recommendations) {
      markdown += `${rec}\n\n`;
    }

    // Controller Operations
    markdown += `---\n\n## 1. Controller Operations\n\n`;
    markdown += `| Benchmark | p50 | p95 | p99 | Ops/sec | Target | Status |\n`;
    markdown += `|-----------|-----|-----|-----|---------|--------|--------|\n`;

    for (const result of summary.categories.controllerOps) {
      const status = result.meetsTarget === true ? '✅' : result.meetsTarget === false ? '❌' : '-';
      markdown += `| ${result.name} | ${result.p50.toFixed(2)}ms | ${result.p95.toFixed(2)}ms | ${result.p99.toFixed(2)}ms | ${result.opsPerSec.toFixed(0)} | ${result.target ? `<${result.target}ms` : '-'} | ${status} |\n`;
    }

    // MCP Tools
    markdown += `\n---\n\n## 2. MCP Tool Latency\n\n`;
    markdown += `| Tool | Category | p50 | p95 | p99 | Error Rate | Status |\n`;
    markdown += `|------|----------|-----|-----|-----|------------|--------|\n`;

    for (const result of summary.categories.mcpTools) {
      const status = result.meetsTarget ? '✅' : '❌';
      markdown += `| ${result.toolName} | ${result.category} | ${result.p50.toFixed(2)}ms | ${result.p95.toFixed(2)}ms | ${result.p99.toFixed(2)}ms | ${(result.errorRate * 100).toFixed(1)}% | ${status} |\n`;
    }

    // Attention Mechanisms
    markdown += `\n---\n\n## 3. Attention Mechanisms\n\n`;
    markdown += `| Mechanism | Seq Length | Avg Latency | Speedup vs JS | Target | Status |\n`;
    markdown += `|-----------|------------|-------------|---------------|--------|--------|\n`;

    for (const result of summary.categories.attention) {
      const status = result.meetsTarget ? '✅' : '⚠️';
      markdown += `| ${result.mechanism} | ${result.sequenceLength} | ${result.avgLatency.toFixed(2)}ms | ${result.speedupVsJS.toFixed(1)}x | ${result.targetSpeedup}x | ${status} |\n`;
    }

    // Memory Usage
    markdown += `\n---\n\n## 4. Memory Usage\n\n`;
    markdown += `### 10K Vectors\n\n`;
    markdown += `- Initial: ${this.formatBytes(summary.categories.memory.memory10K.initialMemory)}\n`;
    markdown += `- Final: ${this.formatBytes(summary.categories.memory.memory10K.finalMemory)}\n`;
    markdown += `- Peak: ${this.formatBytes(summary.categories.memory.memory10K.peakMemory)}\n`;
    markdown += `- Per Vector: ${this.formatBytes(summary.categories.memory.memory10K.memoryPerVector)}\n`;
    markdown += `- Target: <500MB ${summary.categories.memory.memory10K.meetsTarget ? '✅' : '❌'}\n\n`;

    markdown += `### 100K Vectors\n\n`;
    markdown += `- Initial: ${this.formatBytes(summary.categories.memory.memory100K.initialMemory)}\n`;
    markdown += `- Final: ${this.formatBytes(summary.categories.memory.memory100K.finalMemory)}\n`;
    markdown += `- Peak: ${this.formatBytes(summary.categories.memory.memory100K.peakMemory)}\n`;
    markdown += `- Per Vector: ${this.formatBytes(summary.categories.memory.memory100K.memoryPerVector)}\n`;
    markdown += `- Target: <5GB ${summary.categories.memory.memory100K.meetsTarget ? '✅' : '❌'}\n\n`;

    markdown += `### Memory Leak Detection\n\n`;
    markdown += `- Status: ${summary.categories.memory.leakDetection.hasLeak ? '⚠️ DETECTED' : '✅ NONE'}\n`;
    markdown += `- Growth Rate: ${(summary.categories.memory.leakDetection.growthRate * 100).toFixed(1)}%\n\n`;

    // WASM Load Time
    markdown += `---\n\n## 5. WASM Load Time\n\n`;
    markdown += `### Module Loading Performance\n\n`;
    markdown += `- Lazy Loading Improvement: ${summary.categories.wasmLoad.lazyLoading.improvement.toFixed(1)}%\n`;
    markdown += `- Caching Speedup: ${summary.categories.wasmLoad.caching.speedup.toFixed(1)}x\n\n`;

    fs.writeFileSync(reportPath, markdown);
  }

  /**
   * Generate HTML report
   */
  private async generateHTMLReport(summary: BenchmarkSummary): Promise<void> {
    const reportPath = path.join(this.outputDir, 'performance-report.html');

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Agentic Flow Performance Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; border-bottom: 2px solid #ddd; padding-bottom: 8px; }
    .summary { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .metric { display: inline-block; margin-right: 30px; }
    .metric-value { font-size: 24px; font-weight: bold; color: #4CAF50; }
    .metric-label { font-size: 14px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #4CAF50; color: white; padding: 12px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #ddd; }
    tr:hover { background: #f9f9f9; }
    .pass { color: #4CAF50; font-weight: bold; }
    .fail { color: #f44336; font-weight: bold; }
    .warning { color: #ff9800; font-weight: bold; }
    .recommendations { background: #fff3e0; padding: 20px; border-left: 4px solid #ff9800; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Agentic Flow Performance Benchmark Report</h1>

    <div class="summary">
      <div class="metric">
        <div class="metric-value">${summary.totalBenchmarks}</div>
        <div class="metric-label">Total Benchmarks</div>
      </div>
      <div class="metric">
        <div class="metric-value" style="color: #4CAF50;">${summary.passedBenchmarks}</div>
        <div class="metric-label">Passed</div>
      </div>
      <div class="metric">
        <div class="metric-value" style="color: #f44336;">${summary.failedBenchmarks}</div>
        <div class="metric-label">Failed</div>
      </div>
      <div class="metric">
        <div class="metric-value">${((summary.passedBenchmarks / summary.totalBenchmarks) * 100).toFixed(1)}%</div>
        <div class="metric-label">Pass Rate</div>
      </div>
      <div class="metric">
        <div class="metric-value">${(summary.duration / 1000).toFixed(2)}s</div>
        <div class="metric-label">Duration</div>
      </div>
    </div>

    <div class="recommendations">
      <h3>📊 Recommendations</h3>
      ${summary.recommendations.map(rec => `<p>${rec}</p>`).join('')}
    </div>

    <h2>Controller Operations</h2>
    <table>
      <tr>
        <th>Benchmark</th>
        <th>p50</th>
        <th>p95</th>
        <th>p99</th>
        <th>Ops/sec</th>
        <th>Status</th>
      </tr>
      ${summary.categories.controllerOps.map((r: any) => `
        <tr>
          <td>${r.name}</td>
          <td>${r.p50.toFixed(2)}ms</td>
          <td>${r.p95.toFixed(2)}ms</td>
          <td>${r.p99.toFixed(2)}ms</td>
          <td>${r.opsPerSec.toFixed(0)}</td>
          <td class="${r.meetsTarget === true ? 'pass' : r.meetsTarget === false ? 'fail' : ''}">${r.meetsTarget === true ? '✅' : r.meetsTarget === false ? '❌' : '-'}</td>
        </tr>
      `).join('')}
    </table>

    <h2>MCP Tool Latency</h2>
    <table>
      <tr>
        <th>Tool</th>
        <th>Category</th>
        <th>p95</th>
        <th>p99</th>
        <th>Status</th>
      </tr>
      ${summary.categories.mcpTools.map((r: any) => `
        <tr>
          <td>${r.toolName}</td>
          <td>${r.category}</td>
          <td>${r.p95.toFixed(2)}ms</td>
          <td>${r.p99.toFixed(2)}ms</td>
          <td class="${r.meetsTarget ? 'pass' : 'fail'}">${r.meetsTarget ? '✅' : '❌'}</td>
        </tr>
      `).join('')}
    </table>

    <p style="text-align: center; color: #999; margin-top: 40px;">
      Generated: ${summary.timestamp}
    </p>
  </div>
</body>
</html>`;

    fs.writeFileSync(reportPath, html);
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Format bytes helper
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new MasterBenchmarkRunner();

  runner
    .runAll()
    .then(summary => {
      console.log('\n' + '=' .repeat(100));
      console.log('✅ All benchmarks completed successfully!');
      console.log('=' .repeat(100));
      console.log();
      console.log(`Total benchmarks: ${summary.totalBenchmarks}`);
      console.log(`Passed: ${summary.passedBenchmarks} ✅`);
      console.log(`Failed: ${summary.failedBenchmarks} ❌`);
      console.log(`Pass rate: ${((summary.passedBenchmarks / summary.totalBenchmarks) * 100).toFixed(1)}%`);
      console.log();

      process.exit(summary.failedBenchmarks > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('\n❌ Benchmark suite failed:', error);
      process.exit(1);
    });
}

export default MasterBenchmarkRunner;
