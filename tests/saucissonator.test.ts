/**
 * Règles de Saucissonator 3000 + équilibrage par joueurs simulés.
 * Lancement : npm test   (esbuild regroupe le fichier, node:test l'exécute)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CUT, MAX_BAD, feedSpeed, judgeCut } from '../src/saucissonator/config/balance';
import { Session } from '../src/saucissonator/systems/session';
import { MEDALS, awardMedals, type MissionSummary } from '../src/saucissonator/systems/medals';
import type { SaucissonSave } from '../src/saucissonator/save';

const DT = 1 / 120;

/** Avance jusqu'à ce que le saucisson dépasse de `target` px, puis coupe. */
function cutAt(s: Session, target: number) {
  while (!s.ending && s.thickness < target) s.update(DT);
  return s.ending ? null : s.cut();
}

function play(targets: number[]): Session {
  const s = new Session();
  for (const t of targets) {
    if (s.ending) break;
    cutAt(s, t);
  }
  return s;
}

const summary = (s: Session): MissionSummary => ({
  kind: s.ending!.kind,
  timeLeft: s.timeLeft,
  elapsed: s.elapsed,
  score: s.score,
  counts: s.counts,
  bestStreak: s.bestStreak,
});

const emptySave = (): SaucissonSave => ({
  best: 0, bestTime: null, plays: 0, wins: 0, thick: 0, dog: 0, nuclear: 0,
  slices: 0, perfectSlices: 0, bestStreak: 0, medals: [],
});

test("le verdict dépend de l'épaisseur mesurée", () => {
  assert.equal(judgeCut(CUT.ideal), 'perfect');
  assert.equal(judgeCut(CUT.ideal + CUT.perfectTol), 'perfect');
  assert.equal(judgeCut(CUT.ideal - CUT.perfectTol), 'perfect');
  assert.equal(judgeCut(CUT.ideal + CUT.perfectTol + 0.5), 'good');
  assert.equal(judgeCut(CUT.ideal - CUT.goodTol), 'good');
  assert.equal(judgeCut(CUT.ideal - CUT.goodTol - 0.5), 'thin');
  assert.equal(judgeCut(0), 'thin');
  assert.equal(judgeCut(CUT.ideal + CUT.goodTol + 0.5), 'thick');
  assert.equal(judgeCut(CUT.disaster), 'disaster');
});

test('la vitesse augmente progressivement', () => {
  assert.ok(feedSpeed(CUT.duration, 5) > feedSpeed(CUT.duration / 2, 5));
  assert.ok(feedSpeed(CUT.duration / 2, 5) > feedSpeed(0, 5));
  // … et le saucisson glisse de plus en plus vite à mesure qu'il dépasse
  assert.ok(feedSpeed(0, CUT.ideal) > feedSpeed(0, 0) * 3);
});

test("l'épaisseur de la rondelle est celle du saucisson qui dépasse au moment de la coupe", () => {
  const s = new Session();
  const r = cutAt(s, 11.3)!;
  assert.ok(Math.abs(r.thickness - 11.3) < 0.2, String(r.thickness));
  assert.equal(s.thickness, 0);
  assert.ok(Math.abs(s.consumed - r.thickness) < 1e-9);
});

test('barème : 500 / 250 / 100 / 50', () => {
  const s = play([CUT.ideal, CUT.ideal + 4, CUT.ideal + 8, 3]);
  assert.deepEqual(s.cuts.map((c) => c.quality), ['perfect', 'good', 'thick', 'thin']);
  assert.deepEqual(s.cuts.map((c) => c.points), [500, 250, 100, 50]);
  assert.equal(s.score, 900);
});

test('trois coupes parfaites consécutives : bonus de 500 et mode tactique', () => {
  const s = play([CUT.ideal, CUT.ideal, CUT.ideal]);
  assert.deepEqual(s.cuts.map((c) => c.bonus), [0, 0, 500]);
  assert.equal(s.score, 2000);
  assert.ok(s.tactical);
  cutAt(s, CUT.ideal + 4); // une coupe seulement correcte casse la série
  assert.equal(s.streak, 0);
  assert.ok(!s.tactical);
});

test('douze coupes parfaites : victoire, 8 000 points, médaille de maître charcutier', () => {
  const s = play(Array(12).fill(CUT.ideal));
  assert.deepEqual(s.ending, { kind: 'victory', reason: 'complete' });
  assert.equal(s.score, 12 * 500 + 4 * 500);
  assert.ok(s.timeLeft > 3, `marge de temps trop faible : ${s.timeLeft.toFixed(1)} s`);
  const fresh = awardMedals(emptySave(), summary(s));
  assert.deepEqual(fresh.map((m) => m.id), ['master']);
});

test('victoire possible avec exactement huit bonnes coupes', () => {
  const s = play([...Array(4).fill(3), ...Array(8).fill(CUT.ideal)]);
  assert.equal(s.ending?.kind, 'victory');
  assert.equal(s.good, CUT.minGood);
});

test('trop de rondelles épaisses : le parpaing de porc, dès que la victoire est perdue', () => {
  const s = play(Array(12).fill(CUT.ideal + CUT.goodTol + 2));
  assert.deepEqual(s.ending, { kind: 'thick', reason: 'errors' });
  assert.equal(s.cuts.length, MAX_BAD);
  assert.ok(awardMedals(emptySave(), summary(s)).some((m) => m.id === 'industrial'));
});

test('trop de rondelles fines : le boxer vole le saucisson', () => {
  const s = play(Array(12).fill(2));
  assert.deepEqual(s.ending, { kind: 'dog', reason: 'errors' });
  assert.ok(awardMedals(emptySave(), summary(s)).some((m) => m.id === 'cigarette'));
});

test("l'erreur dominante décide de l'échec", () => {
  const thick = CUT.ideal + CUT.goodTol + 2;
  assert.equal(play([thick, thick, thick, 2, 2]).ending?.kind, 'thick');
  assert.equal(play([2, 2, 2, thick, thick]).ending?.kind, 'dog');
});

test('ne pas couper à temps : découpe nucléaire', () => {
  const s = new Session();
  let forced = null;
  while (!s.ending) forced = s.update(DT) ?? forced;
  assert.deepEqual(s.ending, { kind: 'nuclear', reason: 'disaster' });
  assert.equal(forced?.quality, 'disaster');
  assert.equal(forced?.thickness, CUT.disaster);
  assert.ok(s.elapsed < 5, 'la sanction doit tomber vite');
});

test('les appuis sont ignorés pendant le temps d’arrêt et après la fin', () => {
  const s = new Session();
  cutAt(s, CUT.ideal);
  assert.equal(s.cut(), null);
  s.update(CUT.cutLock + DT);
  assert.notEqual(s.cut(), null);
  const done = play(Array(12).fill(CUT.ideal));
  assert.equal(done.cut(), null);
  assert.equal(done.update(1), null);
  assert.equal(done.cuts.length, 12);
});

test('des rondelles systématiquement à la limite haute font perdre au chrono', () => {
  const s = play(Array(12).fill(CUT.ideal + CUT.goodTol - 0.4));
  // 12 × 20 px : ni le temps ni le saucisson ne suffisent
  assert.notEqual(s.ending?.kind, 'victory');
  assert.ok(s.ending?.reason === 'timeout' || s.ending?.reason === 'shortage', s.ending?.reason);
});

test('le dernier des cochons : victoire avec moins d’une seconde', () => {
  const m: MissionSummary = {
    kind: 'victory', timeLeft: 0.4, elapsed: 24.6, score: 3000,
    counts: { perfect: 2, good: 10, thick: 0, thin: 0, disaster: 0 }, bestStreak: 2,
  };
  assert.deepEqual(awardMedals(emptySave(), m).map((x) => x.id), ['last-pig']);
  assert.equal(MEDALS.length, 4);
});

test('les médailles ne sont attribuées qu’une fois', () => {
  const save = emptySave();
  const s = play(Array(12).fill(CUT.ideal));
  assert.equal(awardMedals(save, summary(s)).length, 1);
  assert.equal(awardMedals(save, summary(s)).length, 0);
});

// ---------------------------------------------------------------- équilibrage
/** Générateur déterministe (mulberry32) pour des simulations reproductibles. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Joueur qui vise l'épaisseur idéale avec une erreur de timing gaussienne d'écart-type `sigma` (s) :
 * il appuie `erreur` secondes avant ou après l'instant où le saucisson atteint l'idéal.
 */
function simulate(sigma: number, games: number, seed: number) {
  const rand = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const out = { victory: 0, thick: 0, dog: 0, nuclear: 0, score: 0, time: 0 };
  for (let g = 0; g < games; g++) {
    const s = new Session();
    while (!s.ending) {
      // instant idéal, calculé sur une copie de l'avance du saucisson
      let th = 0;
      let el = s.elapsed + CUT.cutLock;
      let wait = s.cuts.length ? CUT.cutLock : 0;
      while (th < CUT.ideal) {
        th += feedSpeed(el, th) * DT;
        el += DT;
        wait += DT;
      }
      wait = Math.max(CUT.cutLock + DT, wait + gauss() * sigma);
      for (let t = 0; t < wait && !s.ending; t += DT) s.update(DT);
      s.cut();
    }
    out[s.ending.kind]++;
    out.score += s.score / games;
    if (s.ending.kind === 'victory') out.time += s.elapsed;
  }
  out.time = out.victory ? out.time / out.victory : 0;
  return out;
}

test('équilibrage : un bon joueur gagne souvent, un joueur brouillon rarement', () => {
  const games = 400;
  const rows = [0.05, 0.09, 0.14, 0.2, 0.3].map((sigma) => ({ sigma, ...simulate(sigma, games, 1993) }));
  for (const r of rows) {
    console.log(
      `  timing ±${String(Math.round(r.sigma * 1000)).padStart(3)} ms → victoires ${String(Math.round((r.victory / games) * 100)).padStart(3)} %` +
        ` · parpaing ${r.thick} · boxer ${r.dog} · nucléaire ${r.nuclear} · score moyen ${Math.round(r.score)}` +
        (r.time ? ` · temps moyen ${r.time.toFixed(1)} s` : ''),
    );
  }
  const rate = (i: number) => rows[i].victory / games;
  assert.ok(rate(0) > 0.9, 'un joueur précis (±50 ms) doit presque toujours gagner');
  assert.ok(rate(1) > 0.6, 'un joueur correct (±90 ms) doit gagner le plus souvent');
  assert.ok(rate(2) > 0.4 && rate(2) < 0.95, 'un joueur moyen (±140 ms) doit avoir une vraie chance sans que ce soit acquis');
  assert.ok(rate(4) < 0.1, 'un joueur brouillon (±300 ms) doit échouer');
  // les deux échecs « dominants » doivent tous deux arriver
  const sloppy = rows[3];
  assert.ok(sloppy.thick > 0 && sloppy.dog > 0);
});
