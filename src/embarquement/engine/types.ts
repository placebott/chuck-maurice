/**
 * Types du moteur logique d'Embarquement.
 *
 * Le moteur ne connaît ni Phaser ni le DOM : il manipule des cases entières,
 * des identifiants et des couleurs opaques. L'affichage traduit ces données
 * en pixels et en teintes.
 */

/** Identifiant de couleur, tel qu'écrit dans le JSON du niveau (« red », « blue »…). */
export type ColorId = string;

export interface Cell {
  readonly x: number;
  readonly y: number;
}

// ------------------------------------------------------------------ JSON brut

/** Niveau tel qu'écrit dans un fichier JSON (format : README.md, « Niveaux JSON »). */
export interface LevelJson {
  id: string;
  name?: string;
  /** Numéro affiché dans l'interface (« Niveau 1 »). */
  number?: number;
  width: number;
  height: number;
  /** Durée du chronomètre en secondes ; absent : pas de chronomètre. */
  timerSeconds?: number;
  /** Couleurs autorisées dans ce niveau. */
  colors: ColorId[];
  pieces: PieceJson[];
  characters: CharacterJson[];
  /** Distributeurs de personnages, hors de la grille. */
  feeders?: FeederJson[];
  /** Hypothèses de règles propres à ce niveau (remplacent les valeurs par défaut). */
  rules?: Partial<Rules>;
}

/** Bord de la grille où se trouve un distributeur. */
export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface FeederJson {
  id: string;
  side: Side;
  /** Colonne (bord haut ou bas) ou ligne (bord gauche ou droit) de sa case d'entrée. */
  index: number;
  /** Couleurs des personnages, dans l'ordre de sortie. */
  queue: ColorId[];
  /** Séquence non vérifiée (supposée ou reconstituée) : signalée comme telle en DEBUG. */
  unverified?: boolean;
}

export interface PieceJson {
  id: string;
  color: ColorId;
  /** Colonne de la case en haut à gauche du dessin `shape`. */
  x: number;
  /** Ligne de la case en haut à gauche du dessin `shape`. */
  y: number;
  /** Dessin de la pièce, une chaîne par ligne : `#` = case pleine, `.` = vide. */
  shape: string[];
  /** Capacité explicite ; sinon elle découle de la règle `capacity`. */
  capacity?: number;
}

export interface CharacterJson {
  /** Facultatif : sinon « c1 », « c2 »… dans l'ordre du fichier. */
  id?: string;
  color: ColorId;
  x: number;
  y: number;
}

// ------------------------------------------------------------- niveau validé

export interface PieceDef {
  readonly id: string;
  readonly color: ColorId;
  /** Cases relatives à l'ancre (x, y), triées dans l'ordre de lecture. */
  readonly cells: readonly Cell[];
  readonly x: number;
  readonly y: number;
  /** Capacité écrite dans le JSON, si elle l'est. */
  readonly capacity?: number;
}

export interface CharacterDef {
  readonly id: string;
  readonly color: ColorId;
  readonly x: number;
  readonly y: number;
}

export interface FeederDef {
  readonly id: string;
  readonly side: Side;
  readonly index: number;
  /** Case de la grille qu'une pièce doit recouvrir pour être servie. */
  readonly entry: Cell;
  readonly queue: readonly ColorId[];
  readonly unverified: boolean;
}

export interface Level {
  readonly id: string;
  readonly name: string;
  readonly number: number | null;
  readonly width: number;
  readonly height: number;
  readonly timerSeconds: number | null;
  readonly colors: readonly ColorId[];
  readonly pieces: readonly PieceDef[];
  readonly characters: readonly CharacterDef[];
  readonly feeders: readonly FeederDef[];
  readonly rules: Partial<Rules>;
}

// -------------------------------------------------------------------- règles

/**
 * Hypothèses de jeu. Rien ici n'est validé contre le jeu original : chaque
 * option est un réglage à confronter au gameplay observé. Valeurs par défaut,
 * descriptions et contraintes : engine/rules.ts.
 */
export interface Rules {
  /** H1 — Quelles cases une pièce « touche-t-elle » ? */
  contact: 'side' | 'side-or-corner' | 'overlap';
  /** H2 — Quand la collecte a-t-elle lieu ? */
  collectOn: 'release' | 'step';
  /** H3 — Combien de personnages une collecte prend-elle ? */
  collectLimit: 'all' | 'one';
  /** H4 — Capacité d'une pièce sans capacité explicite : son nombre de cases, ou un nombre fixe. */
  capacity: 'cells' | number;
  /** H5 — Quelles pièces un personnage empêche-t-il de passer ? */
  charactersBlock: 'all' | 'other-colors' | 'none';
  /** H6 — Que devient une pièce pleine ? */
  whenFull: 'remove' | 'stay';
  /** H7 — Quand le niveau est-il gagné ? */
  win: 'all-collected' | 'all-removed' | 'both';
  /** H8 — Liberté de déplacement pendant un glisser. */
  movement: 'free' | 'axis-lock';
  /** H9 — Combien de personnages un distributeur donne-t-il d'un coup ? */
  feederBatch: 'while-matching' | 'one';
  /** H10 — Quand le chronomètre démarre-t-il ? */
  timerStart: 'first-move' | 'immediate';
}

// -------------------------------------------------------------------- état

export interface PieceState {
  readonly id: string;
  readonly color: ColorId;
  readonly cells: readonly Cell[];
  readonly capacity: number;
  x: number;
  y: number;
  /** Personnages embarqués, dans l'ordre d'arrivée. */
  passengers: string[];
  /** Pleine : plus aucune place (même si elle reste sur la grille avec `whenFull: 'stay'`). */
  full: boolean;
  /** Retirée de la grille : n'occupe plus aucune case. */
  removed: boolean;
}

export interface CharacterState {
  readonly id: string;
  readonly color: ColorId;
  readonly x: number;
  readonly y: number;
  /** Pièce qui l'a embarqué, ou null s'il attend encore. */
  collectedBy: string | null;
}

export interface FeederState {
  readonly def: FeederDef;
  /** Rang de la tête de file dans `def.queue` (= personnages déjà sortis). */
  next: number;
}

// ------------------------------------------------------------------ événements

/** Ce qui s'est passé pendant un appel au moteur, dans l'ordre : l'affichage s'en sert pour animer. */
export type EngineEvent =
  | { type: 'moved'; pieceId: string; from: Cell; to: Cell }
  /**
   * Personnages embarqués. `load` et `capacity` sont les valeurs après coup ;
   * `feederId` est renseigné quand ils viennent d'un distributeur (identifiants « <distributeur>#<rang> »).
   */
  | { type: 'collected'; pieceId: string; characterIds: string[]; load: number; capacity: number; feederId?: string }
  | { type: 'full'; pieceId: string }
  | { type: 'removed'; pieceId: string }
  | { type: 'clock-started' }
  | { type: 'won'; moves: number; timeLeftMs: number | null }
  | { type: 'lost'; moves: number };
