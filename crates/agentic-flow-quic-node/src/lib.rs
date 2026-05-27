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
