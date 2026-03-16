#!/usr/bin/env node
/**
 * RVF (RuVector Framework) Demo
 * Demonstrates AgentDB with @ruvector/gnn@0.1.25 capabilities
 */

import { GNNService } from '../packages/agentdb/src/services/GNNService.js';

console.log(`
╔════════════════════════════════════════════════════════════════╗
║  🚀 RVF (RuVector Framework) Demo                             ║
║  AgentDB + @ruvector/gnn@0.1.25 Integration                  ║
╚════════════════════════════════════════════════════════════════╝
`);

async function main() {
  console.log('📊 Initializing GNN Service...\n');

  const gnn = new GNNService({
    inputDim: 384,
    hiddenDim: 256,
    outputDim: 128,
    heads: 8  // Using correct 'heads' parameter (fixed in 0.1.25)
  });

  await gnn.initialize();

  console.log(`✅ GNN Service initialized`);
  console.log(`   Engine: ${gnn.getEngineType()}`);
  console.log(`   Version: @ruvector/gnn@0.1.25`);
  console.log(`   Performance: ${gnn.getEngineType() === 'native' ? '7.5x faster than JS' : 'JS fallback'}\n`);

  // Demo 1: Skill Matching with GCN
  console.log('🎯 Demo 1: Skill-based Task Routing (GCN)\n');

  const taskEmbedding = new Float32Array(384).map(() => Math.random());
  const skillGraph = {
    'typescript': {
      embedding: new Float32Array(384).map(() => Math.random()),
      neighbors: ['javascript', 'react']
    },
    'python': {
      embedding: new Float32Array(384).map(() => Math.random()),
      neighbors: ['fastapi', 'django']
    },
    'react': {
      embedding: new Float32Array(384).map(() => Math.random()),
      neighbors: ['typescript', 'nextjs']
    }
  };

  const matches = await gnn.matchSkillsGCN(taskEmbedding, skillGraph, 3);
  console.log('Top skill matches:');
  matches.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.skill} - Score: ${(m.score * 100).toFixed(1)}% (confidence: ${(m.confidence * 100).toFixed(1)}%)`);
  });

  // Demo 2: Context Understanding with GAT
  console.log('\n🔍 Demo 2: Context-Aware Understanding (GAT)\n');

  const queryEmbedding = new Float32Array(384).map(() => Math.random());
  const contextNodes = [
    { id: 'user_history', embedding: new Float32Array(384).map(() => Math.random()), type: 'context' },
    { id: 'project_docs', embedding: new Float32Array(384).map(() => Math.random()), type: 'context' },
    { id: 'code_examples', embedding: new Float32Array(384).map(() => Math.random()), type: 'context' }
  ];

  const context = await gnn.understandContextGAT(queryEmbedding, contextNodes);
  console.log('Context attention weights:');
  Object.entries(context.attentionWeights).forEach(([node, weight]) => {
    console.log(`  ${node}: ${(weight * 100).toFixed(1)}%`);
  });

  // Demo 3: Node Classification
  console.log('\n🏷️  Demo 3: Task Classification\n');

  const taskNode = new Float32Array(384).map(() => Math.random());
  const neighbors = [
    new Float32Array(384).map(() => Math.random()),
    new Float32Array(384).map(() => Math.random())
  ];
  const categories = ['simple', 'moderate', 'complex', 'expert'];

  const classification = await gnn.classifyNode(taskNode, neighbors, categories);
  console.log(`Predicted category: ${classification.category}`);
  console.log(`Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
  console.log('All scores:');
  Object.entries(classification.scores).forEach(([cat, score]) => {
    console.log(`  ${cat}: ${(score * 100).toFixed(1)}%`);
  });

  // Demo 4: Link Prediction
  console.log('\n🔗 Demo 4: Workflow Optimization (Link Prediction)\n');

  const sourceNode = { id: 'task_auth', embedding: new Float32Array(384).map(() => Math.random()) };
  const candidateNodes = [
    { id: 'task_database', embedding: new Float32Array(384).map(() => Math.random()), type: 'task' },
    { id: 'task_api', embedding: new Float32Array(384).map(() => Math.random()), type: 'task' },
    { id: 'task_testing', embedding: new Float32Array(384).map(() => Math.random()), type: 'task' }
  ];

  const predictions = await gnn.predictLinks(sourceNode, candidateNodes, [], 3);
  console.log('Predicted task dependencies:');
  predictions.forEach((p, i) => {
    console.log(`  ${i + 1}. ${sourceNode.id} → ${p.targetId}: ${(p.probability * 100).toFixed(1)}% (${p.reasoning})`);
  });

  console.log('\n✨ Demo complete! RVF is ready for production use.\n');
  console.log('📚 Learn more: https://github.com/ruvnet/agentic-flow\n');
}

main().catch(console.error);
