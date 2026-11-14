import { MEDAL_RULES } from '../config/balance';
import type { VoisinSave } from '../save';
import type { Outcome } from './score';

export interface Summary extends Outcome {
  /** La cinématique du short déchiré a été vue jusqu'au bout. */
  sawShort: boolean;
}

export interface Medal {
  id: string;
  name: string;
  desc: string;
  earned: (save: VoisinSave, s: Summary) => boolean;
}

export const MEDALS: Medal[] = [
  {
    id: 'unseen',
    name: 'PAS VU, PAS PRIS',
    desc: 'Gagner sans aucun flagrant délit.',
    earned: (_s, m) => m.kind === 'victory' && m.strikes === 0,
  },
  {
    id: 'king',
    name: 'ROI DU LOTISSEMENT',
    desc: `Terminer avec au moins ${MEDAL_RULES.kingSeconds} secondes restantes.`,
    earned: (_s, m) => m.kind === 'victory' && m.timeLeft >= MEDAL_RULES.kingSeconds,
  },
  {
    id: 'war',
    name: 'LA GUERRE DES VOISINS',
    desc: 'Faire atteindre 100 % de colère à Jean-Mi.',
    earned: (_s, m) => m.kind === 'victory',
  },
  {
    id: 'short',
    name: 'LE SHORT DE LA DISCORDE',
    desc: 'Voir intégralement la cinématique du short déchiré.',
    earned: (_s, m) => m.kind === 'victory' && m.sawShort,
  },
  {
    id: 'sunday',
    name: "C'EST DIMANCHE",
    desc: 'Terminer une partie avec un bonus de timing parfait.',
    earned: (_s, m) => m.perfects > 0,
  },
];

/** Renvoie les médailles nouvellement gagnées et les ajoute à la sauvegarde. */
export function awardMedals(save: VoisinSave, summary: Summary): Medal[] {
  const fresh = MEDALS.filter((m) => !save.medals.includes(m.id) && m.earned(save, summary));
  save.medals.push(...fresh.map((m) => m.id));
  return fresh;
}
