// Native QUIC transport — wraps the `@sparkleideas/agentic-flow-quic-native-<triple>`
// napi-rs binding (ADR-0265 Phase 1) behind the same `AgentTransport`
// interface as `WebSocketFallbackTransport`. Picked by `loadQuicTransport`
// when `AGENTIC_FLOW_QUIC_NATIVE=1` AND a per-platform binding loads.
//
// The binding is held opaquely (`unknown` cast) so this module can be
// imported even when no native binding is installed — the loader's
// availability probe is the gate.

import { logger } from '../utils/logger.js';
import {
  AgentMessage,
  AgentTransport,
  DEFAULT_STREAM_ID,
  InboundMessageHandler,
  OnMessageOptions,
  PoolStatistics,
  QuicTransportConfig,
} from './quic-loader.js';

/**
 * Shape exposed by the native binding crate (`crates/agentic-flow-quic-node`).
 * Pinned by ADR-0265 §"Cross-package symbol contracts".
 */
export interface NativeQuicBinding {
  connect(
    addr: string,
    config: NativeConnectionConfig,
  ): Promise<number>;
  send(
    connId: number,
    bytes: Buffer,
    messageType?: string,
  ): Promise<void>;
  close(connId: number): Promise<void>;
  closeAll(): Promise<void>;
  stats(connId: number): Promise<NativeConnectionStats>;
  poolStats(): Promise<NativePoolStats>;
  listen(
    port: number,
    config: NativeConnectionConfig,
    onMessage: (inbound: NativeInboundMessage) => void,
  ): number;
}

export interface NativeConnectionConfig {
  serverName: string;
  maxIdleTimeoutMs: number;
  maxConcurrentStreams: number;
  enable0Rtt: boolean;
}

export interface NativeConnectionStats {
  rttUs: number;
  bytesSent: number;
  bytesReceived: number;
  congestionWindow: number;
  lostPackets: number;
}

export interface NativePoolStats {
  active: number;
  idle: number;
  totalCreated: number;
  totalClosed: number;
  currentStreams: number;
}

export interface NativeInboundMessage {
  address: string;
  messageId: string;
  messageType: string;
  payload: Buffer;
}

/**
 * QuicError suffix encoded by the Rust side. The crate emits messages
 * shaped `"<category>: <human msg> | {"code":"...","recoverable":...}"`.
 * Parse the suffix to surface structured metadata to callers.
 */
export interface ParsedNativeQuicError {
  code: string;
  recoverable: boolean;
  message: string;
}

export function parseNativeQuicError(e: unknown): ParsedNativeQuicError | null {
  if (!(e instanceof Error)) return null;
  const idx = e.message.lastIndexOf(' | ');
  if (idx < 0) return null;
  try {
    const meta = JSON.parse(e.message.slice(idx + 3));
    if (
      typeof meta === 'object' &&
      meta !== null &&
      typeof (meta as { code?: unknown }).code === 'string' &&
      typeof (meta as { recoverable?: unknown }).recoverable === 'boolean'
    ) {
      return {
        code: (meta as { code: string }).code,
        recoverable: (meta as { recoverable: boolean }).recoverable,
        message: e.message.slice(0, idx),
      };
    }
  } catch {
    /* not our suffix */
  }
  return null;
}

/**
 * `AgentTransport` implementation backed by the native QUIC binding.
 *
 * Per-stream queues + handler dispatch mirror `WebSocketFallbackTransport`
 * so callers see identical semantics across backends (the AgentTransport
 * cast at `plugin.ts` continues to work without runtime branching).
 */
export class NativeQuicTransport implements AgentTransport {
  private readonly binding: NativeQuicBinding;
  /** `address -> connId`. The opaque id from `binding.connect()`. */
  private readonly connections = new Map<string, number>();
  /** Per-(address, streamId) FIFO. Composite key `${address}#${streamId}`. */
  private readonly messageQueue = new Map<string, AgentMessage[]>();
  private readonly inboundHandlers = new Set<{
    handler: InboundMessageHandler;
    streamId?: string | number;
  }>();
  /** `port -> serverHandle`. Servers stay alive until process exit. */
  private readonly servers = new Map<number, number>();

  private constructor(
    binding: NativeQuicBinding,
    private readonly config: Required<QuicTransportConfig>,
  ) {
    this.binding = binding;
  }

  static async create(
    binding: NativeQuicBinding,
    config: QuicTransportConfig = {},
  ): Promise<NativeQuicTransport> {
    const fullConfig: Required<QuicTransportConfig> = {
      serverName: config.serverName ?? 'localhost',
      maxIdleTimeoutMs: config.maxIdleTimeoutMs ?? 30000,
      maxConcurrentStreams: config.maxConcurrentStreams ?? 100,
      enable0Rtt: config.enable0Rtt ?? true,
      tls: config.tls ?? {},
    };
    return new NativeQuicTransport(binding, fullConfig);
  }

  /** Compose the per-(address, streamId) queue key. */
  private queueKey(address: string, streamId: string | number): string {
    return `${address}#${streamId}`;
  }

  private streamOf(message: AgentMessage): string | number {
    return message.streamId ?? DEFAULT_STREAM_ID;
  }

  private nativeConfig(): NativeConnectionConfig {
    return {
      serverName: this.config.serverName,
      maxIdleTimeoutMs: this.config.maxIdleTimeoutMs,
      maxConcurrentStreams: this.config.maxConcurrentStreams,
      enable0Rtt: this.config.enable0Rtt,
    };
  }

  private async getOrCreateConnId(address: string): Promise<number> {
    const existing = this.connections.get(address);
    if (existing !== undefined) return existing;
    const connId = await this.binding.connect(address, this.nativeConfig());
    this.connections.set(address, connId);
    return connId;
  }

  /**
   * Bind a server-side listener. Like the WS fallback's `listen()`, this
   * enables bidirectional federation: the same transport instance can
   * receive AND send. The binding spawns the accept loop on its own
   * tokio runtime; messages flow through the ThreadsafeFunction
   * callback into `messageQueue` and registered inbound handlers.
   */
  async listen(port: number, _host = '0.0.0.0'): Promise<void> {
    if (this.servers.has(port)) return;
    const serverHandle = this.binding.listen(
      port,
      this.nativeConfig(),
      (inbound) => {
        try {
          const payload = decodePayload(inbound.payload);
          const message: AgentMessage = {
            id: inbound.messageId,
            type: inbound.messageType,
            payload,
          };
          const key = this.queueKey(inbound.address, this.streamOf(message));
          const queue = this.messageQueue.get(key) ?? [];
          queue.push(message);
          this.messageQueue.set(key, queue);
          this.dispatchInbound(inbound.address, message);
        } catch (err) {
          logger.warn('Dropped malformed inbound native QUIC message', {
            address: inbound.address,
            err,
          });
        }
      },
    );
    this.servers.set(port, serverHandle);
  }

  async send(address: string, message: AgentMessage): Promise<void> {
    const connId = await this.getOrCreateConnId(address);
    const payload = encodePayload(message.payload);
    // `message.type` is the AgentMessage type discriminator; the native
    // side maps `'task'|'result'|'status'|'coordination'|'heartbeat'`
    // to MessageType variants and anything else to MessageType::Custom.
    await this.binding.send(connId, payload, message.type);
  }

  async receive(
    address: string,
    streamId: string | number = DEFAULT_STREAM_ID,
  ): Promise<AgentMessage> {
    const key = this.queueKey(address, streamId);
    const queue = this.messageQueue.get(key) ?? [];
    if (queue.length > 0) return queue.shift()!;
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const q = this.messageQueue.get(key) ?? [];
        if (q.length > 0) {
          clearInterval(interval);
          resolve(q.shift()!);
        }
      }, 100);
    });
  }

  async request(address: string, message: AgentMessage): Promise<AgentMessage> {
    await this.send(address, message);
    return this.receive(address);
  }

  async sendBatch(address: string, messages: AgentMessage[]): Promise<void> {
    await Promise.all(messages.map((m) => this.send(address, m)));
  }

  async getStats(): Promise<PoolStatistics> {
    const stats = await this.binding.poolStats();
    return {
      active: stats.active,
      idle: stats.idle,
      created: stats.totalCreated,
      closed: stats.totalClosed,
    };
  }

  async close(): Promise<void> {
    this.connections.clear();
    this.messageQueue.clear();
    // Servers can't be closed individually in the Phase-1 binding —
    // their lifetime ends with the process. `closeAll()` drains all
    // client-side state in the Rust registry.
    await this.binding.closeAll();
  }

  onMessage(
    handler: InboundMessageHandler,
    options: OnMessageOptions = {},
  ): void {
    this.inboundHandlers.add({ handler, streamId: options.streamId });
  }

  private dispatchInbound(address: string, message: AgentMessage): void {
    if (this.inboundHandlers.size === 0) return;
    const msgStream = this.streamOf(message);
    for (const entry of this.inboundHandlers) {
      if (entry.streamId !== undefined && entry.streamId !== msgStream) continue;
      try {
        const r = entry.handler(address, message);
        if (r && typeof (r as Promise<void>).catch === 'function') {
          (r as Promise<void>).catch((err) => {
            logger.warn('Inbound handler rejected', { address, err });
          });
        }
      } catch (err) {
        logger.warn('Inbound handler threw', { address, err });
      }
    }
  }
}

/**
 * Best-effort payload decode. The native side carries opaque bytes; if
 * the bytes are valid JSON we hand the parsed value back so the
 * AgentMessage shape matches WS fallback. Otherwise we keep the raw
 * Buffer — caller decides how to interpret.
 */
function decodePayload(bytes: Buffer): unknown {
  if (bytes.length === 0) return null;
  // Cheap JSON sniff: if it looks like JSON, try parsing.
  const first = bytes[0];
  if (first === 0x7b || first === 0x5b || first === 0x22) {
    try {
      return JSON.parse(bytes.toString('utf8'));
    } catch {
      /* fall through */
    }
  }
  return bytes;
}

/**
 * Encode `AgentMessage.payload` for the wire. JSON for any non-Buffer
 * value; raw bytes pass through unchanged so callers can opt into
 * binary framing (the AgentMessage interface declares `payload:
 * unknown`, so callers ARE permitted to pass a Buffer directly).
 */
function encodePayload(payload: unknown): Buffer {
  if (Buffer.isBuffer(payload)) return payload;
  if (payload instanceof Uint8Array) return Buffer.from(payload);
  return Buffer.from(JSON.stringify(payload ?? null), 'utf8');
}
