import { Sfx } from '../audio/sfx';
import type { Material } from './config/balance';

/**
 * Bruitages d'Olive Storm, synthétisés avec le moteur commun (src/audio/sfx.ts).
 * Rien n'est enregistré ni emprunté : tout est produit par des oscillateurs et du bruit.
 */
export class OliveSfx extends Sfx {
  private lastRatchet = 0;

  /** Armement de la catapulte : un cran de crémaillère, plus aigu quand la puissance monte. */
  ratchet(power: number): void {
    const now = performance.now();
    if (now - this.lastRatchet < 45) return;
    this.lastRatchet = now;
    this.tone(260 + power * 520, 0.03, 'square', 0.07);
    this.noise(0.02, 0.05, 3000, 1200);
  }

  /** Lancement : ressort qui claque, puis sifflement. */
  launchShot(power: number): void {
    this.tone(160 + power * 80, 0.16, 'sawtooth', 0.2, 0, 620 + power * 500);
    this.tone(90, 0.1, 'square', 0.16, 0, 50);
    this.noise(0.22 + power * 0.2, 0.14, 2400 + power * 3000, 500, 0.03);
  }

  /** Rebond : le timbre dépend de la matière, le volume de la vitesse d'impact. */
  bounce(mat: Material, speed: number): void {
    const v = Math.min(1, speed / 420);
    const vol = 0.06 + v * 0.2;
    switch (mat) {
      case 'metal':
        this.tone(1180 + v * 500, 0.22, 'square', vol * 0.7);
        this.tone(1770 + v * 700, 0.3, 'sine', vol * 0.6);
        this.tone(590, 0.12, 'triangle', vol * 0.6);
        break;
      case 'glass':
        this.tone(2400 + v * 600, 0.14, 'sine', vol * 0.8);
        this.tone(3600, 0.1, 'sine', vol * 0.4, 0.02);
        break;
      case 'olive':
        this.tone(300, 0.05, 'sine', vol * 0.6, 0, 180);
        break;
      default:
        this.tone(190 + v * 60, 0.07, 'triangle', vol, 0, 110);
        this.noise(0.04, vol * 0.5, 1200, 400);
    }
  }

  /** L'olive s'installe dans le verre. */
  plop(): void {
    this.tone(320, 0.12, 'sine', 0.3, 0, 900);
    this.tone(1318, 0.09, 'square', 0.09, 0.1);
    this.tone(1760, 0.16, 'square', 0.09, 0.18);
  }

  /** Olive écrasée. */
  splat(): void {
    this.noise(0.12, 0.2, 900, 200);
    this.tone(150, 0.14, 'sawtooth', 0.12, 0, 70);
  }

  phase(): void {
    for (let i = 0; i < 3; i++) this.tone(880, 0.09, 'square', 0.1, i * 0.14);
    this.tone(1175, 0.3, 'square', 0.1, 0.42);
  }

  /** Le ventilateur démarre. Le ronflement continu passe par la nappe commune (startTension). */
  fanStart(): void {
    this.tone(60, 0.9, 'sawtooth', 0.12, 0, 190);
    this.noise(0.9, 0.08, 500, 2200);
  }

  woof(delay = 0): void {
    this.tone(430, 0.09, 'sawtooth', 0.2, delay, 250);
    this.noise(0.07, 0.12, 1800, 500, delay);
    this.tone(400, 0.11, 'sawtooth', 0.18, delay + 0.14, 220);
  }

  /** Interception : claquement de mâchoire. */
  chomp(): void {
    this.noise(0.05, 0.3, 2600, 500);
    this.tone(220, 0.08, 'square', 0.2, 0, 90);
    this.tone(520, 0.12, 'sine', 0.14, 0.09, 900);
  }

  radarPing(delay = 0): void {
    this.tone(1480, 0.5, 'sine', 0.16, delay, 1440);
    this.tone(2960, 0.3, 'sine', 0.04, delay);
  }

  /** L'olive file vers l'espace. */
  rocket(): void {
    this.noise(1.1, 0.3, 600, 6000);
    this.tone(120, 1.1, 'sawtooth', 0.14, 0, 1900);
  }

  /** « Ding » de la casserole, « dong » de l'horloge : au ralenti. */
  slowDing(delay: number, low: boolean): void {
    const f = low ? 392 : 880;
    this.tone(f, 0.9, 'sine', 0.22, delay);
    this.tone(f * 2.01, 0.7, 'sine', 0.08, delay);
    this.tone(f * 0.5, 0.5, 'triangle', 0.1, delay);
  }

  /** PLOC. */
  ploc(): void {
    this.tone(700, 0.07, 'sine', 0.35, 0, 160);
    this.noise(0.05, 0.14, 1500, 300);
  }

  /** Le verre de pastis touche les dalles. */
  glassCrash(delay = 0): void {
    this.noise(0.25, 0.3, 9000, 2500, delay);
    [3100, 4200, 2600, 5200, 3700].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.07, delay + 0.03 + i * 0.045));
    this.noise(0.3, 0.1, 1200, 300, delay + 0.05);
  }

  /** Hurlement caricatural de Jean-Mi : une voix de synthèse qui monte, tient, et tremble. */
  yell(): void {
    // MAU — RIIIIII — CE
    this.tone(150, 0.22, 'sawtooth', 0.22, 0, 210);
    this.tone(300, 0.22, 'square', 0.08, 0, 420);
    for (let i = 0; i < 14; i++) {
      const t = 0.22 + i * 0.075;
      const wob = i % 2 ? 1.035 : 0.97;
      this.tone(330 * wob + i * 6, 0.09, 'sawtooth', 0.24, t);
      this.tone(990 * wob, 0.09, 'square', 0.07, t);
      this.tone(2300, 0.06, 'square', 0.025, t);
    }
    this.tone(360, 0.5, 'sawtooth', 0.2, 1.27, 110);
    this.noise(0.4, 0.12, 2500, 400, 1.27);
  }

  /** Sirène d'alerte à deux tons. */
  siren(): void {
    for (let i = 0; i < 4; i++) {
      this.tone(440, 0.42, 'sawtooth', 0.1, i * 0.84, 880);
      this.tone(880, 0.42, 'sawtooth', 0.1, i * 0.84 + 0.42, 440);
    }
  }

  /** Fanfare de victoire originale d'Olive Storm. */
  fanfareOlive(): void {
    const beat = 0.14;
    const lead: [number, number][] = [
      [523.25, 0.5], [523.25, 0.5], [523.25, 0.5], [659.25, 1.5],
      [587.33, 0.5], [659.25, 0.5], [783.99, 1], [0, 0.5],
      [698.46, 0.5], [783.99, 0.5], [880.0, 0.5], [783.99, 0.5], [1046.5, 3],
    ];
    const bass: [number, number][] = [[130.81, 3], [146.83, 2.5], [174.61, 1], [196.0, 1], [261.63, 3]];
    let t = 0.05;
    for (const [f, len] of lead) {
      if (f) {
        this.tone(f, len * beat * 0.9, 'square', 0.14, t);
        this.tone(f * 2, len * beat * 0.6, 'square', 0.03, t);
      }
      t += len * beat;
    }
    t = 0.05;
    for (const [f, len] of bass) {
      this.tone(f, len * beat * 0.95, 'triangle', 0.2, t);
      t += len * beat;
    }
    for (let i = 0; i < 4; i++) this.drum(0.05 + i * beat * 0.5);
    this.noise(1, 0.14, 9000, 3000, 0.05 + 7.5 * beat);
  }
}
