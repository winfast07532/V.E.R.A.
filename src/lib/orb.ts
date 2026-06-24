// src/lib/orb.ts
// Project VERA — Kinetic Purple Orb Telemetry Engine
// HTML5 Canvas 3D particle-mesh reactive to processing state, with
// a Web Audio synthesized ambient tone that shifts with system load.

export type OrbPhase = "standby" | "listening" | "thinking" | "boardroom" | "executing" | "error";

interface Particle {
  baseX: number;
  baseY: number;
  baseZ: number;
  size: number;
  randomOffset: number;
}

const PHASE_COLORS: Record<OrbPhase, { core: string; mid: string; outer: string }> = {
  standby:   { core: "#e9d5ff", mid: "#7c3aed", outer: "#4c1d95" },
  listening: { core: "#ffffff", mid: "#8b5cf6", outer: "#5b21b6" },
  thinking:  { core: "#f3e8ff", mid: "#a855f7", outer: "#6b21a8" },
  boardroom: { core: "#fae8ff", mid: "#c026d3", outer: "#86198f" },
  executing: { core: "#ffffff", mid: "#9333ea", outer: "#581c87" },
  error:     { core: "#fee2e2", mid: "#dc2626", outer: "#7f1d1d" },
};

export class KineticOrb {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animationFrame = 0;
  private time = 0;

  private phase: OrbPhase = "standby";
  private energy = 0.3;          
  private targetEnergy = 0.3;
  private pulseFrequency = 1.0;  

  // Web Audio
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private audioEnabled = false;

  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private centerX = 0;
  private centerY = 0;
  private baseRadius = 0;

  // Crank the particle count to 3000 to simulate the dense neural mesh
  constructor(canvas: HTMLCanvasElement, particleCount = 1100) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("VERA Orb: Canvas 2D context unavailable");
    this.ctx = ctx;

    this.resize();
    this.initParticles(particleCount);

    window.addEventListener("resize", () => this.resize());
  }

  // ── Public API ────────────────────────────────────────────────────────────

  setPhase(phase: OrbPhase) {
    this.phase = phase;
    const energyByPhase: Record<OrbPhase, number> = {
      standby: 0.3,
      listening: 0.5,
      thinking: 0.72,
      boardroom: 0.95,
      executing: 0.85,
      error: 0.6,
    };
    this.targetEnergy = energyByPhase[phase];

    const freqByPhase: Record<OrbPhase, number> = {
      standby: 0.6,
      listening: 1.0,
      thinking: 1.6,
      boardroom: 2.4,
      executing: 2.0,
      error: 3.2,
    };
    this.pulseFrequency = freqByPhase[phase];

    if (this.audioEnabled) this.updateAudioForPhase(phase);
  }

  setEnergyLevel(v: number) {
    this.targetEnergy = Math.max(0, Math.min(1, v));
  }

  async enableAudio() {
    if (this.audioEnabled) return;
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    this.oscillator = this.audioCtx.createOscillator();
    this.gainNode = this.audioCtx.createGain();
    this.filterNode = this.audioCtx.createBiquadFilter();

    this.oscillator.type = "sine";
    this.oscillator.frequency.value = 110; 
    this.filterNode.type = "lowpass";
    this.filterNode.frequency.value = 800;
    this.filterNode.Q.value = 4;
    this.gainNode.gain.value = 0; 

    this.oscillator.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);

    this.oscillator.start();
    this.gainNode.gain.linearRampToValueAtTime(0.035, this.audioCtx.currentTime + 1.2);

    this.audioEnabled = true;
  }

  disableAudio() {
    if (!this.audioEnabled || !this.audioCtx) return;
    this.gainNode?.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.6);
    setTimeout(() => {
      this.oscillator?.stop();
      this.audioCtx?.close();
      this.audioEnabled = false;
    }, 700);
  }

  start() {
    const loop = () => {
      this.time += 0.016;
      this.energy += (this.targetEnergy - this.energy) * 0.04;
      this.render();
      this.animationFrame = requestAnimationFrame(loop);
    };
    this.animationFrame = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.animationFrame);
  }

  destroy() {
    this.stop();
    this.disableAudio();
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.centerX = rect.width / 2;
    this.centerY = rect.height / 2;
    this.baseRadius = Math.min(rect.width, rect.height) * 0.45; // Expand to fill space
  }

  // Generate points evenly distributed within a 3D spherical volume
  private initParticles(count: number) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()) * this.baseRadius;

      const baseX = r * Math.sin(phi) * Math.cos(theta);
      const baseY = r * Math.sin(phi) * Math.sin(theta);
      const baseZ = r * Math.cos(phi);

      this.particles.push({
        baseX, baseY, baseZ,
        size: Math.random() * 1.2 + 0.2, // Tiny, sharp stars
        randomOffset: Math.random() * Math.PI * 2
      });
    }
  }

  private updateAudioForPhase(phase: OrbPhase) {
    if (!this.audioCtx || !this.oscillator || !this.filterNode) return;
    const t = this.audioCtx.currentTime;
    const freqByPhase: Record<OrbPhase, number> = {
      standby: 110, listening: 146.83, thinking: 174.61,
      boardroom: 220, executing: 196, error: 87.31,
    };
    this.oscillator.frequency.linearRampToValueAtTime(freqByPhase[phase], t + 0.8);
    this.filterNode.frequency.linearRampToValueAtTime(
      phase === "boardroom" ? 1800 : phase === "error" ? 400 : 800, t + 0.8
    );
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  private render() {
    const { ctx } = this;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    // Completely clear the canvas. No solid backgrounds.
    ctx.clearRect(0, 0, w, h);

    const colors = PHASE_COLORS[this.phase];
    const pulse = Math.sin(this.time * this.pulseFrequency) * 0.5 + 0.5;

    // ── Faint Deep Space Nebula Glow ──
    const glowGrad = ctx.createRadialGradient(
      this.centerX, this.centerY, this.baseRadius * 0.1,
      this.centerX, this.centerY, this.baseRadius * 1.5
    );
    glowGrad.addColorStop(0, this.hexToRgba(colors.mid, 0.2 * this.energy + 0.05));
    glowGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // ── 3D Rotation Matrix ──
    // Slow, ominous rotation on two axes
    const rotY = this.time * 0.2;
    const rotX = this.time * 0.1;
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    for (const p of this.particles) {
      // Internal particle jitter based on energy
      const jitter = Math.sin(this.time * 2 + p.randomOffset) * 8 * this.energy;
      
      let x = p.baseX;
      let y = p.baseY + jitter;
      let z = p.baseZ;

      // Rotate around Y axis
      let rx = x * cosY - z * sinY;
      let rz = x * sinY + z * cosY;

      // Rotate around X axis
      let ry = y * cosX - rz * sinX;
      rz = y * sinX + rz * cosX;

      // Energy expansion (breathes outward)
      const scale = 1 + (this.energy * 0.3) + (pulse * 0.05);
      rx *= scale;
      ry *= scale;
      rz *= scale;

      // 3D to 2D Perspective Projection
      const fov = 800;
      const zOffset = fov + rz;
      
      // Cull particles behind the camera
      if (zOffset < 10) continue; 

      const projScale = fov / zOffset;
      const finalX = this.centerX + rx * projScale;
      const finalY = this.centerY + ry * projScale;

      // Depth fading (particles further back fall into shadow)
      const depthAlpha = Math.max(0, Math.min(1, (rz + this.baseRadius * 1.5) / (this.baseRadius * 3)));
      const alpha = depthAlpha * (0.4 + this.energy * 0.6);
      
      // Dynamic sizing based on perspective
      const finalSize = Math.max(0.1, p.size * projScale);

      ctx.globalAlpha = alpha;
      
      // Highlight a small percentage of front-facing particles to mimic the bright white stars in the reference
      if (depthAlpha > 0.8 && Math.random() > 0.96) {
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = Math.min(1, alpha * 2);
      } else {
        ctx.fillStyle = colors.core;
      }

      ctx.beginPath();
      ctx.arc(finalX, finalY, finalSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1.0; 
  }
}