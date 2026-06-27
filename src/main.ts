// src/main.ts
// Project VERA — Frontend Application Controller (Fully Functional Multi-Node HUD Patch)

import "./styles/main.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { KineticOrb } from "./lib/orb"; 
import { parseVeraMarkdown } from "./lib/formatter";

// ─── Global State ─────────────────────────────────────────────────────────────
let currentDeliberationSpeed = 0.05;
let currentOrbColor = 'rgba(138, 43, 226,'; 
let commandHistory: string[] = []; 
let historyIndex = -1;             
let temporaryInputCache = "";      
let speechEngine: any = null;
let isVoiceCallMode = false; 
let voiceController: AbortController | null = null;

const LOCAL_TTS_URL = "http://localhost:8880/v1/audio/speech";
const KOKORO_VOICE_ID = "af_bella"; 
let currentAudioPlayback: HTMLAudioElement | null = null;

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
let lastRenderedTier = -1;
let lastRenderedVault = "";

async function startTelemetryLoop() {
  setInterval(async () => {
    try {
      const telemetry: any = await invoke("get_orb_telemetry");
      const vaultPath: any = await invoke("get_vault_path");

      const elTokens = document.getElementById("vital-tokens");
      const elLatency = document.getElementById("telemetry-latency");
      const elVault = document.getElementById("telemetry-vault");
      const chatWrapper = document.getElementById("hud-chat-wrapper");
      const transcriptPanel = document.getElementById("boardroom-panel");

      // FIXED: Element mappings paired with the true HTML IDs
      const elComputeLoad = document.getElementById("vital-compute");
      const elContextWindow = document.getElementById("vital-context");
      const elUplinkStatus = document.getElementById("uplink-status-text");
      const elActiveRunners = document.getElementById("telemetry-runners");

      // FIXED: Daemon Checklist nodes linked directly to state properties
      const cbRegistrySync = document.getElementById("cb-registry-sync") as HTMLInputElement | null;
      const cbObsidianBridge = document.getElementById("cb-obsidian-bridge") as HTMLInputElement | null;
      const cbDiskWatchdog = document.getElementById("cb-disk-watchdog") as HTMLInputElement | null;

      if (isVoiceCallMode) {
        if (transcriptPanel) {
          transcriptPanel.style.display = "none"; 
          transcriptPanel.classList.add("hidden");
        }
        currentOrbColor = 'rgba(255, 255, 255,'; 
      } else {
        if (transcriptPanel && !transcriptPanel.classList.contains("hidden")) {
          transcriptPanel.style.display = ""; 
        }
      }

      if (telemetry && telemetry.data) {
        if (elTokens) elTokens.innerText = telemetry.data.tokens_processed.toLocaleString();
        if (elLatency) elLatency.innerText = telemetry.data.latency_ms + "ms";
        
        // Populate core vitals panel with zero truncation errors
        if (elComputeLoad) elComputeLoad.innerText = (telemetry.data.compute_load || "0.00") + "%";
        if (elContextWindow) elContextWindow.innerText = (telemetry.data.context_window_pct || "0") + "%";
        if (elActiveRunners) elActiveRunners.innerText = (telemetry.data.active_runners || "0").toString();
        if (elUplinkStatus) elUplinkStatus.innerText = isVoiceCallMode ? "VOICE SESSION" : (telemetry.data.uplink_status || "STANDBY");

        // Dynamically shift UI daemon checkboxes
        if (cbRegistrySync) cbRegistrySync.checked = !!telemetry.data.daemon_registry_sync;
        if (cbObsidianBridge) cbObsidianBridge.checked = !!telemetry.data.daemon_obsidian_bridge;
        if (cbDiskWatchdog) cbDiskWatchdog.checked = !!telemetry.data.daemon_disk_watchdog;

        currentDeliberationSpeed = telemetry.data.latency_ms < 500 ? 0.1 : 0.02;
        const currentTier = telemetry.data.active_tier;

        if (currentTier !== lastRenderedTier || isVoiceCallMode) {
          lastRenderedTier = isVoiceCallMode ? -2 : currentTier; 
          let glowShadow = '';
          
          if (!isVoiceCallMode) {
            if (currentTier === 1) {
              currentOrbColor = 'rgba(0, 255, 0,';   
              glowShadow = 'rgba(0, 255, 0, 0.03)';
            } else if (currentTier === 2) {
              currentOrbColor = 'rgba(255, 255, 0,'; 
              glowShadow = 'rgba(255, 255, 0, 0.03)';
            } else if (currentTier === 3) {
              currentOrbColor = 'rgba(255, 69, 0,';  
              glowShadow = 'rgba(255, 69, 0, 0.03)';
            } else {
              currentOrbColor = 'rgba(138, 43, 226,'; 
              glowShadow = 'rgba(138, 43, 226, 0.03)';
            }
          } else {
            glowShadow = 'rgba(255, 255, 255, 0.03)';
          }

          if (chatWrapper) {
            requestAnimationFrame(() => {
              chatWrapper.style.boxShadow = `0 20px 50px ${glowShadow}`;
              chatWrapper.style.borderColor = `${currentOrbColor} 0.08)`;
            });
          }
        }
      }
      
      if (vaultPath && vaultPath.data && elVault && vaultPath.data !== lastRenderedVault) {
        lastRenderedVault = vaultPath.data;
        elVault.innerText = vaultPath.data;
      }
      
    } catch (err) {
      console.error("Telemetry loop faulted:", err);
    }
  }, 1000);
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

  await listen("boardroom:start", (event: any) => {
    if (panel && transcript && resultBox) {
      panel.classList.remove("hidden");
      transcript.innerHTML = `<div><span class="text-purple-400">[SYSTEM]</span> Commencing triage for: ${parseVeraMarkdown(event.payload)}</div>`;
      resultBox.innerText = "Awaiting consensus...";
    }
  });

  await listen("boardroom:message", (event: any) => {
    if (transcript) {
      const msg = event.payload;
      const div = document.createElement("div");
      div.className = "my-1";
      div.innerHTML = `<span class="text-blue-400">[${msg.agent_name} - ${msg.role}]</span> <div class="mt-0.5">${parseVeraMarkdown(msg.content)}</div>`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }
  });

  await listen("boardroom:complete", (event: any) => {
    if (resultBox && transcript) {
      const pkg = event.payload;
      resultBox.innerText = `[CONSENSUS] Executor: ${pkg.selected_executor}`;
      const div = document.createElement("div");
      div.className = "text-emerald-400 mt-2 border-t border-zinc-800 pt-2";
      div.innerHTML = `<strong>Summary:</strong> <div>${parseVeraMarkdown(pkg.consensus_summary)}</div>`;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }
  });
}

// ─── HUD IDLE WATCHDOG ──────────────────────────────────────────────────────
let idleTimeout: number;
const IDLE_TIME_MS = 6000; 

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

// ─── Audio Helper Functions ──────────────────────────────────────────────────
function safelyKillAudioEngine() {
  if (currentAudioPlayback) {
    currentAudioPlayback.pause();
    currentAudioPlayback.src = "";
    currentAudioPlayback.load();
    currentAudioPlayback = null;
  }
  if (voiceController) {
    voiceController.abort();
    voiceController = null;
  }
}

async function streamVeraVoiceOutput(text: string) {
  safelyKillAudioEngine();
  window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "executing" }));
  
  if (speechEngine) { try { speechEngine.stop(); } catch(e) {} }
  voiceController = new AbortController();

  try {
    const cleanTextForSpeech = text
      .replace(/```[\s\S]*?```/g, "[Code generated.]")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[*_#\-]/g, "");

    const response = await fetch(LOCAL_TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: cleanTextForSpeech,
        voice: KOKORO_VOICE_ID,
        response_format: "mp3",
        speed: 1.05 
      }),
      signal: voiceController.signal
    });

    if (!response.ok) throw new Error(`TTS Status Fault: ${response.status}`);
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    
    currentAudioPlayback = new Audio(audioUrl);

    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    const audioCtx = new AudioContextClass();
    const source = audioCtx.createMediaElementSource(currentAudioPlayback);
    const analyser = audioCtx.createAnalyser();
    
    analyser.fftSize = 64; 
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    source.connect(analyser);
    analyser.connect(audioCtx.destination);

    const trackVolume = () => {
      if (!currentAudioPlayback || currentAudioPlayback.paused) return;
      analyser.getByteFrequencyData(dataArray);
      let total = 0;
      for (let i = 0; i < dataArray.length; i++) total += dataArray[i];
      const averageVolume = total / dataArray.length;
      
      if ((window as any).VeraOrb) {
        const dynamicEnergy = 1.2 + ((averageVolume / 255) * 2.5);
        (window as any).VeraOrb.setEnergyFromVoice(dynamicEnergy);
      }
      requestAnimationFrame(trackVolume);
    };

    currentAudioPlayback.onplay = () => {
      audioCtx.resume();
      trackVolume();
    };
    
    currentAudioPlayback.onended = () => {
      if ((window as any).VeraOrb) (window as any).VeraOrb.setEnergyFromVoice(0);
      if (isVoiceCallMode) {
        window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "listening" }));
        if (speechEngine) { try { speechEngine.start(); } catch(e) {} }
      } else {
        window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "standby" }));
      }
      audioCtx.close();
    };

    await currentAudioPlayback.play();
  } catch (err: any) {
    if (err.name !== 'AbortError') console.error("Audio pipeline failed:", err);
  }
}

// ─── Boot Sequence ───────────────────────────────────────────────────────────
async function boot() {
  startHudClock();
  await wireBoardroomListeners();
  startTelemetryLoop();
  wakeUpHUD(); 

  const canvasEl = document.getElementById("orb-canvas") as HTMLCanvasElement | null;
  if (canvasEl) {
    const orb = new KineticOrb(canvasEl);
    orb.start();
    document.body.addEventListener("click", () => {
      orb.enableAudio().catch(err => console.error("Audio Context initialization blocked:", err));
    }, { once: true });
    (window as any).VeraOrb = orb; 
  }

  const commandForm = document.getElementById("command-form") as HTMLFormElement | null;
  const commandInput = document.getElementById("command-input") as HTMLInputElement | null;
  const modeSelector = document.getElementById("hud-execution-mode") as HTMLSelectElement | null;
  const modelTargetSelector = document.getElementById("hud-model-target") as HTMLSelectElement | null;

  // FIXED: Bound functional listener nodes straight to layout Command Deck list buttons
  const btnBoardroom = document.getElementById("deck-boardroom");
  const btnRegistry = document.getElementById("deck-registry");
  const btnVault = document.getElementById("deck-vault");
  const btnClearMem = document.getElementById("deck-clear-memory");
  const btnAttachment = document.getElementById("hud-attachment-btn");

  if (btnBoardroom) {
    btnBoardroom.addEventListener("click", () => {
      if (commandInput) {
        commandInput.value = "Initiate boardroom triage protocol regarding: ";
        commandInput.focus();
      }
    });
  }

  if (btnRegistry) {
    btnRegistry.addEventListener("click", async () => {
      window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "thinking" }));
      try {
        await invoke("inspect_model_registry");
      } catch (e) { console.error(e); }
    });
  }

  if (btnVault) {
    btnVault.addEventListener("click", async () => {
      try {
        await invoke("open_secure_vault_explorer");
      } catch (e) { console.error(e); }
    });
  }

  if (btnClearMem) {
    btnClearMem.addEventListener("click", async () => {
      if (confirm("Flush pipeline session history cache?")) {
        try {
          await invoke("flush_pipeline_memory");
          const chatLog = document.getElementById("chat-log");
          if (chatLog) chatLog.innerHTML = `<div class="text-zinc-600 font-mono text-[9px] uppercase">[SYSTEM CONTEXT FLUSHED CLEAN]</div>`;
        } catch (e) { console.error(e); }
      }
    });
  }

  if (btnAttachment) {
    btnAttachment.addEventListener("click", async () => {
      try {
        const path: string = await invoke("trigger_file_attachment_dialog");
        if (path && commandInput) {
          commandInput.value += ` [File: ${path}]`;
        }
      } catch (e) { console.error(e); }
    });
  }

  if (commandForm && commandInput) {
    const pttBtn = document.getElementById("hud-ptt-btn");
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (pttBtn && SpeechRecognition) {
      speechEngine = new SpeechRecognition();
      speechEngine.continuous = true;
      speechEngine.interimResults = false; 
      speechEngine.lang = "en-US";

      speechEngine.onresult = (event: any) => {
        if (currentAudioPlayback && !currentAudioPlayback.paused) return;
        let liveTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) liveTranscript += event.results[i][0].transcript;
        }
        if (liveTranscript.trim()) {
          commandInput.value = liveTranscript;
          try { speechEngine.stop(); } catch(e) {}
          window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "thinking" }));
          commandForm.dispatchEvent(new Event("submit"));
        }
      };

      speechEngine.onend = () => {
        if (isVoiceCallMode) { try { speechEngine.start(); } catch(e) {} }
      };

      pttBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (currentAudioPlayback && !currentAudioPlayback.paused) {
          safelyKillAudioEngine();
          window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "listening" }));
          try { speechEngine.start(); } catch(e) {}
          return;
        }

        isVoiceCallMode = !isVoiceCallMode;

        if (isVoiceCallMode) {
          pttBtn.style.background = "rgba(138, 43, 226, 0.4)";
          pttBtn.style.borderColor = "#8a2be2";
          pttBtn.style.color = "#ffffff";
          
          const transcriptPanel = document.getElementById("boardroom-panel");
          if (transcriptPanel) {
            transcriptPanel.style.display = "none";
            transcriptPanel.classList.add("hidden");
          }
          window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "listening" }));
          try { speechEngine.start(); } catch(e) {}
        } else {
          pttBtn.style.background = "";
          pttBtn.style.borderColor = "";
          pttBtn.style.color = "";
          
          const transcriptPanel = document.getElementById("boardroom-panel");
          if (transcriptPanel) {
            transcriptPanel.style.display = "none";
            transcriptPanel.classList.add("hidden");
          }
          window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "standby" }));
          try { speechEngine.stop(); } catch(e) {}
          safelyKillAudioEngine();
        }
      });
    }

    commandInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length === 0) return;
        if (historyIndex === -1) temporaryInputCache = commandInput.value;
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

      commandHistory.push(value);
      historyIndex = -1;
      temporaryInputCache = "";
      commandInput.value = "";
      
      const selectedMode = modeSelector ? modeSelector.value : "single";
      const chosenModel = modelTargetSelector ? modelTargetSelector.value : "VERA-Triage";
      const chatLog = document.getElementById("chat-log");

      window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "thinking" }));

      const turnWrapper = document.createElement("div");
      turnWrapper.className = "flex flex-col my-3";
      
      const userBox = document.createElement("div");
      userBox.className = "group relative text-zinc-400 font-mono my-1 pl-2 border-l border-zinc-800 flex flex-col";
      userBox.innerHTML = `
        <div><span class="text-zinc-600 font-bold">▲ USER [${selectedMode.toUpperCase()}]:</span> <span class="user-prompt">${value}</span></div>
        <div class="opacity-0 group-hover:opacity-100 flex gap-3 text-[10px] mt-1 text-zinc-500 transition-opacity duration-150 titlebar-no-drag">
          <button class="edit-trigger hover:text-purple-400 cursor-pointer">[Edit]</button>
        </div>
      `;

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
          window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "boardroom" }));
          await invoke("run_boardroom_debate", { task: value });
        } else {
          const response: any = await invoke("send_fast_message", { 
            message: value, 
            targetModel: chosenModel 
          });
          const outputText = response.data || response;
          
          if (isVoiceCallMode) {
            await streamVeraVoiceOutput(outputText);
          } else {
            try {
              if (currentAudioPlayback) {
                currentAudioPlayback.pause();
                currentAudioPlayback.src = "";
              }
              window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "executing" }));

              const cleanTextForSpeech = outputText
                .replace(/```[\s\S]*?```/g, "[Code configuration generated.]")
                .replace(/`([^`]+)`/g, "$1")
                .replace(/[*_#\-]/g, "");

              const localTtsResponse = await fetch(LOCAL_TTS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "kokoro",
                  input: cleanTextForSpeech,
                  voice: KOKORO_VOICE_ID,
                  response_format: "mp3",
                  speed: 1.05 
                })
              });

              if (!localTtsResponse.ok) throw new Error(`Local TTS Node Fault: ${localTtsResponse.status}`);
              const audioBlob = await localTtsResponse.blob();
              const audioUrl = URL.createObjectURL(audioBlob);
              
              currentAudioPlayback = new Audio(audioUrl);
              currentAudioPlayback.onended = () => {
                window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "standby" }));
              };
              await currentAudioPlayback.play();
            } catch (speechErr) {
              console.error(speechErr);
              window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "standby" }));
            }
          }
          
          const veraBox = document.createElement("div");
          veraBox.className = "group relative text-zinc-300 font-mono my-2 bg-zinc-950/40 p-2 rounded border border-zinc-900/50 flex flex-col";
          veraBox.innerHTML = `
            <div><span class="text-purple-400 font-bold">▶ VERA [${chosenModel}]:</span> <div class="mt-1">${parseVeraMarkdown(outputText)}</div></div>
            <div class="opacity-0 group-hover:opacity-100 flex gap-3 text-[10px] mt-1.5 text-zinc-500 transition-opacity duration-150 titlebar-no-drag">
              <button class="copy-trigger hover:text-emerald-400 cursor-pointer">[Copy]</button>
              <button class="retry-trigger hover:text-blue-400 cursor-pointer">[Retry]</button>
            </div>
          `;

          veraBox.querySelector(".copy-trigger")?.addEventListener("click", async (btnEvent) => {
            try {
              await navigator.clipboard.writeText(outputText);
              (btnEvent.target as HTMLButtonElement).innerText = "[Copied!]";
              setTimeout(() => { 
                const btn = veraBox.querySelector(".copy-trigger") as HTMLButtonElement;
                if (btn) btn.innerText = "[Copy]";
              }, 1200);
            } catch (err) { console.error(err); }
          });

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
        console.error(err);
        window.dispatchEvent(new CustomEvent("vera-orb-phase-shift", { detail: "error" }));
      }
    });
  }

  // Window frame controller events
  document.getElementById('btn-minimize')?.addEventListener('click', async () => { await getCurrentWindow().minimize(); });
  document.getElementById('btn-maximize')?.addEventListener('click', async () => {
    const win = getCurrentWindow();
    (await win.isMaximized()) ? await win.unmaximize() : await win.maximize();
  });
  document.getElementById('btn-close')?.addEventListener('click', async () => { await getCurrentWindow().close(); });
}

document.addEventListener('DOMContentLoaded', () => {
  boot();
  const header = document.querySelector('header');
  if (header) {
    header.addEventListener('mousedown', async (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.titlebar-no-drag') || target.closest('button') || target.closest('select') || target.closest('input')) return;
      if (e.buttons === 1) {
        e.preventDefault();
        await getCurrentWindow().startDragging();
      }
    });
  }
});