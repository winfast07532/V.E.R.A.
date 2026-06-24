// src/lib/ipc.ts
// Project VERA — Tauri IPC Bridge
// Single source of truth for every frontend <-> Rust backend call.
// All commands are async and return VeraCommandResult<T> from the Rust side.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  ModelRegistryEntry,
  DelegationPackage,
  OrbTelemetry,
  VeraState,
  VeraCommandResult,
  BoardroomMessage,
} from "@/types/vera";

/** Thin wrapper that unwraps the Rust VeraCommandResult envelope and throws on failure. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const result = await invoke<VeraCommandResult<T>>(cmd, args);
  if (!result.success || result.data === null) {
    throw new Error(result.error ?? `VERA IPC command '${cmd}' failed with no error detail`);
  }
  return result.data;
}

// ─── Model Registry ────────────────────────────────────────────────────────────

export async function getModelRegistry(): Promise<ModelRegistryEntry[]> {
  return call<ModelRegistryEntry[]>("get_model_registry");
}

// ─── Boardroom ─────────────────────────────────────────────────────────────────

export async function runBoardroomDebate(task: string): Promise<DelegationPackage> {
  return call<DelegationPackage>("run_boardroom_debate", { task });
}

/** Subscribes to live boardroom message events as the deliberation streams in. */
export function onBoardroomMessage(
  handler: (msg: BoardroomMessage) => void
): Promise<UnlistenFn> {
  return listen<BoardroomMessage>("boardroom:message", (event) => handler(event.payload));
}

export function onBoardroomStart(handler: (task: string) => void): Promise<UnlistenFn> {
  return listen<string>("boardroom:start", (event) => handler(event.payload));
}

export function onBoardroomComplete(
  handler: (pkg: DelegationPackage) => void
): Promise<UnlistenFn> {
  return listen<DelegationPackage>("boardroom:complete", (event) => handler(event.payload));
}

// ─── Obsidian Bridge ───────────────────────────────────────────────────────────

export async function writeToObsidian(
  filename: string,
  content: string,
  options?: { vaultPath?: string; append?: boolean }
): Promise<string> {
  return call<string>("write_to_obsidian", {
    filename,
    content,
    vaultPath: options?.vaultPath ?? null,
    append: options?.append ?? false,
  });
}

export async function readFromObsidian(filename: string): Promise<string> {
  return call<string>("read_from_obsidian", { filename });
}

export async function listObsidianNotes(): Promise<string[]> {
  return call<string[]>("list_obsidian_notes");
}

export async function getVaultPath(): Promise<string> {
  return call<string>("get_vault_path");
}

// ─── Telemetry / Orb ────────────────────────────────────────────────────────────

export async function getOrbTelemetry(): Promise<OrbTelemetry> {
  return call<OrbTelemetry>("get_orb_telemetry");
}

export async function getVeraState(): Promise<VeraState> {
  return call<VeraState>("get_vera_state");
}

// ─── Fast Brain (direct quick-response path) ─────────────────────────────────

export async function sendFastMessage(message: string): Promise<string> {
  return call<string>("send_fast_message", { message });
}

// ─── Window Control ────────────────────────────────────────────────────────────

export async function setWindowMode(mode: "compact" | "expanded"): Promise<void> {
  await invoke("set_window_mode", { mode });
}
