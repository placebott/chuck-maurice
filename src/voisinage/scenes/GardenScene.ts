import Phaser from 'phaser';
import { DUEL, clamp, type Act, type WatchState } from '../config/balance';
import { SPRITES } from '../config/sprites';
import { Director } from './cinematics';
import { GAME_H, GAME_W, SPOT } from './layout';

export { GAME_H, GAME_W, SPOT };

export type SfxCue =
  | 'backfire' | 'cough' | 'beat' | 'puff'
  | 'roar' | 'spill' | 'drop' | 'flare' | 'thud' | 'clink' | 'ignition'
  | 'scream' | 'scream-short' | 'sandal' | 'effort' | 'creak' | 'rip' | 'fence' | 'wind' | 'glasses'
  | 'chuck' | 'fanfare' | 'bass' | 'ploum' | 'paper' | 'hehe' | 'sigh' | 'gulp' | 'fail' | 'blip' | 'growl' | 'jingle'
  | 'hush';

export interface Caption {
  kind: 'shout' | 'onoma' | 'bubble' | 'title' | 'sub' | 'black' | 'zzz' | 'clear';
  text?: string;
  lines?: readonly string[];
  /** Position en % de la scène. */
  x?: number;
  y?: number;
  who?: 'chuck' | 'jeanmi';
  /** Durée d'affichage (bulles, onomatopées). */
  ms?: number;
}

export interface Frame {
  act: Act;
  watch: WatchState;
  working: boolean;
  rage: number;
  holdTime: number;
  paused: boolean;
}

interface Drift {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  age: number;
  life: number;
  grow: number;
  s0: number;
  a0: number;
}

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const PROP_KEY: Record<Act, 'fuego' | 'barbecue' | 'stereo'> = { 1: 'fuego', 2: 'barbecue', 3: 'stereo' };
const JM_KEY: Record<WatchState, string> = { back: 'jm_back', warning: 'jm_turn', watching: 'jm_watch' };

/**
 * Le plan de jeu : les deux jardins, Chuck, sa Fuego / son barbecue / sa sono, et Jean-Mi.
 * La scène ne connaît pas les règles : main.ts lui passe l'état à chaque frame (`sync`).
 * Les cinématiques de fin sont dans cinematics.ts (Director).
 */
export class GardenScene extends Phaser.Scene {
  onTick?: (dt: number) => void;
  onReady?: () => void;
  onLoadProgress?: (ratio: number) => void;
  onLoadError?: (key: string) => void;
  onSfx?: (cue: SfxCue) => void;
  onCaption?: (c: Caption) => void;
  /** Une cinématique de fin est allée jusqu'au bout. */
  onCinematicDone?: () => void;
  /** Option « mouvements réduits » : ni secousses de caméra ni flashs. */
  reducedMotion = false;

  chuck!: Phaser.GameObjects.Image;
  jeanmi!: Phaser.GameObjects.Image;
  glass!: Phaser.GameObjects.Image;
  gnome!: Phaser.GameObjects.Image;
  prop!: Phaser.GameObjects.Image;
  confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  shreds!: Phaser.GameObjects.Particles.ParticleEmitter;
  sweat!: Phaser.GameObjects.Particles.ParticleEmitter;
  gust!: Phaser.GameObjects.Particles.ParticleEmitter;

  private flames!: Phaser.GameObjects.Image;
  private mark!: Phaser.GameObjects.Image;
  private veil!: Phaser.GameObjects.Rectangle;
  splash!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  private drifts: Drift[] = [];
  private cloud: Phaser.GameObjects.Image[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private director!: Director;

  private mode: 'idle' | 'play' | 'cine' = 'idle';
  private f: Frame = { act: 1, watch: 'back', working: false, rage: 0, holdTime: 0, paused: false };
  /** Acte dont l'accessoire est en place (il change pendant la transition). */
  private propAct: Act = 1;
  private propReady = true;
  /** Jean-Mi est pris dans une réaction (flagrant délit, sursaut) : on ne touche pas à son sprite. */
  private jmBusy = false;
  private spawnClock = 0;
  private beatClock = 0;
  private beatStep = 0;
  private fxClock = 0;
  private coughClock = 0;
  private hazeClock = 0;
  private glassDown = false;

  constructor() {
    super('bon-voisinage');
  }

  preload(): void {
    this.load.setPath('assets/sprites/bon-voisinage/');
    for (const key of Object.keys(SPRITES)) {
      if (key === 'jm_back_mid') continue;   // repère de taille, pas une image
      this.load.image(key, `${key}.png`);
    }
    this.load.on('progress', (r: number) => this.onLoadProgress?.(r));
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.onLoadError?.(file.key));
  }

  create(): void {
    this.makeTextures();
    this.add.image(0, 0, 'duel').setOrigin(0).setDepth(0);
    this.glass = this.add.image(SPOT.glass.x, SPOT.glass.y, 'pastis').setOrigin(0.5, 1).setDepth(2);
    this.prop = this.add.image(0, 0, 'fuego').setOrigin(0.5, 1).setDepth(3);
    this.flames = this.add.image(0, 0, 'flames').setOrigin(0.5, 1).setDepth(3.1).setVisible(false);
    this.chuck = this.add.image(SPOT.chuck.right, SPOT.chuck.feet, 'chuck_unbothered').setOrigin(1, 1).setDepth(4);
    this.jeanmi = this.add.image(SPOT.jeanmi.x, SPOT.jeanmi.feet, 'jm_back').setOrigin(0.5, 1).setDepth(4);
    this.gnome = this.add.image(SPOT.gnome.x, SPOT.gnome.feet, 'gnome').setOrigin(0.5, 1).setDepth(4);
    this.mark = this.add.image(0, 0, 'mark').setOrigin(0.5, 1).setDepth(8).setVisible(false);
    this.veil = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xff1a00).setDepth(20).setAlpha(0);

    const tricolor = [0x2a5cff, 0xffffff, 0xe63946];
    this.confetti = this.add.particles(0, 0, 'conf', {
      x: { min: -10, max: GAME_W + 10 }, y: -6,
      speedY: { min: 50, max: 150 }, speedX: { min: -40, max: 40 },
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 3 },
      lifespan: 3600, tint: tricolor, frequency: 14, quantity: 5, emitting: false,
    }).setDepth(90);
    this.burst = this.add.particles(0, 0, 'conf', {
      speed: { min: 90, max: 340 }, angle: { min: -170, max: -10 }, gravityY: 320,
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 3 },
      lifespan: 2000, tint: tricolor, emitting: false,
    }).setDepth(90);
    this.dust = this.add.particles(0, 0, 'puff', {
      speed: { min: 15, max: 70 }, angle: { min: -175, max: -5 }, gravityY: -20,
      scale: { start: 0.8, end: 2.6 }, alpha: { start: 0.85, end: 0 },
      tint: [0xe8dcc0, 0xcfc4a8, 0xffffff], lifespan: 620, emitting: false,
    }).setDepth(80);
    this.shreds = this.add.particles(0, 0, 'conf', {
      speed: { min: 60, max: 220 }, angle: { min: 0, max: 360 }, gravityY: 260,
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 2 },
      lifespan: 900, tint: [0x2f3fa8, 0x4a5fd0, 0xffffff, 0xf2a03a], emitting: false,
    }).setDepth(80);
    this.sweat = this.add.particles(0, 0, 'px', {
      speed: { min: 40, max: 120 }, angle: { min: -160, max: -20 }, gravityY: 320,
      lifespan: 520, tint: [0xbfe4ff, 0xffffff], emitting: false,
    }).setDepth(80);
    this.gust = this.add.particles(0, 0, 'gust', {
      x: GAME_W + 10, y: { min: 20, max: 230 },
      speedX: { min: -300, max: -190 }, speedY: { min: -6, max: 6 },
      alpha: { start: 0.5, end: 0 }, lifespan: 1900, frequency: 110, emitting: false,
    }).setDepth(80);
    this.splash = this.add.particles(0, 0, 'px', {
      speed: { min: 20, max: 90 }, angle: { min: -150, max: -30 }, gravityY: 300,
      lifespan: 480, tint: [0xf2e27a, 0xfff6c0, 0xd8c040], emitting: false,
    }).setDepth(5);
    this.sparks = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 130 }, angle: { min: 150, max: 250 }, gravityY: 120,
      lifespan: 260, tint: [0xffd23a, 0xff8a1f, 0xffffff], emitting: false,
    }).setDepth(5);

    this.director = new Director(this);
    this.showTitle();
    this.onReady?.();
  }

  private makeTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 2).generateTexture('px', 2, 2);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 3, 2).generateTexture('conf', 3, 2);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 12, 1).generateTexture('gust', 12, 1);
    g.clear().fillStyle(0xffffff);
    g.fillRect(2, 0, 4, 8).fillRect(0, 2, 8, 4).fillRect(1, 1, 6, 6);
    g.generateTexture('puff', 8, 8);
    // « ! » au-dessus de Jean-Mi
    g.clear().fillStyle(0x120a14).fillRect(0, 0, 9, 17);
    g.fillStyle(0xffffff).fillRect(2, 2, 5, 8).fillRect(3, 10, 3, 1).fillRect(2, 12, 5, 3);
    g.generateTexture('mark', 9, 17);
    // feuille morte
    g.clear().fillStyle(0x7a4a12).fillRect(0, 2, 2, 1);
    g.fillStyle(0xd8862a).fillRect(2, 1, 5, 3).fillRect(3, 0, 3, 5);
    g.fillStyle(0xf2b04a).fillRect(3, 1, 2, 2);
    g.generateTexture('leaf', 7, 5);
    // le dossier de Jean-Mi : une chemise cartonnée obèse
    g.clear();
    for (let i = 0; i < 13; i++) {
      g.fillStyle(i % 2 ? 0xf4efe2 : 0xd9d2c0).fillRect(3 + (i % 3), 6 + i * 4, 98 - (i % 4) * 2, 4);
    }
    g.fillStyle(0x8a5a1c).fillRect(0, 0, 106, 7).fillRect(0, 58, 106, 6).fillRect(0, 0, 5, 64);
    g.fillStyle(0xb9812e).fillRect(1, 1, 104, 4);
    g.fillStyle(0xe63946).fillRect(34, 22, 40, 14);
    g.fillStyle(0xffffff).fillRect(38, 26, 32, 2).fillRect(38, 30, 22, 2);
    g.generateTexture('dossier', 106, 64);
    // une feuille de la plainte
    g.clear().fillStyle(0x120a14).fillRect(0, 0, 30, 38);
    g.fillStyle(0xffffff).fillRect(1, 1, 28, 36);
    g.fillStyle(0xe63946).fillRect(4, 4, 14, 3);
    g.fillStyle(0x6a6a7a);
    for (let i = 0; i < 6; i++) g.fillRect(4, 10 + i * 4, i % 3 === 2 ? 14 : 22, 1);
    g.generateTexture('sheet', 30, 38);
    // la table en plastique de Jean-Mi, vue de près
    g.clear().fillStyle(0x120a14).fillRect(0, 0, 300, 44);
    g.fillStyle(0xffffff).fillRect(0, 2, 300, 8);
    g.fillStyle(0xdfe3ea).fillRect(0, 10, 300, 6);
    g.fillStyle(0xb9bfca).fillRect(0, 16, 300, 28);
    g.generateTexture('table', 300, 44);
    g.destroy();
  }

  // ------------------------------------------------------------ remise à zéro
  private clearTimers(): void {
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
  }

  later(ms: number, fn: () => void): void {
    this.timers.push(this.time.delayedCall(ms, fn));
  }

  resetCamera(): void {
    const cam = this.cameras.main;
    cam.shakeEffect.reset();
    cam.flashEffect.reset();
    cam.zoomEffect.reset();
    cam.panEffect.reset();
    cam.setZoom(1).setScroll(0, 0).setAngle(0);
  }

  private resetAll(): void {
    this.director.clear();
    this.clearTimers();
    this.tweens.killAll();
    this.resetCamera();
    for (const d of this.drifts) d.img.destroy();
    this.drifts = [];
    for (const c of this.cloud) c.destroy();
    this.cloud = [];
    for (const e of [this.confetti, this.burst, this.dust, this.shreds, this.sweat, this.gust, this.splash, this.sparks]) {
      e.stop();
      e.killAll();
    }
    this.f = { act: 1, watch: 'back', working: false, rage: 0, holdTime: 0, paused: false };
    this.jmBusy = false;
    this.glassDown = false;
    this.spawnClock = this.beatClock = this.fxClock = this.coughClock = this.hazeClock = 0;
    this.beatStep = 0;
    this.veil.setAlpha(0);
    this.mark.setVisible(false);
    this.chuck.setTexture('chuck_unbothered').setPosition(SPOT.chuck.right, SPOT.chuck.feet)
      .setScale(1).setAngle(0).setFlipX(false).setVisible(true);
    this.jeanmi.setTexture('jm_back').setPosition(SPOT.jeanmi.x, SPOT.jeanmi.feet)
      .setScale(1).setAngle(0).setFlipX(false).clearTint().setVisible(true).setDepth(4);
    this.glass.setPosition(SPOT.glass.x, SPOT.glass.y).setAngle(0).setVisible(true).setScale(1);
    this.gnome.setTexture('gnome').setPosition(SPOT.gnome.x, SPOT.gnome.feet).setAngle(0).setFlipX(false).setScale(1);
    this.setProp(1);
  }

  /** Met en place l'accessoire d'un acte (1 : Fuego, 2 : barbecue, 3 : sono). */
  setProp(act: Act): void {
    const key = PROP_KEY[act];
    const spot = SPOT[key];
    this.propAct = act;
    this.propReady = true;
    this.prop.setTexture(key).setPosition(spot.x, spot.base).setScale(1).setAngle(0).setVisible(true).setAlpha(1);
    this.flames.setVisible(act === 2).setPosition(spot.x - 6, spot.base - 36).setScale(0.6);
  }

  // ------------------------------------------------------------ états
  showTitle(): void {
    this.resetAll();
    this.mode = 'idle';
  }

  /** Démonstration muette pendant le briefing : dos tourné, puis regard. */
  playIntro(lineEvery: number): void {
    this.resetAll();
    this.mode = 'play';
    this.sync({ ...this.f, working: true, holdTime: 1 });
    this.later(lineEvery - 250, () => this.sync({ ...this.f, working: false, watch: 'warning' }));
    this.later(lineEvery + 250, () => this.sync({ ...this.f, working: false, watch: 'watching' }));
    this.later(lineEvery * 2 + 900, () => this.sync({ ...this.f, working: false, watch: 'back' }));
  }

  startPlay(): void {
    this.resetAll();
    this.mode = 'play';
  }

  /** État du jeu, passé à chaque frame. */
  sync(next: Frame): void {
    const prev = this.f;
    this.f = next;
    if (next.watch !== prev.watch || (prev.paused && !next.paused)) this.applyWatch();
    if (next.working !== prev.working) this.applyWorking();
  }

  private applyWatch(): void {
    if (this.jmBusy) return;
    const w = this.f.watch;
    // les poses « turn » et « watch » regardent vers la droite dans les originaux : Chuck est à gauche
    this.jeanmi.setTexture(JM_KEY[w]).setFlipX(w !== 'back').setAngle(0)
      .setPosition(SPOT.jeanmi.x, SPOT.jeanmi.feet);
    this.mark.setVisible(w === 'warning');
    if (w === 'warning') {
      this.tweens.add({ targets: this.jeanmi, y: SPOT.jeanmi.feet - 4, duration: 70, yoyo: true });
    } else if (w === 'watching') {
      this.tweens.add({ targets: this.jeanmi, scaleY: 1.06, duration: 60, yoyo: true });
    }
  }

  private applyWorking(): void {
    const on = this.f.working;
    this.chuck.setTexture(on ? 'chuck_sunglasses' : 'chuck_unbothered').setY(SPOT.chuck.feet);
    if (on) {
      this.fxClock = 0;
      if (this.f.act === 1) this.onSfx?.('ignition');
    } else if (this.propReady) {
      const spot = SPOT[PROP_KEY[this.propAct]];
      this.prop.setPosition(spot.x, spot.base).setScale(1).setAngle(0);
    }
  }

  // ------------------------------------------------------------ événements de jeu
  /** Flagrant délit : Jean-Mi explose, Chuck est déjà innocent. */
  caught(): void {
    this.jmBusy = true;
    this.mark.setVisible(false);
    this.chuck.setTexture('chuck_unbothered').setY(SPOT.chuck.feet);
    this.jeanmi.setTexture('jm_rage').setFlipX(false).setPosition(SPOT.jeanmi.x, SPOT.jeanmi.feet);
    this.tweens.add({ targets: this.jeanmi, y: SPOT.jeanmi.feet - 12, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: this.jeanmi, x: SPOT.jeanmi.x + 2, duration: 40, yoyo: true, repeat: 12, delay: 220 });
    this.sweat.explode(8, SPOT.jeanmi.x, SPOT.jeanmi.feet - 92);
    this.flash(0xffffff, 140);
    this.shake(220, 0.012);
    this.later(DUEL.caughtPause * 1000 - 60, () => {
      this.jmBusy = false;
      if (this.mode === 'play') this.applyWatch();
    });
  }

  /** Fin d'acte : gros effet, puis changement d'accessoire. */
  milestone(act: 2 | 3): void {
    this.propReady = false;
    this.jmBusy = true;
    this.mark.setVisible(false);
    const total = DUEL.interlude[act - 2] * 1000;
    if (act === 2) this.fuegoFinale();
    else this.barbecueFinale();
    this.later(total - 120, () => {
      this.jmBusy = false;
      if (this.mode === 'play') this.applyWatch();
    });
  }

  /** 33 % : la Fuego rugit, Jean-Mi renverse son pastis. */
  private fuegoFinale(): void {
    const spot = SPOT.fuego;
    this.onSfx?.('roar');
    this.shake(700, 0.012);
    this.tweens.add({ targets: this.prop, y: spot.base - 7, duration: 90, yoyo: true, repeat: 5 });
    for (let i = 0; i < 12; i++) this.later(i * 55, () => this.exhaust(1.6));
    this.later(650, () => {
      this.onSfx?.('spill');
      this.jeanmi.setTexture('jm_turn').setFlipX(false);
      this.tweens.add({ targets: this.jeanmi, y: SPOT.jeanmi.feet - 16, duration: 120, yoyo: true, ease: 'Quad.easeOut' });
      this.glassDown = true;
      this.tweens.add({ targets: this.glass, angle: 92, x: SPOT.glass.x + 4, duration: 160 });
      this.splash.explode(14, SPOT.glass.x + 6, SPOT.glass.y - 6);
    });
    // la Fuego s'en va, le barbecue arrive
    this.later(1150, () => {
      this.tweens.add({ targets: this.prop, x: -110, duration: 520, ease: 'Quad.easeIn' });
      for (let i = 0; i < 6; i++) this.later(i * 70, () => this.exhaust(1));
    });
    this.later(1750, () => this.dropProp(2));
    this.later(1900, () => {
      this.jeanmi.setTexture('jm_back').setFlipX(false);
      this.glassDown = false;
      this.tweens.add({ targets: this.glass, angle: 0, x: SPOT.glass.x, duration: 140 });
    });
  }

  /** 80 % : flambée, le jardin de Jean-Mi disparaît — on ne voit plus que ses chaussettes et ses sandales. */
  private barbecueFinale(): void {
    const spot = SPOT.barbecue;
    this.onSfx?.('flare');
    this.shake(500, 0.01);
    this.flash(0xffb040, 180);
    const fire = this.add.image(spot.x - 6, spot.base - 30, 'flames_big').setOrigin(0.5, 1).setDepth(3.2).setScale(0.3);
    this.tweens.add({ targets: fire, scale: 1.25, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: fire, scaleY: 1.5, alpha: 0, duration: 500, delay: 700, onComplete: () => fire.destroy() });
    for (const d of this.drifts) d.life = Math.min(d.life, d.age + 0.3);
    // le nuage : il s'arrête juste au-dessus des chevilles de Jean-Mi
    const top = SPOT.jeanmi.feet - 17;
    for (let i = 0; i < 11; i++) {
      const img = this.add.image(rnd(262, 470), 0, 'smoke_big').setDepth(7).setAlpha(0)
        .setFlipX(Math.random() < 0.5).setScale(rnd(0.75, 1.1));
      img.y = Math.min(rnd(30, 140), top - img.displayHeight / 2);
      this.cloud.push(img);
      this.tweens.add({ targets: img, alpha: 1, x: img.x + rnd(8, 26), duration: 260, delay: 120 + i * 45 });
      this.tweens.add({ targets: img, scale: img.scale * 1.06, duration: rnd(300, 500), yoyo: true, repeat: -1 });
    }
    this.later(500, () => this.onSfx?.('cough'));
    this.later(1100, () => this.onSfx?.('cough'));
    this.later(1650, () => {
      const gone = this.cloud;
      this.cloud = [];
      for (const img of gone) {
        this.tweens.killTweensOf(img);
        this.tweens.add({
          targets: img, alpha: 0, y: img.y - rnd(20, 50), x: img.x + rnd(20, 60), duration: 600,
          onComplete: () => img.destroy(),
        });
      }
      this.jeanmi.setTexture('jm_rage').setFlipX(false);
    });
    this.later(2200, () => this.tweens.add({ targets: this.chuck, y: SPOT.chuck.feet - 2, duration: 90, yoyo: true }));
    this.later(2250, () => {
      this.flames.setVisible(false);
      this.tweens.add({ targets: this.prop, x: -60, duration: 380, ease: 'Quad.easeIn' });
    });
    this.later(2700, () => this.dropProp(3));
  }

  private dropProp(act: Act): void {
    if (this.mode !== 'play') return;
    this.setProp(act);
    const spot = SPOT[PROP_KEY[act]];
    this.flames.setVisible(false);
    this.prop.setY(-20);
    this.tweens.add({
      targets: this.prop, y: spot.base, duration: 300, ease: 'Quad.easeIn',
      onComplete: () => {
        this.onSfx?.(act === 3 ? 'thud' : 'drop');
        this.dust.explode(act === 3 ? 14 : 8, spot.x, spot.base);
        this.shake(act === 3 ? 240 : 120, act === 3 ? 0.012 : 0.006);
        this.tweens.add({ targets: this.prop, scaleY: 0.9, duration: 60, yoyo: true });
        this.flames.setVisible(act === 2);
      },
    });
  }

  /** Alerte à 95 % : le bord de l'écran vire au rouge. */
  alert(): void {
    this.tweens.add({ targets: this.veil, alpha: this.reducedMotion ? 0.12 : 0.28, duration: 150, yoyo: true, repeat: 2 });
  }

  // ------------------------------------------------------------ cinématiques
  cinematic(kind: 'victory' | 'busted' | 'timeout', perfect: boolean): void {
    this.clearTimers();
    this.mode = 'cine';
    this.f = { ...this.f, working: false };
    this.mark.setVisible(false);
    this.jmBusy = true;
    if (kind === 'victory') this.director.victory(perfect);
    else if (kind === 'busted') this.director.busted();
    else this.director.timeout();
  }

  // ------------------------------------------------------------ effets communs
  shake(ms: number, intensity: number): void {
    if (!this.reducedMotion) this.cameras.main.shake(ms, intensity);
  }

  flash(color: number, ms: number): void {
    if (this.reducedMotion) return;
    this.cameras.main.flash(ms, (color >> 16) & 255, (color >> 8) & 255, color & 255);
  }

  /** Amplitude d'une vibration, réduite si l'option de confort est active. */
  amp(px: number): number {
    return this.reducedMotion ? px * 0.3 : px;
  }

  private drift(key: string, x: number, y: number, vx: number, vy: number, life: number, s0: number, grow: number, a0 = 1, depth = 6): Drift {
    const img = this.add.image(x, y, key).setDepth(depth).setScale(s0).setAlpha(a0);
    const d: Drift = { img, vx, vy, age: 0, life, grow, s0, a0 };
    this.drifts.push(d);
    return d;
  }

  /** Une bouffée du barbecue, qui file vers le jardin de Jean-Mi. */
  private smoke(density: number, power: number): void {
    const spot = SPOT.barbecue;
    const d = this.drift('smoke', spot.x + rnd(-8, 16), spot.base - rnd(52, 78), rnd(44, 78), rnd(-18, 4),
      rnd(3.6, 5.2), rnd(0.4, 0.65) * power, 1.3 + density * 1.1, 0.8);
    d.img.setFlipX(Math.random() < 0.5).setAngle(rnd(-25, 25));
  }

  exhaust(power: number): void {
    const p = this.prop;
    this.drift('puff', p.x - 66, p.y - 12, rnd(-46, -18) * power, rnd(-22, -6), rnd(0.5, 0.9), rnd(0.8, 1.4) * power, 2.2, 0.8, 3.2)
      .img.setTint(0xc8c8d0);
  }

  // ------------------------------------------------------------ boucle
  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.onTick?.(dt);
    this.director.update(time, dt);

    for (let i = this.drifts.length - 1; i >= 0; i--) {
      const d = this.drifts[i];
      d.age += dt;
      if (d.age >= d.life) {
        d.img.destroy();
        this.drifts.splice(i, 1);
        continue;
      }
      const k = d.age / d.life;
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      d.img.setScale(d.s0 * (1 + d.grow * k));
      d.img.setAlpha(d.a0 * (k < 0.7 ? 1 : (1 - k) / 0.3));
    }

    if (this.mode === 'cine') return;
    const f = this.f;
    const t = time / 1000;
    const hot = clamp(f.holdTime / 2.4, 0, 1);

    // Chuck : il s'active, ou il n'a rien fait
    if (f.working) this.chuck.y = SPOT.chuck.feet + (Math.sin(t * 22) > 0 ? 0 : 1);

    // Jean-Mi : de plus en plus rouge, de plus en plus tremblant
    const r = f.rage / 100;
    const red = Math.round(255 - r * 150);
    this.jeanmi.setTint(Phaser.Display.Color.GetColor(255, red, red));
    if (!this.jmBusy && !f.paused) {
      const shiver = f.watch === 'warning' ? 1 : r > 0.5 ? (r - 0.5) * 2 : 0;
      this.jeanmi.x = SPOT.jeanmi.x + (shiver > 0 && Math.sin(t * 60) > 0 ? this.amp(1) : 0);
    }
    this.mark.setPosition(this.jeanmi.x, this.jeanmi.y - this.jeanmi.displayHeight - 3)
      .setScale(Math.sin(t * 30) > 0 ? 1 : 1.25);

    if (f.working && this.propReady && this.propAct === f.act) this.work(dt, t, hot, r);
    else if (this.propAct === 2 && this.propReady) {
      // même sans y toucher, le barbecue de Chuck fume
      this.flames.setScale(0.55 + Math.sin(t * 9) * 0.05, 0.5 + Math.sin(t * 13) * 0.08);
      this.spawnClock -= dt;
      if (this.spawnClock <= 0 && this.mode === 'play' && !f.paused) {
        this.spawnClock = 0.45;
        this.smoke(clamp((f.rage - 33) / 47, 0, 1), 0.6);
      }
    }

    // le verre : il tremble, puis glisse sur la table
    if (!this.glassDown) {
      const slide = f.act === 3 ? ((f.rage - 80) / 20) * 15 : 0;
      const jitter = f.working && Math.sin(t * 70) > 0 ? 1 : 0;
      this.glass.x = SPOT.glass.x - slide + jitter;
    }

    // le nain : immobile, puis il remue, puis il danse
    if (f.act === 3 && f.rage >= 90) {
      const step = Math.floor(t * 7);
      this.gnome.setTexture(step % 2 ? 'gnome_dancing' : 'gnome').setFlipX(step % 4 > 1).setAngle(0);
      this.gnome.y = SPOT.gnome.feet - (step % 2 ? 3 : 0);
    } else if (f.act === 3 && f.rage >= 84) {
      this.gnome.setAngle(Math.sin(t * 18) * 9);
    }
  }

  /** Chuck « fait comme d'habitude » : l'accessoire de l'acte s'anime. */
  private work(dt: number, t: number, hot: number, r: number): void {
    const act = this.f.act;
    this.spawnClock -= dt;
    this.fxClock -= dt;
    this.coughClock -= dt;
    if (act === 1) {
      const spot = SPOT.fuego;
      const a = this.amp(1 + hot * 1.6);
      this.prop.setPosition(spot.x + rnd(-a, a), spot.base + rnd(-a, a) * 0.6);
      this.prop.setScale(1, 1 + Math.sin(t * 40) * 0.015 * (1 + hot));
      if (this.spawnClock <= 0) {
        this.spawnClock = 0.14 - hot * 0.08;
        this.exhaust(1 + hot * 0.6);
      }
      if (this.fxClock <= 0) {
        // pétarade : de plus en plus rapprochées
        this.fxClock = rnd(0.5, 0.8) - hot * 0.3;
        this.onSfx?.('backfire');
        this.sparks.explode(5, spot.x - 68, spot.base - 10);
        this.tweens.add({ targets: this.jeanmi, y: SPOT.jeanmi.feet - 2 - hot * 3, duration: 50, yoyo: true });
      }
    } else if (act === 2) {
      const spot = SPOT.barbecue;
      const density = clamp((this.f.rage - 33) / 47, 0, 1);
      this.flames.setScale(
        0.9 + hot * 0.35 + Math.sin(t * 31) * 0.1,
        1 + hot * 0.5 + density * 0.3 + Math.sin(t * 23) * 0.16,
      );
      this.flames.x = spot.x - 6 + (Math.sin(t * 40) > 0 ? 1 : 0);
      if (this.spawnClock <= 0) {
        this.spawnClock = 0.13 - density * 0.07;
        this.smoke(density, 1);
        if (Math.random() < 0.3) this.onSfx?.('puff');
      }
      // la fumée stagne chez Jean-Mi : de gros paquets s'installent dans son jardin
      this.hazeClock -= dt;
      if (this.hazeClock <= 0) {
        this.hazeClock = 0.9 - density * 0.45;
        const d = this.drift('smoke_big', rnd(250, 330), rnd(110, 170), rnd(14, 30), rnd(-8, -2),
          rnd(3.5, 5), rnd(0.45, 0.7), 0.5, 0.4 + density * 0.2);
        d.img.setFlipX(Math.random() < 0.5);
      }
      if (this.fxClock <= 0) {
        this.fxClock = rnd(0.06, 0.2);
        this.sparks.explode(1, spot.x - 6 + rnd(-10, 10), spot.base - 44);
      }
      if (this.coughClock <= 0 && this.f.watch === 'back' && !this.jmBusy) {
        this.coughClock = rnd(0.7, 1.1) - density * 0.35;
        this.onSfx?.('cough');
        this.tweens.add({ targets: this.jeanmi, y: SPOT.jeanmi.feet - 6, angle: rnd(-12, 12), duration: 70, yoyo: true, repeat: 2 });
      }
    } else {
      const spot = SPOT.stereo;
      const loud = clamp((this.f.rage - 80) / 20, 0, 1);
      this.beatClock -= dt;
      this.prop.x = spot.x + (Math.sin(t * 80) > 0 ? this.amp(1) : 0);
      if (this.beatClock <= 0) {
        this.beatClock = 0.3;
        this.beatStep++;
        this.onSfx?.('beat');
        this.prop.setScale(1.1 + loud * 0.06);
        this.tweens.add({ targets: this.prop, scale: 1, duration: 200, ease: 'Quad.easeOut' });
        if (!this.reducedMotion) {
          this.cameras.main.setZoom(1.012 + loud * 0.012);
          this.tweens.add({ targets: this.cameras.main, zoom: 1, duration: 180 });
        }
        // quatre arcs, du plus petit au plus grand, traversent l'écran
        for (let i = 0; i < 4; i++) {
          this.later(i * 45, () => {
            if (this.mode !== 'play') return;
            const d = this.drift(`wave_${i}`, spot.x + 62 + i * 4, spot.base - 40, 300 + i * 22, 0, 1.25, 1, 0.5 + loud * 0.5, 0.95);
            d.img.setTint(this.beatStep % 2 ? 0xffffff : 0xffc8ff);
          });
        }
        this.tweens.add({ targets: this.jeanmi, y: SPOT.jeanmi.feet - 2 - loud * 3, duration: 50, yoyo: true });
      }
    }
    void r;
  }

  /** Numéro du temps de basse en cours (pour le riff). */
  get beat(): number {
    return this.beatStep;
  }
}
