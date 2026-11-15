/** Teintes de l'affichage. Le moteur ne manipule que des identifiants de couleur. */

export interface Shade {
  /** Corps de la pièce et du personnage. */
  readonly base: number;
  /** Contour, ombre portée. */
  readonly dark: number;
  /** Creux de la pièce. */
  readonly deep: number;
  /** Nom affiché (mode DEBUG). */
  readonly label: string;
}

const COLORS: Record<string, Shade> = {
  red: { base: 0xef4f5a, dark: 0xa3242f, deep: 0x6e1820, label: 'rouge' },
  orange: { base: 0xff9a3c, dark: 0xb8631a, deep: 0x7a3f0e, label: 'orange' },
  yellow: { base: 0xffcf3c, dark: 0xb58a17, deep: 0x7a5c0c, label: 'jaune' },
  lime: { base: 0x9be35a, dark: 0x5d9a2a, deep: 0x3b6619, label: 'vert clair' },
  green: { base: 0x2fbf71, dark: 0x1a7d47, deep: 0x0f5230, label: 'vert' },
  cyan: { base: 0x4fd6e6, dark: 0x1f8f9c, deep: 0x125e67, label: 'cyan' },
  blue: { base: 0x3d7bff, dark: 0x1d47a6, deep: 0x122e6e, label: 'bleu' },
  purple: { base: 0xa66bff, dark: 0x6a3bb8, deep: 0x46247d, label: 'violet' },
  pink: { base: 0xff6fb5, dark: 0xb33d7a, deep: 0x7a2551, label: 'rose' },
};

const FALLBACK: Shade = { base: 0xb0b6c8, dark: 0x5d6480, deep: 0x3c4157, label: 'gris' };

export function shadeOf(color: string): Shade {
  return COLORS[color] ?? FALLBACK;
}

/** Couleurs connues de l'affichage (un niveau peut en utiliser d'autres : elles seront grises). */
export const KNOWN_COLORS = Object.keys(COLORS);

export const BOARD = {
  panel: 0x232c4d,
  cell: 0x2e3963,
  cellEdge: 0x384574,
  entry: 0x8fa3e8,
  booth: 0x1b2340,
  boothEdge: 0x4a5a99,
  badge: 0x10142a,
  ring: 0xffffff,
  eye: 0xffffff,
  pupil: 0x1a1f33,
  debug: 0xffffff,
} as const;

/** Couleur CSS d'une teinte (panneaux HTML). */
export function cssColor(color: string): string {
  return `#${shadeOf(color).base.toString(16).padStart(6, '0')}`;
}
