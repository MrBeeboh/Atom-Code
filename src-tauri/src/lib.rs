use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use ignore::WalkBuilder;
use regex::Regex;
use keyring::Entry;

const SERVICE_NAME: &str = "atom-code";

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Serialize, Deserialize)]
pub struct RepoMapResponse {
    pub tree: String,
    pub signatures: HashMap<String, Vec<String>>,
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_directory(path: String, recursive: bool) -> Result<Vec<FileInfo>, String> {
    let mut files = Vec::new();
    let root = PathBuf::from(&path);

    if recursive {
        for entry in WalkBuilder::new(&root).hidden(false).build() {
            if let Ok(entry) = entry {
                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                files.push(FileInfo {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: entry.path().to_string_lossy().into_owned(),
                    is_dir: metadata.is_dir(),
                    size: metadata.len(),
                });
            }
        }
    } else {
        match fs::read_dir(&root) {
            Ok(entries) => {
                for entry in entries {
                    if let Ok(entry) = entry {
                        let metadata = entry.metadata().map_err(|e| e.to_string())?;
                        files.push(FileInfo {
                            name: entry.file_name().to_string_lossy().into_owned(),
                            path: entry.path().to_string_lossy().into_owned(),
                            is_dir: metadata.is_dir(),
                            size: metadata.len(),
                        });
                    }
                }
            },
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(files)
}

fn extract_signatures(content: &str, ext: &str) -> Vec<String> {
    let mut signatures = Vec::new();
    let lines: Vec<&str> = content.lines().collect();

    let js_re = Regex::new(r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(").unwrap();
    let js_const_re = Regex::new(r"^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z0-9_]+)\s*=>").unwrap();
    let js_class_re = Regex::new(r"^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z0-9_]+)").unwrap();
    let py_re = Regex::new(r"^(?:async\s+)?(?:def|class)\s+([A-Za-z0-9_]+)").unwrap();

    for i in 0..lines.len() {
        let line = lines[i].trim();
        let mut sig = None;

        if matches!(ext, "js" | "mjs" | "ts" | "svelte") {
            if js_re.is_match(line) || js_const_re.is_match(line) || js_class_re.is_match(line) {
                sig = Some(line.split('{').next().unwrap().trim().to_string());
            }
        } else if ext == "py" {
            if py_re.is_match(line) {
                sig = Some(line.split(':').next().unwrap().trim().to_string() + ":");
            }
        }

        if let Some(s) = sig {
            signatures.push(s);
        }
    }
    signatures
}

#[tauri::command]
pub async fn git_status(root: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub async fn git_commit(root: String, message: String) -> Result<String, String> {
    // git add .
    let add_output = Command::new("git")
        .args(["add", "."])
        .current_dir(&root)
        .output()
        .map_err(|e| e.to_string())?;

    if !add_output.status.success() {
        return Err(String::from_utf8_lossy(&add_output.stderr).into_owned());
    }

    // git commit -m
    let commit_output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&root)
        .output()
        .map_err(|e| e.to_string())?;

    if commit_output.status.success() {
        Ok(String::from_utf8_lossy(&commit_output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&commit_output.stderr).into_owned())
    }
}

#[tauri::command]
pub async fn git_push(root: String) -> Result<String, String> {
    let output = Command::new("git")
        .arg("push")
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        // git push sometimes returns success message in stderr
        Ok(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub async fn git_diff(root: String, path: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(["diff", &path])
        .current_dir(root)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

#[tauri::command]
pub async fn get_repo_map(path: String) -> Result<RepoMapResponse, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    let mut tree = String::new();
    let mut signatures = HashMap::new();
    let mut current_bytes = 0;
    const MAX_BYTES: usize = 100 * 1024;

    tree.push_str(&format!("{}/\n", root.file_name().unwrap_or_default().to_string_lossy()));

    for entry in WalkBuilder::new(&root).hidden(true).build() {
        if let Ok(entry) = entry {
            let rel_path = entry.path().strip_prefix(&root).unwrap_or(entry.path());
            let depth = rel_path.components().count();
            if depth == 0 { continue; }

            let indent = "    ".repeat(depth - 1);
            let name = entry.file_name().to_string_lossy();
            let is_dir = entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false);
            
            tree.push_str(&format!("{}└── {}\n", indent, name));

            if !is_dir {
                let ext = entry.path().extension().and_then(|e| e.to_str()).unwrap_or("");
                if matches!(ext, "js" | "mjs" | "ts" | "svelte" | "py") {
                    if let Ok(content) = fs::read_to_string(entry.path()) {
                        let file_sigs = extract_signatures(&content, ext);
                        if !file_sigs.is_empty() {
                            let rel_str = rel_path.to_string_lossy().into_owned();
                            for sig in &file_sigs {
                                current_bytes += sig.len();
                            }
                            signatures.insert(rel_str, file_sigs);
                        }
                    }
                }
            }
            if current_bytes >= MAX_BYTES { break; }
        }
    }

    Ok(RepoMapResponse { tree, signatures })
}

#[tauri::command]
pub fn store_api_key(_service: String, key_name: String, value: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key_name).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(_service: String, key_name: String) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, &key_name).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_api_key(_service: String, key_name: String) -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, &key_name).map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default()
            .add_migrations("sqlite:atom_memory.db", vec![
                tauri_plugin_sql::Migration {
                    version: 1,
                    description: "create project_memory table",
                    sql: "CREATE TABLE IF NOT EXISTS project_memory (
                        project_path TEXT PRIMARY KEY,
                        summary TEXT,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );",
                    kind: tauri_plugin_sql::MigrationKind::Up,
                }
            ])
            .build()
        )
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            list_directory,
            get_repo_map,
            git_status,
            git_commit,
            git_push,
            git_diff,
            store_api_key,
            get_api_key,
            delete_api_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
