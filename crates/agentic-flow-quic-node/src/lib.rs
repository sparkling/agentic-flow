//! Node.js bindings for agentic-flow-quic via NAPI-RS.
//!
//! ADR-0265 Phase 1 deliverable. Wraps the native `QuicClient` and
//! `QuicServer` from `agentic-flow-quic` and exposes a stable opaque-id
//! API to JavaScript. The `quinn::Connection` value is NEVER surfaced
//! across the napi boundary — callers receive an integer `connId` /
//! `serverHandle` and address every operation through the registry in
//! [`registry`].
//!
//! Public exports (top-level `#[napi]` functions) are pinned by the
//! ADR-0265 cross-package symbol contract:
//!   - `connect`, `send`, `close`, `closeAll`, `stats` (client side)
//!   - `listen` (server side)
//!   - `poolStats` (aggregate)
//!
//! See `crates/agentic-flow-quic-node/README.md` and ADR-0265
//! §"Cross-package symbol contracts" for the full surface.

#![cfg(not(target_family = "wasm"))]
#![allow(clippy::too_many_arguments)]

mod client;
mod error;
mod registry;
mod server;

// Re-export the top-level `#[napi]`-annotated functions so napi-rs's
// codegen discovers them at the crate root. Sub-modules keep their own
// `#[napi]` annotations; the `pub use` here is for code organisation.
pub use client::{close, close_all, connect, pool_stats, send, stats};
pub use server::{get_local_addr, listen};

// Install the rustls process-wide CryptoProvider exactly once, at first
// use of any wrapper entry point. Upstream `agentic-flow-quic`'s
// QuicClient::new / QuicServer::new do NOT call install_default in
// production code (only in their #[cfg(test)] modules — see
// `crates/agentic-flow-quic/src/{client,server}.rs:230-240`), so any
// `connect()` or `listen()` from this wrapper otherwise panics at
// rustls/quinn TLS setup with "Could not automatically determine the
// process-level CryptoProvider".
//
// `install_default()` is idempotent at the API level (returns
// `Result<(), Arc<CryptoProvider>>` — Err on second call). We discard
// the result; subsequent calls become no-ops.
pub(crate) fn ensure_crypto_provider_installed() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rustls::crypto::ring::default_provider().install_default();
    });
}
