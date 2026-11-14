import { CUT, type EndingKind, type Quality } from '../config/balance';
import type { SaucissonSave } from '../save';

export interface MissionSummary {
  kind: EndingKind;
  timeLeft: number;
  elapsed: number;
  score: number;
  counts: Record<Quality, number>;
  bestStreak: number;
}

export interface Medal {
  id: string;
  name: string;
  desc: string;
  earned: (save: SaucissonSave, mission: MissionSummary) => boolean;
}

export const MEDALS: Medal[] = [
  {
    id: 'master',
    name: 'MAIN DE MAÎTRE CHARCUTIER',
    desc: 'Douze coupes parfaites dans la même mission.',
    earned: (_s, m) => m.counts.perfect >= CUT.slices,
  },
  {
    id: 'industrial',
    name: 'BOUCHERIE INDUSTRIELLE',
    desc: 'Cinq coupes trop épaisses dans la même mission.',
    earned: (_s, m) => m.counts.thick >= 5,
  },
  {
    id: 'cigarette',
    name: 'PAPIER À CIGARETTE',
    desc: 'Cinq coupes trop fines dans la même mission.',
    earned: (_s, m) => m.counts.thin >= 5,
  },
  {
    id: 'last-pig',
    name: 'LE DERNIER DES COCHONS',
    desc: "Victoire avec moins d'une seconde restante.",
    earned: (_s, m) => m.kind === 'victory' && m.timeLeft < 1,
  },
];

/** Renvoie les médailles nouvellement gagnées et les ajoute à la sauvegarde. */
export function awardMedals(save: SaucissonSave, mission: MissionSummary): Medal[] {
  const fresh = MEDALS.filter((m) => !save.medals.includes(m.id) && m.earned(save, mission));
  save.medals.push(...fresh.map((m) => m.id));
  return fresh;
}
