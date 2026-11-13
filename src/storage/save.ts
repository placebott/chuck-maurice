const KEY = 'chuck-maurice:operation-cornichon:v1';

export interface SaveData {
  best: number;
  bestTime: number | null;
  plays: number;
  perfect: number;
  chaos: number;
  explosions: number;
  timeouts: number;
  medals: string[];
  muted: boolean;
}

const DEFAULTS: SaveData = {
  best: 0,
  bestTime: null,
  plays: 0,
  perfect: 0,
  chaos: 0,
  explosions: 0,
  timeouts: 0,
  medals: [],
  muted: false,
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return { ...DEFAULTS, ...parsed, medals: Array.isArray(parsed.medals) ? parsed.medals : [] };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* navigation privée ou stockage plein : on joue sans sauvegarde */
  }
}

export const wins = (s: SaveData): number => s.perfect + s.chaos;
export const losses = (s: SaveData): number => s.explosions + s.timeouts;
