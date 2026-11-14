import Phaser from 'phaser';
import { CLOCK, FLOOR_Y, GLASS, PAN, PIVOT, SPOON_REACH, STORM, WINDOW, type Fate } from '../config/balance';
import { boxerPath, type BoxerState } from '../systems/mission';
import type { Olive } from '../physics/world';

export const GAME_W = 480;
export const GAME_H = 270;

const TABLE_Y = 192;
/** Chuck est placé pour que son poing tendu tombe sur le pivot de la cuillère. */
const CHUCK = { x: 93, feet: 264 };
/** Ancrage du manche dans le sprite de la cuillère. */
const SPOON_ORIGIN = { x: 0.05, y: 0.5 };
/** Le ventilateur est derrière Chuck : il souffle vers la droite, dans le sens du tir. */
const FAN = { x: 30, y: FLOOR_Y - 26, hubX: -6, hubY: -37 };
const WINDOW_POS = { x: 189, y: 9 };
const OLD_FEET = { despair: 250 } as const;

const SPRITES = [
  'chuck_aiming', 'chuck_hero', 'boxer_intercept', 'jeanmi_idle', 'jeanmi_hit', 'jeanmi_angry',
  'spoon', 'olive', 'olive_splat', 'glass', 'pan', 'pastis', 'fan', 'fan_blades', 'window', 'garden',
];

type Mode = 'idle' | 'play' | 'ending';
export type BarkSource = 'chuck' | 'boxer' | 'jeanmi';

interface Debris {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  vr: number;
}

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const rad = (deg: number) => (deg * Math.PI) / 180;

export class OliveScene extends Phaser.Scene {
  onTick?: (dt: number) => void;
  onReady?: () => void;
  onLoadProgress?: (ratio: number) => void;
  onLoadError?: (key: string) => void;
  onBark?: (text: string, xPct: number, yPct: number, who: BarkSource) => void;
  /** Jalons sonores des cinématiques. */
  onCue?: (cue: 'ding' | 'dong' | 'ploc' | 'crash' | 'yell' | 'siren' | 'ping' | 'rocket' | 'woof') => void;
  reducedMotion = false;

  private bg!: Phaser.GameObjects.Image;
  private view!: Phaser.GameObjects.Image;
  private window!: Phaser.GameObjects.Image;
  private chuck!: Phaser.GameObjects.Image;
  private table!: Phaser.GameObjects.Image;
  private fan!: Phaser.GameObjects.Image;
  private blades!: Phaser.GameObjects.Image;
  private pan!: Phaser.GameObjects.Image;
  private glass!: Phaser.GameObjects.Image;
  private spoon!: Phaser.GameObjects.Image;
  private loaded!: Phaser.GameObjects.Image;
  private olive!: Phaser.GameObjects.Image;
  private boxer!: Phaser.GameObjects.Image;
  private dots!: Phaser.GameObjects.Graphics;
  private leapPath!: Phaser.GameObjects.Graphics;
  private rays!: Phaser.GameObjects.Graphics;
  private curtain!: Phaser.GameObjects.Rectangle;
  private alarm!: Phaser.GameObjects.Rectangle;

  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private juice!: Phaser.GameObjects.Particles.ParticleEmitter;
  private gust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars!: Phaser.GameObjects.Particles.ParticleEmitter;

  private settled: Phaser.GameObjects.Image[] = [];
  private splats: Phaser.GameObjects.Image[] = [];
  private debris: Debris[] = [];
  private extras: Phaser.GameObjects.GameObject[] = [];

  private mode: Mode = 'idle';
  private aimAngle: number = STORM.angleStart[0];
  /** La cuillère est armée (une olive attend dans son creux). */
  private armed = true;
  private spoonKick = 0;
  private fanOn = false;
  private trail: { x: number; y: number }[] = [];
  private heroBob = false;

  constructor() {
    super('olive-storm');
  }

  preload(): void {
    // décor et poses communs aux autres missions
    this.load.setPath('assets/sprites/');
    this.load.image('kitchen', 'kitchen.png');
    this.load.image('table', 'table.png');
    this.load.image('chuck_despair', 'chuck_despair.png');
    this.load.image('boxer_idle', 'saucissonator/boxer_idle.png');
    for (const k of SPRITES) this.load.image(`o_${k}`, `olive-storm/${k}.png`);
    this.load.on('progress', (r: number) => this.onLoadProgress?.(r));
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.onLoadError?.(file.key));
  }

  create(): void {
    this.makeTextures();

    this.bg = this.add.image(GAME_W / 2, GAME_H / 2, 'kitchen').setDepth(0);
    // le jardin de Jean-Mi se devine par la fenêtre ouverte
    this.view = this.add.image(WINDOW_POS.x, WINDOW_POS.y + 12, 'o_garden').setOrigin(0.5, 0).setDepth(0.1)
      .setCrop(110, 0, 300, 250).setScale(0.3);
    this.window = this.add.image(WINDOW_POS.x, WINDOW_POS.y, 'o_window').setOrigin(0.5, 0).setDepth(0.2);
    this.rays = this.add.graphics().setDepth(1).setVisible(false);
    this.drawRays();
    this.chuck = this.add.image(CHUCK.x, CHUCK.feet, 'o_chuck_aiming').setOrigin(0.5, 1).setDepth(2);
    this.table = this.add.image(GAME_W / 2, TABLE_Y, 'table').setOrigin(0.5, 0).setDepth(3);
    this.fan = this.add.image(FAN.x, FAN.y, 'o_fan').setOrigin(0.5, 1).setDepth(3.4).setFlipX(true);
    this.blades = this.add.image(FAN.x + FAN.hubX, FAN.y + FAN.hubY, 'o_fan_blades').setDepth(3.5).setAlpha(0.9);
    this.pan = this.add.image(PAN.x - 1, FLOOR_Y + 3, 'o_pan').setOrigin(0, 1).setDepth(4);
    this.glass = this.add.image(GLASS.x, FLOOR_Y + 3, 'o_glass').setOrigin(0.5, 1).setDepth(4);
    this.leapPath = this.add.graphics().setDepth(5).setVisible(false);
    this.drawLeapPath();
    this.dots = this.add.graphics().setDepth(6);
    this.spoon = this.add.image(PIVOT.x, PIVOT.y, 'o_spoon').setOrigin(SPOON_ORIGIN.x, SPOON_ORIGIN.y)
      .setFlipY(true).setDepth(6.5);
    this.loaded = this.add.image(0, 0, 'o_olive').setDepth(6.6);
    this.olive = this.add.image(0, 0, 'o_olive').setDepth(7).setVisible(false);
    this.boxer = this.add.image(0, 0, 'o_boxer_intercept').setFlipX(true).setDepth(8).setVisible(false);
    this.alarm = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xff1a00).setDepth(40).setAlpha(0);
    this.curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0c0610).setDepth(18).setAlpha(0);

    const tricolor = [0x2a5cff, 0xffffff, 0xe63946];
    this.confetti = this.add.particles(0, 0, 'conf', {
      x: { min: 0, max: GAME_W }, y: -4,
      speedY: { min: 35, max: 95 }, speedX: { min: -22, max: 22 },
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 1.7 },
      lifespan: 4200, tint: tricolor, frequency: 26, quantity: 2, emitting: false,
    }).setDepth(30);
    this.burst = this.add.particles(0, 0, 'conf', {
      speed: { min: 80, max: 260 }, angle: { min: -165, max: -15 }, gravityY: 300,
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 1.8 },
      lifespan: 1700, tint: tricolor, emitting: false,
    }).setDepth(30);
    this.sparks = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 140 }, angle: { min: 0, max: 360 }, gravityY: 200,
      lifespan: 300, tint: [0xffffff, 0xfff2a8, 0xc8d8ff], emitting: false,
    }).setDepth(9);
    this.juice = this.add.particles(0, 0, 'px', {
      speed: { min: 20, max: 110 }, angle: { min: -170, max: -10 }, gravityY: 380,
      lifespan: 420, tint: [0x9db81f, 0x6f8a12, 0xd8e86a], emitting: false,
    }).setDepth(31);
    this.gust = this.add.particles(0, 0, 'gust', {
      x: FAN.x + 18, y: { min: FAN.y - 62, max: FAN.y - 12 },
      speedX: { min: 150, max: 230 }, speedY: { min: -8, max: 8 },
      alpha: { start: 0.55, end: 0 }, lifespan: 1700, frequency: 70, emitting: false,
    }).setDepth(5.5);
    this.dust = this.add.particles(0, 0, 'smoke', {
      speed: { min: 20, max: 110 }, angle: { min: -175, max: -5 }, gravityY: -30,
      scale: { start: 1, end: 3.4 }, alpha: { start: 0.9, end: 0 },
      tint: [0xe8d2a8, 0xcdb48a, 0xf4e8cc], lifespan: 800, emitting: false,
    }).setDepth(31);
    this.stars = this.add.particles(0, 0, 'star', {
      speed: { min: 40, max: 150 }, angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0.4 }, rotate: { min: 0, max: 90 },
      lifespan: 520, tint: [0xffd23a, 0xfff2a8, 0xffffff], emitting: false,
    }).setDepth(31);

    this.showTitle();
    this.onReady?.();
  }

  private makeTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 2).generateTexture('px', 2, 2);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 3, 2).generateTexture('conf', 3, 2);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 9, 1).generateTexture('gust', 9, 1);
    g.clear().fillStyle(0xffffff);
    g.fillRect(2, 0, 4, 8).fillRect(0, 2, 8, 4).fillRect(1, 1, 6, 6);
    g.generateTexture('smoke', 8, 8);
    g.clear().fillStyle(0xffffff);
    g.fillRect(2, 0, 1, 5).fillRect(0, 2, 5, 1).fillRect(1, 1, 3, 3);
    g.generateTexture('star', 5, 5);
    g.destroy();
  }

  private drawRays(): void {
    const g = this.rays;
    const n = 14;
    const r = 460;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = Math.PI / n / 1.6;
      g.fillStyle(i % 2 ? 0xffd23a : 0xff9a1f, 0.62);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a - w) * r, Math.sin(a - w) * r);
      g.lineTo(Math.cos(a + w) * r, Math.sin(a + w) * r);
      g.closePath();
      g.fillPath();
    }
    g.fillStyle(0xfff2a8, 0.55).fillCircle(0, 0, 54);
  }

  /** La trajectoire du boxer est toujours la même : on la trace pour que le joueur puisse anticiper. */
  private drawLeapPath(): void {
    const g = this.leapPath;
    for (let i = 0; i <= 26; i++) {
      const p = boxerPath(i / 26);
      if (p.y > FLOOR_Y + 12) continue;
      g.fillStyle(0x120a14, 0.8).fillRect(Math.round(p.x - 31), Math.round(p.y) - 1, 4, 4);
      g.fillStyle(0xff8a1f, 1).fillRect(Math.round(p.x - 30), Math.round(p.y), 2, 2);
    }
  }

  // ------------------------------------------------------------ remise à zéro
  private resetCamera(): void {
    const cam = this.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    cam.shakeEffect.reset();
    cam.flashEffect.reset();
    cam.stopFollow();
    cam.setZoom(1).setAngle(0).setScroll(0, 0);
  }

  private clearEffects(): void {
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.resetCamera();
    for (const e of [this.confetti, this.burst, this.sparks, this.juice, this.gust, this.dust, this.stars]) {
      e.stop();
      e.killAll();
    }
    for (const list of [this.settled, this.splats, this.extras]) list.forEach((o) => o.destroy());
    this.settled = [];
    this.splats = [];
    this.extras = [];
    this.debris.forEach((d) => d.img.destroy());
    this.debris = [];

    this.bg.clearTint();
    this.table.clearTint();
    this.chuck.setTexture('o_chuck_aiming').clearTint().setAngle(0).setScale(1).setAlpha(1)
      .setVisible(true).setDepth(2).setPosition(CHUCK.x, CHUCK.feet);
    this.spoon.clearTint().setVisible(true).setScale(1).setDepth(6.5).setPosition(PIVOT.x, PIVOT.y);
    this.loaded.setVisible(true).setScale(1);
    this.olive.setVisible(false).setScale(1).setAlpha(1).setDepth(7);
    this.boxer.setTexture('o_boxer_intercept').setVisible(false).setFlipX(true).setAngle(0).setScale(1).setDepth(8);
    for (const o of [this.fan, this.blades, this.pan, this.glass, this.window, this.view]) o.setVisible(true).clearTint();
    this.glass.setDepth(4).setScale(1).setPosition(GLASS.x, FLOOR_Y + 3);
    this.blades.setAngle(0);
    this.leapPath.setVisible(false);
    this.dots.clear();
    this.rays.setVisible(false).setAlpha(1);
    this.alarm.setAlpha(0);
    this.curtain.setAlpha(0).setFillStyle(0x0c0610);
    this.aimAngle = STORM.angleStart[0];
    this.armed = true;
    this.spoonKick = 0;
    this.fanOn = false;
    this.heroBob = false;
    this.trail = [];
  }

  showTitle(): void {
    this.clearEffects();
    this.mode = 'idle';
  }

  /** Briefing : l'arme, l'obstacle, la cible. */
  playIntro(duration: number): void {
    this.clearEffects();
    this.mode = 'idle';
    if (this.reducedMotion) return;
    const cam = this.cameras.main;
    cam.pan(PIVOT.x + 20, PIVOT.y - 8, 450, 'Sine.easeInOut');
    cam.zoomTo(2, 450, 'Sine.easeInOut');
    this.time.delayedCall(duration * 0.3, () => {
      if (this.mode !== 'idle') return;
      cam.pan(PAN.x + 40, FLOOR_Y - 30, 420, 'Sine.easeInOut');
      cam.zoomTo(2.2, 420, 'Sine.easeInOut');
    });
    this.time.delayedCall(duration * 0.55, () => {
      if (this.mode !== 'idle') return;
      cam.pan(GLASS.x - 10, FLOOR_Y - 40, 380, 'Sine.easeInOut');
      cam.zoomTo(2.4, 380, 'Sine.easeInOut');
      this.tweens.add({ targets: this.glass, scaleX: 1.08, scaleY: 0.94, duration: 90, yoyo: true, repeat: 2, delay: 420 });
    });
    this.time.delayedCall(duration * 0.78, () => {
      if (this.mode !== 'idle') return;
      cam.pan(GAME_W / 2, GAME_H / 2, 320, 'Sine.easeOut');
      cam.zoomTo(1, 320, 'Sine.easeOut');
    });
  }

  startPlay(): void {
    this.clearEffects();
    this.mode = 'play';
  }

  // ------------------------------------------------------------ en jeu
  /** Réglage de visée courant et pointillés de la trajectoire prévisionnelle. */
  setAim(angle: number, path: readonly { x: number; y: number }[] | null): void {
    this.aimAngle = angle;
    const g = this.dots;
    g.clear();
    if (!path) return;
    path.forEach((p, i) => {
      if (i === 0) return;
      const fade = 1 - (i / path.length) * 0.3;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      g.fillStyle(0x120a14, fade).fillRect(x - 4, y - 4, 7, 7);
      g.fillStyle(i % 2 ? 0xffffff : 0xffd23a, 1).fillRect(x - 3, y - 3, 5, 5);
    });
  }

  /** Une olive attend-elle dans la cuillère ? */
  setArmed(armed: boolean): void {
    this.armed = armed;
  }

  fireFx(): void {
    this.armed = false;
    this.spoonKick = 1;
    this.tweens.add({ targets: this, spoonKick: 0, duration: 520, ease: 'Elastic.easeOut' });
    this.chuck.setScale(1.04, 0.97);
    this.tweens.add({ targets: this.chuck, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
    this.dust.emitParticleAt(PIVOT.x + 20, PIVOT.y, 4);
    this.trail = [];
    if (!this.reducedMotion) this.cameras.main.shake(90, 0.004);
  }

  /** Position de l'olive en vol, dictée par la physique. */
  syncOlive(o: Olive | null): void {
    if (!o) {
      this.olive.setVisible(false);
      return;
    }
    this.olive.setVisible(true).setPosition(o.x, o.y).setRotation(o.spin);
    this.trail.push({ x: o.x, y: o.y });
    if (this.trail.length > 9) this.trail.shift();
  }

  bounceFx(x: number, y: number, metal: boolean, speed: number): void {
    const n = Math.round(Phaser.Math.Clamp(speed / 60, 2, 9));
    if (metal) {
      this.sparks.emitParticleAt(x, y, n);
      if (!this.reducedMotion && speed > 160) this.cameras.main.shake(70, 0.004);
    } else {
      this.dust.emitParticleAt(x, y, Math.min(3, n));
    }
  }

  /** L'olive est fixée : dans le verre, écrasée sur la table, ou envolée. */
  resolveFx(fate: Fate, x: number, y: number): void {
    this.olive.setVisible(false);
    this.trail = [];
    if (fate === 'scored') {
      const img = this.add.image(x, y, 'o_olive').setDepth(4.2).setAngle(rnd(-40, 40));
      this.settled.push(img);
      this.stars.emitParticleAt(x, y - 4, 12);
      this.glass.setScale(1.1, 0.92);
      this.tweens.add({ targets: this.glass, scaleX: 1, scaleY: 1, duration: 260, ease: 'Back.easeOut' });
    } else if (fate === 'lost') {
      const onFloor = y > FLOOR_Y - 12;
      const splat = this.add.image(Phaser.Math.Clamp(x, 12, GAME_W - 12), onFloor ? FLOOR_Y + 2 : y, 'o_olive_splat')
        .setOrigin(0.5, onFloor ? 1 : 0.5).setDepth(3.8).setScale(0.3);
      this.splats.push(splat);
      this.tweens.add({ targets: splat, scale: 1, duration: 140, ease: 'Back.easeOut' });
      this.juice.emitParticleAt(x, y, 10);
    } else if (fate === 'space') {
      this.dust.emitParticleAt(x, 4, 14);
      if (!this.reducedMotion) this.cameras.main.shake(180, 0.008);
    } else if (fate === 'window') {
      this.sparks.emitParticleAt(x, y, 8);
    } else if (fate === 'dog') {
      this.juice.emitParticleAt(x, y, 6);
      this.boxer.setScale(1.15);
      this.tweens.add({ targets: this.boxer, scale: 1, duration: 200, ease: 'Back.easeOut' });
    }
  }

  /** Phase 2 : le ventilateur se met en marche. */
  setFan(on: boolean): void {
    this.fanOn = on;
    if (on) this.gust.start();
    else this.gust.stop();
  }

  /** Phase 3 : position du boxer, telle que la logique la calcule. */
  syncBoxer(b: BoxerState, active: boolean): void {
    this.leapPath.setVisible(active && (b.warning || b.leaping));
    this.boxer.setVisible(active && b.leaping);
    if (!b.leaping) return;
    const before = boxerPath(Math.max(0, b.k - 0.02));
    this.boxer.setPosition(b.x, b.y).setRotation(Math.atan2(b.y - before.y, b.x - before.x) + Math.PI);
  }

  // ------------------------------------------------------------ victoire
  victory(): void {
    this.mode = 'ending';
    const cam = this.cameras.main;
    this.dots.clear();
    this.leapPath.setVisible(false);
    this.boxer.setVisible(false);
    this.setFan(false);
    this.loaded.setVisible(false);
    // silence, noir : puis le projecteur
    this.curtain.setDepth(1.5).setAlpha(0);
    this.tweens.add({ targets: this.curtain, alpha: 0.82, duration: 260 });
    this.table.setTint(0x554a66);
    for (const o of [this.fan, this.blades, this.pan]) o.setTint(0x554a66);

    this.time.delayedCall(650, () => {
      cam.flash(this.reducedMotion ? 100 : 240, 255, 255, 255);
      const heroX = 138;
      this.chuck.setTexture('o_chuck_hero').setPosition(heroX, CHUCK.feet + 60);
      this.tweens.add({ targets: this.chuck, y: CHUCK.feet, duration: 360, ease: 'Back.easeOut', onComplete: () => { this.heroBob = true; } });
      // faisceau du projecteur
      const beam = this.add.graphics().setDepth(1.6);
      beam.fillStyle(0xfff3d6, 0.2).fillTriangle(heroX, -20, heroX - 96, GAME_H, heroX + 96, GAME_H);
      beam.fillStyle(0xfff3d6, 0.18).fillTriangle(heroX, -20, heroX - 62, GAME_H, heroX + 62, GAME_H);
      beam.fillStyle(0xfff3d6, 0.14).fillTriangle(GLASS.x, -20, GLASS.x - 46, FLOOR_Y + 8, GLASS.x + 46, FLOOR_Y + 8);
      this.extras.push(beam);
      this.rays.setPosition(heroX, 110).setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.rays, alpha: 0.55, duration: 400 });
      this.burst.explode(80, heroX, 90);
      this.confetti.start();
      this.stars.emitParticleAt(GLASS.x, FLOOR_Y - 46, 24);
      this.tweens.add({ targets: this.glass, scaleX: 1.12, scaleY: 1.12, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });
  }

  // ------------------------------------------------------------ échec 1 : incident spatial
  failSpace(): void {
    this.mode = 'ending';
    const cam = this.cameras.main;
    const rm = this.reducedMotion;
    this.dots.clear();
    this.setFan(false);
    this.leapPath.setVisible(false);
    this.boxer.setVisible(false);
    // le tir de trop : l'olive traverse le plafond
    this.armed = false;
    this.spoonKick = 1;
    this.tweens.add({ targets: this, spoonKick: 0, duration: 520, ease: 'Elastic.easeOut' });
    this.onCue?.('rocket');
    const o = this.add.image(PIVOT.x + 40, PIVOT.y - 40, 'o_olive').setDepth(9);
    this.extras.push(o);
    this.tweens.add({
      targets: o, x: 250, y: -30, angle: 900, duration: 520, ease: 'Quad.easeIn',
      onUpdate: () => { if (Math.random() < 0.6) this.sparks.emitParticleAt(o.x, o.y, 1); },
      onComplete: () => {
        this.dust.emitParticleAt(250, 6, 26);
        if (!rm) cam.shake(420, 0.02);
        cam.flash(rm ? 80 : 160, 255, 255, 255);
        for (let i = 0; i < 7; i++) {
          const chip = this.add.image(250 + rnd(-20, 20), 4, 'px').setScale(rnd(1, 2.5)).setTint(0x7a5a3c).setDepth(9);
          this.debris.push({ img: chip, vx: rnd(-70, 70), vy: rnd(20, 120), vr: 0 });
        }
      },
    });
    this.time.delayedCall(1250, () => this.radar());
  }

  /** Écran radar : dessiné par Phaser (aucune illustration de radar n'existe). */
  private radar(): void {
    const cx = GAME_W / 2;
    const cy = 142;
    const R = 104;
    this.curtain.setDepth(18).setFillStyle(0x02140a).setAlpha(0);
    this.tweens.add({ targets: this.curtain, alpha: 1, duration: 200 });
    const grid = this.add.graphics().setDepth(19).setAlpha(0);
    grid.lineStyle(1, 0x2cff7a, 0.75);
    for (const r of [R, R * 0.66, R * 0.33]) grid.strokeCircle(cx, cy, r);
    grid.lineBetween(cx - R, cy, cx + R, cy).lineBetween(cx, cy - R, cx, cy + R);
    grid.lineStyle(1, 0x2cff7a, 0.3);
    for (let a = 0; a < 360; a += 30) grid.lineBetween(cx, cy, cx + Math.cos(rad(a)) * R, cy + Math.sin(rad(a)) * R);
    const sweep = this.add.graphics().setDepth(19.5).setPosition(cx, cy).setAlpha(0);
    for (let i = 0; i < 22; i++) {
      sweep.fillStyle(0x2cff7a, 0.3 * (1 - i / 22));
      sweep.slice(0, 0, R, rad(-i * 2.2 - 2.2), rad(-i * 2.2), false).fillPath();
    }
    sweep.lineStyle(1, 0xb8ffd0, 1).lineBetween(0, 0, R, 0);
    // l'objet vert non identifié, vu par l'armée de l'air : c'est l'olive
    const blip = this.add.image(cx - 22, cy + 30, 'o_olive').setDepth(20).setAlpha(0).setTint(0xb8ffd0);
    const ring = this.add.graphics().setDepth(19.8);
    this.extras.push(grid, sweep, blip, ring);
    this.tweens.add({ targets: [grid, sweep], alpha: 1, duration: 260, delay: 150 });
    this.tweens.add({ targets: sweep, angle: 360, duration: 2400, repeat: -1 });
    this.tweens.add({ targets: blip, x: cx + 38, y: cy - 52, duration: 5200, ease: 'Linear' });
    this.time.addEvent({
      delay: 1200, loop: true, startAt: 700,
      callback: () => {
        this.onCue?.('ping');
        blip.setAlpha(1);
        this.tweens.add({ targets: blip, alpha: 0.25, duration: 1000 });
        const ping = { r: 3 };
        this.tweens.add({
          targets: ping, r: 22, duration: 700,
          onUpdate: () => ring.clear().lineStyle(1, 0xb8ffd0, 1 - ping.r / 22).strokeCircle(blip.x, blip.y, ping.r),
        });
      },
    });
  }

  // ------------------------------------------------------------ échec 2 : trahison canine
  failDog(): void {
    this.mode = 'ending';
    const cam = this.cameras.main;
    this.dots.clear();
    this.setFan(false);
    this.leapPath.setVisible(false);
    this.loaded.setVisible(false);
    // le boxer repart, l'olive entre les dents, très fier de lui
    const from = this.boxer.visible ? { x: this.boxer.x, y: this.boxer.y } : { x: 380, y: 150 };
    this.boxer.setVisible(true).setFlipX(true).setRotation(0).setPosition(from.x, from.y);
    this.tweens.add({
      targets: this.boxer, x: -80, y: FLOOR_Y + 10, duration: 620, ease: 'Quad.easeIn',
      onComplete: () => {
        this.boxer.setVisible(false);
        this.dust.emitParticleAt(20, FLOOR_Y + 10, 12);
      },
    });
    if (!this.reducedMotion) cam.shake(200, 0.008);

    this.time.delayedCall(820, () => {
      // Chuck, humilié ; le chien revient parader
      this.spoon.setVisible(false);
      this.chuck.setTexture('chuck_despair').setPosition(CHUCK.x + 30, OLD_FEET.despair);
      this.onBark?.('MON PROPRE CHIEN…', 26, 30, 'chuck');
      const proud = this.add.image(-60, 252, 'boxer_idle').setOrigin(0.5, 1).setDepth(8);
      const prize = this.add.image(0, 0, 'o_olive').setDepth(8.1);
      this.extras.push(proud, prize);
      this.onCue?.('woof');
      this.tweens.add({
        targets: proud, x: 290, duration: 1500, ease: 'Sine.easeOut',
        onUpdate: () => {
          proud.y = 252 - Math.abs(Math.sin(proud.x / 16)) * 7;
          prize.setPosition(proud.x + 37, proud.y - 78);
        },
        onComplete: () => {
          this.onBark?.('WOUF.', 62, 40, 'boxer');
          this.tweens.add({ targets: proud, y: 246, duration: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            onUpdate: () => prize.setPosition(proud.x + 37, proud.y - 78) });
        },
      });
    });
  }

  // ------------------------------------------------------------ échec 3 : incident diplomatique
  failDiplomatic(): void {
    this.mode = 'ending';
    const cam = this.cameras.main;
    const rm = this.reducedMotion;
    this.dots.clear();
    this.setFan(false);
    this.leapPath.setVisible(false);
    this.boxer.setVisible(false);
    this.loaded.setVisible(false);

    // l'olive de trop, au ralenti : casserole, horloge, fenêtre
    const o = this.add.image(PIVOT.x + 50, PIVOT.y - 44, 'o_olive').setDepth(9).setScale(1.5);
    this.extras.push(o);
    const panHit = { x: PAN.x + PAN.w + 18, y: FLOOR_Y - PAN.h - 10 };
    const clockHit = { x: CLOCK.x - 12, y: CLOCK.y + 16 };
    const exit = { x: (WINDOW.x0 + WINDOW.x1) / 2, y: (WINDOW.y0 + WINDOW.y1) / 2 };
    if (!rm) {
      cam.startFollow(o, true, 0.12, 0.12);
      cam.zoomTo(1.7, 500, 'Sine.easeOut');
    }
    const hop = (to: { x: number; y: number }, lift: number, ms: number, done: () => void) => {
      const from = { x: o.x, y: o.y };
      this.tweens.addCounter({
        from: 0, to: 1, duration: ms, ease: 'Sine.easeInOut',
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          o.setPosition(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * lift);
          o.angle += 5;
        },
        onComplete: done,
      });
    };
    hop(panHit, 46, 700, () => {
      this.onCue?.('ding');
      this.sparks.emitParticleAt(o.x, o.y, 14);
      this.pan.setTint(0xffffff);
      this.tweens.add({ targets: this.pan, angle: { from: -5, to: 0 }, duration: 260, ease: 'Bounce.easeOut', onComplete: () => this.pan.clearTint() });
      hop(clockHit, 18, 780, () => {
        this.onCue?.('dong');
        this.sparks.emitParticleAt(o.x, o.y, 14);
        if (!rm) cam.shake(160, 0.006);
        hop(exit, 22, 860, () => {
          this.tweens.add({ targets: o, scale: 0.3, alpha: 0, duration: 260 });
          this.time.delayedCall(360, () => this.garden());
        });
      });
    });
  }

  /** Chez le voisin : Jean-Mi, son pastis, et l'olive qui arrive. */
  private garden(): void {
    const cam = this.cameras.main;
    const rm = this.reducedMotion;
    cam.stopFollow();
    cam.zoomEffect.reset();
    cam.setZoom(1).setScroll(0, 0);
    cam.flash(140, 255, 255, 255);

    const feet = 250;
    const jx = 300;
    const back = this.add.image(GAME_W / 2, GAME_H / 2, 'o_garden').setDepth(20);
    const jeanmi = this.add.image(jx, feet, 'o_jeanmi_idle').setOrigin(0.5, 1).setDepth(22);
    // le verre de pastis est un objet à part : il est tenu, puis il tombe tout seul
    const hand = { x: jx + 27, y: feet - 62 };
    const pastis = this.add.image(hand.x, hand.y, 'o_pastis').setOrigin(0.5, 0.85).setDepth(23);
    const olive = this.add.image(-20, 20, 'o_olive').setDepth(24).setScale(1.4);
    this.extras.push(back, jeanmi, pastis, olive);
    // il sirote, tranquille
    const sip = this.tweens.add({ targets: pastis, y: hand.y - 3, angle: -6, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const breathe = this.tweens.add({ targets: jeanmi, scaleY: 1.012, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (!rm) {
      cam.setZoom(1.25).centerOn(jx - 30, 160);
      cam.zoomTo(1.5, 1500, 'Sine.easeInOut');
    }

    // l'olive arrive par-dessus la clôture et choisit le crâne
    const head = { x: jx - 6, y: feet - 143 };
    this.tweens.addCounter({
      from: 0, to: 1, duration: 1250, delay: 650, ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        olive.setPosition(-20 + (head.x + 20) * k, 20 + (head.y - 20) * k - Math.sin(k * Math.PI) * 60);
        olive.angle += 9;
      },
      onComplete: () => {
        // PLOC !
        this.onCue?.('ploc');
        this.onBark?.('PLOC !', 62, 22, 'jeanmi');
        breathe.stop();
        sip.stop();
        jeanmi.setTexture('o_jeanmi_hit').setScale(1);
        this.juice.emitParticleAt(head.x, head.y, 14);
        if (!rm) cam.shake(140, 0.01);
        // l'olive rebondit sur le crâne et roule dans l'herbe
        this.debris.push({ img: olive, vx: 60, vy: -150, vr: 500 });
        // le verre lui échappe
        pastis.setAngle(0);
        this.tweens.add({ targets: pastis, angle: 200, duration: 620, ease: 'Linear' });
        this.tweens.add({
          targets: pastis, y: feet - 2, x: hand.x + 16, duration: 620, ease: 'Quad.easeIn',
          onComplete: () => {
            this.onCue?.('crash');
            pastis.setAngle(96);
            this.sparks.emitParticleAt(pastis.x, feet - 4, 16);
            for (let i = 0; i < 12; i++) {
              const drop = this.add.image(pastis.x, feet - 6, 'px').setTint(0xf2e08a).setDepth(24);
              this.debris.push({ img: drop, vx: rnd(-90, 110), vy: rnd(-170, -60), vr: 0 });
            }
          },
        });

        // il se fige. Longtemps.
        this.time.delayedCall(1500, () => {
          jeanmi.setTexture('o_jeanmi_angry');
          cam.flash(rm ? 60 : 160, 255, 60, 30);
          if (!rm) {
            cam.shake(900, 0.014);
            cam.zoomTo(1.85, 380, 'Back.easeOut');
            cam.pan(jx - 6, feet - 96, 380, 'Sine.easeOut');
          }
          this.tweens.add({ targets: jeanmi, x: jx + 2, duration: 45, yoyo: true, repeat: 22 });
          this.onCue?.('yell');
          // écran rouge, sirène
          this.time.delayedCall(900, () => {
            this.onCue?.('siren');
            this.alarm.setAlpha(0.5);
            this.tweens.add({ targets: this.alarm, alpha: 0.16, duration: 420, yoyo: true, repeat: -1 });
          });
        });
      },
    });
  }

  // ------------------------------------------------------------ boucle
  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.onTick?.(dt);

    if (this.mode !== 'ending' || this.spoon.visible) this.layoutSpoon(time);
    if (this.mode === 'idle' || this.mode === 'play') {
      this.chuck.y = CHUCK.feet + Math.round(Math.sin(time / 380));
    } else if (this.heroBob) {
      this.chuck.y = CHUCK.feet - Math.abs(Math.sin(time / 190)) * 4;
      this.rays.rotation += dt * 0.5;
    }
    this.blades.angle += (this.fanOn ? 1500 : 0) * dt;

    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.vy += 520 * dt;
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      d.img.angle += d.vr * dt;
      if (d.img.y > GAME_H + 30) {
        d.img.destroy();
        this.debris.splice(i, 1);
      }
    }
  }

  /** La cuillère pivote autour du poing de Chuck : armée vers l'arrière, puis rabattue sur la ligne de tir. */
  private layoutSpoon(time: number): void {
    if (this.heroBob) {
      // trophée : brandie à bout de bras
      this.spoon.setPosition(this.chuck.x + 36, this.chuck.y - 166).setAngle(-78 + Math.sin(time / 240) * 3).setDepth(2.2);
      return;
    }
    const cock = this.armed ? 96 : 0;
    const angle = -(this.aimAngle + cock) - this.spoonKick * 34;
    const bob = this.mode === 'ending' ? 0 : Math.round(Math.sin(time / 380));
    this.spoon.setPosition(PIVOT.x, PIVOT.y + bob).setAngle(angle);
    const a = rad(angle);
    this.loaded.setVisible(this.armed && this.mode !== 'ending')
      .setPosition(PIVOT.x + Math.cos(a) * (SPOON_REACH + 2), PIVOT.y + bob + Math.sin(a) * (SPOON_REACH + 2));
  }
}
