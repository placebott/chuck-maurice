import {
  CUT, MAX_BAD, feedSpeed, judgeCut,
  type EndReason, type EndingKind, type Quality,
} from '../config/balance';

export interface CutRecord {
  /** Rang de la coupe (0 = première). */
  index: number;
  /** Épaisseur réellement mesurée au moment de la coupe (px). */
  thickness: number;
  quality: Quality;
  points: number;
  /** Bonus de série déclenché par cette coupe (0 sinon). */
  bonus: number;
  /** Coupes parfaites consécutives après cette coupe. */
  streak: number;
}

export interface Ending {
  kind: EndingKind;
  reason: EndReason;
}

/** État d'une mission de découpe : logique pure, sans rendu. */
export class Session {
  timeLeft: number = CUT.duration;
  /** Longueur de saucisson qui dépasse la ligne de coupe (px) : l'épaisseur de la future rondelle. */
  thickness = 0;
  /** Longueur de saucisson déjà débitée (px). */
  consumed = 0;
  score = 0;
  streak = 0;
  bestStreak = 0;
  readonly cuts: CutRecord[] = [];
  readonly counts: Record<Quality, number> = { perfect: 0, good: 0, thick: 0, thin: 0, disaster: 0 };
  ending: Ending | null = null;
  private lock = 0;

  get elapsed(): number {
    return CUT.duration - this.timeLeft;
  }

  get good(): number {
    return this.counts.perfect + this.counts.good;
  }

  get bad(): number {
    return this.counts.thick + this.counts.thin;
  }

  get remaining(): number {
    return CUT.sausageLength - this.consumed;
  }

  /** Série de coupes parfaites en cours ≥ seuil : mode charcuterie tactique. */
  get tactical(): boolean {
    return this.streak >= CUT.comboEvery;
  }

  /** Fait avancer le saucisson. Renvoie la coupe forcée si Chuck perd patience. */
  update(dt: number): CutRecord | null {
    if (this.ending) return null;
    const move = Math.max(0, dt - this.lock);
    this.lock = Math.max(0, this.lock - dt);
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.thickness += feedSpeed(this.elapsed, this.thickness) * move;

    if (this.thickness >= CUT.disaster) {
      this.thickness = CUT.disaster;
      return this.resolve();
    }
    if (this.timeLeft <= 0) this.ending = { kind: this.failKind(), reason: 'timeout' };
    return null;
  }

  /** Coup de couteau du joueur. Ignoré (null) pendant le temps d'arrêt ou une fois la mission finie. */
  cut(): CutRecord | null {
    if (this.ending || this.lock > 0) return null;
    return this.resolve();
  }

  private resolve(): CutRecord {
    const thickness = this.thickness;
    const quality = judgeCut(thickness);
    this.counts[quality]++;
    this.streak = quality === 'perfect' ? this.streak + 1 : 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const bonus = this.streak > 0 && this.streak % CUT.comboEvery === 0 ? CUT.comboBonus : 0;
    const points = CUT.points[quality];
    this.score += points + bonus;
    this.consumed += thickness;
    this.thickness = 0;
    this.lock = CUT.cutLock;

    const record: CutRecord = { index: this.cuts.length, thickness, quality, points, bonus, streak: this.streak };
    this.cuts.push(record);

    if (quality === 'disaster') {
      this.ending = { kind: 'nuclear', reason: 'disaster' };
    } else if (this.bad >= MAX_BAD) {
      this.ending = { kind: this.failKind(), reason: 'errors' };
    } else if (this.cuts.length >= CUT.slices) {
      this.ending = { kind: 'victory', reason: 'complete' };
    } else if (this.remaining < CUT.minStub + CUT.ideal) {
      this.ending = { kind: this.failKind(), reason: 'shortage' };
    }
    return record;
  }

  /** L'échec dépend de l'erreur dominante ; à égalité, c'est la précision qui a lâché. */
  private failKind(): EndingKind {
    const { thick, thin } = this.counts;
    if (thick > thin) return 'thick';
    if (thin > thick) return 'dog';
    return 'nuclear';
  }
}
