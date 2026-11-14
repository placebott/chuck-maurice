import {
  FLOOR_Y, GLASS, STORM, WORLD_W, clamp,
  type EndingKind, type Fate, type Phase,
} from '../config/balance';
import {
  CLOCK_DISC, buildSegments, inWindow, insideGlass, launch, stepOlive,
  type Contact, type Disc, type Olive, type Segment,
} from '../physics/world';

export interface ShotRecord {
  /** Rang du tir (0 = premier). */
  index: number;
  angle: number;
  fate: Fate;
  /** Rebonds avant l'entrée dans le verre (ou avant la perte de l'olive). */
  bounces: number;
  /** Tir réussi sans aucun rebond. */
  direct: boolean;
  /** Entrée au centre de l'ouverture. */
  centered: boolean;
  /** Détail des points : un tir réussi touche soit le bonus direct, soit le bonus ricochet, jamais les deux. */
  points: { olive: number; direct: number; ricochet: number; center: number; streak: number };
  total: number;
  /** Obstacles touchés pendant le vol. */
  touched: string[];
}

export type MissionEvent =
  | { type: 'bounce'; contact: Contact }
  | { type: 'enter' }
  | { type: 'resolved'; shot: ShotRecord; x: number; y: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'boxer-warn' }
  | { type: 'boxer-leap' }
  | { type: 'end'; kind: EndingKind };

export interface BoxerState {
  /** Le boxer est en l'air : il peut intercepter. */
  leaping: boolean;
  /** Avertissement avant le saut. */
  warning: boolean;
  /** Avancement du saut (0–1). */
  k: number;
  x: number;
  y: number;
}

/** Mise en place d'une mission : fixée au départ, elle ne change plus ensuite. */
export interface Layout {
  /** Position horizontale du verre. */
  glassX: number;
  /** Accélération du ventilateur, appliquée à partir de la phase 2. */
  wind: number;
}

/** Tire au hasard la force du ventilateur parmi STORM.winds. */
export function randomLayout(random: () => number = Math.random): Layout {
  const i = Math.min(STORM.winds.length - 1, Math.floor(random() * STORM.winds.length));
  return { glassX: GLASS.x, wind: STORM.winds[i] };
}

/** Trajectoire du saut du boxer : une parabole fixe, de la droite vers la gauche, au-dessus du verre. */
export function boxerPath(k: number): { x: number; y: number } {
  const x = 545 - 235 * k;
  const y = 252 - 4 * 132 * k * (1 - k);
  return { x, y };
}

const NO_POINTS = { olive: 0, direct: 0, ricochet: 0, center: 0, streak: 0 };

/** État d'une mission Olive Storm : règles, score et physique, sans rendu. */
export class Mission {
  timeLeft: number = STORM.duration;
  shotsLeft: number = STORM.shots;
  scored = 0;
  score = 0;
  phase: Phase = 1;
  /** Tirs réussis d'affilée. */
  streak = 0;
  readonly shots: ShotRecord[] = [];
  /** Olive en vol, s'il y en a une. */
  olive: Olive | null = null;
  /** Olives immobilisées dans le verre : elles deviennent des obstacles. */
  readonly settled: Disc[] = [];
  ending: EndingKind | null = null;

  private readonly segments: Segment[];
  private current: { angle: number } | null = null;
  private acc = 0;
  /** Instant (temps de mission) où le boxer est entré en scène. */
  private boxerSince = 0;
  private boxerWarned = -1;
  private boxerLeapt = -1;
  private hadEntry = false;

  constructor(readonly layout: Layout = randomLayout()) {
    this.segments = buildSegments(layout.glassX);
  }

  get elapsed(): number {
    return STORM.duration - this.timeLeft;
  }

  /** Accélération horizontale du ventilateur pour la phase en cours. */
  get wind(): number {
    return this.phase >= 2 ? this.layout.wind : 0;
  }

  get obstacles(): { segments: readonly Segment[]; discs: readonly Disc[] } {
    return { segments: this.segments, discs: [CLOCK_DISC, ...this.settled] };
  }

  get canFire(): boolean {
    return !this.ending && !this.olive && this.shotsLeft > 0 && this.timeLeft > 0;
  }

  /** Tirs utilisés. */
  get used(): number {
    return STORM.shots - this.shotsLeft;
  }

  /** Position du boxer à l'instant courant (phase 3 uniquement). */
  boxer(): BoxerState {
    const b = STORM.boxer;
    const idle = { leaping: false, warning: false, k: 0, ...boxerPath(0) };
    if (this.phase < 3) return idle;
    const t = this.elapsed - this.boxerSince - b.first;
    if (t < -b.warn) return idle;
    const cycle = ((t % b.period) + b.period) % b.period;
    if (t >= 0 && cycle < b.leap) {
      const k = cycle / b.leap;
      return { leaping: true, warning: false, k, ...boxerPath(k) };
    }
    return { ...idle, warning: cycle >= b.period - b.warn || t < 0 };
  }

  /** Numéro du saut en cours ou à venir, pour n'annoncer chaque saut qu'une fois. */
  private leapIndex(): number {
    const b = STORM.boxer;
    return Math.floor((this.elapsed - this.boxerSince - b.first + b.warn) / b.period);
  }

  fire(angle: number): boolean {
    if (!this.canFire) return false;
    const a = clamp(angle, STORM.angleMin, STORM.angleMax);
    this.olive = launch(a);
    this.current = { angle: a };
    this.shotsLeft--;
    this.hadEntry = false;
    return true;
  }

  /** Avance la mission de `dt` secondes, par pas fixes. */
  update(dt: number): MissionEvent[] {
    const events: MissionEvent[] = [];
    if (this.ending) return events;
    this.acc += dt;
    while (this.acc >= STORM.step && !this.ending) {
      this.acc -= STORM.step;
      this.tick(STORM.step, events);
    }
    return events;
  }

  private tick(dt: number, events: MissionEvent[]): void {
    this.timeLeft = Math.max(0, this.timeLeft - dt);

    if (this.phase === 3) {
      const i = this.leapIndex();
      const b = this.boxer();
      if (b.warning && i > this.boxerWarned) {
        this.boxerWarned = i;
        events.push({ type: 'boxer-warn' });
      }
      if (b.leaping && i > this.boxerLeapt) {
        this.boxerLeapt = i;
        events.push({ type: 'boxer-leap' });
      }
    }

    const o = this.olive;
    if (o) {
      const discs = [CLOCK_DISC, ...this.settled];
      for (const contact of stepOlive(o, this.segments, discs, this.wind, dt, this.layout.glassX)) events.push({ type: 'bounce', contact });
      if (o.entry && !this.hadEntry) events.push({ type: 'enter' });
      this.hadEntry = o.entry !== null;
      const fate = this.fateOf(o);
      if (fate) this.resolve(fate, events);
    }

    // chrono écoulé : on laisse retomber l'olive en vol, puis c'est fini
    if (!this.ending && this.timeLeft <= 0 && !this.olive) this.end(this.catastrophe(), events);
  }

  private fateOf(o: Olive): Fate | null {
    if (this.phase === 3) {
      const b = this.boxer();
      // gueule ouverte, en avant du sprite
      if (b.leaping && Math.hypot(o.x - (b.x - 30), o.y - b.y) < STORM.boxer.radius + STORM.radius) return 'dog';
    }
    if (o.y < -12) return 'space';
    // une olive déviée par le métal part vers le fond de la cuisine : la fenêtre est ouverte
    if (inWindow(o) && (o.touched.has('pan') || o.touched.has('clock'))) return 'window';
    if (o.still >= STORM.restTime) return insideGlass(o.x, o.y, this.layout.glassX) ? 'scored' : 'lost';
    if (o.t > STORM.maxFlight || o.y > FLOOR_Y + 60 || o.x > WORLD_W + 12) return 'lost';
    return null;
  }

  private resolve(fate: Fate, events: MissionEvent[]): void {
    const o = this.olive!;
    const aim = this.current!;
    this.olive = null;
    this.current = null;

    const scored = fate === 'scored';
    const bounces = scored && o.entry ? o.entry.bounces : o.bounces;
    const direct = scored && bounces === 0;
    const centered = scored && !!o.entry && o.entry.offset <= STORM.centerTol;
    this.streak = scored ? this.streak + 1 : 0;

    const pts = STORM.points;
    const points = scored
      ? {
          olive: pts.olive,
          direct: direct ? pts.direct : 0,
          ricochet: direct ? 0 : pts.ricochet,
          center: centered ? pts.center : 0,
          // accordé une seule fois : à la troisième olive consécutive, qui est aussi la dernière
          streak: this.streak === STORM.target ? pts.streak : 0,
        }
      : NO_POINTS;
    const total = points.olive + points.direct + points.ricochet + points.center + points.streak;
    this.score += total;

    const shot: ShotRecord = {
      index: this.shots.length, angle: aim.angle, fate, bounces, direct, centered,
      points, total, touched: [...o.touched],
    };
    this.shots.push(shot);
    events.push({ type: 'resolved', shot, x: o.x, y: o.y });

    if (scored) {
      this.scored++;
      this.settled.push({ x: o.x, y: o.y, r: STORM.radius, mat: 'olive', id: 'olive' });
      if (this.scored >= STORM.target) {
        this.end('victory', events);
        return;
      }
      this.phase = (this.scored + 1) as Phase;
      if (this.phase === 3) this.boxerSince = this.elapsed;
      events.push({ type: 'phase', phase: this.phase });
    }
    // plus assez d'olives pour atteindre l'objectif : inutile de prolonger
    if (this.scored + this.shotsLeft < STORM.target) this.end(this.catastrophe(), events);
  }

  private end(kind: EndingKind, events: MissionEvent[]): void {
    this.ending = kind;
    events.push({ type: 'end', kind });
  }

  /** La catastrophe finale dépend de ce qui s'est réellement passé pendant la mission. */
  catastrophe(): Exclude<EndingKind, 'victory'> {
    const misses = this.shots.filter((s) => s.fate !== 'scored');
    const last = misses[misses.length - 1];
    if (last?.fate === 'dog') return 'dog';
    if (misses.some((s) => s.fate === 'window')) return 'diplomatic';
    if (misses.some((s) => s.fate === 'space')) return 'space';
    if (misses.some((s) => s.fate === 'dog')) return 'dog';
    // rien de spectaculaire : des tirs en cloche finissent dans le ciel, les autres chez le voisin
    const steep = misses.reduce((sum, s) => sum + s.angle, 0) / Math.max(1, misses.length);
    return misses.length > 0 && steep >= 50 ? 'space' : 'diplomatic';
  }

  /** Part des tirs utilisés qui ont fini dans le verre (0–1). */
  get accuracy(): number {
    return this.used ? this.scored / this.used : 0;
  }
}

export const GLASS_RIM_Y = FLOOR_Y - GLASS.rim;
