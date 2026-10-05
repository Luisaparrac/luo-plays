import { el } from './dom';

interface Ring {
  /** Milliseconds since the ring was born. */
  age: number;
  strength: number;
}

interface Spark {
  x: number;
  y: number;
  size: number;
  age: number;
  spin: number;
}

/**
 * A photocopied halftone that beats along with the music: rings ripple out
 * from the record, dots swell as they pass, a marker scribble jumps on every
 * beat and little stars pop on the downbeat.
 *
 * Spotify's audio is encrypted, so none of this is read from the sound. Each
 * song gets its own tempo (from its id) so they do not all move the same way.
 */
export class Visualizer {
  readonly element = el('canvas', 'visualizer', [], { 'aria-hidden': 'true' });

  private static readonly SPACING = 12;
  private static readonly RING_SPEED = 0.26; // pixels per millisecond
  private static readonly RING_LIFE = 1700;
  private static readonly SPARK_LIFE = 750;

  private readonly context = this.element.getContext('2d') as CanvasRenderingContext2D;
  private readonly resizer: ResizeObserver;

  private energy = 0.06;
  private target = 0.06;
  private accent = '#D4FF3A';
  private frame = 0;
  private lastFrame = 0;

  private clock = 0;
  private beatMs = 500;
  private beatCount = 0;
  private kick = 0;
  private rings: Ring[] = [];
  private sparks: Spark[] = [];

  constructor() {
    this.resizer = new ResizeObserver(() => this.fit());
    this.resizer.observe(this.element);
  }

  setPlaying(playing: boolean): void {
    this.target = playing ? 1 : 0.06;
  }

  setAccent(color: string): void {
    this.accent = color;
  }

  /** Picks a tempo between 84 and 136 BPM that stays the same for the same song. */
  setSeed(seed: string): void {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    this.beatMs = 60000 / (84 + (hash % 53));
  }

  start(): void {
    if (this.frame) return;
    this.lastFrame = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(50, now - this.lastFrame);
      this.lastFrame = now;
      this.update(dt);
      this.draw();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resizer.disconnect();
  }

  private fit(): void {
    const ratio = window.devicePixelRatio || 1;
    this.element.width = Math.max(1, Math.floor(this.element.clientWidth * ratio));
    this.element.height = Math.max(1, Math.floor(this.element.clientHeight * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  /** Advances the beat clock, the rings and the stars. */
  private update(dt: number): void {
    this.energy += (this.target - this.energy) * Math.min(1, dt * 0.004);
    this.kick *= Math.exp(-dt / 140);

    if (this.target > 0.5) {
      this.clock += dt;
      if (this.clock >= this.beatMs) {
        this.clock -= this.beatMs;
        this.onBeat();
      }
    }
    this.rings.forEach((ring) => (ring.age += dt));
    this.rings = this.rings.filter((ring) => ring.age < Visualizer.RING_LIFE);
    this.sparks.forEach((spark) => (spark.age += dt));
    this.sparks = this.sparks.filter((spark) => spark.age < Visualizer.SPARK_LIFE);
  }

  private onBeat(): void {
    const downbeat = this.beatCount % 4 === 0;
    this.beatCount++;
    this.kick = downbeat ? 1 : 0.6;
    this.rings.push({ age: 0, strength: downbeat ? 1 : 0.65 });

    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    const count = downbeat ? 4 : 1;
    for (let i = 0; i < count; i++) {
      this.sparks.push({
        x: width * (0.2 + Math.random() * 0.75),
        y: height * (0.12 + Math.random() * 0.76),
        size: 6 + Math.random() * 9,
        age: 0,
        spin: (Math.random() - 0.5) * 3,
      });
    }
  }

  private draw(): void {
    const width = this.element.clientWidth;
    const height = this.element.clientHeight;
    if (width === 0 || height === 0) return;
    this.context.clearRect(0, 0, width, height);
    this.drawHalftone(width, height);
    this.drawScribble(width, height);
    this.drawSparks();
  }

  /** The dot grid. Rings and a slow drifting wave make the dots swell. */
  private drawHalftone(width: number, height: number): void {
    const ctx = this.context;
    const spacing = Visualizer.SPACING;
    const originX = 0;
    const originY = height / 2;
    const drift = this.clock * 0.002 + this.beatCount * 0.7;

    const paper = new Path2D();
    const lime = new Path2D();

    for (let y = spacing / 2; y < height; y += spacing) {
      for (let x = spacing / 2; x < width; x += spacing) {
        const distance = Math.hypot(x - originX, y - originY);
        let swell = 0;
        for (const ring of this.rings) {
          const radius = ring.age * Visualizer.RING_SPEED;
          const fade = 1 - ring.age / Visualizer.RING_LIFE;
          const band = (distance - radius) / 20;
          swell += Math.exp(-band * band) * fade * ring.strength;
        }
        const ambient = (0.5 + 0.5 * Math.sin(x * 0.045 - drift + Math.sin(y * 0.06 + drift * 0.6))) * 0.3 * this.energy;
        const value = Math.min(1, swell + ambient);
        const radius = 0.9 + value * (spacing * 0.46);
        const path = value > 0.55 ? lime : paper;
        path.moveTo(x + radius, y);
        path.arc(x, y, radius, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = 'rgba(233, 228, 216, 0.3)';
    ctx.fill(paper);
    ctx.fillStyle = this.accent;
    ctx.fill(lime);
  }

  /** A marker scribble that jumps on the beat, drawn twice for a misprinted look. */
  private drawScribble(width: number, height: number): void {
    const wobbleTime = this.clock * 0.004;
    this.scribble(width, height, 5, 'rgba(233, 228, 216, 0.55)', 2, wobbleTime + 0.4);
    this.scribble(width, height, 0, this.accent, 3, wobbleTime);
  }

  private scribble(width: number, height: number, shift: number, color: string, lineWidth: number, phase: number): void {
    const ctx = this.context;
    const points = 28;
    const amplitude = height * (0.07 + 0.3 * this.kick) * this.energy;
    ctx.beginPath();
    for (let i = 0; i < points; i++) {
      const x = (i / (points - 1)) * width;
      const wander = Math.sin(i * 0.9 + phase * 5) * Math.sin(i * 0.31 + phase * 2);
      const side = i % 2 === 0 ? -1 : 1;
      const y = height / 2 + shift + side * amplitude * (0.35 + 0.65 * Math.abs(wander));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  /** Four-pointed stars, the same sparkle used around the page. */
  private drawSparks(): void {
    const ctx = this.context;
    for (const spark of this.sparks) {
      const life = spark.age / Visualizer.SPARK_LIFE;
      const grow = Math.sin(life * Math.PI);
      const size = spark.size * grow;
      if (size < 0.5) continue;
      const turn = spark.spin * life;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 + turn;
        const reach = i % 2 === 0 ? size : size * 0.28;
        const px = spark.x + Math.cos(angle) * reach;
        const py = spark.y + Math.sin(angle) * reach;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#E9E4D8';
      ctx.fill();
    }
  }
}
