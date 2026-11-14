/**
 * Sauvegarde locale de Saucissonator 3000 : même principe que src/storage/save.ts,
 * sous une clé distincte pour ne jamais toucher à la progression d'Opération Cornichon.
 * (Le réglage du son, lui, reste commun aux deux missions : voir main.ts.)
 */
const KEY = 'chuck-maurice:saucissonator-3000:v1';

export interface SaucissonSave {
  best: number;
  /** Meilleur temps d'une victoire (s). */
  bestTime: number | null;
  plays: number;
  wins: number;
  /** Échecs par type. */
  thick: number;
  dog: number;
  nuclear: number;
  /** Cumul des rondelles découpées, toutes missions confondues. */
  slices: number;
  perfectSlices: number;
  bestStreak: number;
  medals: string[];
}

const DEFAULTS: SaucissonSave = {
  best: 0,
  bestTime: null,
  plays: 0,
  wins: 0,
  thick: 0,
  dog: 0,
  nuclear: 0,
  slices: 0,
  perfectSlices: 0,
  bestStreak: 0,
  medals: [],
};

export function loadSaucissonSave(): SaucissonSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, medals: [] };
    const parsed = JSON.parse(raw) as Partial<SaucissonSave>;
    return { ...DEFAULTS, ...parsed, medals: Array.isArray(parsed.medals) ? parsed.medals : [] };
  } catch {
    return { ...DEFAULTS, medals: [] };
  }
}

export function writeSaucissonSave(data: SaucissonSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* navigation privée ou stockage plein : on joue sans sauvegarde */
  }
}
