// src-tauri/src/models.rs
// Project VERA — Core data models and type definitions

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Model Tier & Provider Classification ─────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModelTier {
    FastBrain,
    MainArch,
    SpecMatrix,
    Pipeline,
    LocalBedrock,
    Management,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ModelProvider {
    Anthropic,
    OpenAI,
    Google,
    Meta,
    Mistral,
    Local,
    Groq,
    Perplexity,
}

// ─── VERA Core Hardcoded Routing Nodes ────────────────────────────────────────

pub struct ModelNode {
    pub tag: &'static str,
    pub api_name: &'static str,
    pub tier: ModelTier,
    pub provider: ModelProvider,
}

pub const VERA_CORE_NODES: &[ModelNode] = &[
    // [01] Fast Brain
    ModelNode { tag: "VERA-Triage", api_name: "gemini-2.5-flash", tier: ModelTier::FastBrain, provider: ModelProvider::Google },
    
    // [02] Main Arch
    ModelNode { tag: "VERA-Super-T1", api_name: "nvidia/nemotron-3-ultra-550b-a55b:free", tier: ModelTier::MainArch, provider: ModelProvider::OpenAI }, 
    ModelNode { tag: "VERA-Super-T2", api_name: "nousresearch/hermes-3-llama-3.1-405b:free", tier: ModelTier::MainArch, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Super-T3", api_name: "gemma4:31b", tier: ModelTier::MainArch, provider: ModelProvider::Local },
    
    // [03] Spec Matrix: Code
    ModelNode { tag: "VERA-Code-T1", api_name: "qwen/qwen3-coder:free", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Code-T2", api_name: "qwen/qwen3-next-80b-a3b-instruct:free", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Code-T3", api_name: "cohere/north-mini-code:free", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Code-Local", api_name: "qwen3:30b", tier: ModelTier::SpecMatrix, provider: ModelProvider::Local },
    
    // [03] Spec Matrix: Vision
    ModelNode { tag: "VERA-Visn-T1", api_name: "gemini-2.5-flash", tier: ModelTier::SpecMatrix, provider: ModelProvider::Google },
    ModelNode { tag: "VERA-Visn-T2", api_name: "nvidia/nemotron-3-super-120b-a12b:free", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Visn-Local", api_name: "gemma4:31b", tier: ModelTier::SpecMatrix, provider: ModelProvider::Local },
    
    // [03] Spec Matrix: Math
    ModelNode { tag: "VERA-Math-T1", api_name: "", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Math-T2", api_name: "openai/gpt-oss-120b:free", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Math-Local", api_name: "deepseek-r1:8b", tier: ModelTier::SpecMatrix, provider: ModelProvider::Local },
    
    // [03] Spec Matrix: Writing
    ModelNode { tag: "VERA-Writ-T1", api_name: "meta-llama/llama-3.3-70b-instruct:free", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Writ-T2", api_name: "google/gemma4-26b:free", tier: ModelTier::SpecMatrix, provider: ModelProvider::OpenAI },
    ModelNode { tag: "VERA-Writ-Local", api_name: "gemma3:latest", tier: ModelTier::SpecMatrix, provider: ModelProvider::Local },
    
    // [04] Pipeline & Daemon
    ModelNode { tag: "VERA-Daemon-Memory", api_name: "gemini-2.5-flash-lite", tier: ModelTier::Pipeline, provider: ModelProvider::Google },
    ModelNode { tag: "VERA-Daemon-Muscle", api_name: "kimi-k2.6", tier: ModelTier::Pipeline, provider: ModelProvider::Local },
    
    // [05] Local Bedrock Anchors
    ModelNode { tag: "VERA-Bedrock-Arch", api_name: "gemma4:31b", tier: ModelTier::LocalBedrock, provider: ModelProvider::Local },
    ModelNode { tag: "VERA-Bedrock-Code", api_name: "qwen3:30b", tier: ModelTier::LocalBedrock, provider: ModelProvider::Local },
    ModelNode { tag: "VERA-Bedrock-Writ", api_name: "gemma3:latest", tier: ModelTier::LocalBedrock, provider: ModelProvider::Local },
    ModelNode { tag: "VERA-Bedrock-Core", api_name: "deepseek-r1:8b", tier: ModelTier::LocalBedrock, provider: ModelProvider::Local },
];

// ─── Core Data Structures ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelRegistryEntry {
    pub slot_id: String,
    pub name: String,
    pub tag: String,
    pub description: String,
    pub tier: ModelTier,
    pub current_provider: ModelProvider,
    pub base_latency_ms: u64,
    pub max_context_tokens: usize,
    pub operational_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub handled_by_node: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardroomMessage {
    pub agent_name: String,
    pub node_tag: String,
    pub text: String,
    pub vote_stance: String,
    pub confidence_score: f32,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubTask {
    pub id: String,
    pub description: String,
    pub assigned_to: String,
    pub priority: u8,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DelegationPackage {
    pub session_id: String,
    pub root_task: String,
    pub consensus_summary: String,
    pub chosen_strategy_route: String,
    pub selected_executor: String,
    pub selected_executor_id: String,
    pub required_sub_matrices: Vec<String>,
    pub structured_backlog: Vec<SubTask>,
    pub boardroom_transcript: Vec<BoardroomMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrbTelemetry {
    pub active_agents: u32,
    pub tokens_processed: u64,
    pub latency_ms: u64,
    pub current_phase: String,
    pub energy_level: f32,
    pub pulse_frequency: f32,
    pub active_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VeraState {
    pub session_id: String,
    pub is_processing: bool,
    pub active_tier: Option<ModelTier>,
    pub current_task: Option<String>,
    pub messages: Vec<ChatMessage>,
    pub telemetry: OrbTelemetry,
}

// ─── External Bridges (Obsidian) ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObsidianWriteRequest {
    pub filename: String,
    pub content: String,
    pub vault_path: Option<String>,
    pub frontmatter: Option<HashMap<String, serde_json::Value>>,
    pub append: bool,
}

// ─── API Response Wrappers ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VeaCommandResult<T: Serialize> {
    pub status: String,
    pub success: bool,
    pub message: String,
    pub data: Option<T>,
    pub error: Option<String>,
    pub duration_ms: u64,
}

impl<T: Serialize> VeaCommandResult<T> {
    pub fn ok(data: T, duration_ms: u64) -> Self {
        Self {
            status: "success".to_string(),
            success: true,
            message: "Command executed successfully.".to_string(),
            data: Some(data),
            error: None,
            duration_ms,
        }
    }

    pub fn err(error: impl ToString) -> Self {
        Self {
            status: "error".to_string(),
            success: false,
            message: "Command failed.".to_string(),
            data: None,
            error: Some(error.to_string()),
            duration_ms: 0,
        }
    }
}