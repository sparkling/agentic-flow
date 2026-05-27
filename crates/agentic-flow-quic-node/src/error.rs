//! `QuicError` → `napi::Error` mapping.
//!
//! The structured shape from ADR-0265 §Phase 1:
//! ```text
//! { code: <category>, recoverable: <bool> }
//! ```
//! is embedded in the error MESSAGE as a JSON suffix so JS callers can
//! parse it. napi-rs 2.x doesn't have a clean way to attach a structured
//! payload to a thrown `napi::Error`, so we serialise the metadata into
//! the message: `"<category>: <msg> | {\"code\":\"…\",\"recoverable\":…}"`.
//!
//! Upstream JS shape used by `quic-loader.ts`:
//!   try { await native.connect(...) }
//!   catch (e: any) {
//!     const meta = parseQuicError(e);    // best-effort parse of the
//!     // …                               // suffix
//!   }
//! That helper lives in the loader (Phase 3 wiring) — this file is the
//! producer side only.

use agentic_flow_quic::QuicError;
use napi::{Error as NapiError, Status};

/// Convert a `QuicError` into a `napi::Error`. The error MESSAGE encodes
/// `{ code, recoverable }` as a JSON suffix for JS-side parsing.
pub fn to_napi_error(err: QuicError) -> NapiError {
    let category = err.category();
    let recoverable = err.is_recoverable();
    // Use serde_json to encode the structured suffix safely (escapes
    // quotes / control chars inside the message).
    let suffix = serde_json::json!({
        "code": category,
        "recoverable": recoverable,
    });
    let message = format!("{}: {} | {}", category, err, suffix);
    NapiError::new(Status::GenericFailure, message)
}

/// Convert any `Result<T, QuicError>` into a napi::Result.
pub fn map<T>(r: agentic_flow_quic::Result<T>) -> napi::Result<T> {
    r.map_err(to_napi_error)
}
