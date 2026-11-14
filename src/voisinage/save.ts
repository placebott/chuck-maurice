/**
 * Sauvegarde locale de MAURIIIIICE !!! : même principe que les trois autres missions,
 * sous une clé distincte. Le réglage du son reste commun (sauvegarde d'origine).
 */
const KEY = 'chuck-maurice:bon-voisinage:v1';

export interface VoisinSave {
  best: number;
  plays: number;
  wins: number;
  /** Victoires sans aucun flagrant délit. */
  cleanWins: number;
  /** Défaites par type. */
  busted: number;
  timeout: number;
  /** Meilleur temps restant lors d'une victoire. */
  bestTimeLeft: number;
  /** Cumul des flagrants délits et des relâchements parfaits. */
  strikes: number;
  perfects: number;
  medals: string[];
  /** Réduction des mouvements ; null = suivre le réglage du système. */
  calm: boolean | null;
}

const DEFAULTS: VoisinSave = {
  best: 0, plays: 0, wins: 0, cleanWins: 0, busted: 0, timeout: 0, bestTimeLeft: 0, strikes: 0, perfects: 0,
  medals: [], calm: null,
};

export const emptySave = (): VoisinSave => ({ ...DEFAULTS, medals: [] });

export function loadVoisinSave(): VoisinSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<VoisinSave>;
    return { ...DEFAULTS, ...parsed, medals: Array.isArray(parsed.medals) ? parsed.medals : [] };
  } catch {
    return emptySave();
  }
}

export function writeVoisinSave(data: VoisinSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* navigation privée ou stockage plein : on joue sans sauvegarde */
  }
}
