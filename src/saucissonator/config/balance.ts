/**
 * SAUCISSONATOR 3000 — tous les réglages de difficulté sont ici.
 * Les épaisseurs sont en pixels logiques (écran 480 × 270) ; `mmPerPx` ne sert qu'à l'affichage.
 * Équilibrage vérifié par tests/saucissonator.test.ts (joueurs simulés).
 */
export const CUT = {
  /** Durée de la mission (s). */
  duration: 25,
  /** Rondelles à découper. */
  slices: 12,
  /** Rondelles correctes ou parfaites exigées pour la victoire. */
  minGood: 8,

  /** Épaisseur idéale d'une rondelle. */
  ideal: 15,
  /** Écart toléré pour une coupe parfaite (±). */
  perfectTol: 2,
  /** Écart toléré pour une coupe correcte (±). Au-delà : trop fine ou trop épaisse. */
  goodTol: 5,
  /** Si le saucisson dépasse autant sans être coupé, Chuck perd patience : découpe nucléaire. */
  disaster: 36,

  /**
   * Avance du saucisson (px/s) = (feedBase + feedSlip × dépassement) × rythme.
   * Il rampe d'abord, puis glisse de plus en plus vite à mesure qu'il dépasse la ligne :
   * la zone idéale se traverse en une fraction de seconde.
   */
  feedBase: 1.0,
  feedSlip: 1.5,
  /** Le rythme passe de 1 à 1 + feedRamp entre le début et la fin du chrono. */
  feedRamp: 0.6,
  /** Après une coupe, le saucisson marque un temps d'arrêt et les appuis sont ignorés (s). */
  cutLock: 0.1,

  /** Longueur totale du saucisson, de la tranche au nœud. */
  sausageLength: 250,
  /** Bout minimal que Chuck doit garder en main. */
  minStub: 30,

  points: { perfect: 500, good: 250, thick: 100, thin: 50, disaster: 0 },
  /** Toutes les N coupes parfaites consécutives : bonus. */
  comboEvery: 3,
  comboBonus: 500,

  mmPerPx: 0.5,
} as const;

export type Quality = 'perfect' | 'good' | 'thick' | 'thin' | 'disaster';
export type EndingKind = 'victory' | 'thick' | 'dog' | 'nuclear';
export type EndReason = 'complete' | 'errors' | 'timeout' | 'disaster' | 'shortage';

/** Nombre de coupes ratées à partir duquel la victoire est mathématiquement perdue. */
export const MAX_BAD = CUT.slices - CUT.minGood + 1;

/** Verdict d'une coupe selon l'épaisseur mesurée (px). */
export function judgeCut(thickness: number): Quality {
  if (thickness >= CUT.disaster) return 'disaster';
  const gap = Math.abs(thickness - CUT.ideal);
  if (gap <= CUT.perfectTol) return 'perfect';
  if (gap <= CUT.goodTol) return 'good';
  return thickness < CUT.ideal ? 'thin' : 'thick';
}

/** Vitesse d'avance (px/s) après `elapsed` secondes de jeu, pour un dépassement de `thickness` px. */
export function feedSpeed(elapsed: number, thickness: number): number {
  const tempo = 1 + CUT.feedRamp * Math.min(1, elapsed / CUT.duration);
  return (CUT.feedBase + CUT.feedSlip * thickness) * tempo;
}

export const toMm = (px: number): number => px * CUT.mmPerPx;
