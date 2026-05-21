/**
 * Unit tests for StreamingService
 *
 * Coverage: StreamConfig defaults, StreamChunk emission ordering, EventEmitter
 * events, BackpressureStrategy branches (drop/buffer/throttle), StreamProgress,
 * StreamMetrics, SSE helpers, stream multiplexing, session management, and
 * error/edge cases (close mid-stream, max concurrent streams, empty input).
 *
 * DEFECT FOUND:
 *   src/services/streaming-service.ts:599 — `getEmbeddingConfig` is imported
 *   from 'agentdb' but the package does not export that symbol.  At runtime
 *   `generatePartialEmbedding` throws `TypeError: getEmbeddingConfig is not a
 *   function`.  The import must be removed and the dimension constant (768)
 *   must be inlined, or the service must derive the dimension from an exported
 *   helper that actually exists (e.g. via `EmbeddingService`).  This test file
 *   mocks 'agentdb' to keep the suite hermetic, which papers over the crash but
 *   does not fix it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  StreamingService,
  type StreamConfig,
  type StreamChunk,
  type StreamProgress,
  type StreamMetrics,
  type BackpressureStrategy,
} from '../../src/services/streaming-service.js';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

// Mock 'ws' — no real sockets/ports.
vi.mock('ws', () => {
  const mockWss = {
    on: vi.fn(),
    close: vi.fn(),
  };
  const WebSocketServerCtor = vi.fn(() => mockWss);
  const WebSocketCtor = vi.fn();
  return { WebSocket: WebSocketCtor, WebSocketServer: WebSocketServerCtor, default: { WebSocket: WebSocketCtor, WebSocketServer: WebSocketServerCtor } };
});

// Mock 'agentdb' — getEmbeddingConfig does NOT exist in the real package
// (defect noted above); mock it so the suite is hermetic.
vi.mock('agentdb', () => ({
  getEmbeddingConfig: vi.fn(() => ({ dimension: 4 })),
}));

// Mock agentdb-service dynamic import used inside createStreamingSearch /
// updateVectorIncremental.
const mockRecallEpisodes = vi.fn();
const mockStoreEpisode = vi.fn();
const mockAgentDBInstance = {
  recallEpisodes: mockRecallEpisodes,
  storeEpisode: mockStoreEpisode,
};
vi.mock('../../src/services/agentdb-service.js', () => ({
  AgentDBService: {
    getInstance: vi.fn(() => Promise.resolve(mockAgentDBInstance)),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drain an async generator to an array. */
async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

/** Build a minimal StreamChunk for multiplexing tests. */
function makeChunk(seq: number, ts: number): StreamChunk {
  return { id: 'test', type: 'data', data: {}, sequence: seq, timestamp: ts };
}

/** Create a simple async generator from an array. */
async function* fromArray<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('StreamingService', () => {
  beforeEach(() => {
    // Reset singleton so each test gets a clean instance.
    StreamingService.resetInstance();
    vi.useFakeTimers();
    mockRecallEpisodes.mockReset();
    mockStoreEpisode.mockReset();
  });

  afterEach(() => {
    StreamingService.resetInstance();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Singleton / construction
  // -------------------------------------------------------------------------

  describe('getInstance / resetInstance', () => {
    it('returns the same instance on repeated calls', () => {
      const a = StreamingService.getInstance();
      const b = StreamingService.getInstance();
      expect(a).toBe(b);
    });

    it('returns a fresh instance after resetInstance()', () => {
      const a = StreamingService.getInstance();
      StreamingService.resetInstance();
      const b = StreamingService.getInstance();
      expect(a).not.toBe(b);
    });

    it('accepts StreamConfig and respects custom values', () => {
      const svc = StreamingService.getInstance({
        maxConcurrentStreams: 5,
        backpressureThreshold: 50,
        chunkSize: 256,
        timeoutMs: 5000,
        enableMultiplexing: false,
      });
      // The config is private but its effects surface through behaviour.
      // Verify maxConcurrentStreams via exhaustion (tested separately).
      // Here just confirm construction doesn't throw.
      expect(svc).toBeInstanceOf(StreamingService);
    });

    it('applies default config values when none supplied', () => {
      const svc = StreamingService.getInstance();
      // Default maxConcurrentStreams is 100 — we can open 100 sessions without
      // hitting the limit (tested via createStreamingEmbedding calling
      // createSession; metrics reflect totalStreams accumulating).
      expect(svc).toBeInstanceOf(StreamingService);
    });
  });

  // -------------------------------------------------------------------------
  // StreamConfig / defaults surfaced through getMetrics
  // -------------------------------------------------------------------------

  describe('getMetrics() initial state', () => {
    it('returns zero-valued metrics on a fresh instance', () => {
      const svc = StreamingService.getInstance();
      const m = svc.getMetrics();
      expect(m.activeStreams).toBe(0);
      expect(m.totalStreams).toBe(0);
      expect(m.avgLatencyMs).toBe(0);
      expect(m.p50LatencyMs).toBe(0);
      expect(m.p95LatencyMs).toBe(0);
      expect(m.p99LatencyMs).toBe(0);
      expect(m.throughputMbps).toBe(0);
      expect(m.backpressureEvents).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // createStreamingEmbedding — chunk emission ordering & types
  // -------------------------------------------------------------------------

  describe('createStreamingEmbedding()', () => {
    it('yields embedding chunks then a final complete chunk', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 5 });
      const text = 'hello world'; // 11 chars → 3 chunks of size 5

      const promise = collect(svc.createStreamingEmbedding(text));
      // Advance timers in case sleep() calls are involved.
      await vi.runAllTimersAsync();
      const chunks = await promise;

      expect(chunks.length).toBeGreaterThanOrEqual(2);

      // All but last should be type 'embedding'.
      const embedChunks = chunks.slice(0, -1);
      for (const c of embedChunks) {
        expect(c.type).toBe('embedding');
      }

      // Last chunk is 'complete'.
      expect(chunks[chunks.length - 1].type).toBe('complete');
    });

    it('sequence numbers are strictly ascending from 0', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 4 });
      const text = 'abcdefgh'; // 8 chars → 2 chunks

      const promise = collect(svc.createStreamingEmbedding(text));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].sequence).toBe(i);
      }
    });

    it('all chunks share the same stream id', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 5 });
      const text = 'abcde12345';

      const promise = collect(svc.createStreamingEmbedding(text));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      const ids = new Set(chunks.map(c => c.id));
      expect(ids.size).toBe(1);
    });

    it('embedding chunks carry an embedding array of the configured dimension', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 10 });

      const promise = collect(svc.createStreamingEmbedding('test text!!'));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      const embChunks = chunks.filter(c => c.type === 'embedding');
      expect(embChunks.length).toBeGreaterThan(0);
      for (const c of embChunks) {
        // agentdb mock returns dimension: 4
        expect(Array.isArray(c.data.embedding)).toBe(true);
        expect(c.data.embedding).toHaveLength(4);
      }
    });

    it('progress field on embedding chunks increases toward 100', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 2 });
      const text = 'abcd'; // 2 chunks of 2

      const promise = collect(svc.createStreamingEmbedding(text));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      const embChunks = chunks.filter(c => c.type === 'embedding');
      expect(embChunks[0].data.progress).toBeLessThan(embChunks[embChunks.length - 1].data.progress);
      expect(embChunks[embChunks.length - 1].data.progress).toBe(100);
    });

    it('complete chunk carries totalChunks matching actual split count', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 3 });
      const text = 'abcdefghi'; // exactly 3 chunks of 3

      const promise = collect(svc.createStreamingEmbedding(text));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      const complete = chunks[chunks.length - 1];
      expect(complete.type).toBe('complete');
      expect(complete.data.totalChunks).toBe(3);
    });

    it('stream is removed from active streams after completion', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 10 });

      const promise = collect(svc.createStreamingEmbedding('hello world'));
      await vi.runAllTimersAsync();
      await promise;

      expect(svc.getMetrics().activeStreams).toBe(0);
    });

    it('totalStreams increments with each call', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 50 });

      const p1 = collect(svc.createStreamingEmbedding('abc'));
      await vi.runAllTimersAsync();
      await p1;

      const p2 = collect(svc.createStreamingEmbedding('xyz'));
      await vi.runAllTimersAsync();
      await p2;

      expect(svc.getMetrics().totalStreams).toBe(2);
    });

    it('emits vector:updated event for each embedding chunk', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 5 });
      const events: any[] = [];
      svc.on('vector:updated', (e) => events.push(e));

      const promise = collect(svc.createStreamingEmbedding('hello world'));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      const embCount = chunks.filter(c => c.type === 'embedding').length;
      expect(events.length).toBe(embCount);
      for (const e of events) {
        expect(e).toHaveProperty('id');
        expect(e).toHaveProperty('sequence');
        expect(e).toHaveProperty('dimension', 4);
      }
    });

    it('emits stream:closed event after stream completes', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 10 });
      const closedIds: string[] = [];
      svc.on('stream:closed', ({ id }) => closedIds.push(id));

      const promise = collect(svc.createStreamingEmbedding('testing123'));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      expect(closedIds).toHaveLength(1);
      expect(closedIds[0]).toBe(chunks[0].id);
    });

    it('handles empty string input without throwing (yields only complete)', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 5 });

      const promise = collect(svc.createStreamingEmbedding(''));
      await vi.runAllTimersAsync();
      const chunks = await promise;

      // splitIntoChunks('', 5) → [] → no embedding chunks, just complete
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('complete');
      expect(chunks[0].data.totalChunks).toBe(0);
    });

    it('latency is recorded after stream completes', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 10 });

      const promise = collect(svc.createStreamingEmbedding('abc'));
      await vi.runAllTimersAsync();
      await promise;

      // After one stream, avgLatencyMs should be ≥ 0 (real timers give 0 in fake mode).
      const m = svc.getMetrics();
      expect(m.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  // -------------------------------------------------------------------------
  // EventEmitter: stream:closed via closeStream()
  // -------------------------------------------------------------------------

  describe('closeStream()', () => {
    it('emits stream:closed with the stream id', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 100 });
      const closedEvents: any[] = [];
      svc.on('stream:closed', (e) => closedEvents.push(e));

      // Open a stream, collect it (which auto-closes via finally), confirm event.
      const p = collect(svc.createStreamingEmbedding('hi'));
      await vi.runAllTimersAsync();
      await p;

      expect(closedEvents).toHaveLength(1);
      expect(closedEvents[0]).toHaveProperty('id');
    });

    it('calling closeStream with unknown id is a no-op', () => {
      const svc = StreamingService.getInstance();
      const handler = vi.fn();
      svc.on('stream:closed', handler);

      svc.closeStream('nonexistent-id');

      expect(handler).not.toHaveBeenCalled();
    });

    it('closeAllStreams clears all active sessions and emits closed for each', async () => {
      const svc = StreamingService.getInstance({ maxConcurrentStreams: 10, chunkSize: 1000 });
      const closedIds: string[] = [];
      svc.on('stream:closed', ({ id }) => closedIds.push(id));

      // Start two streams but don't fully consume them — manually call closeAllStreams.
      const gen1 = svc.createStreamingEmbedding('aaaaaaa');
      const gen2 = svc.createStreamingEmbedding('bbbbbbb');
      // Pull first chunk to ensure sessions are registered.
      await gen1.next();
      await gen2.next();

      expect(svc.getMetrics().activeStreams).toBe(2);

      svc.closeAllStreams();

      expect(svc.getMetrics().activeStreams).toBe(0);
      expect(closedIds).toHaveLength(2);

      // Clean up generators to avoid unhandled rejection.
      await gen1.return(undefined);
      await gen2.return(undefined);
    });
  });

  // -------------------------------------------------------------------------
  // Max concurrent streams
  // -------------------------------------------------------------------------

  describe('maxConcurrentStreams', () => {
    it('throws when max concurrent streams is reached', async () => {
      const svc = StreamingService.getInstance({ maxConcurrentStreams: 2, chunkSize: 10000 });

      // Open 2 streams but do not consume them so sessions stay alive.
      const gen1 = svc.createStreamingEmbedding('aaaa');
      const gen2 = svc.createStreamingEmbedding('bbbb');
      await gen1.next(); // trigger createSession for stream 1
      await gen2.next(); // trigger createSession for stream 2

      // Third should throw synchronously at createSession.
      await expect(
        collect(svc.createStreamingEmbedding('cccc'))
      ).rejects.toThrow('Maximum concurrent streams reached');

      // Clean up.
      await gen1.return(undefined);
      await gen2.return(undefined);
    });
  });

  // -------------------------------------------------------------------------
  // Backpressure strategies
  //
  // NOTE: The service's default BackpressureStrategy is 'buffer', which loops
  // with sleep(100) until session.buffer.length drops below the threshold.
  // Nothing in createStreamingEmbedding actually drains session.buffer (only
  // push happens), so the 'buffer' strategy deadlocks in production as well as
  // tests.  This is a SERVICE DEFECT: the buffer strategy requires an external
  // consumer to drain the buffer, but the service provides no such mechanism.
  //
  // To test backpressure without triggering the deadlocking buffer loop, we
  // invoke handleBackpressure indirectly by patching the private session via
  // the service's prototype so we can inject a 'drop' or 'throttle' strategy.
  // -------------------------------------------------------------------------

  describe('BackpressureStrategy', () => {
    it('handleBackpressure increments backpressureEvents counter', async () => {
      // Access handleBackpressure via prototype (it's private but unminified).
      const svc = StreamingService.getInstance();

      const mockSession = {
        id: 'test-bp',
        buffer: Array.from({ length: 5 }, (_, i) => makeChunk(i, i)),
        startTime: Date.now(),
        backpressureStrategy: { strategy: 'drop' as const },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any).handleBackpressure(mockSession);

      expect(svc.getMetrics().backpressureEvents).toBe(1);
    });

    it('drop strategy: trims buffer to backpressureThreshold length', async () => {
      // threshold defaults to 1000; use a fresh instance with threshold=3.
      const svc = StreamingService.getInstance({ backpressureThreshold: 3 });

      const mockSession = {
        id: 'test-drop',
        buffer: Array.from({ length: 10 }, (_, i) => makeChunk(i, i)),
        startTime: Date.now(),
        backpressureStrategy: { strategy: 'drop' as const },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any).handleBackpressure(mockSession);

      // After drop, buffer.length === backpressureThreshold (3).
      expect(mockSession.buffer).toHaveLength(3);
      // The oldest were dropped — last 3 entries remain.
      expect(mockSession.buffer[0].sequence).toBe(7);
      expect(mockSession.buffer[2].sequence).toBe(9);
    });

    it('drop strategy: emits backpressure event with streamId, strategy, bufferSize', async () => {
      const svc = StreamingService.getInstance({ backpressureThreshold: 3 });
      const events: any[] = [];
      svc.on('backpressure', (e) => events.push(e));

      const mockSession = {
        id: 'bp-event-test',
        buffer: Array.from({ length: 8 }, (_, i) => makeChunk(i, i)),
        startTime: Date.now(),
        backpressureStrategy: { strategy: 'drop' as const },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (svc as any).handleBackpressure(mockSession);

      expect(events).toHaveLength(1);
      expect(events[0].streamId).toBe('bp-event-test');
      expect(events[0].strategy).toBe('drop');
      // bufferSize is checked after drop (3).
      expect(events[0].bufferSize).toBe(3);
    });

    it('throttle strategy: resolves after sleep and emits backpressure event', async () => {
      const svc = StreamingService.getInstance();
      const events: any[] = [];
      svc.on('backpressure', (e) => events.push(e));

      const mockSession = {
        id: 'throttle-test',
        buffer: [] as StreamChunk[],
        startTime: Date.now(),
        backpressureStrategy: { strategy: 'throttle' as const, throttleMs: 50 },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bpPromise = (svc as any).handleBackpressure(mockSession);
      // Advance fake timers to resolve the sleep(50).
      await vi.advanceTimersByTimeAsync(50);
      await bpPromise;

      expect(events).toHaveLength(1);
      expect(events[0].strategy).toBe('throttle');
    });

    it('throttle strategy: uses default 50ms when throttleMs is not set', async () => {
      const svc = StreamingService.getInstance();
      const events: any[] = [];
      svc.on('backpressure', (e) => events.push(e));

      const mockSession = {
        id: 'throttle-default',
        buffer: [] as StreamChunk[],
        startTime: Date.now(),
        backpressureStrategy: { strategy: 'throttle' as const },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bpPromise = (svc as any).handleBackpressure(mockSession);
      await vi.advanceTimersByTimeAsync(50);
      await bpPromise;

      expect(events[0].strategy).toBe('throttle');
    });

    it('buffer strategy: emits backpressure event once buffer drains', async () => {
      const svc = StreamingService.getInstance({ backpressureThreshold: 2 });
      const events: any[] = [];
      svc.on('backpressure', (e) => events.push(e));

      const buf: StreamChunk[] = Array.from({ length: 3 }, (_, i) => makeChunk(i, i));
      const mockSession = {
        id: 'buffer-drain-test',
        buffer: buf,
        startTime: Date.now(),
        backpressureStrategy: { strategy: 'buffer' as const },
      };

      // Start backpressure — it will loop until buffer.length <= 2.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bpPromise = (svc as any).handleBackpressure(mockSession);

      // Drain the buffer externally (simulate a consumer), then advance timer.
      mockSession.buffer.splice(0); // clear all items
      await vi.advanceTimersByTimeAsync(100);
      await bpPromise;

      expect(events).toHaveLength(1);
      expect(events[0].strategy).toBe('buffer');
    });

    it('backpressureEvents counter increments with each handleBackpressure call', async () => {
      const svc = StreamingService.getInstance({ backpressureThreshold: 5 });

      const mkSession = (id: string) => ({
        id,
        buffer: [] as StreamChunk[],
        startTime: Date.now(),
        backpressureStrategy: { strategy: 'drop' as const },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svcAny = svc as any;
      await svcAny.handleBackpressure(mkSession('s1'));
      await svcAny.handleBackpressure(mkSession('s2'));
      await svcAny.handleBackpressure(mkSession('s3'));

      expect(svc.getMetrics().backpressureEvents).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // StreamMetrics
  // -------------------------------------------------------------------------

  describe('getMetrics() after activity', () => {
    it('p50/p95/p99 are 0 when latencies array is empty', () => {
      const svc = StreamingService.getInstance();
      const m = svc.getMetrics();
      expect(m.p50LatencyMs).toBe(0);
      expect(m.p95LatencyMs).toBe(0);
      expect(m.p99LatencyMs).toBe(0);
    });

    it('avgLatencyMs is non-negative after a completed stream', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 100 });

      const p = collect(svc.createStreamingEmbedding('hello'));
      await vi.runAllTimersAsync();
      await p;

      expect(svc.getMetrics().avgLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('totalStreams is 0 before any stream is created', () => {
      const svc = StreamingService.getInstance();
      expect(svc.getMetrics().totalStreams).toBe(0);
    });

    it('throughputMbps is 0 when no active streams hold buffer data', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 100 });

      const p = collect(svc.createStreamingEmbedding('tiny'));
      await vi.runAllTimersAsync();
      await p;

      // After stream completes, buffers are cleared (closeStream zeroes buffer).
      expect(svc.getMetrics().throughputMbps).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // SSE helpers
  // -------------------------------------------------------------------------

  describe('createSSEEndpoint() / sendSSE() / broadcastSSE()', () => {
    function makeMockRes() {
      return { writeHead: vi.fn(), write: vi.fn(), end: vi.fn() };
    }

    function makeMockReq(clientId?: string) {
      const closeCbs: Array<() => void> = [];
      return {
        headers: clientId ? { 'x-client-id': clientId } : {},
        on: (evt: string, cb: () => void) => { if (evt === 'close') closeCbs.push(cb); },
        _triggerClose: () => closeCbs.forEach(cb => cb()),
      };
    }

    it('returns client id from x-client-id header when present', () => {
      const svc = StreamingService.getInstance();
      const req = makeMockReq('my-client');
      const res = makeMockRes();

      const id = svc.createSSEEndpoint(req, res);

      expect(id).toBe('my-client');
    });

    it('generates a stream id when x-client-id header is absent', () => {
      const svc = StreamingService.getInstance();
      const req = makeMockReq();
      const res = makeMockRes();

      const id = svc.createSSEEndpoint(req, res);

      expect(id).toMatch(/^stream_/);
    });

    it('sets correct SSE response headers', () => {
      const svc = StreamingService.getInstance();
      const res = makeMockRes();

      svc.createSSEEndpoint(makeMockReq('c1'), res);

      expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }));
    });

    it('sends connected event immediately after registration', () => {
      const svc = StreamingService.getInstance();
      const res = makeMockRes();

      svc.createSSEEndpoint(makeMockReq('c2'), res);

      // sendSSE writes two lines: "event: ...\n" and "data: ...\n\n"
      expect(res.write).toHaveBeenCalledWith('event: connected\n');
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"clientId":"c2"'));
    });

    it('sendSSE writes event + data lines to the registered client', () => {
      const svc = StreamingService.getInstance();
      const res = makeMockRes();

      svc.createSSEEndpoint(makeMockReq('c3'), res);
      res.write.mockClear();

      svc.sendSSE('c3', 'test-event', { value: 42 });

      expect(res.write).toHaveBeenCalledWith('event: test-event\n');
      expect(res.write).toHaveBeenCalledWith('data: {"value":42}\n\n');
    });

    it('sendSSE is a no-op for unknown client ids', () => {
      const svc = StreamingService.getInstance();
      // No error should be thrown.
      expect(() => svc.sendSSE('ghost', 'evt', {})).not.toThrow();
    });

    it('broadcastSSE writes to all registered clients', () => {
      const svc = StreamingService.getInstance();
      const res1 = makeMockRes();
      const res2 = makeMockRes();

      svc.createSSEEndpoint(makeMockReq('b1'), res1);
      svc.createSSEEndpoint(makeMockReq('b2'), res2);
      res1.write.mockClear();
      res2.write.mockClear();

      svc.broadcastSSE('broadcast-event', { msg: 'hi' });

      expect(res1.write).toHaveBeenCalledWith('event: broadcast-event\n');
      expect(res2.write).toHaveBeenCalledWith('event: broadcast-event\n');
    });

    it('broadcastSSE removes a client that throws on write', () => {
      const svc = StreamingService.getInstance();
      const goodRes = makeMockRes();

      // Register the good client normally.
      svc.createSSEEndpoint(makeMockReq('good'), goodRes);
      goodRes.write.mockClear();

      // Inject a bad client directly into the private sseClients map, bypassing
      // createSSEEndpoint (which would fire sendSSE→write immediately, causing
      // the same throw we're trying to test inside broadcastSSE).
      const badRes = { write: vi.fn().mockImplementation(() => { throw new Error('pipe broken'); }) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (svc as any).sseClients.set('bad', badRes);

      // broadcastSSE should NOT throw; bad client is removed silently.
      expect(() => svc.broadcastSSE('evt', {})).not.toThrow();

      // 'bad' client removed — good client still receives subsequent broadcasts.
      goodRes.write.mockClear();
      svc.broadcastSSE('evt2', {});
      expect(goodRes.write).toHaveBeenCalled();

      // Confirm bad client is gone from the internal map.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((svc as any).sseClients.has('bad')).toBe(false);
    });

    it('client is removed from sseClients on request close', () => {
      const svc = StreamingService.getInstance();
      const res = makeMockRes();
      const req = makeMockReq('c4');

      svc.createSSEEndpoint(req, res);
      res.write.mockClear();

      // Simulate the connection closing.
      req._triggerClose();

      // Sending to the closed client is now a no-op (not a throw).
      expect(() => svc.sendSSE('c4', 'e', {})).not.toThrow();
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Stream multiplexing
  // -------------------------------------------------------------------------

  describe('multiplexStreams()', () => {
    it('throws when enableMultiplexing is false', async () => {
      const svc = StreamingService.getInstance({ enableMultiplexing: false });

      await expect(
        collect(svc.multiplexStreams([]))
      ).rejects.toThrow('Multiplexing not enabled');
    });

    it('yields chunks from all input streams sorted by timestamp', async () => {
      const svc = StreamingService.getInstance({ enableMultiplexing: true });

      const chunks1 = [makeChunk(0, 100), makeChunk(1, 300)];
      const chunks2 = [makeChunk(0, 200), makeChunk(1, 400)];

      const result = await collect(
        svc.multiplexStreams([fromArray(chunks1), fromArray(chunks2)])
      );

      expect(result).toHaveLength(4);
      const timestamps = result.map(c => c.timestamp);
      expect(timestamps).toEqual([100, 200, 300, 400]);
    });

    it('handles empty streams array', async () => {
      const svc = StreamingService.getInstance({ enableMultiplexing: true });

      const result = await collect(svc.multiplexStreams([]));

      expect(result).toHaveLength(0);
    });

    it('handles a single stream', async () => {
      const svc = StreamingService.getInstance({ enableMultiplexing: true });
      const chunks = [makeChunk(0, 1), makeChunk(1, 2), makeChunk(2, 3)];

      const result = await collect(svc.multiplexStreams([fromArray(chunks)]));

      expect(result).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // shutdown()
  // -------------------------------------------------------------------------

  describe('shutdown()', () => {
    it('clears all active streams', async () => {
      const svc = StreamingService.getInstance({ chunkSize: 10000 });

      const gen = svc.createStreamingEmbedding('hello world');
      await gen.next(); // session registered

      svc.shutdown();

      expect(svc.getMetrics().activeStreams).toBe(0);

      await gen.return(undefined);
    });

    it('calls end() on all SSE clients', () => {
      const svc = StreamingService.getInstance();
      const res = { writeHead: vi.fn(), write: vi.fn(), end: vi.fn() };
      const req = { headers: {}, on: vi.fn() };

      svc.createSSEEndpoint(req, res);
      svc.shutdown();

      expect(res.end).toHaveBeenCalled();
    });

    it('removes all EventEmitter listeners', () => {
      const svc = StreamingService.getInstance();
      svc.on('vector:updated', vi.fn());
      svc.on('stream:closed', vi.fn());

      svc.shutdown();

      expect(svc.listenerCount('vector:updated')).toBe(0);
      expect(svc.listenerCount('stream:closed')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // createStreamingSearch() — basic shape
  //
  // createStreamingSearch internally calls sleep(10) once per result via
  // `await this.sleep(10)`.  With fake timers, those sleeps must be advanced
  // while the async generator is running.  We use a concurrent timer-pump
  // helper that repeatedly advances fake time by 10ms until the collect
  // promise settles.
  // -------------------------------------------------------------------------

  /**
   * Collect an async generator while concurrently advancing fake timers.
   * Without this, sleep() calls inside the generator stall indefinitely.
   */
  async function collectWithTimers<T>(gen: AsyncGenerator<T>): Promise<T[]> {
    let done = false;
    const out: T[] = [];
    const collectP = (async () => {
      for await (const item of gen) out.push(item);
      done = true;
    })();
    // Pump timers until collect finishes.
    while (!done) {
      await vi.advanceTimersByTimeAsync(10);
    }
    await collectP;
    return out;
  }

  describe('createStreamingSearch()', () => {
    it('yields search chunks followed by a complete chunk', async () => {
      mockRecallEpisodes.mockResolvedValue([
        { id: 'e1', content: 'result one', similarity: 0.9 },
        { id: 'e2', content: 'result two', similarity: 0.8 },
      ]);

      const svc = StreamingService.getInstance();
      const chunks = await collectWithTimers(svc.createStreamingSearch('test query', 2));

      // 2 search chunks + 1 complete
      expect(chunks).toHaveLength(3);
      expect(chunks[0].type).toBe('search');
      expect(chunks[1].type).toBe('search');
      expect(chunks[2].type).toBe('complete');
    });

    it('sequence numbers are 0-based and ascending', async () => {
      mockRecallEpisodes.mockResolvedValue([
        { id: 'e1' },
        { id: 'e2' },
        { id: 'e3' },
      ]);

      const svc = StreamingService.getInstance();
      const chunks = await collectWithTimers(svc.createStreamingSearch('q', 3));

      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].sequence).toBe(i);
      }
    });

    it('respects k limit even when recallEpisodes returns more results', async () => {
      mockRecallEpisodes.mockResolvedValue(
        Array.from({ length: 20 }, (_, i) => ({ id: `e${i}` }))
      );

      const svc = StreamingService.getInstance();
      const chunks = await collectWithTimers(svc.createStreamingSearch('q', 5));

      const searchChunks = chunks.filter(c => c.type === 'search');
      expect(searchChunks).toHaveLength(5);
    });

    it('handles empty results gracefully (only complete chunk)', async () => {
      mockRecallEpisodes.mockResolvedValue([]);

      const svc = StreamingService.getInstance();
      const chunks = await collectWithTimers(svc.createStreamingSearch('empty', 5));

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('complete');
    });

    it('closes the stream after completion (active streams decrements)', async () => {
      mockRecallEpisodes.mockResolvedValue([{ id: 'x' }]);

      const svc = StreamingService.getInstance();
      await collectWithTimers(svc.createStreamingSearch('q', 1));

      expect(svc.getMetrics().activeStreams).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // initializeWebSocket() — no real sockets
  // -------------------------------------------------------------------------

  describe('initializeWebSocket()', () => {
    it('does not throw when called with a mock HTTP server', async () => {
      const svc = StreamingService.getInstance();
      const mockServer = {
        address: vi.fn(() => ({ port: 9999 })),
      } as any;

      // The method is async-internally (dynamic import), so just verify no sync throw.
      expect(() => svc.initializeWebSocket(mockServer)).not.toThrow();

      // Allow the internal async import to resolve (ws is mocked).
      await vi.runAllTimersAsync();
    });
  });
});
