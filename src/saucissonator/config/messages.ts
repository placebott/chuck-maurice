import type { EndingKind, Quality } from './balance';

export const INTRO_LINES = [
  '19H44. LE BOCAL EST NEUTRALISÉ.',
  "MAIS L'APÉRITIF EST TOUJOURS EN DANGER.",
  'OBJECTIF : 12 RONDELLES RÉGULIÈRES. DÉLAI : 25 S.',
  'ARME : UN COUTEAU MANIFESTEMENT TROP GRAND.',
];

export const GO_TEXT = 'TRANCHEZ !';
export const COMBO_TEXT = 'MODE CHARCUTERIE TACTIQUE ACTIVÉ';

/** Verdict affiché à chaque coupe. */
export const VERDICTS: Record<Quality, string[]> = {
  perfect: ['PARFAIT !', 'CHIRURGICAL !', 'AU MILLIMÈTRE !', 'MAGNIFIQUE !'],
  good: ['CORRECT', 'ÇA PASSE', 'HONNÊTE', 'PAS MAL'],
  thick: ['TROP ÉPAIS !', 'UN PAVÉ !', "C'EST UN RÔTI ?!"],
  thin: ['TROP FIN !', 'TRANSPARENT !', 'ON VOIT À TRAVERS !'],
  disaster: ['TROP TARD !'],
};

export const CHUCK_BARKS: Record<Quality, string[]> = {
  perfect: ['HMPF.', 'FACILE.', 'OBSERVEZ.', 'POUR LA FRANCE.'],
  good: ['BON.', 'SUIVANTE.', 'MOUAIS.'],
  thick: ['SACREBLEU !', 'MAIS… ?!', 'ÇA GLISSE !'],
  thin: ['QUOI ?!', "NOM D'UN COCHON !", 'ELLE A FONDU ?!'],
  disaster: ['RAAAAAAAH !!'],
};

export const BOXER_BARKS = ['WOUF !', 'SNIF SNIF…', '…', 'OUAF ?'];

/** Titre plaqué sur la scène à la fin de la mission. */
export const HEADLINES: Record<EndingKind, string> = {
  victory: 'LA FRANCE EST TRANCHÉE !',
  thick: 'LE PARPAING DE PORC',
  dog: 'VOL AGGRAVÉ DE CHARCUTERIE',
  nuclear: 'LA DÉCOUPE NUCLÉAIRE',
};

/** Message principal puis sous-titre de l'écran de résultat. */
export const ENDINGS: Record<EndingKind, [string, string]> = {
  victory: ['LA FRANCE EST TRANCHÉE !', '12 RONDELLES. LA RÉPUBLIQUE VOUS REMERCIE.'],
  thick: ['LE PLANCHER DU DEUXIÈME ÉTAGE A CÉDÉ.', 'COÛT ESTIMÉ : 48 000 FRANCS.'],
  dog: ['MISSION COMPROMISE. LE SUSPECT A QUATRE PATTES.', 'AUCUN REGRET.'],
  nuclear: ['OPÉRATION TERMINÉE. CUISINE ÉGALEMENT.', "L'APÉRITIF AURA LIEU DANS LE JARDIN."],
};

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
