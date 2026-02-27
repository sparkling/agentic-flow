# Cost Optimization Guide

## Overview

The Cost Optimizer provides intelligent model routing that delivers 90%+ cost savings compared to using Claude Opus for all operations. It achieves this through:

- **Agent Booster** for simple tasks (free, 1ms latency)
- **Claude Haiku** for moderate tasks (low cost, fast)
- **Claude Sonnet/Opus** only when quality demands it
- Automatic budget enforcement with alerts

## Architecture

```
Task Request
     |
     v
[Complexity Analysis]
     |
     +-- < 30 --> Agent Booster (FREE, 1ms)
     |
     +-- 30-69 --> Value-optimized selection
     |              (Quality / Cost * Latency)
     |
     +-- 70+ ---> High-quality model
                   (Sonnet or Opus)
```

## MCP Tools Reference

### cost_select_model

Select the optimal model for a given task.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| complexity | number (0-100) | Yes | Task complexity score |
| inputTokens | number | Yes | Expected input tokens |
| outputTokens | number | Yes | Expected output tokens |
| maxLatency | number (ms) | No | Maximum acceptable latency |
| minQuality | number (0-100) | No | Minimum quality threshold |

**Example:**
```json
{
  "complexity": 25,
  "inputTokens": 200,
  "outputTokens": 100
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "selectedModel": "agent-booster",
    "estimatedCost": 0,
    "reasoning": "Simple task (complexity 25) - using Agent Booster (free, 1ms latency)",
    "alternatives": [
      { "modelId": "claude-haiku-4", "cost": 0.000175 }
    ]
  }
}
```

### cost_report

Get a comprehensive spending and savings report.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| includeBreakdown | boolean | No | Include per-model breakdown (default: true) |

### cost_set_budget

Set the monthly budget limit.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| limit | number | Yes | Monthly budget in dollars |
| resetSpending | boolean | No | Reset current spend to zero |

### cost_record_spend

Record actual model usage for tracking.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| modelId | string | Yes | Model ID used |
| inputTokens | number | Yes | Actual input tokens |
| outputTokens | number | Yes | Actual output tokens |

## Model Selection Logic

### Tier 1: Agent Booster (Complexity < 30)
- **Cost**: $0 (local WASM execution)
- **Latency**: 1ms
- **Quality**: 70/100
- **Use cases**: Formatting, type annotations, simple renames, linting fixes

### Tier 2: Value-Optimized (Complexity 30-69)
The optimizer calculates a value score for each candidate model:

```
Value = Quality / (Cost * Latency)
```

Higher quality, lower cost, and lower latency all increase the value score. The model with the highest value wins.

### Tier 3: Quality-First (Complexity 70+)
For complex tasks requiring high reasoning quality, the optimizer still applies value scoring but candidates must meet any specified quality thresholds.

## Budget Management

### Setting a Budget

```
cost_set_budget { "limit": 50 }
```

This sets a $50/month budget. When spending approaches the limit:
- At **80% utilization**: A warning alert is triggered
- At **100% utilization**: Model selection automatically downgrades to the cheapest available option

### Monitoring Spend

```
cost_report { "includeBreakdown": true }
```

Returns current spending, budget remaining, and savings vs an all-Opus baseline.

### Resetting for New Billing Period

```
cost_set_budget { "limit": 100, "resetSpending": true }
```

## Savings Examples

### Typical Workload (70% simple, 20% moderate, 10% complex)

| Metric | All-Opus | Optimized | Savings |
|--------|----------|-----------|---------|
| 1000 operations | $4.50 | $0.24 | 94.7% |
| Monthly (10K ops) | $45.00 | $2.40 | 94.7% |

### All-Moderate Workload

| Metric | All-Opus | Optimized | Savings |
|--------|----------|-----------|---------|
| 1000 operations | $4.50 | $0.45 | 90.0% |

### All-Complex Workload

| Metric | All-Opus | Optimized | Savings |
|--------|----------|-----------|---------|
| 1000 operations | $4.50 | $1.50 | 66.7% |

## Available Models

| Model | Cost (input/1K) | Cost (output/1K) | Latency | Quality |
|-------|-----------------|-------------------|---------|---------|
| agent-booster | $0 | $0 | 1ms | 70 |
| claude-haiku-4 | $0.00025 | $0.00125 | 500ms | 80 |
| gpt-3.5-turbo | $0.0005 | $0.0015 | 400ms | 75 |
| claude-sonnet-4 | $0.003 | $0.015 | 1000ms | 90 |
| gpt-4-turbo | $0.01 | $0.03 | 1500ms | 92 |
| claude-opus-4 | $0.015 | $0.075 | 2000ms | 95 |

## Integration with AgentDB Service

The cost optimizer can be integrated with the AgentDB service for automatic model selection before LLM calls:

```typescript
import { CostOptimizerService } from './services/cost-optimizer-service.js';

const optimizer = CostOptimizerService.getInstance();

// Before making an LLM call
const selection = optimizer.selectOptimalModel({
  complexity: estimateComplexity(task),
  inputTokens: estimateInputTokens(prompt),
  outputTokens: estimateOutputTokens(task),
});

// Use the selected model
const response = await callLLM(selection.modelId, prompt);

// After the call, record actual usage
optimizer.recordSpend(
  selection.modelId,
  response.usage.inputTokens,
  response.usage.outputTokens,
);
```

## Adding Custom Models

```typescript
const optimizer = CostOptimizerService.getInstance();

optimizer.addCustomModel({
  modelId: 'my-fine-tuned-model',
  inputCostPer1K: 0.002,
  outputCostPer1K: 0.008,
  latency: 800,
  qualityScore: 88,
});
```

The custom model will be included in future model selection decisions.
