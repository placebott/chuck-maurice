import { Sfx } from '../audio/sfx';
import type { Quality } from './config/balance';

/**
 * Bruitages de Saucissonator 3000, synthétisés avec le moteur commun (src/audio/sfx.ts).
 * Les sons partagés (interface, briefing, tic-tac, médaille, explosion…) viennent de la classe mère.
 */
export class CharcuterieSfx extends Sfx {
  /** Le couteau fend l'air, puis « TCHAK » : le timbre dépend de la qualité de la coupe. */
  chop(quality: Quality): void {
    this.noise(0.05, 0.1, 5200, 1400); // sifflement de la lame
    const t = 0.035;
    switch (quality) {
      case 'perfect':
        this.noise(0.07, 0.34, 7000, 900, t);
        this.tone(190, 0.09, 'triangle', 0.3, t, 70);
        this.tone(1568, 0.07, 'square', 0.09, t + 0.03);
        this.tone(2093, 0.12, 'square', 0.09, t + 0.08);
        break;
      case 'good':
        this.noise(0.07, 0.3, 5200, 700, t);
        this.tone(170, 0.09, 'triangle', 0.28, t, 65);
        this.tone(1047, 0.07, 'square', 0.06, t + 0.04);
        break;
      case 'thick':
        this.noise(0.13, 0.36, 2400, 220, t);
        this.tone(120, 0.2, 'square', 0.26, t, 42);
        this.tone(196, 0.16, 'sawtooth', 0.1, t + 0.1, 150);
        break;
      case 'thin':
        this.noise(0.035, 0.2, 8000, 3500, t);
        this.tone(880, 0.06, 'square', 0.08, t, 520);
        this.tone(311, 0.14, 'sawtooth', 0.08, t + 0.07, 262);
        break;
      case 'disaster':
        this.noise(0.3, 0.5, 3000, 120, t);
        this.tone(90, 0.4, 'square', 0.3, t, 30);
        break;
    }
  }

  /** La rondelle retombe sur la planche. */
  land(delay = 0): void {
    this.tone(240, 0.045, 'triangle', 0.14, delay, 150);
    this.noise(0.03, 0.06, 1400, 500, delay);
    this.tone(210, 0.035, 'triangle', 0.07, delay + 0.13, 150);
  }

  /** Mode charcuterie tactique. */
  combo(): void {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
      this.tone(f, 0.11, 'square', 0.11, i * 0.045);
      this.tone(f / 2, 0.11, 'triangle', 0.1, i * 0.045);
    });
    this.noise(0.35, 0.12, 9000, 2000, 0.02);
  }

  woof(delay = 0): void {
    this.tone(430, 0.09, 'sawtooth', 0.2, delay, 250);
    this.noise(0.07, 0.12, 1800, 500, delay);
    this.tone(400, 0.11, 'sawtooth', 0.18, delay + 0.14, 220);
    this.noise(0.08, 0.1, 1600, 400, delay + 0.14);
  }

  /** Le boxer file avec le butin. */
  theft(): void {
    this.woof();
    this.tone(260, 0.55, 'square', 0.12, 0.25, 1500);
    for (let i = 0; i < 8; i++) this.noise(0.035, 0.1, 1200, 400, 0.25 + i * 0.06); // galop
  }

  /** Repu. */
  lick(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(520, 0.08, 'sine', 0.14, i * 0.22, 900);
      this.noise(0.05, 0.05, 2600, 900, i * 0.22);
    }
  }

  /** Le parpaing traverse la planche, puis les étages. */
  crash(): void {
    this.noise(0.9, 0.6, 3800, 80);
    this.tone(85, 0.7, 'sine', 0.55, 0, 30);
    this.tone(130, 0.25, 'square', 0.2, 0.02, 50);
    for (let i = 0; i < 9; i++) this.noise(0.05, 0.16, 5000 - i * 300, 900, 0.05 + i * 0.045); // échardes
    // deuxième étage, premier étage, cave
    [0.75, 1.25, 1.7].forEach((d, i) => {
      this.noise(0.3, 0.3 - i * 0.07, 1500 - i * 350, 70, d);
      this.tone(70 - i * 9, 0.3, 'sine', 0.34 - i * 0.08, d, 30);
    });
  }

  /** Chuck arme le coup de trop. */
  charge(): void {
    this.tone(110, 0.5, 'sawtooth', 0.16, 0, 880);
    this.tone(112, 0.5, 'square', 0.08, 0, 890);
  }

  /** Fanfare de victoire originale, composée pour la mission. */
  fanfareCharcuterie(): void {
    const beat = 0.15;
    // [fréquence, durée en temps]
    const lead: [number, number][] = [
      [392.0, 0.5], [523.25, 0.5], [659.25, 0.5], [783.99, 1],
      [659.25, 0.5], [783.99, 1.5], [0, 0.5],
      [880.0, 0.5], [783.99, 0.5], [698.46, 0.5], [783.99, 0.5], [987.77, 1],
      [1046.5, 2.6],
    ];
    const bass: [number, number][] = [[130.81, 2.5], [164.81, 2.5], [174.61, 2], [196.0, 1], [130.81, 2.6]];
    let t = 0.1;
    for (const [f, len] of lead) {
      if (f) {
        this.tone(f, len * beat * 0.92, 'square', 0.14, t);
        this.tone(f * 1.5, len * beat * 0.8, 'square', 0.035, t);
      }
      t += len * beat;
    }
    t = 0.1;
    for (const [f, len] of bass) {
      this.tone(f, len * beat * 0.95, 'triangle', 0.2, t);
      t += len * beat;
    }
    // roulement et cymbale finale
    for (let i = 0; i < 6; i++) this.drum(0.1 + i * beat * 0.5);
    this.noise(0.9, 0.16, 9000, 3000, 0.1 + 9 * beat);
  }
}
