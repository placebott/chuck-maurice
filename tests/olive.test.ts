/**
 * Physique, règles et équilibrage d'Olive Storm.
 * Lancement : npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FLOOR_Y, GLASS, PIVOT, SPOON_REACH, STORM, toSpeed } from '../src/olive/config/balance';
import { CLOCK_DISC, buildSegments, insideGlass, launch, previewPath, stepOlive } from '../src/olive/physics/world';
import { Mission, boxerPath, type MissionEvent, type ShotRecord } from '../src/olive/systems/mission';
import { MEDALS, awardMedals } from '../src/olive/systems/medals';
import type { OliveSave } from '../src/olive/save';

const FRAME = 1 / 60;
const emptySave = (): OliveSave => ({
  best: 0, plays: 0, wins: 0, space: 0, dog: 0, diplomatic: 0, olives: 0, shots: 0, medals: [],
});

/** Tire et laisse l'olive aller au bout. Renvoie le tir et les événements produits. */
function shoot(m: Mission, angle: number, power: number): { shot: ShotRecord; events: MissionEvent[] } {
  assert.ok(m.fire(angle, power), 'tir refusé');
  const events: MissionEvent[] = [];
  while (m.olive) events.push(...m.update(FRAME));
  return { shot: m.shots[m.shots.length - 1], events };
}

/** Attend sans tirer. */
function wait(m: Mission, seconds: number): MissionEvent[] {
  const events: MissionEvent[] = [];
  for (let t = 0; t < seconds && !m.ending; t += FRAME) events.push(...m.update(FRAME));
  return events;
}

/** Cherche, pour un angle donné, les puissances (en %) qui mettent l'olive dans le verre. */
function scoringPowers(angle: number, phase: 1 | 2, filter: (s: ShotRecord) => boolean = () => true): number[] {
  const out: number[] = [];
  for (let p = 0; p <= 100; p++) {
    const m = new Mission();
    m.phase = phase;
    const { shot } = shoot(m, angle, p / 100);
    if (shot.fate === 'scored' && filter(shot)) out.push(p);
  }
  return out;
}

const mid = (list: number[]) => list[Math.floor(list.length / 2)] / 100;
/** Un tir direct et centré, sans vent. */
const BULLSEYE = { angle: 35, power: mid(scoringPowers(35, 1, (s) => s.centered)) };
/** Le même, corrigé du vent. */
const BULLSEYE_WIND = { angle: 35, power: mid(scoringPowers(35, 2, (s) => s.centered)) };
/** Un tir franchement trop court. */
const SHORT = { angle: 35, power: 0.1 };

test('une olive suit une vraie trajectoire balistique', () => {
  const o = launch(40, 0.5);
  const x0 = o.x, y0 = o.y, vx = o.vx, vy = o.vy;
  const none: never[] = [];
  for (let i = 0; i < 120; i++) stepOlive(o, none, none, 0, STORM.step);
  const t = o.t;
  assert.ok(Math.abs(o.x - (x0 + vx * t)) < 0.01, 'x : mouvement uniforme');
  assert.ok(Math.abs(o.y - (y0 + vy * t + 0.5 * STORM.gravity * t * t)) < 0.6, 'y : chute libre');
});

test("le point de départ est le creux de la cuillère, la vitesse suit l'angle et la puissance", () => {
  const o = launch(30, 1);
  assert.ok(Math.abs(Math.hypot(o.x - PIVOT.x, o.y - PIVOT.y) - SPOON_REACH) < 1e-9);
  assert.ok(Math.abs(Math.hypot(o.vx, o.vy) - toSpeed(1)) < 1e-9);
  assert.ok(Math.abs(Math.atan2(-o.vy, o.vx) - (30 * Math.PI) / 180) < 1e-9);
  assert.ok(toSpeed(1) > toSpeed(0.5) && toSpeed(0.5) > toSpeed(0));
});

test('plus de puissance porte plus loin, un autre angle change le point de chute', () => {
  const landing = (angle: number, power: number) => {
    const o = launch(angle, power);
    const floor = buildSegments().filter((s) => s.id === 'table');
    while (!o.grounded && o.t < 5) stepOlive(o, floor, [], 0, STORM.step);
    return o.x;
  };
  assert.ok(landing(30, 0.2) < landing(30, 0.4));
  assert.ok(landing(30, 0.4) < landing(30, 0.6));
  assert.ok(Math.abs(landing(20, 0.4) - landing(60, 0.4)) > 10);
});

test('la physique est déterministe : mêmes conditions, même résultat, quel que soit le découpage du temps', () => {
  const run = (frame: number) => {
    const m = new Mission();
    m.fire(41, 0.37);
    while (m.olive) m.update(frame);
    return m.shots[0];
  };
  const a = run(1 / 60);
  assert.deepEqual(run(1 / 60), a);
  const b = run(1 / 144);
  assert.equal(b.fate, a.fate);
  assert.equal(b.bounces, a.bounces);
  assert.deepEqual(b.touched, a.touched);
});

test('les collisions rendent une partie de l’énergie, et le métal rebondit plus que la table', () => {
  const drop = (mat: 'table' | 'metal') => {
    const o = launch(45, 0);
    Object.assign(o, { x: 100, y: 100, vx: 0, vy: 0 });
    const floor = [{ ax: 0, ay: 200, bx: 300, by: 200, mat, id: mat } as const];
    let apex = 200;
    let bounced = false;
    while (o.t < 3) {
      const hits = stepOlive(o, floor, [], 0, STORM.step);
      if (hits.length) bounced = true;
      if (bounced && o.vy < 0) apex = Math.min(apex, o.y);
      if (bounced && o.vy >= 0 && apex < 199) break;
    }
    return 200 - STORM.radius - apex;
  };
  const table = drop('table');
  const metal = drop('metal');
  const fall = 100 - STORM.radius;
  assert.ok(table > 2 && table < fall, `table : ${table}`);
  assert.ok(metal > table && metal < fall, `métal : ${metal}`);
});

test('une olive finit par s’arrêter (friction)', () => {
  const m = new Mission();
  const { shot } = shoot(m, SHORT.angle, SHORT.power);
  assert.equal(shot.fate, 'lost');
});

test('une olive ne compte que si elle entre par l’ouverture et s’immobilise dans le verre', () => {
  const m = new Mission();
  const { shot, events } = shoot(m, BULLSEYE.angle, BULLSEYE.power);
  assert.equal(shot.fate, 'scored');
  assert.ok(events.some((e) => e.type === 'enter'), 'passage par l’ouverture');
  const resolved = events.find((e) => e.type === 'resolved');
  assert.ok(resolved?.type === 'resolved' && insideGlass(resolved.x, resolved.y), 'immobilisée dans le cône');
  assert.equal(m.settled.length, 1);
});

test('toucher le bord, le flanc ou le pied du verre ne rapporte rien', () => {
  let rim = 0;
  let foot = 0;
  for (let angle = 15; angle <= 50; angle += 5) {
    for (let p = 0; p <= 100; p += 1) {
      const m = new Mission();
      const { shot } = shoot(m, angle, p / 100);
      const hitGlass = shot.touched.includes('glass') || shot.touched.includes('stem');
      if (!hitGlass || shot.fate === 'scored') continue;
      if (shot.touched.includes('stem')) foot++;
      else rim++;
      assert.equal(shot.total, 0);
      assert.equal(m.scored, 0);
    }
  }
  assert.ok(rim > 5, `cas « bord ou flanc » rencontrés : ${rim}`);
  assert.ok(foot > 0, `cas « pied » rencontrés : ${foot}`);
});

test('barème : direct ou ricochet, jamais les deux, et le centre en plus', () => {
  const m = new Mission();
  const { shot } = shoot(m, BULLSEYE.angle, BULLSEYE.power);
  assert.ok(shot.direct && shot.centered);
  assert.deepEqual(shot.points, { olive: 500, direct: 300, ricochet: 0, center: 500, streak: 0 });
  assert.equal(shot.total, 1300);
  assert.equal(m.score, 1300);

  // tous les tirs réussis possibles : aucun ne cumule direct et ricochet
  let ricochets = 0;
  for (let angle = 20; angle <= 50; angle += 10) {
    for (let p = 0; p <= 100; p += 2) {
      const s = shoot(new Mission(), angle, p / 100).shot;
      if (s.fate !== 'scored') continue;
      assert.ok(s.points.direct === 0 || s.points.ricochet === 0);
      assert.equal(s.points.direct + s.points.ricochet, s.direct ? 300 : 200);
      assert.equal(s.direct, s.bounces === 0);
      if (!s.direct) ricochets++;
    }
  }
  assert.ok(ricochets > 0, 'des tirs avec rebond existent');
});

test('trois olives consécutives : bonus de 1000, accordé une seule fois, et victoire', () => {
  const m = new Mission();
  shoot(m, BULLSEYE.angle, BULLSEYE.power);
  shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
  assert.equal(m.scored, 2);
  // phase 3 : on tire juste après un saut du boxer
  wait(m, STORM.boxer.first + STORM.boxer.leap + 0.05);
  const { shot, events } = shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
  assert.equal(shot.fate, 'scored');
  assert.equal(m.ending, 'victory');
  assert.ok(events.some((e) => e.type === 'end' && e.kind === 'victory'));
  assert.deepEqual(m.shots.map((s) => s.points.streak), [0, 0, 1000]);
  assert.equal(m.score, m.shots.reduce((sum, s) => sum + s.total, 0));
  assert.equal(m.accuracy, 1);
});

test('un échec casse la série : pas de bonus de 1000', () => {
  const m = new Mission();
  shoot(m, BULLSEYE.angle, BULLSEYE.power);
  shoot(m, SHORT.angle, SHORT.power);
  shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
  wait(m, STORM.boxer.first + STORM.boxer.leap + 0.05);
  shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
  assert.equal(m.ending, 'victory');
  assert.ok(m.shots.every((s) => s.points.streak === 0));
});

test('les phases s’enchaînent : vent après la première olive, boxer après la deuxième', () => {
  const m = new Mission();
  assert.equal(m.phase, 1);
  assert.equal(m.wind, 0);
  const first = shoot(m, BULLSEYE.angle, BULLSEYE.power);
  assert.ok(first.events.some((e) => e.type === 'phase' && e.phase === 2));
  assert.equal(m.wind, STORM.wind);
  assert.equal(m.boxer().leaping, false);
  const second = shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
  assert.ok(second.events.some((e) => e.type === 'phase' && e.phase === 3));
  const events = wait(m, STORM.boxer.first + 0.2);
  assert.ok(events.some((e) => e.type === 'boxer-warn'), 'le saut est annoncé');
  assert.ok(events.some((e) => e.type === 'boxer-leap'));
  assert.ok(m.boxer().leaping);
});

test('le ventilateur dévie réellement la trajectoire, toujours de la même façon', () => {
  const calm = shoot(new Mission(), BULLSEYE.angle, BULLSEYE.power).shot;
  const windy = new Mission();
  windy.phase = 2;
  const blown = shoot(windy, BULLSEYE.angle, BULLSEYE.power).shot;
  assert.equal(calm.fate, 'scored');
  assert.ok(blown.fate !== 'scored' || !blown.centered, 'le même tir ne passe plus au centre avec le vent');
  assert.ok(BULLSEYE_WIND.power > BULLSEYE.power, 'il faut tirer plus fort contre le vent');
  // prévisible : deux tirs identiques dans le vent donnent le même résultat
  const again = new Mission();
  again.phase = 2;
  assert.deepEqual(shoot(again, BULLSEYE.angle, BULLSEYE.power).shot, blown);
});

test('la trajectoire prévisionnelle utilise le même modèle que le tir, vent compris', () => {
  const segs = buildSegments();
  for (const wind of [0, STORM.wind]) {
    const pts = previewPath(35, 0.5, wind, 0.6, segs, [CLOCK_DISC]);
    const o = launch(35, 0.5);
    let i = 1;
    let next = 0.05;
    while (i < pts.length) {
      stepOlive(o, segs, [CLOCK_DISC], wind, STORM.step);
      if (o.t >= next) {
        assert.ok(Math.hypot(o.x - pts[i].x, o.y - pts[i].y) < 1e-6);
        next += 0.05;
        i++;
      }
    }
    assert.ok(pts.length >= 10);
  }
  const calm = previewPath(35, 0.5, 0, 0.6, segs, []);
  const windy = previewPath(35, 0.5, STORM.wind, 0.6, segs, []);
  assert.ok(windy[windy.length - 1].x < calm[calm.length - 1].x - 5, 'le vent se lit sur les pointillés');
});

test('le boxer intercepte une olive tirée au mauvais moment, pas au bon', () => {
  const ready = () => {
    const m = new Mission();
    shoot(m, BULLSEYE.angle, BULLSEYE.power);
    shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
    return m;
  };
  // on essaie tous les instants de tir sur deux cycles
  const b = STORM.boxer;
  let dog = 0;
  let ok = 0;
  const total = Math.round((b.period * 2) / 0.05);
  for (let i = 0; i < total; i++) {
    const m = ready();
    wait(m, i * 0.05);
    const { shot } = shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
    if (shot.fate === 'dog') {
      dog++;
      assert.equal(shot.total, 0, 'une olive interceptée est un tir manqué');
    } else if (shot.fate === 'scored') ok++;
  }
  assert.ok(dog > 0, 'le boxer doit pouvoir intercepter');
  assert.ok(ok / total > 0.5, `le bon tir doit passer plus d'une fois sur deux, quel que soit l'instant (${ok}/${total})`);
  assert.ok(dog / total > 0.08, `l'interception ne doit pas être anecdotique (${dog}/${total})`);
});

test('la trajectoire du boxer est une parabole fixe, de la droite vers la gauche, au-dessus du verre', () => {
  const a = boxerPath(0), mid2 = boxerPath(0.5), z = boxerPath(1);
  assert.ok(a.x > GLASS.x && z.x < GLASS.x);
  assert.ok(mid2.y < FLOOR_Y - GLASS.rim, 'il passe au-dessus du bord du verre');
  assert.ok(a.y > FLOOR_Y && z.y > FLOOR_Y, 'il part et retombe devant la table');
});

test('cinq tirs, pas un de plus ; la mission s’arrête dès que l’objectif est hors d’atteinte', () => {
  const m = new Mission();
  shoot(m, SHORT.angle, SHORT.power);
  shoot(m, SHORT.angle, SHORT.power);
  assert.equal(m.ending, null, 'deux échecs : trois tirs restants, encore jouable');
  assert.equal(m.shotsLeft, 3);
  const { events } = shoot(m, SHORT.angle, SHORT.power);
  assert.ok(m.ending && m.ending !== 'victory');
  assert.ok(events.some((e) => e.type === 'end'));
  assert.equal(m.fire(45, 0.5), false);

  const full = new Mission();
  shoot(full, BULLSEYE.angle, BULLSEYE.power);
  shoot(full, SHORT.angle, SHORT.power);
  shoot(full, SHORT.angle, SHORT.power);
  shoot(full, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
  assert.equal(full.shotsLeft, 1);
  assert.equal(full.ending, null);
  shoot(full, SHORT.angle, SHORT.power);
  assert.equal(full.used, 5);
  assert.ok(full.ending && full.ending !== 'victory');
});

test('une olive manquée ne met pas fin à la mission', () => {
  const m = new Mission();
  shoot(m, SHORT.angle, SHORT.power);
  assert.equal(m.ending, null);
  assert.ok(m.canFire);
});

test('le chronomètre : 35 secondes, puis défaite', () => {
  const m = new Mission();
  const events = wait(m, STORM.duration + 0.5);
  assert.equal(m.timeLeft, 0);
  assert.ok(m.ending && m.ending !== 'victory');
  assert.ok(events.some((e) => e.type === 'end'));
  assert.ok(Math.abs(m.elapsed - STORM.duration) < 1e-6);
});

test('une olive en vol au buzzer va au bout de sa trajectoire', () => {
  const m = new Mission();
  wait(m, STORM.duration - 0.3);
  assert.ok(m.fire(BULLSEYE.angle, BULLSEYE.power));
  while (m.olive) m.update(FRAME);
  assert.equal(m.shots[0].fate, 'scored');
  wait(m, 0.1);
  assert.ok(m.ending && m.ending !== 'victory', 'une seule olive : défaite malgré tout');
});

test('un tir trop puissant traverse le plafond : incident spatial', () => {
  const m = new Mission();
  const { shot } = shoot(m, 75, 1);
  assert.equal(shot.fate, 'space');
  shoot(m, SHORT.angle, SHORT.power);
  shoot(m, SHORT.angle, SHORT.power);
  assert.equal(m.ending, 'space');
});

test('un ricochet sur le métal peut sortir par la fenêtre : incident diplomatique', () => {
  let found: { angle: number; power: number } | null = null;
  for (let angle = 40; angle <= 60 && !found; angle += 1) {
    for (let p = 50; p <= 100 && !found; p++) {
      if (shoot(new Mission(), angle, p / 100).shot.fate === 'window') found = { angle, power: p / 100 };
    }
  }
  assert.ok(found, 'il existe un tir qui sort par la fenêtre');
  const m = new Mission();
  const { shot } = shoot(m, found.angle, found.power);
  assert.ok(shot.touched.includes('clock') || shot.touched.includes('pan'), 'après un ricochet sur du métal');
  shoot(m, SHORT.angle, SHORT.power);
  shoot(m, SHORT.angle, SHORT.power);
  assert.equal(m.ending, 'diplomatic');
  assert.ok(awardMedals(emptySave(), { kind: m.ending, shots: m.shots, score: m.score }).some((x) => x.id === 'diplomatic'));
});

test('la dernière olive interceptée : trahison canine', () => {
  const m = new Mission();
  shoot(m, BULLSEYE.angle, BULLSEYE.power);
  shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
  // on tire exprès dans la gueule du boxer jusqu'à épuisement
  let guard = 0;
  while (!m.ending && guard++ < 400) {
    const b = m.boxer();
    if (m.canFire && b.warning) {
      // l'olive met un peu moins d'une seconde à atteindre le verre
      wait(m, Math.max(0, STORM.boxer.warn - 0.55));
      shoot(m, BULLSEYE_WIND.angle, BULLSEYE_WIND.power);
    } else wait(m, 0.05);
  }
  assert.equal(m.shots[m.shots.length - 1].fate, 'dog');
  assert.equal(m.ending, 'dog');
});

test('des tirs simplement ratés : la catastrophe dépend de la façon de tirer', () => {
  const soft = new Mission();
  for (let i = 0; i < 3; i++) shoot(soft, 35, 0.1);
  assert.equal(soft.ending, 'diplomatic');
  // un tir tendu, très puissant, qui se perd sans rien déclencher de spécial
  let brute = 0;
  for (let p = 100; p >= 70 && !brute; p--) if (shoot(new Mission(), 12, p / 100).shot.fate === 'lost') brute = p / 100;
  assert.ok(brute >= 0.7);
  const hard = new Mission();
  for (let i = 0; i < 3; i++) shoot(hard, 12, brute);
  assert.ok(hard.shots.every((s) => s.fate === 'lost'));
  assert.equal(hard.ending, 'space');
});

test('médailles : sniper, ingénieur, artillerie', () => {
  const hit = (over: Partial<ShotRecord>): ShotRecord => ({
    index: 0, angle: 35, power: 0.5, fate: 'scored', bounces: 0, direct: true, centered: false,
    points: { olive: 500, direct: 300, ricochet: 0, center: 0, streak: 0 }, total: 800, touched: [], ...over,
  });
  const miss = hit({ fate: 'lost', direct: false, total: 0 });
  const ids = (shots: ShotRecord[], kind: 'victory' | 'space' = 'victory') =>
    awardMedals(emptySave(), { kind, shots, score: 0 }).map((m) => m.id);

  assert.deepEqual(ids([hit({}), hit({}), hit({})]), ['sniper']);
  assert.deepEqual(ids([hit({}), hit({ direct: false, bounces: 1 }), hit({})]), []);
  assert.deepEqual(ids([hit({ direct: false, bounces: 2 }), miss, miss, miss], 'space'), ['engineer']);
  assert.deepEqual(ids([miss, hit({}), miss, hit({}), hit({})]), ['sniper', 'artillery']);
  assert.equal(MEDALS.length, 4);

  const save = emptySave();
  const mission = { kind: 'victory' as const, shots: [hit({}), hit({}), hit({})], score: 0 };
  assert.equal(awardMedals(save, mission).length, 1);
  assert.equal(awardMedals(save, mission).length, 0, 'une médaille ne se gagne qu’une fois');
});

test('un tir avec deux rebonds avant le verre existe réellement', () => {
  let best = 0;
  for (let angle = 10; angle <= 60 && best < 2; angle += 2) {
    for (let p = 0; p <= 100 && best < 2; p++) {
      const s = shoot(new Mission(), angle, p / 100).shot;
      if (s.fate === 'scored') best = Math.max(best, s.bounces);
    }
  }
  assert.ok(best >= 2, `meilleur ricochet trouvé : ${best} rebond(s)`);
});

test('équilibrage : la cible est atteignable à chaque phase, sans être offerte', () => {
  const rows: string[] = [];
  for (const phase of [1, 2] as const) {
    let widest = 0;
    let angles = 0;
    for (let angle = STORM.angleMin; angle <= STORM.angleMax; angle += 2) {
      const n = scoringPowers(angle, phase).length;
      if (n >= 4) angles++;
      widest = Math.max(widest, n);
    }
    rows.push(`  phase ${phase} : ${angles} angles jouables, fenêtre de puissance la plus large ${widest} %`);
    assert.ok(angles >= 8, `phase ${phase} : assez d'angles jouables (${angles})`);
    assert.ok(widest >= 8, `phase ${phase} : une marge d'erreur humaine (${widest} %)`);
    assert.ok(widest <= 30, `phase ${phase} : pas trop facile (${widest} %)`);
  }
  console.log(rows.join('\n'));
});

test('équilibrage : cinq tirs tiennent largement dans les 35 secondes', () => {
  // vol le plus long d'un tir « raisonnable » : il fixe le rythme minimal
  let longest = 0;
  for (let angle = 20; angle <= 50; angle += 5) {
    for (let p = 20; p <= 80; p += 5) {
      const m = new Mission();
      m.fire(angle, p / 100);
      while (m.olive) m.update(FRAME);
      longest = Math.max(longest, m.elapsed);
    }
  }
  console.log(`  vol le plus long : ${longest.toFixed(1)} s`);
  // 5 tirs = 5 vols + 5 visées : il doit rester au moins 3 s de visée par tir
  assert.ok(STORM.duration - STORM.shots * longest >= STORM.shots * 3, `vol le plus long : ${longest.toFixed(1)} s`);
});
