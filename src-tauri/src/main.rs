// src-tauri/src/main.rs
// Project VERA — Tauri v2 Backend Entry Point
// All IPC commands, state management, and application lifecycle.

// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod boardroom;
mod models;
mod obsidian;
mod registry;
mod daemon;

use boardroom::BoardroomEngine;
use crate::registry::ModelRegistry;
use models::{
    DelegationPackage, ModelRegistryEntry, ObsidianWriteRequest, OrbTelemetry,
    VeaCommandResult, VeraState, ModelTier,
};
use obsidian::ObsidianBridge;

use std::sync::Arc;
use tauri::{Manager, State, Emitter};
use tokio::sync::Mutex;
use uuid::Uuid;
use notify::{Watcher, RecursiveMode, Result as NotifyResult};

// ─── Application State ────────────────────────────────────────────────────────

pub struct AppState {
    pub vera: Arc<Mutex<VeraState>>,
    pub registry: Arc<Mutex<ModelRegistry>>,
    pub obsidian: Arc<Mutex<ObsidianBridge>>,
}

// ─── IPC Commands ─────────────────────────────────────────────────────────────

/// Returns the complete 24-slot model registry as JSON.
#[tauri::command]
async fn get_model_registry(
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<Vec<ModelRegistryEntry>>, String> {
    let registry = state.registry.lock().await;
    let entries = registry
        .all_entries_sorted()
        .into_iter()
        .cloned()
        .collect::<Vec<_>>();
    Ok(VeaCommandResult::ok(entries, 0))
}

/// Runs the 22-agent Boardroom deliberation sequence for a given task.
#[tauri::command]
async fn run_boardroom_debate(
    task: String,
    state: State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<VeaCommandResult<DelegationPackage>, String> {
    let start = std::time::Instant::now();

    // 1. Update VERA state to processing and set orb tier
    {
        let mut vera = state.vera.lock().await;
        vera.is_processing = true;
        vera.current_task = Some(task.clone());
        vera.telemetry.current_phase = "BOARDROOM".to_string();
        vera.telemetry.energy_level = 0.75;
        vera.active_tier = Some(ModelTier::Management); // Deliberation phase
    }

    // 2. Emit start event to frontend to open overlay
    let _ = app_handle.emit("boardroom:start", &task);

    // 3. Run the boardroom deliberation
    match BoardroomEngine::run_debate(task.clone()).await {
        Ok(package) => {
            let duration = start.elapsed().as_millis() as u64;

            // Stream progress events for each boardroom message dynamically
            for msg in &package.boardroom_transcript {
                let _ = app_handle.emit("boardroom:message", msg);
                tokio::time::sleep(tokio::time::Duration::from_millis(150)).await; 
            }

            // Emit final completion package to UI
            let _ = app_handle.emit("boardroom:complete", &package);

            // 4. Update VERA state based on executor selection
            {
                let mut vera = state.vera.lock().await;
                vera.is_processing = false;
                vera.current_task = None;
                vera.telemetry.current_phase = "EXECUTING".to_string();
                vera.telemetry.active_model = package.selected_executor.clone();
                vera.telemetry.energy_level = 0.90;
                
                // Map the resulting executor slot to the correct Enum Tier
                if package.selected_executor_id.contains("slot:02") {
                    vera.active_tier = Some(ModelTier::MainArch);
                } else if package.selected_executor_id.contains("slot:05") {
                    vera.active_tier = Some(ModelTier::SpecMatrix);
                } else {
                    vera.active_tier = Some(ModelTier::Pipeline);
                }
            }

            // 5. Auto-write boardroom transcript to Obsidian Vault
            let obsidian = state.obsidian.lock().await;
            let log_entry = format!(
                "## Boardroom Session\n**Task:** {}\n**Executor:** {}\n**Duration:** {}ms\n\n{}",
                task,
                package.selected_executor,
                duration,
                package.consensus_summary
            );
            let _ = obsidian.append_session_log(&log_entry).await;

            Ok(VeaCommandResult::ok(package, duration))
        }
        Err(e) => {
            // Error handling: Snap orb to LocalBedrock fallback state
            let mut vera = state.vera.lock().await;
            vera.is_processing = false;
            vera.current_task = None;
            vera.telemetry.current_phase = "ERROR".to_string();
            vera.telemetry.energy_level = 0.60;
            vera.active_tier = Some(ModelTier::LocalBedrock); 
            Err(format!("Boardroom error: {}", e))
        }
    }
}

#[tauri::command]
async fn write_to_obsidian(
    filename: String,
    content: String,
    vault_path: Option<String>,
    append: Option<bool>,
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<String>, String> {
    let start = std::time::Instant::now();
    let request = ObsidianWriteRequest {
        filename,
        content,
        vault_path,
        frontmatter: None,
        append: append.unwrap_or(false),
    };
    let obsidian = state.obsidian.lock().await;
    match obsidian.write_note(request).await {
        Ok(path) => Ok(VeaCommandResult::ok(path.to_string_lossy().to_string(), start.elapsed().as_millis() as u64)),
        Err(e) => Err(format!("Obsidian write error: {}", e)),
    }
}

#[tauri::command]
async fn read_from_obsidian(
    filename: String,
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<String>, String> {
    let start = std::time::Instant::now();
    let obsidian = state.obsidian.lock().await;
    match obsidian.read_note(&filename).await {
        Ok(content) => Ok(VeaCommandResult::ok(content, start.elapsed().as_millis() as u64)),
        Err(e) => Err(format!("Obsidian read error: {}", e)),
    }
}

#[tauri::command]
async fn list_obsidian_notes(
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<Vec<String>>, String> {
    let start = std::time::Instant::now();
    let obsidian = state.obsidian.lock().await;
    match obsidian.list_notes().await {
        Ok(notes) => Ok(VeaCommandResult::ok(notes, start.elapsed().as_millis() as u64)),
        Err(e) => Err(format!("Obsidian list error: {}", e)),
    }
}

#[tauri::command]
async fn get_orb_telemetry(
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<OrbTelemetry>, String> {
    let vera = state.vera.lock().await;
    Ok(VeaCommandResult::ok(vera.telemetry.clone(), 0))
}

#[tauri::command]
async fn get_vera_state(
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<VeraState>, String> {
    let vera = state.vera.lock().await;
    Ok(VeaCommandResult::ok(vera.clone(), 0))
}

#[tauri::command]
async fn get_vault_path(
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<String>, String> {
    let obsidian = state.obsidian.lock().await;
    Ok(VeaCommandResult::ok(obsidian.vault_path().to_string_lossy().to_string(), 0))
}

#[tauri::command]
async fn send_fast_message(
    app_handle: tauri::AppHandle, // Injected for native token-streaming event emit
    message: String,
    target_model: String,
    state: State<'_, AppState>,
) -> Result<VeaCommandResult<String>, String> {
    let start = std::time::Instant::now();

    // 1. Lookup node config in registry
    let node = crate::registry::lookup_node(&target_model)
        .ok_or_else(|| format!("Model node '{}' not found in architecture matrix.", target_model))?;

    // 2. Lock state and update telemetry/orb parameters for active execution phase
    {
        let mut vera = state.vera.lock().await;
        vera.is_processing = true;
        vera.active_tier = Some(node.tier.clone());
        vera.telemetry.current_phase = "EXECUTING".to_string();
        vera.telemetry.active_model = node.tag.to_string();
        vera.telemetry.energy_level = 0.85;
    }

    // 3. Dispatch the real API call with the handle passed forward
    log::info!("Dispatching tactical Single Mode payload to [{}]", node.tag);
    let api_response = crate::registry::dispatch_api_call(app_handle.clone(), node, &message).await;

    // 4. Reset processing state and update final stats
    let duration = start.elapsed().as_millis() as u64;
    {
        let mut vera = state.vera.lock().await;
        vera.is_processing = false;
        vera.telemetry.current_phase = "STANDBY".to_string();
        vera.telemetry.energy_level = 0.42;
        if api_response.is_ok() {
            vera.telemetry.latency_ms = duration;
        }
    }

    match api_response {
        Ok(text) => Ok(VeaCommandResult::ok(text, duration)),
        Err(e) => Err(format!("Node execution failed: {}", e)),
    }
}

#[tauri::command]
async fn set_window_mode(
    mode: String,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        match mode.as_str() {
            "compact" => {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: 420.0, height: 420.0 }));
            }
            "expanded" => {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width: 1280.0, height: 800.0 }));
            }
            _ => {}
        }
    }
    Ok(())
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

fn classify_intent(msg: &str) -> &'static str {
    let m = msg.to_lowercase();
    if m.contains("code") || m.contains("build") || m.contains("implement") {
        "CODE_GENERATION"
    } else if m.contains("search") || m.contains("find") || m.contains("research") {
        "RESEARCH"
    } else if m.contains("analyze") || m.contains("data") {
        "ANALYSIS"
    } else if m.contains("write") || m.contains("create") || m.contains("generate") {
        "CREATIVE"
    } else if m.contains("boardroom") || m.contains("debate") || m.contains("delegate") {
        "BOARDROOM_TRIGGER"
    } else {
        "GENERAL"
    }
}

// ─── VERA Disk Watchdog System ───
fn run_watchdog(app_handle: tauri::AppHandle, vault_path: std::path::PathBuf) -> NotifyResult<()> {
    let mut watcher = notify::recommended_watcher(move |res: NotifyResult<notify::Event>| {
        match res {
            Ok(event) => {
                if event.kind.is_modify() {
                    let path_str = event.paths.iter()
                        .map(|p| p.to_string_lossy())
                        .collect::<Vec<_>>()
                        .join(" ");

                    if path_str.contains("VERA Session Log") 
                       || path_str.contains(".obsidian") 
                       || path_str.contains(".trash") 
                    {
                        return;
                    }

                    log::info!("VERA DETECTED DISK CHANGE: {:?}", event.paths);
                    
                    let task_msg = format!("File changed in workspace: {:?}", event.paths);
                    let handle_clone = app_handle.clone();
                    
                    tauri::async_runtime::spawn(async move {
                        log::info!("Triggering automatic boardroom triage session...");
                        let _ = handle_clone.emit("boardroom:start", &task_msg);
                        
                        if let Ok(package) = boardroom::BoardroomEngine::run_debate(task_msg).await {
                            for msg in &package.boardroom_transcript {
                                let _ = handle_clone.emit("boardroom:message", msg);
                                tokio::time::sleep(tokio::time::Duration::from_millis(30)).await;
                            }
                            let _ = handle_clone.emit("boardroom:complete", &package);
                        }
                    });
                }
            },
            Err(e) => log::error!("Watch error: {:?}", e),
        }
    })?;

    if !vault_path.exists() {
        std::fs::create_dir_all(&vault_path).unwrap();
    }
    
    log::info!("SPIDER WEB: Actively protecting vault target: {:?}", vault_path);
    watcher.watch(&vault_path, RecursiveMode::Recursive)?;
    
    loop { std::thread::park(); }
}

// ─── Application Entry Point ──────────────────────────────────────────────────
fn main() {
    dotenvy::dotenv().ok(); // Forces the Rust process to inject your .env file on boot

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // ── Initialize Registry ───────────────────────────────────────────
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            let config_path = app_data_dir.join("models.json");

            let registry = ModelRegistry::init(config_path)
                .expect("Failed to initialize model registry");

            // ── Initialize Obsidian Bridge ────────────────────────────────────
            let obsidian = ObsidianBridge::new(None);

            // ── Build Initial VERA State ──────────────────────────────────────
            let vera_state = VeraState {
                session_id: Uuid::new_v4().to_string(),
                is_processing: false,
                active_tier: None,
                current_task: None,
                messages: Vec::new(),
                telemetry: OrbTelemetry {
                    active_agents: 0,
                    tokens_processed: 0,
                    latency_ms: 0,
                    current_phase: "STANDBY".to_string(),
                    energy_level: 0.42,
                    pulse_frequency: 1.0,
                    active_model: "None".to_string(),
                },
            };

            let target_vault_path = obsidian.vault_path().to_path_buf();

            // ── Register Application State ────────────────────────────────────
            app.manage(AppState {
                vera: Arc::new(Mutex::new(vera_state)),
                registry: Arc::new(Mutex::new(registry)),
                obsidian: Arc::new(Mutex::new(obsidian)),
            });

            // ── SPIDER WEB (THE WATCHDOG THREAD) ──────────────────────────────
            let watch_handle = app.handle().clone();
            std::thread::spawn(move || {
                log::info!("Starting VERA disk watchdog...");
                if let Err(e) = run_watchdog(watch_handle, target_vault_path) {
                    log::error!("Watchdog crashed hard: {:?}", e);
                }
            });

            log::info!("VERA Orchestrator initialized. Session ready.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_model_registry,
            run_boardroom_debate,
            write_to_obsidian,
            read_from_obsidian,
            list_obsidian_notes,
            get_orb_telemetry,
            get_vera_state,
            get_vault_path,
            send_fast_message,
            set_window_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VERA application");
}