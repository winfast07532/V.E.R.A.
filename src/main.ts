// src/main.ts
// Project VERA — Frontend Application Controller

import "./styles/main.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { KineticOrb } from "./lib/orb"; // Match your actual folder path to orb.ts

// ─── Global State ─────────────────────────────────────────────────────────────
let currentDeliberationSpeed = 0.05;
let currentOrbColor = 'rgba(138, 43, 226,'; 

// ─── UI Utilities ─────────────────────────────────────────────────────────────
function startHudClock() {
  const clockEl = document.getElementById('hud-clock');
  if (clockEl) {
    setInterval(() => {
      const now = new Date();
      clockEl.innerText = now.toTimeString().split(' ')[0];
    }, 1000);
  }
}

// ─── Telemetry Loop ───────────────────────────────────────────────────────────
async function startTelemetryLoop() {
  setInterval(async () => {
    try {
      const telemetry: any = await invoke("get_orb_telemetry");
      const vaultPath: any = await invoke("get_vault_path");

      const elAgents = document.getElementById("telemetry-agents");
      const elTokens = document.getElementById("telemetry-tokens");
      const elLatency = document.getElementById("telemetry-latency");
      const elVault = document.getElementById("telemetry-vault");

      if (telemetry && telemetry.data) {
        if (elAgents) elAgents.innerText = telemetry.data.active_agents.toString();
        if (elTokens) elTokens.innerText = telemetry.data.tokens_processed.toString();
        if (elLatency) elLatency.innerText = telemetry.data.latency_ms + "ms";

        currentDeliberationSpeed = telemetry.data.latency_ms < 500 ? 0.1 : 0.02;

        if (telemetry.data.active_tier === 1) {
            currentOrbColor = 'rgba(0, 255, 0,'; 
        } else if (telemetry.data.active_tier === 2) {
            currentOrbColor = 'rgba(255, 255, 0,'; 
        } else if (telemetry.data.active_tier === 3) {
            currentOrbColor = 'rgba(255, 69, 0,'; 
        } else {
            currentOrbColor = 'rgba(138, 43, 226,'; 
        }
      }
      
      if (vaultPath && vaultPath.data && elVault) {
        elVault.innerText = vaultPath.data;
      }
      
    } catch (err) {
      console.error("Telemetry sync failed:", err);
      currentOrbColor = 'rgba(255, 0, 0,'; 
    }
  }, 1000);
}

// ─── Kinetic Orb Renderer ──────────────────────────────────────────────────
export function initOrbRenderer(canvasId: string) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pulsePhase = 0;

    function draw() {
        ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
        
        pulsePhase += currentDeliberationSpeed; 
        const radius = 40 + Math.sin(pulsePhase) * 8; 
        const glow = 15 + Math.sin(pulsePhase) * 10;  

        ctx!.beginPath();
        ctx!.arc(canvas!.width / 2, canvas!.height / 2, radius, 0, Math.PI * 2);
        ctx!.fillStyle = `${currentOrbColor} 0.8)`;
        ctx!.shadowColor = `${currentOrbColor} 1.0)`;
        ctx!.shadowBlur = glow;
        ctx!.fill();
        ctx!.closePath();

        requestAnimationFrame(draw);
    }

    draw();
}

// ─── Boardroom Listeners ─────────────────────────────────────────────────────
async function wireBoardroomListeners() {
  const panel = document.getElementById("boardroom-panel");
  const transcript = document.getElementById("boardroom-transcript");
  const resultBox = document.getElementById("boardroom-result");
  const closeBtn = document.getElementById("boardroom-close");

  if (closeBtn && panel) {
    closeBtn.addEventListener("click", () => panel.classList.add("hidden"));
  }

  await listen('boardroom:start', (event: any) => {
    if (panel && transcript && resultBox) {
      panel.classList.remove("hidden");
      transcript.innerHTML = `<div><span class="text-purple-400">[SYSTEM]</span> Commencing triage for: ${event.payload}</div>`;
      resultBox.innerText = "Awaiting consensus...";
    }
  });

  await listen('boardroom:message', (event: any) => {
    if (transcript) {
      const msg = event.payload;
      const div = document.createElement("div");
      div.innerHTML = `<span class="text-blue-400">[${msg.agent_name} - ${msg.role}]</span> ${msg.content}`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }
  });

  await listen('boardroom:complete', (event: any) => {
    if (resultBox && transcript) {
      const pkg = event.payload;
      resultBox.innerText = `[CONSENSUS REACHED] Executor: ${pkg.selected_executor}`;
      
      const div = document.createElement("div");
      div.className = "text-emerald-400 mt-2 border-t border-zinc-800 pt-2";
      div.innerHTML = `<strong>Summary:</strong> ${pkg.consensus_summary}`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }
  });
}

// ─── HUD IDLE WATCHDOG ──────────────────────────────────────────────────────
let idleTimeout: number;
const IDLE_TIME_MS = 6000; // Fades out after 6 seconds

export function wakeUpHUD() {
  // Grab it dynamically inside the function so it never returns null
  const chatWrapper = document.getElementById("hud-chat-wrapper");
  
  if (chatWrapper) {
    chatWrapper.classList.remove("opacity-0");
    chatWrapper.classList.add("opacity-100");
  }

  clearTimeout(idleTimeout);

  idleTimeout = window.setTimeout(() => {
    if (chatWrapper) {
      chatWrapper.classList.remove("opacity-100");
      chatWrapper.classList.add("opacity-0"); 
    }
  }, IDLE_TIME_MS);
}

window.addEventListener("mousemove", wakeUpHUD);
window.addEventListener("keydown", wakeUpHUD);
window.addEventListener("click", wakeUpHUD);
// ────────────────────────────────────────────────────────────────────────────

// ─── Boot Sequence ───────────────────────────────────────────────────────────
async function boot() {
  startHudClock();
  await wireBoardroomListeners();
  startTelemetryLoop();
  wakeUpHUD(); // Initial wake

  // Instantiate your native core engine
  const canvasEl = document.getElementById("orb-canvas") as HTMLCanvasElement | null;
  if (canvasEl) {
    const orb = new KineticOrb(canvasEl);
    orb.start();
    
    // Opt-in audio engine context on first interaction
    document.body.addEventListener("click", () => {
      orb.enableAudio().catch(err => console.error("Audio Context initialization blocked:", err));
    }, { once: true });

    // Expose globally so startTelemetryLoop can update states via orb.setPhase()
    (window as any).VeraOrb = orb; 
  }

  const commandForm = document.getElementById("command-form") as HTMLFormElement | null;
  const commandInput = document.getElementById("command-input") as HTMLInputElement | null;
  const modeSelector = document.getElementById("hud-execution-mode") as HTMLSelectElement | null;
  const modelTargetSelector = document.getElementById("hud-model-target") as HTMLSelectElement | null;

  if (commandForm && commandInput) {
    commandForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = commandInput.value.trim();
      if (!value) return;

      commandInput.value = "";
      
      const selectedMode = modeSelector ? modeSelector.value : "single";
      const chosenModel = modelTargetSelector ? modelTargetSelector.value : "VERA-Triage";
      const chatLog = document.getElementById("chat-log");

      // 1. Render User Input
      if (chatLog) {
        chatLog.innerHTML += `
          <div class="text-zinc-400 font-mono my-2 pl-2 border-l border-zinc-800">
            <span class="text-zinc-600 font-bold">▲ USER [${selectedMode.toUpperCase()}]:</span> ${value}
          </div>
        `;
        chatLog.scrollTop = chatLog.scrollHeight;
        wakeUpHUD(); // Keep HUD awake while user is typing/sending
      }

      try {
        if (selectedMode === "agentic" || value.toLowerCase().includes("boardroom")) {
          await invoke("run_boardroom_debate", { task: value });
        } else {
          // 2. Dispatch tactical strike
          const response: any = await invoke("send_fast_message", { 
            message: value, 
            targetModel: chosenModel 
          });
          
          const outputText = response.data || response;

          // 3. Render Node Response
          if (chatLog) {
            chatLog.innerHTML += `
              <div class="text-zinc-300 font-mono my-2 bg-zinc-950/40 p-2 rounded border border-zinc-900/50">
                <span class="text-purple-400 font-bold">▶ VERA [${chosenModel}]:</span> ${outputText}
              </div>
            `;
            chatLog.scrollTop = chatLog.scrollHeight;
            wakeUpHUD(); // Wake HUD back up if it faded during processing
          }
        }
      } catch (err) {
        console.error("Pipeline Execution Error:", err);
        if (chatLog) {
          chatLog.innerHTML += `
            <div class="text-red-400 font-mono my-1 text-xs">
              <span class="text-red-500 font-bold">❌ MATRIX CRITICAL ERR:</span> ${err}
            </div>
          `;
          chatLog.scrollTop = chatLog.scrollHeight;
          wakeUpHUD(); // Wake up for errors too
        }
      }
    });
  }

  // Native Command Deck Boardroom Manual Override Button
  const boardroomBtn = document.getElementById("boardroom-trigger");
  if (boardroomBtn) {
    boardroomBtn.addEventListener("click", async () => {
      console.log("Forcing boardroom invocation sequence via Command Deck...");
      try {
        await invoke("run_boardroom_debate", { 
          task: "Execute complete system architecture sweep and evaluate node context constraints." 
        });
      } catch (err) {
        console.error("Failed to execute boardroom pipeline:", err);
      }
    });
  }
}

// ─── Document Lifecycle ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  boot();

  const appWindow = getCurrentWindow();
  const header = document.querySelector('header');

  // NATIVE WINDOW DRAGGING CORE
  if (header) {
    header.addEventListener('mousedown', async (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.titlebar-no-drag') || target.closest('button') || target.closest('select') || target.closest('input')) {
        return;
      }
      
      if (e.buttons === 1) {
        e.preventDefault();
        await appWindow.startDragging();
      }
    });
  }

  // MINIMIZE, EXIT, FULLSCREEN EVENT LISTENERS
  document.getElementById('btn-minimize')?.addEventListener('click', async () => {
    await appWindow.minimize();
  });

  document.getElementById('btn-maximize')?.addEventListener('click', async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  });

  document.getElementById('btn-close')?.addEventListener('click', async () => {
    await appWindow.close();
  });
});