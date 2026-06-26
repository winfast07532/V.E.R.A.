# AI.md — Project VERA: AI Collaborator Handoff Doc

> **Read this before touching any file.** This document exists so that any AI
> assistant (Gemini, GPT, another Claude session, etc.) picking up this
> codebase understands what exists, what's real vs. mocked, and what
> architectural decisions are load-bearing vs. arbitrary. Treat the
> "Decisions you must not silently reverse" section as binding unless the
> human explicitly asks for the change.

---

## 1. What this project actually is

Project VERA is a **Tauri v2 desktop application** (Rust backend + TypeScript/
HTML/Canvas frontend) for a multi-agent AI orchestrator. It is **not**:
- a web app running in a browser tab,
- an Electron app,
- a Python/Streamlit/Gradio prototype.

The defining UI element is the **Kinetic Purple Orb** — a canvas-rendered,
Web-Audio-reactive sphere that visualizes system state (standby / thinking /
boardroom / executing / error), sitting above a command/chat input bar.

The defining backend feature is the **Boardroom**: a simulated deliberation
among 14 named "management" agents that collectively decide which of the 24
registered models should execute a given task, producing a structured
`DelegationPackage`.

---

## 2. Origin context (important — don't re-derive this wrong)

The human originally uploaded a `.rar` containing 4 files: `Component
Breakdown.md`, `Delegation & Boardroom.md`, `index.html`, and `Model Routing
Schema (2).md`. **That archive's contents were never successfully extracted.**
It was a RAR5 *solid* archive (all files compressed into one continuous
proprietary stream), and the build environment had no `unrar` binary and no
network access to fetch one. Everything in this repo — the orb design, the
24-slot schema, the 14-agent boardroom roster — was built from the human's
**written prompt description**, not from the original files.

**If you have access to the original `index.html` / `.md` files (e.g. the
human re-uploads them as a `.zip` instead of `.rar`), treat them as the
source of truth and reconcile this codebase against them.** Until then, don't
assume the current orb visuals or copy match whatever the human originally
had — ask, or check for an updated upload, if visual fidelity matters.

---

## 3. Critical limitation: nothing has been compiled or run

The sandbox this was built in had **no Rust toolchain and no network access**
(npm registry returned 403s). Concretely, none of this has ever executed:

- `cargo check` / `cargo build` — Rust code has **never been compiled**
- `npm install` — frontend deps were never actually resolved
- `tauri dev` / `tauri build` — the app has **never launched**

What *was* validated, mechanically, without a toolchain:
- JSON syntax validity (`tauri.conf.json`, `models.json`, `package.json`, `capabilities/main.json`)
- Brace/paren balance across every `.rs` and `.ts` file (a crude but real check)
- Import paths and Tauri v2 API usage cross-checked against API knowledge, not against a live compiler

**Assume there are compile errors.** Realistic candidates if you're the one
who finally runs this:
- Rust crate version mismatches (Tauri v2 plugin ecosystem moves fast; pinned
  versions like `tauri-plugin-fs = "2.0.0"` may need bumping)
- `tauri.conf.json` schema drift between Tauri 2.0.0 and whatever patch
  version actually installs
- The `app.emit()` calls in `main.rs` use the Tauri v2 `Manager`/`Emitter`
  trait — double-check the exact trait import path for the installed version
- Frontend `@tauri-apps/api` v2 import paths (`@tauri-apps/api/core`,
  `/event`, `/window`) — these are correct for Tauri v2 but verify against
  whatever minor version actually resolves

**Your first job, if asked to "fix" or "run" this project, is almost
certainly: install deps, run `cargo check`, run `tsc --noEmit`, and fix
whatever breaks.** Don't assume it's broken — but don't assume it's clean either.

---

## 4. Architecture map

```
vera-project/
├── index.html                  # Entry HTML — orb canvas, titlebar, command bar
├── src/                        # Frontend (TypeScript)
│   ├── main.ts                 # App controller — wires orb + IPC + DOM events
│   ├── lib/
│   │   ├── orb.ts              # KineticOrb class — canvas particles + Web Audio
│   │   └── ipc.ts              # ALL Tauri invoke() calls live here, nowhere else
│   ├── types/vera.ts           # TS types mirroring Rust structs — keep in sync!
│   └── styles/main.css         # Tailwind directives + custom VERA tokens
├── src-tauri/                  # Backend (Rust)
│   ├── src/
│   │   ├── main.rs             # Entry point, all #[tauri::command]s, app state
│   │   ├── models.rs           # Serde structs — the Rust side of the IPC contract
│   │   ├── registry.rs         # Hardcoded 24-slot model registry (Rust source of truth)
│   │   ├── boardroom.rs        # 14-agent mock deliberation engine
│   │   ├── obsidian.rs         # Real async filesystem read/write for .md vault
│   │   └── lib.rs              # Thin re-export, exists for Tauri's mobile target
│   ├── models.json             # JSON mirror of registry.rs — currently NOT loaded at runtime (see §6)
│   ├── tauri.conf.json         # Window chrome, bundle targets, plugin config
│   ├── Cargo.toml              # Rust deps
│   └── capabilities/main.json  # Tauri v2 permission grants for the main window
├── tailwind.config.js          # Purple theme tokens (vera-core, vera-mid, vera-outer, etc.)
├── scaffold.sh                 # Toolchain check + npm install + cargo check, run this first
└── .env.example                # API key template — keys live in Rust env, never in frontend bundle
```

### The IPC contract (the most important thing to keep consistent)

Every Rust `#[tauri::command]` in `main.rs` has a hand-written TypeScript
mirror in `src/lib/ipc.ts`, and every Rust struct in `models.rs` has a
hand-written TypeScript interface in `src/types/vera.ts`. **There is no
codegen.** If you add/change a field on a Rust struct, you must manually
update the matching TS interface, or the IPC payload will silently
mismatch (Tauri does not type-check across the Rust/TS boundary for you).

Commands currently registered (`main.rs` → `invoke_handler!`):

| Rust command | TS wrapper (`ipc.ts`) | Purpose |
|---|---|---|
| `get_model_registry` | `getModelRegistry()` | Returns all 24 slots |
| `run_boardroom_debate` | `runBoardroomDebate(task)` | Runs the 14-agent mock debate, emits events while running |
| `write_to_obsidian` | `writeToObsidian(filename, content, opts)` | Real fs write to vault |
| `read_from_obsidian` | `readFromObsidian(filename)` | Real fs read |
| `list_obsidian_notes` | `listObsidianNotes()` | Recursive `.md` listing |
| `get_orb_telemetry` | `getOrbTelemetry()` | Current orb state snapshot |
| `get_vera_state` | `getVeraState()` | Full app state snapshot |
| `get_vault_path` | `getVaultPath()` | Resolves the active Obsidian vault dir |
| `send_fast_message` | `sendFastMessage(message)` | Quick non-boardroom path |
| `set_window_mode` | `setWindowMode(mode)` | Resize between compact/expanded |

All Rust commands return `VeaCommandResult<T>` (`{ success, data, error,
duration_ms }`). The `call<T>()` helper at the top of `ipc.ts` unwraps this
envelope and throws on `success: false` — callers in `main.ts` just get `T`
or a thrown `Error`. **Keep this envelope pattern for any new command** —
don't return raw values from new `#[tauri::command]` functions.

Events (one-way Rust → frontend push, separate from request/response):
- `boardroom:start` — fired when a debate begins
- `boardroom:message` — fired once per agent message, streamed during debate
- `boardroom:complete` — fired with the full `DelegationPackage` at the end

---

## 5. What's real vs. what's a mock (read this carefully)

This is the single most important section for not breaking trust with the
human. Be explicit, always, about which category any given piece of
functionality falls into.

### Real / functional (assuming it compiles):
- **Obsidian filesystem writes** (`obsidian.rs`) — actual async
  `tokio::fs` reads/writes, frontmatter injection, append mode, session
  logging. This is genuine I/O, not a stub.
- **The orb rendering** (`orb.ts`) — genuine canvas particle simulation and
  a genuine Web Audio oscillator/filter/gain graph reacting to phase changes.
- **The IPC plumbing itself** — commands, events, state management via
  `tokio::sync::Mutex<AppState>` — structurally real Tauri v2 patterns.
- **The 24-slot registry data** (`registry.rs` / `models.json`) — real,
  detailed, intentionally designed data — but it's *configuration*, not a
  live connection to any of those providers.

### Mocked / not wired to real AI providers:
- **`boardroom.rs`** generates all 14 agents' "deliberation" text via
  **Rust string templates with `match` statements on keywords in the task
  string** — e.g. if the task contains "code", it picks
  `MainArch-Sonnet`. **No actual API call to Anthropic/OpenAI/Google/Groq/
  Perplexity happens anywhere in this codebase.** `Cargo.toml` includes
  `reqwest` as a dependency specifically because it is **not yet used** —
  it's there for whoever wires up real provider calls next.
- **`send_fast_message`** similarly returns a templated string, not a real
  Haiku call.
- **`.env.example`** lists the API key env vars the registry *expects*
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) but **nothing in the Rust
  code currently reads these env vars or makes an HTTP request with them.**

**If the human asks you to "make the boardroom actually work" or "connect
the real models," that means: writing the `reqwest` HTTP call logic inside
`boardroom.rs` and `main.rs`'s `send_fast_message`, reading the
`api_key_env` field off each `ModelRegistryEntry`, and replacing the
template-string generation with real API calls.** That is a meaningfully
large next phase, not a small tweak — set expectations accordingly.

---

## 6. Known inconsistency you should resolve, not ignore

`registry.rs::ModelRegistry::load_defaults()` hardcodes all 24 slots
directly in Rust as the actual runtime source of truth. `models.json` in
`src-tauri/` is a **parallel, manually-kept-in-sync JSON description of the
same data** — written for human readability and as a config file Tauri's
`init()` *gestures at* loading (`config_path` is computed and passed to
`ModelRegistry::init()`) but **`init()` currently ignores `config_path` and
always calls `load_defaults()` regardless.** The file is never actually
read from disk at runtime.

This means: **editing `models.json` right now does nothing.** If a human
edits it expecting the app's behavior to change, it won't, and that will be
confusing. Either:
(a) implement actual JSON-file loading in `ModelRegistry::init()` with
    `load_defaults()` as a fallback when the file doesn't exist yet, or
(b) tell the human clearly that `models.json` is currently documentation-only
    and `registry.rs` is the real config.

Don't silently pick one — surface this to whoever you're working with before
assuming.

---

## 7. Design tokens / visual system (don't invent new colors)

Defined in `tailwind.config.js` under `theme.extend.colors.vera`:

```
vera-bg:        #0a0612   (window background)
vera-surface:   #120c1f   (panel background)
vera-surfaceAlt:#1a1228   (hover states)
vera-border:    rgba(167,139,250,0.15)
vera-core:      #a78bfa   (orb highlight / primary accent)
vera-mid:       #7c3aed   (orb mid-tone, button gradient)
vera-outer:     #4c1d95   (orb edge, deep shadow)
vera-accent:    #c4b5fd   (links, active labels)
vera-text:      #e9e4f7
vera-textDim:   #9b91b8
```

`orb.ts` has its **own separate** `PHASE_COLORS` map (standby/listening/
thinking/boardroom/executing/error → core/mid/outer hex triplets) because
canvas rendering can't consume Tailwind classes — it needs raw hex for
`createRadialGradient`. **If you change the Tailwind purple palette, you
must also update `PHASE_COLORS` in `orb.ts` by hand** to keep the orb and
the surrounding UI chrome visually consistent. There is no shared token
source between them currently — that's a real gap, not a stylistic choice.

---

## 8. Tauri v2 specifics worth knowing (version-sensitive)

- Window is **borderless**: `decorations: false`, `transparent: true` in
  `tauri.conf.json`. The custom titlebar (`#titlebar` in `index.html`) uses
  `-webkit-app-region: drag` via the `.titlebar-drag` CSS class — this is a
  webview-level CSS property, not a Tauri API, so it must stay in
  `main.css`/`index.html` as-is.
- Window controls (minimize/close/compact) call `getCurrentWindow()` from
  `@tauri-apps/api/window` directly in `main.ts` — **not** through a custom
  Rust command — except `compact` mode, which does go through the
  `set_window_mode` Rust command because it needs `tauri::LogicalSize`.
- Permissions are explicit in `src-tauri/capabilities/main.json` (Tauri v2's
  capability system, replacing v1's allowlist). **If you add a new Tauri
  plugin or a new fs/shell/dialog operation, you must add the matching
  permission string here or the call will be silently denied at runtime** —
  this is one of the most common Tauri v2 migration gotchas.
- `Cargo.toml` pins `tauri = "2.0.0"` and plugin crates at `"2.0.0"` exactly.
  These are likely outdated by the time you read this (Tauri v2 ships
  frequently). Check for newer 2.x releases before assuming version-pin
  issues are bugs in this code.

---

## 9. Things NOT to do without asking the human first

- Don't switch this to Electron, a plain web app, or any non-Tauri shell —
  "compiled native executable, no `npm run dev` requirement" was an explicit,
  repeated, capitalized requirement in the original brief.
- Don't remove the borderless/custom-titlebar window style in favor of a
  default OS chrome window — it's intentional, matches the "kinetic" brand.
- Don't quietly wire `boardroom.rs` to real APIs without flagging that
  you're doing so — this has real cost/billing implications the moment a
  human's API key is in `.env` and the app actually calls out.
- Don't delete or rewrite `models.json` to "fix" the sync issue in §6 without
  telling the human which direction you resolved it.
- Don't assume the original `index.html` from the `.rar` matches what's
  here — see §2.

---

## 10. Suggested next steps (if asked "what should we do next")

In rough dependency order:
1. Run `./scaffold.sh`, fix whatever `cargo check` / `tsc --noEmit` surface
   — this has never been compiled, so expect real work here.
2. Resolve the `models.json` vs `registry.rs` duplication (§6).
3. Generate real icons (`npx tauri icon <source.png>`) — `tauri build` will
   hard-fail without them; `tauri dev` is fine.
4. Decide whether to wire `boardroom.rs` to real provider APIs via `reqwest`
   (already a dependency) or keep it mocked for a demo/prototype phase —
   this is a product decision, not a technical one, surface it.
5. If real API wiring happens, add request timeout/retry/error handling
   per-provider in a new module (e.g. `src-tauri/src/providers.rs`) rather
   than inlining `reqwest` calls into `boardroom.rs` directly — keep the
   deliberation logic separate from HTTP plumbing.
6. Unify the orb's `PHASE_COLORS` with the Tailwind token source (§7) so
   there's one palette definition, not two.
