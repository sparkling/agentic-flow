/**
 * Explainability Dashboard - CLI-based TUI for transparency and debugging
 *
 * Features:
 * - Real-time trace visualization
 * - Attention heatmaps
 * - Decision tree rendering
 * - Performance profiling
 * - Compliance reports
 */

import { ExplainabilityService, ExecutionTrace, AttentionVisualization, DecisionTree, PerformanceProfile } from '../services/explainability-service.js';

// ============================================================================
// Types
// ============================================================================

export interface DashboardOptions {
  refreshRate?: number; // Refresh rate in ms (default: 1000)
  theme?: 'light' | 'dark'; // Theme (default: 'dark')
  showAttention?: boolean; // Show attention visualization
  showDecisionTree?: boolean; // Show decision tree
  showPerformance?: boolean; // Show performance profile
}

export interface DashboardState {
  selectedTraceId: string | null;
  traces: ExecutionTrace[];
  currentView: 'overview' | 'trace' | 'attention' | 'decision' | 'performance' | 'compliance';
}

// ============================================================================
// Dashboard Renderer (CLI-based)
// ============================================================================

export class ExplainabilityDashboard {
  private service: ExplainabilityService;
  private options: Required<DashboardOptions>;
  private state: DashboardState;

  constructor(options: DashboardOptions = {}) {
    this.service = ExplainabilityService.getInstance();
    this.options = {
      refreshRate: options.refreshRate || 1000,
      theme: options.theme || 'dark',
      showAttention: options.showAttention !== false,
      showDecisionTree: options.showDecisionTree !== false,
      showPerformance: options.showPerformance !== false,
    };

    this.state = {
      selectedTraceId: null,
      traces: [],
      currentView: 'overview',
    };
  }

  // ============================================================================
  // Main Rendering
  // ============================================================================

  render(): string {
    this.state.traces = this.service.getAllTraces();

    switch (this.state.currentView) {
      case 'overview':
        return this.renderOverview();
      case 'trace':
        return this.renderTraceDetail();
      case 'attention':
        return this.renderAttentionView();
      case 'decision':
        return this.renderDecisionTreeView();
      case 'performance':
        return this.renderPerformanceView();
      case 'compliance':
        return this.renderComplianceView();
      default:
        return this.renderOverview();
    }
  }

  // ============================================================================
  // Overview
  // ============================================================================

  private renderOverview(): string {
    const metrics = this.service.getMetrics();
    const traces = this.state.traces;

    const successCount = traces.filter(t => t.success).length;
    const successRate = traces.length > 0 ? (successCount / traces.length * 100).toFixed(1) : '0.0';

    const totalCost = traces.reduce((sum, t) => sum + t.totalCost, 0);
    const avgLatency = traces.length > 0
      ? (traces.reduce((sum, t) => sum + t.durationMs, 0) / traces.length).toFixed(0)
      : '0';

    const output: string[] = [];
    output.push(this.renderHeader('Explainability Dashboard - Overview'));
    output.push('');
    output.push(this.renderSection('Metrics'));
    output.push(`  Traces Collected:     ${metrics.tracesCollected}`);
    output.push(`  Average Overhead:     ${metrics.averageOverheadMs.toFixed(2)}ms (${metrics.overheadPercentage.toFixed(2)}%)`);
    output.push(`  Storage Used:         ${metrics.storageUsedMB.toFixed(2)} MB`);
    output.push(`  Success Rate:         ${successRate}%`);
    output.push(`  Total Cost:           $${totalCost.toFixed(4)}`);
    output.push(`  Average Latency:      ${avgLatency}ms`);
    output.push('');

    output.push(this.renderSection('Recent Traces'));
    if (traces.length === 0) {
      output.push('  No traces available');
    } else {
      output.push(this.renderTable(
        ['Trace ID', 'Model', 'Duration', 'Cost', 'Status'],
        traces.slice(-10).reverse().map(t => [
          t.traceId.substring(0, 20),
          t.modelUsed,
          `${t.durationMs}ms`,
          `$${t.totalCost.toFixed(4)}`,
          t.success ? '✓' : '✗'
        ])
      ));
    }

    output.push('');
    output.push(this.renderSection('Navigation'));
    output.push('  Press 1: View Trace Detail');
    output.push('  Press 2: View Attention Visualization');
    output.push('  Press 3: View Decision Tree');
    output.push('  Press 4: View Performance Profile');
    output.push('  Press 5: View Compliance Report');
    output.push('  Press Q: Quit');

    return output.join('\n');
  }

  // ============================================================================
  // Trace Detail
  // ============================================================================

  private renderTraceDetail(): string {
    if (!this.state.selectedTraceId) {
      return 'No trace selected. Use setSelectedTrace(traceId) first.';
    }

    const trace = this.service.getTrace(this.state.selectedTraceId);
    if (!trace) {
      return `Trace ${this.state.selectedTraceId} not found`;
    }

    const output: string[] = [];
    output.push(this.renderHeader(`Trace Detail - ${trace.traceId}`));
    output.push('');

    output.push(this.renderSection('Summary'));
    output.push(`  Trace ID:     ${trace.traceId}`);
    output.push(`  Model Used:   ${trace.modelUsed}`);
    output.push(`  Duration:     ${trace.durationMs}ms`);
    output.push(`  Total Cost:   $${trace.totalCost.toFixed(4)}`);
    output.push(`  Status:       ${trace.success ? 'Success ✓' : 'Failed ✗'}`);
    if (trace.error) {
      output.push(`  Error:        ${trace.error}`);
    }
    output.push('');

    output.push(this.renderSection('Execution Steps'));
    if (trace.steps.length === 0) {
      output.push('  No steps recorded');
    } else {
      output.push(this.renderTable(
        ['Step', 'Type', 'Duration', 'Description'],
        trace.steps.map(step => [
          step.stepId.split('-').pop() || '',
          step.type,
          `${step.durationMs}ms`,
          step.description.substring(0, 50)
        ])
      ));
    }

    return output.join('\n');
  }

  // ============================================================================
  // Attention Visualization
  // ============================================================================

  private renderAttentionView(): string {
    if (!this.state.selectedTraceId) {
      return 'No trace selected. Use setSelectedTrace(traceId) first.';
    }

    const viz = this.service.getAttentionVisualization(this.state.selectedTraceId);
    if (!viz) {
      return `No attention visualization for trace ${this.state.selectedTraceId}`;
    }

    const output: string[] = [];
    output.push(this.renderHeader(`Attention Visualization - ${viz.traceId}`));
    output.push('');

    output.push(this.renderSection('Input Text'));
    output.push(`  ${viz.inputText.substring(0, 100)}${viz.inputText.length > 100 ? '...' : ''}`);
    output.push('');

    output.push(this.renderSection('Output Text'));
    output.push(`  ${viz.outputText.substring(0, 100)}${viz.outputText.length > 100 ? '...' : ''}`);
    output.push('');

    output.push(this.renderSection('Top Focus Tokens'));
    output.push(this.renderTable(
      ['Token', 'Total Weight', 'Heatmap'],
      viz.focusTokens.slice(0, 10).map(token => {
        const weight = viz.aggregatedWeights.get(token) || 0;
        const normalizedWeight = Math.min(weight * 10, 1); // Normalize to 0-1
        const heatmap = this.renderHeatmap(normalizedWeight);
        return [token, weight.toFixed(4), heatmap];
      })
    ));
    output.push('');

    output.push(this.renderSection('Attention Heads'));
    output.push(`  Total Heads: ${viz.heads.length}`);
    for (const head of viz.heads.slice(0, 3)) {
      output.push(`  Head ${head.headId} (Layer ${head.layer}): Top tokens: ${head.topK.slice(0, 5).join(', ')}`);
    }

    return output.join('\n');
  }

  // ============================================================================
  // Decision Tree
  // ============================================================================

  private renderDecisionTreeView(): string {
    if (!this.state.selectedTraceId) {
      return 'No trace selected. Use setSelectedTrace(traceId) first.';
    }

    const tree = this.service.getDecisionTree(this.state.selectedTraceId);
    if (!tree) {
      return `No decision tree for trace ${this.state.selectedTraceId}`;
    }

    const output: string[] = [];
    output.push(this.renderHeader(`Decision Tree - ${tree.traceId}`));
    output.push('');

    output.push(this.renderSection('Tree Statistics'));
    output.push(`  Depth:        ${tree.depth}`);
    output.push(`  Total Nodes:  ${tree.totalNodes}`);
    output.push(`  Critical Path: ${tree.criticalPath.join(' → ')}`);
    output.push('');

    output.push(this.renderSection('Decision Flow'));
    output.push(this.renderDecisionNode(tree.rootNode, 0));

    return output.join('\n');
  }

  private renderDecisionNode(node: any, indent: number): string {
    const prefix = '  '.repeat(indent);
    const output: string[] = [];

    output.push(`${prefix}└─ ${node.decision} (${(node.confidence * 100).toFixed(1)}%)`);
    output.push(`${prefix}   Reasoning: ${node.reasoning}`);

    if (node.alternatives && node.alternatives.length > 0) {
      output.push(`${prefix}   Alternatives:`);
      for (const alt of node.alternatives.slice(0, 2)) {
        output.push(`${prefix}     - ${alt.decision} (${(alt.confidence * 100).toFixed(1)}%)`);
      }
    }

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        output.push(this.renderDecisionNode(child, indent + 1));
      }
    }

    return output.join('\n');
  }

  // ============================================================================
  // Performance Profile
  // ============================================================================

  private renderPerformanceView(): string {
    if (!this.state.selectedTraceId) {
      return 'No trace selected. Use setSelectedTrace(traceId) first.';
    }

    const profile = this.service.generatePerformanceProfile(this.state.selectedTraceId);
    if (!profile) {
      return `No performance profile for trace ${this.state.selectedTraceId}`;
    }

    const output: string[] = [];
    output.push(this.renderHeader(`Performance Profile - ${profile.traceId}`));
    output.push('');

    output.push(this.renderSection('Hot Paths (Most Time Spent)'));
    output.push(this.renderTable(
      ['Path', 'Count', 'Total Time', 'Avg Time'],
      profile.hotPaths.map(hp => [
        hp.path.substring(0, 30),
        hp.count.toString(),
        `${hp.totalMs.toFixed(0)}ms`,
        `${hp.avgMs.toFixed(0)}ms`
      ])
    ));
    output.push('');

    output.push(this.renderSection('Bottlenecks (Slowest Steps)'));
    output.push(this.renderTable(
      ['Step ID', 'Duration', 'Percentage'],
      profile.bottlenecks.map(bn => [
        bn.stepId.substring(0, 20),
        `${bn.durationMs.toFixed(0)}ms`,
        `${bn.percentage.toFixed(1)}%`
      ])
    ));

    return output.join('\n');
  }

  // ============================================================================
  // Compliance Report
  // ============================================================================

  private renderComplianceView(): string {
    const report = this.service.generateComplianceReport();

    const output: string[] = [];
    output.push(this.renderHeader(`Compliance Report - ${report.reportId}`));
    output.push('');

    output.push(this.renderSection('Summary'));
    output.push(`  Report ID:         ${report.reportId}`);
    output.push(`  Generated At:      ${new Date(report.generatedAt).toISOString()}`);
    output.push(`  Total Requests:    ${report.summary.totalRequests}`);
    output.push(`  Success Rate:      ${(report.summary.successRate * 100).toFixed(1)}%`);
    output.push(`  Average Latency:   ${report.summary.averageLatency.toFixed(0)}ms`);
    output.push(`  Total Cost:        $${report.summary.totalCost.toFixed(4)}`);
    output.push('');

    output.push(this.renderSection('Models Used'));
    for (const [model, count] of Object.entries(report.summary.modelsUsed)) {
      output.push(`  ${model}: ${count} requests`);
    }
    output.push('');

    output.push(this.renderSection('Data Handling'));
    output.push(`  PII Detected:              ${report.dataHandling.piiDetected ? 'Yes' : 'No'}`);
    output.push(`  Data Retention Compliant:  ${report.dataHandling.dataRetentionCompliant ? 'Yes' : 'No'}`);
    output.push(`  Encryption Used:           ${report.dataHandling.encryptionUsed ? 'Yes' : 'No'}`);
    output.push('');

    output.push(this.renderSection('Recent Audit Log'));
    output.push(this.renderTable(
      ['Timestamp', 'Trace ID', 'Action', 'Result'],
      report.auditLog.slice(-10).map(entry => [
        new Date(entry.timestamp).toLocaleTimeString(),
        entry.traceId.substring(0, 15),
        entry.action,
        entry.result
      ])
    ));

    return output.join('\n');
  }

  // ============================================================================
  // Rendering Utilities
  // ============================================================================

  private renderHeader(title: string): string {
    const border = '═'.repeat(80);
    return `╔${border}╗\n║ ${title.padEnd(78)} ║\n╚${border}╝`;
  }

  private renderSection(title: string): string {
    return `▶ ${title}\n${'─'.repeat(80)}`;
  }

  private renderTable(headers: string[], rows: string[][]): string {
    const colWidths = headers.map((h, i) => {
      const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
      return Math.max(h.length, maxRowWidth);
    });

    const output: string[] = [];

    // Header
    const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ');
    output.push(`  ${headerRow}`);
    output.push(`  ${colWidths.map(w => '─'.repeat(w)).join('─┼─')}`);

    // Rows
    for (const row of rows) {
      const rowStr = row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' | ');
      output.push(`  ${rowStr}`);
    }

    return output.join('\n');
  }

  private renderHeatmap(weight: number): string {
    // 0-1 weight to visual heatmap
    const blocks = Math.floor(weight * 10);
    return '█'.repeat(blocks) + '░'.repeat(10 - blocks);
  }

  // ============================================================================
  // State Management
  // ============================================================================

  setSelectedTrace(traceId: string): void {
    this.state.selectedTraceId = traceId;
  }

  setView(view: DashboardState['currentView']): void {
    this.state.currentView = view;
  }

  // ============================================================================
  // CLI Export
  // ============================================================================

  exportToConsole(): void {
    console.clear();
    console.log(this.render());
  }
}
