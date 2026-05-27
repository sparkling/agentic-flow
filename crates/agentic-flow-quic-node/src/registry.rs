//! Opaque-ID registries for clients, connections, and servers.
//!
//! `quinn::Connection` and `QuicClient`/`QuicServer` MUST NOT cross the
//! napi boundary — N-API would either reject the non-`Sync` quinn types
//! or force complex `External<T>` boxing that JS code can mishandle.
//! Instead each handle is registered here and a `u32` ID is returned.
//!
//! Two namespaces are tracked:
//!   - Connections (client side): an outbound `quinn::Connection`
//!     keyed by an auto-incrementing `u32`.
//!   - Servers: a `ServerHandle` wrapping the upstream `QuicServer`
//!     plus the shutdown trigger.
//!
//! Plus one shared map for `QuicClient` instances reused by SNI server-
//! name — the upstream client owns the endpoint + connection pool, so
//! we keep ONE per `(server_name, max_idle_timeout_ms, …)` config tuple.
//! Callers don't see this; they only see `connId`.

use agentic_flow_quic::{QuicClient, QuicServer};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use quinn::Connection;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;

/// Per-connection registry entry.
pub struct ConnEntry {
    pub connection: Connection,
    /// The client whose endpoint owns this connection. Held so the
    /// endpoint stays alive while at least one connection is registered
    /// against it.
    pub client: Arc<QuicClient>,
}

/// Per-server registry entry. Holds the `QuicServer` plus a shutdown
/// trigger (closes the endpoint, which causes `run()` to return Ok).
pub struct ServerEntry {
    pub server: Arc<QuicServer>,
    /// Set to `Some(handle)` when the accept loop is spawned. Closing
    /// the server cancels via `server.close()` — the join handle is
    /// here only to drop on close.
    pub _accept_task: tokio::task::JoinHandle<()>,
    pub _drain_task: tokio::task::JoinHandle<()>,
}

#[derive(Default)]
pub struct Registry {
    pub connections: HashMap<u32, ConnEntry>,
    pub servers: HashMap<u32, ServerEntry>,
    /// `QuicClient` cache keyed by `server_name`. Reuses the upstream
    /// pool when callers re-connect with the same SNI.
    pub clients: HashMap<String, Arc<QuicClient>>,
}

pub static REGISTRY: Lazy<Mutex<Registry>> = Lazy::new(|| Mutex::new(Registry::default()));

static NEXT_CONN_ID: AtomicU32 = AtomicU32::new(1);
static NEXT_SERVER_ID: AtomicU32 = AtomicU32::new(1);

pub fn next_conn_id() -> u32 {
    NEXT_CONN_ID.fetch_add(1, Ordering::SeqCst)
}

pub fn next_server_id() -> u32 {
    NEXT_SERVER_ID.fetch_add(1, Ordering::SeqCst)
}
