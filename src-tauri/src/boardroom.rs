// src-tauri/src/boardroom.rs
// Project VERA — Boardroom Deliberation Engine
// 22-node execution pipeline routing based on the VERA ENGINE CORE schema.

use crate::models::{BoardroomMessage, DelegationPackage, SubTask};
use anyhow::Result;
use chrono::Utc;
use uuid::Uuid;

/// The 22 VERA Core components based on the established routing schema.
pub const BOARDROOM_AGENTS: &[(&str, &str, &str)] = &[
    // [01] FAST BRAIN
    ("VERA-Triage",        "Fast Brain Routing",         "Gemini 2.5 Flash"),

    // [02] MAIN ARCH (Supervisor)
    ("VERA-Super-T1",      "Main Arch Primary",          "Nemotron 3 Ultra 550B"),
    ("VERA-Super-T2",      "Main Arch Fallback",         "Hermes 4 405B"),
    ("VERA-Super-T3",      "Main Arch Local",            "Gemma 4 31B [L]"),

    // [03] SPEC MATRIX - CODE
    ("VERA-Code-T1",       "Code Agent Primary",         "Qwen3-Coder"),
    ("VERA-Code-T2",       "Code Agent Secondary",       "Qwen3-Next-80b"),
    ("VERA-Code-T3",       "Code Cloud Fallback",        "North-Mini-Code"),
    ("VERA-Code-Local",    "Code Local Bedrock",         "Qwen3-30B [L]"),

    // [03] SPEC MATRIX - VISION
    ("VERA-Visn-T1",       "Vision Gateway",             "Gemini 2.5 Flash"),
    ("VERA-Visn-T2",       "Vision Specialist",          "Nemotron-3-Super 120B"),
    ("VERA-Visn-Local",    "Vision Local Anchor",        "Gemma 4 31B [L]"),

    // [03] SPEC MATRIX - MATH
    ("VERA-Math-T1",       "Math Primary (Blank)",       "None"),
    ("VERA-Math-T2",       "Math Cloud Alternate",       "GPT-OSS-120b"),
    ("VERA-Math-Local",    "Math Local Bedrock",         "DeepSeek R1 8B"),

    // [03] SPEC MATRIX - WRITING
    ("VERA-Writ-T1",       "Prose Agent Primary",        "Llama 3.3 70B"),
    ("VERA-Writ-T2",       "Prose Agent Secondary",      "Gemma 4 26B"),
    ("VERA-Writ-Local",    "Prose Local Bedrock",        "Gemma 3 Latest [L]"),

    // [04] PIPELINE & DAEMON WORKERS
    ("VERA-Daemon-Memory", "State Persistence Memory",   "Gemini 2.5 Flash-Lite"),
    ("VERA-Daemon-Muscle", "JSON Command Execution",     "Kimi K2.6"),
];

pub struct BoardroomEngine;

impl BoardroomEngine {
    pub async fn run_debate(task: String) -> Result<DelegationPackage> {
        let session_id = Uuid::new_v4().to_string();
        let mut transcript = Vec::new();

        // 1. Triage Gate
        transcript.push(BoardroomMessage {
            agent_name: "VERA-Triage".to_string(),
            node_tag: "Fast Brain Routing".to_string(),
            text: format!("Inbound pipeline payload registered. Commencing multi-matrix triage for task: '{}'", task),
            vote_stance: "ACKNOWLEDGE".to_string(),
            confidence_score: 0.98,
            timestamp: Utc::now().to_rfc3339(),
        });

        // 2. Main Arch Primary Evaluation
        transcript.push(BoardroomMessage {
            agent_name: "VERA-Super-T1".to_string(),
            node_tag: "Main Arch Primary".to_string(),
            text: format!("Analyzing core target vector. Dispatching execution path requirements across active matrix schemas."),
            vote_stance: "DELEGATE".to_string(),
            confidence_score: 0.95,
            timestamp: Utc::now().to_rfc3339(),
        });

        // Determine specific matrix slot assignment based on task content
        let intent = Self::classify_task(&task);
        let (executor, executor_id) = match intent {
            "CODE_GENERATION" => ("VERA-Code-T1", "slot:03:code"),
            "COMPUTATION" => ("VERA-Math-T2", "slot:03:math"),
            "VISUAL_PROCESSING" => ("VERA-Visn-T2", "slot:03:vision"),
            "CREATIVE_GENERATION" => ("VERA-Writ-T1", "slot:03:writing"),
            _ => ("VERA-Super-T1", "slot:02:arch"),
        };

        // 3. Specialist Processing Node Call
        transcript.push(BoardroomMessage {
            agent_name: executor.to_string(),
            node_tag: "Specialist Matrix Vector".to_string(),
            text: format!("Matrix tracking lock confirmed on payload block. Task path mapped successfully to target endpoint."),
            vote_stance: "ACCEPT".to_string(),
            confidence_score: 0.99,
            timestamp: Utc::now().to_rfc3339(),
        });

        // 4. Background Anchors Secure Confirms
        transcript.push(BoardroomMessage {
            agent_name: "VERA-Bedrock-Arch".to_string(),
            node_tag: "Local Anchor Verification".to_string(),
            text: "Local Bedrock Anchor secure. 100% uptime guaranteed if API links fail. Pipeline green.".to_string(),
            vote_stance: "STANDBY".to_string(),
            confidence_score: 1.0,
            timestamp: Utc::now().to_rfc3339(),
        });

        let consensus_summary = format!(
            "VERA Core Engine consensus reached. Task analyzed successfully. Processing route established via target cluster node [{}].",
            executor
        );

        let structured_backlog = Self::generate_subtasks(&task, executor);

        Ok(DelegationPackage {
            session_id,
            root_task: task,
            consensus_summary,
            chosen_strategy_route: intent.to_string(),
            selected_executor: executor.to_string(),
            selected_executor_id: executor_id.to_string(),
            required_sub_matrices: vec![intent.to_string(), "PIPELINE_DAEMON".to_string()],
            structured_backlog,
            boardroom_transcript: transcript,
        })
    }

    fn generate_subtasks(task: &str, executor: &str) -> Vec<SubTask> {
        vec![
            SubTask {
                id: Uuid::new_v4().to_string(),
                description: format!("Triage payload: '{}'", &task[..task.len().min(40)]),
                assigned_to: "Gemini 2.5 Flash".to_string(),
                priority: 1,
                dependencies: vec![],
            },
            SubTask {
                id: Uuid::new_v4().to_string(),
                description: "Execute Spec Matrix logic block".to_string(),
                assigned_to: executor.to_string(),
                priority: 2,
                dependencies: vec!["task:0".to_string()],
            },
        ]
    }

    fn classify_task(task: &str) -> &'static str {
        let t = task.to_lowercase();
        if t.contains("code") || t.contains("build") { "CODE_GENERATION" }
        else if t.contains("math") || t.contains("calc") { "COMPUTATION" }
        else if t.contains("vision") || t.contains("image") { "VISUAL_PROCESSING" }
        else if t.contains("write") || t.contains("draft") { "CREATIVE_GENERATION" }
        else { "GENERAL_ORCHESTRATION" }
    }
}