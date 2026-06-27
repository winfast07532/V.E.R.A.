// src/registry.rs
// Project VERA — Engine Routing Registry and Dispatch Pipeline

use serde_json::json;
use std::env;
use std::error::Error;
use std::fs;
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;
use tauri::Emitter;

use crate::models::{ModelRegistryEntry, ModelTier};
use crate::workspace;

const MAX_TOOL_ROUNDS: usize = 10;

// ─── MODEL REGISTRY CONFIG PARSER ──────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ModelRegistry {
    pub nodes: Vec<ModelRegistryEntry>,
}

impl ModelRegistry {
    pub fn init<P: AsRef<Path>>(config_path: P) -> Result<Self, Box<dyn Error + Send + Sync>> {
        let mut nodes = Vec::new();
        if let Ok(content) = fs::read_to_string(config_path) {
            if let Ok(parsed) = serde_json::from_str::<Vec<ModelRegistryEntry>>(&content) {
                nodes = parsed;
            }
        }
        Ok(Self { nodes })
    }

    pub fn all_entries_sorted(&self) -> Vec<&ModelRegistryEntry> {
        let mut sorted: Vec<&ModelRegistryEntry> = self.nodes.iter().collect();
        sorted.sort_by(|a, b| a.name.cmp(&b.name));
        sorted
    }
}

// ─── DEDICATED ROUTING STRUCT ──────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ActiveNode {
    pub tag: String,      
    pub name: String,     
    pub model_id: String, 
    pub tier: ModelTier,
}

pub fn lookup_node(target_model: &str) -> Option<ActiveNode> {
    let real_id = match target_model {
        "VERA-Triage" => "gemini-2.5-flash",
        "VERA-Super-T1" | "VERA-Arch-T1" => "nvidia/nemotron-3-ultra-550b-a55b:free", 
        "VERA-Super-T2" | "VERA-Arch-T2" => "nousresearch/hermes-3-llama-3.1-405b:free",
        "VERA-Super-T3" | "VERA-Arch-T3" => "gemma4:31b",
        "VERA-Code-T1" => "qwen/qwen3-coder:free",
        "VERA-Code-T2" => "qwen/qwen3-next-80b-a3b-instruct:free",
        "VERA-Code-T3" => "cohere/north-mini-code:free",
        "VERA-Code-Local" | "VERA-Bedrock-Code" => "qwen3:30b",
        "VERA-Visn-T1" => "gemini-2.5-flash",
        "VERA-Visn-T2" => "nvidia/nemotron-3-super-120b-a12b:free",
        "VERA-Visn-Local" | "VERA-Bedrock-Arch" => "gemma4:31b",
        "VERA-Math-T1" => "",
        "VERA-Math-T2" => "openai/gpt-oss-120b:free",
        "VERA-Math-Local" | "VERA-Bedrock-Core" => "gemma3:latest", 
        "VERA-Writ-T1" => "meta-llama/llama-3.3-70b-instruct:free",
        "VERA-Writ-T2" => "google/gemma4-26b:free",
        "VERA-Writ-Local" | "VERA-Bedrock-Writ" => "gemma3:latest",
        "VERA-Daemon-Memory" => "gemini-2.5-flash-lite",
        "VERA-Daemon-Muscle" => "kimi-k2.6",
        _ => target_model, 
    };

    let tier = if target_model.contains("Bedrock") || target_model.contains("Local") {
        ModelTier::LocalBedrock 
    } else if target_model.contains("Triage") || target_model.contains("Daemon") {
        ModelTier::Pipeline
    } else if target_model.contains("Code") || target_model.contains("Visn") || target_model.contains("Math") || target_model.contains("Writ") {
        ModelTier::SpecMatrix
    } else {
        ModelTier::MainArch
    };

    Some(ActiveNode {
        tag: target_model.to_string(),
        name: target_model.to_string(),
        model_id: real_id.to_string(),
        tier, 
    })
}

// ─── DISPATCH PIPELINE ─────────────────────────────────────────────────────

pub async fn dispatch_api_call(
    app_handle: AppHandle, 
    node: ActiveNode, 
    prompt: &str
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let initial_model_id = node.model_id.as_str();
    let system_prompt = workspace::load_system_prompt();
    let _ = app_handle.emit("vera-telemetry", "CONNECTING_TO_CLUSTER");

    if initial_model_id.is_empty() {
        log::warn!("Node target empty. Fast-dropping to local bedrock fallback.");
        let _ = app_handle.emit("vera-telemetry", "FAILOVER_MODE");
        return run_agentic_loop("gemma3:latest", prompt, &system_prompt).await;
    }

    match run_agentic_loop(initial_model_id, prompt, &system_prompt).await {
        Ok(response) => Ok(response),
        Err(e) => {
            log::error!("Node [{}] choked: {}. Dropping down to active safety cluster...", initial_model_id, e);
            let _ = app_handle.emit("vera-telemetry", "FAILOVER_MODE");
            
            let fallback_model = if initial_model_id.contains("qwen3-coder") {
                "qwen3:30b"
            } else if initial_model_id.contains("nemotron") {
                "nousresearch/hermes-3-llama-3.1-405b:free"
            } else if initial_model_id.contains("llama-3.3") {
                "gemma3:latest"
            } else {
                "gemma4:31b"
            };

            log::warn!("Executing hot-swap routing to safety node: [{}]", fallback_model);
            
            match run_agentic_loop(fallback_model, prompt, &system_prompt).await {
                Ok(res) => Ok(res),
                Err(fallback_err) => {
                    log::error!("Safety node [{}] also choked: {}. Anchoring to Local Bedrock.", fallback_model, fallback_err);
                    run_agentic_loop("gemma3:latest", prompt, &system_prompt).await
                }
            }
        }
    }
}

async fn run_agentic_loop(
    model_id: &str,
    user_prompt: &str,
    system_prompt: &str,
) -> Result<String, Box<dyn Error + Send + Sync>> {
    let mut working_prompt = user_prompt.to_string();
    let mut last_response = String::new();

    for round in 0..MAX_TOOL_ROUNDS {
        last_response = execute_raw_api(model_id, system_prompt, &working_prompt).await?;
        let tool_calls = workspace::extract_tool_calls(&last_response);

        if tool_calls.is_empty() {
            return Ok(last_response);
        }

        log::info!(
            "VERA tool round {} — executing {} workspace call(s)",
            round + 1,
            tool_calls.len()
        );

        let mut tool_results = String::new();
        for call in tool_calls {
            let result = workspace::execute_tool_from_json(&call);
            tool_results.push_str(&format!("\n[TOOL `{}` RESULT]:\n{}\n", call, result));
        }

        working_prompt = format!(
            "{}\n\n---\nYour previous response included workspace tool invocations. The runtime executed them and returned:\n{}\n\nContinue the original task. Emit another ```vera_tool``` block if you still need workspace access. Otherwise respond to Sir with your final answer and do not include tool blocks.",
            user_prompt,
            tool_results
        );
    }

    log::warn!("VERA hit max tool rounds ({}). Returning last model response.", MAX_TOOL_ROUNDS);
    Ok(last_response)
}

async fn execute_raw_api(
    model_id: &str,
    system_prompt: &str,
    prompt: &str
) -> Result<String, Box<dyn Error + Send + Sync>> {
    match model_id {
        "gemini-2.5-flash" | "gemini-2.5-flash-lite" => {
            tokio::select! {
                res = call_google(model_id, system_prompt, prompt) => {
                    match res {
                        Ok(text) => Ok(text),
                        Err(_) => call_ollama("gemma3:latest", system_prompt, prompt).await
                    }
                }
                _ = tokio::time::sleep(Duration::from_millis(2500)) => {
                    log::error!("Gemini stalled past 2500ms budget limit. Dropping to Bedrock.");
                    call_ollama("gemma3:latest", system_prompt, prompt).await
                }
            }
        },
        
        _ if model_id.contains(":free") => {
            tokio::select! {
                res = call_openrouter(model_id, system_prompt, prompt) => {
                    match res {
                        Ok(text) => Ok(text),
                        Err(_) => call_ollama("gemma3:latest", system_prompt, prompt).await
                    }
                }
                _ = tokio::time::sleep(Duration::from_secs(3)) => {
                    log::error!("OpenRouter queue stalled. Dropping to Bedrock.");
                    call_ollama("gemma3:latest", system_prompt, prompt).await
                }
            }
        },
        
        _ => {
            call_ollama(model_id, system_prompt, prompt).await
        }
    }
}

// ─── API CLIENT INFRASTRUCTURE ─────────────────────────────────────────────

async fn call_openrouter(model_id: &str, system_prompt: &str, prompt: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    let api_key = env::var("OPENROUTER_FREE_KEY").unwrap_or_default();
    if api_key.is_empty() { return Err("CRITICAL: OPENROUTER_FREE_KEY missing.".into()); }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .connect_timeout(Duration::from_secs(2))
        .pool_max_idle_per_host(0) 
        .build()?;

    let response = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("HTTP-Referer", "https://github.com/vera-core")
        .header("X-Title", "VERA Core Engine")
        .json(&json!({
            "model": model_id,
            "temperature": 0.75,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
        }))
        .send().await?;

    if !response.status().is_success() {
        return Err(format!("OpenRouter HTTP Error: {}", response.status()).into());
    }

    let res: serde_json::Value = response.json().await?;
    Ok(res["choices"][0]["message"]["content"].as_str().unwrap_or("Stream parse error").to_string())
}

async fn call_moonshot(_model_id: &str, system_prompt: &str, prompt: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    let api_key = env::var("MOONSHOT_API_KEY").unwrap_or_default();
    if api_key.is_empty() { return Err("CRITICAL: MOONSHOT_API_KEY missing.".into()); }

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.moonshot.cn/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({
            "model": "moonshot-v1-8k",
            "temperature": 0.7,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ]
        }))
        .send().await?;

    if !response.status().is_success() {
        return Err(format!("Moonshot HTTP Error: {}", response.status()).into());
    }

    let res: serde_json::Value = response.json().await?;
    Ok(res["choices"][0]["message"]["content"].as_str().unwrap_or("Stream parse error").to_string())
}

async fn call_google(model_id: &str, system_prompt: &str, prompt: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    let api_key = env::var("GEMINI_API_KEY").unwrap_or_default();
    if api_key.is_empty() { return Err("CRITICAL: GEMINI_API_KEY missing.".into()); }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .connect_timeout(Duration::from_secs(2))
        .pool_max_idle_per_host(0)
        .build()?;

    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model_id, api_key);
    let response = client.post(&url)
        .json(&json!({
            "systemInstruction": { "parts": [{ "text": system_prompt }] },
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": {
                "temperature": 0.75,
                "topP": 0.95
            }
        }))
        .send().await?;

    if !response.status().is_success() {
        return Err(format!("Google API Rate Limit / Error: {}", response.status()).into());
    }

    let res: serde_json::Value = response.json().await?;
    Ok(res["candidates"][0]["content"]["parts"][0]["text"].as_str().unwrap_or("Stream parse error").to_string())
}

async fn call_ollama(model_id: &str, system_prompt: &str, prompt: &str) -> Result<String, Box<dyn Error + Send + Sync>> {
    let client = reqwest::Client::new();
    let response = client
        .post("http://127.0.0.1:11434/api/generate")
        .json(&json!({ 
            "model": model_id, 
            "prompt": prompt, 
            "system": system_prompt,
            "stream": false,
            "options": {
                "temperature": 0.7,
                "repeat_penalty": 1.25,
                "top_p": 0.9
            }
        }))
        .send().await?;

    if !response.status().is_success() {
        return Err(format!("Ollama HTTP Error: {}", response.status()).into());
    }

    let res: serde_json::Value = response.json().await?;
    Ok(res["response"].as_str().unwrap_or("Local stream parse error").to_string())
}