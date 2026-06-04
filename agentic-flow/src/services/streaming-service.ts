/**
 * Streaming Service - Real-time Processing Architecture
 *
 * ADR-065 Phase P1-3: Streaming Architecture
 *
 * Features:
 * - Streaming embeddings (incremental generation)
 * - WebSocket support for real-time updates
 * - Server-Sent Events (SSE) for progress tracking
 * - Incremental vector updates
 * - Real-time metrics dashboard
 * - Backpressure handling
 * - Stream multiplexing
 *
 * Performance Target: <1s response time (95th percentile)
 */

import { EventEmitter } from 'events';
import type { Server as HTTPServer } from 'http';
import type { WebSocket, WebSocketServer } from 'ws';
import { getEmbeddingConfig } from 'agentdb';

// -- Types ------------------------------------------------------------------

export interface StreamConfig {
  maxConcurrentStreams?: number;
  backpressureThreshold?: number;
  chunkSize?: number;
  timeoutMs?: number;
  enableMultiplexing?: boolean;
}

export interface StreamMetrics {
  activeStreams: number;
  totalStreams: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputMbps: number;
  backpressureEvents: number;
}

export interface StreamChunk {
  id: string;
  type: 'embedding' | 'search' | 'data' | 'progress' | 'error' | 'complete';
  data: any;
  sequence: number;
  timestamp: number;
}

export interface StreamProgress {
  streamId: string;
  progress: number; // 0-100
  message: string;
  eta?: number; // milliseconds
}

export interface BackpressureStrategy {
  strategy: 'drop' | 'buffer' | 'throttle';
  maxBufferSize?: number;
  throttleMs?: number;
}

// -- Streaming Service ------------------------------------------------------

export class StreamingService extends EventEmitter {
  private static instance: StreamingService | null = null;
  private config: Required<StreamConfig>;
  private streams = new Map<string, StreamSession>();
  private metrics: {
    latencies: number[];
    totalStreams: number;
    backpressureEvents: number;
  };
  private wsServer: WebSocketServer | null = null;
  private sseClients = new Map<string, any>();

  private constructor(config: StreamConfig = {}) {
    super();
    this.config = {
      maxConcurrentStreams: config.maxConcurrentStreams ?? 100,
      backpressureThreshold: config.backpressureThreshold ?? 1000,
      chunkSize: config.chunkSize ?? 1024,
      timeoutMs: config.timeoutMs ?? 30000,
      enableMultiplexing: config.enableMultiplexing ?? true,
    };
    this.metrics = {
      latencies: [],
      totalStreams: 0,
      backpressureEvents: 0,
    };
  }

  static getInstance(config?: StreamConfig): StreamingService {
    if (!StreamingService.instance) {
      StreamingService.instance = new StreamingService(config);
    }
    return StreamingService.instance;
  }

  static resetInstance(): void {
    if (StreamingService.instance) {
      StreamingService.instance.shutdown();
      StreamingService.instance = null;
    }
  }

  // -- WebSocket Support ----------------------------------------------------

  /**
   * Initialize WebSocket server
   */
  initializeWebSocket(server: HTTPServer): void {
    try {
      // Dynamically import ws only when needed
      const createWebSocketServer = async () => {
        const { WebSocketServer } = await import('ws');
        return new WebSocketServer({ server, path: '/stream' });
      };

      createWebSocketServer().then(wss => {
        this.wsServer = wss;

        wss.on('connection', (ws: WebSocket, req: any) => {
          const streamId = this.generateStreamId();
          const clientId = req.headers['x-client-id'] || streamId;

          ws.on('message', async (message: Buffer) => {
            try {
              const data = JSON.parse(message.toString());
              await this.handleWebSocketMessage(ws, clientId, data);
            } catch (error) {
              ws.send(JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
              }));
            }
          });

          ws.on('close', () => {
            this.closeStream(streamId);
          });

          ws.send(JSON.stringify({
            type: 'connected',
            streamId,
            clientId,
          }));
        });

        this.emit('websocket:ready', { port: server.address() });
      }).catch(error => {
        console.warn('[StreamingService] WebSocket initialization failed:', error);
      });
    } catch (error) {
      console.warn('[StreamingService] WebSocket not available');
    }
  }

  private async handleWebSocketMessage(ws: WebSocket, clientId: string, data: any): Promise<void> {
    const { type, payload } = data;

    switch (type) {
      case 'stream:embedding':
        await this.streamEmbeddingViaWebSocket(ws, clientId, payload);
        break;
      case 'stream:search':
        // ADR-0288: episode-search streaming retired with the in-process
        // agentdb service; recall lives on the canonical agentdb surface.
        ws.send(JSON.stringify({
          type: 'error',
          error: 'stream:search retired (ADR-0288) — use the agentdb MCP/CLI recall surface',
        }));
        break;
      case 'stream:subscribe':
        this.subscribeToUpdates(ws, clientId, payload.topics);
        break;
      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: `Unknown message type: ${type}`,
        }));
    }
  }

  private async streamEmbeddingViaWebSocket(
    ws: WebSocket,
    clientId: string,
    payload: { text: string }
  ): Promise<void> {
    const streamId = this.generateStreamId();
    const stream = await this.createStreamingEmbedding(payload.text);

    for await (const chunk of stream) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'chunk',
          streamId,
          data: chunk,
        }));
      } else {
        break;
      }
    }

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'complete',
        streamId,
      }));
    }
  }

  private subscribeToUpdates(ws: WebSocket, clientId: string, topics: string[]): void {
    topics.forEach(topic => {
      this.on(topic, (data: any) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'update',
            topic,
            data,
          }));
        }
      });
    });
  }

  // -- SSE Support ----------------------------------------------------------

  /**
   * Create Server-Sent Events endpoint for progress tracking
   */
  createSSEEndpoint(req: any, res: any): string {
    const clientId = req.headers['x-client-id'] || this.generateStreamId();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    this.sseClients.set(clientId, res);

    // Send initial connection event
    this.sendSSE(clientId, 'connected', { clientId });

    req.on('close', () => {
      this.sseClients.delete(clientId);
    });

    return clientId;
  }

  /**
   * Send SSE event to specific client
   */
  sendSSE(clientId: string, event: string, data: any): void {
    const client = this.sseClients.get(clientId);
    if (client) {
      client.write(`event: ${event}\n`);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  /**
   * Broadcast SSE event to all clients
   */
  broadcastSSE(event: string, data: any): void {
    for (const [clientId, client] of this.sseClients.entries()) {
      try {
        client.write(`event: ${event}\n`);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch {
        this.sseClients.delete(clientId);
      }
    }
  }

  // -- Streaming Embeddings -------------------------------------------------

  /**
   * Create async generator for streaming embedding generation
   */
  async *createStreamingEmbedding(text: string): AsyncGenerator<StreamChunk> {
    const streamId = this.generateStreamId();
    const startTime = Date.now();
    const session = this.createSession(streamId);

    try {
      // Split text into chunks for incremental processing
      const chunks = this.splitIntoChunks(text, this.config.chunkSize);
      let sequence = 0;

      for (const chunk of chunks) {
        // Check backpressure
        if (session.buffer.length > this.config.backpressureThreshold) {
          await this.handleBackpressure(session);
        }

        // Generate partial embedding
        const partialEmbedding = await this.generatePartialEmbedding(chunk);

        const streamChunk: StreamChunk = {
          id: streamId,
          type: 'embedding',
          data: {
            chunk: chunk.substring(0, 50) + '...',
            embedding: partialEmbedding,
            progress: ((sequence + 1) / chunks.length) * 100,
          },
          sequence: sequence++,
          timestamp: Date.now(),
        };

        session.buffer.push(streamChunk);
        yield streamChunk;

        // Emit vector update event
        if (streamChunk.type === 'embedding' && streamChunk.data.embedding) {
          this.emit('vector:updated', {
            id: streamId,
            sequence: streamChunk.sequence,
            dimension: streamChunk.data.embedding.length,
          });
        }

        // Send progress via SSE
        this.broadcastSSE('progress', {
          streamId,
          progress: streamChunk.data.progress,
          message: `Processing chunk ${sequence}/${chunks.length}`,
        });
      }

      // Final complete chunk
      yield {
        id: streamId,
        type: 'complete',
        data: { totalChunks: chunks.length },
        sequence: sequence++,
        timestamp: Date.now(),
      };

      // Record metrics
      this.recordLatency(Date.now() - startTime);
    } finally {
      this.closeStream(streamId);
    }
  }

  // (createStreamingSearch removed — episode-search streaming retired per
  // ADR-0288; episode recall lives on the canonical agentdb MCP/CLI surface)

  // (updateVectorIncremental removed — it wrote episodes through the retired
  // in-process agentdb service; no consumer existed. ADR-0288)

  // -- Stream Multiplexing --------------------------------------------------

  /**
   * Multiplex multiple streams into a single connection
   */
  async *multiplexStreams(
    streams: Array<AsyncGenerator<StreamChunk>>
  ): AsyncGenerator<StreamChunk> {
    if (!this.config.enableMultiplexing) {
      throw new Error('Multiplexing not enabled');
    }

    // Create promises for all streams
    const streamPromises = streams.map(async (stream) => {
      const chunks: StreamChunk[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return chunks;
    });

    // Wait for all streams and merge
    const results = await Promise.all(streamPromises);
    const merged = results.flat().sort((a, b) => a.timestamp - b.timestamp);

    for (const chunk of merged) {
      yield chunk;
    }
  }

  // -- Backpressure Handling ------------------------------------------------

  private async handleBackpressure(session: StreamSession): Promise<void> {
    this.metrics.backpressureEvents++;

    switch (session.backpressureStrategy.strategy) {
      case 'drop':
        // Drop oldest chunks
        session.buffer = session.buffer.slice(-this.config.backpressureThreshold);
        break;

      case 'buffer':
        // Wait until buffer clears
        while (session.buffer.length > this.config.backpressureThreshold) {
          await this.sleep(100);
        }
        break;

      case 'throttle':
        // Slow down emission
        await this.sleep(session.backpressureStrategy.throttleMs || 50);
        break;
    }

    this.emit('backpressure', {
      streamId: session.id,
      strategy: session.backpressureStrategy.strategy,
      bufferSize: session.buffer.length,
    });
  }

  // -- Metrics Dashboard ----------------------------------------------------

  getMetrics(): StreamMetrics {
    const latencies = this.metrics.latencies;
    const sorted = [...latencies].sort((a, b) => a - b);

    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    return {
      activeStreams: this.streams.size,
      totalStreams: this.metrics.totalStreams,
      avgLatencyMs: Math.round(avg),
      p50LatencyMs: Math.round(p50),
      p95LatencyMs: Math.round(p95),
      p99LatencyMs: Math.round(p99),
      throughputMbps: this.calculateThroughput(),
      backpressureEvents: this.metrics.backpressureEvents,
    };
  }

  private calculateThroughput(): number {
    // Calculate throughput based on stream buffer sizes
    let totalBytes = 0;
    for (const session of this.streams.values()) {
      totalBytes += session.buffer.reduce(
        (sum, chunk) => sum + JSON.stringify(chunk).length,
        0
      );
    }
    return (totalBytes / 1024 / 1024); // MB
  }

  // -- Session Management ---------------------------------------------------

  private createSession(id: string): StreamSession {
    if (this.streams.size >= this.config.maxConcurrentStreams) {
      throw new Error('Maximum concurrent streams reached');
    }

    const session: StreamSession = {
      id,
      buffer: [],
      startTime: Date.now(),
      backpressureStrategy: { strategy: 'buffer' },
    };

    this.streams.set(id, session);
    this.metrics.totalStreams++;

    return session;
  }

  closeStream(id: string): void {
    const session = this.streams.get(id);
    if (session) {
      session.buffer = [];
      this.streams.delete(id);
      this.emit('stream:closed', { id });
    }
  }

  closeAllStreams(): void {
    for (const id of this.streams.keys()) {
      this.closeStream(id);
    }
  }

  // -- Utilities ------------------------------------------------------------

  private generateStreamId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
  }

  private async generatePartialEmbedding(text: string): Promise<number[]> {
    // Mock embedding generation - in production, use real embedding service
    const dimension = getEmbeddingConfig()?.dimension ?? 768;
    const embedding = new Array(dimension);
    for (let i = 0; i < dimension; i++) {
      embedding[i] = Math.random() * 2 - 1;
    }
    return embedding;
  }

  private recordLatency(latencyMs: number): void {
    this.metrics.latencies.push(latencyMs);
    // Keep only last 1000 latencies
    if (this.metrics.latencies.length > 1000) {
      this.metrics.latencies.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // -- Cleanup --------------------------------------------------------------

  shutdown(): void {
    this.closeAllStreams();
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }
    for (const [clientId, client] of this.sseClients.entries()) {
      try {
        client.end();
      } catch {
        // Ignore
      }
    }
    this.sseClients.clear();
    this.removeAllListeners();
  }
}

// -- Internal Types ---------------------------------------------------------

interface StreamSession {
  id: string;
  buffer: StreamChunk[];
  startTime: number;
  backpressureStrategy: BackpressureStrategy;
}
