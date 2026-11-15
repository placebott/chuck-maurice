/**
 * Moteur logique d'Embarquement (prototype de puzzle) : niveaux, règles,
 * collisions, collecte, distributeurs, chronomètre, victoire, défaite, et
 * faisabilité des niveaux. Lancement : npm test
 *
 * Les premiers tests datent des hypothèses d'origine (contact par un côté,
 * collecte au lâcher, personnages bloquants) : ils les fixent explicitement
 * (LEGACY). Les suivants vérifient les règles par défaut actuelles, tirées de
 * la vidéo de référence (docs/level43-observations.md).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import demo from '../src/embarquement/levels/demo.json';
import rush from '../src/embarquement/levels/heure-de-pointe.json';
import { PuzzleEngine, RulesError } from '../src/embarquement/engine/engine';
import { LevelError, levelWarnings, parseLevel, shapeCells } from '../src/embarquement/engine/level';
import { DEFAULT_RULES, RULE_DOCS, resolveRules, ruleConflicts } from '../src/embarquement/engine/rules';
import { replay, solve } from '../src/embarquement/engine/solver';
import type { EngineEvent, LevelJson, Rules } from '../src/embarquement/engine/types';
import { computeLayout, formatClock, lean, marginsFor } from '../src/embarquement/view/geometry';

/** Générateur déterministe (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Petit niveau de test ; tout ce qui n'est pas précisé est vide. */
function level(partial: Partial<LevelJson>): LevelJson {
  return { id: 't', width: 5, height: 5, colors: ['red', 'blue'], pieces: [], characters: [], ...partial };
}

/** Hypothèses d'origine du prototype, avant l'analyse de la vidéo. */
const LEGACY: Partial<Rules> = { contact: 'side', collectOn: 'release', charactersBlock: 'all', win: 'all-collected' };

/** Moteur sous les hypothèses d'origine (anciens tests), complétées par `rules`. */
function engineOf(partial: Partial<LevelJson>, rules?: Partial<Rules>): PuzzleEngine {
  return new PuzzleEngine(parseLevel(level(partial)), { ...LEGACY, ...rules });
}

/** Moteur sous les règles par défaut actuelles, complétées par `rules`. */
function engineNow(partial: Partial<LevelJson>, rules?: Partial<Rules>): PuzzleEngine {
  return new PuzzleEngine(parseLevel(level(partial)), rules);
}

/** Saisit, glisse jusqu'à (x, y), lâche ; renvoie tous les événements. */
function move(e: PuzzleEngine, id: string, x: number, y: number): EngineEvent[] {
  assert.ok(e.grab(id), `saisie de ${id}`);
  return [...e.dragTo(x, y), ...e.release()];
}

const types = (events: EngineEvent[]) => events.map((ev) => ev.type).filter((t) => t !== 'moved');
const at = (e: PuzzleEngine, id: string) => ({ x: e.piece(id)!.x, y: e.piece(id)!.y });

/** Aucune pièce hors grille, aucun chevauchement, aucune pièce sur un personnage qui la bloque. */
function assertCoherent(e: PuzzleEngine): void {
  const seen = new Map<string, string>();
  for (const p of e.pieceList) {
    if (p.removed) continue;
    for (const c of p.cells) {
      const x = p.x + c.x;
      const y = p.y + c.y;
      assert.ok(x >= 0 && y >= 0 && x < e.level.width && y < e.level.height, `${p.id} hors grille en (${x}, ${y})`);
      const k = `${x},${y}`;
      assert.ok(!seen.has(k), `${p.id} chevauche ${seen.get(k)} en (${x}, ${y})`);
      seen.set(k, p.id);
      for (const ch of e.characterList) {
        if (ch.collectedBy || ch.x !== x || ch.y !== y) continue;
        const blocked = e.rules.charactersBlock === 'all' || (e.rules.charactersBlock === 'other-colors' && ch.color !== p.color);
        assert.ok(!blocked, `${p.id} recouvre le personnage ${ch.id}`);
      }
    }
  }
}

// ------------------------------------------------------------------ niveaux

test('le niveau de démonstration se charge : grille 6 × 7, trois couleurs', () => {
  const lv = parseLevel(demo);
  assert.equal(lv.width, 6);
  assert.equal(lv.height, 7);
  assert.deepEqual([...lv.colors], ['red', 'blue', 'yellow']);
  assert.equal(new Set(lv.pieces.map((p) => p.cells.length)).size >= 4, true, 'des formes variées');
  for (const color of lv.colors) {
    const people = lv.characters.filter((c) => c.color === color).length;
    const seats = lv.pieces.filter((p) => p.color === color).reduce((n, p) => n + p.cells.length, 0);
    assert.equal(people, seats, `${color} : autant de places que de personnages`);
  }
  assert.deepEqual(levelWarnings(lv, DEFAULT_RULES), []);
});

test('un niveau invalide signale toutes ses erreurs en une fois', () => {
  const bad = {
    id: 'bad',
    width: 4,
    height: 4,
    colors: ['red', 'red'],
    pieces: [
      { id: 'A', color: 'red', x: 0, y: 0, shape: ['##'] },
      { id: 'A', color: 'green', x: 1, y: 0, shape: ['#'] },
      { id: 'C', color: 'red', x: 3, y: 3, shape: ['##'] },
      { id: 'D', color: 'red', x: 0, y: 2, shape: ['#.', '.#'] },
      { id: 'E', color: 'red', x: 0, y: 3, shape: ['#x'], capacity: 0 },
    ],
    characters: [{ color: 'red', x: 0, y: 0 }, { color: 'red', x: 9, y: 1 }],
    rules: { contact: 'nearby', bonus: true },
  };
  assert.throws(() => parseLevel(bad), (err: unknown) => {
    assert.ok(err instanceof LevelError);
    const all = err.errors.join('\n');
    for (const bit of ['en double', 'green', 'sort de la grille', 'déjà prise', "d'un seul tenant", '« shape »', 'capacity', 'règle inconnue', 'valeur invalide']) {
      assert.ok(all.includes(bit), `erreur attendue : « ${bit} »\n${all}`);
    }
    return true;
  });
});

test("l'ancre d'une forme est le coin haut-gauche de ses cases pleines", () => {
  const lv = parseLevel(level({ pieces: [{ id: 'A', color: 'red', x: 0, y: 0, shape: ['..', '.#', '.#'] }] }));
  const p = lv.pieces[0];
  assert.deepEqual({ x: p.x, y: p.y }, { x: 1, y: 1 });
  assert.deepEqual(p.cells, [{ x: 0, y: 0 }, { x: 0, y: 1 }]);
});

// -------------------------------------------------------------------- règles

test('les règles se superposent : défaut ← niveau ← page', () => {
  const r = resolveRules({ contact: 'overlap', capacity: 2 }, { capacity: 3, win: undefined });
  assert.equal(r.contact, 'overlap');
  assert.equal(r.capacity, 3);
  assert.equal(r.win, DEFAULT_RULES.win);
  assert.equal(RULE_DOCS.length, Object.keys(DEFAULT_RULES).length, 'chaque règle est documentée');
});

test('les combinaisons incohérentes sont refusées', () => {
  assert.equal(ruleConflicts(resolveRules({ contact: 'overlap', charactersBlock: 'all' })).length, 1);
  assert.equal(ruleConflicts(resolveRules({ win: 'all-removed', whenFull: 'stay' })).length, 1);
  assert.throws(() => new PuzzleEngine(parseLevel(demo), { contact: 'overlap' }), RulesError);
  assert.doesNotThrow(() => new PuzzleEngine(parseLevel(demo), { contact: 'overlap', charactersBlock: 'other-colors' }));
});

// ---------------------------------------------------------------- collisions

test('une pièce glisse case par case et s’arrête au ras des obstacles', () => {
  const e = engineOf({
    pieces: [
      { id: 'A', color: 'red', x: 0, y: 0, shape: ['##'] },
      { id: 'B', color: 'blue', x: 4, y: 0, shape: ['#', '#'] },
    ],
    characters: [{ color: 'blue', x: 0, y: 3 }],
  });
  e.grab('A');
  e.dragTo(9, 0); // vers la droite : bloquée par B
  assert.deepEqual(at(e, 'A'), { x: 2, y: 0 });
  e.dragTo(0, 0);
  e.dragTo(0, 9); // tout droit vers le bas : bloquée par le personnage en (0, 3)
  assert.deepEqual(at(e, 'A'), { x: 0, y: 2 });
  e.dragTo(-5, -5); // vers le coin : bloquée par les bords
  assert.deepEqual(at(e, 'A'), { x: 0, y: 0 });
  e.release();
  assertCoherent(e);
});

test('bloquée sur un axe, la pièce longe l’obstacle par l’autre', () => {
  const e = engineOf({
    pieces: [
      { id: 'A', color: 'red', x: 0, y: 0, shape: ['#'] },
      { id: 'W', color: 'blue', x: 1, y: 0, shape: ['#'] },
    ],
  });
  e.grab('A');
  e.dragTo(3, 1); // la droite est bloquée : la pièce descend d'abord, puis repart à droite
  assert.deepEqual(at(e, 'A'), { x: 3, y: 1 });
  assertCoherent(e);
});

test('une pièce ne traverse jamais un obstacle, même pour un but derrière lui', () => {
  const e = engineOf({
    width: 5,
    height: 1,
    pieces: [
      { id: 'A', color: 'red', x: 0, y: 0, shape: ['#'] },
      { id: 'W', color: 'blue', x: 2, y: 0, shape: ['#'] },
    ],
  });
  e.grab('A');
  e.dragTo(4, 0);
  assert.deepEqual(at(e, 'A'), { x: 1, y: 0 });
});

test('H5 : les personnages bloquent toutes les pièces, les autres couleurs, ou rien', () => {
  const setup = { pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'] }], characters: [{ color: 'blue', x: 2, y: 0 }, { color: 'red', x: 4, y: 0 }] };
  const all = engineOf(setup);
  all.grab('R');
  all.dragTo(4, 0);
  assert.equal(at(all, 'R').x, 1);

  const others = engineOf(setup, { charactersBlock: 'other-colors', collectOn: 'release', contact: 'overlap' });
  others.grab('R');
  others.dragTo(4, 0);
  assert.equal(at(others, 'R').x, 1, 'le personnage bleu arrête la pièce rouge');

  const none = engineOf(setup, { charactersBlock: 'none' });
  none.grab('R');
  none.dragTo(3, 0);
  assert.equal(at(none, 'R').x, 3);
});

test('H8 : un seul axe par glisser, libéré en revenant à la case de départ', () => {
  const e = engineOf({ pieces: [{ id: 'A', color: 'red', x: 0, y: 0, shape: ['#'] }] }, { movement: 'axis-lock' });
  e.grab('A');
  e.dragTo(2, 0);
  e.dragTo(2, 3); // verrouillée sur x : ne descend pas
  assert.deepEqual(at(e, 'A'), { x: 2, y: 0 });
  e.dragTo(0, 0);
  e.dragTo(0, 3); // de retour au départ, elle peut changer d'axe
  assert.deepEqual(at(e, 'A'), { x: 0, y: 3 });
  e.release();
});

test('des milliers de glissers au hasard ne produisent jamais de chevauchement', () => {
  const variants: Partial<Rules>[] = [
    {},
    { charactersBlock: 'other-colors' },
    { charactersBlock: 'none', contact: 'overlap' },
    { collectOn: 'step', contact: 'side-or-corner' },
    { movement: 'axis-lock', whenFull: 'stay' },
  ];
  const rand = seeded(7);
  for (const rules of variants) {
    const e = new PuzzleEngine(parseLevel(demo), rules);
    for (let i = 0; i < 1500; i++) {
      const live = e.pieceList.filter((p) => !p.removed && !p.full);
      if (e.isWon || live.length === 0) {
        e.reset();
        continue;
      }
      const p = live[Math.floor(rand() * live.length)];
      if (!e.grab(p.id)) continue;
      for (let k = 0; k < 3 && e.draggedId; k++) {
        e.dragTo(Math.floor(rand() * 10) - 2, Math.floor(rand() * 11) - 2);
        assertCoherent(e);
      }
      e.release();
      assertCoherent(e);
      for (const ch of e.characterList) {
        if (ch.collectedBy) assert.ok(e.piece(ch.collectedBy)!.passengers.includes(ch.id));
      }
    }
  }
});

// ------------------------------------------------------------------- collecte

test('H1 « side » + H2 « release » : collecte au lâcher, par un côté seulement', () => {
  const e = engineOf({
    pieces: [{ id: 'R', color: 'red', x: 0, y: 2, shape: ['##'] }],
    characters: [{ id: 'side', color: 'red', x: 2, y: 1 }, { id: 'diag', color: 'red', x: 3, y: 1 }, { id: 'blue', color: 'blue', x: 1, y: 1 }],
  });
  e.grab('R');
  assert.deepEqual(e.dragTo(1, 2).map((ev) => ev.type), ['moved'], 'rien pendant le glisser');
  assert.deepEqual(e.pendingCollect('R'), ['side']);
  const events = e.release();
  assert.deepEqual(types(events), ['collected'], 'la diagonale ne compte pas');
  assert.deepEqual(e.piece('R')!.passengers, ['side']);
});

test('H1 « side-or-corner » compte les diagonales', () => {
  const e = engineOf(
    { pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'] }], characters: [{ id: 'd', color: 'red', x: 1, y: 1 }] },
    { contact: 'side-or-corner' },
  );
  move(e, 'R', 0, 0);
  assert.equal(e.characterList[0].collectedBy, 'R');
});

test('H1 « overlap » : la pièce doit recouvrir le personnage', () => {
  const e = engineOf(
    { pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'], capacity: 2 }], characters: [{ id: 'a', color: 'red', x: 2, y: 0 }] },
    { contact: 'overlap', charactersBlock: 'other-colors' },
  );
  move(e, 'R', 1, 0);
  assert.equal(e.characterList[0].collectedBy, null, 'voisin : pas de contact');
  move(e, 'R', 2, 0);
  assert.equal(e.characterList[0].collectedBy, 'R');
});

test('H2 « step » : collecte en route ; une pièce remplie disparaît et termine le geste', () => {
  const e = engineOf(
    {
      width: 6,
      height: 2,
      pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'] }],
      characters: [{ id: 'a', color: 'red', x: 2, y: 1 }],
    },
    { collectOn: 'step' },
  );
  e.grab('R');
  const events = e.dragTo(5, 0);
  assert.deepEqual(types(events), ['collected', 'full', 'removed', 'won']);
  assert.deepEqual(at(e, 'R'), { x: 2, y: 0 }, 's’est arrêtée là où elle s’est remplie');
  assert.equal(e.draggedId, null);
  assert.deepEqual(e.dragTo(0, 0), []);
  assert.deepEqual(e.release(), []);
});

test('H3 et H4 : capacité, places restantes et ordre de lecture', () => {
  const people = [
    { id: 'c', color: 'red', x: 2, y: 1 },
    { id: 'a', color: 'red', x: 0, y: 1 },
    { id: 'b', color: 'red', x: 1, y: 1 },
  ];
  // la pièce part à droite de la rangée 0 et glisse jusqu'au-dessus des trois personnages
  const piece = { id: 'R', color: 'red', x: 3, y: 0, shape: ['###'] };
  const width = 6;

  const byCells = engineOf({ width, pieces: [piece], characters: people });
  move(byCells, 'R', 0, 0);
  assert.equal(byCells.piece('R')!.capacity, 3);
  assert.ok(byCells.piece('R')!.removed, '3 cases, 3 personnages : pleine');

  const fixed = engineOf({ width, pieces: [piece], characters: people }, { capacity: 2 });
  move(fixed, 'R', 0, 0);
  assert.deepEqual(fixed.piece('R')!.passengers, ['a', 'b'], 'ordre de lecture, dans la limite des places');

  const explicit = engineOf({ width, pieces: [{ ...piece, capacity: 1 }], characters: people }, { capacity: 4 });
  assert.equal(explicit.piece('R')!.capacity, 1, 'la capacité du JSON l’emporte');

  const one = engineOf({ width, pieces: [piece], characters: people }, { collectLimit: 'one' });
  move(one, 'R', 0, 0);
  assert.deepEqual(one.piece('R')!.passengers, ['a']);
  move(one, 'R', 0, 0); // simple toucher : un de plus
  assert.deepEqual(one.piece('R')!.passengers, ['a', 'b']);
});

test('H6 « remove » libère les cases ; « stay » laisse un obstacle qu’on ne peut plus saisir', () => {
  const setup = {
    width: 4,
    height: 2,
    pieces: [
      { id: 'R', color: 'red', x: 1, y: 0, shape: ['#'] },
      { id: 'B', color: 'blue', x: 3, y: 0, shape: ['#'] },
    ],
    characters: [{ color: 'red', x: 1, y: 1 }, { color: 'blue', x: 0, y: 1 }],
  };
  const remove = engineOf(setup);
  assert.deepEqual(types(move(remove, 'R', 1, 0)), ['collected', 'full', 'removed']);
  assert.equal(remove.pieceAt(1, 0), null);
  move(remove, 'B', 0, 0);
  assert.deepEqual(at(remove, 'B'), { x: 0, y: 0 }, 'B passe là où était R');

  const stay = engineOf(setup, { whenFull: 'stay' });
  assert.deepEqual(types(move(stay, 'R', 1, 0)), ['collected', 'full']);
  assert.equal(stay.pieceAt(1, 0), 'R');
  assert.equal(stay.grab('R'), false);
  stay.grab('B');
  stay.dragTo(0, 0);
  assert.deepEqual(at(stay, 'B'), { x: 2, y: 0 }, 'R bloque toujours le passage');
});

test('coups : un toucher qui embarque compte, un aller-retour stérile non', () => {
  const e = engineOf({
    pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['##'] }],
    characters: [{ color: 'red', x: 0, y: 1 }, { color: 'red', x: 4, y: 4 }],
  });
  e.grab('R');
  e.dragTo(2, 0);
  e.dragTo(0, 0);
  e.release(); // revenue à sa place : embarque (0, 1) au lâcher
  assert.equal(e.moveCount, 1);
  e.grab('R');
  e.dragTo(1, 0);
  e.dragTo(0, 0);
  e.release(); // revenue à sa place, plus rien à embarquer
  assert.equal(e.moveCount, 1);
  move(e, 'R', 2, 0);
  assert.equal(e.moveCount, 2);
});

test('H7 : victoire signalée une fois, puis plus aucune saisie', () => {
  const setup = {
    pieces: [
      { id: 'R', color: 'red', x: 0, y: 0, shape: ['#'] },
      { id: 'B', color: 'blue', x: 4, y: 4, shape: ['#'], capacity: 2 },
    ],
    characters: [{ color: 'red', x: 1, y: 1 }, { color: 'blue', x: 4, y: 3 }],
  };
  const collected = engineOf(setup);
  move(collected, 'B', 4, 4);
  assert.equal(collected.isWon, false);
  const events = move(collected, 'R', 1, 0);
  assert.deepEqual(types(events), ['collected', 'full', 'removed', 'won']);
  assert.deepEqual(events.at(-1), { type: 'won', moves: 2, timeLeftMs: null });
  assert.equal(collected.grab('B'), false);

  const removed = engineOf(setup, { win: 'all-removed' });
  move(removed, 'B', 4, 4);
  move(removed, 'R', 1, 0);
  assert.equal(removed.isWon, false, 'B n’est pas pleine : elle n’a pas disparu');
});

test('reset, snapshot et restore', () => {
  const e = new PuzzleEngine(parseLevel(demo));
  const start = JSON.stringify(e.snapshot());
  move(e, 'B1', 2, 1);
  assert.equal(e.characterList.filter((c) => c.collectedBy).length, 2);
  const mid = e.snapshot();
  const copy = e.clone();
  move(copy, 'B1', 2, 0);
  assert.ok(copy.piece('B1')!.removed);
  assert.equal(e.piece('B1')!.removed, false, 'la copie est indépendante');
  e.reset();
  assert.equal(JSON.stringify(e.snapshot()), start);
  e.restore(mid);
  assert.deepEqual(e.snapshot(), mid);
  assert.equal(e.pieceAt(4, 1), 'B1');
});

// -------------------------------------------------------------------- solveur

test('le niveau de démonstration se gagne avec les vrais gestes', () => {
  const lv = parseLevel(demo);
  const result = solve(new PuzzleEngine(lv));
  assert.ok(result.solved, 'solution trouvée');
  assert.ok(result.steps.length >= 8, `pas trivial (${result.steps.length} coups)`);
  const e = new PuzzleEngine(lv);
  const events = replay(e, result.steps);
  assert.ok(e.isWon);
  assert.equal(events.filter((ev) => ev.type === 'won').length, 1);
  assert.equal(e.moveCount, result.steps.length);
});

test('le niveau reste faisable sous chaque variante jouable des hypothèses', () => {
  const lv = parseLevel(demo);
  const variants: Partial<Rules>[] = [
    { contact: 'side-or-corner' },
    { contact: 'overlap', charactersBlock: 'other-colors' },
    { collectOn: 'step' },
    { collectLimit: 'one' },
    { charactersBlock: 'other-colors' },
    { charactersBlock: 'none' },
    { movement: 'axis-lock' },
    { win: 'both' },
  ];
  for (const rules of variants) {
    const result = solve(new PuzzleEngine(lv, rules));
    assert.ok(result.solved, `faisable avec ${JSON.stringify(rules)}`);
    const e = new PuzzleEngine(lv, rules);
    replay(e, result.steps);
    assert.ok(e.isWon, `rejeu gagnant avec ${JSON.stringify(rules)}`);
  }
});

test('le solveur établit qu’un niveau est impossible', () => {
  const e = engineOf({
    width: 3,
    height: 1,
    pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'] }],
    characters: [{ color: 'blue', x: 1, y: 0 }, { color: 'red', x: 2, y: 0 }],
  });
  const result = solve(e, { strategy: 'shortest' });
  assert.equal(result.solved, false);
  assert.equal(result.complete, true);
});

// ------------------------------------------------------------------ affichage

test('mise en page : la grille et ses distributeurs tiennent dans la zone, à la densité de l’écran', () => {
  const l = computeLayout(6, 7, 390, 600, 3);
  assert.ok(l.width / l.dpr <= 390 && l.height / l.dpr <= 600);
  assert.equal(l.dpr, 3);
  assert.equal(computeLayout(6, 7, 390, 600, 0).dpr, 1);
  const sides = computeLayout(7, 8, 360, 560, 2, marginsFor(['left', 'right']));
  assert.ok(sides.width / sides.dpr <= 360 && sides.height / sides.dpr <= 560);
  assert.ok(sides.ox > sides.cell, 'place pour le distributeur de gauche');
  assert.ok(sides.width - (sides.ox + 7 * sides.cell) > sides.cell, 'place pour celui de droite');
  assert.equal(formatClock(125_000), '02:05');
  assert.equal(formatClock(400), '00:01');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(null), '--:--');
});

test('la pièce tenue suit le doigt sans pencher vers une case interdite', () => {
  const free = () => true;
  assert.deepEqual(lean({ x: 0.3, y: -0.2 }, free), { x: 0.3, y: -0.2 });
  assert.deepEqual(lean({ x: 2, y: 0 }, free), { x: 0.5, y: 0 });
  assert.deepEqual(lean({ x: 0.3, y: 0.2 }, (dx) => dx !== 1), { x: 0, y: 0.2 });
  assert.deepEqual(lean({ x: 0.3, y: 0.2 }, (dx, dy) => !(dx === 1 && dy === 1)), { x: 0.3, y: 0 });
});

// ==========================================================================
// Spécifications du prototype, sous les règles par défaut actuelles
// (contact par recouvrement, collecte pendant le glisser, autres couleurs
// bloquantes, distributeurs, chronomètre).
// ==========================================================================

const level1 = () => parseLevel(rush);
const typesOf = (events: EngineEvent[]) => events.map((ev) => ev.type);

test('1. placement initial : formes, positions, compteurs et distributeurs du niveau 1', () => {
  const lv = level1();
  assert.deepEqual([lv.width, lv.height, lv.number, lv.timerSeconds], [7, 8, 1, 180]);
  const e = new PuzzleEngine(lv);
  assert.equal(e.pieceList.length, 7);
  for (const raw of rush.pieces) {
    const expected = shapeCells(raw.shape).map((c) => ({ x: raw.x + c.x, y: raw.y + c.y }));
    assert.deepEqual(e.cellsOf(raw.id), expected, `cases de ${raw.id}`);
    assert.equal(e.piece(raw.id)!.remaining, raw.capacity, `compteur de ${raw.id}`);
  }
  // la capacité vient du JSON, pas du nombre de cases
  assert.equal(e.piece('violet')!.cells.length, 2);
  assert.equal(e.piece('violet')!.capacity, 3);
  assert.deepEqual(e.feederList.map((f) => [f.def.id, f.def.entry, f.pending.length]), [
    ['gauche', { x: 0, y: 2 }, 4],
    ['droite', { x: 6, y: 5 }, 3],
  ]);
  assert.equal(e.characterList.length, 16);
  assert.equal(e.peopleLeft, 23);
  assert.equal(e.timeLeftMs, 180_000);
  assert.deepEqual(levelWarnings(lv, e.rules), [], 'autant de places que de personnages, couleur par couleur');
});

test('2. aucun chevauchement initial ; un niveau qui en contient est refusé', () => {
  assertCoherent(new PuzzleEngine(level1()));
  const onPiece = { ...rush, characters: [...rush.characters, { color: 'red', x: 0, y: 6 }] };
  assert.throws(() => parseLevel(onPiece), (err: unknown) => err instanceof LevelError && err.errors.some((m) => m.includes('déjà prise')));
  const twoPieces = { ...rush, pieces: [...rush.pieces, { id: 'x', color: 'red', x: 1, y: 4, shape: ['#'] }] };
  assert.throws(() => parseLevel(twoPieces), LevelError);
  const badFeeder = { ...rush, feeders: [{ id: 'f', side: 'left', index: 9, queue: ['pink'] }] };
  assert.throws(() => parseLevel(badFeeder), (err: unknown) => {
    assert.ok(err instanceof LevelError);
    assert.ok(err.errors.some((m) => m.includes('hors de la grille')));
    assert.ok(err.errors.some((m) => m.includes('"pink"')));
    return true;
  });
});

test('3. déplacement limité à l’intérieur de la grille', () => {
  const e = engineNow({ pieces: [{ id: 'A', color: 'red', x: 2, y: 2, shape: ['##'] }] });
  e.grab('A');
  e.dragTo(-9, -9);
  assert.deepEqual(at(e, 'A'), { x: 0, y: 0 });
  e.dragTo(99, 99);
  assert.deepEqual(at(e, 'A'), { x: 3, y: 4 }, 'la pièce de 2 cases s’arrête au bord droit');
  e.release();
  assertCoherent(e);
});

test('4. blocage par une autre pièce', () => {
  const e = engineNow({
    pieces: [
      { id: 'A', color: 'red', x: 0, y: 0, shape: ['##'] },
      { id: 'B', color: 'blue', x: 3, y: 0, shape: ['#', '#'] },
    ],
  });
  e.grab('A');
  e.dragTo(4, 0);
  assert.deepEqual(at(e, 'A'), { x: 1, y: 0 });
  assert.equal(e.canPlace('A', 2, 0), false);
  e.release();
  assertCoherent(e);
});

test('5. un glissement rapide ne traverse ni pièce ni personnage, même vers un but lointain', () => {
  const e = engineNow({
    width: 7,
    height: 3,
    pieces: [
      { id: 'A', color: 'red', x: 0, y: 1, shape: ['#'] },
      { id: 'mur', color: 'blue', x: 2, y: 0, shape: ['#', '#', '#'] },
    ],
    characters: [{ color: 'blue', x: 5, y: 1 }],
  });
  e.grab('A');
  const events = e.dragTo(6, 1); // un seul appel, cinq cases plus loin
  assert.deepEqual(at(e, 'A'), { x: 1, y: 1 });
  assert.ok(events.every((ev) => ev.type !== 'moved' || ev.to.x < 2), 'aucun pas au-delà du mur');
  e.release();

  const f = engineNow({ width: 7, height: 1, pieces: [{ id: 'A', color: 'red', x: 0, y: 0, shape: ['#'] }], characters: [{ color: 'blue', x: 3, y: 0 }] });
  f.grab('A');
  f.dragTo(6, 0);
  assert.deepEqual(at(f, 'A'), { x: 2, y: 0 }, 'le personnage bleu arrête la pièce rouge (H5 par défaut)');
});

test('6. collecte d’un personnage compatible : dès que la pièce le recouvre, en plein glisser', () => {
  const e = engineNow({
    width: 5,
    height: 1,
    pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'], capacity: 2 }],
    characters: [{ id: 'r1', color: 'red', x: 2, y: 0 }],
  });
  e.grab('R');
  assert.deepEqual(typesOf(e.dragTo(1, 0)), ['moved'], 'voisin seulement : rien');
  const events = e.dragTo(4, 0); // passe sur (2, 0) sans s'y arrêter
  assert.deepEqual(typesOf(events), ['moved', 'collected', 'moved', 'moved']);
  assert.equal(e.characterList[0].collectedBy, 'R');
  assert.equal(e.draggedId, 'R', 'toujours tenue');
  assert.deepEqual(typesOf(e.release()), [], 'rien de plus au lâcher');
  assert.equal(e.piece('R')!.remaining, 1);
});

test('7. personnage d’une autre couleur : jamais collecté ; bloquant par défaut, traversable si H5 le permet', () => {
  const setup = {
    width: 5,
    height: 1,
    pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'], capacity: 1 }],
    characters: [{ id: 'b', color: 'blue', x: 2, y: 0 }, { id: 'r', color: 'red', x: 4, y: 0 }],
  };
  const blocked = engineNow(setup);
  blocked.grab('R');
  blocked.dragTo(4, 0);
  assert.deepEqual(at(blocked, 'R'), { x: 1, y: 0 });
  assert.equal(blocked.characterList[0].collectedBy, null);

  const through = engineNow(setup, { charactersBlock: 'none' });
  through.grab('R');
  const events = through.dragTo(4, 0);
  assert.equal(through.characterList[0].collectedBy, null, 'le bleu reste sur place');
  assert.equal(through.characterList[1].collectedBy, 'R', 'le rouge est pris');
  assert.deepEqual(typesOf(events).filter((t) => t !== 'moved'), ['collected', 'full', 'removed']);
  assert.equal(through.isWon, false, 'le bleu attend toujours : pas de victoire');
});

test('8. le compteur baisse d’une unité par personnage embarqué', () => {
  const e = engineNow({
    width: 5,
    height: 1,
    pieces: [{ id: 'R', color: 'red', x: 0, y: 0, shape: ['#'], capacity: 4 }],
    characters: [1, 2, 3].map((x) => ({ color: 'red', x, y: 0 })),
  });
  e.grab('R');
  const seen: number[] = [];
  for (const x of [1, 2, 3]) {
    const ev = e.dragTo(x, 0).find((v) => v.type === 'collected');
    assert.ok(ev && ev.type === 'collected');
    seen.push(e.piece('R')!.remaining);
    assert.equal(ev.capacity - ev.load, e.piece('R')!.remaining);
  }
  assert.deepEqual(seen, [3, 2, 1]);
});

test('9. une pièce dont le compteur atteint zéro disparaît et libère ses cases', () => {
  const e = engineNow({
    width: 4,
    height: 2,
    pieces: [
      { id: 'R', color: 'red', x: 0, y: 0, shape: ['##'], capacity: 1 },
      { id: 'B', color: 'blue', x: 3, y: 0, shape: ['#'], capacity: 1 },
    ],
    characters: [{ color: 'red', x: 0, y: 1 }, { color: 'blue', x: 3, y: 1 }],
  });
  e.grab('R');
  const events = e.dragTo(0, 1);
  assert.deepEqual(typesOf(events), ['moved', 'collected', 'full', 'removed']);
  assert.equal(e.piece('R')!.removed, true);
  assert.equal(e.draggedId, null, 'le geste se termine avec la pièce');
  assert.equal(e.pieceAt(0, 1), null);
  assert.equal(e.pieceAt(1, 1), null);
  move(e, 'B', 0, 0);
  assert.deepEqual(at(e, 'B'), { x: 0, y: 0 }, 'B passe là où était R');
});

test('10. distributeurs : la file avance tant que la tête est de la couleur de la pièce posée sur l’entrée', () => {
  const setup = {
    width: 4,
    height: 3,
    pieces: [
      { id: 'R', color: 'red', x: 2, y: 1, shape: ['#'], capacity: 3 },
      { id: 'B', color: 'blue', x: 3, y: 2, shape: ['#'], capacity: 1 },
    ],
    feeders: [{ id: 'f', side: 'left' as const, index: 1, queue: ['red', 'red', 'blue', 'red'] }],
  };
  const e = engineNow(setup);
  e.grab('R');
  assert.deepEqual(typesOf(e.dragTo(1, 1)), ['moved'], 'à côté de l’entrée : rien');
  const fed = e.dragTo(0, 1).find((v) => v.type === 'collected');
  assert.deepEqual(fed, { type: 'collected', pieceId: 'R', characterIds: ['f#1', 'f#2'], load: 2, capacity: 3, feederId: 'f' });
  assert.deepEqual(e.feederList[0].pending, ['blue', 'red'], 'le bleu reste en tête');
  e.dragTo(0, 0);
  e.dragTo(0, 1); // repasse sur l'entrée : la tête est bleue, rien ne sort
  assert.equal(e.piece('R')!.remaining, 1);
  e.dragTo(0, 0);
  e.release();
  move(e, 'B', 0, 1); // le bleu sort dans la pièce bleue, qui disparaît
  assert.equal(e.piece('B')!.removed, true);
  assert.deepEqual(e.feederList[0].pending, ['red']);
  move(e, 'R', 0, 1);
  assert.deepEqual(e.feederList[0].pending, []);
  assert.equal(e.isWon, true);

  const one = engineNow(setup, { feederBatch: 'one' });
  move(one, 'R', 0, 1);
  assert.deepEqual(one.feederList[0].pending, ['red', 'blue', 'red'], 'H9 « one » : un seul par passage, lâcher compris');
  one.grab('R');
  one.dragTo(1, 1);
  one.dragTo(0, 1); // nouveau passage
  one.release();
  assert.deepEqual(one.feederList[0].pending, ['blue', 'red']);

  const small = engineNow({ ...setup, pieces: [{ ...setup.pieces[0], capacity: 1 }] });
  move(small, 'R', 0, 1);
  assert.deepEqual(small.feederList[0].pending, ['red', 'blue', 'red'], 'jamais plus que les places libres');
});

test('11. victoire : toutes les pièces disparues et les distributeurs vidés, pas avant', () => {
  const setup = {
    width: 3,
    height: 2,
    timerSeconds: 60,
    pieces: [{ id: 'R', color: 'red', x: 2, y: 1, shape: ['#'], capacity: 2 }],
    characters: [{ color: 'red', x: 1, y: 1 }],
    feeders: [{ id: 'haut', side: 'top' as const, index: 0, queue: ['red'] }],
  };
  const e = engineNow(setup);
  move(e, 'R', 1, 1);
  assert.equal(e.isWon, false, 'il reste un personnage dans le distributeur');
  const events = move(e, 'R', 0, 0);
  assert.deepEqual(typesOf(events).filter((t) => t !== 'moved' && t !== 'clock-started'), ['collected', 'full', 'removed', 'won']);
  assert.deepEqual(events.at(-1), { type: 'won', moves: 2, timeLeftMs: 60_000 });

  // pièce pleine et retirée, mais un personnage attend encore au distributeur : pas de victoire
  const stuck = engineNow({ ...setup, pieces: [{ ...setup.pieces[0], capacity: 1 }] });
  move(stuck, 'R', 1, 1);
  assert.equal(stuck.piece('R')!.removed, true);
  assert.equal(stuck.isWon, false);
  assert.equal(stuck.peopleLeft, 1);
});

test('12. défaite quand le chronomètre atteint zéro ; départ au premier déplacement ; pause', () => {
  const setup = { width: 3, height: 1, timerSeconds: 2, pieces: [{ id: 'A', color: 'red', x: 0, y: 0, shape: ['#'] }] };
  const e = engineNow(setup);
  assert.deepEqual(e.tick(5000), []);
  assert.equal(e.timeLeftMs, 2000, 'H10 : rien ne décompte avant le premier déplacement');
  e.grab('A');
  assert.deepEqual(typesOf(e.dragTo(1, 0)), ['moved', 'clock-started']);
  e.release();
  e.tick(1500);
  assert.equal(e.timeLeftMs, 500);
  assert.equal(e.pause(), true);
  assert.equal(e.grab('A'), false, 'pas de geste en pause');
  e.tick(1000);
  assert.equal(e.timeLeftMs, 500, 'la pause arrête le temps');
  e.resume();
  e.grab('A');
  assert.deepEqual(e.tick(600), [{ type: 'lost', moves: 1 }]);
  assert.equal(e.isLost, true);
  assert.equal(e.draggedId, null, 'le geste en cours est abandonné');
  assert.equal(e.timeLeftMs, 0);
  assert.equal(e.grab('A'), false);
  assert.deepEqual(e.tick(1000), [], 'une seule défaite');

  const immediate = engineNow(setup, { timerStart: 'immediate' });
  assert.deepEqual(immediate.tick(2500), [{ type: 'lost', moves: 0 }]);

  const frozen = new PuzzleEngine(parseLevel(level(setup)), { timerStart: 'immediate' }, { timer: false });
  assert.deepEqual(frozen.tick(10_000), [], 'chronomètre désactivé (DEBUG)');
  assert.equal(frozen.timeLeftMs, 2000);
});

test('13. réinitialisation : pièces, personnages, distributeurs, chronomètre, pause', () => {
  const e = new PuzzleEngine(level1());
  const start = JSON.stringify(e.snapshot());
  const plan = solve(e.clone()).steps.slice(0, 8);
  replay(e, plan);
  e.tick(30_000);
  e.pause();
  assert.notEqual(JSON.stringify(e.snapshot()), start);
  assert.ok(e.peopleLeft < 23);
  e.reset();
  assert.equal(JSON.stringify(e.snapshot()), start);
  assert.deepEqual([e.peopleLeft, e.timeLeftMs, e.isPaused, e.isWon, e.isLost, e.moveCount], [23, 180_000, false, false, false, 0]);
  assert.deepEqual(e.feederList.map((f) => f.pending.length), [4, 3]);
  assertCoherent(e);
});

test('pas de double collecte quand un glisser repasse sur les mêmes cases ou la même entrée', () => {
  const e = engineNow({
    width: 4,
    height: 2,
    pieces: [{ id: 'R', color: 'red', x: 3, y: 0, shape: ['#'], capacity: 5 }],
    characters: [{ id: 'r', color: 'red', x: 2, y: 0 }],
    feeders: [{ id: 'f', side: 'left', index: 0, queue: ['red', 'blue'] }],
  });
  e.grab('R');
  const all: EngineEvent[] = [];
  for (let i = 0; i < 4; i++) all.push(...e.dragTo(0, 0), ...e.dragTo(3, 0));
  all.push(...e.release());
  const collected = all.filter((v) => v.type === 'collected');
  assert.equal(collected.length, 2, 'une fois le personnage, une fois le distributeur');
  assert.deepEqual(e.piece('R')!.passengers, ['r', 'f#1']);
  assert.equal(e.piece('R')!.remaining, 3);
});

test('déplacement manuel (DEBUG) : mêmes collisions et même collecte qu’un glisser', () => {
  const e = engineNow({
    width: 3,
    height: 2,
    pieces: [
      { id: 'R', color: 'red', x: 0, y: 0, shape: ['#'], capacity: 2 },
      { id: 'B', color: 'blue', x: 1, y: 0, shape: ['#'] },
    ],
    characters: [{ color: 'red', x: 0, y: 1 }],
  });
  assert.deepEqual(e.nudge('R', 1, 0), [], 'B bloque');
  assert.deepEqual(at(e, 'R'), { x: 0, y: 0 });
  assert.deepEqual(typesOf(e.nudge('R', 0, 1)), ['moved', 'collected']);
  assert.equal(e.piece('R')!.remaining, 1);
  assert.equal(e.moveCount, 1);
});

test('des milliers de gestes au hasard dans le niveau 1 gardent un état cohérent', () => {
  const rand = seeded(43);
  for (const rules of [{}, { charactersBlock: 'none' }, { collectOn: 'release' }] as Partial<Rules>[]) {
    const e = new PuzzleEngine(level1(), rules);
    for (let i = 0; i < 1500; i++) {
      const live = e.pieceList.filter((p) => !p.removed && !p.full);
      if (e.isWon || live.length === 0) {
        e.reset();
        continue;
      }
      const p = live[Math.floor(rand() * live.length)];
      if (!e.grab(p.id)) continue;
      for (let k = 0; k < 3 && e.draggedId; k++) {
        e.dragTo(Math.floor(rand() * 11) - 2, Math.floor(rand() * 12) - 2);
        assertCoherent(e);
      }
      e.release();
      assertCoherent(e);
      let aboard = 0;
      for (const q of e.pieceList) {
        assert.equal(q.remaining, q.capacity - q.passengers.length);
        assert.ok(q.remaining >= 0);
        assert.equal(new Set(q.passengers).size, q.passengers.length, 'aucun passager en double');
        aboard += q.passengers.length;
      }
      assert.equal(aboard + e.peopleLeft, 23, 'personne ne se perd ni ne se dédouble');
    }
  }
});

test('le niveau 1 se gagne avec de vrais gestes, sous les règles par défaut comme sous leurs variantes', () => {
  const variants: Partial<Rules>[] = [
    {},
    { charactersBlock: 'none' },
    { collectOn: 'release' },
    { contact: 'side', charactersBlock: 'all', collectOn: 'release' },
    { feederBatch: 'one' },
  ];
  for (const rules of variants) {
    const result = solve(new PuzzleEngine(level1(), rules));
    assert.ok(result.solved, `faisable avec ${JSON.stringify(rules)}`);
    const e = new PuzzleEngine(level1(), rules);
    const events = replay(e, result.steps);
    assert.ok(e.isWon, `rejeu gagnant avec ${JSON.stringify(rules)}`);
    assert.equal(events.filter((v) => v.type === 'won').length, 1);
    assert.equal(e.peopleLeft, 0);
    assert.ok(e.pieceList.every((p) => p.removed));
  }
});
