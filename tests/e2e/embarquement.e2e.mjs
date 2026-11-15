/**
 * Test de bout en bout d'Embarquement, dans un vrai Chrome sans interface.
 *
 * Playwright n'étant pas installé (et npm absent de cette machine), le test
 * pilote Chrome directement par le protocole DevTools (WebSocket natif de
 * Node ≥ 22) : vrais événements souris et tactiles, aucune dépendance ajoutée.
 *
 * Lancement : npm run test:e2e   (Chrome requis ; CHROME_PATH pour un autre chemin)
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { createServer } from 'vite';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ CDP minimal

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { ok, ko } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) ko(new Error(`${msg.error.message} (${msg.error.code})`));
        else ok(msg.result);
      } else for (const l of this.listeners) l(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((ok, ko) => this.pending.set(id, { ok, ko }));
  }
}

let server;
let chrome;
let profile;
let cdp;
let session;
const pageErrors = [];

const send = (method, params) => cdp.send(method, params, session);

/** Évalue une expression dans la page et rend sa valeur (JSON). */
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function waitFor(expression, timeout = 15000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await evaluate(expression).catch(() => false)) return;
    if (Date.now() > end) throw new Error(`délai dépassé : ${expression}`);
    await sleep(50);
  }
}

/** Centre d'une case, en pixels CSS de la fenêtre. */
const cellCenter = (x, y) =>
  evaluate(`(() => {
    const E = window.__embarquement, L = E.layout, r = E.game.canvas.getBoundingClientRect();
    return { x: r.left + (L.ox + (${x} + 0.5) * L.cell) / L.dpr, y: r.top + (L.oy + (${y} + 0.5) * L.cell) / L.dpr };
  })()`);

const state = () =>
  evaluate(`(() => {
    const e = window.__embarquement.engine;
    return {
      people: e.peopleLeft, moves: e.moveCount, won: e.isWon, lost: e.isLost, paused: e.isPaused,
      timeLeft: e.timeLeftMs, running: e.clockRunning,
      pieces: Object.fromEntries(e.pieceList.map((p) => [p.id, { x: p.x, y: p.y, remaining: p.remaining, removed: p.removed }])),
      feeders: e.feederList.map((f) => f.pending.length),
    };
  })()`);

const text = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).textContent.trim()`);
const visible = (id) => evaluate(`!document.getElementById(${JSON.stringify(id)}).hidden`);

/** Glisser à la souris d'une case à l'autre, case par case, comme un joueur. */
async function mouseDrag(cells) {
  const pts = [];
  for (const [x, y] of cells) pts.push(await cellCenter(x, y));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pts[0].x, y: pts[0].y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0].x, y: pts[0].y, button: 'left', buttons: 1, clickCount: 1 });
  for (const p of pts.slice(1)) {
    // deux étapes intermédiaires par case : le mouvement reste continu
    const last = pts[pts.indexOf(p) - 1];
    for (const k of [0.5, 1]) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: last.x + (p.x - last.x) * k, y: last.y + (p.y - last.y) * k, button: 'left', buttons: 1 });
      await sleep(8);
    }
  }
  const end = pts.at(-1);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 });
}

/** Glisser au doigt (événements tactiles émulés par Chrome). */
async function touchDrag(cells) {
  const pts = [];
  for (const [x, y] of cells) pts.push(await cellCenter(x, y));
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
  for (const p of pts.slice(1)) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
    await sleep(16);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function click(id) {
  const r = await evaluate(`(() => { const b = document.getElementById(${JSON.stringify(id)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
}

async function key(code, keyName) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: 0 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code });
}

async function reload(query = '') {
  pageErrors.length = 0;
  await send('Page.navigate', { url: `${server.resolvedUrls.local[0]}embarquement.html${query}` });
  await waitFor('!!(window.__embarquement && window.__embarquement.layout && window.__embarquement.game.canvas)');
  await sleep(300);
}

// ------------------------------------------------------------------ cycle

const haveChrome = existsSync(CHROME);

before(async () => {
  if (!haveChrome) return;
  server = await createServer({
    root: ROOT,
    configFile: join(ROOT, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 5199, strictPort: false },
  });
  await server.listen();
  profile = mkdtempSync(join(tmpdir(), 'embarquement-e2e-'));
  chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=430,932', 'about:blank',
  ]);
  const wsUrl = await new Promise((ok, ko) => {
    const timer = setTimeout(() => ko(new Error('Chrome ne répond pas')), 15000);
    chrome.stderr.on('data', (d) => {
      const m = String(d).match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(timer);
        ok(m[1]);
      }
    });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, ko) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', ko, { once: true });
  });
  cdp = new Cdp(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  cdp.listeners.add((msg) => {
    if (msg.sessionId !== session) return;
    if (msg.method === 'Runtime.exceptionThrown') pageErrors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') pageErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await reload();
});

after(async () => {
  try {
    await cdp?.send('Browser.close');
  } catch {
    // Chrome déjà fermé
  }
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise((ok) => chrome.once('exit', ok));
    chrome.kill();
    await Promise.race([exited, sleep(3000)]);
  }
  await server?.close();
  if (profile) rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const e2e = haveChrome ? test : test.skip;

// ------------------------------------------------------------------ scénarios

e2e('la page se charge sans erreur : niveau 1, chronomètre 03:00, 23 personnages', async () => {
  assert.deepEqual(pageErrors, []);
  assert.equal(await text('level-number'), '1');
  assert.equal(await text('clock'), '03:00');
  assert.equal(await text('people-left'), '23');
  const s = await state();
  assert.equal(Object.keys(s.pieces).length, 7);
  assert.deepEqual(s.feeders, [4, 3]);
  assert.equal(s.running, false, 'le chronomètre attend le premier déplacement');
});

e2e('souris : la pièce verte glisse sous deux personnages verts et les embarque', async () => {
  // le S vert (ancre 3,1) descend d'une case : ses cases (5,2) et (3,3) recouvrent les deux personnages verts
  const before = await state();
  await mouseDrag([[4, 1], [4, 2]]);
  await sleep(500);
  const s = await state();
  assert.deepEqual([s.pieces.vert.x, s.pieces.vert.y], [3, 2]);
  assert.equal(s.pieces.vert.remaining, before.pieces.vert.remaining - 2);
  assert.equal(s.people, 21);
  assert.equal(await text('people-left'), '21');
  assert.equal(s.running, true, 'le premier déplacement lance le chronomètre');
});

e2e('souris : une pièce ne traverse pas une autre pièce', async () => {
  // la barre orange (0..2, 4) tirée loin à droite passe sur le personnage orange en (3,4), qu'elle embarque,
  // puis bute sur la pièce bleue en (5,4) : son ancre ne dépasse pas 2
  await reload();
  await mouseDrag([[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4]]);
  await sleep(400);
  const s = await state();
  assert.deepEqual([s.pieces.orange.x, s.pieces.orange.y], [2, 4]);
  assert.equal(s.pieces.orange.remaining, 2);
  assert.deepEqual([s.pieces.bleu.x, s.pieces.bleu.y], [5, 2], 'la pièce bleue n’a pas bougé');
});

e2e('tactile : glisser au doigt déplace une pièce', async () => {
  await reload();
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await touchDrag([[4, 1], [4, 2]]);
  await sleep(500);
  const s = await state();
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  assert.deepEqual([s.pieces.vert.x, s.pieces.vert.y], [3, 2]);
  assert.equal(s.people, 21);
});

e2e('pause : la partie s’arrête et reprend', async () => {
  await click('pause');
  await sleep(100);
  assert.equal(await visible('overlay'), true);
  assert.equal(await text('overlay-title'), 'Pause');
  const s = await state();
  assert.equal(s.paused, true);
  const t = s.timeLeft;
  await sleep(600);
  assert.equal((await state()).timeLeft, t, 'le temps est arrêté');
  await click('overlay-main');
  await sleep(100);
  assert.equal(await visible('overlay'), false);
  assert.equal((await state()).paused, false);
});

e2e('DEBUG : sélection, coordonnées et déplacement manuel au clavier', async () => {
  await reload('?debug');
  assert.equal(await visible('debug'), true);
  // un simple toucher sélectionne la pièce violette (3,6)-(4,6)
  await mouseDrag([[3, 6], [3, 6]]);
  await sleep(150);
  const panel = await text('dbg-piece');
  assert.match(panel, /violet/);
  assert.match(panel, /\(3,6\) \(4,6\)/);
  assert.match(await text('dbg-feeders'), /gauche.*entrée \(0,2\), reste 4/);
  await key('ArrowUp', 'ArrowUp'); // personnage orange en (3,5) : refusé
  await sleep(150);
  assert.deepEqual([(await state()).pieces.violet.x, (await state()).pieces.violet.y], [3, 6]);
  await key('ArrowDown', 'ArrowDown'); // recouvre le personnage violet en (3,7)
  await sleep(300);
  const s = await state();
  assert.deepEqual([s.pieces.violet.x, s.pieces.violet.y], [3, 7]);
  assert.equal(s.pieces.violet.remaining, 2);
  assert.match(await text('dbg-log'), /violet embarque 1 de la grille/);
  assert.match(await text('dbg-piece'), /2 \/ 3/);
});

e2e('partie complète à la souris jusqu’à l’écran de victoire, puis Recommencer', async () => {
  // solution calculée par le solveur du projet, rejouée par de vrais glissers
  const out = await build({
    stdin: {
      contents: `
        import { PuzzleEngine } from './src/embarquement/engine/engine';
        import { parseLevel } from './src/embarquement/engine/level';
        import { solve } from './src/embarquement/engine/solver';
        import level from './src/embarquement/levels/heure-de-pointe.json';
        const e = new PuzzleEngine(parseLevel(level));
        export const steps = solve(e).steps;
        export const anchors = Object.fromEntries(e.pieceList.map((p) => [p.id, { x: p.x, y: p.y, grip: p.cells[0] }]));`,
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'error',
  });
  const { steps, anchors } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
  assert.ok(steps.length > 10);

  await reload();
  const pos = Object.fromEntries(Object.entries(anchors).map(([id, a]) => [id, { x: a.x, y: a.y }]));
  for (const step of steps) {
    const { grip } = anchors[step.pieceId];
    const start = pos[step.pieceId];
    const cells = [[start.x + grip.x, start.y + grip.y], ...step.path.map((a) => [a.x + grip.x, a.y + grip.y])];
    if (cells.length === 1) cells.push(cells[0]);
    await mouseDrag(cells);
    const end = step.path.at(-1);
    if (end) pos[step.pieceId] = { x: end.x, y: end.y };
    await sleep(60);
  }
  await waitFor(`!document.getElementById('overlay').hidden`, 8000);
  assert.equal(await text('overlay-title'), 'Niveau réussi !');
  assert.match(await text('overlay-detail'), /Temps restant : \d\d:\d\d\. \d+ coups\./);
  const s = await state();
  assert.equal(s.won, true);
  assert.equal(s.people, 0);
  assert.ok(Object.values(s.pieces).every((p) => p.removed));
  assert.deepEqual(s.feeders, [0, 0]);
  assert.deepEqual(pageErrors, []);

  await click('overlay-main');
  await sleep(200);
  const r = await state();
  assert.deepEqual([r.won, r.people, r.moves, r.timeLeft], [false, 23, 0, 180000]);
  assert.equal(await text('clock'), '03:00');
});

e2e('défaite : le temps écoulé affiche l’écran Temps écoulé', async () => {
  await reload();
  await mouseDrag([[4, 1], [4, 2]]); // premier déplacement : le chronomètre part
  // avance rapide de l'horloge de la scène, par le même chemin que chaque image
  await evaluate('window.__embarquement.scene.update(0, 200000)');
  await waitFor(`!document.getElementById('overlay').hidden`);
  assert.equal(await text('overlay-title'), 'Temps écoulé');
  assert.equal(await text('clock'), '00:00');
  const s = await state();
  assert.equal(s.lost, true);
  await click('overlay-main');
  await sleep(150);
  assert.equal((await state()).lost, false);
});
