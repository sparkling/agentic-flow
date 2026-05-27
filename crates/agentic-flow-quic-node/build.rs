// Build script for napi-rs code generation.
// Skipped on WASM targets (the crate isn't built there — see Cargo.toml
// `target.'cfg(not(target_family = "wasm"))'` blocks).

#[cfg(not(target_family = "wasm"))]
extern crate napi_build;

fn main() {
    #[cfg(not(target_family = "wasm"))]
    napi_build::setup();
}
