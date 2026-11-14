import Phaser from 'phaser';
import { CUT, type Quality } from '../config/balance';
import type { CutRecord } from '../systems/session';

export const GAME_W = 480;
export const GAME_H = 270;

// ------------------------------------------------------------ mise en place (px logiques)
const TABLE_Y = 192;
/** Ligne de coupe : tout ce qui dépasse à gauche devient la rondelle. */
const X_CUT = 215;
const BOARD_X = 245;
const BOARD_BOTTOM = 272;
/** Axe du saucisson. */
const SAU_Y = 208;
const SAU_W = 298;
const SAU_H = 63;
/** Demi-largeur de la face tranchée (ellipse) : le corps est rogné derrière elle. */
const FACE_RX = 23;

/** Point de prise du manche dans le sprite du couteau (tranchant à gauche). */
const KNIFE_ORIGIN = { x: 0.75, y: 0.19 };
const KNIFE_X = X_CUT + 46;
const KNIFE_Y = 85;
const KNIFE_REST = -125;

const CHUCK_X = 285;
const CHUCK_FEET = 238;
/** À la victoire, Chuck descend d'un cran pour que le plateau tienne dans le cadre. */
const TROPHY_FEET = 284;
/** Poses héritées d'Opération Cornichon : position des pieds derrière le plan de travail. */
const OLD_FEET = { cool: 264, rage: 252, despair: 250 } as const;
type OldPose = keyof typeof OLD_FEET;

const BOXER_X = 52;
const BOXER_Y = 250;

const GRAVITY = 620;
const SLOT_X = [121, 144, 167, 190];
const SLOT_Y = [207, 223, 239];

const SLICE_KEY: Record<Quality, string> = {
  perfect: 's_slice_ok', good: 's_slice_ok', thin: 's_slice_thin', thick: 's_slice_thick', disaster: 's_slice_thick',
};

const SPRITES = [
  'chuck_cutting', 'chuck_trophy', 'boxer_idle', 'boxer_steal', 'boxer_eat',
  'board', 'board_half_l', 'board_half_r', 'knife', 'saucisson', 'saucisson_face',
  'slice_thin', 'slice_ok', 'slice_thick', 'slice_giant', 'platter',
];
const SPLINTERS = 8;

type Mode = 'idle' | 'play' | 'victory' | 'thick' | 'dog' | 'nuclear';

interface Debris {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  vr: number;
  floor: number | null;
  bounces: number;
  resting: boolean;
}

interface Slice {
  img: Phaser.GameObjects.Image;
  tx: number;
  ty: number;
  vy: number;
  bounces: number;
  resting: boolean;
}

export type BarkSource = 'chuck' | 'boxer';

const rnd = (min: number, max: number) => min + Math.random() * (max - min);

export class CharcuterieScene extends Phaser.Scene {
  onTick?: (dt: number) => void;
  onReady?: () => void;
  onLoadProgress?: (ratio: number) => void;
  onLoadError?: (key: string) => void;
  onBark?: (text: string, xPct: number, yPct: number, who: BarkSource) => void;
  /** Une rondelle vient de toucher la planche. */
  onSliceLand?: () => void;
  reducedMotion = false;

  private bg!: Phaser.GameObjects.Image;
  private table!: Phaser.GameObjects.Image;
  private chuck!: Phaser.GameObjects.Image;
  private boxer!: Phaser.GameObjects.Image;
  private board!: Phaser.GameObjects.Image;
  private sausage!: Phaser.GameObjects.Image;
  private face!: Phaser.GameObjects.Image;
  private knife!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private slash!: Phaser.GameObjects.Rectangle;
  private rays!: Phaser.GameObjects.Graphics;
  private alarm!: Phaser.GameObjects.Rectangle;
  private curtain!: Phaser.GameObjects.Rectangle;

  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private crumbs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sweat!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;

  private slices: Slice[] = [];
  private debris: Debris[] = [];
  private extras: Phaser.GameObjects.GameObject[] = [];
  private splitCam: Phaser.Cameras.Scene2D.Camera | null = null;

  private mode: Mode = 'idle';
  private thickness = 0;
  private consumed = 0;
  /** Pendant la descente du couteau, on fige l'épaisseur affichée : la rondelle part à l'impact. */
  private holdUntil = 0;
  private heldThickness = 0;
  private heldConsumed = 0;
  private tactical = false;
  /** Décalages animés, recomposés à chaque image (Chuck tient le couteau). */
  private fx = { dip: 0, lean: 0, hop: 0, boxerHop: 0, boardKick: 0 };
  private chuckFeet = CHUCK_FEET;
  private trophy: Phaser.GameObjects.Image | null = null;

  constructor() {
    super('charcuterie');
  }

  preload(): void {
    // décor et poses de Chuck communs avec Opération Cornichon
    this.load.setPath('assets/sprites/');
    this.load.image('kitchen', 'kitchen.png');
    this.load.image('table', 'table.png');
    for (const p of Object.keys(OLD_FEET)) this.load.image(`chuck_${p}`, `chuck_${p}.png`);
    for (const k of SPRITES) this.load.image(`s_${k}`, `saucissonator/${k}.png`);
    for (let i = 0; i < SPLINTERS; i++) {
      const k = `splinter_${String(i).padStart(2, '0')}`;
      this.load.image(`s_${k}`, `saucissonator/${k}.png`);
    }
    this.load.on('progress', (r: number) => this.onLoadProgress?.(r));
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.onLoadError?.(file.key));
  }

  create(): void {
    this.makeTextures();

    this.bg = this.add.image(GAME_W / 2, GAME_H / 2, 'kitchen').setDepth(0);
    this.rays = this.add.graphics().setDepth(1).setVisible(false);
    this.drawRays();
    this.boxer = this.add.image(BOXER_X, BOXER_Y, 's_boxer_idle').setOrigin(0.5, 1).setDepth(2);
    this.chuck = this.add.image(CHUCK_X, CHUCK_FEET, 's_chuck_cutting').setOrigin(0.5, 1).setDepth(2);
    this.table = this.add.image(GAME_W / 2, TABLE_Y, 'table').setOrigin(0.5, 0).setDepth(3);
    this.board = this.add.image(BOARD_X, BOARD_BOTTOM, 's_board').setOrigin(0.5, 1).setDepth(4);
    this.sausage = this.add.image(X_CUT, SAU_Y, 's_saucisson').setOrigin(0, 0.5).setDepth(6);
    this.face = this.add.image(X_CUT, SAU_Y, 's_saucisson_face').setOrigin(0, 0.5).setDepth(6.1);
    this.guide = this.add.graphics().setDepth(6.5).setVisible(false);
    this.drawGuide();
    this.knife = this.add.image(KNIFE_X, KNIFE_Y, 's_knife').setOrigin(KNIFE_ORIGIN.x, KNIFE_ORIGIN.y)
      .setDepth(7).setAngle(KNIFE_REST);
    this.slash = this.add.rectangle(X_CUT, GAME_H / 2, 3, GAME_H, 0xffffff).setDepth(9).setAlpha(0);
    this.alarm = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xff2200).setDepth(10).setAlpha(0);
    this.curtain = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x0c0610).setDepth(11).setAlpha(0);

    const tricolor = [0x2a5cff, 0xffffff, 0xe63946];
    this.confetti = this.add.particles(0, 0, 'conf', {
      x: { min: 0, max: GAME_W }, y: -4,
      speedY: { min: 35, max: 95 }, speedX: { min: -22, max: 22 },
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 1.7 },
      lifespan: 4200, tint: tricolor, frequency: 26, quantity: 2, emitting: false,
    }).setDepth(8);
    this.burst = this.add.particles(0, 0, 'conf', {
      speed: { min: 80, max: 260 }, angle: { min: -165, max: -15 }, gravityY: 300,
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 1.8 },
      lifespan: 1700, tint: tricolor, emitting: false,
    }).setDepth(8);
    this.crumbs = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 130 }, angle: { min: -170, max: -60 }, gravityY: 420,
      lifespan: 420, tint: [0xb8323a, 0xf2b8a0, 0xf4e6dc, 0x8a2a2c], emitting: false,
    }).setDepth(8);
    this.stars = this.add.particles(0, 0, 'star', {
      speed: { min: 40, max: 150 }, angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0.4 }, rotate: { min: 0, max: 90 },
      lifespan: 520, tint: [0xffd23a, 0xfff2a8, 0xffffff], emitting: false,
    }).setDepth(8);
    this.sweat = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 75 }, angle: { min: -160, max: -20 }, gravityY: 220,
      lifespan: 480, tint: [0x7fd4ff, 0xc8f0ff], emitting: false,
    }).setDepth(8);
    this.dust = this.add.particles(0, 0, 'smoke', {
      speed: { min: 20, max: 110 }, angle: { min: -175, max: -5 }, gravityY: -30,
      scale: { start: 1, end: 3.6 }, alpha: { start: 0.9, end: 0 },
      tint: [0xe8d2a8, 0xcdb48a, 0xf4e8cc], lifespan: 900, emitting: false,
    }).setDepth(8);
    this.fire = this.add.particles(0, 0, 'px', {
      speed: { min: 40, max: 220 }, angle: { min: 0, max: 360 }, gravityY: 160,
      lifespan: 700, tint: [0xff8800, 0xffcc00, 0xff3300, 0xffffff], scale: { start: 3, end: 1 }, emitting: false,
    }).setDepth(8);
    this.smoke = this.add.particles(0, 0, 'smoke', {
      x: { min: 10, max: GAME_W - 10 }, y: { min: 110, max: 255 },
      speedY: { min: -42, max: -14 }, speedX: { min: -8, max: 8 },
      scale: { start: 1, end: 4.5 }, alpha: { start: 0.75, end: 0 },
      tint: [0x2c2622, 0x4a423c, 0x1c1816], lifespan: 2600, frequency: 45, emitting: false,
    }).setDepth(8);
    this.embers = this.add.particles(0, 0, 'px', {
      x: { min: 0, max: GAME_W }, y: { min: 190, max: GAME_H },
      speedY: { min: -95, max: -30 }, speedX: { min: -15, max: 15 },
      alpha: { start: 1, end: 0 }, tint: [0xff8800, 0xffcc00, 0xff3300],
      lifespan: 1500, frequency: 55, emitting: false,
    }).setDepth(8);

    this.showTitle();
    this.onReady?.();
  }

  private makeTextures(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 2, 2).generateTexture('px', 2, 2);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 3, 2).generateTexture('conf', 3, 2);
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

  /** Gabarit de coupe : la pointe du saucisson doit atteindre la bande verte. */
  private drawGuide(): void {
    const g = this.guide;
    const top = SAU_Y - SAU_H / 2 - 5;
    const h = SAU_H + 11;
    const band = (from: number, to: number, color: number, alpha: number) =>
      g.fillStyle(color, alpha).fillRect(X_CUT - to, top, to - from, h);
    band(CUT.ideal - CUT.goodTol, CUT.ideal + CUT.goodTol, 0xffd23a, 0.2);
    band(CUT.ideal - CUT.perfectTol, CUT.ideal + CUT.perfectTol, 0x5fd24a, 0.5);
    // repères de la bande parfaite
    const px0 = X_CUT - CUT.ideal - CUT.perfectTol;
    const pw = CUT.perfectTol * 2;
    g.fillStyle(0x5fd24a, 1).fillRect(px0, top - 3, pw, 3).fillRect(px0, top + h, pw, 3);
    g.fillStyle(0x0c2a08, 1).fillRect(px0 - 1, top - 3, 1, 3).fillRect(px0 + pw, top - 3, 1, 3);
    // zone interdite : au-delà, Chuck perd patience
    g.fillStyle(0xe63946, 0.85);
    for (let y = top; y < top + h; y += 4) g.fillRect(X_CUT - CUT.disaster, y, 1, 2);
    // ligne de coupe
    g.fillStyle(0x120a14, 0.9).fillRect(X_CUT - 1, top - 4, 3, h + 8);
    g.fillStyle(0xffffff, 1).fillRect(X_CUT, top - 4, 1, h + 8);
    g.fillTriangle(X_CUT - 3, top - 8, X_CUT + 4, top - 8, X_CUT + 0.5, top - 3);
    g.fillTriangle(X_CUT - 3, top + h + 8, X_CUT + 4, top + h + 8, X_CUT + 0.5, top + h + 3);
  }

  // ------------------------------------------------------------ remise à zéro
  private resetCamera(): void {
    if (this.splitCam) {
      this.cameras.remove(this.splitCam);
      this.splitCam = null;
    }
    const cam = this.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    cam.shakeEffect.reset();
    cam.flashEffect.reset();
    cam.setViewport(0, 0, GAME_W, GAME_H);
    cam.setZoom(1).setAngle(0).setScroll(0, 0);
    cam.setBackgroundColor(0x000000);
  }

  private clearEffects(): void {
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.resetCamera();
    for (const e of [this.confetti, this.burst, this.crumbs, this.stars, this.sweat, this.dust, this.smoke, this.embers, this.fire]) {
      e.stop();
      e.killAll();
    }
    this.slices.forEach((s) => s.img.destroy());
    this.slices = [];
    this.debris.forEach((d) => d.img.destroy());
    this.debris = [];
    this.extras.forEach((o) => o.destroy());
    this.extras = [];
    this.trophy = null;

    this.bg.clearTint().setAngle(0).setPosition(GAME_W / 2, GAME_H / 2);
    this.table.clearTint().setAngle(0).setPosition(GAME_W / 2, TABLE_Y);
    this.chuck.setTexture('s_chuck_cutting').clearTint().setAngle(0).setScale(1).setAlpha(1)
      .setVisible(true).setPosition(CHUCK_X, CHUCK_FEET);
    this.chuckFeet = CHUCK_FEET;
    this.boxer.setTexture('s_boxer_idle').clearTint().setAngle(0).setScale(1).setAlpha(1)
      .setVisible(true).setFlipX(false).setPosition(BOXER_X, BOXER_Y).setDepth(2);
    this.board.clearTint().setVisible(true).setAngle(0).setPosition(BOARD_X, BOARD_BOTTOM);
    this.sausage.clearTint().setVisible(true).setAngle(0).setAlpha(1);
    this.face.clearTint().setVisible(true).setAngle(0).setAlpha(1);
    this.knife.clearTint().setVisible(true).setScale(1).setAlpha(1).setAngle(KNIFE_REST).setPosition(KNIFE_X, KNIFE_Y);
    this.guide.setVisible(false).setAlpha(1);
    this.slash.setAlpha(0).setPosition(X_CUT, GAME_H / 2).setScale(1);
    this.rays.setVisible(false).setAlpha(1).setPosition(CHUCK_X, 130);
    this.alarm.setAlpha(0);
    this.curtain.setAlpha(0);

    this.thickness = 0;
    this.consumed = 0;
    this.holdUntil = 0;
    this.tactical = false;
    this.fx = { dip: 0, lean: 0, hop: 0, boxerHop: 0, boardKick: 0 };
    this.layoutSausage(0, 0);
  }

  showTitle(): void {
    this.clearEffects();
    this.mode = 'idle';
  }

  /** Briefing : gros plan sur l'arme, sur la cible, puis sur le suspect. */
  playIntro(): void {
    this.clearEffects();
    this.mode = 'idle';
    if (this.reducedMotion) return;
    const cam = this.cameras.main;
    cam.pan(KNIFE_X + 26, 96, 450, 'Sine.easeInOut');
    cam.zoomTo(1.9, 450, 'Sine.easeInOut');
    this.time.delayedCall(1500, () => {
      cam.pan(X_CUT + 46, SAU_Y, 420, 'Sine.easeInOut');
      cam.zoomTo(2.3, 420, 'Sine.easeInOut');
    });
    this.time.delayedCall(2750, () => {
      cam.pan(BOXER_X + 26, 172, 380, 'Sine.easeInOut');
      cam.zoomTo(2.6, 380, 'Sine.easeInOut');
      this.time.delayedCall(420, () => this.boxerHop());
    });
    this.time.delayedCall(3750, () => {
      cam.pan(GAME_W / 2, GAME_H / 2, 320, 'Sine.easeOut');
      cam.zoomTo(1, 320, 'Sine.easeOut');
    });
  }

  startPlay(): void {
    this.clearEffects();
    this.mode = 'play';
    this.guide.setVisible(true);
  }

  // ------------------------------------------------------------ en jeu
  /** Position du saucisson, dictée par la logique : dépassement et longueur déjà débitée. */
  setFeed(thickness: number, consumed: number): void {
    this.thickness = thickness;
    this.consumed = consumed;
  }

  private layoutSausage(thickness: number, consumed: number): void {
    const tip = Math.round(X_CUT - thickness);
    const used = Math.min(SAU_W - FACE_RX - 2, Math.round(consumed));
    this.sausage.setPosition(tip - used, SAU_Y).setCrop(used + FACE_RX, 0, SAU_W - used - FACE_RX, SAU_H);
    this.face.setPosition(tip, SAU_Y);
  }

  /** Coup de couteau : la rondelle découpée part à l'impact de la lame. */
  cutFx(record: CutRecord, consumedBefore: number): void {
    const now = this.time.now;
    const strike = 50;
    this.holdUntil = now + strike;
    this.heldThickness = record.thickness;
    this.heldConsumed = consumedBefore;

    this.tweens.killTweensOf(this.knife);
    this.tweens.add({
      targets: this.knife, angle: 0, duration: strike, ease: 'Cubic.easeIn',
      onComplete: () => {
        this.impact(record);
        this.tweens.add({ targets: this.knife, angle: KNIFE_REST, duration: 190, delay: 70, ease: 'Back.easeOut' });
      },
    });
    this.tweens.killTweensOf(this.fx);
    this.fx.dip = 0;
    this.fx.lean = 0;
    this.fx.hop = 0;
    this.fx.boardKick = 0;
    this.tweens.add({ targets: this.fx, dip: 5, lean: 2.5, duration: strike, yoyo: true, hold: 60, ease: 'Quad.easeOut' });
  }

  private impact(record: CutRecord): void {
    const q = record.quality;
    const heavy = q === 'thick' || q === 'disaster';
    const motion = this.reducedMotion ? 0.3 : 1;

    // éclair de lame + miettes
    this.slash.setAlpha(0.9).setScale(1);
    this.tweens.add({ targets: this.slash, alpha: 0, scaleX: 0.3, duration: 130 });
    this.crumbs.emitParticleAt(X_CUT, SAU_Y, heavy ? 16 : 9);
    // la planche encaisse
    this.cameras.main.shake(heavy ? 150 : 80, (heavy ? 0.009 : 0.0045) * motion);
    this.tweens.add({ targets: this.fx, boardKick: heavy ? 4 : 2, duration: 45, yoyo: true, ease: 'Quad.easeOut' });

    if (q !== 'disaster') this.spawnSlice(record);

    // réaction de Chuck
    if (q === 'perfect') {
      this.stars.emitParticleAt(X_CUT, SAU_Y - 20, 10);
      this.tweens.add({ targets: this.fx, hop: 6, duration: 90, yoyo: true, delay: 110, ease: 'Quad.easeOut' });
    } else if (q === 'thick' || q === 'thin') {
      this.chuck.setTint(0xff7a70);
      this.time.delayedCall(170, () => { if (this.mode === 'play') this.applyChuckTint(); });
      this.sweat.emitParticleAt(CHUCK_X + 12, 128, 8);
      if (q === 'thin') this.boxerHop();
    }
  }

  private spawnSlice(record: CutRecord): void {
    const i = record.index;
    const row = Math.floor(i / SLOT_X.length) % SLOT_Y.length;
    const tx = SLOT_X[i % SLOT_X.length];
    const ty = SLOT_Y[row];
    const img = this.add.image(X_CUT - record.thickness / 2, SAU_Y + 14, SLICE_KEY[record.quality])
      .setOrigin(0.5, 1).setDepth(5 + row * 0.1 + i * 0.001).setAngle(-28);
    this.slices.push({ img, tx, ty, vy: -150, bounces: 2, resting: false });
  }

  /** Série de coupes parfaites : la lame se met à briller. */
  setTactical(on: boolean): void {
    this.tactical = on;
    if (on) this.knife.setTint(0xffe27a);
    else this.knife.clearTint();
  }

  /** « MODE CHARCUTERIE TACTIQUE ACTIVÉ » : bref, mais on ne peut pas le rater. */
  comboFx(): void {
    const cam = this.cameras.main;
    cam.flash(this.reducedMotion ? 80 : 200, 255, 226, 122);
    this.rays.setPosition(CHUCK_X, 130).setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.rays, alpha: 0.85, duration: 140, yoyo: true, hold: 520,
      onComplete: () => this.rays.setVisible(false),
    });
    this.stars.emitParticleAt(KNIFE_X + 40, 60, 26);
    this.stars.emitParticleAt(X_CUT, SAU_Y, 18);
    this.chuck.setScale(1.14);
    this.tweens.add({ targets: this.chuck, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.knife.setScale(1.25);
    this.tweens.add({ targets: this.knife, scale: 1, duration: 420, ease: 'Back.easeOut' });
    if (!this.reducedMotion) cam.shake(160, 0.006);
  }

  private boxerHop(): void {
    this.tweens.add({ targets: this.fx, boxerHop: 9, duration: 110, yoyo: true, repeat: 1, ease: 'Quad.easeOut' });
  }

  private applyChuckTint(): void {
    // le saucisson glisse trop loin : Chuck voit rouge
    const over = Phaser.Math.Clamp((this.thickness - (CUT.ideal + CUT.goodTol)) / (CUT.disaster - CUT.ideal - CUT.goodTol), 0, 1);
    if (over > 0) {
      const gb = Math.round(255 - over * 140);
      this.chuck.setTint(Phaser.Display.Color.GetColor(255, gb, gb));
    } else {
      this.chuck.clearTint();
    }
  }

  // ------------------------------------------------------------ victoire
  victory(): void {
    this.mode = 'victory';
    const cam = this.cameras.main;
    cam.flash(this.reducedMotion ? 120 : 300, 255, 255, 255);
    this.guide.setVisible(false);
    this.sausage.setVisible(false);
    this.face.setVisible(false);
    this.knife.setVisible(false);
    this.board.setVisible(false);
    // les douze rondelles sautent sur le plateau
    this.slices.forEach((s) => s.img.destroy());
    this.slices = [];
    for (let i = 0; i < 9; i++) {
      this.spawn('s_slice_ok', rnd(100, 380), rnd(170, 220), rnd(-220, 220), rnd(-430, -260), rnd(-500, 500), null, 0);
    }

    const cx = GAME_W / 2;
    this.fx = { dip: 0, lean: 0, hop: 0, boxerHop: 0, boardKick: 0 };
    this.chuck.setTexture('s_chuck_trophy').clearTint().setScale(1).setAngle(0).setPosition(cx, TROPHY_FEET + 70);
    this.chuckFeet = TROPHY_FEET;
    this.trophy = this.add.image(cx, 0, 's_platter').setOrigin(0.5, 1).setDepth(2.5);
    this.extras.push(this.trophy);
    this.tweens.add({ targets: this.chuck, y: TROPHY_FEET, duration: 380, ease: 'Back.easeOut' });

    this.rays.setPosition(cx, 96).setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.rays, alpha: 1, duration: 350 });
    this.burst.explode(80, cx, 90);
    this.confetti.start();
    this.time.delayedCall(450, () => this.stars.emitParticleAt(cx, 76, 30));

    // le boxer s'approche et admire le plateau
    this.tweens.add({ targets: this.boxer, x: 128, duration: 420, ease: 'Quad.easeOut' });
    this.time.addEvent({
      delay: 520, loop: true,
      callback: () => this.sweat.emitParticleAt(this.boxer.x + 34, this.boxer.y - 62, 1),
    });
    this.time.delayedCall(700, () => this.onBark?.('WOUF !', 26, 52, 'boxer'));
  }

  // ------------------------------------------------------------ échec 1 : le parpaing de porc
  failThick(): void {
    this.mode = 'thick';
    const cam = this.cameras.main;
    const rm = this.reducedMotion;
    const hitX = 205;
    const hitY = 206;
    this.guide.setVisible(false);
    this.chuck.clearTint();

    const slab = this.add.image(hitX, -120, 's_slice_giant').setDepth(9).setScale(0.55).setAngle(-14);
    this.extras.push(slab);
    this.tweens.add({
      targets: slab, y: hitY - 30, scale: 1, angle: 0, duration: 430, delay: 260, ease: 'Quad.easeIn',
      onComplete: () => {
        cam.flash(rm ? 80 : 180, 255, 240, 210);
        if (!rm) cam.shake(650, 0.03);
        // la planche éclate
        this.board.setVisible(false);
        this.spawn('s_board_half_l', 160, 214, -150, -250, -170, null, 0, 4.5);
        this.spawn('s_board_half_r', 330, 214, 170, -290, 210, null, 0, 4.5);
        for (let i = 0; i < SPLINTERS * 2; i++) {
          const k = `s_splinter_${String(i % SPLINTERS).padStart(2, '0')}`;
          this.spawn(k, hitX + rnd(-50, 50), hitY, rnd(-260, 260), rnd(-420, -160), rnd(-900, 900), null, 0, 8.5);
        }
        this.scatterSlices();
        // le saucisson et le couteau quittent les lieux
        this.launch(this.sausage, 190, -330, 260);
        this.face.setVisible(false);
        this.launch(this.knife, 120, -380, 520);
        this.dust.emitParticleAt(hitX, hitY + 16, 34);
        this.drawHole(hitX, hitY + 22);
        this.setOldPose('despair');
        this.onBark?.('MON PLANCHER !', 62, 30, 'chuck');
        this.boxerHop();
        // … puis le parpaing poursuit sa route vers le rez-de-chaussée
        this.tweens.add({ targets: slab, scaleY: 0.86, scaleX: 1.06, duration: 70, yoyo: true });
        this.tweens.add({ targets: slab, y: GAME_H + 130, scale: 0.72, duration: 520, delay: 190, ease: 'Quad.easeIn' });
      },
    });
    // les étages cèdent un par un
    [1440, 1940, 2390].forEach((delay, i) => {
      this.time.delayedCall(delay, () => {
        if (!rm) cam.shake(260 - i * 50, 0.016 - i * 0.004);
        this.dust.emitParticleAt(hitX + rnd(-30, 30), hitY + 26, 12 - i * 3);
      });
    });
  }

  /** Aucune illustration de plancher défoncé : le trou est dessiné par Phaser. */
  private drawHole(x: number, y: number): void {
    const g = this.add.graphics().setDepth(3.5);
    this.extras.push(g);
    const pts: Phaser.Math.Vector2[] = [];
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = i % 2 ? 1 : 0.78 + Math.random() * 0.12;
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * 98 * k, y + Math.sin(a) * 30 * k));
    }
    g.fillStyle(0x3a1c0c, 1).fillPoints(pts, true);
    g.fillStyle(0x0a0406, 1).fillPoints(pts.map((p) => new Phaser.Math.Vector2(x + (p.x - x) * 0.86, y + 3 + (p.y - y) * 0.8)), true);
    // fissures
    g.lineStyle(1, 0x2a1208, 1);
    for (let i = 0; i < 9; i++) {
      const a = rnd(0, Math.PI * 2);
      let px = x + Math.cos(a) * 96;
      let py = y + Math.sin(a) * 29;
      g.beginPath();
      g.moveTo(px, py);
      for (let s = 0; s < 3; s++) {
        px += Math.cos(a) * rnd(8, 20) + rnd(-5, 5);
        py += Math.sin(a) * rnd(3, 8) + rnd(-3, 3);
        g.lineTo(px, Math.max(TABLE_Y + 2, py));
      }
      g.strokePath();
    }
  }

  // ------------------------------------------------------------ échec 2 : vol aggravé de charcuterie
  failDog(): void {
    this.mode = 'dog';
    const cam = this.cameras.main;
    this.guide.setVisible(false);
    this.chuck.clearTint();
    this.onBark?.('HEIN ?', 62, 30, 'chuck');
    // le boxer quitte son poste d'observation…
    this.tweens.add({ targets: this.boxer, y: BOXER_Y + 60, duration: 160, ease: 'Quad.easeIn' });

    // … et traverse la cuisine, saucisson en gueule
    const thief = this.add.image(-150, SAU_Y + 16, 's_boxer_steal').setDepth(9);
    this.extras.push(thief);
    this.time.delayedCall(330, () => {
      this.tweens.add({
        targets: thief, x: GAME_W + 170, duration: 720, ease: 'Sine.easeIn',
        onUpdate: () => {
          thief.y = SAU_Y + 16 - Math.abs(Math.sin(thief.x / 34)) * 9;
          if (this.sausage.visible && thief.x > X_CUT - 30) {
            this.sausage.setVisible(false);
            this.face.setVisible(false);
            this.scatterSlices();
            this.dust.emitParticleAt(X_CUT + 40, SAU_Y + 24, 16);
            if (!this.reducedMotion) cam.shake(220, 0.012);
            this.setOldPose('despair');
            this.launch(this.knife, -60, -260, -420);
            this.onBark?.('MON SAUCISSON !', 60, 28, 'chuck');
          }
          if (Math.random() < 0.5) this.dust.emitParticleAt(thief.x - 90, SAU_Y + 50, 1);
        },
      });
    });

    // plus tard, ailleurs : le suspect, repu
    this.time.delayedCall(1750, () => {
      this.tweens.add({
        targets: this.curtain, alpha: 0.9, duration: 220,
        onComplete: () => {
          const spot = this.add.graphics().setDepth(11.5);
          spot.fillStyle(0xfff3d6, 0.1).fillCircle(GAME_W / 2, 150, 122);
          spot.fillStyle(0xfff3d6, 0.12).fillCircle(GAME_W / 2, 150, 96);
          spot.fillStyle(0x000000, 0.5).fillEllipse(GAME_W / 2, 250, 130, 16);
          const dog = this.add.image(GAME_W / 2, 262, 's_boxer_eat').setOrigin(0.5, 1).setDepth(12).setScale(1, 0.2);
          this.extras.push(spot, dog);
          this.tweens.add({ targets: dog, scaleY: 1, duration: 260, ease: 'Back.easeOut' });
          this.tweens.add({ targets: dog, scaleY: 1.03, scaleX: 0.985, duration: 420, yoyo: true, repeat: -1, delay: 300, ease: 'Sine.easeInOut' });
          this.time.delayedCall(500, () => this.onBark?.('BURP.', 64, 30, 'boxer'));
        },
      });
    });
  }

  // ------------------------------------------------------------ échec 3 : la découpe nucléaire
  failNuclear(): void {
    this.mode = 'nuclear';
    const cam = this.cameras.main;
    const rm = this.reducedMotion;
    this.guide.setVisible(false);
    this.setOldPose('rage');
    this.chuck.setTint(0xff6a5a);
    this.onBark?.('RAAAAAAAH !!', 62, 26, 'chuck');

    // Chuck arme un coup manifestement disproportionné
    this.tweens.killTweensOf(this.knife);
    this.knife.setTint(0xffffff);
    this.tweens.add({ targets: this.knife, angle: -168, scale: 1.45, x: KNIFE_X + 8, y: KNIFE_Y - 18, duration: 480, ease: 'Quad.easeOut' });
    if (!rm) cam.shake(480, 0.006);
    this.stars.emitParticleAt(KNIFE_X + 20, 30, 20);

    this.time.delayedCall(520, () => {
      this.tweens.add({
        targets: this.knife, angle: 0, y: KNIFE_Y + 40, duration: 60, ease: 'Cubic.easeIn',
        onComplete: () => this.sliceTheWorld(),
      });
    });
  }

  /** Le coup traverse le saucisson, la planche, le plan de travail et le reste de la cuisine. */
  private sliceTheWorld(): void {
    const cam = this.cameras.main;
    const rm = this.reducedMotion;
    cam.flash(rm ? 120 : 340, 255, 255, 255);
    this.slash.setAlpha(1).setScale(2, 1);
    this.tweens.add({ targets: this.slash, alpha: 0, duration: 500 });
    this.fire.explode(60, X_CUT, SAU_Y);
    this.scatterSlices();
    this.knife.setVisible(false);
    this.setOldPose('despair');
    this.chuck.setTint(0x8a6a62);

    // deux caméras : chaque moitié de la cuisine part de son côté
    cam.setViewport(0, 0, X_CUT, GAME_H).setScroll(0, 0);
    const right = this.cameras.add(X_CUT, 0, GAME_W - X_CUT, GAME_H).setScroll(X_CUT, 0);
    this.splitCam = right;
    if (!rm) {
      cam.shake(900, 0.02);
      right.shake(900, 0.02);
    }
    const t = rm ? 0.4 : 1;
    this.tweens.add({ targets: cam, x: -9 * t, y: 30 * t, duration: 900, delay: 120, ease: 'Bounce.easeOut' });
    this.tweens.add({ targets: right, x: X_CUT + 11 * t, y: -12 * t, duration: 700, delay: 120, ease: 'Cubic.easeOut' });
    this.tweens.addCounter({
      from: 0, to: 1, duration: 900, delay: 120, ease: 'Bounce.easeOut',
      onUpdate: (tw) => {
        const v = tw.getValue() ?? 0;
        cam.setAngle(-3.2 * v * t);
        right.setAngle(1.8 * v * t);
      },
    });

    this.time.delayedCall(160, () => {
      this.bg.setTint(0x7a5a50);
      this.table.setTint(0x8a6a5c);
      this.board.setTint(0x9a7a6c);
      this.sausage.setTint(0x9a7a6c);
      this.face.setTint(0x9a7a6c);
      this.smoke.start();
      this.embers.start();
    });
    const chain: [number, number, number][] = [[520, 62, 120], [900, 352, 150], [1300, 254, 26]];
    for (const [delay, x, y] of chain) {
      this.time.delayedCall(delay, () => {
        this.fire.explode(50, x, y);
        if (!rm) (x < X_CUT ? cam : right).shake(260, 0.02);
      });
    }
    if (!rm) this.tweens.add({ targets: this.alarm, alpha: 0.16, duration: 420, yoyo: true, repeat: -1, delay: 1400 });
  }

  // ------------------------------------------------------------ outils
  private setOldPose(p: OldPose): void {
    this.chuck.setTexture(`chuck_${p}`).setScale(1).setAngle(0);
    this.chuckFeet = OLD_FEET[p];
    this.fx.dip = 0;
    this.fx.lean = 0;
    this.fx.hop = 0;
  }

  private spawn(
    key: string, x: number, y: number, vx: number, vy: number, vr: number,
    floor: number | null, bounces: number, depth = 8.5,
  ): void {
    const img = this.add.image(x, y, key).setDepth(depth);
    this.debris.push({ img, vx, vy, vr, floor, bounces, resting: false });
  }

  /** Transforme un objet de la scène en projectile (il reste géré par la scène). */
  private launch(obj: Phaser.GameObjects.Image, vx: number, vy: number, vr: number): void {
    this.tweens.killTweensOf(obj);
    const o = { vx, vy };
    this.tweens.addCounter({
      from: 0, to: 1, duration: 1400,
      onUpdate: () => {
        const dt = Math.min(this.game.loop.delta, 50) / 1000;
        o.vy += GRAVITY * dt;
        obj.x += o.vx * dt;
        obj.y += o.vy * dt;
        obj.angle += vr * dt;
      },
      onComplete: () => obj.setVisible(false),
    });
  }

  private scatterSlices(): void {
    for (const s of this.slices) {
      this.debris.push({
        img: s.img.setDepth(8.4), vx: rnd(-260, 200), vy: rnd(-420, -220), vr: rnd(-800, 800),
        floor: null, bounces: 0, resting: false,
      });
    }
    this.slices = [];
  }

  // ------------------------------------------------------------ boucle
  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.onTick?.(dt);

    if (this.mode === 'idle' || this.mode === 'play') {
      const held = time < this.holdUntil;
      this.layoutSausage(held ? this.heldThickness : this.thickness, held ? this.heldConsumed : this.consumed);

      // le saucisson tremble quand il a trop glissé
      const danger = this.mode === 'play' && this.thickness > CUT.ideal + CUT.goodTol;
      const jitter = danger && !this.reducedMotion ? Math.round(rnd(-1, 1)) : 0;
      this.sausage.y = SAU_Y + jitter;
      this.face.y = SAU_Y + jitter;
      if (this.mode === 'play' && time >= this.holdUntil + 200) this.applyChuckTint();

      const bob = Math.round(Math.sin(time / 360));
      this.chuck.setPosition(CHUCK_X + this.fx.lean * 0.6, this.chuckFeet + bob + this.fx.dip - this.fx.hop);
      this.chuck.setAngle(-this.fx.lean);
      // le couteau suit le poing
      this.knife.setPosition(KNIFE_X - this.fx.lean, KNIFE_Y + bob + this.fx.dip * 1.4 - this.fx.hop);
      this.board.y = BOARD_BOTTOM + this.fx.boardKick;
      this.guide.setAlpha(0.82 + 0.18 * Math.sin(time / 140));

      if (this.tactical && Math.random() < dt * 14) {
        const a = Phaser.Math.DegToRad(this.knife.angle + 90);
        const d = rnd(30, 115);
        this.stars.emitParticleAt(this.knife.x + Math.cos(a) * d + rnd(-10, 10), this.knife.y + Math.sin(a) * d + rnd(-10, 10), 1);
      }
      // le boxer surveille, la truffe au ras du plan de travail
      const wag = Math.round(Math.sin(time / 210) * 1.2);
      this.boxer.setPosition(BOXER_X, BOXER_Y + wag - this.fx.boxerHop);
    } else if (this.mode === 'victory') {
      const jump = Math.abs(Math.sin(time / 190)) * 5;
      if (!this.tweens.isTweening(this.chuck)) this.chuck.y = TROPHY_FEET - jump;
      // le plateau repose sur les poings
      this.trophy?.setPosition(this.chuck.x, this.chuck.y - 164 + Math.sin(time / 95) * 0.8);
      this.rays.rotation += dt * 0.5;
      this.boxer.y = BOXER_Y - Math.abs(Math.sin(time / 150)) * 7;
    } else if (this.mode === 'thick' || this.mode === 'dog' || this.mode === 'nuclear') {
      if (this.chuck.texture.key === 'chuck_despair') {
        this.chuck.y = this.chuckFeet + Math.round(Math.sin(time / 90));
      } else if (this.chuck.texture.key === 'chuck_rage') {
        this.chuck.x = CHUCK_X + Math.round(rnd(-2, 2));
      }
      if (this.mode === 'thick') this.boxer.y = BOXER_Y - this.fx.boxerHop;
    }

    this.updateSlices(dt);
    this.updateDebris(dt);
  }

  /** Chute de la rondelle : petit vol plané, rebond, repos sur la planche. */
  private updateSlices(dt: number): void {
    for (const s of this.slices) {
      const kick = this.fx.boardKick;
      if (s.resting) {
        s.img.y = s.ty + kick;
        continue;
      }
      s.vy += 900 * dt;
      s.img.y += s.vy * dt;
      s.img.x += (s.tx - s.img.x) * Math.min(1, dt * 11);
      s.img.angle += (0 - s.img.angle) * Math.min(1, dt * 12);
      if (s.img.y >= s.ty && s.vy > 0) {
        s.img.y = s.ty;
        if (s.bounces === 2) {
          this.onSliceLand?.();
          this.crumbs.emitParticleAt(s.img.x, s.ty - 2, 3);
        }
        s.bounces--;
        if (s.bounces < 0 || s.vy < 55) {
          s.resting = true;
          s.img.setPosition(s.tx, s.ty).setAngle(0);
        } else {
          s.vy *= -0.4;
        }
      }
    }
  }

  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      if (d.resting) continue;
      d.vy += GRAVITY * dt;
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      d.img.angle += d.vr * dt;
      if (d.floor !== null && d.img.y >= d.floor && d.vy > 0) {
        d.img.y = d.floor;
        d.bounces--;
        if (d.bounces <= 0 || d.vy < 60) {
          d.resting = true;
        } else {
          d.vy *= -0.42;
          d.vx *= 0.6;
          d.vr *= 0.5;
        }
      } else if (d.img.y > GAME_H + 140) {
        d.img.destroy();
        this.debris.splice(i, 1);
      }
    }
  }
}
