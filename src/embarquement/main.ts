/**
 * Page du prototype Embarquement : charge le niveau JSON, applique les
 * hypothèses de règles (niveau, URL, panneau), relie le moteur à la scène
 * Phaser et gère l'habillage HTML : chronomètre, pause, victoire, défaite,
 * panneau des hypothèses et panneau de débogage.
 */
import Phaser from 'phaser';
import '../styles/embarquement.css';

import { PuzzleEngine, RulesError } from './engine/engine';
import { LevelError, levelWarnings, parseLevel } from './engine/level';
import { DEFAULT_RULES, RULE_DOCS, isRuleValue, resolveRules } from './engine/rules';
import type { EngineEvent, Level, Rules } from './engine/types';
import { DEFAULT_LEVEL, LEVELS } from './levels';
import { BoardScene } from './view/BoardScene';
import { computeLayout, formatClock, marginsFor, type Layout } from './view/geometry';
import { cssColor, shadeOf } from './view/palette';
import { bindPointer } from './view/pointer';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const ui = {
  app: byId('app'),
  board: byId('board'),
  levelNumber: byId('level-number'),
  levelName: byId('level-name'),
  clock: byId('clock'),
  peopleLeft: byId('people-left'),
  restart: byId<HTMLButtonElement>('restart'),
  pause: byId<HTMLButtonElement>('pause'),
  overlay: byId('overlay'),
  overlayTitle: byId('overlay-title'),
  overlayDetail: byId('overlay-detail'),
  overlayMain: byId<HTMLButtonElement>('overlay-main'),
  overlayAlt: byId<HTMLButtonElement>('overlay-alt'),
  error: byId('error'),
  toggleRules: byId<HTMLButtonElement>('toggle-rules'),
  toggleDebug: byId<HTMLButtonElement>('toggle-debug'),
  rules: byId('rules'),
  rulesForm: byId<HTMLFormElement>('rules-form'),
  rulesNotes: byId('rules-notes'),
  rulesReset: byId<HTMLButtonElement>('rules-reset'),
  debug: byId('debug'),
  dbgTimerOff: byId<HTMLInputElement>('dbg-timer-off'),
  dbgGrid: byId<HTMLInputElement>('dbg-grid'),
  dbgReload: byId<HTMLButtonElement>('dbg-reload'),
  dbgPiece: byId('dbg-piece'),
  dbgFeeders: byId('dbg-feeders'),
  dbgLog: byId<HTMLOListElement>('dbg-log'),
};

const params = new URLSearchParams(location.search);

function fatal(title: string, lines: string[]): never {
  ui.error.hidden = false;
  ui.error.replaceChildren();
  const h = document.createElement('p');
  h.className = 'error-title';
  h.textContent = title;
  const list = document.createElement('ul');
  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    list.append(li);
  }
  ui.error.append(h, list);
  ui.restart.disabled = true;
  ui.pause.disabled = true;
  throw new Error(`${title}\n${lines.join('\n')}`);
}

// ------------------------------------------------------------------ niveau

const levelId = params.get('level') ?? DEFAULT_LEVEL;

function loadLevel(): Level {
  try {
    if (!(levelId in LEVELS)) fatal(`Niveau « ${levelId} » introuvable`, [`Niveaux disponibles : ${Object.keys(LEVELS).join(', ')}`]);
    return parseLevel(LEVELS[levelId]);
  } catch (e) {
    if (e instanceof LevelError) fatal('Niveau invalide', e.errors);
    throw e;
  }
}

let level = loadLevel();
ui.levelNumber.textContent = level.number === null ? '–' : String(level.number);
ui.levelName.textContent = level.name;

// ------------------------------------------------------------------ règles

/** Réglages lus dans l'URL (`?contact=side&capacity=2`…), refusés s'ils sont inconnus. */
function rulesFromUrl(): { overrides: Partial<Rules>; errors: string[] } {
  const overrides: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const doc of RULE_DOCS) {
    const raw = params.get(doc.key);
    if (raw === null) continue;
    const value: unknown = /^\d+$/.test(raw) ? Number(raw) : raw;
    if (isRuleValue(doc.key, value)) overrides[doc.key] = value;
    else errors.push(`URL : « ${doc.key}=${raw} » ignoré (valeur inconnue)`);
  }
  return { overrides: overrides as Partial<Rules>, errors };
}

const timerOn = () => !ui.dbgTimerOff.checked;

let overrides: Partial<Rules>;
let engine: PuzzleEngine;
{
  const fromUrl = rulesFromUrl();
  overrides = fromUrl.overrides;
  let notes = fromUrl.errors;
  try {
    engine = new PuzzleEngine(level, overrides, { timer: timerOn() });
  } catch (e) {
    if (!(e instanceof RulesError)) throw e;
    notes = [...notes, ...e.errors, "Réglages de l'URL ignorés."];
    overrides = {};
    engine = new PuzzleEngine(level, {}, { timer: timerOn() });
  }
  buildRulesForm();
  showNotes([...notes.map((text) => ({ text, kind: 'error' as const })), ...warningNotes()]);
}

function buildRulesForm(): void {
  ui.rulesForm.replaceChildren();
  for (const doc of RULE_DOCS) {
    const id = `rule-${doc.key}`;
    const row = document.createElement('div');
    row.className = 'rule';
    const label = document.createElement('label');
    label.htmlFor = id;
    const code = document.createElement('b');
    code.textContent = doc.code;
    const tag = document.createElement('span');
    tag.className = `tag tag-${doc.evidence.replace(/\s/g, '-').replace('é', 'e')}`;
    tag.textContent = doc.evidence;
    tag.title = doc.basis;
    label.append(code, ` ${doc.title} `, tag);
    const select = document.createElement('select');
    select.id = id;
    select.dataset.rule = doc.key;
    for (const choice of doc.choices) {
      const option = document.createElement('option');
      option.value = String(choice.value);
      option.textContent = choice.label + (choice.value === DEFAULT_RULES[doc.key] ? ' (défaut)' : '');
      select.append(option);
    }
    select.value = String(engine.rules[doc.key]);
    const help = document.createElement('small');
    help.textContent = `${doc.help} Preuve : ${doc.basis}`;
    row.append(label, select, help);
    ui.rulesForm.append(row);
  }
}

function rulesFromForm(): Partial<Rules> {
  const out: Record<string, unknown> = {};
  for (const select of ui.rulesForm.querySelectorAll<HTMLSelectElement>('select[data-rule]')) {
    const raw = select.value;
    out[select.dataset.rule!] = /^\d+$/.test(raw) ? Number(raw) : raw;
  }
  return out as Partial<Rules>;
}

type Note = { text: string; kind: 'error' | 'warn' | 'info' };

function warningNotes(): Note[] {
  return levelWarnings(level, engine.rules).map((text) => ({ text, kind: 'warn' }));
}

function showNotes(notes: Note[]): void {
  ui.rulesNotes.replaceChildren(
    ...notes.map((note) => {
      const p = document.createElement('p');
      p.className = `note note-${note.kind}`;
      p.textContent = note.text;
      return p;
    }),
  );
}

/** Relance le niveau sous de nouvelles règles ; refuse une combinaison incohérente sans toucher à la partie. */
function applyRules(next: Partial<Rules>): void {
  let fresh: PuzzleEngine;
  try {
    fresh = new PuzzleEngine(level, next, { timer: timerOn() });
  } catch (e) {
    if (!(e instanceof RulesError)) throw e;
    showNotes([...e.errors.map((text) => ({ text, kind: 'error' as const })), { text: 'Combinaison refusée : la partie continue avec les règles précédentes.', kind: 'info' }]);
    return;
  }
  overrides = next;
  engine = fresh;
  syncUrl();
  showNotes([{ text: 'Règles appliquées, niveau relancé.', kind: 'info' }, ...warningNotes()]);
  log('règles changées, niveau relancé');
  startGame();
}

/** Garde dans l'URL les seuls réglages qui diffèrent de ceux du niveau, pour partager une configuration. */
function syncUrl(): void {
  const base = resolveRules(level.rules);
  const next = new URLSearchParams();
  for (const key of ['level', 'debug']) if (params.has(key)) next.set(key, params.get(key) ?? '');
  for (const doc of RULE_DOCS) {
    const value = overrides[doc.key];
    if (value !== undefined && value !== base[doc.key]) next.set(doc.key, String(value));
  }
  const qs = next.toString().replace(/=(&|$)/g, '$1');
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ------------------------------------------------------------------ partie

const scene = new BoardScene();
scene.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let layout: Layout | null = null;
let shownClock = '';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: ui.board,
  width: 64,
  height: 64,
  transparent: true,
  antialias: true,
  scale: { mode: Phaser.Scale.NONE },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  banner: false,
  scene,
});

scene.onReady = () => {
  fit();
  startGame();
  bindPointer(game.canvas, {
    down: (x, y) => scene.pointerDown(x, y),
    move: (x, y) => scene.pointerMove(x, y),
    up: () => scene.pointerUp(),
    canGrab: (x, y) => scene.canGrab(x, y),
  });
};
scene.onChange = (events) => {
  updateHud();
  logEvents(events);
  renderDebug();
};
scene.onSelect = (id) => {
  const p = engine.piece(id)!;
  gesture = { id, from: `(${p.x},${p.y})`, line: log(`${id} saisie en (${p.x},${p.y})`) };
  renderDebug();
};
scene.onClock = (ms) => {
  const text = formatClock(ms);
  if (text !== shownClock) {
    shownClock = text;
    ui.clock.textContent = text;
  }
  ui.clock.classList.toggle('is-low', ms !== null && ms <= 20_000 && engine.clockRunning);
  ui.clock.classList.toggle('is-idle', !engine.clockRunning);
};
scene.onWon = (moves, leftMs) => {
  const left = leftMs === null ? '' : `Temps restant : ${formatClock(leftMs)}. `;
  showOverlay('Niveau réussi !', `${left}${moves} coup${moves > 1 ? 's' : ''}.`, ['Rejouer', restart]);
};
scene.onLost = () => {
  showOverlay('Temps écoulé', `Il restait ${engine.peopleLeft} personnage${engine.peopleLeft > 1 ? 's' : ''} à embarquer.`, ['Recommencer', restart]);
};

function startGame(): void {
  hideOverlay();
  engine.setTimerEnabled(timerOn());
  if (layout) scene.show(engine, layout);
  updateHud();
  renderDebug();
}

function restart(): void {
  engine.reset();
  log('niveau recommencé');
  startGame();
}

/** Relit le fichier du niveau et repart de zéro (mode DEBUG). */
function reloadLevel(): void {
  level = loadLevel();
  engine = new PuzzleEngine(level, overrides, { timer: timerOn() });
  log('niveau rechargé');
  startGame();
}

function togglePause(): void {
  if (engine.isPaused) {
    engine.resume();
    hideOverlay();
    log('reprise');
  } else if (engine.pause()) {
    scene.cancelGesture();
    showOverlay('Pause', 'La partie et le chronomètre sont arrêtés.', ['Reprendre', togglePause], ['Recommencer', restart]);
    log('pause');
  }
  updateHud();
}

function updateHud(): void {
  ui.peopleLeft.textContent = String(engine.peopleLeft);
  ui.pause.disabled = engine.isWon || engine.isLost;
  ui.pause.setAttribute('aria-pressed', String(engine.isPaused));
}

type Action = [label: string, run: () => void];

function showOverlay(title: string, detail: string, main: Action, alt?: Action): void {
  ui.overlayTitle.textContent = title;
  ui.overlayDetail.textContent = detail;
  ui.overlayMain.textContent = main[0];
  ui.overlayMain.onclick = main[1];
  ui.overlayAlt.hidden = !alt;
  if (alt) {
    ui.overlayAlt.textContent = alt[0];
    ui.overlayAlt.onclick = alt[1];
  }
  ui.overlay.hidden = false;
  ui.overlayMain.focus();
}

function hideOverlay(): void {
  ui.overlay.hidden = true;
}

/** Ajuste le canevas à la place disponible, à la densité réelle de l'écran. */
function fit(): void {
  const style = getComputedStyle(ui.board);
  const w = ui.board.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const h = ui.board.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  if (w < 1 || h < 1) return;
  const margins = marginsFor(level.feeders.map((f) => f.side));
  const next = computeLayout(level.width, level.height, w, h, window.devicePixelRatio, margins);
  if (layout && next.cell === layout.cell && next.dpr === layout.dpr && next.width === layout.width) return;
  layout = next;
  game.scale.setZoom(1 / next.dpr);
  game.scale.resize(next.width, next.height);
  scene.relayout(next);
}

let fitQueued = false;
new ResizeObserver(() => {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    if (layout) fit();
  });
}).observe(ui.board);

// ------------------------------------------------------------------ débogage

let gesture: { id: string; from: string; line: HTMLLIElement } | null = null;

function log(text: string): HTMLLIElement {
  const li = document.createElement('li');
  const left = engine?.timeLeftMs ?? null;
  li.textContent = `${left === null ? '' : `[${formatClock(left)}] `}${text}`;
  ui.dbgLog.prepend(li);
  while (ui.dbgLog.children.length > 60) ui.dbgLog.lastElementChild!.remove();
  return li;
}

function logEvents(events: readonly EngineEvent[]): void {
  for (const e of events) {
    if (e.type === 'moved' && gesture?.id === e.pieceId) {
      gesture.line.textContent = gesture.line.textContent!.replace(/( → \(\d+,\d+\))?$/, ` → (${e.to.x},${e.to.y})`);
    } else if (e.type === 'collected') {
      const from = e.feederId ? `du distributeur « ${e.feederId} »` : 'de la grille';
      log(`${e.pieceId} embarque ${e.characterIds.length} ${from} (reste ${e.capacity - e.load})`);
    } else if (e.type === 'removed') log(`${e.pieceId} pleine : retirée`);
    else if (e.type === 'full' && engine.rules.whenFull === 'stay') log(`${e.pieceId} pleine : figée`);
    else if (e.type === 'clock-started') log('chronomètre lancé');
    else if (e.type === 'won') log(`victoire en ${e.moves} coups`);
    else if (e.type === 'lost') log('temps écoulé : défaite');
  }
}

function chip(color: string, head = false): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = head ? 'chip chip-head' : 'chip';
  span.style.background = cssColor(color);
  span.title = shadeOf(color).label;
  return span;
}

function renderDebug(): void {
  if (ui.debug.hidden) return;
  const id = scene.selectedId;
  const p = id ? engine.piece(id) : undefined;
  if (!p) ui.dbgPiece.textContent = 'Touchez une pièce pour la sélectionner.';
  else {
    const cells = engine.cellsOf(p.id).map((c) => `(${c.x},${c.y})`).join(' ');
    const state = p.removed ? 'retirée' : p.full ? 'pleine' : 'en jeu';
    ui.dbgPiece.replaceChildren();
    const rows: [string, string | Node][] = [
      ['Pièce', p.id],
      ['Couleur', shadeOf(p.color).label],
      ['Ancre', p.removed ? '—' : `(${p.x},${p.y})`],
      ['Cases', p.removed ? '—' : cells],
      ['Compteur', `${p.remaining} / ${p.capacity}`],
      ['État', state],
    ];
    const dl = document.createElement('dl');
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.append(v);
      dl.append(dt, dd);
    }
    ui.dbgPiece.append(dl);
  }
  ui.dbgFeeders.replaceChildren(
    ...engine.feederList.map((f) => {
      const div = document.createElement('div');
      div.className = 'dbg-feeder';
      const side = { top: 'haut', bottom: 'bas', left: 'gauche', right: 'droite' }[f.def.side];
      const head = document.createElement('p');
      head.textContent = `« ${f.def.id} » — bord ${side}, entrée (${f.def.entry.x},${f.def.entry.y}), reste ${f.pending.length}`;
      if (f.def.unverified) {
        const tag = document.createElement('span');
        tag.className = 'tag tag-non-verifie';
        tag.textContent = 'séquence non vérifiée';
        head.append(' ', tag);
      }
      const queue = document.createElement('div');
      queue.className = 'chips';
      if (f.pending.length === 0) queue.textContent = 'vide';
      else queue.append(...f.pending.map((c, i) => chip(c, i === 0)));
      div.append(head, queue);
      return div;
    }),
  );
  if (engine.feederList.length === 0) ui.dbgFeeders.textContent = 'Aucun distributeur dans ce niveau.';
}

// ------------------------------------------------------------------ habillage

function openSheet(which: 'rules' | 'debug' | null): void {
  for (const [name, sheet, toggle] of [['rules', ui.rules, ui.toggleRules], ['debug', ui.debug, ui.toggleDebug]] as const) {
    const open = which === name;
    sheet.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  ui.app.classList.toggle('sheet-open', which !== null);
  scene.setDebug(which === 'debug' && ui.dbgGrid.checked);
  renderDebug();
}

ui.restart.addEventListener('click', restart);
ui.pause.addEventListener('click', togglePause);
ui.toggleRules.addEventListener('click', () => openSheet(ui.rules.hidden ? 'rules' : null));
ui.toggleDebug.addEventListener('click', () => openSheet(ui.debug.hidden ? 'debug' : null));
for (const close of document.querySelectorAll<HTMLButtonElement>('[data-close]')) close.addEventListener('click', () => openSheet(null));
ui.rulesForm.addEventListener('change', () => applyRules(rulesFromForm()));
ui.rulesReset.addEventListener('click', () => {
  overrides = {};
  engine = new PuzzleEngine(level, {}, { timer: timerOn() });
  buildRulesForm();
  syncUrl();
  showNotes([{ text: 'Règles du niveau rétablies.', kind: 'info' }, ...warningNotes()]);
  startGame();
});
ui.dbgTimerOff.addEventListener('change', () => {
  engine.setTimerEnabled(timerOn());
  log(timerOn() ? 'chronomètre réactivé' : 'chronomètre désactivé');
});
ui.dbgGrid.addEventListener('change', () => scene.setDebug(ui.dbgGrid.checked));
ui.dbgReload.addEventListener('click', reloadLevel);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-nudge]')) {
  b.addEventListener('click', () => {
    const [dx, dy] = b.dataset.nudge!.split(',').map(Number);
    scene.nudgeSelected(dx, dy);
  });
}

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key === 'p' || e.key === 'P') togglePause();
  else if (e.key === 'Escape') {
    if (!ui.rules.hidden || !ui.debug.hidden) openSheet(null);
    else if (engine.isPaused) togglePause();
  } else if (arrows[e.key] && !ui.debug.hidden) {
    e.preventDefault();
    scene.nudgeSelected(...arrows[e.key]);
  }
});

if (params.has('debug')) openSheet('debug');
else if (params.has('rules')) openSheet('rules');

// accès de test, en développement seulement : rien n'est exposé en production
if (import.meta.env.DEV) {
  Object.assign(window, {
    __embarquement: {
      get engine() { return engine; },
      get layout() { return layout; },
      game, scene, restart, applyRules, togglePause,
    },
  });
}
