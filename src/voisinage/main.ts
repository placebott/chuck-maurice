import '../analytics';
import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import '../styles/main.css';
import '../styles/voisinage.css';

import { goHub } from '../hub';
import { DUEL, clamp, type Ending } from './config/balance';
import {
  ACTS, ALERT_TEXT, CAUGHT_TEXT, CHUCK_CAUGHT, CHUCK_NEXT, ENDINGS, GO_TEXT, INTRO_DURATION, INTRO_LINES, INTRO_PACE,
  JEANMI_CAUGHT, JEANMI_GRUMBLE, MILESTONES, ONOMA, PERFECT_ENDING, PERFECT_TEXT, pick,
} from './config/messages';
import { HoldState, bindHold } from './input';
import { Duel, type DuelEvent } from './systems/duel';
import { awardMedals, type Medal, type Summary } from './systems/medals';
import { scoreLines, totalScore } from './systems/score';
import { GAME_H, GAME_W, GardenScene, type SfxCue } from './scenes/GardenScene';
import { VoisinSfx } from './sfx';
import { loadVoisinSave, writeVoisinSave } from './save';
import { VoisinUI, type ResultView } from './ui';
// le réglage du son est commun aux quatre missions : il vit dans la sauvegarde d'origine
import { loadSave, writeSave } from '../storage/save';

/**
 * Machine à états de la page :
 * loading → title → intro → play → cine (cinématique de fin) → result → intro (revanche) / title.
 */
type Phase = 'loading' | 'title' | 'intro' | 'play' | 'cine' | 'result';

const ui = new VoisinUI();
const sfx = new VoisinSfx();
const save = loadVoisinSave();
const scene = new GardenScene();
const hold = new HoldState();
const systemCalm = window.matchMedia('(prefers-reduced-motion: reduce)');

let phase: Phase = 'loading';
let duel = new Duel();
let muted = loadSave().muted;
let calm = save.calm ?? systemCalm.matches;
let lastTickSec = 99;
let resultReadyAt = 0;
let lastResult: ResultView | null = null;
let summary: Summary | null = null;
let earned: Medal[] = [];
let engineOn = false;
let crackleClock = 0;
let chatterClock = 0;
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
ui.setCalm(calm);
scene.reducedMotion = calm;
ui.renderTitle(save);

// ---------------------------------------------------------------- Phaser
scene.onLoadProgress = (r) => ui.setLoading('CHARGEMENT… ' + Math.round(r * 100) + '%');
scene.onLoadError = (key) => {
  ui.setLoading('ASSET MANQUANT : ' + key, true);
  console.error("[bon-voisinage] impossible de charger l'asset « " + key + ' »');
};
scene.onReady = () => {
  if (phase !== 'loading') return;
  phase = 'title';
  // le QG remplace l'écran-titre : on entre directement en mission
  startIntro();
};
scene.onTick = tick;
scene.onCaption = (c) => ui.caption(c);
scene.onSfx = playCue;
scene.onCinematicDone = showResult;

const game = new Phaser.Game({
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

/** Jalons sonores envoyés par la scène et les cinématiques. */
function playCue(cue: SfxCue): void {
  switch (cue) {
    case 'ignition': sfx.ignition(); break;
    case 'backfire': sfx.backfire(); break;
    case 'roar': sfx.roar(); break;
    case 'spill': sfx.spill(); break;
    case 'clink': sfx.clink(); break;
    case 'puff': sfx.puff(); break;
    case 'flare': sfx.flare(); break;
    case 'cough':
      sfx.cough();
      if (phase === 'play' && Math.random() < 0.5) ui.bark('KOF !', 66, 34, 'jeanmi');
      break;
    case 'beat': sfx.beat(scene.beat, clamp((duel.rage - 80) / 20, 0, 1)); break;
    case 'drop': sfx.drum(); break;
    case 'thud': sfx.thud(); break;
    case 'hush': sfx.hush(); break;
    case 'scream': sfx.scream(true); break;
    case 'scream-short': sfx.scream(false); break;
    case 'sandal': sfx.sandal(); break;
    case 'effort': sfx.effort(); break;
    case 'creak': sfx.creak(); break;
    case 'rip': sfx.rip(); break;
    case 'fence': sfx.fence(); break;
    case 'wind': sfx.wind(); break;
    case 'glasses': sfx.glasses(); break;
    case 'chuck': sfx.chuckLine(); break;
    case 'fanfare': sfx.fanfareVoisin(); break;
    case 'bass': sfx.bassDrop(); break;
    case 'ploum': sfx.ploum(); break;
    case 'paper': sfx.paper(); break;
    case 'hehe': sfx.hehe(); break;
    case 'sigh': sfx.sigh(); break;
    case 'gulp': sfx.gulp(); break;
    case 'fail': sfx.fail(); break;
    case 'blip': sfx.blip(); break;
    case 'growl': sfx.growl(); break;
    case 'jingle': sfx.medal(); break;
  }
}

// ---------------------------------------------------------------- déroulé
function stopEngine(): void {
  if (!engineOn) return;
  engineOn = false;
  sfx.stopTension();
}

/** Tout changement d'état du jeu relâche la commande : il faudra rappuyer. */
function resetInput(): void {
  hold.reset();
  ui.setHeld(false);
}

function resetStage(): void {
  clearTimers();
  resetInput();
  stopEngine();
  ui.clearOverlays();
  ui.setEnded(false);
  ui.clearIntro();
}


function resetRound(): void {
  duel = new Duel();
  summary = null;
  earned = [];
  lastResult = null;
  lastTickSec = 99;
  crackleClock = chatterClock = 0;
  ui.updateTimer(DUEL.duration);
  ui.updateRage(0);
  ui.updateStrikes(0);
  ui.setAct(1);
  ui.setWatch('back');
}

function startIntro(): void {
  if (phase === 'loading') return;
  resetStage();
  sfx.unlock();
  sfx.ui();
  resetRound();
  phase = 'intro';
  ui.setScreen('intro');

  // briefing très bref, rejoué à chaque partie ; un appui (touche, clic ou toucher) le passe
  scene.playIntro(INTRO_PACE.lineEvery);
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
    if (i < text.length) later(step, 26);
  };
  step();
}

function beginPlay(): void {
  if (phase !== 'intro') return;
  clearTimers();
  resetInput();
  ui.showGo(GO_TEXT);
  sfx.go();
  scene.startPlay();
  resetRound();
  phase = 'play';
  ui.setScreen('play');
}

// ---------------------------------------------------------------- boucle de jeu
function tick(dt: number): void {
  if (phase !== 'play') return;
  const events = duel.update(dt, hold.held);
  scene.sync({
    act: duel.act, watch: duel.watch, working: duel.working, rage: duel.rage,
    holdTime: duel.holdTime, paused: duel.paused,
  });
  for (const event of events) onEvent(event);
  if (phase !== 'play') return;

  ui.updateTimer(duel.timeLeft);
  ui.updateRage(duel.rage);
  ambience(dt);

  const sec = Math.ceil(duel.timeLeft);
  if (sec !== lastTickSec && sec <= 5 && sec > 0) sfx.tick(sec <= 3);
  lastTickSec = sec;
}

/** Sons continus et petites répliques pendant que Chuck « fait comme d'habitude ». */
function ambience(dt: number): void {
  const working = duel.working;
  const hot = clamp(duel.holdTime / 2.4, 0, 1);
  // acte 1 : le moteur, de plus en plus ridicule à mesure qu'on insiste
  if (working && duel.act === 1) {
    if (!engineOn) {
      engineOn = true;
      sfx.startTension();
    }
    sfx.setTension(38 + hot * 62 + Math.sin(performance.now() / 40) * 6 * hot);
  } else {
    stopEngine();
  }
  if (!working) return;
  // acte 2 : le feu crépite
  if (duel.act === 2) {
    crackleClock -= dt;
    if (crackleClock <= 0) {
      crackleClock = 0.05 + Math.random() * 0.1;
      sfx.crackle();
    }
  }
  chatterClock -= dt;
  if (chatterClock <= 0) {
    chatterClock = 1.3 + Math.random() * 0.9;
    if (Math.random() < 0.6) {
      ui.caption({ kind: 'onoma', text: pick(ONOMA[duel.act]), x: 24 + Math.random() * 10, y: 44 + Math.random() * 10, ms: 650 });
    } else {
      ui.bark(pick(JEANMI_GRUMBLE[duel.act]), 66, 34, 'jeanmi');
    }
  }
}

function onEvent(e: DuelEvent): void {
  switch (e.type) {
    case 'watch':
      ui.setWatch(e.state);
      if (e.state === 'warning') sfx.warn();
      else if (e.state === 'watching') sfx.look();
      else sfx.away();
      break;
    case 'caught':
      resetInput();
      stopEngine();
      sfx.busted();
      scene.caught();
      ui.updateStrikes(e.strikes, true);
      ui.caption({ kind: 'onoma', text: CAUGHT_TEXT, x: 40, y: 60, ms: 1200 });
      ui.caption({ kind: 'bubble', text: pick(JEANMI_CAUGHT), who: 'jeanmi', x: 72, y: 22, ms: 1300 });
      later(() => {
        if (phase === 'play') ui.caption({ kind: 'bubble', text: pick(CHUCK_CAUGHT), who: 'chuck', x: 36, y: 30, ms: 900 });
      }, 450);
      break;
    case 'resume':
      resetInput();
      ui.setWatch(duel.watch);
      ui.setAct(duel.act);
      break;
    case 'milestone': {
      resetInput();
      stopEngine();
      scene.milestone(e.act);
      ui.setWatch('back');
      const pause = DUEL.interlude[e.act - 2] * 1000;
      const during = (fn: () => void, ms: number) => later(() => {
        if (phase === 'play') fn();
      }, ms);
      during(() => ui.announce(MILESTONES[e.act]), e.act === 2 ? 750 : 450);
      during(() => ui.bark(CHUCK_NEXT[e.act], 34, 40, 'chuck'), pause - 900);
      during(() => ui.announce('ACTE ' + e.act + ' — ' + ACTS[e.act].name), pause - 350);
      break;
    }
    case 'alert':
      sfx.alert();
      scene.alert();
      ui.announce(ALERT_TEXT);
      break;
    case 'perfect':
      sfx.perfect();
      ui.caption({ kind: 'onoma', text: PERFECT_TEXT + ' +200', x: 30, y: 30, ms: 800 });
      break;
    case 'end':
      finish(e.kind);
      break;
  }
}

// ---------------------------------------------------------------- fin de partie
function finish(kind: Ending): void {
  if (phase !== 'play') return;
  phase = 'cine';
  clearTimers();
  hold.releaseAll();
  ui.setHeld(false);
  stopEngine();
  ui.setEnded(true);
  ui.updateRage(duel.rage);
  ui.updateTimer(duel.timeLeft);

  const outcome = { kind, rage: duel.rage, timeLeft: duel.timeLeft, strikes: duel.strikes, perfects: duel.perfects };
  const perfect = kind === 'victory' && duel.strikes === 0;
  const score = totalScore(outcome);
  summary = { ...outcome, sawShort: false };

  save.plays++;
  save.strikes += duel.strikes;
  save.perfects += duel.perfects;
  if (kind === 'victory') {
    save.wins++;
    if (perfect) save.cleanWins++;
    save.bestTimeLeft = Math.max(save.bestTimeLeft, duel.timeLeft);
  } else {
    save[kind]++;
  }
  const record = score > save.best;
  if (record) save.best = score;
  // la médaille de la cinématique ne s'obtient qu'en la regardant jusqu'au bout (voir showResult)
  earned = awardMedals(save, summary);
  writeVoisinSave(save);

  lastResult = {
    kind, perfect,
    lines: perfect ? PERFECT_ENDING : ENDINGS[kind],
    score, detail: scoreLines(outcome), best: save.best, record: record && score > 0,
    rage: duel.rage, strikes: duel.strikes, newMedals: earned,
  };
  // trois flagrants délits : on laisse le dernier se lire avant d'enchaîner
  later(() => {
    ui.clearOverlays();
    scene.cinematic(kind, perfect);
  }, kind === 'busted' ? 900 : kind === 'timeout' ? 250 : 0);
}

function showResult(): void {
  if (phase !== 'cine' || !lastResult || !summary) return;
  if (summary.kind === 'victory') {
    summary.sawShort = true;
    earned = [...earned, ...awardMedals(save, summary)];
    writeVoisinSave(save);
    lastResult.newMedals = earned;
  }
  phase = 'result';
  resultReadyAt = performance.now() + 450;
  ui.renderResult(lastResult);
  ui.setScreen('result');
  if (earned.length) sfx.medal();
}

async function share(): Promise<void> {
  if (!lastResult) return;
  const r = lastResult;
  const url = location.origin + location.pathname;
  const text: Record<Ending, string> = {
    victory: r.perfect
      ? "Jean-Mi a craqué, le short aussi, et personne ne m'a vu (" + r.score + ' pts). Victoire parfaite.'
      : 'Jean-Mi a craqué. Le short aussi. (' + r.score + ' pts)',
    busted: 'Jean-Mi a tout noté : 47 pages de plainte, 0 preuve recevable.',
    timeout: 'Jean-Mi a fini son pastis tranquille. Le calme aura duré 1,3 seconde.',
  };
  const payload = text[r.kind] + ' — CHUCK MAURICE : MAURIIIIICE !!!';
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Chuck Maurice — MAURIIIIICE !!!', text: payload, url });
    } else {
      await navigator.clipboard.writeText(payload + ' ' + url);
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

function toggleCalm(): void {
  calm = !calm;
  save.calm = calm;
  scene.reducedMotion = calm;
  ui.setCalm(calm);
  writeVoisinSave(save);
}

/** Action « valider » : dépend de l'écran courant. */
function confirm(): void {
  if (phase === 'title') startIntro();
  else if (phase === 'intro') beginPlay();
  else if (phase === 'result' && performance.now() > resultReadyAt) startIntro();
}

// ---------------------------------------------------------------- entrées
// La commande de jeu est branchée en premier : l'appui qui passe le briefing ne compte donc
// pas comme un maintien (le jeu n'a pas encore commencé quand elle le reçoit).
hold.onChange = (held) => {
  ui.setHeld(held && phase === 'play');
};
bindHold(hold, {
  zones: [ui.holdBtn, ui.stage],
  enabled: () => phase === 'play',
  onPress: () => sfx.unlock(),
});

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

press(ui.startBtn, startIntro);
press(ui.retryBtn, () => {
  if (performance.now() > resultReadyAt) startIntro();
});
press(ui.menuBtn, goHub);
press(ui.muteBtn, toggleMute);
press(ui.calmBtn, toggleCalm);
ui.shareBtn.addEventListener('click', () => void share());

ui.stage.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (phase === 'intro') beginPlay();
});

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  const onControl = target?.tagName === 'BUTTON' || target?.tagName === 'A';
  switch (e.code) {
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
      if (phase === 'play' || phase === 'cine') {
        // en jeu, Espace est la commande (voir bindHold) ; un bouton focalisé ne doit pas se déclencher
        e.preventDefault();
        if (onControl) target.blur();
      } else if (onControl) {
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
      if (phase !== 'loading') goHub();
      break;
  }
});

// Safari (iPhone, iPad, Mac) ne débloque l'audio que sur un geste « terminé » : toucher relâché, clic
// ou touche. Le jeu démarre sur l'appui, donc on redébloque ici, à chaque geste, sans rien jouer.
for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
  window.addEventListener(type, () => sfx.unlock(), { capture: true, passive: true });
}

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopEngine();
});

// accès de test, en développement seulement : rien n'est exposé en production
if (!import.meta.env.DEV) void game;
if (import.meta.env.DEV) {
  Object.assign(window, {
    __voisin: {
      get duel() { return duel; },
      get phase() { return phase; },
      game, scene, hold, save, finish,
    },
  });
}
