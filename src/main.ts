import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import './styles/main.css';

import { BALANCE, scoreFor, type Outcome } from './game/config/balance';
import { CHUCK_BARKS, HEADLINES, INTRO_LINES, JAR_BARKS, MESSAGES, pick } from './game/config/messages';
import { Round } from './game/systems/round';
import { GAME_H, GAME_W, KitchenScene } from './game/scenes/KitchenScene';
import { Sfx } from './audio/sfx';
import { awardMedals, type RoundSummary } from './game/systems/medals';
import { loadSave, writeSave } from './storage/save';
import { UI, type ResultView } from './ui/ui';

type Phase = 'loading' | 'title' | 'intro' | 'play' | 'lock' | 'result';

const ui = new UI();
const sfx = new Sfx();
const save = loadSave();
const scene = new KitchenScene();
scene.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let phase: Phase = 'loading';
let round = new Round();
let lockLeft = 0;
let sessionRounds = 0;
let lastBarkAt = 0;
let lastBarkTier = 0;
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

sfx.setMuted(save.muted);
ui.setMuted(save.muted);
ui.renderTitle(save);

// ---------------------------------------------------------------- Phaser
scene.onLoadProgress = (r) => ui.setLoading(`CHARGEMENT… ${Math.round(r * 100)}%`);
scene.onLoadError = (key) => {
  ui.setLoading(`ASSET MANQUANT : ${key}`, true);
  console.error(`[cornichon] impossible de charger l'asset « ${key} »`);
};
scene.onReady = () => {
  if (phase !== 'loading') return;
  void document.fonts?.ready;
  phase = 'title';
  ui.setScreen('title');
};
scene.onBark = (text, x, y, who) => ui.bark(text, x, y, who);
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
function goTitle(): void {
  clearTimers();
  sfx.stopTension();
  ui.hideBanner();
  ui.setEnded(false);
  ui.clearIntro();
  ui.clearBarks();
  ui.renderTitle(save);
  scene.showTitle();
  phase = 'title';
  ui.setScreen('title');
}

function startIntro(): void {
  clearTimers();
  sfx.unlock();
  sfx.ui();
  sfx.stopTension();
  ui.hideBanner();
  ui.setEnded(false);
  ui.clearIntro();
  ui.clearBarks();
  round = new Round();
  ui.updateHud(0, BALANCE.duration);
  phase = 'intro';
  ui.setScreen('intro');

  const long = sessionRounds === 0;
  sessionRounds++;
  scene.playIntro(long);

  if (long) {
    sfx.introRoll();
    let t = 250;
    for (const line of INTRO_LINES) {
      later(() => typeLine(line), t);
      t += 950;
    }
    later(beginPlay, t + 350);
  } else {
    const p = ui.addIntroLine();
    p.textContent = `TENTATIVE N°${sessionRounds}`;
    sfx.drum();
    later(beginPlay, 750);
  }
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
  ui.showGo('TORDEZ !');
  sfx.go();
  sfx.startTension();
  scene.startPlay();
  round = new Round();
  lastBarkTier = 0;
  lastTickSec = 99;
  phase = 'play';
  ui.setScreen('play');
}

function pump(): void {
  if (phase !== 'play') return;
  round.tap();
  scene.tapFx();
  sfx.tap(round.power);
  if (round.taps % 5 === 0) sfx.grunt(round.power / 100);
  maybeBark();
}

function maybeBark(): void {
  const p = round.power;
  const tier = p >= 96 ? 4 : p >= 80 ? 3 : p >= 50 ? 2 : p >= 20 ? 1 : 0;
  const now = performance.now();
  if (tier > lastBarkTier && now - lastBarkAt > 500) {
    const list = [CHUCK_BARKS.warmup, CHUCK_BARKS.effort, CHUCK_BARKS.angry, CHUCK_BARKS.rage][tier - 1];
    ui.bark(pick(list), 30 + Math.random() * 10, 18 + Math.random() * 8, 'chuck');
    lastBarkAt = now;
  }
  lastBarkTier = tier;
}

function tryOpen(): void {
  if (phase !== 'play') return;
  const powerAtPress = round.power;
  const result = round.attempt();
  if (result === 'resist') {
    phase = 'lock';
    lockLeft = BALANCE.resistLock;
    scene.resistFx(BALANCE.resistLock);
    sfx.resist();
    ui.showBanner('ÇA RÉSISTE !', 'resist', false);
    ui.bark(pick(CHUCK_BARKS.resist), 32, 20, 'chuck');
    if (round.resists % 2 === 0) later(() => ui.bark(pick(JAR_BARKS), 66, 44, 'jar'), 250);
    lastBarkTier = 0;
    return;
  }
  finish(result, powerAtPress);
}

function tick(dt: number): void {
  if (phase !== 'play' && phase !== 'lock') return;
  round.update(dt);
  if (phase === 'lock') {
    lockLeft -= dt;
    if (lockLeft <= 0) phase = 'play';
  }
  ui.updateHud(round.power, round.timeLeft);
  scene.setEffort(round.power);
  sfx.setTension(round.power);

  const sec = Math.ceil(round.timeLeft);
  if (sec !== lastTickSec && sec <= 5 && sec > 0) sfx.tick(sec <= 3);
  lastTickSec = sec;

  if (round.timeLeft <= 0 && phase === 'play') finish('timeout', round.power);
}

function finish(outcome: Outcome, power: number): void {
  phase = 'result';
  clearTimers();
  sfx.stopTension();
  ui.clearBarks();
  ui.setEnded(true);

  const score = scoreFor(outcome, round.timeLeft, round.resists);
  const summary: RoundSummary = {
    outcome,
    timeLeft: round.timeLeft,
    elapsed: round.elapsed,
    resists: round.resists,
    score,
  };

  save.plays++;
  if (outcome === 'perfect') save.perfect++;
  else if (outcome === 'chaos') save.chaos++;
  else if (outcome === 'explosion') save.explosions++;
  else save.timeouts++;
  const record = score > save.best;
  if (record) save.best = score;
  if (score > 0 && (save.bestTime === null || round.elapsed < save.bestTime)) save.bestTime = round.elapsed;
  const newMedals = awardMedals(save, summary);
  writeSave(save);

  let panelDelay = 1500;
  switch (outcome) {
    case 'perfect':
      scene.win(true);
      sfx.pop();
      sfx.fanfare();
      break;
    case 'chaos':
      scene.win(false);
      sfx.pop();
      sfx.fanfare(true);
      break;
    case 'explosion':
      scene.explode();
      sfx.explosion();
      panelDelay = 2100;
      break;
    case 'timeout':
      scene.timeout();
      sfx.fail();
      later(() => ui.bark(pick(JAR_BARKS), 66, 40, 'jar'), 600);
      break;
  }

  ui.updateHud(power, round.timeLeft);
  ui.showBanner(pick(HEADLINES[outcome]), outcome, true);
  lastResult = {
    outcome,
    message: pick(MESSAGES[outcome]),
    score,
    record: record && score > 0,
    elapsed: round.elapsed,
    power,
    resists: round.resists,
    newMedals,
  };
  resultReadyAt = performance.now() + panelDelay + 450;
  later(() => {
    if (!lastResult) return;
    ui.renderResult(lastResult);
    ui.setScreen('result');
    if (newMedals.length) sfx.medal();
  }, panelDelay);
}

async function share(): Promise<void> {
  if (!lastResult) return;
  const r = lastResult;
  const url = location.origin + location.pathname;
  const text: Record<Outcome, string> = {
    perfect: `J'ai ouvert le bocal en ${r.elapsed.toFixed(1)} s (${r.score} pts). La France est sauvée.`,
    chaos: `J'ai ouvert le bocal (${r.score} pts). La cuisine s'en remettra. Probablement.`,
    explosion: `J'ai mis ${Math.floor(r.power)}% de puissance dans un pot de cornichons. 18 départements évacués.`,
    timeout: 'Le bocal a gagné. La nation est sous le choc.',
  };
  const payload = `${text[r.outcome]} — CHUCK MAURICE : OPÉRATION CORNICHON`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Chuck Maurice — Opération Cornichon', text: payload, url });
    } else {
      await navigator.clipboard.writeText(`${payload} ${url}`);
      ui.shareBtn.textContent = 'COPIÉ !';
    }
  } catch {
    /* partage annulé */
  }
}

function toggleMute(): void {
  save.muted = !save.muted;
  sfx.unlock();
  sfx.setMuted(save.muted);
  ui.setMuted(save.muted);
  writeSave(save);
}

/** Action « valider » : dépend de l'écran courant. */
function confirm(): void {
  if (phase === 'title') startIntro();
  else if (phase === 'intro') beginPlay();
  else if (phase === 'result' && ui.screen === 'result' && performance.now() > resultReadyAt) startIntro();
}

// ---------------------------------------------------------------- entrées
/** pointerdown plutôt que click : indispensable pour marteler sans latence. */
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
  // lecteurs d'écran / activation clavier : click sans pointerdown préalable
  el.addEventListener('click', (e) => {
    if (e.detail === 0) fn();
  });
}

press(ui.startBtn, startIntro);
press(ui.pumpBtn, pump);
press(ui.openBtn, tryOpen);
press(ui.retryBtn, () => {
  if (performance.now() > resultReadyAt - 450) startIntro();
});
press(ui.menuBtn, goTitle);
press(ui.muteBtn, toggleMute);
ui.shareBtn.addEventListener('click', () => void share());

// toucher la scène : marteler pendant le jeu, passer le briefing sinon
ui.stage.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (phase === 'play') pump();
  else if (phase === 'intro') beginPlay();
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  const onButton = target?.tagName === 'BUTTON';
  const playing = phase === 'play' || phase === 'lock';
  switch (e.code) {
    case 'Space':
    case 'ArrowUp':
    case 'KeyF':
    case 'Enter':
    case 'NumpadEnter':
    case 'KeyO': {
      const isOpenKey = e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'KeyO';
      if (playing) {
        // en jeu, le clavier pilote le jeu : un bouton resté focalisé ne doit pas s'activer
        e.preventDefault();
        if (onButton) target.blur();
        if (e.repeat) return;
        if (isOpenKey) tryOpen();
        else pump();
      } else if (onButton && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
        return; // activation native du bouton focalisé
      } else {
        e.preventDefault();
        if (!e.repeat) confirm();
      }
      break;
    }
    case 'KeyM':
      toggleMute();
      break;
    case 'Escape':
      if (phase !== 'loading' && phase !== 'title') goTitle();
      break;
  }
});

// confort mobile : pas de menu contextuel ni de zoom au double appui
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sfx.stopTension();
  else if (phase === 'play' || phase === 'lock') sfx.startTension();
});
