/**
 * Solveur, pour concevoir les niveaux et vérifier qu'ils restent faisables
 * quand on change une hypothèse de règles.
 *
 * Un coup = saisir une pièce, la faire glisser jusqu'à n'importe quelle case
 * qu'elle peut atteindre sans traverser d'obstacle, la lâcher.
 *
 * - « shortest » : recherche en largeur. Solution au nombre minimal de coups,
 *   ou preuve d'impossibilité si l'exploration a pu aller à son terme. Vite
 *   dépassée dès que les pièces ont de la place.
 * - « greedy » (défaut) : explore d'abord les états où il reste le moins à
 *   faire. Trouve vite une solution, pas forcément la plus courte.
 *
 * Outil de conception et de test : le jeu ne l'importe pas.
 */
import type { EngineSnapshot, PuzzleEngine } from './engine';
import type { Cell, EngineEvent } from './types';

export interface SolveStep {
  readonly pieceId: string;
  /** Ancres successives, case par case, sans la position de départ. Vide : simple toucher. */
  readonly path: readonly Cell[];
}

export interface SolveResult {
  readonly solved: boolean;
  readonly steps: readonly SolveStep[];
  /** États distincts visités. */
  readonly explored: number;
  /** Exploration menée à son terme : un échec est alors une preuve d'impossibilité. */
  readonly complete: boolean;
}

export interface SolveOptions {
  readonly strategy?: 'greedy' | 'shortest';
  readonly maxStates?: number;
  /**
   * « greedy » : poids de ce qu'il reste à faire face aux coups déjà joués.
   * Élevé (défaut 64) : trouve vite, solutions longues ; bas (2 à 4) : plus lent, solutions plus courtes.
   */
  readonly weight?: number;
}

interface Node {
  readonly parent: string | null;
  readonly step: SolveStep | null;
  readonly depth: number;
}

const DIRS: readonly Cell[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
/** Décalage des codes de case, de pièce et de compte, au-delà des marqueurs « ~ », « | » et « . ». */
const CODE = 256;

export function solve(start: PuzzleEngine, options: SolveOptions = {}): SolveResult {
  const strategy = options.strategy ?? 'greedy';
  const weight = options.weight ?? 64;
  const maxStates = options.maxStates ?? 300_000;
  const work = start.clone();
  const { width } = work.level;
  const charIds = work.characterList.map((c) => c.id);
  const pieceIds = work.pieceList.map((p) => p.id);
  const feederSizes = work.level.feeders.map((f) => f.queue.length);
  const nP = pieceIds.length;
  const nC = charIds.length;

  /**
   * Clé compacte : une lettre par pièce (case de l'ancre, ou « ~ » si retirée),
   * « | », le porteur de chaque personnage de la grille (« . » s'il attend),
   * « | », le nombre de personnages sortis de chaque distributeur, « | », puis
   * la charge de chaque pièce (qui compte aussi les passagers des distributeurs).
   */
  const keyOf = (s: EngineSnapshot): string => {
    const owner = new Map<string, number>();
    s.pieces.forEach((p, i) => p.passengers.forEach((id) => owner.set(id, i)));
    let k = '';
    for (const p of s.pieces) k += p.removed ? '~' : String.fromCharCode(CODE + p.y * width + p.x);
    k += '|';
    for (const id of charIds) k += owner.has(id) ? String.fromCharCode(CODE + owner.get(id)!) : '.';
    k += '|';
    for (const n of s.feeders) k += String.fromCharCode(CODE + n);
    k += '|';
    for (const p of s.pieces) k += String.fromCharCode(CODE + p.passengers.length);
    return k;
  };
  const decode = (k: string): EngineSnapshot => {
    // la position d'une pièce retirée n'a plus d'importance
    const pieces = pieceIds.map((_, i) => {
      const removed = k[i] === '~';
      const code = k.charCodeAt(i) - CODE;
      return { x: removed ? 0 : code % width, y: removed ? 0 : Math.floor(code / width), removed, passengers: [] as string[] };
    });
    charIds.forEach((id, j) => {
      const c = k[nP + 1 + j];
      if (c !== '.') pieces[c.charCodeAt(0) - CODE].passengers.push(id);
    });
    const feeders = feederSizes.map((_, j) => k.charCodeAt(nP + nC + 2 + j) - CODE);
    // complète la charge avec des passagers anonymes (venus des distributeurs) : seul leur nombre compte
    const loadsAt = nP + nC + feederSizes.length + 3;
    pieces.forEach((p, i) => {
      const load = k.charCodeAt(loadsAt + i) - CODE;
      while (p.passengers.length < load) p.passengers.push(`~${p.passengers.length}`);
    });
    return { pieces, feeders, moves: 0, clock: { leftMs: null, started: true } };
  };
  /** Ce qu'il reste à faire, quelle que soit la règle de victoire. */
  const remaining = (k: string): number => {
    let n = 0;
    for (let i = 0; i < nP; i++) if (k[i] !== '~') n++;
    for (let j = 0; j < nC; j++) if (k[nP + 1 + j] === '.') n++;
    feederSizes.forEach((size, j) => (n += size - (k.charCodeAt(nP + nC + 2 + j) - CODE)));
    return n;
  };

  const startKey = keyOf(work.snapshot());
  const nodes = new Map<string, Node>([[startKey, { parent: null, step: null, depth: 0 }]]);
  const pathTo = (key: string): SolveStep[] => {
    const steps: SolveStep[] = [];
    for (let n = nodes.get(key)!; n.step; n = nodes.get(n.parent!)!) steps.unshift(n.step);
    return steps;
  };
  if (work.isWon) return { solved: true, steps: [], explored: 1, complete: true };

  const frontier = strategy === 'shortest' ? new Fifo() : new MinHeap();
  frontier.push(startKey, 0);
  const fastRelease = work.rules.collectOn === 'release';
  const axisLock = work.rules.movement === 'axis-lock';

  for (let key = frontier.pop(); key !== undefined; key = frontier.pop()) {
    const snap = decode(key);
    const depth = nodes.get(key)!.depth;
    for (let i = 0; i < pieceIds.length; i++) {
      const id = pieceIds[i];
      work.restore(snap);
      const piece = work.piece(id)!;
      if (piece.removed || piece.full) continue;

      // cases accessibles par glissements successifs, avec le chemin pour y aller ;
      // avec un seul axe par glisser (H8), seulement les quatre lignes droites
      const origin = { x: piece.x, y: piece.y };
      const cameFrom = new Map<string, Cell | null>([[`${origin.x},${origin.y}`, null]]);
      const reach: Cell[] = [origin];
      if (axisLock) {
        for (const d of DIRS) {
          for (let c = origin, n = { x: c.x + d.x, y: c.y + d.y }; work.canPlace(id, n.x, n.y); c = n, n = { x: c.x + d.x, y: c.y + d.y }) {
            cameFrom.set(`${n.x},${n.y}`, c);
            reach.push(n);
          }
        }
      } else {
        for (let j = 0; j < reach.length; j++) {
          const c = reach[j];
          for (const d of DIRS) {
            const n = { x: c.x + d.x, y: c.y + d.y };
            const nk = `${n.x},${n.y}`;
            if (cameFrom.has(nk) || !work.canPlace(id, n.x, n.y)) continue;
            cameFrom.set(nk, c);
            reach.push(n);
          }
        }
      }

      for (const target of reach) {
        const path: Cell[] = [];
        for (let c: Cell | null = target; c && (c.x !== origin.x || c.y !== origin.y); c = cameFrom.get(`${c.x},${c.y}`)!) {
          path.unshift(c);
        }
        if (fastRelease) {
          // collecte au lâcher seulement : le chemin est sans effet, on pose directement la pièce
          work.restore({ ...snap, pieces: snap.pieces.map((p, k) => (k === i ? { ...p, x: target.x, y: target.y } : p)) });
          work.grab(id);
        } else {
          work.restore(snap);
          work.grab(id);
          for (const c of path) work.dragTo(c.x, c.y);
        }
        work.release();
        const next = keyOf(work.snapshot());
        if (nodes.has(next)) continue;
        nodes.set(next, { parent: key, step: { pieceId: id, path }, depth: depth + 1 });
        if (work.isWon) return { solved: true, steps: pathTo(next), explored: nodes.size, complete: true };
        if (nodes.size >= maxStates) return { solved: false, steps: [], explored: nodes.size, complete: false };
        frontier.push(next, remaining(next) * weight + depth + 1);
      }
    }
  }
  return { solved: false, steps: [], explored: nodes.size, complete: true };
}

/** Rejoue une solution avec les vrais gestes (grab, dragTo case par case, release). */
export function replay(engine: PuzzleEngine, steps: readonly SolveStep[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const step of steps) {
    if (!engine.grab(step.pieceId)) throw new Error(`impossible de saisir « ${step.pieceId} »`);
    for (const c of step.path) events.push(...engine.dragTo(c.x, c.y));
    events.push(...engine.release());
  }
  return events;
}

// ------------------------------------------------------------ files d'attente

class Fifo {
  private items: string[] = [];
  private head = 0;
  push(key: string, _priority: number): void {
    this.items.push(key);
  }
  pop(): string | undefined {
    return this.head < this.items.length ? this.items[this.head++] : undefined;
  }
}

/** Tas binaire : la plus petite priorité sort en premier (à égalité, la plus ancienne). */
class MinHeap {
  private keys: string[] = [];
  private prio: number[] = [];
  private order: number[] = [];
  private counter = 0;

  push(key: string, priority: number): void {
    this.keys.push(key);
    this.prio.push(priority);
    this.order.push(this.counter++);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): string | undefined {
    if (this.keys.length === 0) return undefined;
    const top = this.keys[0];
    const last = this.keys.length - 1;
    this.swap(0, last);
    this.keys.pop();
    this.prio.pop();
    this.order.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.keys.length && this.less(l, m)) m = l;
      if (r < this.keys.length && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }

  private less(a: number, b: number): boolean {
    return this.prio[a] < this.prio[b] || (this.prio[a] === this.prio[b] && this.order[a] < this.order[b]);
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.prio[a], this.prio[b]] = [this.prio[b], this.prio[a]];
    [this.order[a], this.order[b]] = [this.order[b], this.order[a]];
  }
}
