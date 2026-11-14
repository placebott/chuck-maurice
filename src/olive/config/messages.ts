import type { EndingKind, Fate, Phase } from './balance';

export const INTRO_LINES = [
  '19H46. BOCAL OUVERT. SAUCISSON DÉCOUPÉ.',
  "ALERTE : IL N'Y A PAS D'OLIVES DANS LE VERRE.",
  'DISTANCE : 3 MÈTRES. CHUCK REFUSE DE MARCHER.',
  'ARME : CUILLÈRE-CATAPULTE. 5 OLIVES. 35 SECONDES.',
];

/** Même rythme de briefing que Saucissonator (ms). */
export const INTRO_PACE = { start: 300, lineEvery: 1400, hold: 2100 } as const;
export const INTRO_DURATION = INTRO_PACE.start + (INTRO_LINES.length - 1) * INTRO_PACE.lineEvery + INTRO_PACE.hold;

export const GO_TEXT = 'FEU !';

export const PHASES: Record<Phase, { name: string; announce: string }> = {
  1: { name: 'TIR RÉGLEMENTAIRE', announce: 'PHASE 1 — TIR RÉGLEMENTAIRE' },
  2: { name: 'VENTILATION HOSTILE', announce: 'PHASE 2 — VENTILATION HOSTILE. QUI A BRANCHÉ ÇA ?' },
  3: { name: 'DÉFENSE ANTI-AÉRIENNE CANINE', announce: "PHASE 3 — DÉFENSE ANTI-AÉRIENNE CANINE. IL N'A PAS ÉTÉ BRIEFÉ." },
};

/** Compte rendu de Chuck après chaque tir, avec une gravité toute militaire. */
export const REPORTS: Record<Fate, string[]> = {
  scored: ['CIBLE ATTEINTE.', 'OLIVE EN POSITION.', 'IMPACT CONFIRMÉ.', 'MISSION PARTIELLE ACCOMPLIE.'],
  lost: ['TIR NON CONFORME.', 'OLIVE PORTÉE DISPARUE.', 'ERREUR DE CALCUL. DU VENT, SANS DOUTE.', 'DOMMAGE COLLATÉRAL : LA NAPPE.'],
  space: ['OLIVE EN ORBITE BASSE.', 'ALTITUDE EXCESSIVE.', 'ELLE NE REDESCENDRA PAS.'],
  window: ['OLIVE SORTIE DU TERRITOIRE.', 'ELLE A PRIS LA FENÊTRE.', 'VIOLATION DE FRONTIÈRE.'],
  dog: ['INTERCEPTION ENNEMIE !', 'TIR ABATTU EN VOL.', 'TRAÎTRE.'],
};

export const DIRECT_TEXT = 'TIR DIRECT';
export const RICOCHET_TEXT = 'RICOCHET';
export const CENTER_TEXT = 'PLEIN CENTRE';
export const STREAK_TEXT = 'TROIS SUR TROIS';

export const HEADLINES: Record<EndingKind, string> = {
  victory: 'CIBLE NEUTRALISÉE !',
  space: 'INCIDENT SPATIAL',
  dog: 'TRAHISON CANINE',
  diplomatic: 'INCIDENT DIPLOMATIQUE',
};

/** Lignes de l'écran de résultat. */
export const ENDINGS: Record<EndingKind, string[]> = {
  victory: ['CIBLE NEUTRALISÉE !', '3 OLIVES. 0 CIVIL TOUCHÉ.', "LA FRANCE CONTRÔLE DÉSORMAIS L'ESPACE AÉRIEN DE L'APÉRITIF."],
  space: ['OBJET VERT NON IDENTIFIÉ AU-DESSUS DE TOULOUSE.', "L'ARMÉE DE L'AIR A ÉTÉ INFORMÉE."],
  dog: ['LA DÉFENSE ANTI-AÉRIENNE A CHANGÉ DE CAMP.', 'SUSPECT À QUATRE PATTES. AUCUN REGRET.'],
  diplomatic: ['INCIDENT DIPLOMATIQUE', 'CONFLIT DE VOISINAGE NIVEAU 5', 'JEAN-MI A DÉCLARÉ LA GUERRE. ENCORE.'],
};

export const JEANMI_YELL = 'MAURIIIIICE !!!';

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
