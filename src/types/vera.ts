// src/types/vera.ts
// Project VERA — TypeScript types mirroring src-tauri/src/models.rs
// Keep this in lockstep with the Rust structs for IPC type safety.

export type ModelTier =
  | "fast_brain"
  | "main_arch"
  | "spec_matrix"
  | "pipeline"
  | "local_bedrock"
  | "management";

export type ModelProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "meta"
  | "mistral"
  | "local"
  | "groq"
  | "perplexity";

export interface ModelRegistryEntry {
  slot_id: number;
  name: string;
  model_id: string;
  provider: ModelProvider;
  tier: ModelTier;
  role: string;
  capabilities: string[];
  context_window: number;
  max_tokens: number;
  temperature: number;
  is_local: boolean;
  endpoint?: string | null;
  api_key_env?: string | null;
  enabled: boolean;
  priority: number;
}

export interface BoardroomMessage {
  agent_id: string;
  agent_name: string;
  role: string;
  content: string;
  timestamp: string;
  confidence: number;
  recommendation?: string | null;
}

export interface SubTask {
  id: string;
  description: string;
  assigned_to: string;
  priority: number;
  dependencies: string[];
}

export interface DelegationPackage {
  session_id: string;
  original_task: string;
  consensus_summary: string;
  selected_executor: string;
  selected_executor_id: string;
  rationale: string;
  sub_tasks: SubTask[];
  estimated_complexity: string;
  boardroom_transcript: BoardroomMessage[];
  timestamp: string;
}

export interface OrbTelemetry {
  active_agents: number;
  tokens_processed: number;
  latency_ms: number;
  current_phase: string;
  energy_level: number;
  pulse_frequency: number;
  active_model: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "vera" | "agent" | "system";
  content: string;
  agent_name?: string | null;
  timestamp: string;
  model_used?: string | null;
}

export interface VeraState {
  session_id: string;
  is_processing: boolean;
  active_tier?: ModelTier | null;
  current_task?: string | null;
  messages: ChatMessage[];
  telemetry: OrbTelemetry;
}

export interface VeraCommandResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  duration_ms: number;
}
