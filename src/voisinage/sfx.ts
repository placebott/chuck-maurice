import { Sfx } from '../audio/sfx';

/**
 * Bruitages de MAURIIIIICE !!!, synthétisés avec le moteur commun (src/audio/sfx.ts).
 * Rien n'est enregistré ni emprunté : oscillateurs et bruit blanc uniquement.
 * Le ronflement continu du moteur passe par la nappe commune (startTension / setTension).
 */
export class VoisinSfx extends Sfx {
  private wanted = false;
  private hushTimer = 0;

  override setMuted(m: boolean): void {
    this.wanted = m;
    window.clearTimeout(this.hushTimer);
    super.setMuted(m);
  }

  /** Coupe net tout ce qui sonne (« la musique s'arrête brutalement »), puis rend la main. */
  hush(ms = 320): void {
    window.clearTimeout(this.hushTimer);
    super.setMuted(true);
    this.hushTimer = window.setTimeout(() => super.setMuted(this.wanted), ms);
  }

  // ------------------------------------------------------------ acte 1 : la Fuego
  /** Coup de démarreur. */
  ignition(): void {
    for (let i = 0; i < 4; i++) this.tone(95 + i * 14, 0.07, 'square', 0.14, i * 0.075, 70);
    this.noise(0.3, 0.1, 900, 300, 0.05);
  }

  /** Pétarade de l'échappement. */
  backfire(big = false): void {
    this.noise(big ? 0.16 : 0.07, big ? 0.34 : 0.2, 2600, 300);
    this.tone(big ? 110 : 150, big ? 0.16 : 0.08, 'square', big ? 0.26 : 0.16, 0, 55);
  }

  /** Rugissement ridicule : le moteur monte dans les tours, cale presque, repart. */
  roar(): void {
    this.tone(70, 0.9, 'sawtooth', 0.3, 0, 420);
    this.tone(141, 0.9, 'square', 0.12, 0, 850);
    this.noise(0.9, 0.22, 700, 4200);
    this.tone(420, 0.35, 'sawtooth', 0.22, 0.9, 120);
    for (let i = 0; i < 3; i++) {
      this.noise(0.1, 0.28, 2400, 300, 1.0 + i * 0.13);
      this.tone(110, 0.12, 'square', 0.2, 1.0 + i * 0.13, 55);
    }
  }

  // ------------------------------------------------------------ acte 2 : le barbecue
  crackle(): void {
    this.noise(0.03 + Math.random() * 0.04, 0.1 + Math.random() * 0.08, 5000, 1500);
    if (Math.random() < 0.4) this.tone(900 + Math.random() * 900, 0.02, 'square', 0.04, 0.02);
  }

  /** Bouffée de fumée. */
  puff(): void {
    this.noise(0.28, 0.07, 500, 1800);
  }

  /** Grosse flambée. */
  flare(): void {
    this.noise(1.1, 0.42, 300, 5200);
    this.tone(60, 0.9, 'sawtooth', 0.22, 0, 240);
    this.noise(0.6, 0.2, 4000, 300, 0.9);
  }

  cough(): void {
    for (let i = 0; i < 2; i++) {
      this.noise(0.07, 0.2, 1900, 500, i * 0.16);
      this.tone(210, 0.07, 'sawtooth', 0.12, i * 0.16, 130);
    }
  }

  // ------------------------------------------------------------ acte 3 : la sono
  /** Un temps de la boucle de basse : grosse caisse, basse, charleston. Riff original. */
  beat(step: number, loud: number): void {
    const riff = [55, 55, 65.41, 55, 73.42, 55, 82.41, 65.41];
    const v = 0.5 + loud * 0.5;
    this.tone(150, 0.16, 'sine', 0.5 * v, 0, 42);
    this.noise(0.03, 0.12 * v, 1500, 300);
    this.tone(riff[step % riff.length], 0.2, 'sawtooth', 0.2 * v);
    this.tone(riff[step % riff.length] * 2, 0.2, 'square', 0.07 * v);
    this.noise(0.03, 0.07 * v, 9000, 6000, 0.21);
    if (step % 4 === 3) this.tone(880, 0.07, 'square', 0.06 * v, 0.21, 1320);
  }

  /** Onde de basse géante. */
  bassDrop(): void {
    this.tone(220, 1.2, 'sine', 0.6, 0, 30);
    this.tone(110, 1.2, 'sawtooth', 0.25, 0, 28);
    this.noise(0.8, 0.3, 4000, 80);
  }

  /** Les enceintes atterrissent. */
  thud(): void {
    this.tone(120, 0.2, 'sine', 0.45, 0, 38);
    this.noise(0.12, 0.25, 900, 150);
  }

  // ------------------------------------------------------------ surveillance
  /** Jean-Mi prépare son retournement : deux bips qui montent. */
  warn(): void {
    this.tone(740, 0.08, 'square', 0.15);
    this.tone(1110, 0.12, 'square', 0.15, 0.1);
  }

  /** Il regarde. */
  look(): void {
    this.tone(330, 0.18, 'triangle', 0.2, 0, 220);
  }

  /** Il a le dos tourné à nouveau. */
  away(): void {
    this.tone(520, 0.05, 'triangle', 0.1);
    this.tone(780, 0.07, 'triangle', 0.1, 0.05);
  }

  /** Flagrant délit. */
  busted(): void {
    this.tone(196, 0.3, 'sawtooth', 0.26, 0, 98);
    this.tone(208, 0.3, 'square', 0.14, 0, 104);
    this.noise(0.12, 0.22, 2500, 400);
    this.growl(0.28);
  }

  /** Jean-Mi grogne. */
  growl(delay = 0): void {
    for (let i = 0; i < 5; i++) {
      this.tone(105 + (i % 2) * 14, 0.07, 'sawtooth', 0.17, delay + i * 0.06, 82);
    }
    this.noise(0.3, 0.07, 700, 250, delay);
  }

  perfect(): void {
    [988, 1319, 1976].forEach((f, i) => this.tone(f, 0.08, 'square', 0.09, i * 0.05));
  }

  /** Alerte dramatique à 95 %. */
  alert(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(622, 0.16, 'sawtooth', 0.14, i * 0.3, 932);
      this.tone(311, 0.16, 'square', 0.08, i * 0.3, 466);
    }
  }

  // ------------------------------------------------------------ le pastis
  clink(): void {
    this.tone(2600 + Math.random() * 500, 0.06, 'sine', 0.09);
  }

  spill(): void {
    this.tone(2900, 0.1, 'sine', 0.16);
    this.tone(3900, 0.08, 'sine', 0.08, 0.03);
    this.noise(0.3, 0.14, 3000, 500, 0.06);
  }

  gulp(): void {
    this.tone(260, 0.09, 'sine', 0.22, 0, 520);
    this.tone(240, 0.09, 'sine', 0.22, 0.2, 500);
  }

  // ------------------------------------------------------------ cinématiques
  /**
   * Hurlement caricatural : « MAAAAU » qui monte, « RIIIII » qui tient en tremblant, « CE » qui s'effondre.
   * Une voix de synthèse : dent de scie + harmoniques carrées, hachées à la main pour le trémolo.
   */
  scream(long = true): void {
    const hold = long ? 16 : 9;
    this.tone(130, 0.3, 'sawtooth', 0.26, 0, 300);
    this.tone(260, 0.3, 'square', 0.1, 0, 600);
    this.noise(0.3, 0.1, 800, 2400);
    for (let i = 0; i < hold; i++) {
      const t = 0.3 + i * 0.07;
      const wob = i % 2 ? 1.05 : 0.96;
      const f = (380 + i * 9) * wob;
      this.tone(f, 0.085, 'sawtooth', 0.27, t);
      this.tone(f * 2.02, 0.085, 'square', 0.1, t);
      this.tone(f * 3.9, 0.06, 'square', 0.03, t);
    }
    const end = 0.3 + hold * 0.07;
    this.tone(520, 0.45, 'sawtooth', 0.24, end, 95);
    this.tone(1040, 0.3, 'square', 0.08, end, 190);
    this.noise(0.45, 0.14, 3000, 300, end);
  }

  /** Jean-Mi court : sandales qui claquent. */
  sandal(): void {
    this.noise(0.035, 0.22, 3200, 900);
    this.tone(330, 0.03, 'square', 0.08, 0, 180);
  }

  /** Grincement de clôture. */
  fence(): void {
    const f = 620 + Math.random() * 260;
    this.tone(f, 0.16, 'sawtooth', 0.07, 0, f * 1.35);
    this.tone(f * 1.5, 0.12, 'square', 0.03, 0.03, f * 1.2);
  }

  /** Le tissu commence à céder. */
  creak(): void {
    for (let i = 0; i < 5; i++) this.noise(0.025, 0.15, 5200, 2400, i * 0.045);
  }

  /** CRRRRRRRAAAAAAC : déchirure démesurée. */
  rip(): void {
    for (let i = 0; i < 16; i++) this.noise(0.035, 0.34 - i * 0.012, 7000 - i * 250, 1500, i * 0.03);
    this.noise(0.55, 0.4, 6000, 500);
    this.tone(880, 0.5, 'sawtooth', 0.14, 0, 110);
    this.tone(70, 0.4, 'square', 0.2, 0.02, 40);
  }

  effort(): void {
    this.tone(140, 0.2, 'sawtooth', 0.16, 0, 190);
    this.noise(0.15, 0.06, 900, 400);
  }

  /** Un petit vent. */
  wind(): void {
    this.noise(1.6, 0.07, 300, 1100);
    this.noise(1.4, 0.05, 900, 350, 0.9);
  }

  /** Chuck ajuste ses lunettes. */
  glasses(): void {
    this.tone(1900, 0.03, 'square', 0.1);
    this.tone(2850, 0.05, 'sine', 0.09, 0.04);
  }

  /** Une réplique de Chuck : deux notes graves, posées. */
  chuckLine(): void {
    this.tone(150, 0.09, 'square', 0.13);
    this.tone(120, 0.14, 'square', 0.13, 0.1);
  }

  /** Fanfare triomphale ridicule (originale) : trompettes, timbales et une note de trop. */
  fanfareVoisin(): void {
    const beat = 0.115;
    const lead: [number, number][] = [
      [392, 0.5], [392, 0.5], [392, 0.5], [523.25, 1], [392, 0.5], [523.25, 0.5], [659.25, 1.5],
      [587.33, 0.5], [659.25, 0.5], [698.46, 0.5], [783.99, 1], [659.25, 0.5], [783.99, 0.5], [1046.5, 3],
    ];
    let t = 0.03;
    for (const [f, len] of lead) {
      this.tone(f, len * beat * 0.9, 'square', 0.13, t);
      this.tone(f * 1.5, len * beat * 0.8, 'square', 0.05, t);
      this.tone(f / 2, len * beat * 0.9, 'triangle', 0.14, t);
      t += len * beat;
    }
    for (let i = 0; i < 6; i++) this.drum(0.03 + i * beat);
    for (let i = 0; i < 8; i++) this.drum(t - 3 * beat + i * 0.05);
    this.noise(0.9, 0.14, 9000, 3000, t - 3 * beat);
    // la note de trop
    this.tone(1244.5, 0.12, 'square', 0.08, t + 0.05, 1568);
  }

  /** Le dossier tombe sur la table. */
  ploum(): void {
    this.tone(110, 0.3, 'sine', 0.55, 0, 34);
    this.noise(0.2, 0.3, 700, 120);
    this.noise(0.25, 0.1, 5000, 1500, 0.04);
  }

  paper(): void {
    for (let i = 0; i < 3; i++) this.noise(0.04, 0.12, 6500, 3000, i * 0.07);
  }

  /** Petit rire satisfait. */
  hehe(): void {
    for (let i = 0; i < 3; i++) this.tone(250 - i * 22, 0.09, 'sawtooth', 0.14, i * 0.17, 200 - i * 20);
  }

  sigh(): void {
    this.noise(0.8, 0.1, 1800, 300);
    this.tone(210, 0.7, 'triangle', 0.07, 0, 130);
  }

  blip(): void {
    this.tone(440, 0.05, 'square', 0.08);
  }
}
