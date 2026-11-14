import { SCORE, type Ending } from '../config/balance';

export interface Outcome {
  kind: Ending;
  rage: number;
  timeLeft: number;
  strikes: number;
  perfects: number;
}

export interface ScoreLine {
  label: string;
  points: number;
}

/** Détail du score, ligne par ligne. */
export function scoreLines(o: Outcome): ScoreLine[] {
  const lines: ScoreLine[] = [];
  if (o.kind === 'victory') {
    lines.push({ label: 'MISSION TERMINÉE', points: SCORE.mission });
    const seconds = Math.floor(o.timeLeft);
    if (seconds > 0) lines.push({ label: `${seconds} S RESTANTES`, points: seconds * SCORE.perSecond });
    if (o.strikes === 0) lines.push({ label: 'AUCUN FLAGRANT DÉLIT', points: SCORE.clean });
  } else {
    lines.push({ label: `COLÈRE ${Math.floor(o.rage)} %`, points: Math.floor(o.rage) * SCORE.perRage });
  }
  if (o.perfects > 0) lines.push({ label: `TIMING PARFAIT ×${o.perfects}`, points: o.perfects * SCORE.perfect });
  return lines;
}

export const totalScore = (o: Outcome): number => scoreLines(o).reduce((sum, l) => sum + l.points, 0);
