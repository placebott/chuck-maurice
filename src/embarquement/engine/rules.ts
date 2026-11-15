/**
 * Hypothèses de règles d'Embarquement.
 *
 * Les valeurs par défaut suivent l'analyse d'une vidéo de partie du jeu dont
 * s'inspire le prototype (docs/level43-observations.md). Chaque règle porte
 * son niveau de preuve : « observé » (vu plusieurs fois sans ambiguïté),
 * « probable » (cohérent avec tout ce qui est visible, mais pas isolé),
 * « non vérifié » (aucune séquence ne permet de trancher). Rien n'est donc
 * présenté comme la règle originale sans preuve, et tout reste réglable.
 *
 * Ordre d'application : RÈGLES PAR DÉFAUT ← `rules` du niveau JSON ← réglages
 * de la page (panneau « Hypothèses » ou paramètres d'URL).
 */
import type { Rules } from './types';

export const DEFAULT_RULES: Readonly<Rules> = {
  contact: 'overlap',
  collectOn: 'step',
  collectLimit: 'all',
  capacity: 'cells',
  charactersBlock: 'other-colors',
  whenFull: 'remove',
  win: 'both',
  movement: 'free',
  feederBatch: 'while-matching',
  timerStart: 'first-move',
};

export type Evidence = 'observé' | 'probable' | 'non vérifié';

export interface RuleChoice {
  readonly value: Rules[keyof Rules];
  readonly label: string;
}

export interface RuleDoc {
  readonly key: keyof Rules;
  /** Numéro de l'hypothèse, repris dans la documentation et le panneau. */
  readonly code: string;
  readonly title: string;
  readonly help: string;
  readonly choices: readonly RuleChoice[];
  /** Niveau de preuve de la valeur par défaut. */
  readonly evidence: Evidence;
  /** Ce qui, dans la vidéo, fonde ce niveau de preuve. */
  readonly basis: string;
}

/** Description de chaque hypothèse : documentation, et contenu du panneau de réglage. */
export const RULE_DOCS: readonly RuleDoc[] = [
  {
    key: 'contact',
    code: 'H1',
    title: 'Contact',
    help: "Cases d'où un personnage peut embarquer dans une pièce.",
    choices: [
      { value: 'overlap', label: 'Case recouverte par la pièce' },
      { value: 'side', label: 'Case voisine par un côté' },
      { value: 'side-or-corner', label: 'Case voisine, coins compris' },
    ],
    evidence: 'observé',
    basis: 'Chaque collecte suit le recouvrement du personnage ; des personnages voisins de leur pièce restent sur place pendant de longues secondes.',
  },
  {
    key: 'collectOn',
    code: 'H2',
    title: 'Moment de la collecte',
    help: 'Dès que la pièce franchit une case pendant le glisser (et encore au lâcher), ou seulement au lâcher.',
    choices: [
      { value: 'step', label: 'À chaque case franchie' },
      { value: 'release', label: 'Au lâcher de la pièce' },
    ],
    evidence: 'observé',
    basis: 'Le personnage éclate pendant que la pièce est encore tenue (contour en surbrillance), puis la pièce poursuit son trajet.',
  },
  {
    key: 'collectLimit',
    code: 'H3',
    title: 'Quantité par collecte',
    help: "Tous les personnages en contact (dans la limite des places libres), ou un seul. En cas de choix, l'ordre de lecture (haut → bas, gauche → droite) décide.",
    choices: [
      { value: 'all', label: 'Tous ceux en contact' },
      { value: 'one', label: 'Un seul' },
    ],
    evidence: 'non vérifié',
    basis: "Aucune séquence ne montre une pièce recouvrant d'un coup deux personnages de sa couleur.",
  },
  {
    key: 'capacity',
    code: 'H4',
    title: 'Capacité par défaut',
    help: "Places d'une pièce dont le JSON ne fixe pas la capacité. Les compteurs observés ne suivent pas le nombre de cases : un niveau fidèle fixe chaque capacité.",
    choices: [
      { value: 'cells', label: 'Une place par case' },
      { value: 1, label: '1 place' },
      { value: 2, label: '2 places' },
      { value: 3, label: '3 places' },
      { value: 4, label: '4 places' },
    ],
    evidence: 'observé',
    basis: 'Chaque pièce affiche un compteur qui baisse d’une unité par personnage et vaut zéro quand elle disparaît ; une pièce de 4 cases affiche 6.',
  },
  {
    key: 'charactersBlock',
    code: 'H5',
    title: 'Personnages bloquants',
    help: "Pièces qui ne peuvent pas passer sur la case d'un personnage en attente.",
    choices: [
      { value: 'other-colors', label: 'Bloquent les autres couleurs' },
      { value: 'all', label: 'Bloquent toutes les pièces' },
      { value: 'none', label: 'Ne bloquent rien' },
    ],
    evidence: 'non vérifié',
    basis: "Jamais une pièce n'apparaît sous un personnage d'une autre couleur, mais aucune séquence ne montre une pièce arrêtée par l'un d'eux.",
  },
  {
    key: 'whenFull',
    code: 'H6',
    title: 'Pièce pleine',
    help: 'Une pièce pleine disparaît et libère ses cases, ou reste en place comme obstacle.',
    choices: [
      { value: 'remove', label: 'Disparaît' },
      { value: 'stay', label: 'Reste en place' },
    ],
    evidence: 'observé',
    basis: 'Les pièces dont le compteur atteint zéro s’effacent et leurs cases redeviennent libres.',
  },
  {
    key: 'win',
    code: 'H7',
    title: 'Victoire',
    help: 'Condition de fin du niveau. « Personnages embarqués » inclut ceux des distributeurs.',
    choices: [
      { value: 'both', label: 'Tout embarqué et toutes les pièces disparues' },
      { value: 'all-collected', label: 'Tous les personnages embarqués' },
      { value: 'all-removed', label: 'Toutes les pièces disparues' },
    ],
    evidence: 'observé',
    basis: "L'écran de victoire suit la disparition de la dernière pièce, distributeurs vides.",
  },
  {
    key: 'movement',
    code: 'H8',
    title: 'Déplacement',
    help: 'Glisser libre dans les deux axes, ou verrouillé sur le premier axe emprunté jusqu’au lâcher.',
    choices: [
      { value: 'free', label: 'Libre' },
      { value: 'axis-lock', label: 'Un seul axe par glisser' },
    ],
    evidence: 'observé',
    basis: 'Des pièces changent de ligne et de colonne dans un même glisser.',
  },
  {
    key: 'feederBatch',
    code: 'H9',
    title: 'Distributeur',
    help: "Quand une pièce recouvre la case d'entrée d'un distributeur, il donne ses personnages de tête tant qu'ils sont de sa couleur et qu'elle a de la place, ou un seul.",
    choices: [
      { value: 'while-matching', label: 'Tant que la couleur correspond' },
      { value: 'one', label: 'Un seul par passage' },
    ],
    evidence: 'observé',
    basis: 'Deux personnages de même couleur descendent l’un après l’autre dans la même pièce ; le suivant, d’une autre couleur, reste en tête.',
  },
  {
    key: 'timerStart',
    code: 'H10',
    title: 'Départ du chronomètre',
    help: 'Au premier déplacement de pièce, ou dès l’affichage du niveau.',
    choices: [
      { value: 'first-move', label: 'Au premier déplacement' },
      { value: 'immediate', label: 'Dès le début' },
    ],
    evidence: 'probable',
    basis: 'Le chronomètre affiche sa durée pleine tant que rien n’a bougé, puis décompte ; la vidéo commence au premier geste.',
  },
];

const RULE_KEYS = RULE_DOCS.map((d) => d.key);

/** Valeur acceptable pour une règle ? (le JSON et l'URL ne sont pas typés) */
export function isRuleValue(key: keyof Rules, value: unknown): boolean {
  if (key === 'capacity') {
    return value === 'cells' || (typeof value === 'number' && Number.isInteger(value) && value >= 1);
  }
  const doc = RULE_DOCS.find((d) => d.key === key);
  return !!doc && doc.choices.some((c) => c.value === value);
}

/**
 * Vérifie un jeu partiel de règles venu d'un JSON ou d'une URL.
 * Retourne les erreurs (clé inconnue, valeur hors liste) sans rien corriger.
 */
export function checkPartialRules(raw: unknown, where: string): string[] {
  if (raw === undefined) return [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [`${where} : objet attendu`];
  const errors: string[] = [];
  for (const [key, value] of Object.entries(raw)) {
    if (!RULE_KEYS.includes(key as keyof Rules)) errors.push(`${where} : règle inconnue « ${key} »`);
    else if (!isRuleValue(key as keyof Rules, value)) errors.push(`${where}.${key} : valeur invalide ${JSON.stringify(value)}`);
  }
  return errors;
}

/** Combinaisons qui rendent le jeu incohérent ou injouable. */
export function ruleConflicts(rules: Rules): string[] {
  const errors: string[] = [];
  if (rules.contact === 'overlap' && rules.charactersBlock === 'all') {
    errors.push('H1 « case recouverte » exige que les personnages laissent passer au moins leur couleur (H5).');
  }
  if (rules.win !== 'all-collected' && rules.whenFull === 'stay') {
    errors.push('H7 « pièces disparues » exige que les pièces pleines disparaissent (H6).');
  }
  return errors;
}

/** Fusionne les couches de règles, la dernière l'emportant ; une valeur `undefined` ne remplace rien. */
export function resolveRules(...layers: (Partial<Rules> | undefined)[]): Rules {
  const out: Record<string, unknown> = { ...DEFAULT_RULES };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) if (value !== undefined) out[key] = value;
  }
  return out as unknown as Rules;
}
