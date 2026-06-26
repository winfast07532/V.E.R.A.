// src/main.ts
// Project VERA — Frontend Application Controller

import "./styles/main.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { KineticOrb } from "./lib/orb"; // Match your actual folder path to orb.ts
import { parseVeraMarkdown } from "./lib/formatter";

// ─── Global State ─────────────────────────────────────────────────────────────
let currentDeliberationSpeed = 0.05;
let currentOrbColor = 'rgba(138, 43, 226,'; 
let commandHistory: string[] = []; // Tracks your past submitted prompts
let historyIndex = -1;             // Tracks where you are when tapping up/down
let temporaryInputCache = "";      // Stores what you typed before hitting Arrow Up
let speechEngine: any = null;
let isRecordingVoice = false;

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

        // Dynamically skew kinetic wave generation profiles based on pipeline latency
        currentDeliberationSpeed = telemetry.data.latency_ms < 500 ? 0.1 : 0.02;

        let glowShadow = '';
        
        // VERA HUD CORE PIXEL MATRIX TIER MONITOR INTEGRATION
        if (telemetry.data.active_tier === 1) {
            currentOrbColor = 'rgba(0, 255, 0,';   // Tier 1 Active -> Primary Core Green
            glowShadow = 'rgba(0, 255, 0, 0.03)';
        } else if (telemetry.data.active_tier === 2) {
            currentOrbColor = 'rgba(255, 255, 0,'; // Tier 2 Active -> Quota Fallback Yellow
            glowShadow = 'rgba(255, 255, 0, 0.03)';
        } else if (telemetry.data.active_tier === 3) {
            currentOrbColor = 'rgba(255, 69, 0,';  // Tier 3 Active -> Local Anchor Orange/Red
            glowShadow = 'rgba(255, 69, 0, 0.03)';
        } else {
            currentOrbColor = 'rgba(138, 43, 226,'; // Neutral Idle -> Deep VERA Purple
            glowShadow = 'rgba(138, 43, 226, 0.03)';
        }

        // UPDATE UI: Dynamically shift the glassmorphic ambient drop shadows and glass borders
        const chatWrapper = document.getElementById("hud-chat-wrapper");
        if (chatWrapper) {
          chatWrapper.style.boxShadow = `0 20px 50px ${glowShadow}`;
          chatWrapper.style.borderColor = `${currentOrbColor} 0.08)`;
        }
      }
      
      if (vaultPath && vaultPath.data && elVault) {
        elVault.innerText = vaultPath.data;
      }
      
    } catch (err) {
      console.error("Telemetry sync failed:", err);
      currentOrbColor = 'rgba(255, 0, 0,'; // Critical Network/API Failure -> Blood Red
      
      const chatWrapper = document.getElementById("hud-chat-wrapper");
      if (chatWrapper) {
        chatWrapper.style.boxShadow = '0 20px 50px rgba(255, 0, 0, 0.05)';
        chatWrapper.style.borderColor = 'rgba(255, 0, 0, 0.15)';
      }
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

  // Hook into native backend boardroom events
  await listen("boardroom:start", (event: any) => {
    if (panel && transcript && resultBox) {
      panel.classList.remove("hidden");
      // Formats the initial prompt string if it has code tokens or backticks
      transcript.innerHTML = `<div><span class="text-purple-400">[SYSTEM]</span> Commencing triage for: ${parseVeraMarkdown(event.payload)}</div>`;
      resultBox.innerText = "Awaiting consensus...";
    }
  });

  await listen("boardroom:message", (event: any) => {
    if (transcript) {
      const msg = event.payload;
      const div = document.createElement("div");
      div.className = "my-1";
      // Formats the live text streams emitted by active agents on the fly
      div.innerHTML = `<span class="text-blue-400">[${msg.agent_name} - ${msg.role}]</span> <div class="mt-0.5">${parseVeraMarkdown(msg.content)}</div>`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }
  });

  await listen("boardroom:complete", (event: any) => {
    if (resultBox && transcript) {
      const pkg = event.payload;
      resultBox.innerText = `[CONSENSUS REACHED] Executor: ${pkg.selected_executor}`;
      
      const div = document.createElement("div");
      div.className = "text-emerald-400 mt-2 border-t border-zinc-800 pt-2";
      // Formats final multi-line summary metrics or code blocks safely
      div.innerHTML = `<strong>Summary:</strong> <div>${parseVeraMarkdown(pkg.consensus_summary)}</div>`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }
  });
}

// ─── HUD IDLE WATCHDOG ──────────────────────────────────────────────────────
let idleTimeout: number;
const IDLE_TIME_MS = 6000; // Fades out after 6 seconds

export function wakeUpHUD() {
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

  // ─── Push-to-Talk Voice Module ──────────────────────────────────────────────
  const pttBtn = document.getElementById("hud-ptt-btn");
  
  // Check browser/webkit context availability
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (pttBtn && commandInput && commandForm) {
    if (!SpeechRecognition) {
      console.warn("Speech recognition engine not supported natively on this host subsystem platform.");
      pttBtn.classList.add("opacity-20", "cursor-not-allowed");
    } else {
      // Initialize configuration parameters
      speechEngine = new SpeechRecognition();
      speechEngine.continuous = true;
      speechEngine.interimResults = true;
      speechEngine.lang = "en-US";

      // Stream incoming audio chunks straight into the command line
      speechEngine.onresult = (event: any) => {
        let liveTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            liveTranscript += event.results[i][0].transcript;
          }
        }
        if (liveTranscript) {
          commandInput.value = liveTranscript;
        }
      };

      speechEngine.onerror = (err: any) => {
        console.error("Voice capture failure segment:", err.error);
        if (isRecordingVoice) {
          speechEngine.stop();
          isRecordingVoice = false;
          pttBtn.classList.remove("text-emerald-400", "border-emerald-500/40", "bg-emerald-950/20");
        }
      };

      // MOUSE/TOUCH HOLD DOWN: Start Recording
      const startVoiceCapture = (e: Event) => {
        e.preventDefault();
        if (isRecordingVoice) return;
        
        isRecordingVoice = true;
        commandInput.value = "";
        commandInput.placeholder = "[ VERA IS LISTENING... HOLD TO TALK ]";
        
        // Dynamic UI feedback styling
        pttBtn.classList.add("text-emerald-400", "border-emerald-500/40", "bg-emerald-950/20");
        
        speechEngine.start();
      };

      // MOUSE UP / LEAVE: Stop Recording & Auto-Submit
      const stopVoiceCapture = (e: Event) => {
        e.preventDefault();
        if (!isRecordingVoice) return;

        isRecordingVoice = false;
        commandInput.placeholder = "Interrogate core models or deploy automated runners...";
        pttBtn.classList.remove("text-emerald-400", "border-emerald-500/40", "bg-emerald-950/20");
        
        speechEngine.stop();

        // Deliberate slight pause to let final processing string commit before submit dispatch
        setTimeout(() => {
          if (commandInput.value.trim()) {
            commandForm.dispatchEvent(new Event("submit"));
          }
        }, 400);
      };

      // Bind interactions for both mouse and trackpad/touch handlers
      pttBtn.addEventListener("mousedown", startVoiceCapture);
      pttBtn.addEventListener("mouseup", stopVoiceCapture);
      pttBtn.addEventListener("mouseleave", stopVoiceCapture);
      
      pttBtn.addEventListener("touchstart", startVoiceCapture);
      pttBtn.addEventListener("touchend", stopVoiceCapture);
    }
  }
    // ─── Command History Keyboard Listener ───────────────────────────────────
    commandInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault(); // Prevent cursor jumping to the front of the text line
        if (commandHistory.length === 0) return;

        if (historyIndex === -1) {
          temporaryInputCache = commandInput.value;
        }

        if (historyIndex < commandHistory.length - 1) {
          historyIndex++;
          commandInput.value = commandHistory[commandHistory.length - 1 - historyIndex];
        }
      } 
      else if (e.key === "ArrowDown") {
        e.preventDefault();

        if (historyIndex > 0) {
          historyIndex--;
          commandInput.value = commandHistory[commandHistory.length - 1 - historyIndex];
        } else if (historyIndex === 0) {
          historyIndex = -1;
          commandInput.value = temporaryInputCache;
        }
      }
    });

    commandForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const value = commandInput.value.trim();
      if (!value) return;

      // Track prompt state variables in history cache layers on commit
      commandHistory.push(value);
      historyIndex = -1;
      temporaryInputCache = "";

      commandInput.value = "";
      
      const selectedMode = modeSelector ? modeSelector.value : "single";
      const chosenModel = modelTargetSelector ? modelTargetSelector.value : "VERA-Triage";
      const chatLog = document.getElementById("chat-log");

      // 1. Create a persistent wrapper frame for this interactive turn
      const turnWrapper = document.createElement("div");
      turnWrapper.className = "flex flex-col my-3";
      
      // Append user entry segment
      const userBox = document.createElement("div");
      userBox.className = "group relative text-zinc-400 font-mono my-1 pl-2 border-l border-zinc-800 flex flex-col";
      userBox.innerHTML = `
        <div><span class="text-zinc-600 font-bold">▲ USER [${selectedMode.toUpperCase()}]:</span> <span class="user-prompt">${value}</span></div>
        <div class="opacity-0 group-hover:opacity-100 flex gap-3 text-[10px] mt-1 text-zinc-500 transition-opacity duration-150 titlebar-no-drag">
          <button class="edit-trigger hover:text-purple-400 cursor-pointer">[Edit]</button>
        </div>
      `;

      // Bind edit click inline
      userBox.querySelector(".edit-trigger")?.addEventListener("click", () => {
        commandInput.value = value;
        commandInput.focus();
        turnWrapper.remove();
      });

      turnWrapper.appendChild(userBox);
      if (chatLog) {
        chatLog.appendChild(turnWrapper);
        chatLog.scrollTop = chatLog.scrollHeight;
        wakeUpHUD();
      }

      try {
        if (selectedMode === "agentic" || value.toLowerCase().includes("boardroom")) {
          await invoke("run_boardroom_debate", { task: value });
        } else {
          
          // src/main.ts -> Inside commandForm submit listener
          const response: any = await invoke("send_fast_message", { 
            message: value, 
            targetModel: chosenModel // Reverted to targetModel because your Rust backend strictly requires this exact key!
          });
          
          const outputText = response.data || response;
          
          // 3. Append VERA Response Frame straight into the current active turnWrapper
          const veraBox = document.createElement("div");
          veraBox.className = "group relative text-zinc-300 font-mono my-2 bg-zinc-950/40 p-2 rounded border border-zinc-900/50 flex flex-col";
          veraBox.innerHTML = `
            <div><span class="text-purple-400 font-bold">▶ VERA [${chosenModel}]:</span> <div class="mt-1">${parseVeraMarkdown(outputText)}</div></div>
            <div class="opacity-0 group-hover:opacity-100 flex gap-3 text-[10px] mt-1.5 text-zinc-500 transition-opacity duration-150 titlebar-no-drag">
              <button class="copy-trigger hover:text-emerald-400 cursor-pointer">[Copy]</button>
              <button class="retry-trigger hover:text-blue-400 cursor-pointer">[Retry]</button>
            </div>
          `;

          // Bind Copy Utility
          veraBox.querySelector(".copy-trigger")?.addEventListener("click", async (btnEvent) => {
            try {
              await navigator.clipboard.writeText(outputText);
              (btnEvent.target as HTMLButtonElement).innerText = "[Copied!]";
              setTimeout(() => { 
                if (veraBox) {
                  const btn = veraBox.querySelector(".copy-trigger") as HTMLButtonElement;
                  if (btn) btn.innerText = "[Copy]";
                }
              }, 1200);
            } catch (err) {
              console.error("Clipboard operational write failure:", err);
            }
          });

          // Bind Retry Utility
          veraBox.querySelector(".retry-trigger")?.addEventListener("click", () => {
            turnWrapper.remove();
            commandInput.value = value;
            commandForm.dispatchEvent(new Event("submit"));
          });

          turnWrapper.appendChild(veraBox);
          if (chatLog) {
            chatLog.scrollTop = chatLog.scrollHeight;
            wakeUpHUD();
          }
        }
      } catch (err) {
        console.error("Pipeline Execution Error:", err);
        const errBox = document.createElement("div");
        errBox.className = "text-red-400 font-mono my-1 text-xs pl-2 border-l border-red-900/40 flex items-center gap-2";
        errBox.innerHTML = `
          <span><span class="text-red-500 font-bold">❌ MATRIX CRITICAL ERR:</span> ${err}</span>
          <button class="err-retry border border-zinc-800 px-1 rounded bg-black/20 text-[9px] hover:text-red-400 transition-colors cursor-pointer titlebar-no-drag">RETRY</button>
        `;
        
        errBox.querySelector(".err-retry")?.addEventListener("click", () => {
          turnWrapper.remove();
          commandInput.value = value;
          commandForm.dispatchEvent(new Event("submit"));
        });

        turnWrapper.appendChild(errBox);
        if (chatLog) {
          chatLog.scrollTop = chatLog.scrollHeight;
          wakeUpHUD();
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