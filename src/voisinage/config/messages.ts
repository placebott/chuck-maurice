import type { Act, Ending, WatchState } from './balance';

export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

// ---------------------------------------------------------------- briefing
export const INTRO_LINES = [
  'JEAN-MI TOURNE LE DOS : MAINTIENS.',
  'JEAN-MI REGARDE : RELÂCHE !',
  'FAIS-LE CRAQUER EN 35 SECONDES.',
];
export const INTRO_PACE = { start: 250, lineEvery: 1250 };
export const INTRO_DURATION = 4700;
export const GO_TEXT = '19H58 !';

// ---------------------------------------------------------------- jeu
export const ACTS: Record<Act, { name: string; verb: string }> = {
  1: { name: 'LA RENAULT FUEGO', verb: 'DÉMARRER' },
  2: { name: 'LE BARBECUE TACTIQUE', verb: 'ATTISER' },
  3: { name: "LA SONO DE L'APOCALYPSE", verb: 'MONTER LE SON' },
};
export const HOLD_LABEL = "FAIRE COMME D'HABITUDE";

/** Message plaqué à la fin de l'acte précédent. */
export const MILESTONES: Record<2 | 3, string> = {
  2: 'PREMIÈRE PLAINTE DÉPOSÉE.',
  3: 'VISIBILITÉ DU VOISIN : NULLE.',
};

export const WATCH_LABEL: Record<WatchState, string> = {
  back: 'IL TOURNE LE DOS : MAINTIENS',
  warning: 'ATTENTION…',
  watching: 'IL REGARDE : RELÂCHE !',
};

export const CAUGHT_TEXT = 'FLAGRANT DÉLIT !';
export const JEANMI_CAUGHT = ["JE T'AI VU, MAURICE !", 'AH ! JE LE SAVAIS !', "ET ÇA, C'EST QUOI ?!"];
export const CHUCK_CAUGHT = ['Quoi ?', 'Je fais rien.', "C'est le vent."];
export const PERFECT_TEXT = 'PAS VU, PAS PRIS !';
export const ALERT_TEXT = 'IL VA CRAQUER !';

/** Bruits de Chuck, par acte. */
export const ONOMA: Record<Act, string[]> = {
  1: ['VROOOOOOOM !', 'VRRRRR…', 'PÉT ! PÉT !', 'VROUM VROUM'],
  2: ['FSHHHHH', 'CRÉPITE…', 'PSHHHT'],
  3: ['BOUM BOUM', 'TSS TSS', 'BOUM TCHAK'],
};
/** Jean-Mi, dos tourné, qui subit. */
export const JEANMI_GRUMBLE: Record<Act, string[]> = {
  1: ['Hmm ?', "C'est quoi ce bruit ?", 'Mon pastis tremble…'],
  2: ['KOF ! KOF !', 'Ça sent le brûlé…', 'KOF !'],
  3: ['MES VITRES !', 'MOINS FORT !', 'MÊME LE CHIEN DANSE !'],
};
/** Chuck, entre deux actes. */
export const CHUCK_NEXT: Record<2 | 3, string> = {
  2: 'Bon. Les merguez.',
  3: 'Un peu de musique.',
};

// ---------------------------------------------------------------- cinématiques
/** Le cri de Jean-Mi, sur deux lignes pour que les lettres soient énormes. */
export const YELL = ['MAAAAAUUUU', 'RIIIIIIIIICE !!!'];
export const YELL_AGAIN = ['MAAAAAUUUU', 'RIIIIICE !!!'];
export const CINE = {
  climb: 'HNNNGH !',
  creak: 'crr… crrr…',
  rip: 'CRRRRRRRAAAAAAC !',
  stuck: 'GNNNH !',
  chuck: 'Bah quoi ?',
  title: ['OPÉRATION BON VOISINAGE', 'SUCCÈS TOTAL'],
  sub: 'JEAN-MI A CRAQUÉ. LE SHORT AUSSI.',
  // victoire parfaite
  offer: 'Tu veux que je mette moins fort ?',
  answer: 'MAIS BIEN SÛR QUE…',
  perfectTitle: ['VICTOIRE PARFAITE'],
  perfectSub: 'AUCUN TROUBLE CONSTATÉ PAR CHUCK.',
  // le dossier Jean-Mi
  smug: 'Hé hé hé…',
  ploum: 'PLOUM !',
  noted: ["J'AI TOUT NOTÉ,", 'MAURICE !'],
  pages: '47 PAGES DE PLAINTE. 0 PREUVE RECEVABLE.',
  ah: 'Ah.',
  failTitle: ['MISSION NON VALIDÉE'],
  bustedSub: "LE VOISIN A ENCORE DE L'ÉNERGIE.",
  // la sieste de Jean-Mi
  sigh: 'Pfffff…',
  peace: 'ENFIN. LE CALME.',
  bon: 'Bon.',
  vroom: 'VROOOOOOOM !',
  calm: 'LE CALME AURA DURÉ 1,3 SECONDE.',
  timeoutSub: 'MISSION NON VALIDÉE. CHUCK CONTINUE SA JOURNÉE.',
} as const;

/** Panneau de résultat : première ligne en grand, les autres en dessous. */
export const ENDINGS: Record<Ending, string[]> = {
  victory: ['JEAN-MI A CRAQUÉ. LE SHORT AUSSI.', 'Chuck Maurice n\'a rien remarqué de particulier.'],
  busted: ['MISSION NON VALIDÉE', "Le voisin a encore de l'énergie. Et un dossier de 47 pages."],
  timeout: ['MISSION NON VALIDÉE', 'Jean-Mi a fini son pastis. Chuck continue sa journée.'],
};
export const PERFECT_ENDING = ['VICTOIRE PARFAITE', 'Aucun trouble constaté par Chuck.'];
