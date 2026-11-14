import Phaser from 'phaser';
import { CINE, YELL, YELL_AGAIN } from '../config/messages';
import { SPRITES } from '../config/sprites';
import type { Caption, GardenScene, SfxCue } from './GardenScene';
import { GAME_H, GAME_W, SPOT } from './layout';

type Size = 'mid' | 'big';
type Img = Phaser.GameObjects.Image;

interface Dog {
  x: number;
  feet: number;
  spin: number;
  /** 1 : il danse ; 0 : il s'arrête. */
  energy: number;
}

interface TornRig {
  c: Phaser.GameObjects.Container;
  leg: Img;
  x: number;
  y: number;
  /** Énergie avec laquelle Jean-Mi se débat. */
  power: number;
}

const CX = GAME_W / 2;
const CY = GAME_H / 2;
const rnd = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Cinématiques de fin. Chaque plan est composé de sprites indépendants, à l'échelle du plan
 * (voir scripts/build_bon_voisinage_assets.py), posés au-dessus du plan de jeu.
 *
 * - victory()  : « LE SHORT DE LA DISCORDE », cinq plans, + épilogue en cas de victoire parfaite
 * - busted()   : « LE DOSSIER JEAN-MI » (trois flagrants délits)
 * - timeout()  : « LA SIESTE DE JEAN-MI » (chronomètre écoulé)
 *
 * Les textes et les sons passent par la scène (onCaption / onSfx) : rien n'est affiché ici en dur.
 */
export class Director {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private loops: ((t: number, dt: number) => void)[] = [];
  /** Arrêt sur image. */
  private frozen = false;

  constructor(private readonly s: GardenScene) {}

  clear(): void {
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    this.wipe();
  }

  update(time: number, dt: number): void {
    if (this.frozen) return;
    const t = time / 1000;
    for (const loop of this.loops) loop(t, dt);
  }

  // ------------------------------------------------------------ outils
  private wipe(): void {
    for (const o of this.objs) {
      this.s.tweens.killTweensOf(o);
      if (o instanceof Phaser.GameObjects.Container) this.s.tweens.killTweensOf(o.list);
      o.destroy();
    }
    this.objs = [];
    this.loops = [];
    this.frozen = false;
  }

  private at(ms: number, fn: () => void): void {
    this.timers.push(this.s.time.delayedCall(ms, fn));
  }

  private every(start: number, step: number, count: number, fn: (i: number) => void): void {
    for (let i = 0; i < count; i++) this.at(start + i * step, () => fn(i));
  }

  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private img(key: string, x: number, y: number, depth: number): Img {
    return this.keep(this.s.add.image(x, y, key).setDepth(depth));
  }

  /** Changement de plan sec : tout ce qui était à l'écran disparaît, la caméra revient à plat. */
  private cut(backdrop: string | null): void {
    this.wipe();
    this.s.resetCamera();
    this.s.gust.stop();
    if (backdrop) this.img(backdrop, 0, 0, 50).setOrigin(0);
  }

  private say(c: Caption): void {
    this.s.onCaption?.(c);
  }

  private sfx(cue: SfxCue): void {
    this.s.onSfx?.(cue);
  }

  private zoom(x: number, y: number, zoom: number, ms: number, ease = 'Quad.easeOut'): void {
    if (this.s.reducedMotion) return;
    const cam = this.s.cameras.main;
    cam.pan(x, y, ms, ease, true);
    cam.zoomTo(zoom, ms, ease, true);
  }

  /**
   * Une rangée de panneaux de clôture vus de face. (x0, y0) est le coin du panneau où Jean-Mi
   * est (ou sera) coincé : c'est le sprite officiel qui fournit ce panneau-là, on ne pose donc
   * ici que ses voisins — jamais deux grillages l'un sur l'autre.
   */
  private fenceRow(size: Size, x0: number, y0: number, withCenter: boolean, depth: number): void {
    const m = SPRITES[`fence_${size}`];
    const step = m.w - (size === 'big' ? 6 : 4);
    for (let k = -4; k <= 4; k++) {
      if (k === 0 && !withCenter) continue;
      const x = x0 + m.x + k * step;
      if (x > GAME_W || x + m.w < 0) continue;
      this.img(`fence_${size}`, x, y0 + m.y, depth).setOrigin(0);
    }
  }

  /** Jean-Mi coincé à cheval sur la clôture : le panneau officiel, et sa jambe pendante articulée au genou. */
  private torn(size: Size, x0: number, y0: number, depth: number): TornRig {
    const m = SPRITES[`torn_${size}`];
    const l = SPRITES[`leg_${size}`];
    // le tout pivote autour du point où le short est accroché à la lisse
    const px = m.tear_x + (size === 'big' ? 18 : 12);
    const py = m.rail;
    const c = this.keep(this.s.add.container(x0 + px, y0 + py).setDepth(depth));
    const panel = this.s.add.image(-px, -py, `torn_${size}`).setOrigin(0);
    const leg = this.s.add.image(l.x + l.w * l.px - px, l.y + l.h * l.py - py, `leg_${size}`).setOrigin(l.px, l.py);
    c.add([panel, leg]);
    const rig: TornRig = { c, leg, x: x0 + px, y: y0 + py, power: 1 };
    // il mouline, la clôture vibre
    this.loops.push((t) => {
      const p = rig.power;
      leg.rotation = Math.sin(t * 26) * 0.5 * p - 0.06;
      c.rotation = Math.sin(t * 34) * 0.016 * p * (this.s.reducedMotion ? 0.3 : 1);
      c.y = rig.y + (Math.sin(t * 52) > 0 ? this.s.amp(1) * p : 0);
    });
    return rig;
  }

  /** Jean-Mi de dos, en pied, avec deux jambes articulées à la hanche. */
  private climber(x: number, feet: number, depth: number) {
    const W = SPRITES.jm_back_mid.w;
    const H = SPRITES.jm_back_mid.h;
    const c = this.keep(this.s.add.container(x, feet).setDepth(depth));
    const part = (key: 'jm_back_body' | 'jm_back_leg_l' | 'jm_back_leg_r'): Img => {
      const m = SPRITES[key];
      return this.s.add.image(m.x + m.w * m.px - W / 2, m.y + m.h * m.py - H, key).setOrigin(m.px, m.py);
    };
    const legL = part('jm_back_leg_l');
    const legR = part('jm_back_leg_r');
    const body = part('jm_back_body');
    c.add([legL, legR, body]);
    return { c, legL, legR, body };
  }

  /**
   * Le boxer de Chuck, qui danse quoi qu'il arrive. Une seule pose, animée par transformations
   * continues ; `pos` peut être animé (energy = 0 : il s'arrête).
   */
  private boxer(size: Size, pos: Dog, depth: number): Img {
    const g = this.img(`boxer_dancing_${size}`, pos.x, pos.feet, depth).setOrigin(0.5, 1);
    const reach = size === 'big' ? 1 : 0.7;
    this.loops.push((t) => {
      const e = pos.energy * (this.s.reducedMotion ? 0.3 : 1);
      const beat = (t * Math.PI) / 0.3;
      g.setPosition(pos.x + Math.sin(beat / 2) * 7 * e * reach, pos.feet - Math.abs(Math.sin(beat)) * 13 * e * reach);
      g.setAngle(Math.sin(beat / 2) * 14 * e + pos.spin);
    });
    return g;
  }

  private done(): void {
    this.s.onCinematicDone?.();
  }

  // ============================================================ VICTOIRE
  /** « LE SHORT DE LA DISCORDE ». */
  victory(perfect: boolean): void {
    const s = this.s;
    const T = { implode: 380, assault: 1900, rip: 3550, chuck: 5800, dog: 8800, triumph: 11500, end: 13800 };

    // ---------- PLAN 1 : l'implosion. Tout s'arrête. Un silence. Puis le cri.
    this.sfx('hush');
    this.say({ kind: 'clear' });
    s.jeanmi.setTexture('jm_meltdown').setFlipX(false).setPosition(SPOT.jeanmi.x, SPOT.jeanmi.feet).setTint(0xff8a7a);
    s.tweens.add({ targets: s.jeanmi, x: SPOT.jeanmi.x + s.amp(2), duration: 35, yoyo: true, repeat: 9 });

    this.at(T.implode, () => {
      this.cut('cine_jeanmi');
      const red = this.keep(s.add.rectangle(CX, CY, GAME_W, GAME_H, 0xff1a00, 0).setDepth(51));
      s.tweens.add({ targets: red, alpha: 0.4, duration: 160, yoyo: true, repeat: -1 });
      const jm = this.img('jm_meltdown_cu', CX, 300, 55).setOrigin(0.5, 1).setTint(0xffa090);
      this.loops.push((t) => {
        jm.x = CX + (Math.sin(t * 95) > 0 ? 1 : -1) * s.amp(2);
        jm.setScale(1 + Math.sin(t * 44) * 0.014, 1 - Math.sin(t * 44) * 0.014);
      });
      this.zoom(CX, 112, 1.32, 1250);
    });
    this.at(T.implode + 140, () => {
      this.sfx('scream');
      this.say({ kind: 'shout', lines: YELL });
      s.shake(1150, 0.01);
      s.sweat.explode(14, CX - 60, 70);
      s.sweat.explode(14, CX + 60, 70);
    });

    // ---------- PLAN 2 : l'assaut de la clôture.
    const ground = 256;
    const midX = 236;
    const midY = ground - SPRITES.torn_mid.h;
    this.at(T.assault, () => {
      this.cut('cine_chuck');
      this.say({ kind: 'clear' });
      this.fenceRow('mid', midX, midY, true, 52);
      // dans le jardin de Chuck, derrière la clôture, le boxer danse
      this.boxer('mid', { x: 112, feet: 238, spin: 0, energy: 1 }, 51);
      const jm = this.climber(-70, ground + 6, 56);
      const { c, legL, legR } = jm;
      const stop = midX + 78;
      // il arrive en courant, sandales au vent
      let running = true;
      this.loops.push((t) => {
        if (!running) return;
        legL.rotation = Math.sin(t * 30) * 0.5;
        legR.rotation = -Math.sin(t * 30) * 0.5;
        c.y = ground + 6 - Math.abs(Math.sin(t * 30)) * 7;
      });
      s.tweens.add({ targets: c, x: stop, duration: 430, ease: 'Sine.easeOut' });
      this.every(0, 130, 4, () => this.sfx('sandal'));

      const step = (delay: number, fn: () => void) => this.at(delay, fn);
      const move = (target: object, props: Record<string, number>, ms: number) =>
        s.tweens.add({ targets: target, ...props, duration: ms, ease: 'Back.easeOut' });

      step(450, () => {
        running = false;
        legL.rotation = legR.rotation = 0;
        c.y = ground + 6;
        this.sfx('fence');
        s.dust.explode(10, stop, ground);
        s.shake(140, 0.008);
      });
      // il lève une jambe…
      step(560, () => {
        this.sfx('effort');
        this.say({ kind: 'bubble', text: CINE.climb, who: 'jeanmi', x: 66, y: 22, ms: 900 });
        move(legL, { rotation: 1.25 }, 170);
        move(c, { angle: -8, y: ground - 10 }, 170);
      });
      step(760, () => this.sfx('sandal'));
      // …ça glisse…
      step(840, () => {
        this.sfx('fence');
        move(legL, { rotation: 0.25 }, 110);
        move(c, { angle: 2, y: ground }, 110);
      });
      // …puis l'autre
      step(980, () => {
        this.sfx('effort');
        this.sfx('creak');
        this.say({ kind: 'onoma', text: CINE.creak, x: 50, y: 62, ms: 600 });
        move(legR, { rotation: -1.3 }, 170);
        move(c, { angle: 9, y: ground - 22 }, 170);
      });
      step(1180, () => this.sfx('sandal'));
      step(1250, () => {
        this.sfx('creak');
        this.sfx('fence');
        move(legL, { rotation: 1.1 }, 150);
        move(c, { angle: -5, y: ground - 40 }, 150);
        s.sweat.explode(6, stop, ground - 150);
      });
      // l'élan final
      step(1470, () => {
        this.sfx('effort');
        s.tweens.add({ targets: c, y: ground - 70, angle: 14, duration: 170, ease: 'Quad.easeIn' });
      });
    });

    // ---------- PLAN 3 : le short se déchire.
    const tb = SPRITES.torn_big;
    const bigX = Math.round((GAME_W - tb.w) / 2);
    const bigY = 266 - tb.h;
    const tearX = bigX + tb.tear_x + 14;
    const tearY = bigY + tb.tear_y + 12;
    this.at(T.rip, () => {
      this.cut('cine_chuck_big');
      this.say({ kind: 'clear' });
      this.fenceRow('big', bigX, bigY, false, 52);
      this.torn('big', bigX, bigY, 56);
      this.boxer('big', { x: 72, feet: 242, spin: 0, energy: 1 }, 51);
      // arrêt sur image, très bref, sur le moment exact
      this.frozen = true;
      this.sfx('rip');
      this.say({ kind: 'onoma', text: CINE.rip, x: 50, y: 20, ms: 1900 });
      s.flash(0xffffff, 220);
      s.shreds.explode(46, tearX, tearY);
      if (!s.reducedMotion) s.cameras.main.setZoom(1.55).centerOn(tearX, tearY);
    });
    this.at(T.rip + 430, () => {
      this.frozen = false;
      this.zoom(CX, CY, 1, 420, 'Back.easeOut');
      s.shake(1300, 0.007);
      this.every(0, 150, 11, () => this.sfx('sandal'));
      this.every(60, 420, 4, () => this.sfx('fence'));
      this.every(100, 260, 6, () => s.sweat.explode(4, bigX + 168 + rnd(-20, 20), bigY + 30));
    });
    this.at(T.rip + 1050, () => {
      this.sfx('growl');
      this.say({ kind: 'bubble', text: CINE.stuck, who: 'jeanmi', x: 80, y: 12, ms: 900 });
    });

    // ---------- PLAN 4 : le silence de Chuck.
    const farX = 264;
    const farY = 240 - SPRITES.torn_mid.h;
    let rig: TornRig | null = null;
    const dog: Dog = { x: 414, feet: 266, spin: 0, energy: 1 };
    let dogImg: Img | null = null;
    let chuck: Img | null = null;
    this.at(T.chuck, () => {
      this.cut('cine_jeanmi');
      this.say({ kind: 'clear' });
      this.sfx('hush');
      this.fenceRow('mid', farX, farY, false, 52);
      // Jean-Mi continue de s'agiter, au fond
      rig = this.torn('mid', farX, farY, 53);
      rig.power = 0.8;
      chuck = this.img('chuck_unbothered_cu', 244, 318, 60).setOrigin(1, 1);
      // pendant toute la catastrophe, le boxer continue de danser
      dogImg = this.boxer('big', dog, 61);
      s.gust.start();
      // une feuille traverse l'écran
      const leaf = this.img('leaf', GAME_W + 20, 70, 62).setScale(2);
      this.loops.push((t, dt) => {
        leaf.x -= 190 * dt;
        leaf.y = 86 + Math.sin(t * 4.2) * 22 + (GAME_W - leaf.x) * 0.08;
        leaf.angle += 420 * dt;
      });
    });
    this.at(T.chuck + 260, () => this.sfx('wind'));
    // il ajuste ses lunettes. Tranquillement.
    this.at(T.chuck + 1050, () => {
      chuck?.setTexture('chuck_sunglasses_cu');
      this.sfx('glasses');
    });
    this.at(T.chuck + 1800, () => {
      this.sfx('chuck');
      this.say({ kind: 'bubble', text: CINE.chuck, who: 'chuck', x: 35, y: 7, ms: 1150 });
    });

    // ---------- LE GAG DU BOXER : la musique est coupée. Lui l'entend encore.
    this.at(T.dog, () => {
      this.say({ kind: 'clear' });
      this.sfx('hush');
      s.gust.stop();
      // la caméra se décale légèrement vers le chien
      this.zoom(272, 152, 1.15, 380, 'Sine.easeInOut');
    });
    // il danse tout seul, dans le silence… puis finit par s'arrêter
    this.at(T.dog + 1750, () => s.tweens.add({ targets: dog, energy: 0, duration: 260 }));
    // …regarde Chuck d'un air innocent, la langue un peu sortie
    this.at(T.dog + 2050, () => {
      dogImg?.setTexture('boxer_calm_big').setFlipX(true);
      s.tweens.add({ targets: dog, feet: dog.feet - 3, duration: 70, yoyo: true });
    });

    // ---------- PLAN 5 : le triomphe national. Même plan : Chuck n'a pas bougé.
    this.at(T.triumph, () => {
      s.gust.stop();
      this.say({ kind: 'clear' });
      this.zoom(CX, CY, 1, 260);
      // et il repart de plus belle
      dogImg?.setTexture('boxer_dancing_big').setFlipX(false);
      dog.energy = 1.2;
      this.sfx('fanfare');
      s.confetti.start();
      s.burst.explode(220, CX, 250);
      this.say({ kind: 'title', lines: CINE.title });
    });
    this.at(T.triumph + 400, () => s.burst.explode(160, 80, 260));
    this.at(T.triumph + 650, () => s.burst.explode(160, 400, 260));
    this.at(T.triumph + 1150, () => this.say({ kind: 'sub', text: CINE.sub }));

    if (!perfect) {
      this.at(T.end, () => this.done());
      return;
    }

    // ---------- BONUS : victoire parfaite. Chuck est serviable.
    const E = T.end + 300;
    let stereo: Img | null = null;
    this.at(E, () => {
      this.say({ kind: 'clear' });
      s.confetti.stop();
      stereo = this.img('stereo_cu', 232, 440, 58).setOrigin(0.5, 1);
      s.tweens.add({
        targets: stereo, y: 300, duration: 300, ease: 'Back.easeOut',
        onComplete: () => this.sfx('thud'),
      });
    });
    this.at(E + 550, () => {
      this.sfx('chuck');
      this.say({ kind: 'bubble', text: CINE.offer, who: 'chuck', x: 40, y: 7, ms: 1500 });
    });
    this.at(E + 2100, () => {
      this.sfx('growl');
      this.say({ kind: 'bubble', text: CINE.answer, who: 'jeanmi', x: 76, y: 20, ms: 480 });
    });
    this.at(E + 2600, () => {
      // Chuck monte le son
      this.say({ kind: 'clear' });
      this.sfx('bass');
      s.flash(0xff40ff, 260);
      s.shake(1200, 0.022);
      if (rig) rig.power = 1.7;
      if (stereo) s.tweens.add({ targets: stereo, scale: 1.18, duration: 90, yoyo: true, repeat: 9 });
      for (let i = 0; i < 4; i++) {
        for (const dir of [1, -1]) {
          const w = this.img('wave_big', 232 + dir * 40, 150, 59).setFlipX(dir < 0).setScale(0.5).setAlpha(0.95);
          s.tweens.add({
            targets: w, x: 232 + dir * 420, scale: 1.5, alpha: 0, duration: 900, delay: i * 170, ease: 'Quad.easeOut',
          });
        }
      }
      // le pas de danse ridicule
      s.tweens.add({ targets: dog, spin: 720, duration: 800, ease: 'Cubic.easeOut' });
      s.tweens.add({ targets: dog, feet: dog.feet - 46, duration: 260, yoyo: true, ease: 'Quad.easeOut' });
      dog.energy = 1.6;
    });
    this.at(E + 3050, () => {
      this.sfx('scream-short');
      this.say({ kind: 'shout', lines: YELL_AGAIN });
    });
    this.at(E + 4300, () => {
      if (rig) rig.power = 1;
      this.sfx('jingle');
      this.say({ kind: 'clear' });
      this.say({ kind: 'title', lines: CINE.perfectTitle });
      this.say({ kind: 'sub', text: CINE.perfectSub });
      s.burst.explode(200, CX, 250);
    });
    this.at(E + 5700, () => this.done());
  }

  // ============================================================ DÉFAITE A
  /** « LE DOSSIER JEAN-MI » : trois flagrants délits. */
  busted(): void {
    const s = this.s;
    this.sfx('hush');
    s.jeanmi.setTexture('jm_watch').setFlipX(true).setPosition(SPOT.jeanmi.x, SPOT.jeanmi.feet);

    let glass: Img | null = null;
    this.at(550, () => {
      this.cut('cine_jeanmi');
      this.say({ kind: 'clear' });
      this.img('jm_watch_cu', 172, 302, 55).setOrigin(0.5, 1).setFlipX(true);
      this.img('table', 200, 198, 57).setOrigin(0);
      this.keep(s.add.rectangle(340, 256, 280, 30, 0xb9bfca).setDepth(56.9));
      glass = this.img('pastis_cu', 246, 203, 58).setOrigin(0.5, 1);
      // un sourire satisfait
      this.sfx('hehe');
      this.say({ kind: 'bubble', text: CINE.smug, who: 'jeanmi', x: 58, y: 16, ms: 800 });
    });
    // le dossier : tellement épais qu'il tombe
    this.at(1050, () => {
      const dossier = this.img('dossier', 352, -80, 58).setOrigin(0.5, 1);
      s.tweens.add({
        targets: dossier, y: 204, duration: 230, ease: 'Quad.easeIn',
        onComplete: () => {
          this.sfx('ploum');
          this.say({ kind: 'onoma', text: CINE.ploum, x: 72, y: 40, ms: 850 });
          s.shake(380, 0.022);
          s.dust.explode(20, 352, 204);
          s.tweens.add({ targets: dossier, scaleY: 0.82, duration: 70, yoyo: true });
          if (glass) s.tweens.add({ targets: glass, y: 180, angle: 22, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
        },
      });
    });
    // zoom sur son visage, il brandit une feuille
    this.at(1850, () => this.zoom(226, 118, 1.22, 280));
    this.at(2100, () => {
      this.sfx('paper');
      const sheet = this.img('sheet', 262, 240, 59);
      s.tweens.add({ targets: sheet, x: 262, y: 96, duration: 190, ease: 'Back.easeOut' });
      this.loops.push((t) => sheet.setAngle(Math.sin(t * 18) * 14));
      this.sfx('growl');
      this.say({ kind: 'shout', lines: CINE.noted });
    });
    this.at(3150, () => this.say({ kind: 'sub', text: CINE.pages }));

    // coupe sur Chuck. Il ajuste simplement ses lunettes.
    let chuck: Img | null = null;
    this.at(4400, () => {
      this.cut('cine_chuck');
      this.say({ kind: 'clear' });
      this.sfx('hush');
      chuck = this.img('chuck_unbothered_cu', 322, 318, 60).setOrigin(1, 1);
    });
    this.at(4850, () => {
      chuck?.setTexture('chuck_sunglasses_cu');
      this.sfx('glasses');
    });
    this.at(5350, () => {
      this.sfx('chuck');
      this.say({ kind: 'bubble', text: CINE.ah, who: 'chuck', x: 52, y: 7, ms: 1000 });
    });
    this.at(6250, () => {
      this.say({ kind: 'clear' });
      this.sfx('fail');
      this.say({ kind: 'title', lines: CINE.failTitle });
      this.say({ kind: 'sub', text: CINE.bustedSub });
    });
    this.at(7200, () => this.done());
  }

  // ============================================================ DÉFAITE B
  /** « LA SIESTE DE JEAN-MI » : le chronomètre est écoulé. */
  timeout(): void {
    const s = this.s;
    const jm = s.jeanmi;
    this.sfx('hush');
    this.say({ kind: 'clear' });
    s.chuck.setTexture('chuck_unbothered').setPosition(SPOT.chuck.right, SPOT.chuck.feet);
    jm.setTexture('jm_turn').setFlipX(false).setPosition(SPOT.jeanmi.x, SPOT.jeanmi.feet).setAngle(0);
    s.glass.setPosition(SPOT.glass.x, SPOT.glass.y).setAngle(0);

    // un long soupir, et il retourne vers sa chaise
    this.at(200, () => {
      this.sfx('sigh');
      this.say({ kind: 'bubble', text: CINE.sigh, who: 'jeanmi', x: 66, y: 34, ms: 700 });
    });
    this.at(700, () => s.tweens.add({ targets: jm, x: SPOT.chair.x, y: SPOT.chair.feet, duration: 380 }));
    // il s'installe dans sa chaise, pastis levé
    const seat = { x: SPOT.chair.x - 4, y: SPOT.chair.feet + 2 };
    const sit = () => {
      s.tweens.killTweensOf(jm);
      jm.setTexture('jm_pastis').setFlipX(false).clearTint().setScale(1).setAngle(0).setPosition(seat.x, seat.y);
      s.glass.setVisible(false);
    };
    this.at(1100, () => {
      sit();
      this.sfx('gulp');
      s.tweens.add({ targets: jm, y: seat.y - 2, duration: 160, yoyo: true, repeat: -1 });
    });

    // gros plan : Jean-Mi a gagné le droit de boire son pastis au calme (lent travelling sur l'illustration)
    this.at(1900, () => {
      this.cut(null);
      this.say({ kind: 'clear' });
      const img = this.img('cine_pastis', 0, -30, 50).setOrigin(0);
      this.loops.push((_t, dt) => {
        img.x = Math.max(GAME_W - SPRITES.cine_pastis.w, img.x - 22 * dt);
      });
      this.sfx('clink');
      this.say({ kind: 'sub', text: CINE.peace });
    });
    // il s'assoupit. Silence absolu.
    this.at(3200, () => this.say({ kind: 'zzz', x: 66, y: 20 }));

    // Chuck observe. Il hausse les épaules.
    this.at(4200, () => {
      this.cut('cine_chuck');
      this.say({ kind: 'clear' });
      const chuck = this.img('chuck_unbothered_cu', 322, 318, 60).setOrigin(1, 1);
      this.at(380, () => {
        s.tweens.add({ targets: chuck, y: 310, duration: 110, yoyo: true });
        this.sfx('chuck');
        this.say({ kind: 'bubble', text: CINE.bon, who: 'chuck', x: 52, y: 7, ms: 800 });
      });
    });

    // il retourne à sa Fuego ; Jean-Mi dort dans sa chaise
    this.at(5500, () => {
      this.cut(null);
      this.say({ kind: 'clear' });
      s.setProp(1);
      sit();
      jm.setAngle(6);
      s.tweens.add({ targets: s.chuck, x: SPOT.chuck.right - 44, duration: 320 });
    });
    this.at(5900, () => {
      this.sfx('roar');
      this.say({ kind: 'onoma', text: CINE.vroom, x: 32, y: 50, ms: 420 });
      s.shake(500, 0.022);
      s.tweens.add({ targets: s.prop, y: SPOT.fuego.base - 7, duration: 60, yoyo: true, repeat: 4 });
      for (let i = 0; i < 10; i++) this.at(i * 30, () => s.exhaust(1.8));
    });
    // Jean-Mi sursaute violemment sur sa chaise
    this.at(6060, () => {
      s.tweens.add({ targets: jm, y: seat.y - 46, angle: -24, duration: 150, ease: 'Quad.easeOut' });
      s.sweat.explode(14, seat.x, seat.y - 80);
      s.splash.explode(16, seat.x - 22, seat.y - 80);
    });
    // coupure immédiate sur noir
    this.at(6290, () => {
      this.sfx('hush');
      this.say({ kind: 'black', lines: [] });
    });
    this.at(7350, () => {
      this.sfx('blip');
      this.say({ kind: 'black', lines: [CINE.calm] });
    });
    this.at(8550, () => {
      this.sfx('blip');
      this.say({ kind: 'black', lines: [CINE.calm, CINE.timeoutSub] });
    });
    this.at(9700, () => this.done());
  }
}
