/**
 * Sauvegarde locale d'Olive Storm : même principe que les deux autres missions,
 * sous une clé distincte. Le réglage du son reste commun (sauvegarde d'origine).
 */
const KEY = 'chuck-maurice:olive-storm:v1';

export interface OliveSave {
  best: number;
  plays: number;
  wins: number;
  /** Catastrophes par type. */
  space: number;
  dog: number;
  diplomatic: number;
  /** Cumul des olives placées dans le verre et des tirs effectués. */
  olives: number;
  shots: number;
  medals: string[];
}

const DEFAULTS: OliveSave = {
  best: 0, plays: 0, wins: 0, space: 0, dog: 0, diplomatic: 0, olives: 0, shots: 0, medals: [],
};

export function loadOliveSave(): OliveSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, medals: [] };
    const parsed = JSON.parse(raw) as Partial<OliveSave>;
    return { ...DEFAULTS, ...parsed, medals: Array.isArray(parsed.medals) ? parsed.medals : [] };
  } catch {
    return { ...DEFAULTS, medals: [] };
  }
}

export function writeOliveSave(data: OliveSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* navigation privée ou stockage plein : on joue sans sauvegarde */
  }
}
