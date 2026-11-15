/**
 * Affichage Phaser d'Embarquement.
 *
 * La scène ne décide de rien : elle lit l'état du moteur, lui transmet les
 * gestes (grab / dragTo / release), fait avancer son chronomètre et anime les
 * événements qu'il renvoie. Tout est dessiné en formes vectorielles à la
 * taille de case courante ; un changement de taille d'écran reconstruit
 * simplement l'affichage, sans interrompre un glisser.
 */
import Phaser from 'phaser';

import type { PieceView, PuzzleEngine } from '../engine/engine';
import type { EngineEvent, FeederDef } from '../engine/types';
import { FEEDER_DEPTH, cellX, cellY, lean, pxX, pxY, type Layout } from './geometry';
import { BOARD, shadeOf, type Shade } from './palette';

type Graphics = Phaser.GameObjects.Graphics;
type Container = Phaser.GameObjects.Container;
type Text = Phaser.GameObjects.Text;

interface PieceSprite {
  readonly id: string;
  readonly box: Container;
  readonly badge: Text;
  readonly badgeBg: Graphics;
  /** Boîte englobante, en cases. */
  readonly w: number;
  readonly h: number;
  /** Ancre affichée, en cases (suit la cible en douceur). */
  vx: number;
  vy: number;
  /** Ancre visée, en cases. */
  tx: number;
  ty: number;
  /** Compteur affiché : il ne baisse qu'à l'arrivée de chaque personnage animé. */
  shown: number;
  /** Instant (horloge de la scène) où se pose le dernier personnage en route. */
  busyUntil: number;
  leaving: boolean;
}

interface PersonSprite {
  readonly node: Container;
  readonly ring: Graphics;
}

interface FeederSprite {
  readonly def: FeederDef;
  readonly box: Container;
  readonly art: Graphics;
  readonly count: Text;
  /** Rang de la tête affichée (en retard sur le moteur pendant une sortie animée). */
  shownNext: number;
}

/** Durées en millisecondes (ramenées à presque rien si l'utilisateur réduit les animations). */
const MOTION = { drop: 200, splash: 280, feed: 380, walk: 300, leave: 300, lift: 90, winDelay: 450 };

/** Vitesse de rattrapage de la position affichée (par seconde) : pièce tenue, puis relâchée. */
const FOLLOW_HELD = 45;
const FOLLOW_FREE = 16;

/** Taille d'un personnage en attente, en fraction de case. */
const PERSON_SIZE = 0.86;

const DEPTH = { board: 0, piece: 10, held: 20, person: 30, feeder: 35, flying: 40, debug: 50, fx: 60 };

export class BoardScene extends Phaser.Scene {
  /** La scène est prête à recevoir un moteur. */
  onReady?: () => void;
  /** L'état du moteur a changé (déplacement, collecte, retrait…). */
  onChange?: (events: readonly EngineEvent[]) => void;
  /** Une pièce vient d'être saisie (sélection du mode DEBUG). */
  onSelect?: (id: string) => void;
  /** Chaque image : temps restant, pour l'affichage du chronomètre. */
  onClock?: (leftMs: number | null) => void;
  /** Le niveau est gagné ; appelé une fois les animations terminées. */
  onWon?: (moves: number, timeLeftMs: number | null) => void;
  /** Le temps est écoulé. */
  onLost?: () => void;

  reducedMotion = false;

  private engine: PuzzleEngine | null = null;
  private layout: Layout | null = null;
  private pieces = new Map<string, PieceSprite>();
  private people = new Map<string, PersonSprite>();
  private feeders = new Map<string, FeederSprite>();
  private debugLayer: Container | null = null;
  private debugOn = false;
  private selected: string | null = null;
  /** Geste en cours : pièce tenue et point de saisie dans la pièce, en cases. */
  private hold: { id: string; offX: number; offY: number } | null = null;
  /** Victoire en attente d'annonce (fin des animations). */
  private winPending: { moves: number; timeLeftMs: number | null } | null = null;

  constructor() {
    super('board');
  }

  create(): void {
    // petit carré blanc, teinté à la volée, pour les confettis
    const g = this.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 12);
    g.generateTexture('confetti', 8, 12);
    g.destroy();
    this.onReady?.();
  }

  /** Affiche un moteur (nouveau niveau, règles changées ou recommencement). */
  show(engine: PuzzleEngine, layout: Layout): void {
    this.engine = engine;
    this.layout = layout;
    this.hold = null;
    this.winPending = null;
    if (this.selected && !engine.piece(this.selected)) this.selected = null;
    this.rebuild(false);
    this.onChange?.([]);
  }

  /** Nouvelle taille d'écran : même état, redessiné à la nouvelle échelle. */
  relayout(layout: Layout): void {
    this.layout = layout;
    if (this.engine) this.rebuild(true);
  }

  setDebug(on: boolean): void {
    this.debugOn = on;
    this.refreshDebug();
  }

  get selectedId(): string | null {
    return this.selected;
  }

  // ----------------------------------------------------------------- gestes

  /** Une pièce saisissable se trouve-t-elle sous ce point (pixels du canevas) ? */
  canGrab(px: number, py: number): boolean {
    const { engine, layout } = this;
    if (!engine || !layout || engine.isWon || engine.isLost || engine.isPaused) return false;
    const id = engine.pieceAt(Math.floor(cellX(layout, px)), Math.floor(cellY(layout, py)));
    return !!id && !engine.piece(id)!.full;
  }

  /** Pointeur enfoncé, en pixels du canevas. Renvoie true si une pièce a été saisie. */
  pointerDown(px: number, py: number): boolean {
    const { engine, layout } = this;
    if (!engine || !layout || this.hold) return false;
    const cx = cellX(layout, px);
    const cy = cellY(layout, py);
    const id = engine.pieceAt(Math.floor(cx), Math.floor(cy));
    if (!id || !engine.grab(id)) return false;
    const p = engine.piece(id)!;
    this.hold = { id, offX: cx - p.x, offY: cy - p.y };
    this.selected = id;
    this.onSelect?.(id);
    const sprite = this.pieces.get(id);
    if (sprite) {
      sprite.box.setDepth(DEPTH.held);
      this.tweens.add({ targets: sprite.box, scale: 1.05, duration: this.ms(MOTION.lift), ease: 'Quad.easeOut' });
    }
    this.refreshHints();
    this.refreshDebug();
    return true;
  }

  pointerMove(px: number, py: number): void {
    const { engine, layout, hold } = this;
    if (!engine || !layout || !hold) return;
    const wantX = cellX(layout, px) - hold.offX;
    const wantY = cellY(layout, py) - hold.offY;
    const events = engine.dragTo(Math.round(wantX), Math.round(wantY));
    const sprite = this.pieces.get(hold.id);
    const p = engine.piece(hold.id)!;
    if (engine.draggedId === hold.id && sprite) {
      const off = lean({ x: wantX - p.x, y: wantY - p.y }, (dx, dy) => engine.canPlace(p.id, p.x + dx, p.y + dy));
      sprite.tx = p.x + off.x;
      sprite.ty = p.y + off.y;
    }
    // la pièce a pu se remplir et disparaître en plein glisser
    if (engine.draggedId !== hold.id) this.letGo();
    this.play(events);
  }

  pointerUp(): void {
    const { engine, hold } = this;
    if (!engine || !hold) return;
    const events = engine.release();
    this.letGo();
    this.play(events);
  }

  /** Abandonne le geste en cours (pause, défaite) : la pièce reste sur sa dernière case valide. */
  cancelGesture(): void {
    this.letGo();
  }

  /** Déplacement manuel d'une case de la pièce sélectionnée (mode DEBUG). */
  nudgeSelected(dx: number, dy: number): void {
    const { engine } = this;
    if (!engine || !this.selected || this.hold) return;
    const events = engine.nudge(this.selected, dx, dy);
    const sprite = this.pieces.get(this.selected);
    const p = engine.piece(this.selected);
    if (sprite && p && !p.removed) {
      sprite.tx = p.x;
      sprite.ty = p.y;
    }
    this.play(events);
  }

  /** Fin du geste côté affichage : la pièce revient sur sa case. */
  private letGo(): void {
    const hold = this.hold;
    if (!hold) return;
    this.hold = null;
    const sprite = this.pieces.get(hold.id);
    const p = this.engine?.piece(hold.id);
    if (sprite && p && !sprite.leaving) {
      sprite.tx = p.x;
      sprite.ty = p.y;
      sprite.box.setDepth(DEPTH.piece);
      this.tweens.add({ targets: sprite.box, scale: 1, duration: this.ms(MOTION.lift), ease: 'Quad.easeOut' });
    }
    this.refreshHints();
    this.refreshDebug();
  }

  // ------------------------------------------------------------- événements

  private play(events: EngineEvent[]): void {
    if (events.length === 0) return;
    const now = this.time.now;
    let lastEnd = now;
    for (const e of events) {
      if (e.type === 'collected') {
        const sprite = this.pieces.get(e.pieceId);
        if (!sprite) continue;
        if (e.feederId) {
          const feeder = this.feeders.get(e.feederId);
          e.characterIds.forEach((_, j) => {
            const end = this.feed(feeder, sprite, j * MOTION.feed);
            sprite.busyUntil = Math.max(sprite.busyUntil, end);
          });
        } else {
          for (const cid of e.characterIds) sprite.busyUntil = Math.max(sprite.busyUntil, this.drop(cid, sprite));
        }
        lastEnd = Math.max(lastEnd, sprite.busyUntil);
      } else if (e.type === 'full') {
        const sprite = this.pieces.get(e.pieceId);
        // pièce pleine qui reste en place (H6 « stay ») : elle se fige
        if (sprite && this.engine?.rules.whenFull === 'stay') {
          this.later(sprite.busyUntil - this.time.now, () => sprite.box.setAlpha(0.55));
        }
      } else if (e.type === 'removed') {
        const sprite = this.pieces.get(e.pieceId);
        if (!sprite) continue;
        sprite.leaving = true;
        const start = Math.max(this.time.now, sprite.busyUntil) + this.ms(80);
        this.later(start - this.time.now, () => this.leave(sprite));
        lastEnd = Math.max(lastEnd, start + this.ms(MOTION.leave));
      } else if (e.type === 'won') {
        this.winPending = { moves: e.moves, timeLeftMs: e.timeLeftMs };
        this.later(lastEnd - this.time.now + this.ms(MOTION.winDelay), () => this.announceWin());
      } else if (e.type === 'lost') {
        this.letGo();
        this.onLost?.();
      }
    }
    this.refreshHints();
    this.refreshDebug();
    this.onChange?.(events);
  }

  /** Un personnage de la grille tombe dans la pièce qui le recouvre ; renvoie l'instant où il a disparu. */
  private drop(cid: string, sprite: PieceSprite): number {
    const end = this.time.now + this.ms(MOTION.drop);
    const person = this.people.get(cid);
    if (!person) {
      this.later(0, () => this.landed(sprite));
      return end;
    }
    this.people.delete(cid);
    person.ring.setVisible(false);
    // le personnage devient un enfant de la pièce : il la suit si elle bouge encore
    const local = this.toLocal(sprite, person.node.x, person.node.y);
    const node = person.node;
    sprite.box.add(node); // le retire aussi de la liste d'affichage de la scène
    node.setPosition(local.x, local.y).setScale(1 / sprite.box.scale);
    this.splash(sprite, local.x, local.y);
    this.tweens.add({
      targets: node,
      scale: 0.15,
      alpha: 0,
      y: local.y + this.layout!.cell * 0.12,
      duration: this.ms(MOTION.drop),
      ease: 'Quad.easeIn',
      onComplete: () => {
        node.destroy();
        this.landed(sprite);
      },
    });
    return end;
  }

  /** Un personnage sort d'un distributeur et descend dans la pièce posée sur sa case d'entrée. */
  private feed(feeder: FeederSprite | undefined, sprite: PieceSprite, delay: number): number {
    const layout = this.layout!;
    const start = this.time.now + this.ms(delay);
    const end = start + this.ms(MOTION.walk + MOTION.drop);
    if (!feeder) {
      this.later(end - this.time.now, () => this.landed(sprite));
      return end;
    }
    this.later(start - this.time.now, () => {
      if (!sprite.box.active) return;
      const color = feeder.def.queue[feeder.shownNext] ?? 'gray';
      feeder.shownNext++;
      this.drawFeeder(feeder);
      const node = this.add.container(0, 0);
      const g = this.add.graphics();
      this.drawPerson(g, 0, 0, layout.cell * PERSON_SIZE, shadeOf(color));
      node.add(g);
      const from = this.toLocal(sprite, feeder.box.x, feeder.box.y);
      const entry = feeder.def.entry;
      const to = this.toLocal(sprite, pxX(layout, entry.x + 0.5), pxY(layout, entry.y + 0.5));
      sprite.box.add(node);
      node.setPosition(from.x, from.y).setScale(0.8 / sprite.box.scale);
      this.tweens.chain({
        targets: node,
        tweens: [
          { x: to.x, y: to.y, scale: 1 / sprite.box.scale, duration: this.ms(MOTION.walk), ease: 'Sine.easeInOut' },
          {
            scale: 0.15,
            alpha: 0,
            duration: this.ms(MOTION.drop),
            ease: 'Quad.easeIn',
            onStart: () => this.splash(sprite, to.x, to.y),
            onComplete: () => {
              node.destroy();
              this.landed(sprite);
            },
          },
        ],
      });
    });
    return end;
  }

  /** Un personnage est arrivé : le compteur de la pièce baisse. */
  private landed(sprite: PieceSprite): void {
    if (sprite.shown > 0) sprite.shown--;
    this.drawBadge(sprite);
  }

  /** Petite onde de couleur à l'endroit où tombe un personnage. */
  private splash(sprite: PieceSprite, x: number, y: number): void {
    const p = this.engine?.piece(sprite.id);
    if (!p || this.reducedMotion) return;
    const ring = this.add.graphics();
    ring.lineStyle(Math.max(2, this.layout!.cell * 0.05), 0xffffff, 0.9);
    ring.strokeCircle(0, 0, this.layout!.cell * 0.3);
    sprite.box.add(ring);
    ring.setPosition(x, y).setScale(0.4);
    this.tweens.add({ targets: ring, scale: 1.4, alpha: 0, duration: MOTION.splash, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }

  private announceWin(): void {
    const pending = this.winPending;
    this.winPending = null;
    if (!pending) return;
    this.celebrate();
    this.onWon?.(pending.moves, pending.timeLeftMs);
  }

  /** Confettis aux couleurs du niveau. */
  private celebrate(): void {
    const { layout, engine } = this;
    if (!layout || !engine || this.reducedMotion) return;
    const s = layout.cell / 100;
    const emitter = this.add.particles(layout.width / 2, layout.oy + layout.rows * layout.cell * 0.45, 'confetti', {
      speed: { min: 350 * s, max: 900 * s },
      angle: { min: 200, max: 340 },
      gravityY: 1300 * s,
      lifespan: 1800,
      scale: { start: s * 1.6, end: s * 1.1 },
      rotate: { min: 0, max: 360 },
      tint: engine.level.colors.map((c) => shadeOf(c).base),
      emitting: false,
    });
    emitter.setDepth(DEPTH.fx);
    emitter.explode(90);
    this.later(2200, () => emitter.destroy());
  }

  /** Une pièce pleine quitte la grille. */
  private leave(sprite: PieceSprite): void {
    sprite.box.setDepth(DEPTH.piece);
    this.tweens.add({
      targets: sprite.box,
      scale: 0.35,
      alpha: 0,
      duration: this.ms(MOTION.leave),
      ease: 'Back.easeIn',
      onComplete: () => {
        sprite.box.destroy();
        if (this.pieces.get(sprite.id) === sprite) this.pieces.delete(sprite.id);
      },
    });
  }

  // ----------------------------------------------------------------- boucle

  update(_time: number, delta: number): void {
    const { layout, engine } = this;
    if (!layout || !engine) return;
    const lost = engine.tick(delta);
    if (lost.length) this.play(lost);
    this.onClock?.(engine.timeLeftMs);
    const dt = Math.min(delta, 50) / 1000;
    for (const sprite of this.pieces.values()) {
      if (sprite.leaving) continue;
      const held = this.hold?.id === sprite.id;
      const k = 1 - Math.exp(-dt * (held ? FOLLOW_HELD : FOLLOW_FREE));
      sprite.vx += (sprite.tx - sprite.vx) * k;
      sprite.vy += (sprite.ty - sprite.vy) * k;
      if (Math.abs(sprite.tx - sprite.vx) < 0.002) sprite.vx = sprite.tx;
      if (Math.abs(sprite.ty - sprite.vy) < 0.002) sprite.vy = sprite.ty;
      this.placeBox(sprite);
    }
  }

  // ----------------------------------------------------------------- dessin

  /** Redessine tout depuis l'état du moteur. `keep` : conserver les positions affichées des pièces. */
  private rebuild(keep: boolean): void {
    const engine = this.engine!;
    const previous = new Map([...this.pieces].map(([id, s]) => [id, { vx: s.vx, vy: s.vy }]));
    this.tweens.killAll();
    this.time.removeAllEvents();
    for (const obj of [...this.children.list]) obj.destroy();
    this.pieces.clear();
    this.people.clear();
    this.feeders.clear();
    this.debugLayer = null;

    this.drawBoard();
    for (const def of engine.level.feeders) this.makeFeeder(def);
    for (const p of engine.pieceList) {
      if (p.removed) continue;
      const sprite = this.makePiece(p);
      this.pieces.set(p.id, sprite);
      const before = keep ? previous.get(p.id) : undefined;
      if (before) {
        sprite.vx = before.vx;
        sprite.vy = before.vy;
      }
      if (this.hold?.id === p.id) sprite.box.setDepth(DEPTH.held).setScale(1.05);
      this.placeBox(sprite);
    }
    for (const c of engine.characterList) {
      if (c.collectedBy === null) this.makePerson(c.id, c.color, c.x, c.y);
    }
    this.refreshHints();
    this.refreshDebug();
    // les animations ont été coupées : annoncer tout de suite une victoire qui attendait la fin
    this.announceWin();
  }

  private drawBoard(): void {
    const { cols, rows, cell, ox, oy } = this.layout!;
    const engine = this.engine!;
    const g = this.add.graphics().setDepth(DEPTH.board);
    const rim = Math.round(cell * 0.18);
    g.fillStyle(BOARD.panel, 1);
    g.fillRoundedRect(ox - rim, oy - rim, cols * cell + 2 * rim, rows * cell + 2 * rim, cell * 0.28);
    const gap = Math.max(1, Math.round(cell * 0.04));
    const r = cell * 0.14;
    const entries = new Set(engine.level.feeders.map((f) => `${f.entry.x},${f.entry.y}`));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = ox + x * cell + gap;
        const py = oy + y * cell + gap;
        g.fillStyle(BOARD.cellEdge, 1);
        g.fillRoundedRect(px, py, cell - 2 * gap, cell - 2 * gap, r);
        g.fillStyle(BOARD.cell, 1);
        g.fillRoundedRect(px, py + gap, cell - 2 * gap, cell - 3 * gap, r);
        if (entries.has(`${x},${y}`)) {
          // case d'entrée d'un distributeur : liseré clair
          g.lineStyle(Math.max(2, cell * 0.04), BOARD.entry, 0.8);
          g.strokeRoundedRect(px + gap * 2, py + gap * 2, cell - 6 * gap, cell - 6 * gap, r * 0.8);
        }
      }
    }
  }

  // ------------------------------------------------------------ distributeurs

  /** Centre de la cabine d'un distributeur, hors de la grille, face à sa case d'entrée. */
  private feederCenter(def: FeederDef): { x: number; y: number } {
    const l = this.layout!;
    const d = (FEEDER_DEPTH / 2 + 0.12) * l.cell;
    const cx = pxX(l, def.entry.x + 0.5);
    const cy = pxY(l, def.entry.y + 0.5);
    if (def.side === 'top') return { x: cx, y: l.oy - d };
    if (def.side === 'bottom') return { x: cx, y: l.oy + l.rows * l.cell + d };
    if (def.side === 'left') return { x: l.ox - d, y: cy };
    return { x: l.ox + l.cols * l.cell + d, y: cy };
  }

  private makeFeeder(def: FeederDef): void {
    const cell = this.layout!.cell;
    const c = this.feederCenter(def);
    const art = this.add.graphics();
    const count = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: `${Math.round(cell * 0.24)}px`,
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    const box = this.add.container(c.x, c.y, [art, count]).setDepth(DEPTH.feeder);
    const engineFeeder = this.engine!.feederList.find((f) => f.def.id === def.id)!;
    const sprite: FeederSprite = { def, box, art, count, shownNext: def.queue.length - engineFeeder.pending.length };
    this.feeders.set(def.id, sprite);
    this.drawFeeder(sprite);
  }

  /** Cabine, personnage en tête de file et nombre restant. */
  private drawFeeder(f: FeederSprite): void {
    const cell = this.layout!.cell;
    const g = f.art;
    g.clear();
    const vertical = f.def.side === 'top' || f.def.side === 'bottom';
    const w = vertical ? cell * 0.92 : cell * FEEDER_DEPTH * 0.92;
    const h = vertical ? cell * FEEDER_DEPTH * 0.92 : cell * 0.92;
    g.fillStyle(BOARD.boothEdge, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, cell * 0.18);
    g.fillStyle(BOARD.booth, 1);
    g.fillRoundedRect(-w / 2 + cell * 0.05, -h / 2 + cell * 0.05, w - cell * 0.1, h - cell * 0.1, cell * 0.14);
    const left = f.def.queue.length - f.shownNext;
    const head = f.def.queue[f.shownNext];
    // le personnage en tête se tient du côté de la grille, le compteur à l'opposé
    const toward = { top: { x: 0, y: 1 }, bottom: { x: 0, y: -1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } }[f.def.side];
    const shift = cell * 0.14;
    if (head) this.drawPerson(g, toward.x * shift, toward.y * shift, cell * 0.66, shadeOf(head));
    f.count.setText(String(left)).setPosition(-toward.x * cell * 0.3, -toward.y * cell * 0.3);
    f.count.setFontSize(Math.round(cell * 0.24));
  }

  // ------------------------------------------------------------------ pièces

  private makePiece(p: PieceView): PieceSprite {
    const cell = this.layout!.cell;
    const w = Math.max(...p.cells.map((c) => c.x)) + 1;
    const h = Math.max(...p.cells.map((c) => c.y)) + 1;
    const shade = shadeOf(p.color);
    const body = this.add.graphics();
    const ox = (-w * cell) / 2;
    const oy = (-h * cell) / 2;
    // ombre portée, rebord, creux : la pièce se lit comme un bac où tombent les personnages
    this.fillShape(body, p, ox, oy + cell * 0.07, shade.dark, 0.07);
    this.fillShape(body, p, ox, oy, shade.base, 0.07);
    this.fillShape(body, p, ox, oy + cell * 0.02, shade.deep, 0.2);
    const badgeBg = this.add.graphics();
    const badge = this.add.text(0, 0, '', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: `${Math.round(cell * 0.24)}px`,
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);
    const box = this.add.container(0, 0, [body, badgeBg, badge]).setDepth(DEPTH.piece);
    const sprite: PieceSprite = {
      id: p.id, box, badge, badgeBg, w, h,
      vx: p.x, vy: p.y, tx: p.x, ty: p.y,
      shown: p.remaining, busyUntil: 0, leaving: false,
    };
    if (p.full) box.setAlpha(0.55);
    this.drawBadge(sprite);
    return sprite;
  }

  /** Compteur de places restantes, dans le coin bas-droit de la dernière case de la pièce. */
  private drawBadge(sprite: PieceSprite): void {
    const p = this.engine?.piece(sprite.id);
    if (!p) return;
    const cell = this.layout!.cell;
    const last = p.cells[p.cells.length - 1];
    const x = (last.x + 1 - sprite.w / 2) * cell - cell * 0.22;
    const y = (last.y + 1 - sprite.h / 2) * cell - cell * 0.22;
    const r = cell * 0.17;
    sprite.badgeBg.clear();
    sprite.badgeBg.fillStyle(BOARD.badge, 0.85);
    sprite.badgeBg.fillCircle(x, y, r);
    sprite.badgeBg.lineStyle(Math.max(1, cell * 0.025), shadeOf(p.color).base, 1);
    sprite.badgeBg.strokeCircle(x, y, r);
    sprite.badge.setText(String(sprite.shown)).setPosition(x, y);
  }

  /**
   * Silhouette d'un polyomino : une case arrondie par case, plus des ponts
   * entre cases voisines pour que la pièce paraisse d'un seul bloc.
   * `m` : retrait du bord de chaque case, en fraction de case.
   */
  private fillShape(g: Graphics, p: PieceView, ox: number, oy: number, color: number, inset: number): void {
    const cell = this.layout!.cell;
    const m = cell * inset;
    const r = cell * Math.max(0.08, 0.27 - inset);
    const has = (x: number, y: number) => p.cells.some((c) => c.x === x && c.y === y);
    g.fillStyle(color, 1);
    for (const c of p.cells) {
      const x = ox + c.x * cell;
      const y = oy + c.y * cell;
      g.fillRoundedRect(x + m, y + m, cell - 2 * m, cell - 2 * m, r);
      if (has(c.x + 1, c.y)) g.fillRect(x + cell - m - r, y + m, 2 * (m + r), cell - 2 * m);
      if (has(c.x, c.y + 1)) g.fillRect(x + m, y + cell - m - r, cell - 2 * m, 2 * (m + r));
      // bloc 2 × 2 : boucher le petit carré central laissé par les ponts
      if (has(c.x + 1, c.y) && has(c.x, c.y + 1) && has(c.x + 1, c.y + 1)) {
        g.fillRect(x + cell - m - 1, y + cell - m - 1, 2 * m + 2, 2 * m + 2);
      }
    }
  }

  // ------------------------------------------------------------- personnages

  private makePerson(id: string, color: string, x: number, y: number): void {
    const l = this.layout!;
    const ring = this.add.graphics();
    ring.lineStyle(Math.max(2, l.cell * 0.06), BOARD.ring, 0.95);
    ring.strokeCircle(0, 0, l.cell * 0.42);
    ring.setVisible(false);
    const g = this.add.graphics();
    this.drawPerson(g, 0, 0, l.cell * PERSON_SIZE, shadeOf(color));
    const node = this.add.container(pxX(l, x + 0.5), pxY(l, y + 0.5), [ring, g]).setDepth(DEPTH.person);
    this.people.set(id, { node, ring });
  }

  /** Petit personnage centré en (cx, cy), haut d'environ `s` pixels. */
  private drawPerson(g: Graphics, cx: number, cy: number, s: number, shade: Shade): void {
    const y = cy + s * 0.04;
    const outline = Math.max(1, s * 0.05);
    g.fillStyle(shade.dark, 1);
    g.fillRoundedRect(cx - 0.25 * s - outline, y - outline, 0.5 * s + 2 * outline, 0.36 * s + 2 * outline, 0.16 * s);
    g.fillCircle(cx, y - 0.15 * s, 0.17 * s + outline);
    g.fillStyle(shade.base, 1);
    g.fillRoundedRect(cx - 0.25 * s, y, 0.5 * s, 0.36 * s, 0.14 * s);
    g.fillCircle(cx, y - 0.15 * s, 0.17 * s);
    g.fillStyle(BOARD.eye, 1);
    g.fillCircle(cx - 0.065 * s, y - 0.16 * s, 0.045 * s);
    g.fillCircle(cx + 0.065 * s, y - 0.16 * s, 0.045 * s);
    g.fillStyle(BOARD.pupil, 1);
    g.fillCircle(cx - 0.06 * s, y - 0.155 * s, 0.022 * s);
    g.fillCircle(cx + 0.07 * s, y - 0.155 * s, 0.022 * s);
  }

  /** Pendant un glisser : entoure les personnages qu'un lâcher embarquerait maintenant. */
  private refreshHints(): void {
    const id = this.hold?.id;
    const pending = new Set(id && this.engine ? this.engine.pendingCollect(id) : []);
    for (const [cid, person] of this.people) person.ring.setVisible(pending.has(cid));
  }

  // ------------------------------------------------------------------ DEBUG

  /** Coordonnées des cases, cases occupées (initiale de la pièce) et pièce sélectionnée. */
  private refreshDebug(): void {
    this.debugLayer?.destroy();
    this.debugLayer = null;
    const { engine, layout } = this;
    if (!this.debugOn || !engine || !layout) return;
    const { cell } = layout;
    const g = this.add.graphics();
    const items: Phaser.GameObjects.GameObject[] = [g];
    const font = { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: `${Math.round(cell * 0.15)}px`, color: '#ffffff' };
    for (let y = 0; y < layout.rows; y++) {
      for (let x = 0; x < layout.cols; x++) {
        const id = engine.pieceAt(x, y);
        const px = pxX(layout, x);
        const py = pxY(layout, y);
        if (id) {
          g.lineStyle(Math.max(1, cell * 0.02), BOARD.debug, 0.55);
          g.strokeRect(px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88);
        }
        items.push(this.add.text(px + cell * 0.06, py + cell * 0.04, `${x},${y}`, font).setAlpha(0.85));
      }
    }
    if (this.selected) {
      g.lineStyle(Math.max(2, cell * 0.06), BOARD.debug, 1);
      for (const c of engine.cellsOf(this.selected)) g.strokeRect(pxX(layout, c.x) + 2, pxY(layout, c.y) + 2, cell - 4, cell - 4);
    }
    this.debugLayer = this.add.container(0, 0, items).setDepth(DEPTH.debug);
  }

  // ---------------------------------------------------------------- outils

  private placeBox(sprite: PieceSprite): void {
    const l = this.layout!;
    sprite.box.setPosition(pxX(l, sprite.vx + sprite.w / 2), pxY(l, sprite.vy + sprite.h / 2));
  }

  /** Point du canevas → repère de la pièce (centrée, éventuellement agrandie). */
  private toLocal(sprite: PieceSprite, x: number, y: number): { x: number; y: number } {
    const s = sprite.box.scale;
    return { x: (x - sprite.box.x) / s, y: (y - sprite.box.y) / s };
  }

  private later(ms: number, fn: () => void): void {
    this.time.delayedCall(Math.max(0, ms), fn);
  }

  private ms(duration: number): number {
    return this.reducedMotion ? Math.min(duration, 1) : duration;
  }
}
