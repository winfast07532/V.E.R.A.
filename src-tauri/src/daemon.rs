// src-tauri/src/daemon.rs

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AgentNode {
    pub id: String,
    pub tier: u8,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Specialists {
    pub code: Vec<AgentNode>,
    pub visn: Vec<AgentNode>,
    pub math: Vec<AgentNode>,
    pub writ: Vec<AgentNode>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Daemons {
    pub memory: String,
    pub muscle: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Nodes {
    pub triage: String,
    pub supervisors: Vec<AgentNode>,
    pub specialists: Specialists,
    pub daemons: Daemons,
    pub anchors: Vec<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Registry {
    pub routing_strategy: String,
    pub nodes: Nodes,
}

pub fn load_registry<P: AsRef<Path>>(path: P) -> Registry {
    let data = fs::read_to_string(&path)
        .expect("CRITICAL: models.json is missing or unreadable.");
    
    serde_json::from_str(&data)
        .expect("CRITICAL: models.json layout schema has syntax compilation errors.")
}

pub fn get_specialist_chain(registry: &Registry, category: &str) -> Vec<String> {
    let mut chain: Vec<AgentNode> = match category {
        "code" => registry.nodes.specialists.code.clone(),
        "visn" => registry.nodes.specialists.visn.clone(),
        "math" => registry.nodes.specialists.math.clone(),
        "writ" => registry.nodes.specialists.writ.clone(),
        _ => panic!("Invalid category '{}' passed to the workspace router.", category),
    };

    chain.sort_by(|a, b| a.tier.cmp(&b.tier));
    chain.into_iter().map(|n| n.id).collect()
}

pub fn get_supervisor_chain(registry: &Registry) -> Vec<String> {
    let mut chain = registry.nodes.supervisors.clone();
    chain.sort_by(|a, b| a.tier.cmp(&b.tier));
    chain.into_iter().map(|n| n.id).collect()
}