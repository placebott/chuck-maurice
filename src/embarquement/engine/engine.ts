/**
 * Moteur logique d'Embarquement : état de la grille, déplacements, collecte,
 * distributeurs, chronomètre, victoire et défaite. Aucune dépendance à
 * Phaser ni au DOM ; tout est entier et déterministe (le temps est fourni de
 * l'extérieur par tick()), donc testable sous Node (tests/embarquement.test.ts).
 *
 * Cycle d'un geste du joueur :
 *   grab(id)        — saisit une pièce
 *   dragTo(x, y)    — ancre visée, en cases ; la pièce y glisse case par case
 *                     tant qu'aucune collision ne l'arrête (jamais de saut)
 *   release()       — lâche la pièce : collecte, retrait éventuel, victoire
 * Chaque action renvoie la liste des événements produits, pour l'affichage.
 *
 * Rien ici n'est propre à un niveau : formes, positions, capacités, files des
 * distributeurs et durée viennent du JSON ; les règles incertaines, de rules.ts.
 */
import { capacityOf } from './level';
import { resolveRules, ruleConflicts } from './rules';
import type { Cell, CharacterState, EngineEvent, FeederDef, FeederState, Level, PieceState, Rules } from './types';

export type PieceView = Readonly<Omit<PieceState, 'passengers'>> & {
  readonly passengers: readonly string[];
  /** Places encore libres : le compteur affiché sur la pièce. */
  readonly remaining: number;
};
export type CharacterView = Readonly<CharacterState>;

export interface FeederView {
  readonly def: FeederDef;
  /** Couleurs encore dans la file, tête en premier. */
  readonly pending: readonly string[];
}

export interface EngineSnapshot {
  readonly pieces: readonly { x: number; y: number; removed: boolean; passengers: readonly string[] }[];
  /** Personnages déjà sortis de chaque distributeur, dans l'ordre du niveau. */
  readonly feeders: readonly number[];
  readonly moves: number;
  readonly clock: { readonly leftMs: number | null; readonly started: boolean };
}

export interface EngineOptions {
  /** false : chronomètre gelé (mode DEBUG). Vrai par défaut. */
  readonly timer?: boolean;
}

export class RulesError extends Error {
  constructor(readonly errors: string[]) {
    super(`Règles incohérentes :\n- ${errors.join('\n- ')}`);
    this.name = 'RulesError';
  }
}

interface Drag {
  readonly pieceId: string;
  readonly from: Cell;
  /** Axe verrouillé (règle H8 « axis-lock »), ou null. */
  axis: 'x' | 'y' | null;
  /** Au moins une collecte a eu lieu pendant ce geste. */
  collected: boolean;
  /** Distributeur → ancre où il a déjà servi la pièce pendant ce geste (un passage = une arrivée sur l'entrée). */
  servedAt: Map<string, string>;
}

const SIDES: readonly Cell[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
const CORNERS: readonly Cell[] = [{ x: 1, y: 1 }, { x: -1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }];

export class PuzzleEngine {
  readonly rules: Rules;

  private pieces: (PieceState & { remaining: number })[] = [];
  private characters: CharacterState[] = [];
  private feeders: FeederState[] = [];
  /** Case → id de la pièce qui l'occupe. */
  private occ: (string | null)[] = [];
  /** Case → personnage qui y attend. */
  private waiting: (CharacterState | null)[] = [];
  private drag: Drag | null = null;
  private moves = 0;
  private won = false;
  private lost = false;
  private paused = false;
  private timerOn: boolean;
  private clockStarted = false;
  private leftMs: number | null = null;

  /**
   * @param overrides réglages de la page ; ils l'emportent sur les règles du niveau.
   * @throws RulesError si la combinaison d'hypothèses est incohérente.
   */
  constructor(readonly level: Level, overrides?: Partial<Rules>, options: EngineOptions = {}) {
    this.rules = resolveRules(level.rules, overrides);
    const conflicts = ruleConflicts(this.rules);
    if (conflicts.length) throw new RulesError(conflicts);
    this.timerOn = options.timer ?? true;
    this.reset();
  }

  /** Remet le niveau dans son état de départ (chronomètre compris). */
  reset(): void {
    const { level, rules } = this;
    this.pieces = level.pieces.map((p) => {
      const capacity = capacityOf(p, rules);
      return { id: p.id, color: p.color, cells: p.cells, capacity, remaining: capacity, x: p.x, y: p.y, passengers: [], full: false, removed: false };
    });
    this.characters = level.characters.map((c) => ({ ...c, collectedBy: null }));
    this.feeders = level.feeders.map((def) => ({ def, next: 0 }));
    this.drag = null;
    this.moves = 0;
    this.won = false;
    this.lost = false;
    this.paused = false;
    this.leftMs = level.timerSeconds === null ? null : Math.round(level.timerSeconds * 1000);
    this.clockStarted = rules.timerStart === 'immediate';
    this.rebuildGrids();
  }

  /** Copie indépendante de l'état courant (sans geste en cours). */
  clone(): PuzzleEngine {
    const copy = new PuzzleEngine(this.level, this.rules, { timer: this.timerOn });
    copy.restore(this.snapshot());
    return copy;
  }

  /** État courant sous forme de données simples (sans geste en cours), dans l'ordre du niveau. */
  snapshot(): EngineSnapshot {
    return {
      pieces: this.pieces.map((p) => ({ x: p.x, y: p.y, removed: p.removed, passengers: [...p.passengers] })),
      feeders: this.feeders.map((f) => f.next),
      moves: this.moves,
      clock: { leftMs: this.leftMs, started: this.clockStarted },
    };
  }

  /** Recharge un état produit par snapshot() sur le même niveau ; annule le geste en cours et la pause. */
  restore(s: EngineSnapshot): void {
    const owner = new Map<string, string>();
    this.pieces.forEach((p, i) => {
      const saved = s.pieces[i];
      p.x = saved.x;
      p.y = saved.y;
      p.removed = saved.removed;
      p.passengers = [...saved.passengers];
      p.remaining = Math.max(0, p.capacity - p.passengers.length);
      p.full = p.remaining === 0;
      for (const id of p.passengers) owner.set(id, p.id);
    });
    for (const c of this.characters) c.collectedBy = owner.get(c.id) ?? null;
    this.feeders.forEach((f, i) => {
      f.next = s.feeders[i] ?? 0;
    });
    this.moves = s.moves;
    this.leftMs = s.clock.leftMs;
    this.clockStarted = s.clock.started;
    this.drag = null;
    this.paused = false;
    this.rebuildGrids();
    this.won = this.isDone();
    this.lost = !this.won && this.leftMs !== null && this.leftMs <= 0;
  }

  // ------------------------------------------------------------- lectures

  get pieceList(): readonly PieceView[] {
    return this.pieces;
  }

  get characterList(): readonly CharacterView[] {
    return this.characters;
  }

  get feederList(): readonly FeederView[] {
    return this.feeders.map((f) => ({ def: f.def, pending: f.def.queue.slice(f.next) }));
  }

  get moveCount(): number {
    return this.moves;
  }

  get isWon(): boolean {
    return this.won;
  }

  get isLost(): boolean {
    return this.lost;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Temps restant en millisecondes, ou null si le niveau n'a pas de chronomètre. */
  get timeLeftMs(): number | null {
    return this.leftMs;
  }

  /** Le chronomètre décompte-t-il en ce moment ? */
  get clockRunning(): boolean {
    return this.leftMs !== null && this.timerOn && this.clockStarted && !this.paused && !this.won && !this.lost;
  }

  get timerEnabled(): boolean {
    return this.timerOn;
  }

  /** Personnages encore à embarquer, sur la grille et dans les distributeurs. */
  get peopleLeft(): number {
    return this.characters.filter((c) => c.collectedBy === null).length
      + this.feeders.reduce((n, f) => n + f.def.queue.length - f.next, 0);
  }

  /** Pièce tenue par le joueur, ou null. */
  get draggedId(): string | null {
    return this.drag?.pieceId ?? null;
  }

  piece(id: string): PieceView | undefined {
    return this.pieces.find((p) => p.id === id);
  }

  /** Pièce présente sur la case, ou null. */
  pieceAt(x: number, y: number): string | null {
    return this.inside(x, y) ? this.occ[this.index(x, y)] : null;
  }

  /** Cases occupées par la pièce, en coordonnées de grille. */
  cellsOf(pieceId: string): Cell[] {
    const p = this.find(pieceId);
    return p && !p.removed ? p.cells.map((c) => ({ x: p.x + c.x, y: p.y + c.y })) : [];
  }

  /** La pièce peut-elle se tenir avec son ancre en (x, y) ? */
  canPlace(pieceId: string, x: number, y: number): boolean {
    const p = this.find(pieceId);
    if (!p || p.removed) return false;
    for (const c of p.cells) {
      const cx = x + c.x;
      const cy = y + c.y;
      if (!this.inside(cx, cy)) return false;
      const i = this.index(cx, cy);
      const other = this.occ[i];
      if (other !== null && other !== p.id) return false;
      const person = this.waiting[i];
      if (person && this.blocks(person, p)) return false;
    }
    return true;
  }

  /** Cases d'où un personnage est en contact avec la pièce (règle H1), à sa position actuelle. */
  contactCells(pieceId: string): Cell[] {
    const p = this.find(pieceId);
    if (!p || p.removed) return [];
    const seen = new Set<number>();
    const out: Cell[] = [];
    const add = (x: number, y: number) => {
      if (!this.inside(x, y)) return;
      const i = this.index(x, y);
      if (seen.has(i)) return;
      seen.add(i);
      out.push({ x, y });
    };
    const around = this.rules.contact === 'overlap' ? [] : this.rules.contact === 'side' ? SIDES : [...SIDES, ...CORNERS];
    for (const c of p.cells) {
      add(p.x + c.x, p.y + c.y);
      for (const d of around) add(p.x + c.x + d.x, p.y + c.y + d.y);
    }
    return out;
  }

  /**
   * Personnages de la grille qu'une collecte prendrait maintenant (règles H1,
   * H3, H4), dans l'ordre de lecture. L'affichage s'en sert pour les signaler.
   */
  pendingCollect(pieceId: string): string[] {
    const p = this.find(pieceId);
    if (!p || p.removed || p.full) return [];
    const take = this.rules.collectLimit === 'one' ? Math.min(1, p.remaining) : p.remaining;
    if (take <= 0) return [];
    return this.contactCells(pieceId)
      .map((c) => this.waiting[this.index(c.x, c.y)])
      .filter((ch): ch is CharacterState => !!ch && ch.color === p.color)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .slice(0, take)
      .map((ch) => ch.id);
  }

  // -------------------------------------------------------------- actions

  /** Saisit une pièce. Refusé si la partie est finie ou en pause, un geste en cours, ou la pièce retirée ou pleine. */
  grab(pieceId: string): boolean {
    if (this.won || this.lost || this.paused || this.drag) return false;
    const p = this.find(pieceId);
    if (!p || p.removed || p.full) return false;
    this.drag = { pieceId, from: { x: p.x, y: p.y }, axis: null, collected: false, servedAt: new Map() };
    return true;
  }

  /**
   * Fait glisser la pièce tenue vers l'ancre (x, y), une case à la fois.
   * À chaque pas, l'axe où il reste le plus de chemin est essayé d'abord ;
   * s'il est bloqué, l'autre : la pièce longe ainsi les obstacles sans jamais
   * les traverser, même si le but est loin. Elle s'arrête dès qu'aucun pas ne
   * la rapproche du but.
   */
  dragTo(x: number, y: number): EngineEvent[] {
    const drag = this.drag;
    if (!drag) return [];
    const p = this.find(drag.pieceId)!;
    const events: EngineEvent[] = [];
    while (this.drag === drag) {
      const dx = x - p.x;
      const dy = y - p.y;
      if (dx === 0 && dy === 0) break;
      const axes: ('x' | 'y')[] = drag.axis ? [drag.axis] : Math.abs(dx) >= Math.abs(dy) ? ['x', 'y'] : ['y', 'x'];
      let stepped = false;
      for (const axis of axes) {
        const d = axis === 'x' ? dx : dy;
        if (d === 0) continue;
        const nx = p.x + (axis === 'x' ? Math.sign(d) : 0);
        const ny = p.y + (axis === 'y' ? Math.sign(d) : 0);
        if (!this.canPlace(p.id, nx, ny)) continue;
        const from = { x: p.x, y: p.y };
        this.place(p, nx, ny);
        events.push({ type: 'moved', pieceId: p.id, from, to: { x: nx, y: ny } });
        if (!this.clockStarted) {
          // H10 « first-move » : le premier déplacement réel lance le chronomètre
          this.clockStarted = true;
          if (this.leftMs !== null) events.push({ type: 'clock-started' });
        }
        if (this.rules.movement === 'axis-lock') {
          // revenir à la case de départ libère le verrou
          drag.axis = nx === drag.from.x && ny === drag.from.y ? null : axis;
        }
        stepped = true;
        break;
      }
      if (!stepped) break;
      if (this.rules.collectOn === 'step') this.collectInto(p, events);
    }
    return events;
  }

  /** Lâche la pièce tenue : collecte (règle H2), retrait (H6), victoire (H7). */
  release(): EngineEvent[] {
    const drag = this.drag;
    if (!drag) return [];
    const p = this.find(drag.pieceId)!;
    const events: EngineEvent[] = [];
    this.collectInto(p, events);
    if (this.drag === drag) this.endDrag(events);
    return events;
  }

  /**
   * Déplacement manuel d'une case (mode DEBUG, clavier) : un geste complet,
   * soumis aux mêmes collisions et à la même collecte qu'un glisser.
   */
  nudge(pieceId: string, dx: number, dy: number): EngineEvent[] {
    if (!this.grab(pieceId)) return [];
    const p = this.find(pieceId)!;
    return [...this.dragTo(p.x + Math.sign(dx), p.y + Math.sign(dy)), ...this.release()];
  }

  /** Fait avancer le chronomètre ; renvoie l'événement de défaite s'il atteint zéro. */
  tick(ms: number): EngineEvent[] {
    if (!this.clockRunning || ms <= 0) return [];
    this.leftMs = Math.max(0, this.leftMs! - ms);
    if (this.leftMs > 0) return [];
    this.lost = true;
    this.drag = null;
    return [{ type: 'lost', moves: this.moves }];
  }

  /** Met la partie en pause (geste en cours abandonné, pièce laissée sur sa dernière case valide). */
  pause(): boolean {
    if (this.paused || this.won || this.lost) return false;
    this.paused = true;
    this.drag = null;
    return true;
  }

  resume(): boolean {
    if (!this.paused) return false;
    this.paused = false;
    return true;
  }

  /** Active ou gèle le chronomètre (mode DEBUG). */
  setTimerEnabled(on: boolean): void {
    this.timerOn = on;
  }

  // ---------------------------------------------------------------- interne

  /**
   * Embarque les personnages en contact puis ceux des distributeurs dont la
   * case d'entrée est recouverte ; retire la pièce si elle est pleine.
   * Un personnage embarqué quitte aussitôt la grille ou la file : il ne peut
   * pas être compté deux fois, même si plusieurs pas couvrent la même case.
   */
  private collectInto(p: PieceState & { remaining: number }, events: EngineEvent[]): void {
    if (p.removed || p.full) return;
    let any = false;
    const ids = this.pendingCollect(p.id);
    if (ids.length > 0) {
      for (const id of ids) {
        const ch = this.characters.find((c) => c.id === id)!;
        ch.collectedBy = p.id;
        this.waiting[this.index(ch.x, ch.y)] = null;
        p.passengers.push(id);
      }
      p.remaining = p.capacity - p.passengers.length;
      events.push({ type: 'collected', pieceId: p.id, characterIds: ids, load: p.passengers.length, capacity: p.capacity });
      any = true;
    }
    const here = `${p.x},${p.y}`;
    const drag = this.drag?.pieceId === p.id ? this.drag : null;
    for (const f of this.feeders) {
      if (p.remaining === 0) break;
      const { entry, queue, id: feederId } = f.def;
      if (!p.cells.some((c) => p.x + c.x === entry.x && p.y + c.y === entry.y)) continue;
      // déjà servie à cette position pendant ce geste : le lâcher n'est pas un nouveau passage
      if (drag?.servedAt.get(feederId) === here) continue;
      const taken: string[] = [];
      while (f.next < queue.length && queue[f.next] === p.color && p.remaining > 0) {
        f.next++;
        const id = `${feederId}#${f.next}`;
        p.passengers.push(id);
        p.remaining--;
        taken.push(id);
        if (this.rules.feederBatch === 'one') break;
      }
      if (taken.length === 0) continue;
      drag?.servedAt.set(feederId, here);
      events.push({ type: 'collected', pieceId: p.id, characterIds: taken, load: p.passengers.length, capacity: p.capacity, feederId });
      any = true;
    }
    if (!any) return;
    if (this.drag?.pieceId === p.id) this.drag.collected = true;
    if (p.remaining > 0) return;
    p.full = true;
    events.push({ type: 'full', pieceId: p.id });
    if (this.rules.whenFull === 'remove') {
      this.place(p, null, null);
      p.removed = true;
      events.push({ type: 'removed', pieceId: p.id });
    }
    // une pièce qui disparaît ou se fige ne peut plus être tenue
    if (this.drag?.pieceId === p.id) this.endDrag(events);
  }

  /** Clôt le geste : compte le coup s'il a changé quelque chose, puis teste la victoire. */
  private endDrag(events: EngineEvent[]): void {
    const drag = this.drag!;
    const p = this.find(drag.pieceId)!;
    this.drag = null;
    const moved = p.removed ? true : p.x !== drag.from.x || p.y !== drag.from.y;
    if (moved || drag.collected) this.moves++;
    if (!this.won && !this.lost && this.isDone()) {
      this.won = true;
      events.push({ type: 'won', moves: this.moves, timeLeftMs: this.leftMs });
    }
  }

  /** Condition de victoire (règle H7) ; les personnages des distributeurs comptent comme les autres. */
  private isDone(): boolean {
    const allCollected = this.peopleLeft === 0;
    const allRemoved = this.pieces.every((q) => q.removed);
    const { win } = this.rules;
    return win === 'all-collected' ? allCollected : win === 'all-removed' ? allRemoved : allCollected && allRemoved;
  }

  /** Déplace la pièce dans la grille d'occupation (null : la retire). */
  private place(p: PieceState, x: number | null, y: number | null): void {
    for (const c of p.cells) this.occ[this.index(p.x + c.x, p.y + c.y)] = null;
    if (x === null || y === null) return;
    p.x = x;
    p.y = y;
    for (const c of p.cells) this.occ[this.index(x + c.x, y + c.y)] = p.id;
  }

  private rebuildGrids(): void {
    const size = this.level.width * this.level.height;
    this.occ = new Array(size).fill(null);
    this.waiting = new Array(size).fill(null);
    for (const p of this.pieces) {
      if (p.removed) continue;
      for (const c of p.cells) this.occ[this.index(p.x + c.x, p.y + c.y)] = p.id;
    }
    for (const c of this.characters) if (c.collectedBy === null) this.waiting[this.index(c.x, c.y)] = c;
  }

  /** Règle H5. */
  private blocks(person: CharacterState, p: PieceState): boolean {
    const mode = this.rules.charactersBlock;
    return mode === 'all' || (mode === 'other-colors' && person.color !== p.color);
  }

  private find(id: string): (PieceState & { remaining: number }) | undefined {
    return this.pieces.find((p) => p.id === id);
  }

  private inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.level.width && y < this.level.height;
  }

  private index(x: number, y: number): number {
    return y * this.level.width + x;
  }
}
