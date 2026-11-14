import { DUEL, type Act, type Ending, type WatchState } from '../config/balance';
import { Watcher } from './watch';

export type DuelEvent =
  | { type: 'watch'; state: WatchState }
  | { type: 'caught'; strikes: number }
  | { type: 'resume' }
  | { type: 'milestone'; act: 2 | 3 }
  | { type: 'alert' }
  | { type: 'perfect'; count: number }
  | { type: 'end'; kind: Ending };

/**
 * Règles de la partie : colère, chronomètre, flagrants délits, passage des actes.
 * Aucune dépendance à l'affichage : `update(dt, held)` suffit à dérouler une partie.
 */
export class Duel {
  rage = 0;
  timeLeft: number = DUEL.duration;
  strikes = 0;
  perfects = 0;
  act: Act = 1;
  ending: Ending | null = null;
  /** Durée du maintien en cours. */
  holdTime = 0;
  /** Chuck est en train de « faire comme d'habitude ». */
  working = false;

  private readonly watcher: Watcher;
  private pause = 0;
  /** Après une pause, il faut relâcher puis rappuyer : un bouton resté enfoncé ne compte pas. */
  private needRelease = false;
  private caughtThisWatch = false;
  private perfectThisWarning = false;
  private alerted = false;

  constructor(rng: () => number = Math.random) {
    this.watcher = new Watcher(rng);
    this.watcher.turnAway(1, true);
  }

  get watch(): WatchState {
    return this.watcher.state;
  }

  get watchRemaining(): number {
    return this.watcher.remaining;
  }

  get paused(): boolean {
    return this.pause > 0;
  }

  get elapsed(): number {
    return DUEL.duration - this.timeLeft;
  }

  update(dt: number, held: boolean): DuelEvent[] {
    const events: DuelEvent[] = [];
    if (this.ending) return events;
    if (!held) this.needRelease = false;

    if (this.pause > 0) {
      this.pause -= dt;
      this.working = false;
      if (this.pause <= 0) {
        this.pause = 0;
        events.push({ type: 'resume' });
      }
      return events;
    }

    const eff = held && !this.needRelease;
    const state = this.watcher.state;

    // relâchement précis : juste avant que Jean-Mi regarde, après un vrai maintien
    if (this.working && !eff && state === 'warning' && !this.perfectThisWarning
      && this.watcher.remaining <= DUEL.perfectWindow && this.holdTime >= DUEL.perfectMinHold) {
      this.perfectThisWarning = true;
      this.perfects++;
      events.push({ type: 'perfect', count: this.perfects });
    }
    if (!eff) this.holdTime = 0;

    this.timeLeft = Math.max(0, this.timeLeft - dt);

    if (state === 'watching') {
      this.working = false;
      if (eff && !this.caughtThisWatch && this.watcher.elapsed * 1000 >= DUEL.graceMs) {
        this.caught(events);
        return events;
      }
    } else {
      this.working = eff;
      if (eff) {
        this.holdTime += dt;
        this.rage += DUEL.acts[this.act - 1].gain * dt;
        if (this.advance(events)) return events;
      }
    }

    if (this.timeLeft <= 0) {
      this.finish('timeout', events);
      return events;
    }

    const next = this.watcher.update(dt, this.act);
    if (next) {
      if (next === 'watching') this.caughtThisWatch = false;
      if (next === 'warning') this.perfectThisWarning = false;
      events.push({ type: 'watch', state: next });
    }
    return events;
  }

  /** Seuils de colère : changement d'acte, alerte, victoire. Renvoie vrai si la frame s'arrête là. */
  private advance(events: DuelEvent[]): boolean {
    if (this.rage >= 100) {
      this.rage = 100;
      this.finish('victory', events);
      return true;
    }
    if (!this.alerted && this.rage >= DUEL.alertAt) {
      this.alerted = true;
      events.push({ type: 'alert' });
    }
    const limit = DUEL.thresholds[this.act - 1];
    if (this.act < 3 && this.rage >= limit) {
      this.rage = limit;
      this.pause = DUEL.interlude[this.act - 1];
      this.act = (this.act + 1) as Act;
      this.interrupt();
      this.watcher.turnAway(this.act);
      events.push({ type: 'milestone', act: this.act as 2 | 3 });
      return true;
    }
    return false;
  }

  private caught(events: DuelEvent[]): void {
    this.strikes++;
    this.caughtThisWatch = true;
    this.interrupt();
    events.push({ type: 'caught', strikes: this.strikes });
    if (this.strikes >= DUEL.maxStrikes) {
      this.finish('busted', events);
      return;
    }
    this.pause = DUEL.caughtPause;
    this.watcher.keepWatching(this.act);
  }

  private interrupt(): void {
    this.needRelease = true;
    this.working = false;
    this.holdTime = 0;
  }

  private finish(kind: Ending, events: DuelEvent[]): void {
    this.ending = kind;
    this.working = false;
    this.holdTime = 0;
    events.push({ type: 'end', kind });
  }
}
