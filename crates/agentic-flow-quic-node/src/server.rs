//! Server-side N-API entry point.
//!
//! Exposes `listen(port, config, onMessage) -> serverHandle`. The
//! `onMessage` callback is invoked for every received `QuicMessage`
//! with `(addr: string, payload: Buffer, messageType: string,
//! messageId: string)`. JS layer wraps this into the `AgentMessage`
//! shape the loader uses.

use crate::error::map as map_err;
use crate::registry::{next_server_id, ServerEntry, REGISTRY};
use agentic_flow_quic::{types::ConnectionConfig as RustConnectionConfig, QuicServer};
use napi::bindgen_prelude::Buffer;
use napi::threadsafe_function::{
    ErrorStrategy, ThreadSafeCallContext, ThreadsafeFunction, ThreadsafeFunctionCallMode,
};
use napi::JsFunction;
use napi_derive::napi;
use std::net::SocketAddr;
use std::sync::Arc;

use crate::client::ConnectionConfig;

/// Inbound message payload pushed to the JS callback. Field-name parity
/// with the JS-side `AgentMessage` shape (post-loader normalisation):
///   - `address` — peer `host:port`
///   - `messageId` — upstream `QuicMessage.id` (uuid)
///   - `messageType` — upstream `MessageType` flattened to string
///   - `payload` — raw bytes (the upstream `QuicMessage.payload`)
#[napi(object)]
pub struct InboundMessage {
    pub address: String,
    pub message_id: String,
    pub message_type: String,
    pub payload: Buffer,
}

/// Bind a server on the given port and start accepting connections.
///
/// `on_message` is called for every received `QuicMessage`. It runs on
/// a libuv worker — the napi-rs `ThreadsafeFunction` machinery handles
/// the tokio-thread → libuv hop.
///
/// Returns a `serverHandle` (u32). Server shutdown is not part of the
/// Phase-1 surface — call `closeAll()` to drop client state; servers
/// die with the process. A `closeServer(handle)` can be added later
/// without breaking the contract.
#[napi]
pub fn listen(
    port: u16,
    config: ConnectionConfig,
    on_message: JsFunction,
) -> napi::Result<u32> {
    let tsfn: ThreadsafeFunction<InboundMessage, ErrorStrategy::CalleeHandled> = on_message
        .create_threadsafe_function(0, |ctx: ThreadSafeCallContext<InboundMessage>| {
            // The single-arg JS callback receives an object shaped per
            // `InboundMessage`. napi-rs handles the conversion from the
            // `#[napi(object)]` annotation.
            Ok(vec![ctx.value])
        })?;

    let bind_addr: SocketAddr = format!("0.0.0.0:{}", port)
        .parse()
        .map_err(|e: std::net::AddrParseError| {
            napi::Error::from_reason(format!("Invalid bind addr 0.0.0.0:{}: {}", port, e))
        })?;
    let rust_cfg: RustConnectionConfig = (&config).into();

    // Spawn the server creation + accept loop on the tokio runtime.
    // napi-rs gives us a runtime via the `tokio_rt` feature.
    let handle = tokio::runtime::Handle::try_current().map_err(|_| {
        napi::Error::from_reason(
            "No active tokio runtime — agentic-flow-quic-node requires the napi-rs tokio_rt feature",
        )
    })?;

    let (server, mut rx) = handle.block_on(async move {
        map_err(QuicServer::new(bind_addr, rust_cfg).await)
    })?;
    let server = Arc::new(server);

    let accept_server = Arc::clone(&server);
    let accept_task = handle.spawn(async move {
        if let Err(e) = accept_server.run().await {
            // Server runs until the endpoint is closed; an Err here
            // means a fatal error in the accept loop. Log via tracing
            // (upstream uses tracing) — JS sees this as a stuck server.
            tracing::error!("QUIC server accept loop exited with error: {}", e);
        }
    });

    let drain_tsfn = tsfn.clone();
    let drain_task = handle.spawn(async move {
        // Drain `mpsc::UnboundedReceiver<(SocketAddr, QuicMessage)>`
        // and invoke the JS callback for each.
        while let Some((remote_addr, msg)) = rx.recv().await {
            let inbound = InboundMessage {
                address: remote_addr.to_string(),
                message_id: msg.id,
                message_type: stringify_message_type(&msg.msg_type),
                payload: Buffer::from(msg.payload.to_vec()),
            };
            // NonBlocking: if the JS event loop is backed up the
            // message is queued. Errors here just mean the JS function
            // threw — log and continue.
            let status = drain_tsfn.call(Ok(inbound), ThreadsafeFunctionCallMode::NonBlocking);
            if status != napi::Status::Ok {
                tracing::warn!(
                    "ThreadsafeFunction.call returned non-Ok status: {:?}",
                    status
                );
            }
        }
    });

    let server_id = next_server_id();
    {
        let mut reg = REGISTRY.lock();
        reg.servers.insert(
            server_id,
            ServerEntry {
                server,
                _accept_task: accept_task,
                _drain_task: drain_task,
            },
        );
    }
    Ok(server_id)
}

/// Convert upstream `MessageType` back to the lowercase string the JS
/// layer expects (`'task' | 'result' | 'status' | 'coordination' |
/// 'heartbeat' | <custom>`).
fn stringify_message_type(t: &agentic_flow_quic::types::MessageType) -> String {
    use agentic_flow_quic::types::MessageType::*;
    match t {
        Task => "task".to_string(),
        Result => "result".to_string(),
        Status => "status".to_string(),
        Coordination => "coordination".to_string(),
        Heartbeat => "heartbeat".to_string(),
        Custom(s) => s.clone(),
    }
}
