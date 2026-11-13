import Phaser from 'phaser';

export const GAME_W = 480;
export const GAME_H = 270;

const TABLE_Y = 192;
const CHUCK_X = 206;
const JAR_X = 304;
const JAR_Y = 229;
const GRAVITY = 520;

export type Pose =
  | 'front' | 'three_quarter' | 'side' | 'back'
  | 'cool' | 'squat' | 'punch' | 'victory' | 'despair' | 'rage' | 'twist';

const POSES: Pose[] = [
  'front', 'three_quarter', 'side', 'back',
  'cool', 'squat', 'punch', 'victory', 'despair', 'rage', 'twist',
];

/** Position des pieds par pose : Chuck est debout derrière le plan de travail. */
const FEET: Record<Pose, number> = {
  front: 264, three_quarter: 264, side: 264, back: 264,
  cool: 264, twist: 258, rage: 252, punch: 256, victory: 264,
  despair: 250, squat: 222,
};

const OPEN_PARTS = 4;
const BOOM_PARTS = 14;
const BOOM_PICKLES = ['boom_part_02', 'boom_part_03', 'boom_part_05', 'boom_part_06'];

type Mode = 'idle' | 'play' | 'perfect' | 'chaos' | 'explosion' | 'timeout';

interface Debris {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  vr: number;
  floor: number | null;
  bounces: number;
  walls: boolean;
  resting: boolean;
}

export type BarkSource = 'chuck' | 'jar';

const rnd = (min: number, max: number) => min + Math.random() * (max - min);

export class KitchenScene extends Phaser.Scene {
  /** Appelé à chaque image avec le temps écoulé (s). */
  onTick?: (dt: number) => void;
  onReady?: () => void;
  onLoadProgress?: (ratio: number) => void;
  onLoadError?: (key: string) => void;
  onBark?: (text: string, xPct: number, yPct: number, who: BarkSource) => void;
  reducedMotion = false;

  private bg!: Phaser.GameObjects.Image;
  private table!: Phaser.GameObjects.Image;
  private chuck!: Phaser.GameObjects.Image;
  private jar!: Phaser.GameObjects.Image;
  private rays!: Phaser.GameObjects.Graphics;
  private alarm!: Phaser.GameObjects.Rectangle;

  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sweat!: Phaser.GameObjects.Particles.ParticleEmitter;
  private brine!: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private fire!: Phaser.GameObjects.Particles.ParticleEmitter;

  private debris: Debris[] = [];
  private extras: Phaser.GameObjects.GameObject[] = [];
  private mode: Mode = 'idle';
  private pose: Pose = 'front';
  private power = 0;
  private kick = 0;
  private poseLockUntil = 0;

  constructor() {
    super('kitchen');
  }

  preload(): void {
    this.load.setPath('assets/sprites/');
    this.load.image('kitchen', 'kitchen.png');
    this.load.image('table', 'table.png');
    for (const p of POSES) this.load.image(`chuck_${p}`, `chuck_${p}.png`);
    this.load.image('jar_closed', 'jar_closed.png');
    this.load.image('jar_open_body', 'jar_open_body.png');
    this.load.image('jar_explosion', 'jar_explosion.png');
    for (let i = 0; i < OPEN_PARTS; i++) {
      const k = `open_part_${String(i).padStart(2, '0')}`;
      this.load.image(k, `${k}.png`);
    }
    for (let i = 0; i < BOOM_PARTS; i++) {
      const k = `boom_part_${String(i).padStart(2, '0')}`;
      this.load.image(k, `${k}.png`);
    }
    this.load.on('progress', (r: number) => this.onLoadProgress?.(r));
    this.load.on('loaderror', (file: Phaser.Loader.File) => this.onLoadError?.(file.key));
  }

  create(): void {
    this.makeTextures();

    this.bg = this.add.image(GAME_W / 2, GAME_H / 2, 'kitchen').setDepth(0);
    this.rays = this.add.graphics().setDepth(1).setPosition(CHUCK_X, 128).setVisible(false);
    this.drawRays();
    this.chuck = this.add.image(CHUCK_X, FEET.front, 'chuck_front').setOrigin(0.5, 1).setDepth(2);
    this.table = this.add.image(GAME_W / 2, TABLE_Y, 'table').setOrigin(0.5, 0).setDepth(3);
    this.jar = this.add.image(JAR_X, JAR_Y, 'jar_closed').setOrigin(0.5, 1).setDepth(4);
    this.alarm = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xff2200, 0).setDepth(9);

    const tricolor = [0x2a5cff, 0xffffff, 0xe63946];
    this.confetti = this.add.particles(0, 0, 'conf', {
      x: { min: 0, max: GAME_W }, y: -4,
      speedY: { min: 35, max: 95 }, speedX: { min: -22, max: 22 },
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 1.7 },
      lifespan: 4200, tint: tricolor, frequency: 28, quantity: 2, emitting: false,
    }).setDepth(7);
    this.burst = this.add.particles(0, 0, 'conf', {
      speed: { min: 80, max: 240 }, angle: { min: -165, max: -15 }, gravityY: 300,
      rotate: { min: 0, max: 360 }, scale: { min: 1, max: 1.8 },
      lifespan: 1700, tint: tricolor, emitting: false,
    }).setDepth(7);
    this.sweat = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 75 }, angle: { min: -160, max: -20 }, gravityY: 220,
      lifespan: 480, tint: [0x7fd4ff, 0xc8f0ff], emitting: false,
    }).setDepth(6);
    this.brine = this.add.particles(0, 0, 'px', {
      speed: { min: 60, max: 260 }, angle: { min: -170, max: -10 }, gravityY: 420,
      lifespan: 1100, tint: [0xd8c21e, 0xb8a814, 0xf0e060], scale: { min: 1, max: 2 }, emitting: false,
    }).setDepth(6);
    this.fire = this.add.particles(0, 0, 'px', {
      speed: { min: 40, max: 220 }, angle: { min: 0, max: 360 }, gravityY: 160,
      lifespan: 700, tint: [0xff8800, 0xffcc00, 0xff3300, 0xffffff], scale: { start: 3, end: 1 }, emitting: false,
    }).setDepth(8);
    this.smoke = this.add.particles(0, 0, 'smoke', {
      x: { min: 10, max: GAME_W - 10 }, y: { min: 110, max: 255 },
      speedY: { min: -42, max: -14 }, speedX: { min: -8, max: 8 },
      scale: { start: 1, end: 4.5 }, alpha: { start: 0.75, end: 0 },
      tint: [0x2c2622, 0x4a423c, 0x1c1816], lifespan: 2600, frequency: 45, emitting: false,
    }).setDepth(6);
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

  // ------------------------------------------------------------ états
  private setPose(p: Pose): void {
    if (this.pose !== p) {
      this.pose = p;
      this.chuck.setTexture(`chuck_${p}`);
    }
  }

  private resetCamera(): void {
    const cam = this.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    cam.shakeEffect.reset();
    cam.flashEffect.reset();
    cam.setZoom(1).setAngle(0).centerOn(GAME_W / 2, GAME_H / 2);
    cam.setBackgroundColor(0x000000);
  }

  private clearEffects(): void {
    this.time.removeAllEvents();
    this.tweens.killAll();
    this.resetCamera();
    for (const e of [this.confetti, this.burst, this.sweat, this.brine, this.smoke, this.embers, this.fire]) {
      e.stop();
      e.killAll();
    }
    this.debris.forEach((d) => d.img.destroy());
    this.debris = [];
    this.extras.forEach((o) => o.destroy());
    this.extras = [];
    this.bg.clearTint().setAngle(0).setPosition(GAME_W / 2, GAME_H / 2);
    this.table.clearTint().setAngle(0).setPosition(GAME_W / 2, TABLE_Y);
    this.chuck.clearTint().setAngle(0).setScale(1).setAlpha(1).setPosition(CHUCK_X, FEET[this.pose]);
    this.jar.setTexture('jar_closed').clearTint().setAngle(0).setScale(1).setAlpha(1)
      .setVisible(true).setPosition(JAR_X, JAR_Y);
    this.rays.setVisible(false).setAlpha(1);
    this.alarm.setAlpha(0);
    this.power = 0;
    this.kick = 0;
    this.poseLockUntil = 0;
  }

  showTitle(): void {
    this.clearEffects();
    this.mode = 'idle';
    this.setPose('front');
  }

  /** Mise en scène du briefing : gros plan sur Chuck, puis sur l'ennemi. */
  playIntro(long: boolean): void {
    this.clearEffects();
    this.mode = 'idle';
    this.setPose('cool');
    if (!long || this.reducedMotion) return;
    const cam = this.cameras.main;
    cam.pan(CHUCK_X, 138, 500, 'Sine.easeInOut');
    cam.zoomTo(1.9, 500, 'Sine.easeInOut');
    this.time.delayedCall(1900, () => {
      cam.pan(JAR_X, 196, 450, 'Sine.easeInOut');
      cam.zoomTo(2.4, 450, 'Sine.easeInOut');
      this.tweens.add({ targets: this.jar, angle: { from: -4, to: 4 }, duration: 90, yoyo: true, repeat: 5, delay: 500 });
    });
    this.time.delayedCall(3500, () => {
      cam.pan(GAME_W / 2, GAME_H / 2, 350, 'Sine.easeOut');
      cam.zoomTo(1, 350, 'Sine.easeOut');
    });
  }

  startPlay(): void {
    this.clearEffects();
    this.mode = 'play';
    this.setPose('cool');
  }

  setEffort(power: number): void {
    this.power = power;
  }

  tapFx(): void {
    this.kick = 1;
  }

  resistFx(lock: number): void {
    this.poseLockUntil = this.time.now + lock * 1000;
    this.setPose('squat');
    this.jar.setTintFill(0xffffff);
    this.time.delayedCall(70, () => this.jar.clearTint());
    this.tweens.add({ targets: this.jar, scaleX: 1.14, scaleY: 0.9, duration: 70, yoyo: true });
    if (!this.reducedMotion) this.cameras.main.shake(140, 0.007);
    this.sweat.emitParticleAt(CHUCK_X + 8, 118, 10);
  }

  // ------------------------------------------------------------ dénouements
  win(perfect: boolean): void {
    this.mode = perfect ? 'perfect' : 'chaos';
    const cam = this.cameras.main;
    this.chuck.clearTint().setScale(1).setAngle(0).setX(CHUCK_X);
    this.setPose('victory');
    this.jar.setTexture('jar_open_body').setPosition(JAR_X, JAR_Y).setAngle(0);
    const lidY = JAR_Y - 66;
    cam.flash(perfect ? 260 : 180, 255, 255, perfect ? 255 : 200);

    this.rays.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.rays, alpha: perfect ? 1 : 0.55, duration: 350 });
    this.burst.explode(perfect ? 70 : 30, JAR_X, lidY);
    this.confetti.frequency = perfect ? 28 : 80;
    this.confetti.start();

    if (perfect) {
      this.tweens.add({ targets: this.jar, scaleY: { from: 0.84, to: 1 }, scaleX: { from: 1.12, to: 1 }, duration: 320, ease: 'Back.easeOut' });
      this.spawn('open_part_00', JAR_X, lidY, 44, -330, 520, JAR_Y + 3, 2, false);
      this.spawn('open_part_01', JAR_X - 4, lidY, -150, -300, -300, 226, 2, false);
      this.brine.explode(24, JAR_X, lidY + 6);
    } else {
      if (!this.reducedMotion) cam.shake(650, 0.018);
      this.tweens.add({ targets: this.jar, angle: 96, x: JAR_X + 18, y: JAR_Y - 8, duration: 420, ease: 'Bounce.easeOut' });
      this.brine.explode(110, JAR_X, lidY + 6);
      this.spawn('open_part_00', JAR_X, lidY, -390, -430, 900, null, 0, true);
      for (let i = 0; i < 9; i++) {
        this.spawn(BOOM_PICKLES[i % BOOM_PICKLES.length], JAR_X, lidY,
          rnd(-270, 270), rnd(-430, -190), rnd(-700, 700), rnd(204, 238), 3, true);
      }
      this.time.delayedCall(500, () => this.onBark?.('OUPS.', 36, 22, 'chuck'));
    }
  }

  explode(): void {
    this.mode = 'explosion';
    const cam = this.cameras.main;
    const rm = this.reducedMotion;
    cam.flash(rm ? 120 : 320, 255, 255, 255);
    if (!rm) cam.shake(1200, 0.035);
    cam.setBackgroundColor(0x1a0500);

    this.jar.setVisible(false);
    const blast = this.add.image(JAR_X, JAR_Y - 40, 'jar_explosion').setDepth(8).setScale(0.6);
    this.extras.push(blast);
    this.tweens.add({ targets: blast, scale: 3.4, alpha: 0, duration: 650, ease: 'Cubic.easeOut' });
    this.fire.explode(90, JAR_X, JAR_Y - 40);
    this.brine.explode(140, JAR_X, JAR_Y - 40);

    // le socle brisé reste sur le plan de travail, tout le reste part en orbite
    const base = this.add.image(JAR_X, JAR_Y + 2, 'boom_part_00').setOrigin(0.5, 1).setDepth(4);
    this.extras.push(base);
    for (let i = 1; i < BOOM_PARTS; i++) {
      const key = `boom_part_${String(i).padStart(2, '0')}`;
      const copies = i < 9 ? 2 : 3;
      for (let c = 0; c < copies; c++) {
        const a = rnd(-Math.PI, 0);
        const sp = rnd(180, 460);
        this.spawn(key, JAR_X, JAR_Y - 40, Math.cos(a) * sp, Math.sin(a) * sp - 120,
          rnd(-900, 900), i < 7 ? rnd(200, 262) : null, 3, true);
      }
    }

    // la cuisine encaisse
    this.time.delayedCall(90, () => {
      this.bg.setTint(0x6a4a40);
      this.table.setTint(0x7a5a4c);
      this.tweens.add({ targets: this.bg, angle: -3.2, y: GAME_H / 2 + 9, x: GAME_W / 2 - 5, duration: 800, ease: 'Bounce.easeOut' });
      this.tweens.add({ targets: this.table, angle: 1.6, y: TABLE_Y + 5, duration: 700, ease: 'Bounce.easeOut' });
      this.smoke.start();
      this.embers.start();
    });

    this.setPose('despair');
    this.chuck.setScale(1).setTint(0x6b5a55);
    this.tweens.add({ targets: this.chuck, x: CHUCK_X - 30, angle: -9, duration: 380, ease: 'Cubic.easeOut' });

    // réactions en chaîne : le frigo, la gazinière, le plafonnier
    const chain: [number, number, number][] = [[480, 62, 120], [860, 352, 150], [1280, 254, 26]];
    for (const [delay, x, y] of chain) {
      this.time.delayedCall(delay, () => {
        this.fire.explode(55, x, y);
        cam.flash(rm ? 60 : 110, 255, 190, 70);
        if (!rm) cam.shake(280, 0.022);
      });
    }
    if (!rm) {
      this.tweens.add({ targets: this.alarm, alpha: 0.17, duration: 420, yoyo: true, repeat: -1, delay: 1400 });
    }
  }

  timeout(): void {
    this.mode = 'timeout';
    this.setPose('despair');
    this.chuck.clearTint().setScale(1).setAngle(0).setX(CHUCK_X);
    this.jar.setAngle(0).setPosition(JAR_X, JAR_Y);
    this.bg.setTint(0x9a98c4);
    this.table.setTint(0x9a98c4);
    // danse de la victoire du bocal
    this.tweens.add({ targets: this.jar, y: JAR_Y - 12, duration: 210, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: this.jar, angle: { from: -9, to: 9 }, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  private spawn(
    key: string, x: number, y: number, vx: number, vy: number, vr: number,
    floor: number | null, bounces: number, walls: boolean,
  ): void {
    const img = this.add.image(x, y, key).setDepth(5);
    this.debris.push({ img, vx, vy, vr, floor, bounces, walls, resting: false });
  }

  // ------------------------------------------------------------ boucle
  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.onTick?.(dt);
    this.kick = Math.max(0, this.kick - dt * 7);

    if (this.mode === 'idle') {
      this.chuck.y = FEET[this.pose] + Math.round(Math.sin(time / 380));
      const k = (time % 2600) / 2600;
      if (!this.cameras.main.zoomEffect.isRunning && this.cameras.main.zoom === 1) {
        this.jar.y = JAR_Y - (k < 0.07 ? Math.sin((k / 0.07) * Math.PI) * 3 : 0);
      }
    } else if (this.mode === 'play') {
      this.updateEffort(time, dt);
    } else if (this.mode === 'perfect' || this.mode === 'chaos') {
      this.chuck.y = FEET.victory - Math.abs(Math.sin(time / 170)) * 6;
      this.rays.rotation += dt * 0.5;
    } else if (this.mode === 'timeout') {
      this.chuck.y = FEET.despair + Math.round(Math.sin(time / 90));
    }

    this.updateDebris(dt);
  }

  private updateEffort(time: number, dt: number): void {
    const p = this.power;
    if (time >= this.poseLockUntil) {
      this.setPose(p < 6 ? 'cool' : p < 84 ? 'twist' : 'rage');
    }
    const motion = this.reducedMotion ? 0.35 : 1;
    const amp = (p / 100) ** 2 * 2.8 * motion;
    const lean = this.pose === 'twist' || this.pose === 'rage' ? 6 : 0;
    this.chuck.x = CHUCK_X + lean + Math.round(rnd(-amp, amp));
    this.chuck.y = FEET[this.pose] + Math.round(rnd(-amp, amp) * 0.5);
    this.chuck.setScale(1 + 0.025 * this.kick, 1 - 0.04 * this.kick);

    if (this.pose === 'twist') {
      const t = Phaser.Math.Clamp((p - 30) / 56, 0, 1);
      const gb = Math.round(255 - t * 125);
      this.chuck.setTint(Phaser.Display.Color.GetColor(255, gb, gb));
    } else {
      this.chuck.clearTint();
    }

    this.jar.x = JAR_X + Math.round(rnd(-amp, amp) * 0.9);
    this.jar.y = JAR_Y - Math.round(this.kick * 2);
    this.jar.angle = Math.sin(time * 0.05) * p * 0.07 * motion;

    if (p > 40 && Math.random() < dt * (p / 6)) {
      this.sweat.emitParticleAt(CHUCK_X + rnd(-14, 26), rnd(106, 124), 1);
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
      if (d.walls) {
        if ((d.img.x < 6 && d.vx < 0) || (d.img.x > GAME_W - 6 && d.vx > 0)) d.vx *= -0.7;
        if (d.img.y < 6 && d.vy < 0) d.vy *= -0.7;
      }
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
      } else if (d.img.y > GAME_H + 60) {
        d.img.destroy();
        this.debris.splice(i, 1);
      }
    }
  }
}
