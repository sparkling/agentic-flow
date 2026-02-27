# AgentDB Chat - RVF Backend with Embedded ruvllm

Self-contained OpenAI-compatible chat backend with embedded GGUF LLM (Qwen2 0.5B) and ruvllm inference engine.

## Features

- ✅ **OpenAI-compatible API** - `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`
- ✅ **Embedded GGUF LLM** - Qwen2 0.5B quantized (q4_k_m), auto-downloads on first use
- ✅ **ruvllm Inference** - SONA learning, HNSW memory, FastGRNN routing
- ✅ **Zero-dependency HTTP** - Pure Node.js HTTP server, no Express/Fastify
- ✅ **RVF Storage** - Binary vector format with persistent HNSW index
- ✅ **Tool Calling** - OpenAI function calling support
- ✅ **Lazy Loading** - Fast startup, model loads on demand
- ✅ **Health Monitoring** - `/api/health` endpoint with detailed stats

## Quick Start

### Install Dependencies

```bash
# From monorepo root
npm install @ruvector/ruvllm@2.5.1 node-llama-cpp --save
```

### Start Server

```bash
cd packages/agentdb-chat
node dist/bin/agentdb-chat.js serve --port 3000 --rvf chat.rvf --model ruvllm
```

### Test API

```bash
# List models
curl http://localhost:3000/v1/models | jq '.'

# Chat completion
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d @- <<'EOF' | jq '.choices[0].message.content'
{
  "model": "ruvltra-small",
  "messages": [{"role": "user", "content": "Hello!"}],
  "max_tokens": 100
}
EOF

# Health check
curl http://localhost:3000/api/health | jq '.ruvllm | {ggufLoaded, hasSimd, memoryNodes}'
```

## Integration with HuggingFace Chat UI

```bash
# Terminal 1: Start backend
cd packages/agentdb-chat
node dist/bin/agentdb-chat.js serve --port 3000 --rvf chat.rvf --model ruvllm

# Terminal 2: Configure and start UI
cd ../agentdb-chat-ui
echo "OPENAI_BASE_URL=http://localhost:3000/v1" > .env.local
echo "OPENAI_API_KEY=rvf-ruvllm-dev" >> .env.local
npm run dev

# Access UI at http://localhost:5173
```

See [full documentation](../../CLAUDE.md#huggingface-chat-ui-with-embedded-ruvllm) for comprehensive setup guide.

## License

See [LICENSE](../../LICENSE) for details.
