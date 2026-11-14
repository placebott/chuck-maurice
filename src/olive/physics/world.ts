import {
  CLOCK, FLOOR_Y, GLASS, PAN, PIVOT, SPOON_REACH, STORM, WINDOW, WORLD_W, toSpeed,
  type Material,
} from '../config/balance';

/**
 * Physique d'Olive Storm : un disque (l'olive) contre des segments et des disques fixes.
 * Logique pure, sans rendu, à pas fixe : mêmes conditions initiales, même trajectoire.
 */
export interface Segment {
  ax: number; ay: number; bx: number; by: number;
  mat: Material;
  /** Identifiant de l'obstacle touché : 'table', 'wall', 'pan', 'glass', 'rim'… */
  id: string;
}

export interface Disc {
  x: number; y: number; r: number;
  mat: Material;
  id: string;
}

export interface Contact {
  id: string;
  mat: Material;
  /** Vitesse d'impact le long de la normale (px/s). */
  speed: number;
  x: number;
  y: number;
}

export interface Olive {
  x: number; y: number;
  vx: number; vy: number;
  /** Rotation visuelle (rad), entraînée par la vitesse. */
  spin: number;
  /** Temps de vol (s). */
  t: number;
  /** Rebonds avant l'entrée dans le verre. */
  bounces: number;
  /** Obstacles touchés. */
  touched: Set<string>;
  /** Renseigné quand l'olive franchit l'ouverture du verre par le haut. */
  entry: { bounces: number; offset: number } | null;
  /** Temps passé quasi immobile (s). */
  still: number;
  /** En contact avec une surface pendant le dernier pas. */
  grounded: boolean;
}

const rimY = FLOOR_Y - GLASS.rim;
const apexY = FLOOR_Y - GLASS.apex;

/** Obstacles fixes de la cuisine. */
export function buildSegments(): Segment[] {
  const g = GLASS;
  const p = PAN;
  const panTop = FLOOR_Y - p.h;
  return [
    { ax: -40, ay: FLOOR_Y, bx: WORLD_W + 40, by: FLOOR_Y, mat: 'table', id: 'table' },
    { ax: 0, ay: -400, bx: 0, by: FLOOR_Y, mat: 'wall', id: 'wall' },
    { ax: WORLD_W, ay: -400, bx: WORLD_W, by: FLOOR_Y, mat: 'wall', id: 'wall' },
    // verre : deux parois en V, un pied
    { ax: g.x - g.half, ay: rimY, bx: g.x, by: apexY, mat: 'glass', id: 'glass' },
    { ax: g.x + g.half, ay: rimY, bx: g.x, by: apexY, mat: 'glass', id: 'glass' },
    { ax: g.x, ay: apexY, bx: g.x, by: FLOOR_Y, mat: 'glass', id: 'stem' },
    // casserole : deux flancs, un fond, un manche
    { ax: p.x, ay: panTop, bx: p.x + 3, by: FLOOR_Y, mat: 'metal', id: 'pan' },
    { ax: p.x + p.w, ay: panTop, bx: p.x + p.w - 3, by: FLOOR_Y, mat: 'metal', id: 'pan' },
    { ax: p.x + 3, ay: FLOOR_Y - 4, bx: p.x + p.w - 3, by: FLOOR_Y - 4, mat: 'metal', id: 'pan' },
    { ax: p.x + p.w, ay: panTop + 4, bx: p.x + p.w + p.handle, by: panTop - 8, mat: 'metal', id: 'pan' },
  ];
}

export const CLOCK_DISC: Disc = { x: CLOCK.x, y: CLOCK.y, r: CLOCK.r, mat: 'metal', id: 'clock' };

/** Point de départ et vitesse d'une olive pour un angle (°) et une puissance (0–1) donnés. */
export function launch(angleDeg: number, power: number): Olive {
  const a = (angleDeg * Math.PI) / 180;
  const speed = toSpeed(power);
  return {
    x: PIVOT.x + Math.cos(a) * SPOON_REACH,
    y: PIVOT.y - Math.sin(a) * SPOON_REACH,
    vx: Math.cos(a) * speed,
    vy: -Math.sin(a) * speed,
    spin: 0,
    t: 0,
    bounces: 0,
    touched: new Set(),
    entry: null,
    still: 0,
    grounded: false,
  };
}

/** L'olive est-elle à l'intérieur du cône du verre ? */
export function insideGlass(x: number, y: number): boolean {
  if (y <= rimY || y >= apexY) return false;
  const half = (GLASS.half * (apexY - y)) / (apexY - rimY);
  return Math.abs(x - GLASS.x) < half;
}

function collide(o: Olive, cx: number, cy: number, extra: number, mat: Material, id: string, out: Contact[]): void {
  const dx = o.x - cx;
  const dy = o.y - cy;
  const reach = STORM.radius + extra;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  o.x = cx + nx * reach;
  o.y = cy + ny * reach;
  o.grounded = true;
  const vn = o.vx * nx + o.vy * ny;
  if (vn >= 0) return;
  const m = STORM.materials[mat];
  const tx = -ny;
  const ty = nx;
  const vt = (o.vx * tx + o.vy * ty) * (1 - m.grip);
  // sous le seuil, pas de rebond : l'olive se pose
  const back = -vn > STORM.bounceSpeed ? -vn * m.bounce : 0;
  o.vx = tx * vt + nx * back;
  o.vy = ty * vt + ny * back;
  if (-vn > STORM.bounceSpeed) {
    out.push({ id, mat, speed: -vn, x: cx, y: cy });
    o.touched.add(id);
    if (!o.entry) o.bounces++;
  }
}

/**
 * Avance l'olive d'un pas fixe. `windAx` : accélération horizontale du ventilateur.
 * `discs` : obstacles ronds (horloge, olives déjà dans le verre). Renvoie les rebonds du pas.
 */
export function stepOlive(o: Olive, segments: readonly Segment[], discs: readonly Disc[], windAx: number, dt: number): Contact[] {
  const contacts: Contact[] = [];
  const prevY = o.y;
  o.vx += windAx * dt;
  o.vy += STORM.gravity * dt;
  o.x += o.vx * dt;
  o.y += o.vy * dt;
  o.t += dt;
  o.grounded = false;

  for (const s of segments) {
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const len2 = ex * ex + ey * ey;
    const k = Math.min(1, Math.max(0, ((o.x - s.ax) * ex + (o.y - s.ay) * ey) / len2));
    collide(o, s.ax + ex * k, s.ay + ey * k, 0, s.mat, s.id, contacts);
  }
  for (const d of discs) collide(o, d.x, d.y, d.r, d.mat, d.id, contacts);

  // franchissement de l'ouverture du verre, par le haut uniquement
  if (prevY < rimY && o.y >= rimY && Math.abs(o.x - GLASS.x) < GLASS.half) {
    o.entry = { bounces: o.bounces, offset: Math.abs(o.x - GLASS.x) };
  } else if (o.entry && o.y < rimY - STORM.radius) {
    o.entry = null; // ressortie : le rebond dans le verre redevient un rebond tout court
  }

  // une olive posée roule, freine et finit par s'arrêter
  if (o.grounded) {
    const speed = Math.hypot(o.vx, o.vy);
    if (speed > 0) {
      const k = Math.max(0, speed - STORM.rollDrag * dt) / speed;
      o.vx *= k;
      o.vy *= k;
    }
  }
  const speed = Math.hypot(o.vx, o.vy);
  o.still = o.grounded && speed < STORM.restSpeed ? o.still + dt : 0;
  o.spin += (o.vx / STORM.radius) * dt;
  return contacts;
}

/** L'olive est-elle dans l'ouverture de la fenêtre ? */
export function inWindow(o: Olive): boolean {
  return o.x > WINDOW.x0 && o.x < WINDOW.x1 && o.y > WINDOW.y0 && o.y < WINDOW.y1;
}

/**
 * Trajectoire prévisionnelle : le même modèle que le tir réel, arrêté au premier contact
 * ou après `duration` secondes. Elle ne prédit donc pas les rebonds.
 */
export function previewPath(
  angleDeg: number, power: number, windAx: number, duration: number,
  segments: readonly Segment[], discs: readonly Disc[], every = 0.05,
): { x: number; y: number }[] {
  const o = launch(angleDeg, power);
  const pts = [{ x: o.x, y: o.y }];
  let next = every;
  while (o.t < duration) {
    const hits = stepOlive(o, segments, discs, windAx, STORM.step);
    if (hits.length || o.grounded || o.y < -20) break;
    if (o.t >= next) {
      pts.push({ x: o.x, y: o.y });
      next += every;
    }
  }
  return pts;
}
