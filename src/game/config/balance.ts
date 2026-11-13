/** Tous les réglages de difficulté sont ici. */
export const BALANCE = {
  /** Durée d'une tentative (s). */
  duration: 20,
  /** Puissance gagnée par appui (%). */
  tapGain: 3.6,
  /**
   * Emballement : au-delà de ce seuil, chaque appui rapporte de plus en plus.
   * La montée est laborieuse, puis la zone verte défile en moins d'une seconde.
   */
  surgeStart: 68,
  surgeSpan: 18,
  /** Perte de puissance : base + part proportionnelle (% / s). */
  decayBase: 4.5,
  decayPerPower: 0.11,
  /** Le bocal se resserre au fil du temps : multiplicateur de perte en fin de chrono. */
  lateDecayBoost: 1.2,
  /** Puissance perdue quand le bocal résiste. */
  resistPenalty: 22,
  /** Durée pendant laquelle Chuck encaisse l'échec (s). */
  resistLock: 0.65,
  zones: {
    /** En dessous : le bocal résiste. */
    perfectMin: 70,
    /** 70–85 : victoire parfaite. */
    perfectMax: 85,
    /** 86–95 : victoire chaotique. Au-dessus : explosion. */
    chaosMax: 95,
  },
} as const;

export type Outcome = 'perfect' | 'chaos' | 'explosion' | 'timeout';
export type AttemptResult = 'resist' | 'perfect' | 'chaos' | 'explosion';

/** Verdict d'une tentative d'ouverture pour une puissance donnée (0–100). */
export function judge(power: number): AttemptResult {
  const pct = Math.floor(power);
  const z = BALANCE.zones;
  if (pct < z.perfectMin) return 'resist';
  if (pct <= z.perfectMax) return 'perfect';
  if (pct <= z.chaosMax) return 'chaos';
  return 'explosion';
}

export function scoreFor(outcome: Outcome, timeLeft: number, resists: number): number {
  if (outcome === 'perfect') {
    return Math.max(1000, Math.round(5000 + timeLeft * 250 - resists * 300));
  }
  if (outcome === 'chaos') {
    return Math.max(500, Math.round(2500 + timeLeft * 120 - resists * 200));
  }
  return 0;
}
