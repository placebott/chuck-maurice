/**
 * Calculs d'affichage purs (sans Phaser) : mise en page de la grille et
 * position visuelle d'une pièce tenue.
 */
import type { Side } from '../engine/types';

/** Marges autour de la grille, en cases. */
export interface Margins {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface Layout {
  readonly cols: number;
  readonly rows: number;
  /** Côté d'une case, en pixels du canevas. */
  readonly cell: number;
  /** Coin haut-gauche de la grille, en pixels du canevas. */
  readonly ox: number;
  readonly oy: number;
  /** Taille du canevas, en pixels réels. */
  readonly width: number;
  readonly height: number;
  /** Pixels réels par pixel CSS (le canevas est dessiné à la densité de l'écran). */
  readonly dpr: number;
}

/** Marge ordinaire autour de la grille, en fraction de case. */
const PAD_CELLS = 0.28;
/** Place d'un distributeur hors de la grille, en fraction de case. */
export const FEEDER_DEPTH = 1.05;

/** Marges qui laissent la place aux distributeurs des côtés indiqués. */
export function marginsFor(feederSides: readonly Side[]): Margins {
  const m = (side: Side) => PAD_CELLS + (feederSides.includes(side) ? FEEDER_DEPTH : 0);
  return { top: m('top'), right: m('right'), bottom: m('bottom'), left: m('left') };
}

/** Plus grande grille qui tient dans la zone CSS donnée, dessinée à la densité de l'écran. */
export function computeLayout(
  cols: number,
  rows: number,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  margins: Margins = marginsFor([]),
): Layout {
  const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), 3);
  const wCells = cols + margins.left + margins.right;
  const hCells = rows + margins.top + margins.bottom;
  const cssCell = Math.max(16, Math.floor(Math.min(cssWidth / wCells, cssHeight / hCells)));
  const cell = Math.round(cssCell * dpr);
  return {
    cols,
    rows,
    cell,
    ox: Math.round(margins.left * cell),
    oy: Math.round(margins.top * cell),
    width: Math.round(wCells * cell),
    height: Math.round(hCells * cell),
    dpr,
  };
}

/** Coordonnée canevas → colonne (non arrondie). */
export const cellX = (l: Layout, px: number): number => (px - l.ox) / l.cell;
/** Coordonnée canevas → ligne (non arrondie). */
export const cellY = (l: Layout, py: number): number => (py - l.oy) / l.cell;
/** Colonne → coordonnée canevas. */
export const pxX = (l: Layout, c: number): number => l.ox + c * l.cell;
/** Ligne → coordonnée canevas. */
export const pxY = (l: Layout, r: number): number => l.oy + r * l.cell;

/**
 * Décalage visuel d'une pièce tenue, en fraction de case, par rapport à sa
 * case logique : la pièce suit le doigt à l'intérieur de sa case, mais ne
 * penche que vers une position où elle aurait le droit d'aller. Contre un
 * obstacle, elle reste donc exactement au ras.
 *
 * @param want écart entre la position visée par le doigt et la case logique
 * @param free la pièce peut-elle se tenir à (case + dx, case + dy) ?
 */
export function lean(want: { x: number; y: number }, free: (dx: number, dy: number) => boolean): { x: number; y: number } {
  const clamp = (v: number) => Math.max(-0.5, Math.min(0.5, v));
  let x = clamp(want.x);
  let y = clamp(want.y);
  const sx = Math.sign(x);
  const sy = Math.sign(y);
  if (sx !== 0 && !free(sx, 0)) x = 0;
  if (sy !== 0 && !free(0, sy)) y = 0;
  // en biais, la pièce mord aussi sur la case en diagonale
  if (x !== 0 && y !== 0 && !free(sx, sy)) {
    if (Math.abs(x) >= Math.abs(y)) y = 0;
    else x = 0;
  }
  return { x, y };
}

/** Temps affiché, arrondi à la seconde supérieure (« 02:05 », jamais « 00:00 » avant la fin). */
export function formatClock(ms: number | null): string {
  if (ms === null) return '--:--';
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
