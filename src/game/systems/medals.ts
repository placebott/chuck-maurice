import type { Outcome } from '../config/balance';
import type { SaveData } from '../../storage/save';

export interface RoundSummary {
  outcome: Outcome;
  timeLeft: number;
  elapsed: number;
  resists: number;
  score: number;
}

export interface Medal {
  id: string;
  name: string;
  desc: string;
  earned: (save: SaveData, round: RoundSummary) => boolean;
}

const won = (r: RoundSummary) => r.outcome === 'perfect' || r.outcome === 'chaos';

export const MEDALS: Medal[] = [
  {
    id: 'first-blood',
    name: 'PREMIER SANG (DE CORNICHON)',
    desc: 'Ouvrir un bocal. Un seul. Bravo.',
    earned: (_s, r) => won(r),
  },
  {
    id: 'surgeon',
    name: 'CHIRURGIEN DU COUVERCLE',
    desc: 'Victoire parfaite du premier coup.',
    earned: (_s, r) => r.outcome === 'perfect' && r.resists === 0,
  },
  {
    id: 'lightning',
    name: 'FOUDRE DE GUERRE',
    desc: 'Victoire en moins de 5 secondes.',
    earned: (_s, r) => won(r) && r.elapsed < 5,
  },
  {
    id: 'clutch',
    name: 'IN EXTREMIS',
    desc: 'Victoire avec moins de 2 secondes au chrono.',
    earned: (_s, r) => won(r) && r.timeLeft < 2,
  },
  {
    id: 'stubborn',
    name: 'TÊTU COMME UN BOCAL',
    desc: '5 tentatives ratées dans la même partie.',
    earned: (_s, r) => r.resists >= 5,
  },
  {
    id: 'demolition',
    name: 'MINISTRE DE LA DÉMOLITION',
    desc: 'Détruire 3 cuisines.',
    earned: (s) => s.explosions >= 3,
  },
  {
    id: 'legion',
    name: "LÉGION D'HONNEUR DU CONDIMENT",
    desc: '5 victoires parfaites.',
    earned: (s) => s.perfect >= 5,
  },
  {
    id: 'veteran',
    name: 'VÉTÉRAN DU VINAIGRE',
    desc: 'Jouer 10 parties.',
    earned: (s) => s.plays >= 10,
  },
];

/** Renvoie les médailles nouvellement gagnées et les ajoute à la sauvegarde. */
export function awardMedals(save: SaveData, round: RoundSummary): Medal[] {
  const fresh = MEDALS.filter((m) => !save.medals.includes(m.id) && m.earned(save, round));
  save.medals.push(...fresh.map((m) => m.id));
  return fresh;
}
