/**
 * OLIVE STORM — tous les réglages de physique et de difficulté sont ici.
 * Unités : pixels logiques (écran 480 × 270), secondes, degrés.
 * Équilibrage vérifié par tests/olive.test.ts.
 */
export const STORM = {
  /** Durée de la mission (s). */
  duration: 35,
  /** Olives disponibles. */
  shots: 5,
  /** Olives à placer dans le verre. */
  target: 3,

  // ------------------------------------------------------------ tir
  /** Accélération de la pesanteur (px/s²). */
  gravity: 300,
  /** Vitesse initiale de l'olive (px/s) : la cuillère tire toujours avec la même force. */
  speed: 290,
  /** Angle de tir autorisé (°, 0 = horizontal vers la droite) : c'est le seul réglage du joueur. */
  angleMin: 8,
  angleMax: 82,
  /** L'angle de départ est tiré au hasard dans cette plage à chaque mission. */
  angleStart: [18, 30],
  /** Pas des touches directionnelles (°) ; Maj multiplie par 4. */
  angleStep: 0.5,
  /** Tirage minimal (px écran logique) pour qu'un glisser compte comme une visée. */
  dragMin: 14,

  // ------------------------------------------------------------ olive
  radius: 4.5,
  /** Pas de simulation fixe (s) : mêmes conditions initiales, même trajectoire. */
  step: 1 / 240,
  /** Vitesse normale minimale pour qu'un contact compte comme un rebond (px/s). */
  bounceSpeed: 45,
  /** Freinage d'une olive qui roule (px/s²). */
  rollDrag: 420,
  /** Vitesse sous laquelle une olive est considérée arrêtée (px/s), et durée de confirmation (s). */
  restSpeed: 16,
  restTime: 0.22,
  /** Durée de vol maximale avant de déclarer l'olive perdue (s). */
  maxFlight: 4.5,

  /** Restitution (énergie rendue au rebond) et adhérence (part de vitesse tangentielle perdue). */
  materials: {
    table: { bounce: 0.42, grip: 0.22 },
    wall: { bounce: 0.5, grip: 0.1 },
    metal: { bounce: 0.74, grip: 0.06 },
    glass: { bounce: 0.24, grip: 0.3 },
    olive: { bounce: 0.2, grip: 0.3 },
  },

  // ------------------------------------------------------------ mise en place
  /**
   * La force du ventilateur change d'une mission à l'autre : on ne peut pas apprendre l'angle par cœur.
   * Elle est fixée au début de la mission et ne bouge plus ensuite. Le ventilateur souffle dans le dos
   * de Chuck (positif = vers la droite) : l'olive porte plus loin et la bonne fenêtre d'angle rétrécit.
   */
  winds: [40, 50, 60],

  // ------------------------------------------------------------ phases
  /** Durée de trajectoire affichée pendant la visée (s), par phase : juste l'amorce du tir. */
  preview: [0.22, 0.16, 0.16],
  /** Phase 3 : le boxer bondit toutes les `period` s ; `warn` s d'avertissement avant chaque saut. */
  boxer: { first: 1.6, period: 3.3, leap: 0.95, warn: 0.75, radius: 14 },

  // ------------------------------------------------------------ score
  points: { olive: 500, direct: 300, ricochet: 200, center: 500, streak: 1000 },
  /** Écart maximal au centre de l'ouverture pour le bonus « tir parfait » (px). */
  centerTol: 6,
} as const;

export type Material = keyof typeof STORM.materials;
export type Phase = 1 | 2 | 3;
/** Ce qu'il est advenu d'une olive. */
export type Fate = 'scored' | 'space' | 'window' | 'dog' | 'lost';
export type EndingKind = 'victory' | 'space' | 'dog' | 'diplomatic';

// ------------------------------------------------------------ géométrie de la cuisine
export const FLOOR_Y = 232;
export const WORLD_W = 480;

/** Poing de Chuck : pivot de la cuillère-catapulte. */
export const PIVOT = { x: 152, y: 158 };
/** Distance du pivot au creux de la cuillère : l'olive part de là. */
export const SPOON_REACH = 72;

export const GLASS = {
  x: 432,
  /** Hauteur du bord au-dessus de la table. */
  rim: 60,
  /** Demi-largeur de l'ouverture. */
  half: 26,
  /** Hauteur de la pointe du cône. */
  apex: 31,
};

export const PAN = { x: 286, w: 51, h: 27, handle: 28 };
export const CLOCK = { x: 315, y: 34, r: 21 };
/** Ouverture de la fenêtre : une olive qui a ricoché et qui passe par là quitte la cuisine. */
export const WINDOW = { x0: 156, x1: 222, y0: 24, y1: 92 };

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
