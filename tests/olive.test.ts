/**
 * Physique, règles et équilibrage d'Olive Storm.
 * Le joueur ne règle que l'angle : la force de la cuillère est fixe.
 * Lancement : npm test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FLOOR_Y, GLASS, PIVOT, SPOON_REACH, STORM } from '../src/olive/config/balance';
import { CLOCK_DISC, buildSegments, insideGlass, launch, previewPath, stepOlive } from '../src/olive/physics/world';
import {
  Mission, boxerPath, randomLayout,
  type Layout, type MissionEvent, type ShotRecord,
} from '../src/olive/systems/mission';
import { MEDALS, awardMedals } from '../src/olive/systems/medals';
import type { OliveSave } from '../src/olive/save';

const FRAME = 1 / 60;
/** Vent de la mission de test : la valeur médiane. */
const WIND = STORM.winds[1];
const LAYOUT: Layout = { glassX: GLASS.x, wind: WIND };
const mission = (wind: number = WIND) => new Mission({ glassX: GLASS.x, wind });
const emptySave = (): OliveSave => ({
  best: 0, plays: 0, wins: 0, space: 0, dog: 0, diplomatic: 0, olives: 0, shots: 0, medals: [],
});

/** Un sol sans fin, pour mesurer des portées. */
const LONG_FLOOR = [{ ax: -2000, ay: FLOOR_Y, bx: 6000, by: FLOOR_Y, mat: 'table', id: 'table' } as const];

/** Tire et laisse l'olive aller au bout. Renvoie le tir et les événements produits. */
function shoot(m: Mission, angle: number): { shot: ShotRecord; events: MissionEvent[] } {
  assert.ok(m.fire(angle), 'tir refusé');
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

/** Balaye tous les angles (pas de 0,25°) et renvoie le tir obtenu pour chacun. */
function sweep(windy: boolean, wind: number = WIND): { angle: number; shot: ShotRecord }[] {
  const out: { angle: number; shot: ShotRecord }[] = [];
  for (let angle = STORM.angleMin; angle <= STORM.angleMax; angle += 0.25) {
    const m = mission(wind);
    if (windy) m.phase = 2;
    out.push({ angle, shot: shoot(m, angle).shot });
  }
  return out;
}

/** Plus grande plage d'angles consécutifs qui mettent l'olive dans le verre. */
function mainWindow(windy: boolean, wind: number = WIND): { lo: number; hi: number; width: number } {
  const ok = sweep(windy, wind).filter((r) => r.shot.fate === 'scored').map((r) => r.angle);
  let best = { lo: 0, hi: 0, width: 0 };
  let start = ok[0];
  for (let i = 0; i < ok.length; i++) {
    if (i === ok.length - 1 || ok[i + 1] - ok[i] > 0.26) {
      const width = ok[i] - start + 0.25;
      if (width > best.width) best = { lo: start, hi: ok[i], width };
      start = ok[i + 1];
    }
  }
  return best;
}

const CALM = sweep(false);
const WINDY = sweep(true);
const centered = (rows: typeof CALM) => {
  const list = rows.filter((r) => r.shot.fate === 'scored' && r.shot.centered && r.shot.direct);
  return list[Math.floor(list.length / 2)].angle;
};
/** Un tir direct et centré, sans vent. */
const BULLSEYE = centered(CALM);
/** Le même, corrigé du vent. */
const BULLSEYE_WIND = centered(WINDY);
/** Un tir en cloche, franchement trop court. */
const SHORT = 30;

test('une olive suit une vraie trajectoire balistique', () => {
  const o = launch(40);
  const x0 = o.x, y0 = o.y, vx = o.vx, vy = o.vy;
  const none: never[] = [];
  for (let i = 0; i < 120; i++) stepOlive(o, none, none, 0, STORM.step);
  const t = o.t;
  assert.ok(Math.abs(o.x - (x0 + vx * t)) < 0.01, 'x : mouvement uniforme');
  assert.ok(Math.abs(o.y - (y0 + vy * t + 0.5 * STORM.gravity * t * t)) < 0.6, 'y : chute libre');
});

test("l'olive part du creux de la cuillère, toujours à la même vitesse, dans la direction visée", () => {
  for (const angle of [10, 30, 70]) {
    const o = launch(angle);
    assert.ok(Math.abs(Math.hypot(o.x - PIVOT.x, o.y - PIVOT.y) - SPOON_REACH) < 1e-9);
    assert.ok(Math.abs(Math.hypot(o.vx, o.vy) - STORM.speed) < 1e-9, 'la force du tir est fixe');
    assert.ok(Math.abs(Math.atan2(-o.vy, o.vx) - (angle * Math.PI) / 180) < 1e-9);
  }
});

test("l'angle est le seul réglage : il change le point de chute", () => {
  const landing = (angle: number) => {
    const o = launch(angle);
    while (!o.grounded && o.t < 6) stepOlive(o, LONG_FLOOR, [], 0, STORM.step);
    return o.x;
  };
  const at = [10, 20, 30, 40, 80].map(landing);
  assert.ok(at[0] < at[1] && at[1] < at[2], `portée croissante aux petits angles : ${at.map(Math.round).join(', ')}`);
  assert.ok(at[4] < at[3], 'un tir trop en cloche retombe court');
});

test('la physique est déterministe : mêmes conditions, même résultat, quel que soit le découpage du temps', () => {
  const run = (frame: number) => {
    const m = mission();
    m.fire(41);
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
    const o = launch(45);
    Object.assign(o, { x: 100, y: 100, vx: 0, vy: 0 });
    const floor = [{ ax: 0, ay: 200, bx: 300, by: 200, mat, id: mat } as const];
    let apex = 200;
    let bounced = false;
    while (o.t < 4) {
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
  assert.equal(shoot(mission(), SHORT).shot.fate, 'lost');
});

test('une olive trop longue quitte la cuisine : aucun mur ne la renvoie dans le verre', () => {
  const long = CALM.filter((r) => r.angle > mainWindow(false).hi && r.angle < 30);
  assert.ok(long.length > 20);
  assert.ok(long.every((r) => r.shot.fate !== 'scored'), 'au-delà de la fenêtre, plus rien ne rentre');
  assert.ok(!buildSegments().some((s) => s.ax > GLASS.x + GLASS.half && s.ax === s.bx), 'pas de mur à droite');
});

test('une olive ne compte que si elle entre par l’ouverture et s’immobilise dans le verre', () => {
  const m = mission();
  const { shot, events } = shoot(m, BULLSEYE);
  assert.equal(shot.fate, 'scored');
  assert.ok(events.some((e) => e.type === 'enter'), 'passage par l’ouverture');
  const resolved = events.find((e) => e.type === 'resolved');
  assert.ok(resolved?.type === 'resolved' && insideGlass(resolved.x, resolved.y), 'immobilisée dans le cône');
  assert.equal(m.settled.length, 1);
});

test('toucher le bord, le flanc ou le pied du verre ne rapporte rien', () => {
  let rim = 0;
  let foot = 0;
  for (const { shot } of [...CALM, ...WINDY]) {
    const hitGlass = shot.touched.includes('glass') || shot.touched.includes('stem');
    if (!hitGlass || shot.fate === 'scored') continue;
    if (shot.touched.includes('stem')) foot++;
    else rim++;
    assert.equal(shot.total, 0);
  }
  assert.ok(rim > 0, `cas « bord ou flanc » rencontrés : ${rim}`);
  assert.ok(foot > 0, `cas « pied » rencontrés : ${foot}`);
});

test('barème : direct ou ricochet, jamais les deux, et le centre en plus', () => {
  const m = mission();
  const { shot } = shoot(m, BULLSEYE);
  assert.ok(shot.direct && shot.centered);
  assert.deepEqual(shot.points, { olive: 500, direct: 300, ricochet: 0, center: 500, streak: 0 });
  assert.equal(shot.total, 1300);
  assert.equal(m.score, 1300);

  let ricochets = 0;
  for (const { shot: s } of [...CALM, ...WINDY]) {
    if (s.fate !== 'scored') continue;
    assert.ok(s.points.direct === 0 || s.points.ricochet === 0);
    assert.equal(s.points.direct + s.points.ricochet, s.direct ? 300 : 200);
    assert.equal(s.direct, s.bounces === 0);
    if (!s.direct) ricochets++;
  }
  assert.ok(ricochets > 0, 'des tirs avec rebond existent');
});

test('trois olives consécutives : bonus de 1000, accordé une seule fois, et victoire', () => {
  const m = mission();
  shoot(m, BULLSEYE);
  shoot(m, BULLSEYE_WIND);
  assert.equal(m.scored, 2);
  // phase 3 : on tire juste après un saut du boxer
  wait(m, STORM.boxer.first + STORM.boxer.leap + 0.05);
  const { shot, events } = shoot(m, BULLSEYE_WIND);
  assert.equal(shot.fate, 'scored');
  assert.equal(m.ending, 'victory');
  assert.ok(events.some((e) => e.type === 'end' && e.kind === 'victory'));
  assert.deepEqual(m.shots.map((s) => s.points.streak), [0, 0, 1000]);
  assert.equal(m.score, m.shots.reduce((sum, s) => sum + s.total, 0));
  assert.equal(m.accuracy, 1);
});

test('un échec casse la série : pas de bonus de 1000', () => {
  const m = mission();
  shoot(m, BULLSEYE);
  shoot(m, SHORT);
  shoot(m, BULLSEYE_WIND);
  wait(m, STORM.boxer.first + STORM.boxer.leap + 0.05);
  shoot(m, BULLSEYE_WIND);
  assert.equal(m.ending, 'victory');
  assert.ok(m.shots.every((s) => s.points.streak === 0));
});

test('les phases s’enchaînent : vent après la première olive, boxer après la deuxième', () => {
  const m = mission();
  assert.equal(m.phase, 1);
  assert.equal(m.wind, 0);
  const first = shoot(m, BULLSEYE);
  assert.ok(first.events.some((e) => e.type === 'phase' && e.phase === 2));
  assert.equal(m.wind, WIND);
  assert.equal(m.boxer().leaping, false);
  const second = shoot(m, BULLSEYE_WIND);
  assert.ok(second.events.some((e) => e.type === 'phase' && e.phase === 3));
  const events = wait(m, STORM.boxer.first + 0.2);
  assert.ok(events.some((e) => e.type === 'boxer-warn'), 'le saut est annoncé');
  assert.ok(events.some((e) => e.type === 'boxer-leap'));
  assert.ok(m.boxer().leaping);
});

test('le ventilateur pousse réellement l’olive, toujours de la même façon', () => {
  const landing = (wind: number) => {
    const o = launch(30);
    while (!o.grounded && o.t < 6) stepOlive(o, LONG_FLOOR, [], wind, STORM.step);
    return o.x;
  };
  assert.ok(landing(WIND) > landing(0) + 10, 'vent dans le dos : l’olive porte plus loin');
  assert.ok(BULLSEYE_WIND < BULLSEYE, 'il faut viser plus bas avec le vent');
  // prévisible : deux tirs identiques dans le vent donnent le même résultat
  const a = mission();
  const b = mission();
  a.phase = 2;
  b.phase = 2;
  assert.deepEqual(shoot(a, BULLSEYE).shot, shoot(b, BULLSEYE).shot);
});

test('la force du ventilateur est tirée au sort une fois par mission, parmi les valeurs prévues', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 30; i++) seen.add(randomLayout(() => i / 30).wind);
  assert.deepEqual([...seen].sort((a, b) => a - b), [...STORM.winds]);
  assert.equal(randomLayout(() => 0.999999).wind, STORM.winds[STORM.winds.length - 1]);
  const m = new Mission(LAYOUT);
  assert.equal(m.layout.wind, WIND);
});

test('la trajectoire prévisionnelle utilise le même modèle que le tir, vent compris, et reste courte', () => {
  const segs = buildSegments();
  for (const wind of [0, WIND]) {
    const pts = previewPath(35, wind, 0.6, segs, [CLOCK_DISC]);
    const o = launch(35);
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
  // en jeu, seule l'amorce est montrée : assez longue pour se lire, elle s'arrête bien avant le verre
  for (const duration of STORM.preview) {
    const pts = previewPath(BULLSEYE, 0, duration, segs, [CLOCK_DISC]);
    const first = pts[0];
    const last = pts[pts.length - 1];
    const share = (last.x - first.x) / (GLASS.x - first.x);
    assert.ok(share > 0.25 && share < 0.55, `amorce : ${Math.round(share * 100)} % du chemin`);
  }
});

test('le boxer intercepte une olive tirée au mauvais moment, pas au bon', () => {
  const ready = () => {
    const m = mission();
    shoot(m, BULLSEYE);
    shoot(m, BULLSEYE_WIND);
    return m;
  };
  const b = STORM.boxer;
  let dog = 0;
  let ok = 0;
  const total = Math.round((b.period * 2) / 0.05);
  for (let i = 0; i < total; i++) {
    const m = ready();
    wait(m, i * 0.05);
    const { shot } = shoot(m, BULLSEYE_WIND);
    if (shot.fate === 'dog') {
      dog++;
      assert.equal(shot.total, 0, 'une olive interceptée est un tir manqué');
    } else if (shot.fate === 'scored') ok++;
  }
  console.log(`  boxer : le bon angle passe ${Math.round((ok / total) * 100)} % du temps, intercepté ${Math.round((dog / total) * 100)} %`);
  assert.ok(dog / total > 0.08, `l'interception ne doit pas être anecdotique (${dog}/${total})`);
  assert.ok(ok / total > 0.5, `le bon tir doit passer plus d'une fois sur deux (${ok}/${total})`);
});

test('la trajectoire du boxer est une parabole fixe, de la droite vers la gauche, au-dessus du verre', () => {
  const a = boxerPath(0), z = boxerPath(1);
  assert.ok(a.x > GLASS.x && z.x < GLASS.x);
  assert.ok(a.y > FLOOR_Y && z.y > FLOOR_Y, 'il part et retombe devant la table');
  // sa gueule (30 px en avant) passe au-dessus du bord du verre
  let k = 0;
  while (boxerPath(k).x - 30 > GLASS.x) k += 0.01;
  assert.ok(boxerPath(k).y < FLOOR_Y - GLASS.rim, `hauteur au-dessus du verre : ${boxerPath(k).y.toFixed(0)}`);
});

test('cinq tirs, pas un de plus ; la mission s’arrête dès que l’objectif est hors d’atteinte', () => {
  const m = mission();
  shoot(m, SHORT);
  shoot(m, SHORT);
  assert.equal(m.ending, null, 'deux échecs : trois tirs restants, encore jouable');
  assert.equal(m.shotsLeft, 3);
  const { events } = shoot(m, SHORT);
  assert.ok(m.ending && m.ending !== 'victory');
  assert.ok(events.some((e) => e.type === 'end'));
  assert.equal(m.fire(45), false);

  const full = mission();
  shoot(full, BULLSEYE);
  shoot(full, SHORT);
  shoot(full, SHORT);
  shoot(full, BULLSEYE_WIND);
  assert.equal(full.shotsLeft, 1);
  assert.equal(full.ending, null);
  shoot(full, SHORT);
  assert.equal(full.used, 5);
  assert.ok(full.ending && full.ending !== 'victory');
});

test('une olive manquée ne met pas fin à la mission', () => {
  const m = mission();
  shoot(m, SHORT);
  assert.equal(m.ending, null);
  assert.ok(m.canFire);
});

test('le chronomètre : 35 secondes, puis défaite', () => {
  const m = mission();
  const events = wait(m, STORM.duration + 0.5);
  assert.equal(m.timeLeft, 0);
  assert.ok(m.ending && m.ending !== 'victory');
  assert.ok(events.some((e) => e.type === 'end'));
  assert.ok(Math.abs(m.elapsed - STORM.duration) < 1e-6);
});

test('une olive en vol au buzzer va au bout de sa trajectoire', () => {
  const m = mission();
  wait(m, STORM.duration - 0.3);
  assert.ok(m.fire(BULLSEYE));
  while (m.olive) m.update(FRAME);
  assert.equal(m.shots[0].fate, 'scored');
  wait(m, 0.1);
  assert.ok(m.ending && m.ending !== 'victory', 'une seule olive : défaite malgré tout');
});

test('un tir trop en cloche traverse le plafond : incident spatial', () => {
  const m = mission();
  assert.equal(shoot(m, 78).shot.fate, 'space');
  shoot(m, SHORT);
  shoot(m, SHORT);
  assert.equal(m.ending, 'space');
});

test('un ricochet sur le métal peut sortir par la fenêtre : incident diplomatique', () => {
  const out = CALM.find((r) => r.shot.fate === 'window');
  assert.ok(out, 'il existe un angle qui sort par la fenêtre');
  const m = mission();
  const { shot } = shoot(m, out.angle);
  assert.ok(shot.touched.includes('clock') || shot.touched.includes('pan'), 'après un ricochet sur du métal');
  shoot(m, SHORT);
  shoot(m, SHORT);
  assert.equal(m.ending, 'diplomatic');
  assert.ok(awardMedals(emptySave(), { kind: m.ending, shots: m.shots, score: m.score }).some((x) => x.id === 'diplomatic'));
});

test('la dernière olive interceptée : trahison canine', () => {
  const m = mission();
  shoot(m, BULLSEYE);
  shoot(m, BULLSEYE_WIND);
  // on cherche l'avance qui envoie l'olive dans la gueule du boxer, puis on recommence jusqu'au bout
  let lead = -1;
  for (let d = 0; d <= STORM.boxer.warn + STORM.boxer.leap && lead < 0; d += 0.05) {
    const probe = mission();
    shoot(probe, BULLSEYE);
    shoot(probe, BULLSEYE_WIND);
    wait(probe, STORM.boxer.first - STORM.boxer.warn + d);
    if (shoot(probe, BULLSEYE_WIND).shot.fate === 'dog') lead = d;
  }
  assert.ok(lead >= 0, 'il existe un instant de tir intercepté');
  wait(m, STORM.boxer.first - STORM.boxer.warn + lead);
  let guard = 0;
  while (!m.ending && guard++ < 6) {
    const start = m.elapsed;
    assert.equal(shoot(m, BULLSEYE_WIND).shot.fate, 'dog');
    wait(m, STORM.boxer.period - (m.elapsed - start));
  }
  assert.equal(m.ending, 'dog');
});

test('des tirs simplement ratés : la catastrophe dépend de la façon de viser', () => {
  const flat = mission();
  for (let i = 0; i < 3; i++) shoot(flat, SHORT);
  assert.ok(flat.shots.every((s) => s.fate === 'lost'));
  assert.equal(flat.ending, 'diplomatic');
  // des tirs en cloche qui retombent sans rien déclencher de spécial
  const lob = CALM.filter((r) => r.angle >= 50 && r.shot.fate === 'lost').map((r) => r.angle);
  assert.ok(lob.length > 0);
  const steep = mission();
  for (let i = 0; i < 3; i++) shoot(steep, lob[0]);
  assert.ok(steep.shots.every((s) => s.fate === 'lost'));
  assert.equal(steep.ending, 'space');
});

test('médailles : sniper, ingénieur, artillerie', () => {
  const hit = (over: Partial<ShotRecord>): ShotRecord => ({
    index: 0, angle: 15, fate: 'scored', bounces: 0, direct: true, centered: false,
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
  const summary = { kind: 'victory' as const, shots: [hit({}), hit({}), hit({})], score: 0 };
  assert.equal(awardMedals(save, summary).length, 1);
  assert.equal(awardMedals(save, summary).length, 0, 'une médaille ne se gagne qu’une fois');
});

test('un tir avec deux rebonds avant le verre existe réellement', () => {
  const best = Math.max(0, ...[...CALM, ...WINDY].filter((r) => r.shot.fate === 'scored').map((r) => r.shot.bounces));
  assert.ok(best >= 2, `meilleur ricochet trouvé : ${best} rebond(s)`);
});

test('équilibrage : une seule vraie fenêtre d’angle, étroite, qui se resserre avec le vent', () => {
  const calm = mainWindow(false);
  const rows = [`  sans vent : ${calm.lo}°–${calm.hi}° (${calm.width}°)`];
  assert.ok(calm.width >= 4 && calm.width <= 7, `phase 1 : ${calm.width}°`);
  let previous = calm;
  for (const wind of STORM.winds) {
    const w = mainWindow(true, wind);
    rows.push(`  vent ${wind} : ${w.lo}°–${w.hi}° (${w.width}°)`);
    assert.ok(w.width >= 3 && w.width <= 6, `vent ${wind} : fenêtre de ${w.width}°`);
    assert.ok(w.width < calm.width, `vent ${wind} : la fenêtre doit être plus étroite qu'en phase 1`);
    assert.ok(w.hi < previous.hi, `vent ${wind} : la fenêtre doit se décaler vers le bas`);
    assert.ok(w.lo > STORM.angleMin + 1, `vent ${wind} : la fenêtre ne doit pas buter sur l'angle minimal`);
    previous = w;
    // tout le reste des angles ne doit offrir que des coups de chance
    const total = sweep(true, wind).filter((r) => r.shot.fate === 'scored').length * 0.25;
    assert.ok(total - w.width <= 3, `vent ${wind} : ${total - w.width}° de tirs chanceux hors fenêtre`);
  }
  // l'angle trouvé en phase 1 n'est plus sûr quand le vent se lève
  const strongest = mainWindow(true, STORM.winds[STORM.winds.length - 1]);
  assert.ok(calm.hi - strongest.hi >= 2, 'le haut de la fenêtre de phase 1 ne passe plus avec le vent le plus fort');
  console.log(rows.join('\n'));
});

test('équilibrage : cinq tirs tiennent largement dans les 35 secondes', () => {
  let longest = 0;
  for (const { angle } of CALM.filter((r) => r.angle % 5 === 0 && r.angle <= 45)) {
    const m = mission();
    m.fire(angle);
    while (m.olive) m.update(FRAME);
    longest = Math.max(longest, m.elapsed);
  }
  console.log(`  vol le plus long : ${longest.toFixed(1)} s`);
  // 5 tirs = 5 vols + 5 visées : il doit rester au moins 2,5 s de visée par tir
  assert.ok(STORM.duration - STORM.shots * longest >= STORM.shots * 2.5, `vol le plus long : ${longest.toFixed(1)} s`);
});
