import { BALANCE, judge, type AttemptResult } from '../config/balance';

/** État d'une tentative : logique pure, sans rendu. */
export class Round {
  power = 0;
  timeLeft: number = BALANCE.duration;
  resists = 0;
  taps = 0;
  peak = 0;

  tap(): void {
    this.taps++;
    const over = Math.max(0, this.power - BALANCE.surgeStart);
    const gain = BALANCE.tapGain * (1 + over / BALANCE.surgeSpan);
    this.power = Math.min(100, this.power + gain);
    this.peak = Math.max(this.peak, this.power);
  }

  update(dt: number): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const progress = 1 - this.timeLeft / BALANCE.duration;
    const boost = 1 + (BALANCE.lateDecayBoost - 1) * progress;
    const decay = (BALANCE.decayBase + BALANCE.decayPerPower * this.power) * boost;
    this.power = Math.max(0, this.power - decay * dt);
  }

  attempt(): AttemptResult {
    const result = judge(this.power);
    if (result === 'resist') {
      this.resists++;
      this.power = Math.max(0, this.power - BALANCE.resistPenalty);
    }
    return result;
  }

  get elapsed(): number {
    return BALANCE.duration - this.timeLeft;
  }
}
