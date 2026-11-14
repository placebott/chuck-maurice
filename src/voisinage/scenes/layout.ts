/** Dimensions de la scène et repères du plan large, communs à la scène de jeu et aux cinématiques. */
export const GAME_W = 480;
export const GAME_H = 270;

/** Repères du plan large (pixels de la scène 480x270). */
export const SPOT = {
  /** Chuck est ancré par son talon droit : ses deux poses n'ont pas la même largeur. */
  chuck: { right: 222, feet: 224 },
  jeanmi: { x: 316, feet: 216 },
  /** Sa chaise, pour la sieste. */
  chair: { x: 334, feet: 196 },
  glass: { x: 384, y: 148 },
  /** Le boxer, dans le jardin de Chuck, entre son maître et la clôture. */
  boxer: { x: 226, feet: 264 },
  fuego: { x: 78, base: 230 },
  barbecue: { x: 100, base: 232 },
  stereo: { x: 72, base: 237 },
} as const;
