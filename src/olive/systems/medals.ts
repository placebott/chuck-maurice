import { STORM, type EndingKind } from '../config/balance';
import type { OliveSave } from '../save';
import type { ShotRecord } from './mission';

export interface MissionSummary {
  kind: EndingKind;
  shots: readonly ShotRecord[];
  score: number;
}

export interface Medal {
  id: string;
  name: string;
  desc: string;
  earned: (save: OliveSave, mission: MissionSummary) => boolean;
}

const hits = (m: MissionSummary) => m.shots.filter((s) => s.fate === 'scored');

export const MEDALS: Medal[] = [
  {
    id: 'sniper',
    name: "SNIPER DE L'APÉRO",
    desc: 'Réussir trois tirs directs dans la même mission.',
    earned: (_s, m) => hits(m).filter((s) => s.direct).length >= 3,
  },
  {
    id: 'engineer',
    name: 'INGÉNIEUR EN OLIVES',
    desc: 'Réussir un tir après au moins deux rebonds.',
    earned: (_s, m) => hits(m).some((s) => s.bounces >= 2),
  },
  {
    id: 'artillery',
    name: "L'ARTILLERIE FRANÇAISE",
    desc: 'Gagner avec le cinquième et dernier projectile.',
    earned: (_s, m) => m.kind === 'victory' && m.shots.length === STORM.shots,
  },
  {
    id: 'diplomatic',
    name: 'INCIDENT DIPLOMATIQUE',
    desc: 'Envoyer une olive sur le crâne de Jean-Mi.',
    earned: (_s, m) => m.kind === 'diplomatic',
  },
];

/** Renvoie les médailles nouvellement gagnées et les ajoute à la sauvegarde. */
export function awardMedals(save: OliveSave, mission: MissionSummary): Medal[] {
  const fresh = MEDALS.filter((m) => !save.medals.includes(m.id) && m.earned(save, mission));
  save.medals.push(...fresh.map((m) => m.id));
  return fresh;
}
