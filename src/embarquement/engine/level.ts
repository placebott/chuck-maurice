/**
 * Lecture et validation d'un niveau JSON.
 *
 * Le fichier n'est pas typé : tout est vérifié ici, et toutes les erreurs
 * sont rassemblées d'un coup pour corriger un niveau en une seule passe.
 */
import { checkPartialRules } from './rules';
import type { Cell, CharacterDef, FeederDef, Level, PieceDef, Rules, Side } from './types';

export class LevelError extends Error {
  constructor(readonly errors: string[], levelId = '?') {
    super(`Niveau « ${levelId} » invalide :\n- ${errors.join('\n- ')}`);
    this.name = 'LevelError';
  }
}

const MAX_SIDE = 20;

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const key = (x: number, y: number) => `${x},${y}`;

/** Convertit un dessin (`["##", "#."]`) en cases relatives, dans l'ordre de lecture. */
export function shapeCells(shape: readonly string[]): Cell[] {
  const cells: Cell[] = [];
  shape.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') cells.push({ x, y });
  });
  return cells;
}

/** Valide un niveau JSON et le normalise. Lève une LevelError listant tous les problèmes. */
export function parseLevel(raw: unknown): Level {
  const errors: string[] = [];
  if (!isObj(raw)) throw new LevelError(['le niveau doit être un objet JSON']);

  const id = typeof raw.id === 'string' && raw.id ? raw.id : '?';
  if (id === '?') errors.push('« id » manquant');
  const name = typeof raw.name === 'string' ? raw.name : id;
  if (raw.number !== undefined && !(isInt(raw.number) && raw.number >= 1)) errors.push('« number » : entier ≥ 1 attendu');
  const timerOk = raw.timerSeconds === undefined || raw.timerSeconds === null
    || (typeof raw.timerSeconds === 'number' && raw.timerSeconds > 0 && Number.isFinite(raw.timerSeconds));
  if (!timerOk) errors.push('« timerSeconds » : nombre de secondes > 0 attendu');

  const width = raw.width;
  const height = raw.height;
  const sizeOk = isInt(width) && isInt(height) && width >= 1 && height >= 1 && width <= MAX_SIDE && height <= MAX_SIDE;
  if (!sizeOk) errors.push(`« width » et « height » : entiers de 1 à ${MAX_SIDE} attendus`);
  const inside = (x: number, y: number) => sizeOk && x >= 0 && y >= 0 && x < (width as number) && y < (height as number);

  const colors: string[] = [];
  if (!Array.isArray(raw.colors) || raw.colors.length === 0) errors.push('« colors » : liste non vide attendue');
  else {
    for (const c of raw.colors) {
      if (typeof c !== 'string' || !c) errors.push(`« colors » : couleur invalide ${JSON.stringify(c)}`);
      else if (colors.includes(c)) errors.push(`« colors » : « ${c} » en double`);
      else colors.push(c);
    }
  }

  /** Case → ce qui l'occupe au départ, pour repérer les chevauchements. */
  const occupied = new Map<string, string>();

  const pieces: PieceDef[] = [];
  if (!Array.isArray(raw.pieces)) errors.push('« pieces » : liste attendue');
  else {
    raw.pieces.forEach((p: unknown, i: number) => {
      const where = `pièce n° ${i + 1}`;
      if (!isObj(p)) return void errors.push(`${where} : objet attendu`);
      const pid = typeof p.id === 'string' && p.id ? p.id : '';
      const label = pid ? `pièce « ${pid} »` : where;
      if (!pid) errors.push(`${where} : « id » manquant`);
      else if (pieces.some((q) => q.id === pid)) errors.push(`${label} : identifiant en double`);
      if (typeof p.color !== 'string' || !colors.includes(p.color)) {
        errors.push(`${label} : couleur ${JSON.stringify(p.color)} absente de « colors »`);
      }
      if (!isInt(p.x) || !isInt(p.y)) errors.push(`${label} : « x » et « y » entiers attendus`);
      const shapeOk = Array.isArray(p.shape) && p.shape.length > 0
        && p.shape.every((row: unknown) => typeof row === 'string' && /^[#.]+$/.test(row));
      if (!shapeOk) errors.push(`${label} : « shape » doit être une liste de lignes faites de « # » et « . »`);
      const cells = shapeOk ? shapeCells(p.shape as string[]) : [];
      if (shapeOk && cells.length === 0) errors.push(`${label} : la forme ne contient aucune case « # »`);
      if (shapeOk && cells.length > 0 && !isConnected(cells)) errors.push(`${label} : la forme doit être d'un seul tenant`);
      if (p.capacity !== undefined && !(isInt(p.capacity) && p.capacity >= 1)) {
        errors.push(`${label} : « capacity » doit être un entier ≥ 1`);
      }
      if (isInt(p.x) && isInt(p.y)) {
        for (const c of cells) {
          const cx = p.x + c.x;
          const cy = p.y + c.y;
          if (!inside(cx, cy)) {
            if (sizeOk) errors.push(`${label} : la case (${cx}, ${cy}) sort de la grille`);
            continue;
          }
          const other = occupied.get(key(cx, cy));
          if (other) errors.push(`${label} : la case (${cx}, ${cy}) est déjà prise par ${other}`);
          else occupied.set(key(cx, cy), label);
        }
      }
      // l'ancre devient le coin haut-gauche des cases pleines : un dessin
      // commençant par une ligne ou une colonne vide reste ainsi positionné à l'identique
      const minX = cells.length ? Math.min(...cells.map((c) => c.x)) : 0;
      const minY = cells.length ? Math.min(...cells.map((c) => c.y)) : 0;
      pieces.push({
        id: pid,
        color: String(p.color),
        cells: cells.map((c) => ({ x: c.x - minX, y: c.y - minY })),
        x: (isInt(p.x) ? p.x : 0) + minX,
        y: (isInt(p.y) ? p.y : 0) + minY,
        capacity: isInt(p.capacity) ? p.capacity : undefined,
      });
    });
  }

  const characters: CharacterDef[] = [];
  if (!Array.isArray(raw.characters)) errors.push('« characters » : liste attendue');
  else {
    raw.characters.forEach((c: unknown, i: number) => {
      const where = `personnage n° ${i + 1}`;
      if (!isObj(c)) return void errors.push(`${where} : objet attendu`);
      const cid = typeof c.id === 'string' && c.id ? c.id : `c${i + 1}`;
      if (characters.some((d) => d.id === cid) || pieces.some((p) => p.id === cid)) {
        errors.push(`${where} : identifiant « ${cid} » en double`);
      }
      // « # » est réservé aux personnages des distributeurs (« haut#3 »)
      if (cid.includes('#')) errors.push(`${where} : « # » interdit dans l'identifiant « ${cid} »`);
      if (typeof c.color !== 'string' || !colors.includes(c.color)) {
        errors.push(`${where} : couleur ${JSON.stringify(c.color)} absente de « colors »`);
      }
      if (!isInt(c.x) || !isInt(c.y)) errors.push(`${where} : « x » et « y » entiers attendus`);
      else if (!inside(c.x, c.y)) {
        if (sizeOk) errors.push(`${where} : la case (${c.x}, ${c.y}) sort de la grille`);
      } else {
        const other = occupied.get(key(c.x, c.y));
        if (other) errors.push(`${where} : la case (${c.x}, ${c.y}) est déjà prise par ${other}`);
        else occupied.set(key(c.x, c.y), where);
      }
      characters.push({ id: cid, color: String(c.color), x: isInt(c.x) ? c.x : 0, y: isInt(c.y) ? c.y : 0 });
    });
  }

  const feeders: FeederDef[] = [];
  if (raw.feeders !== undefined && !Array.isArray(raw.feeders)) errors.push('« feeders » : liste attendue');
  else {
    (raw.feeders ?? []).forEach((f: unknown, i: number) => {
      const where = `distributeur n° ${i + 1}`;
      if (!isObj(f)) return void errors.push(`${where} : objet attendu`);
      const fid = typeof f.id === 'string' && f.id && !f.id.includes('#') ? f.id : '';
      if (!fid) errors.push(`${where} : « id » manquant ou contenant « # »`);
      else if (feeders.some((g) => g.id === fid)) errors.push(`${where} : identifiant « ${fid} » en double`);
      const side = SIDES.includes(f.side as Side) ? (f.side as Side) : null;
      if (!side) errors.push(`${where} : « side » doit valoir ${SIDES.map((x) => `« ${x} »`).join(', ')}`);
      const span = side === 'top' || side === 'bottom' ? width : height;
      const indexOk = isInt(f.index) && sizeOk && f.index >= 0 && f.index < (span as number);
      if (!indexOk) errors.push(`${where} : « index » hors de la grille`);
      const queue: string[] = [];
      if (!Array.isArray(f.queue)) errors.push(`${where} : « queue » : liste de couleurs attendue`);
      else {
        for (const c of f.queue) {
          if (typeof c !== 'string' || !colors.includes(c)) errors.push(`${where} : couleur ${JSON.stringify(c)} absente de « colors »`);
          else queue.push(c);
        }
      }
      if (f.unverified !== undefined && typeof f.unverified !== 'boolean') errors.push(`${where} : « unverified » doit être true ou false`);
      if (!side || !indexOk) return;
      const index = f.index as number;
      const entry = side === 'top' ? { x: index, y: 0 }
        : side === 'bottom' ? { x: index, y: (height as number) - 1 }
        : side === 'left' ? { x: 0, y: index }
        : { x: (width as number) - 1, y: index };
      if (feeders.some((g) => g.side === side && g.index === index)) errors.push(`${where} : un autre distributeur occupe déjà cette place`);
      feeders.push({ id: fid, side, index, entry, queue, unverified: f.unverified === true });
    });
  }

  errors.push(...checkPartialRules(raw.rules, '« rules »'));

  if (errors.length) throw new LevelError(errors, id);
  return {
    id,
    name,
    number: isInt(raw.number) ? raw.number : null,
    width: width as number,
    height: height as number,
    timerSeconds: typeof raw.timerSeconds === 'number' ? raw.timerSeconds : null,
    colors,
    pieces,
    characters,
    feeders,
    rules: (raw.rules ?? {}) as Partial<Rules>,
  };
}

const SIDES: readonly Side[] = ['top', 'bottom', 'left', 'right'];

function isConnected(cells: readonly Cell[]): boolean {
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const seen = new Set<string>([key(cells[0].x, cells[0].y)]);
  const stack = [cells[0]];
  while (stack.length) {
    const c = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(c.x + dx, c.y + dy);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        stack.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  }
  return seen.size === cells.length;
}

/** Capacité effective d'une pièce sous un jeu de règles. */
export function capacityOf(piece: PieceDef, rules: Rules): number {
  if (piece.capacity !== undefined) return piece.capacity;
  return rules.capacity === 'cells' ? piece.cells.length : rules.capacity;
}

/**
 * Avertissements de conception : le niveau se charge, mais il est peut-être
 * impossible à gagner sous ces règles. Ne prouve pas qu'il est faisable.
 */
export function levelWarnings(level: Level, rules: Rules): string[] {
  const warnings: string[] = [];
  for (const color of level.colors) {
    const people = level.characters.filter((c) => c.color === color).length
      + level.feeders.reduce((n, f) => n + f.queue.filter((c) => c === color).length, 0);
    const seats = level.pieces.filter((p) => p.color === color).reduce((n, p) => n + capacityOf(p, rules), 0);
    if (people > seats && rules.win !== 'all-removed') {
      warnings.push(`${color} : ${people} personnages pour ${seats} places, impossible de tous les embarquer.`);
    }
    if (seats > people && rules.win !== 'all-collected') {
      warnings.push(`${color} : ${seats} places pour ${people} personnages, des pièces ne seront jamais pleines.`);
    }
  }
  return warnings;
}
