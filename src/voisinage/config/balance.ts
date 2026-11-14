/**
 * MAURIIIIICE !!! — tous les réglages du jeu sont ici.
 * Les durées sont en secondes, sauf mention contraire.
 */
export type Act = 1 | 2 | 3;
export type WatchState = 'back' | 'warning' | 'watching';
export type Ending = 'victory' | 'busted' | 'timeout';

export interface ActTuning {
  /** Points de colère gagnés par seconde de maintien. */
  gain: number;
  /** Jean-Mi tourne le dos : durée tirée au hasard dans cet intervalle. */
  back: readonly [number, number];
  /** Avertissement avant le regard : le temps de réaction laissé au joueur. */
  warning: number;
  /** Jean-Mi regarde Chuck. */
  watch: readonly [number, number];
}

export const DUEL = {
  /** Durée de jeu actif. Les pauses, transitions et cinématiques ne la consomment pas. */
  duration: 35,
  maxStrikes: 3,
  /** Fin de chaque acte, en % de colère : Fuego, barbecue, sono. */
  thresholds: [33, 80, 100] as const,
  acts: [
    { gain: 7.7, back: [2.3, 3.3], warning: 0.65, watch: [0.95, 1.3] },
    { gain: 9.2, back: [1.7, 2.5], warning: 0.5, watch: [0.85, 1.2] },
    { gain: 5.1, back: [1.0, 1.6], warning: 0.4, watch: [0.7, 1.0] },
  ] as readonly ActTuning[],
  /** Tout premier dos tourné : le temps de comprendre. */
  firstBack: 2.8,
  /** Tolérance au début du regard (latence d'un écran tactile), en ms. */
  graceMs: 90,
  /** Pause comique après un flagrant délit. */
  caughtPause: 1.6,
  /** Transitions entre actes : après la Fuego, après le barbecue. */
  interlude: [2.3, 3.2] as const,
  /** Alerte dramatique. */
  alertAt: 95,
  /** Relâchement précis : dans les derniers instants de l'avertissement… */
  perfectWindow: 0.24,
  /** …et seulement après un vrai maintien. */
  perfectMinHold: 0.6,
} as const;

export const SCORE = {
  mission: 1000,
  perSecond: 100,
  clean: 1000,
  perfect: 200,
  /** Lot de consolation en cas d'échec : points par % de colère. */
  perRage: 5,
} as const;

export const MEDAL_RULES = {
  /** ROI DU LOTISSEMENT : secondes restantes. */
  kingSeconds: 10,
} as const;

export const actOf = (rage: number): Act => (rage < DUEL.thresholds[0] ? 1 : rage < DUEL.thresholds[1] ? 2 : 3);
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
