// src/lib/orb.ts
// Project VERA — Stable Cinematic Accretion Singularity Engine
// Precision Coordinate-Mapped 3D Mesh with Dampened Fluid Turbulence,
// Relativistic Lensing, and Context-Locked Window Responsive Boundaries.

export type OrbPhase = "standby" | "listening" | "thinking" | "boardroom" | "executing" | "error";

interface Particle {
  x: number;
  y: number;
  z: number;
  size: number;
  randomOffset: number;
  orbitalRadius: number;
  orbitalSpeed: number;
  isRingParticle: boolean;
  history: { x: number; y: number; alpha: number }[]; 
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
  private pulseFrequency = 0.5;  // Cut in half to eliminate hyper-flicker
  private voiceEnergyModifier = 0; 

  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private centerX = 0;
  private centerY = 0;
  private baseRadius = 0;

  constructor(canvas: HTMLCanvasElement, totalParticles = 1400) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("VERA Orb: Canvas 2D context unavailable");
    this.ctx = ctx;

    const self = this;

    window.addEventListener("vera-orb-phase-shift", (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const targetPhase = customEvent.detail;
      
      if (["standby", "listening", "thinking", "boardroom", "executing", "error"].includes(targetPhase)) {
        self.setPhase(targetPhase as OrbPhase);
      }
    });

    this.resize();
    this.initParticles(totalParticles);

    window.addEventListener("resize", () => {
      this.resize();
    });
  }

  setPhase(phase: OrbPhase) {
    this.phase = phase;
    
    const energyByPhase: Record<OrbPhase, number> = {
      standby: 0.2,   // Dropped base idling energy
      listening: 0.6,     
      thinking: 1.2,  // Hard capped load velocity limits    
      boardroom: 0.9,     
      executing: 0.8,     
      error: 1.5,         
    };
    this.targetEnergy = energyByPhase[phase];

    const freqByPhase: Record<OrbPhase, number> = {
      standby: 0.3,
      listening: 0.8,
      thinking: 1.8,      
      boardroom: 1.2,
      executing: 1.0,
      error: 2.2,
    };
    this.pulseFrequency = freqByPhase[phase];
  }

  setEnergyLevel(v: number) {
    this.targetEnergy = Math.max(0, Math.min(1, v));
  }

  setEnergyFromVoice(level: number) {
    // Smoothly scale voice inputs down so they dont blow out the geometry limits
    this.voiceEnergyModifier = level * 0.4;
  }

  enableAudio() {
    return Promise.resolve(); // Kept interface signature untouched
  }

  disableAudio() {
    // Kept interface signature untouched
  }

  start() {
    const loop = () => {
      this.time += 0.008; // Cut global elapsed clock speed in half for stable drift
      
      const activeTarget = this.voiceEnergyModifier > 0 ? this.voiceEnergyModifier : this.targetEnergy;
      this.energy += (activeTarget - this.energy) * 0.05; // Smooth interpolation damping
      
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
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.centerX = rect.width / 2;
    this.centerY = rect.height / 2;
    // CRITICAL STABILIZATION: Dropped scale multiplier from 0.44 to 0.32 so it NEVER clips window bounds
    this.baseRadius = Math.min(rect.width, rect.height) * 0.32; 
  }

  private initParticles(count: number) {
    this.particles = [];
    
    const sphereCount = Math.floor(count * 0.65);
    const ringCount = count - sphereCount;

    // Stable Normalized Sphere
    for (let i = 0; i < sphereCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = Math.cbrt(Math.random()); 

      this.particles.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        size: Math.random() * 1.0 + 0.3, 
        randomOffset: Math.random() * Math.PI * 2,
        orbitalRadius: r,
        orbitalSpeed: 1.0,
        isRingParticle: false,
        history: []
      });
    }

    // Stable Saturn Accretion Ring 
    for (let i = 0; i < ringCount; i++) {
      const initialTheta = Math.random() * 2.0 * Math.PI;
      const r = 1.15 + Math.random() * 0.45; // Locked inner/outer margin expansion thresholds
      const keplerSpeed = Math.sqrt(1.0 / r) * 1.2;

      this.particles.push({
        x: r * Math.cos(initialTheta),
        y: (Math.random() - 0.5) * 0.02, 
        z: r * Math.sin(initialTheta),
        size: Math.random() * 0.8 + 0.2,
        randomOffset: initialTheta, // Bind offset cleanly to angle trajectory
        orbitalRadius: r,
        orbitalSpeed: keplerSpeed,
        isRingParticle: true,
        history: []
      });
    }
  }

  private render() {
    const { ctx } = this;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    ctx.clearRect(0, 0, w, h);

    const colors = PHASE_COLORS[this.phase];
    const pulse = Math.sin(this.time * this.pulseFrequency) * 0.5 + 0.5;

    // Soft Static Background Ambient Glow (Damped)
    const glowGrad = ctx.createRadialGradient(
      this.centerX, this.centerY, this.baseRadius * 0.1,
      this.centerX, this.centerY, this.baseRadius * 1.3
    );
    glowGrad.addColorStop(0, this.hexToRgba(colors.mid, 0.15 * this.energy + 0.03));
    glowGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // Uniform rotational matrix velocities
    const sphereRotY = this.time * 0.4;
    const ringRotY = this.time * 0.6;
    const globalTiltX = 0.40; // Flat, clean isometric perspective slant
    const cosX = Math.cos(globalTiltX), sinX = Math.sin(globalTiltX);
    
    const fov = 600;
    const globalScale = 1.0 + (this.energy * 0.12) + (pulse * 0.02);

    for (const p of this.particles) {
      let calcX = p.x;
      let calcY = p.y;
      let calcZ = p.z;

      let currentRotY = sphereRotY;

      if (p.isRingParticle) {
        const ringTheta = ringRotY * p.orbitalSpeed + p.randomOffset;
        // Tight vertical wave harmonic ripples - completely prevents exploding particles
        const verticalWave = Math.sin(this.time * 2.0 + p.orbitalRadius * 5.0) * (0.02 * this.energy);
        
        calcX = p.orbitalRadius * Math.cos(ringTheta);
        calcY = p.y + verticalWave;
        calcZ = p.orbitalRadius * Math.sin(ringTheta);
        currentRotY = 0; 
      } else {
        // Soft matrix micro-jitter (Locked down to safe scaling thresholds)
        const jitter = Math.sin(this.time * 2.0 + p.randomOffset) * (0.03 * this.energy);
        calcY += jitter;
      }

      // Compute Rotations cleanly relative to base scalar vectors
      const cosY = Math.cos(currentRotY), sinY = Math.sin(currentRotY);
      
      let rx = calcX * cosY - calcZ * sinY;
      let rz = calcX * sinY + calcZ * cosY;

      let ry = calcY * cosX - rz * sinX;
      rz = calcY * sinX + rz * cosX;

      // Project absolute bounds based on responsive window baseline limits
      rx *= this.baseRadius * globalScale;
      ry *= this.baseRadius * globalScale;
      rz *= this.baseRadius * globalScale;

      const zOffset = fov + rz;
      if (zOffset < 10) continue;

      let projScale = fov / zOffset;
      let finalX = this.centerX + rx * projScale;
      let finalY = this.centerY + ry * projScale;

      // Controlled Einsteinian Lensing Offset Loop
      if (rz < 0) { 
        const dx = finalX - this.centerX;
        const dy = finalY - this.centerY;
        const distanceToCore = Math.sqrt(dx * dx + dy * dy);
        const einsteinRadius = (this.baseRadius * 0.2) * this.energy; 
        
        if (distanceToCore > 2 && distanceToCore < einsteinRadius * 2.0) {
          const warpFactor = 1.0 + (einsteinRadius * einsteinRadius) / (distanceToCore * distanceToCore + 10);
          finalX = this.centerX + dx * warpFactor * 0.95;
          finalY = this.centerY + dy * warpFactor * 0.95;
        }
      }

      const depthAlpha = Math.max(0, Math.min(1, (rz + this.baseRadius * 1.5) / (this.baseRadius * 3.0)));
      const alpha = depthAlpha * (0.35 + this.energy * 0.45);
      const finalSize = Math.max(0.1, p.size * projScale);

      ctx.globalAlpha = alpha;
      
      if (!p.isRingParticle && depthAlpha > 0.85 && Math.random() > 0.97) {
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = Math.min(1.0, alpha * 1.8);
      } else {
        ctx.fillStyle = colors.core;
      }

      ctx.beginPath();
      ctx.arc(finalX, finalY, finalSize, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1.0; 
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}