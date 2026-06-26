# V.E.R.A. CONTROL DECK
> **V**elocity **E**ngineered **R**esponse & **A**gentic **Orchestrator**

An advanced, high-performance stateless modular agentic pipeline and desktop control deck built on **Tauri v2**, **TypeScript**, **Tailwind CSS**, and **Rust**. VERA completely bypasses external proxies (such as 9Router) by implementing an intelligent embedded Orchestrator matrix that natively supervises a tiered, high-availability, no-crash execution loop.

---

## ⚡ Architectural Blueprint & System Engine

[ USER PROMPT / VOICE INPUT ]
                 │
                 ▼
   ┌───────────────────────────┐
   │     VERA FRONTEND HUD     │ ◄─── [ DEVELOPMENT.md ]
   │  (Glassmorphic Framework)  │      (Absolute Source of Truth)
   └─────────────┬─────────────┘
                 │  (Tauri IPC Invoke Channel)
                 ▼
   ┌───────────────────────────┐
   │   EMBEDDED ORCHESTRATOR   │
   │     (Backend Kernel)      │
   └─────────────┬─────────────┘
                 │
     ┌───────────┼───────────┐
     ▼           ▼           ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ TIER 1  │ │ TIER 2  │ │ TIER 3  │
│ Primary │ │  Cloud  │ │  Local  │
│ Expert  │ │ Backup  │ │ Anchor  │
└─────────┘ └─────────┘ └─────────┘

The system operates on an absolute stateless design approach across three strict fallback execution boundaries to guarantee maximum output validation and 100% processing uptime:

* **Tier 1 (Primary Specialist Node):** High-performance localized and specialized models (e.g., `Qwen3-Coder`, `Nemotron 550B`) optimized for immediate technical task compliance.
* **Tier 2 (Cloud Fallback Router):** High-reasoning cloud alternatives (e.g., `GLM-4`) programmatically targeted to exhaust free API quotas intelligently when Tier 1 limits are saturated.
* **Tier 3 (The Local Anchor):** Local system failover loop powered by an offline `Ollama` layer running on dedicated infrastructure (e.g., Mac Studio / NUC), guaranteeing operational execution regardless of API or internet availability.

### 📜 The Source of Truth Directive
To completely neutralize multi-agent model hallucinations across automated tasks, `DEVELOPMENT.md` serves as the absolute, load-bearing runtime reference for project state that the orchestrator enforces.

---

## 🎨 High-Fidelity Interface Features

The frontend dashboard combines futuristic glassmorphic UI elements with real-time hardware monitoring:

* **Dynamic Kinetic Orb Renderer:** A canvas-rendered, Web-Audio-reactive core sphere that visualizes live machine status via specific telemetry metrics (Green for Tier 1 Primary, Yellow for Tier 2 Cloud, Orange/Red for Tier 3 Local Anchor, Deep Purple for Standby, and Blood Red for Critical Network Faults).
* **Frosted Glassmorphism Layering:** High-fidelity hardware-accelerated translucent panels (`backdrop-blur-md`) configured with glowing responsive border shadows that adapt dynamically to the system's runtime layer.
* **Watchdog Fading Engine:** An automated layout script that smoothly decreases chat control opacity to `opacity-0` during processing standby and flips instantly to 100% layout prominence upon cursor sweeps or key actions.

---

## ⚙️ Advanced Chat & Execution Mechanics

* **Isolated Code Box Splitting:** The internal markdown engine splits incoming data chunks into isolated terminal display cards. Each block handles internal strings separately, providing standalone text selections, `[Copy]` macros, and dedicated context-recycle `[Retry]` buttons.
* **Inline Content Mutators:** User entry blocks contain built-in `[Edit]` mechanics that securely clear the historical layout segment while pulling the raw value string back down into the active command prompt line.
* **Terminal Ring History Buffer:** A keyboard event listener intercepts text frames inside the input line. Pressing **Arrow Up** or **Arrow Down** walks backwards and forwards through previous submissions without clearing half-typed text drafts.
* **Boardroom Debate Integration:** Provides a dual-pane overlay frame monitoring continuous triage from 14 individual advisory node daemons. Every incoming event stream passes through the `parseVeraMarkdown` engine to ensure technical output structures never disrupt layout integrity.

---

## 🛠️ The 10x Operational Roadmap (Next Directives)

To evolve Project VERA from a high-fidelity visual prototype into an absolute automation powerhouse, implementation will proceed through these exact operational phases:

### Phase 1: Complete System Voice Integration
* Wire the push-to-talk dashboard component (`#hud-ptt-btn`) to handle voice interaction pipelines.
* **Frontend Track (Fast Deploy):** Hook `SpeechRecognition` API chains directly into `src/main.ts` to capture mic data streams locally, stream strings into the prompt bar, and auto-submit on button release.
* **Backend Track (High Performance):** Bind Tauri hardware channels to open local audio recording states using Rust (`cpal`), caching raw `.wav` buffers to step into local Whisper execution models.

### Phase 2: Core Compiling & Sync Alignment
* Run system-wide compilation audits (`cargo check` and `tsc --noEmit`) to reconcile frontend IPC calls with active backend signatures.
* Resolve synchronization structural variations between the local model registry files (`models.json`) and the native Rust backend command matrices (`registry.rs`).
* Establish strict request constraints, connection expiration cutoffs, and network retry algorithms inside a centralized handler module (`src-tauri/src/providers.rs`).

### Phase 3: The Obsidian Autopilot Bridge
* Establish background file monitoring routines that interface directly with your designated local digital knowledge vault path (`get_vault_path`).
* Automate the serialization of verified consensus briefs, system architecture diagrams, and pipeline telemetry logs directly into Markdown notes within your Obsidian directories upon boardroom consensus execution.

### Phase 4: Production Packing & Assets
* Generate concrete native icon assets using the Tauri command utility suite (`npx tauri icon <source.png>`) to resolve build blockages.
* Configure final compilation profiles for target desktop deployment environments (`x86_64-pc-windows-msvc`, `aarch64-apple-darwin`).

---

## 🚀 Workspace Controls

### Dev Verification
Deploy the full multi-tier desktop application instance in local monitoring mode:
```bash
# Pull packages
npm install

# Boot Tauri core pipeline
npm run tauri dev