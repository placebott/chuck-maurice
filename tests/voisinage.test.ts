/**
 * Règles et équilibrage de MAURIIIIICE !!! (mission 004).
 * Lancement : npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DUEL, MEDAL_RULES, SCORE, actOf } from '../src/voisinage/config/balance';
import { HoldState } from '../src/voisinage/input';
import { emptySave } from '../src/voisinage/save';
import { Duel, type DuelEvent } from '../src/voisinage/systems/duel';
import { MEDALS, awardMedals, type Summary } from '../src/voisinage/systems/medals';
import { scoreLines, totalScore } from '../src/voisinage/systems/score';
import { Watcher } from '../src/voisinage/systems/watch';

const FRAME = 1 / 60;

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

interface Bot {
  /** Délai avant de rappuyer quand Jean-Mi tourne le dos. */
  press: number;
  /** Délai avant de relâcher après le début de l'avertissement. */
  release: number;
}

interface Run {
  duel: Duel;
  events: DuelEvent[];
  /** Temps réel écoulé, pauses comprises. */
  wall: number;
}

/** Joue une partie entière avec un joueur simulé. */
function play(bot: Bot, seed = 1): Run {
  const duel = new Duel(seeded(seed));
  const events: DuelEvent[] = [];
  let held = false;
  let sinceBack = 0;
  let sinceWarn = 0;
  let wall = 0;
  while (!duel.ending && wall < 200) {
    if (duel.paused) {
      held = false;
      sinceBack = 0;
    } else if (duel.watch === 'back') {
      sinceBack += FRAME;
      sinceWarn = 0;
      held = sinceBack >= bot.press;
    } else if (duel.watch === 'warning') {
      sinceWarn += FRAME;
      if (sinceWarn >= bot.release) held = false;
    } else {
      // un joueur trop lent a encore le doigt posé quand Jean-Mi regarde
      sinceBack = 0;
      sinceWarn += FRAME;
      if (sinceWarn >= bot.release) held = false;
    }
    events.push(...duel.update(FRAME, held));
    wall += FRAME;
  }
  return { duel, events, wall };
}

/** Avance jusqu'à ce que `until` soit vrai. */
function run(duel: Duel, held: boolean | (() => boolean), until: () => boolean, max = 60): DuelEvent[] {
  const events: DuelEvent[] = [];
  for (let t = 0; t < max && !until() && !duel.ending; t += FRAME) {
    events.push(...duel.update(FRAME, typeof held === 'function' ? held() : held));
  }
  return events;
}

const types = (events: DuelEvent[]) => events.map((e) => e.type);
const summary = (over: Partial<Summary> = {}): Summary => ({
  kind: 'victory', rage: 100, timeLeft: 5, strikes: 1, perfects: 0, sawShort: false, ...over,
});

// ---------------------------------------------------------------- surveillance
test('surveillance : dos tourné → avertissement → regard → dos tourné', () => {
  const w = new Watcher(seeded(3));
  w.turnAway(1, true);
  const seen: string[] = [w.state];
  for (let t = 0; t < 12; t += FRAME) {
    const next = w.update(FRAME, 1);
    if (next) seen.push(next);
  }
  assert.deepEqual(seen.slice(0, 7), ['back', 'warning', 'watching', 'back', 'warning', 'watching', 'back']);
});

test("un regard est toujours précédé d'un avertissement complet", () => {
  for (const act of [1, 2, 3] as const) {
    const w = new Watcher(seeded(act));
    w.turnAway(act);
    let warned = 0;
    for (let t = 0; t < 30; t += FRAME) {
      if (w.state === 'warning') warned += FRAME;
      const next = w.update(FRAME, act);
      if (next === 'watching') {
        assert.ok(warned >= DUEL.acts[act - 1].warning - FRAME, `acte ${act} : avertissement de ${warned.toFixed(3)} s`);
        warned = 0;
      }
    }
  }
});

test("l'avertissement reste jouable au doigt et raccourcit d'acte en acte", () => {
  const [a, b, c] = DUEL.acts.map((t) => t.warning);
  assert.ok(a > b && b > c, 'avertissements décroissants');
  assert.ok(c >= 0.35, "l'avertissement le plus court laisse le temps de réagir sur téléphone");
  assert.ok(DUEL.acts[0].back[0] > DUEL.acts[2].back[1], 'les retournements sont plus fréquents à la fin');
});

// ---------------------------------------------------------------- colère et chronomètre
test('la colère ne monte que bouton maintenu et ne redescend jamais', () => {
  const duel = new Duel(seeded(1));
  run(duel, false, () => duel.elapsed >= 1);
  assert.equal(duel.rage, 0);
  let last = 0;
  const { duel: d } = play({ press: 0.2, release: 0.2 });
  assert.ok(d.rage > 0);
  const again = new Duel(seeded(1));
  for (let t = 0; t < 20; t += FRAME) {
    again.update(FRAME, again.watch === 'back');
    assert.ok(again.rage >= last, 'la colère a baissé');
    last = again.rage;
  }
});

test('maintenir pendant le dos tourné fait travailler Chuck', () => {
  const duel = new Duel(seeded(1));
  duel.update(FRAME, true);
  assert.equal(duel.working, true);
  duel.update(FRAME, false);
  assert.equal(duel.working, false);
});

test('les actes s\'enchaînent seuls à 33 % puis 80 %', () => {
  const { events, duel } = play({ press: 0.2, release: 0.2 });
  const acts = events.filter((e) => e.type === 'milestone').map((e) => (e as { act: number }).act);
  assert.deepEqual(acts, [2, 3]);
  assert.equal(duel.ending, 'victory');
  assert.equal(actOf(0), 1);
  assert.equal(actOf(33), 2);
  assert.equal(actOf(80), 3);
});

test("un changement d'acte fige le jeu, puis exige de rappuyer", () => {
  const duel = new Duel(seeded(1));
  const events = run(duel, () => duel.watch === 'back', () => duel.act === 2);
  assert.equal(events.at(-1)?.type, 'milestone');
  assert.equal(duel.rage, DUEL.thresholds[0]);
  assert.equal(duel.watch, 'back', 'Jean-Mi repart dos tourné');
  const t0 = duel.timeLeft;
  // bouton resté enfoncé pendant toute la transition, et après
  const after = run(duel, true, () => !duel.paused);
  assert.deepEqual(types(after), ['resume']);
  assert.equal(duel.timeLeft, t0, 'la transition ne consomme pas le chronomètre');
  for (let i = 0; i < 30; i++) duel.update(FRAME, true);
  assert.equal(duel.rage, DUEL.thresholds[0], 'un appui antérieur à la transition ne compte pas');
  duel.update(FRAME, false);
  for (let i = 0; i < 6; i++) duel.update(FRAME, true);
  assert.ok(duel.rage > DUEL.thresholds[0], 'après relâchement, le maintien compte à nouveau');
});

test('alerte dramatique à 95 %, une seule fois', () => {
  const { events } = play({ press: 0.2, release: 0.2 });
  assert.equal(events.filter((e) => e.type === 'alert').length, 1);
});

test('victoire à 100 % de colère', () => {
  const { duel, events } = play({ press: 0.25, release: 0.2 });
  assert.equal(duel.ending, 'victory');
  assert.equal(duel.rage, 100);
  assert.deepEqual(events.at(-1), { type: 'end', kind: 'victory' });
  assert.deepEqual(duel.update(FRAME, true), [], 'plus rien après la fin');
});

test('défaite au chronomètre si la colère n\'atteint pas 100 %', () => {
  const duel = new Duel(seeded(1));
  const events = run(duel, false, () => false);
  assert.equal(duel.ending, 'timeout');
  assert.equal(duel.timeLeft, 0);
  assert.deepEqual(events.at(-1), { type: 'end', kind: 'timeout' });
  assert.ok(Math.abs(duel.elapsed - DUEL.duration) < 1e-9);
});

// ---------------------------------------------------------------- flagrants délits
test('maintenir pendant le regard : un flagrant délit, puis une pause', () => {
  const duel = new Duel(seeded(1));
  const events = run(duel, true, () => duel.strikes > 0);
  assert.deepEqual(types(events).filter((t) => t !== 'perfect'), ['watch', 'watch', 'caught']);
  assert.equal(duel.strikes, 1);
  assert.equal(duel.paused, true);
  assert.equal(duel.working, false);
});

test('jamais de détection sans avertissement préalable', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const duel = new Duel(seeded(seed));
    let warned = false;
    for (let t = 0; t < 60 && !duel.ending; t += FRAME) {
      for (const e of duel.update(FRAME, true)) {
        if (e.type === 'watch' && e.state === 'warning') warned = true;
        if (e.type === 'watch' && e.state === 'back') warned = false;
        if (e.type === 'caught') assert.ok(warned, `graine ${seed} : pris sans avertissement`);
      }
    }
  }
});

test('pas de double détection : bouton bloqué = une seule erreur par regard', () => {
  const duel = new Duel(seeded(2));
  const events = run(duel, true, () => duel.strikes > 0);
  assert.equal(events.filter((e) => e.type === 'caught').length, 1);
  // le bouton reste enfoncé pendant la pause et tout le reste du regard
  const rest = run(duel, true, () => !duel.paused && duel.watch === 'back');
  assert.equal(rest.filter((e) => e.type === 'caught').length, 0);
  assert.equal(duel.strikes, 1);
  // même en relâchant puis en rappuyant pendant ce même regard
  const d2 = new Duel(seeded(2));
  run(d2, true, () => d2.strikes > 0);
  run(d2, false, () => !d2.paused);
  assert.equal(d2.watch, 'watching', 'Jean-Mi continue de fixer Chuck après la pause');
  const spam = run(d2, (() => { let i = 0; return () => i++ % 4 < 2; })(), () => d2.watch === 'back');
  assert.equal(spam.filter((e) => e.type === 'caught').length, 0);
  assert.equal(d2.strikes, 1);
});

test('un flagrant délit ne fait pas gagner de temps : le regard recommence', () => {
  const duel = new Duel(seeded(4));
  run(duel, true, () => duel.strikes > 0);
  const rage = duel.rage;
  const t0 = duel.timeLeft;
  run(duel, true, () => !duel.paused);
  assert.equal(duel.timeLeft, t0, 'la pause comique ne consomme pas le chronomètre');
  run(duel, true, () => duel.watch === 'back');
  assert.equal(duel.rage, rage, 'rien ne se gagne sous le regard de Jean-Mi');
  assert.ok(t0 - duel.timeLeft >= DUEL.acts[0].watch[0] - 2 * FRAME, 'le regard est rejoué en entier');
});

test('petite tolérance au tout début du regard', () => {
  const duel = new Duel(seeded(5));
  run(duel, true, () => duel.watch === 'watching');
  // relâché une frame après le début du regard : pardonné
  duel.update(FRAME, true);
  assert.equal(duel.strikes, 0);
  run(duel, false, () => duel.watch === 'back');
  assert.equal(duel.strikes, 0);
});

test('trois flagrants délits : défaite', () => {
  const duel = new Duel(seeded(1));
  const events: DuelEvent[] = [];
  let held = true;
  for (let t = 0; t < 120 && !duel.ending; t += FRAME) {
    // relâche pendant chaque pause, rappuie ensuite
    held = !duel.paused;
    events.push(...duel.update(FRAME, held));
  }
  assert.equal(duel.ending, 'busted');
  assert.equal(duel.strikes, DUEL.maxStrikes);
  assert.deepEqual(events.slice(-2), [{ type: 'caught', strikes: 3 }, { type: 'end', kind: 'busted' }]);
});

// ---------------------------------------------------------------- timing parfait
test('relâcher juste avant le regard : bonus de timing', () => {
  const duel = new Duel(seeded(1));
  run(duel, true, () => duel.watch === 'warning' && duel.watchRemaining <= DUEL.perfectWindow / 2);
  const events = duel.update(FRAME, false);
  assert.deepEqual(events, [{ type: 'perfect', count: 1 }]);
  assert.equal(duel.perfects, 1);
});

test('relâcher trop tôt, ou après un maintien trop bref : pas de bonus', () => {
  const early = new Duel(seeded(1));
  run(early, true, () => early.watch === 'warning');
  early.update(FRAME, false);
  assert.equal(early.perfects, 0, 'relâché au début de l\'avertissement');

  const brief = new Duel(seeded(1));
  run(brief, false, () => brief.watch === 'warning' && brief.watchRemaining <= DUEL.perfectWindow - 0.05);
  // tapotements répétés pendant la fin de l'avertissement
  for (let i = 0; i < 6 && brief.watch === 'warning'; i++) brief.update(FRAME, i % 2 === 0);
  assert.equal(brief.perfects, 0, 'un appui bref ne suffit pas');
});

test('un seul bonus par avertissement', () => {
  const duel = new Duel(seeded(1));
  run(duel, true, () => duel.watch === 'warning' && duel.watchRemaining <= DUEL.perfectWindow - 0.02);
  duel.update(FRAME, false);
  duel.update(FRAME, true);
  duel.update(FRAME, false);
  assert.equal(duel.perfects, 1);
});

// ---------------------------------------------------------------- équilibrage
test('équilibrage : un joueur attentif gagne, sans exploit requis', () => {
  // réflexes ordinaires : 0,3 s pour rappuyer, relâche 0,2 s après l'alerte
  for (let seed = 1; seed <= 40; seed++) {
    const { duel } = play({ press: 0.3, release: 0.2 }, seed);
    assert.equal(duel.ending, 'victory', `graine ${seed}`);
    assert.equal(duel.strikes, 0);
    assert.ok(duel.timeLeft >= 2, `graine ${seed} : ${duel.timeLeft.toFixed(1)} s de marge`);
  }
});

test('équilibrage : ROI DU LOTISSEMENT demande un très bon joueur', () => {
  let expert = 0;
  let ordinary = 0;
  for (let seed = 1; seed <= 40; seed++) {
    if (play({ press: 0.12, release: 0.3 }, seed).duel.timeLeft >= MEDAL_RULES.kingSeconds) expert++;
    if (play({ press: 0.45, release: 0.15 }, seed).duel.timeLeft >= MEDAL_RULES.kingSeconds) ordinary++;
  }
  assert.ok(expert >= 30, `expert : ${expert}/40`);
  assert.ok(ordinary <= 4, `joueur ordinaire : ${ordinary}/40`);
});

test('équilibrage : un joueur lent ou distrait perd au chronomètre', () => {
  let lost = 0;
  for (let seed = 1; seed <= 40; seed++) if (play({ press: 1.0, release: 0.1 }, seed).duel.ending === 'timeout') lost++;
  assert.ok(lost >= 36, `${lost}/40`);
});

test('équilibrage : relâcher trop tard se paie', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { duel } = play({ press: 0.3, release: 0.9 }, seed);
    assert.equal(duel.ending, 'busted', `graine ${seed}`);
  }
});

test('la partie dure au plus 35 secondes de jeu actif', () => {
  assert.equal(DUEL.duration, 35);
  const { duel, wall } = play({ press: 1.0, release: 0.1 });
  assert.ok(duel.elapsed <= DUEL.duration + 1e-9);
  assert.ok(wall >= duel.elapsed, 'les transitions s\'ajoutent au temps réel, pas au chronomètre');
});

// ---------------------------------------------------------------- score
test('barème : mission, secondes, sans-faute, timing', () => {
  const lines = scoreLines({ kind: 'victory', rage: 100, timeLeft: 7.9, strikes: 0, perfects: 2 });
  assert.deepEqual(lines.map((l) => l.points), [SCORE.mission, 7 * SCORE.perSecond, SCORE.clean, 2 * SCORE.perfect]);
  assert.equal(totalScore({ kind: 'victory', rage: 100, timeLeft: 7.9, strikes: 0, perfects: 2 }), 3100);
  assert.equal(totalScore({ kind: 'victory', rage: 100, timeLeft: 0.4, strikes: 2, perfects: 0 }), 1000);
});

test('une défaite ne rapporte ni prime de mission ni prime sans-faute', () => {
  const o = { kind: 'timeout', rage: 64.9, timeLeft: 0, strikes: 0, perfects: 1 } as const;
  assert.equal(totalScore(o), 64 * SCORE.perRage + SCORE.perfect);
  assert.ok(totalScore(o) < SCORE.mission);
});

// ---------------------------------------------------------------- médailles et sauvegarde
test('médailles : conditions', () => {
  const ids = (s: Summary) => MEDALS.filter((m) => m.earned(emptySave(), s)).map((m) => m.id);
  assert.deepEqual(ids(summary()), ['war']);
  assert.deepEqual(ids(summary({ strikes: 0 })), ['unseen', 'war']);
  assert.deepEqual(ids(summary({ timeLeft: 10 })), ['king', 'war']);
  assert.deepEqual(ids(summary({ timeLeft: 9.99 })), ['war']);
  assert.deepEqual(ids(summary({ sawShort: true })), ['war', 'short']);
  assert.deepEqual(ids(summary({ kind: 'busted', rage: 50, strikes: 3, perfects: 1 })), ['sunday']);
  assert.deepEqual(ids(summary({ kind: 'timeout', rage: 99, timeLeft: 0, strikes: 0 })), []);
  assert.equal(MEDALS.length, 5);
});

test('médailles : attribuées une seule fois, en deux temps pour la cinématique', () => {
  const save = emptySave();
  const s = summary({ strikes: 0 });
  assert.deepEqual(awardMedals(save, s).map((m) => m.id), ['unseen', 'war']);
  assert.deepEqual(awardMedals(save, { ...s, sawShort: true }).map((m) => m.id), ['short']);
  assert.deepEqual(awardMedals(save, { ...s, sawShort: true }), []);
  assert.deepEqual(save.medals, ['unseen', 'war', 'short']);
});

// ---------------------------------------------------------------- commande
test('commande : maintien et relâchement, plusieurs sources', () => {
  const h = new HoldState();
  const log: boolean[] = [];
  h.onChange = (v) => log.push(v);
  h.press('space');
  h.press('p1');
  assert.equal(h.held, true);
  h.release('space');
  assert.equal(h.held, true, 'le doigt est encore posé');
  h.release('p1');
  assert.equal(h.held, false);
  assert.deepEqual(log, [true, false]);
});

test('commande : une réinitialisation impose de relâcher puis de rappuyer', () => {
  const h = new HoldState();
  h.press('p1');
  h.reset();
  assert.equal(h.held, false, 'un appui antérieur ne compte plus');
  h.press('p1');
  assert.equal(h.held, true, 'un nouvel appui compte');
  h.reset();
  h.release('p1');
  h.press('p1');
  assert.equal(h.held, true);
});

test('commande : perte de focus = tout est relâché', () => {
  const h = new HoldState();
  h.press('space');
  h.press('p3');
  h.releaseAll();
  assert.equal(h.held, false);
  h.release('p3');
  assert.equal(h.held, false);
});
