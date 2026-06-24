// src-tauri/src/lib.rs
// Re-export for Tauri's mobile lib target
mod models; // <-- Add this exact line right here!
pub use crate::models::*;
