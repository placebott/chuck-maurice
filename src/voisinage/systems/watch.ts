import { DUEL, type Act, type WatchState } from '../config/balance';

/**
 * Surveillance de Jean-Mi : dos tourné → avertissement → regard → dos tourné…
 * Un regard est toujours précédé d'un avertissement complet.
 */
export class Watcher {
  state: WatchState = 'back';
  /** Temps passé dans l'état courant. */
  elapsed = 0;
  /** Durée prévue de l'état courant. */
  duration: number = DUEL.firstBack;

  constructor(private readonly rng: () => number = Math.random) {}

  get remaining(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  private pick([lo, hi]: readonly [number, number]): number {
    return lo + this.rng() * (hi - lo);
  }

  private enter(state: WatchState, act: Act): void {
    const t = DUEL.acts[act - 1];
    this.state = state;
    this.elapsed = 0;
    this.duration = state === 'back' ? this.pick(t.back) : state === 'warning' ? t.warning : this.pick(t.watch);
  }

  /** Jean-Mi retourne à son pastis (début de partie, changement d'acte). */
  turnAway(act: Act, first = false): void {
    this.enter('back', act);
    if (first) this.duration = DUEL.firstBack;
  }

  /** Après un flagrant délit, il continue de fixer Chuck pendant un regard complet. */
  keepWatching(act: Act): void {
    this.enter('watching', act);
  }

  /** Avance le temps. Renvoie le nouvel état s'il vient de changer. */
  update(dt: number, act: Act): WatchState | null {
    this.elapsed += dt;
    if (this.elapsed < this.duration) return null;
    const next: WatchState = this.state === 'back' ? 'warning' : this.state === 'warning' ? 'watching' : 'back';
    this.enter(next, act);
    return next;
  }
}
