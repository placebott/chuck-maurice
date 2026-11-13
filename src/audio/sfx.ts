/**
 * Sons 100 % synthétisés (Web Audio) : aucun fichier audio à charger.
 * Le contexte n'est créé qu'au premier geste du joueur (règle des navigateurs).
 */
type Wave = OscillatorType;

const NOTE: Record<string, number> = {
  D4: 293.66, G4: 392.0, A4: 440.0, B4: 493.88, D5: 587.33,
  E4: 329.63, C4: 261.63, Bb3: 233.08, A3: 220.0, Ab3: 207.65, G3: 196.0,
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tensionOsc: OscillatorNode[] = [];
  private tensionGain: GainNode | null = null;
  private tensionFilter: BiquadFilterNode | null = null;
  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  /** À appeler depuis un geste utilisateur. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: Wave, vol: number, delay = 0, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, from: number, to: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  // ------------------------------------------------------------ effets
  ui(): void {
    this.tone(660, 0.07, 'square', 0.12);
    this.tone(990, 0.09, 'square', 0.1, 0.06);
  }

  /** Appui « FORCER » : le ton monte avec la puissance. */
  tap(power: number): void {
    const f = 140 + power * 5.2;
    this.tone(f, 0.07, 'square', 0.13, 0, f * 1.25);
    this.noise(0.04, 0.05, 1800, 600);
  }

  /** Grognement de Chuck. */
  grunt(intensity: number): void {
    const f = 95 + intensity * 60 + Math.random() * 20;
    this.tone(f, 0.22, 'sawtooth', 0.16, 0, f * 0.62);
    this.noise(0.18, 0.06, 900, 300);
  }

  typewriter(): void {
    this.tone(1200 + Math.random() * 200, 0.025, 'square', 0.05);
  }

  drum(delay = 0): void {
    this.noise(0.09, 0.22, 3000, 800, delay);
    this.tone(180, 0.08, 'triangle', 0.18, delay, 90);
  }

  introRoll(): void {
    for (let i = 0; i < 10; i++) this.drum(i * 0.055);
    this.tone(196, 0.4, 'square', 0.14, 0.6);
    this.tone(392, 0.5, 'square', 0.14, 0.6);
  }

  go(): void {
    this.tone(523.25, 0.12, 'square', 0.16);
    this.tone(783.99, 0.3, 'square', 0.16, 0.1);
    this.drum();
  }

  tick(urgent: boolean): void {
    this.tone(urgent ? 1400 : 1000, 0.05, 'square', 0.1);
  }

  resist(): void {
    this.tone(160, 0.12, 'square', 0.22, 0, 70);
    this.noise(0.12, 0.25, 1200, 200);
    this.tone(110, 0.3, 'sawtooth', 0.12, 0.1, 60);
  }

  pop(): void {
    this.tone(300, 0.12, 'sine', 0.35, 0, 1400);
    this.noise(0.08, 0.2, 6000, 2000);
  }

  /** « Allons enfants de la patrie… » — domaine public, heureusement. */
  fanfare(wobbly = false): void {
    const beat = 0.19;
    const seq: [string, number][] = [
      ['D4', 0.5], ['D4', 0.75], ['D4', 0.25], ['G4', 1], ['G4', 1],
      ['A4', 1], ['A4', 1], ['D5', 1.5], ['B4', 0.5], ['G4', 1.6],
    ];
    let t = 0.12;
    for (const [n, len] of seq) {
      const detune = wobbly ? 1 + (Math.random() - 0.5) * 0.09 : 1;
      const f = NOTE[n] * detune;
      this.tone(f, len * beat * 0.95, 'square', 0.15, t);
      this.tone(f / 2, len * beat * 0.95, 'triangle', 0.14, t);
      if (wobbly) this.tone(f * 1.06, len * beat, 'sawtooth', 0.04, t);
      t += len * beat;
    }
  }

  explosion(): void {
    this.noise(1.6, 0.7, 5000, 60);
    this.tone(90, 1.2, 'sine', 0.6, 0, 28);
    this.tone(60, 0.5, 'square', 0.25, 0.02, 30);
    for (let i = 0; i < 4; i++) this.noise(0.35, 0.3, 2500, 100, 0.45 + i * 0.32);
    // alarme
    for (let i = 0; i < 4; i++) {
      this.tone(880, 0.16, 'square', 0.07, 1.5 + i * 0.36);
      this.tone(660, 0.16, 'square', 0.07, 1.68 + i * 0.36);
    }
  }

  /** Trombone triste. */
  fail(): void {
    const seq: [string, number][] = [['Bb3', 0.36], ['A3', 0.36], ['Ab3', 0.36], ['G3', 0.9]];
    let t = 0.1;
    for (const [n, len] of seq) {
      this.tone(NOTE[n], len, 'sawtooth', 0.16, t, NOTE[n] * 0.96);
      t += len;
    }
  }

  medal(): void {
    [880, 1108, 1318, 1760].forEach((f, i) => this.tone(f, 0.12, 'square', 0.1, i * 0.07));
  }

  // ------------------------------------------------------------ tension continue
  startTension(): void {
    if (!this.ctx || !this.master || this.tensionGain) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    f.connect(g).connect(this.master);
    for (const detune of [0, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55;
      o.detune.value = detune;
      o.connect(f);
      o.start();
      this.tensionOsc.push(o);
    }
    this.tensionGain = g;
    this.tensionFilter = f;
  }

  setTension(power: number): void {
    if (!this.ctx || !this.tensionGain || !this.tensionFilter) return;
    const p = Math.min(1, Math.max(0, power / 100));
    const t = this.ctx.currentTime;
    this.tensionGain.gain.setTargetAtTime(p * p * 0.16, t, 0.05);
    this.tensionFilter.frequency.setTargetAtTime(250 + p * 1800, t, 0.05);
    for (const o of this.tensionOsc) o.frequency.setTargetAtTime(55 + p * 130, t, 0.05);
  }

  stopTension(): void {
    if (!this.ctx || !this.tensionGain) return;
    const t = this.ctx.currentTime;
    this.tensionGain.gain.setTargetAtTime(0, t, 0.03);
    const oscs = this.tensionOsc;
    const g = this.tensionGain;
    this.tensionOsc = [];
    this.tensionGain = null;
    this.tensionFilter = null;
    window.setTimeout(() => {
      oscs.forEach((o) => o.stop());
      g.disconnect();
    }, 300);
  }
}
