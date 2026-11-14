import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import '../styles/main.css';
import '../styles/olive.css';

import { STORM, clamp, type EndingKind } from './config/balance';
import {
  CENTER_TEXT, DIRECT_TEXT, ENDINGS, GO_TEXT, HEADLINES, INTRO_DURATION, INTRO_LINES, INTRO_PACE, JEANMI_YELL,
  PHASES, REPORTS, RICOCHET_TEXT, STREAK_TEXT, pick,
} from './config/messages';
import { previewPath } from './physics/world';
import { Mission, type MissionEvent, type ShotRecord } from './systems/mission';
import { awardMedals } from './systems/medals';
import { GAME_H, GAME_W, OliveScene } from './scenes/OliveScene';
import { OliveSfx } from './sfx';
import { loadOliveSave, writeOliveSave } from './save';
import { OliveUI, type ResultView } from './ui';
// le réglage du son est commun aux trois missions : il vit dans la sauvegarde d'origine
import { loadSave, writeSave } from '../storage/save';

type Phase = 'loading' | 'title' | 'intro' | 'play' | 'result';

const ui = new OliveUI();
const sfx = new OliveSfx();
const save = loadOliveSave();
const scene = new OliveScene();
scene.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let phase: Phase = 'loading';
let mission = new Mission();
let muted = loadSave().muted;
const aim = { angle: STORM.angleStart as number, power: STORM.powerStart as number };
let lastTickSec = 99;
let resultReadyAt = 0;
let lastResult: ResultView | null = null;
let timers: number[] = [];

const later = (fn: () => void, ms: number) => {
  timers.push(window.setTimeout(fn, ms));
};
const clearTimers = () => {
  timers.forEach((t) => window.clearTimeout(t));
  timers = [];
};

sfx.setMuted(muted);
ui.setMuted(muted);
ui.renderTitle(save);

// ---------------------------------------------------------------- Phaser
scene.onLoadProgress = (r) => ui.setLoading(`CHARGEMENT… ${Math.round(r * 100)}%`);
scene.onLoadError = (key) => {
  ui.setLoading(`ASSET MANQUANT : ${key}`, true);
  console.error(`[olive-storm] impossible de charger l'asset « ${key} »`);
};
scene.onReady = () => {
  if (phase !== 'loading') return;
  phase = 'title';
  ui.setScreen('title');
};
scene.onBark = (text, x, y, who) => ui.bark(text, x, y, who);
scene.onCue = (cue) => {
  switch (cue) {
    case 'ding': sfx.slowDing(0, false); break;
    case 'dong': sfx.slowDing(0, true); break;
    case 'ploc': sfx.ploc(); break;
    case 'crash': sfx.glassCrash(); break;
    case 'yell':
      sfx.yell();
      ui.yell(JEANMI_YELL);
      break;
    case 'siren': sfx.siren(); break;
    case 'ping': sfx.radarPing(); break;
    case 'rocket': sfx.rocket(); break;
    case 'woof': sfx.woof(); break;
  }
};
scene.onTick = tick;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE },
  audio: { noAudio: true },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  banner: false,
  scene,
});

// ---------------------------------------------------------------- déroulé
function resetStage(): void {
  clearTimers();
  stopHold();
  drag = null;
  sfx.stopTension();
  ui.clearOverlays();
  ui.setEnded(false);
  ui.setBusy(false);
  ui.clearIntro();
}

function goTitle(): void {
  resetStage();
  ui.renderTitle(save);
  scene.showTitle();
  phase = 'title';
  ui.setScreen('title');
}

function resetRound(): void {
  mission = new Mission();
  aim.angle = STORM.angleStart;
  aim.power = STORM.powerStart;
  ui.updateCounts(0, STORM.shots, 0);
  ui.updateTimer(STORM.duration);
  ui.setPhase(1, 0);
  ui.updateAim(aim.angle, aim.power);
}

function startIntro(): void {
  resetStage();
  sfx.unlock();
  sfx.ui();
  resetRound();
  phase = 'intro';
  ui.setScreen('intro');

  // briefing rejoué à chaque mission ; un appui (touche, clic ou toucher) le passe
  scene.playIntro(INTRO_DURATION);
  sfx.introRoll();
  INTRO_LINES.forEach((line, i) => later(() => typeLine(line), INTRO_PACE.start + i * INTRO_PACE.lineEvery));
  later(beginPlay, INTRO_DURATION);
}

function typeLine(text: string): void {
  const el = ui.addIntroLine();
  let i = 0;
  const step = () => {
    if (phase !== 'intro' || !el.isConnected) return;
    i += 2;
    el.textContent = text.slice(0, i);
    sfx.typewriter();
    if (i < text.length) later(step, 28);
  };
  step();
}

function beginPlay(): void {
  if (phase !== 'intro') return;
  clearTimers();
  ui.showGo(GO_TEXT);
  sfx.go();
  scene.startPlay();
  resetRound();
  lastTickSec = 99;
  phase = 'play';
  ui.setScreen('play');
  refreshAim();
  later(() => phase === 'play' && ui.announce(PHASES[1].announce), 700);
}

// ---------------------------------------------------------------- visée et tir
/** Recalcule les pointillés avec le modèle physique du tir, vent compris. */
function refreshAim(): void {
  ui.updateAim(aim.angle, aim.power);
  if (phase !== 'play' || !mission.canFire) {
    scene.setAim(aim.angle, aim.power, null);
    return;
  }
  const { segments, discs } = mission.obstacles;
  const path = previewPath(aim.angle, aim.power, mission.wind, STORM.preview[mission.phase - 1], segments, discs);
  scene.setAim(aim.angle, aim.power, path);
}

function setAim(angle: number, power: number): void {
  const a = clamp(angle, STORM.angleMin, STORM.angleMax);
  const p = clamp(power, 0, 1);
  if (a === aim.angle && p === aim.power) return;
  if (Math.round(p * 50) !== Math.round(aim.power * 50) || Math.round(a / 2) !== Math.round(aim.angle / 2)) sfx.ratchet(p);
  aim.angle = a;
  aim.power = p;
  refreshAim();
}

function nudge(dAngle: number, dPower: number): void {
  if (phase !== 'play' || !mission.canFire) return;
  setAim(aim.angle + dAngle, aim.power + dPower);
}

function fire(): void {
  if (phase !== 'play') return;
  if (!mission.fire(aim.angle, aim.power)) return;
  sfx.launchShot(aim.power);
  scene.fireFx();
  ui.setBusy(true);
  ui.updateCounts(mission.scored, mission.shotsLeft, mission.score);
  refreshAim();
}

function tick(dt: number): void {
  if (phase !== 'play') return;
  for (const event of mission.update(dt)) onEvent(event);
  scene.syncOlive(mission.olive);
  scene.syncBoxer(mission.boxer(), mission.phase === 3 && !mission.ending);
  ui.updateTimer(mission.timeLeft);

  const sec = Math.ceil(mission.timeLeft);
  if (sec !== lastTickSec && sec <= 5 && sec > 0) sfx.tick(sec <= 3);
  lastTickSec = sec;
}

function onEvent(e: MissionEvent): void {
  switch (e.type) {
    case 'bounce': {
      const o = mission.olive;
      sfx.bounce(e.contact.mat, e.contact.speed);
      if (o) scene.bounceFx(o.x, o.y, e.contact.mat === 'metal', e.contact.speed);
      break;
    }
    case 'enter':
      sfx.bounce('glass', 120);
      break;
    case 'resolved':
      onResolved(e.shot, e.x, e.y);
      break;
    case 'phase':
      ui.setPhase(e.phase, mission.wind);
      later(() => {
        if (phase !== 'play') return;
        ui.announce(PHASES[e.phase].announce);
        sfx.phase();
        if (e.phase === 2) {
          scene.setFan(true);
          sfx.fanStart();
          // ronflement continu du ventilateur
          sfx.startTension();
          sfx.setTension(34);
        } else {
          sfx.woof(0.5);
        }
      }, 650);
      break;
    case 'boxer-warn':
      sfx.woof();
      ui.bark('WOUF !', 90, 74, 'boxer');
      break;
    case 'boxer-leap':
      break;
    case 'end':
      finish(e.kind);
      break;
  }
}

function onResolved(shot: ShotRecord, x: number, y: number): void {
  scene.resolveFx(shot.fate, x, y);
  ui.setBusy(false);
  ui.updateCounts(mission.scored, mission.shotsLeft, mission.score, shot.fate === 'scored');
  scene.setArmed(mission.canFire);

  const px = (x / GAME_W) * 100;
  const py = (clamp(y, 30, GAME_H) / GAME_H) * 100 - 12;
  if (shot.fate === 'scored') {
    sfx.plop();
    const p = shot.points;
    const parts = [`+${p.olive}`, shot.direct ? `${DIRECT_TEXT} +${p.direct}` : `${RICOCHET_TEXT} +${p.ricochet}`];
    if (p.center) parts.push(`${CENTER_TEXT} +${p.center}`);
    ui.verdict(`+${shot.total}`, parts.join(' · '), true, px, py);
    if (p.streak) later(() => ui.verdict(`${STREAK_TEXT} +${p.streak}`, '', true, 50, 40), 250);
  } else {
    if (shot.fate === 'dog') sfx.chomp();
    else if (shot.fate === 'space') sfx.rocket();
    else if (shot.fate === 'lost') sfx.splat();
    ui.verdict(shot.fate === 'dog' ? 'INTERCEPTÉE' : 'MANQUÉ', '', false, px, py);
  }
  later(() => phase === 'play' && ui.bark(pick(REPORTS[shot.fate]), 30, 34, 'chuck'), 220);
  refreshAim();
}

/** Mise en scène de chaque dénouement (ms) : titre plaqué, puis panneau de résultat. */
const STAGING: Record<EndingKind, { banner: number; panel: number }> = {
  victory: { banner: 1000, panel: 3400 },
  space: { banner: 1900, panel: 5200 },
  dog: { banner: 1200, panel: 3800 },
  diplomatic: { banner: 7400, panel: 9600 },
};

function finish(kind: EndingKind): void {
  if (phase !== 'play') return;
  phase = 'result';
  clearTimers();
  stopHold();
  drag = null;
  // victoire : arrêt net de l'ambiance, un silence, puis la fanfare
  sfx.stopTension();
  ui.setEnded(true);
  ui.setBusy(false);
  scene.setAim(aim.angle, aim.power, null);

  save.plays++;
  if (kind === 'victory') save.wins++;
  else save[kind]++;
  save.olives += mission.scored;
  save.shots += mission.used;
  const record = mission.score > save.best;
  if (record) save.best = mission.score;
  const newMedals = awardMedals(save, { kind, shots: mission.shots, score: mission.score });
  writeOliveSave(save);

  // on laisse le dernier tir se lire avant de lancer la séquence
  const lead = 550;
  later(() => {
    ui.clearOverlays();
    switch (kind) {
      case 'victory':
        scene.victory();
        later(() => sfx.fanfareOlive(), 650);
        break;
      case 'space':
        scene.failSpace();
        break;
      case 'dog':
        scene.failDog();
        break;
      case 'diplomatic':
        scene.failDiplomatic();
        break;
    }
  }, lead);

  const staging = STAGING[kind];
  later(() => ui.showBanner(HEADLINES[kind], kind), lead + staging.banner);
  lastResult = {
    kind,
    lines: ENDINGS[kind],
    score: mission.score,
    best: save.best,
    record: record && mission.score > 0,
    scored: mission.scored,
    used: mission.used,
    accuracy: mission.accuracy,
    elapsed: mission.elapsed,
    newMedals,
  };
  resultReadyAt = performance.now() + lead + staging.panel + 450;
  later(() => {
    if (!lastResult) return;
    ui.renderResult(lastResult);
    ui.setScreen('result');
    if (newMedals.length) sfx.medal();
  }, lead + staging.panel);
}

async function share(): Promise<void> {
  if (!lastResult) return;
  const r = lastResult;
  const url = location.origin + location.pathname;
  const text: Record<EndingKind, string> = {
    victory: `Trois olives dans le verre en ${r.used} tirs (${r.score} pts). La France contrôle l'espace aérien de l'apéritif.`,
    space: "J'ai tiré une olive si fort qu'elle survole Toulouse. L'armée de l'air a été informée.",
    dog: 'Mon boxer a intercepté ma dernière olive. La défense anti-aérienne a changé de camp.',
    diplomatic: "Mon olive a fini sur le crâne de Jean-Mi. Conflit de voisinage niveau 5.",
  };
  const payload = `${text[r.kind]} — CHUCK MAURICE : OLIVE STORM`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Chuck Maurice — Olive Storm', text: payload, url });
    } else {
      await navigator.clipboard.writeText(`${payload} ${url}`);
      ui.shareBtn.textContent = 'COPIÉ !';
    }
  } catch {
    /* partage annulé */
  }
}

function toggleMute(): void {
  muted = !muted;
  sfx.unlock();
  sfx.setMuted(muted);
  ui.setMuted(muted);
  writeSave({ ...loadSave(), muted });
}

/** Action « valider » : dépend de l'écran courant. */
function confirm(): void {
  if (phase === 'title') startIntro();
  else if (phase === 'intro') beginPlay();
  else if (phase === 'result' && ui.screen === 'result' && performance.now() > resultReadyAt) startIntro();
}

// ---------------------------------------------------------------- entrées
function press(el: HTMLElement, fn: () => void): void {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    el.classList.add('is-down');
    fn();
  });
  const up = () => el.classList.remove('is-down');
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('click', (e) => {
    if (e.detail === 0) fn();
  });
}

/** Boutons de réglage : un appui règle d'un cran, un appui maintenu continue. */
let holdTimer = 0;
function stopHold(): void {
  window.clearInterval(holdTimer);
  window.clearTimeout(holdTimer);
  holdTimer = 0;
}
function hold(el: HTMLElement, fn: () => void): void {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    el.classList.add('is-down');
    stopHold();
    fn();
    holdTimer = window.setTimeout(() => {
      holdTimer = window.setInterval(fn, 45);
    }, 280);
  });
  const up = () => {
    el.classList.remove('is-down');
    stopHold();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('click', (e) => {
    if (e.detail === 0) fn();
  });
}

press(ui.startBtn, startIntro);
press(ui.fireBtn, fire);
hold(ui.angleUpBtn, () => nudge(STORM.angleStep * 2, 0));
hold(ui.angleDownBtn, () => nudge(-STORM.angleStep * 2, 0));
hold(ui.powerUpBtn, () => nudge(0, STORM.powerStep * 2));
hold(ui.powerDownBtn, () => nudge(0, -STORM.powerStep * 2));
press(ui.retryBtn, () => {
  if (performance.now() > resultReadyAt - 450) startIntro();
});
press(ui.menuBtn, goTitle);
press(ui.muteBtn, toggleMute);
ui.shareBtn.addEventListener('click', () => void share());

/**
 * Visée « lance-pierre » : on pose le doigt (ou le curseur) n'importe où sur la scène, on tire vers
 * l'arrière, on relâche. La direction du tir est l'opposé du geste, la puissance sa longueur.
 */
let drag: { id: number; x: number; y: number; moved: boolean } | null = null;

function toLogical(e: PointerEvent): { x: number; y: number } {
  const r = ui.stage.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * GAME_W, y: ((e.clientY - r.top) / r.height) * GAME_H };
}

ui.stage.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (phase === 'intro') {
    beginPlay();
    return;
  }
  if (phase !== 'play' || !mission.canFire) return;
  e.preventDefault();
  drag = { id: e.pointerId, ...toLogical(e), moved: false };
  try {
    ui.stage.setPointerCapture(e.pointerId);
  } catch {
    /* pointeur synthétique ou déjà relâché */
  }
});

ui.stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id || phase !== 'play') return;
  const p = toLogical(e);
  const pullX = drag.x - p.x;
  const pullY = drag.y - p.y;
  const len = Math.hypot(pullX, pullY);
  if (len < 4) return;
  drag.moved = true;
  // y écran vers le bas : tirer vers le bas-gauche vise en haut à droite
  setAim((Math.atan2(-pullY, pullX) * 180) / Math.PI, len / STORM.dragFull);
});

function release(e: PointerEvent, cancelled: boolean): void {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = drag.moved;
  drag = null;
  if (cancelled || !moved || phase !== 'play') return;
  // un tirage trop court annule : on peut renoncer sans gaspiller une olive
  if (aim.power < STORM.dragCancel) return;
  fire();
}
ui.stage.addEventListener('pointerup', (e) => release(e, false));
ui.stage.addEventListener('pointercancel', (e) => release(e, true));

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  const onControl = target?.tagName === 'BUTTON' || target?.tagName === 'A';
  const fast = e.shiftKey ? 3 : 1;
  switch (e.code) {
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      if (phase !== 'play') return;
      e.preventDefault();
      if (e.code === 'ArrowUp') nudge(STORM.angleStep * fast, 0);
      else if (e.code === 'ArrowDown') nudge(-STORM.angleStep * fast, 0);
      else if (e.code === 'ArrowRight') nudge(0, STORM.powerStep * fast);
      else nudge(0, -STORM.powerStep * fast);
      break;
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
    case 'KeyF':
      if (phase === 'play') {
        e.preventDefault();
        if (onControl) target.blur();
        if (!e.repeat) fire();
      } else if (onControl && e.code !== 'KeyF') {
        return; // activation native du bouton ou du lien focalisé
      } else {
        e.preventDefault();
        if (!e.repeat) confirm();
      }
      break;
    case 'KeyM':
      toggleMute();
      break;
    case 'Escape':
      if (phase !== 'loading' && phase !== 'title') goTitle();
      break;
  }
});

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sfx.stopTension();
  else if (phase === 'play' && mission.phase >= 2) {
    sfx.startTension();
    sfx.setTension(34);
  }
});
