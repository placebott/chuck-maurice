import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import '../styles/main.css';
import '../styles/saucissonator.css';

import { CUT, type EndingKind } from './config/balance';
import {
  BOXER_BARKS, CHUCK_BARKS, COMBO_TEXT, ENDINGS, GO_TEXT, HEADLINES, INTRO_LINES, VERDICTS, pick,
} from './config/messages';
import { Session, type CutRecord } from './systems/session';
import { awardMedals, type MissionSummary } from './systems/medals';
import { CharcuterieScene, GAME_H, GAME_W } from './scenes/CharcuterieScene';
import { CharcuterieSfx } from './sfx';
import { loadSaucissonSave, writeSaucissonSave } from './save';
import { SaucissonUI, type ResultView } from './ui';
// le réglage du son est commun aux deux missions : il vit dans la sauvegarde d'origine
import { loadSave, writeSave } from '../storage/save';

type Phase = 'loading' | 'title' | 'intro' | 'play' | 'result';

const ui = new SaucissonUI();
const sfx = new CharcuterieSfx();
const save = loadSaucissonSave();
const scene = new CharcuterieScene();
scene.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let phase: Phase = 'loading';
let session = new Session();
let muted = loadSave().muted;
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
  console.error(`[saucissonator] impossible de charger l'asset « ${key} »`);
};
scene.onReady = () => {
  if (phase !== 'loading') return;
  phase = 'title';
  ui.setScreen('title');
};
scene.onBark = (text, x, y, who) => ui.bark(text, x, y, who);
scene.onSliceLand = () => sfx.land();
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
  sfx.stopTension();
  ui.hideBanner();
  ui.hideCombo();
  ui.setEnded(false);
  ui.setTactical(false);
  ui.clearIntro();
  ui.clearBarks();
}

function goTitle(): void {
  resetStage();
  ui.renderTitle(save);
  scene.showTitle();
  phase = 'title';
  ui.setScreen('title');
}

function startIntro(): void {
  resetStage();
  sfx.unlock();
  sfx.ui();
  session = new Session();
  ui.resetRound();
  phase = 'intro';
  ui.setScreen('intro');

  // briefing rejoué à chaque mission ; un appui (touche, clic ou toucher) le passe
  scene.playIntro();
  sfx.introRoll();
  let t = 250;
  for (const line of INTRO_LINES) {
    later(() => typeLine(line), t);
    t += 950;
  }
  later(() => sfx.woof(), 3200);
  later(beginPlay, t + 350);
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
  sfx.startTension();
  scene.startPlay();
  session = new Session();
  ui.resetRound();
  lastTickSec = 99;
  phase = 'play';
  ui.setScreen('play');
}

/** Coup de couteau du joueur. */
function cut(): void {
  if (phase !== 'play') return;
  const before = session.consumed;
  const record = session.cut();
  if (record) onCut(record, before);
}

function onCut(record: CutRecord, consumedBefore: number): void {
  const q = record.quality;
  if (q !== 'disaster') {
    scene.cutFx(record, consumedBefore);
    sfx.chop(q);
    ui.recordCut(record.index, q, session.cuts.length, session.score);
    ui.verdict(pick(VERDICTS[q]), q, record.thickness, record.points, 41, 49);
    if (q === 'thick' || q === 'thin' || (!record.bonus && Math.random() < 0.3)) {
      later(() => phase === 'play' && ui.bark(pick(CHUCK_BARKS[q]), 66 + Math.random() * 8, 30 + Math.random() * 6, 'chuck'), 140);
    }
    if (q === 'thin' && Math.random() < 0.6) {
      later(() => {
        if (phase !== 'play') return;
        ui.bark(pick(BOXER_BARKS), 14, 50, 'boxer');
        sfx.woof();
      }, 260);
    }
  }

  if (record.bonus) {
    later(() => ui.bonus(`SÉRIE ×${record.streak} · +${record.bonus}`, 41, 31), 120);
    later(() => sfx.combo(), 90);
    later(() => scene.comboFx(), 90);
    // premier palier de la série : le mode tactique s'annonce
    if (record.streak === CUT.comboEvery) ui.showCombo(COMBO_TEXT);
  }
  scene.setTactical(session.tactical);
  ui.setTactical(session.tactical);

  if (session.ending) finish();
}

function tick(dt: number): void {
  if (phase !== 'play') return;
  const before = session.consumed;
  const forced = session.update(dt);
  scene.setFeed(session.thickness, session.consumed);
  ui.updateHud(forced ? forced.thickness : session.thickness, session.timeLeft);
  // la tension monte quand le saucisson dépasse la zone correcte
  sfx.setTension(Math.max(0, (session.thickness - CUT.ideal) / (CUT.disaster - CUT.ideal)) * 100);

  const sec = Math.ceil(session.timeLeft);
  if (sec !== lastTickSec && sec <= 5 && sec > 0) sfx.tick(sec <= 3);
  lastTickSec = sec;

  if (forced) onCut(forced, before);
  else if (session.ending) finish();
}

/** Mise en scène de chaque dénouement : [délai du titre, délai du panneau de résultat] en ms. */
const STAGING: Record<EndingKind, { banner: number; panel: number }> = {
  victory: { banner: 700, panel: 2300 },
  thick: { banner: 1150, panel: 3400 },
  dog: { banner: 2250, panel: 3700 },
  nuclear: { banner: 640, panel: 2900 },
};

function finish(): void {
  const ending = session.ending;
  if (!ending || phase !== 'play') return;
  phase = 'result';
  clearTimers();
  sfx.stopTension();
  ui.setEnded(true);
  ui.setTactical(false);
  scene.setTactical(false);

  const kind = ending.kind;
  const summary: MissionSummary = {
    kind,
    timeLeft: session.timeLeft,
    elapsed: session.elapsed,
    score: session.score,
    counts: session.counts,
    bestStreak: session.bestStreak,
  };

  save.plays++;
  if (kind === 'victory') save.wins++;
  else save[kind]++;
  save.slices += session.cuts.length - session.counts.disaster;
  save.perfectSlices += session.counts.perfect;
  save.bestStreak = Math.max(save.bestStreak, session.bestStreak);
  const record = session.score > save.best;
  if (record) save.best = session.score;
  if (kind === 'victory' && (save.bestTime === null || session.elapsed < save.bestTime)) save.bestTime = session.elapsed;
  const newMedals = awardMedals(save, summary);
  writeSaucissonSave(save);

  // on laisse la dernière rondelle retomber avant de lancer la séquence
  const lead = ending.reason === 'complete' || ending.reason === 'errors' || ending.reason === 'shortage' ? 420 : 0;
  later(() => {
    ui.clearBarks();
    switch (kind) {
      case 'victory':
        scene.victory();
        sfx.fanfareCharcuterie();
        later(() => sfx.woof(), 900);
        break;
      case 'thick':
        scene.failThick();
        later(() => sfx.crash(), 690);
        break;
      case 'dog':
        scene.failDog();
        later(() => sfx.theft(), 330);
        later(() => sfx.lick(), 2400);
        break;
      case 'nuclear':
        scene.failNuclear();
        sfx.charge();
        later(() => sfx.explosion(), 580);
        break;
    }
  }, lead);

  const staging = STAGING[kind];
  later(() => ui.showBanner(HEADLINES[kind], kind), lead + staging.banner);
  const [message, sub] = ENDINGS[kind];
  lastResult = {
    kind,
    message,
    sub,
    score: session.score,
    record: record && session.score > 0,
    elapsed: session.elapsed,
    cuts: session.cuts.length - session.counts.disaster,
    counts: session.counts,
    bestStreak: session.bestStreak,
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
    victory: `Douze rondelles en ${r.elapsed.toFixed(1)} s (${r.score} pts). La France est tranchée.`,
    thick: "J'ai découpé une rondelle si épaisse qu'elle a traversé le plancher. 48 000 francs de dégâts.",
    dog: 'Mon boxer a volé le saucisson. Le suspect a quatre pattes et aucun regret.',
    nuclear: "J'ai tranché le saucisson. Et la planche. Et le plan de travail. Opération terminée, cuisine également.",
  };
  const payload = `${text[r.kind]} — CHUCK MAURICE : SAUCISSONATOR 3000`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Chuck Maurice — Saucissonator 3000', text: payload, url });
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
  // on relit la sauvegarde d'origine pour n'y modifier que le réglage du son
  writeSave({ ...loadSave(), muted });
}

/** Action « valider » : dépend de l'écran courant. */
function confirm(): void {
  if (phase === 'title') startIntro();
  else if (phase === 'intro') beginPlay();
  else if (phase === 'result' && ui.screen === 'result' && performance.now() > resultReadyAt) startIntro();
}

// ---------------------------------------------------------------- entrées
/** pointerdown plutôt que click : la coupe doit partir à l'instant du contact. */
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
press(ui.cutBtn, cut);
press(ui.retryBtn, () => {
  if (performance.now() > resultReadyAt - 450) startIntro();
});
press(ui.menuBtn, goTitle);
press(ui.muteBtn, toggleMute);
ui.shareBtn.addEventListener('click', () => void share());

// la scène entière est une zone de coupe : un clic, un toucher ou le début d'un geste
// vertical tranche immédiatement (attendre la fin du geste coûterait en précision)
ui.stage.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  if (phase === 'play') {
    e.preventDefault();
    cut();
  } else if (phase === 'intro') {
    beginPlay();
  }
});

const CUT_KEYS = new Set(['Space', 'ArrowDown', 'Enter', 'NumpadEnter', 'KeyF', 'KeyX']);

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as HTMLElement | null;
  const onControl = target?.tagName === 'BUTTON' || target?.tagName === 'A';
  if (CUT_KEYS.has(e.code)) {
    if (phase === 'play') {
      // en jeu, le clavier pilote le couteau : un bouton resté focalisé ne doit pas s'activer
      e.preventDefault();
      if (onControl) target.blur();
      if (!e.repeat) cut();
    } else if (onControl && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
      return; // activation native du bouton ou du lien focalisé
    } else {
      e.preventDefault();
      if (!e.repeat) confirm();
    }
  } else if (e.code === 'KeyM') {
    toggleMute();
  } else if (e.code === 'Escape') {
    if (phase !== 'loading' && phase !== 'title') goTitle();
  }
});

// confort mobile : pas de menu contextuel ni de zoom au double appui
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sfx.stopTension();
  else if (phase === 'play') sfx.startTension();
});
