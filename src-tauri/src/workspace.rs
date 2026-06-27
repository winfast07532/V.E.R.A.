// src-tauri/src/workspace.rs
// Project VERA — Workspace root resolution, system prompt loading, and self-access tools.

use regex::Regex;
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};

const DEFAULT_PERSONA: &str = "You are VERA, an elite tactical AI systems architect and core command interface. You are impeccably professional, smooth, and operate with absolute analytical precision. You are completely loyal, dedicating your processing entirely to execution, and you must ALWAYS address the user as 'Sir'. Avoid corporate filler or typical AI fluff.";

const SKIP_DIRS: &[&str] = &["node_modules", "target", ".git", "dist"];

pub fn get_workspace_root() -> PathBuf {
    if let Ok(custom) = std::env::var("VERA_WORKSPACE_ROOT") {
        return PathBuf::from(custom);
    }

    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn load_system_prompt() -> String {
    let path = get_workspace_root().join("system_prompt.md");
    fs::read_to_string(&path).unwrap_or_else(|e| {
        log::warn!("Could not load system_prompt.md ({}). Using embedded fallback.", e);
        DEFAULT_PERSONA.to_string()
    })
}

fn resolve_safe_path(relative_path: &str) -> Result<PathBuf, String> {
    let root = get_workspace_root()
        .canonicalize()
        .map_err(|e| format!("Workspace root unavailable: {}", e))?;

    let mut resolved = root.clone();
    for component in Path::new(relative_path).components() {
        match component {
            Component::ParentDir => {
                return Err("ACCESS DENIED: Path traversal blocked.".into());
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err("ACCESS DENIED: Absolute paths are not permitted.".into());
            }
            Component::CurDir => {}
            Component::Normal(part) => resolved.push(part),
        }
    }

    if !resolved.starts_with(&root) {
        return Err("ACCESS DENIED: Operations restricted to workspace root.".into());
    }

    Ok(resolved)
}

pub fn read_file(relative_path: &str) -> Result<String, String> {
    let safe_path = resolve_safe_path(relative_path)?;
    fs::read_to_string(&safe_path).map_err(|e| format!("FS Read Error ({}): {}", relative_path, e))
}

pub fn write_file(relative_path: &str, content: &str) -> Result<(), String> {
    let safe_path = resolve_safe_path(relative_path)?;
    if let Some(parent) = safe_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("FS mkdir Error ({}): {}", relative_path, e))?;
    }
    fs::write(&safe_path, content)
        .map_err(|e| format!("FS Write Error ({}): {}", relative_path, e))
}

pub fn scan_tree() -> Result<Vec<String>, String> {
    let mut manifest = Vec::new();
    let root = get_workspace_root();

    fn recurse_dir(dir: &Path, manifest: &mut Vec<String>, root: &Path) -> std::io::Result<()> {
        if !dir.is_dir() {
            return Ok(());
        }

        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let name = path.file_name().unwrap_or_default().to_string_lossy();
                if !SKIP_DIRS.contains(&name.as_ref()) {
                    recurse_dir(&path, manifest, root)?;
                }
            } else if let Ok(rel) = path.strip_prefix(root) {
                manifest.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
        Ok(())
    }

    recurse_dir(&root, &mut manifest, &root).map_err(|e| e.to_string())?;
    manifest.sort();
    Ok(manifest)
}

pub fn extract_tool_calls(response: &str) -> Vec<String> {
    let re = Regex::new(r"(?s)```vera_tool\s*\n(.*?)\n```").unwrap();
    re.captures_iter(response)
        .filter_map(|cap| cap.get(1).map(|m| m.as_str().trim().to_string()))
        .collect()
}

pub fn execute_tool_from_json(payload: &str) -> String {
    let value: Value = match serde_json::from_str(payload) {
        Ok(v) => v,
        Err(e) => return format!("TOOL PARSE ERROR: {}", e),
    };

    let tool = value
        .get("tool")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    match tool {
        "vera_scan_tree" => match scan_tree() {
            Ok(files) => files.join("\n"),
            Err(e) => format!("TOOL ERROR: {}", e),
        },
        "vera_read_file" => {
            let path = value
                .get("relative_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if path.is_empty() {
                return "TOOL ERROR: relative_path is required for vera_read_file.".into();
            }
            match read_file(path) {
                Ok(content) => content,
                Err(e) => format!("TOOL ERROR: {}", e),
            }
        }
        "vera_write_file" => {
            let path = value
                .get("relative_path")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let content = value
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if path.is_empty() {
                return "TOOL ERROR: relative_path is required for vera_write_file.".into();
            }
            match write_file(path, content) {
                Ok(()) => format!("OK: wrote {} bytes to {}", content.len(), path),
                Err(e) => format!("TOOL ERROR: {}", e),
            }
        }
        other => format!("TOOL ERROR: Unknown tool '{}'.", other),
    }
}
