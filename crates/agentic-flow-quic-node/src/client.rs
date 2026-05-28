//! Client-side N-API entry points.
//!
//! ADR-0265 §"Cross-package symbol contracts" — the top-level
//! `#[napi]`-annotated functions exposed here MUST keep these exact
//! names (callers in `quic-loader.ts` import them by string):
//!   - `connect`     — open / reuse a `quinn::Connection`, return connId
//!   - `send`        — write a `QuicMessage` on a fresh `open_bi()`
//!   - `close`       — `connection.close(0, "shutdown")` + deregister
//!   - `closeAll`    — drain all client/connection state
//!   - `stats`       — `connection.stats()` snapshot
//!   - `poolStats`   — aggregated pool stats across cached clients

use crate::error::{map as map_err, to_napi_error};
use crate::registry::{next_conn_id, ConnEntry, REGISTRY};
use agentic_flow_quic::{
    types::{ConnectionConfig as RustConnectionConfig, MessageType, QuicMessage},
    QuicClient,
};
use bytes::Bytes;
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

/// Connection config mirrored across the napi boundary.
///
/// Field-name parity with `agentic_flow_quic::types::ConnectionConfig`
/// (snake_case in Rust → camelCase in JS via `#[napi(object)]`).
#[napi(object)]
pub struct ConnectionConfig {
    pub server_name: String,
    /// Milliseconds; mapped to `max_idle_timeout_ms` upstream.
    pub max_idle_timeout_ms: u32,
    pub max_concurrent_streams: u32,
    pub enable_0rtt: bool,
}

impl From<&ConnectionConfig> for RustConnectionConfig {
    fn from(c: &ConnectionConfig) -> Self {
        Self {
            server_name: c.server_name.clone(),
            max_idle_timeout_ms: u64::from(c.max_idle_timeout_ms),
            max_concurrent_streams: c.max_concurrent_streams,
            enable_0rtt: c.enable_0rtt,
        }
    }
}

/// `quinn::ConnectionStats` snapshot returned by [`stats`].
///
/// Field-name parity is informed by `quinn::ConnectionStats` but
/// flattened: we expose RTT (µs) + bytes counters + congestion window +
/// lost packets, which is what federation health checks read. Add more
/// later if a real consumer asks.
#[napi(object)]
pub struct ConnectionStats {
    pub rtt_us: u32,
    pub bytes_sent: u32,
    pub bytes_received: u32,
    /// Current congestion window estimate (bytes).
    pub congestion_window: u32,
    /// Cumulative lost packets observed by the local quinn instance.
    pub lost_packets: u32,
}

/// Aggregated pool stats across every cached `QuicClient`. Field
/// names mirror `agentic_flow_quic::types::PoolStats` so JS callers can
/// shape-check by key.
#[napi(object)]
pub struct PoolStats {
    pub active: u32,
    pub idle: u32,
    pub total_created: u32,
    pub total_closed: u32,
    pub current_streams: u32,
}

/// Open a new QUIC connection (or reuse a pooled one) and return an
/// opaque `connId`. The `quinn::Connection` value is held in the
/// registry — callers address every later operation by `connId`.
///
/// `addr` accepts any `SocketAddr`-parsable string (`"host:port"` or
/// `"ip:port"`). The SNI in `config.server_name` is what the upstream
/// `QuicClient` uses for TLS verification.
#[napi]
pub async fn connect(addr: String, config: ConnectionConfig) -> napi::Result<u32> {
    let socket_addr: std::net::SocketAddr = addr.parse().map_err(|e: std::net::AddrParseError| {
        napi::Error::from_reason(format!("Invalid address '{}': {}", addr, e))
    })?;

    let rust_cfg: RustConnectionConfig = (&config).into();
    let key = rust_cfg.server_name.clone();

    // Reuse the cached `QuicClient` for this SNI, or create one.
    //
    // Two passes so the `parking_lot::MutexGuard` is never alive across
    // an `.await` — napi-rs requires the future to be `Send`, and the
    // guard isn't.
    let cached: Option<Arc<QuicClient>> = {
        let reg = REGISTRY.lock();
        reg.clients.get(&key).cloned()
    };
    let client = if let Some(c) = cached {
        c
    } else {
        // Construct off-lock; another caller may race us — both build
        // a client but only one survives in the registry. The loser's
        // client drops harmlessly when `arc` goes out of scope.
        crate::ensure_crypto_provider_installed();
        let new_client = map_err(QuicClient::new(rust_cfg.clone()).await)?;
        let arc = Arc::new(new_client);
        let mut reg = REGISTRY.lock();
        if let Some(existing) = reg.clients.get(&key) {
            Arc::clone(existing)
        } else {
            reg.clients.insert(key, Arc::clone(&arc));
            arc
        }
    };

    let connection = map_err(client.connect(socket_addr).await)?;

    let conn_id = next_conn_id();
    {
        let mut reg = REGISTRY.lock();
        reg.connections.insert(
            conn_id,
            ConnEntry {
                connection,
                client,
            },
        );
    }
    Ok(conn_id)
}

/// Send raw bytes as a `QuicMessage` over a fresh `open_bi()` stream
/// on the connection identified by `conn_id`.
///
/// `message_type` defaults to `Custom(binary)` semantics — we map
/// the string to the upstream `MessageType` enum (`task` →
/// `MessageType::Task`, `result` → `Result`, …; anything else
/// becomes `MessageType::Custom(<string>)`).
#[napi]
pub async fn send(
    conn_id: u32,
    bytes: Buffer,
    message_type: Option<String>,
) -> napi::Result<()> {
    // Snapshot the connection out of the registry so we don't hold the
    // mutex across the await.
    let connection = {
        let reg = REGISTRY.lock();
        reg.connections
            .get(&conn_id)
            .map(|e| e.connection.clone())
            .ok_or_else(|| {
                napi::Error::from_reason(format!(
                    "Unknown connection id {} — connect() first or it was closed",
                    conn_id
                ))
            })?
    };

    let msg_type = parse_message_type(message_type.as_deref());
    let payload = Bytes::copy_from_slice(bytes.as_ref());
    let message = QuicMessage {
        id: Uuid::new_v4().to_string(),
        msg_type,
        payload,
        metadata: None,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    };

    let (mut send, _recv) = connection
        .open_bi()
        .await
        .map_err(|e| napi::Error::from_reason(format!("stream open_bi failed: {}", e)))?;

    let data = serde_json::to_vec(&message)
        .map_err(|e| napi::Error::from_reason(format!("serialize QuicMessage: {}", e)))?;
    send.write_all(&data)
        .await
        .map_err(|e| napi::Error::from_reason(format!("stream write_all: {}", e)))?;
    send.finish()
        .map_err(|e| napi::Error::from_reason(format!("stream finish: {}", e)))?;

    Ok(())
}

/// Close one connection. The underlying `QuicClient` (and its endpoint)
/// stays alive — call [`close_all`] to drop everything.
#[napi]
pub async fn close(conn_id: u32) -> napi::Result<()> {
    let entry = {
        let mut reg = REGISTRY.lock();
        reg.connections.remove(&conn_id)
    };
    if let Some(e) = entry {
        e.connection.close(0u32.into(), b"shutdown");
    }
    Ok(())
}

/// Drain every connection + cached client. Servers are NOT touched
/// here — `server::close` (if/when added) covers them. Today the
/// Phase-1 surface doesn't include a `closeServer`; callers shut down
/// the whole process to release server endpoints.
#[napi]
pub async fn close_all() -> napi::Result<()> {
    let (connections, clients) = {
        let mut reg = REGISTRY.lock();
        let connections: Vec<_> = reg.connections.drain().collect();
        let clients: Vec<_> = reg.clients.drain().collect();
        (connections, clients)
    };
    for (_id, entry) in connections {
        entry.connection.close(0u32.into(), b"shutdown");
    }
    for (_name, client) in clients {
        client.close().await;
    }
    Ok(())
}

/// Snapshot `connection.stats()` for one connection.
#[napi]
pub async fn stats(conn_id: u32) -> napi::Result<ConnectionStats> {
    let connection = {
        let reg = REGISTRY.lock();
        reg.connections
            .get(&conn_id)
            .map(|e| e.connection.clone())
            .ok_or_else(|| {
                napi::Error::from_reason(format!("Unknown connection id {}", conn_id))
            })?
    };
    let s = connection.stats();
    Ok(ConnectionStats {
        // `quinn::ConnectionStats::path::rtt` is a `Duration`. Convert
        // to microseconds for JS-side parity with upstream ConnectionMeta.
        rtt_us: u32::try_from(s.path.rtt.as_micros()).unwrap_or(u32::MAX),
        bytes_sent: u32::try_from(s.udp_tx.bytes).unwrap_or(u32::MAX),
        bytes_received: u32::try_from(s.udp_rx.bytes).unwrap_or(u32::MAX),
        congestion_window: u32::try_from(s.path.cwnd).unwrap_or(u32::MAX),
        lost_packets: u32::try_from(s.path.lost_packets).unwrap_or(u32::MAX),
    })
}

/// Aggregate pool stats across every cached client. Sums the upstream
/// `PoolStats` from each — gives federation observability a single
/// number per metric.
#[napi]
pub async fn pool_stats() -> napi::Result<PoolStats> {
    // Snapshot the clients so we can await `pool_stats()` without
    // holding the registry mutex.
    let clients: Vec<Arc<QuicClient>> = {
        let reg = REGISTRY.lock();
        reg.clients.values().cloned().collect()
    };
    let mut acc = PoolStats {
        active: 0,
        idle: 0,
        total_created: 0,
        total_closed: 0,
        current_streams: 0,
    };
    for c in clients {
        let s = c.pool_stats().await;
        acc.active = acc.active.saturating_add(u32::try_from(s.active).unwrap_or(u32::MAX));
        acc.idle = acc.idle.saturating_add(u32::try_from(s.idle).unwrap_or(u32::MAX));
        acc.total_created = acc
            .total_created
            .saturating_add(u32::try_from(s.total_created).unwrap_or(u32::MAX));
        acc.total_closed = acc
            .total_closed
            .saturating_add(u32::try_from(s.total_closed).unwrap_or(u32::MAX));
        acc.current_streams = acc
            .current_streams
            .saturating_add(u32::try_from(s.current_streams).unwrap_or(u32::MAX));
    }
    Ok(acc)
}

/// Parse the `messageType` string from the JS caller into the upstream
/// `MessageType` enum. Unknown strings become `MessageType::Custom(...)`.
fn parse_message_type(s: Option<&str>) -> MessageType {
    match s.unwrap_or("Custom").to_lowercase().as_str() {
        "task" => MessageType::Task,
        "result" => MessageType::Result,
        "status" => MessageType::Status,
        "coordination" => MessageType::Coordination,
        "heartbeat" => MessageType::Heartbeat,
        other => MessageType::Custom(other.to_string()),
    }
}

// Re-export the napi-side error helper so the server module can share it.
pub(crate) use crate::error::to_napi_error as _to_napi_error;
