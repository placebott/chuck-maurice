/**
 * Filtre de grossièretés du Courrier des fans. Pur TypeScript (aucune API Deno) : testé avec Node
 * (`npm run test:courrier`) et importé par la fonction Edge.
 *
 * Deux niveaux :
 *   - GROS MOTS : remplacés par un condiment (« Jean-Mi est un cornichon »), la lettre passe ;
 *   - INTERDITS (insultes racistes, homophobes, haineuses) : la lettre est refusée.
 *
 * Résiste aux contournements courants : majuscules, accents, lettres répétées (« connnnard »),
 * chiffres à la place des lettres (« c0nn4rd »), lettres espacées (« p u t a i n »), lettres
 * cyrilliques qui ressemblent aux latines. Les mots sont comparés en entier (« con » ne touche pas
 * « concombre », « salope » ne touche pas « salopette »).
 */

/** Écriture d'une entrée : mot exact, ou racine suivie de « * » (tout mot qui commence ainsi). */
const GROS_MOTS = [
  // français
  'merd*', 'putain', 'putains', 'ptn', 'pute', 'putes', 'salope', 'salopes', 'salopard', 'salopards', 'salaud', 'salauds',
  'connar*', 'conass*', 'con', 'cons', 'conne', 'connes', 'encul*', 'enfoir*', 'chier', 'chie', 'chies', 'chiee', 'chiure',
  'couill*', 'bite', 'bites', 'teub', 'zob', 'nique', 'niquer', 'niques', 'nike ta', 'niker', 'foutre', 'batard', 'batards',
  'batarde', 'petasse', 'petasses', 'pouffias*', 'branleur', 'branleurs', 'branleuse', 'branlette', 'branlettes', 'branler', 'trouduc', 'fdp', 'ntm', 'tg', 'ta gueule', 'fils de pute',
  'tapette', 'mongol', 'mongols', 'mongolien', 'gogol', 'abruti de merde', 'schneck', 'chibre', 'pine', 'cul terreux',
  // anglais
  'fuck*', 'motherfuck*', 'shit', 'shits', 'shitty', 'bullshit', 'bitch*', 'asshole*', 'cunt*', 'dick', 'dicks', 'whore*',
  'slut*', 'bastard*', 'retard', 'retards', 'wanker*', 'twat*',
];

const INTERDITS = [
  // racisme, antisémitisme, homophobie, transphobie
  'negre', 'negres', 'negresse', 'negro', 'negros', 'nigger*', 'nigga*', 'bougnoul*', 'bicot*', 'youpin*', 'youtre*',
  'chinetoqu*', 'bamboula', 'macaque de', 'sale arabe', 'sale arabes', 'sale noir', 'sale noire', 'sale noirs', 'sale juif',
  'sale juive', 'sale juifs', 'sale musulman', 'sale musulmane', 'sale chinois', 'sale gitan', 'sale gitans', 'sale rebeu',
  'sale renoi', 'sale blanc', 'sale blanche', 'sale pede', 'pede', 'pedes', 'pd', 'fiott*', 'gouine*', 'travelo*',
  'faggot*', 'fag', 'fags', 'kike*', 'chink*', 'spic', 'spics', 'heil hitler', 'sieg heil', 'mort aux juifs', 'mort aux arabes',
  // incitation
  'suicide toi', 'suicidez vous', 'va mourir', 'kill yourself', 'kys',
];

/** Les remplaçants, dans le ton du Ministère du Condiment. */
const CONDIMENTS = ['cornichon', 'saucisson', 'olive', 'bocal', 'pastis', 'camembert', 'radis', 'moutarde', 'cassoulet', 'tapenade'];

// ------------------------------------------------------------------ normalisation

const SOSIES: Record<string, string> = {
  // chiffres et symboles
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '€': 'e', '£': 'l', '!': 'i', '|': 'i',
  // cyrillique et grec qui ressemblent au latin
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k', 'м': 'm', 'т': 't', 'н': 'h', 'в': 'b', 'і': 'i',
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'υ': 'u',
};

/** « CôNNNNaRd » → « conard » : minuscules, sans accents, sosies remplacés, lettres répétées réduites. */
export function normaliser(mot: string): string {
  let s = mot.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  s = [...s].map((c) => SOSIES[c] ?? c).join('');
  s = s.replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss');
  s = s.replace(/[^a-z]/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

interface Entree { mots: string[]; racine: boolean }

function compiler(liste: string[]): Entree[] {
  return liste.map((e) => {
    const racine = e.endsWith('*');
    const mots = e.replace(/\*$/, '').split(' ').map(normaliser);
    return { mots, racine };
  });
}
const E_GROS = compiler(GROS_MOTS);
const E_INTERDITS = compiler(INTERDITS);

/** Mots qui commencent comme une racine mais qui sont innocents. */
const INNOCENTS = new Set(['salopete', 'salopetes', 'niquel', 'niquele', 'conse', 'branlebas', 'merdre', 'bitesize', 'dickens', 'sputnik', 'pinede', 'pinedes']);

// ------------------------------------------------------------------ découpe en mots

interface Mot { debut: number; fin: number; norm: string }

const LETTRE = /[\p{L}\p{N}@$€£|]/u;

/** Les mots du texte, avec leur position. Les lettres isolées et espacées sont recollées. */
function decouper(texte: string): Mot[] {
  const brut: Mot[] = [];
  const re = /[\p{L}\p{N}@$€£|!]+/gu;
  for (let m = re.exec(texte); m; m = re.exec(texte)) {
    // un « ! » final est de la ponctuation, pas un i
    let mot = m[0];
    while (mot.length > 1 && mot.endsWith('!')) mot = mot.slice(0, -1);
    if (mot === '!' || !LETTRE.test(mot)) continue;
    brut.push({ debut: m.index, fin: m.index + mot.length, norm: normaliser(mot) });
  }
  // recolle « p u t a i n », « p.u.t.e » : au moins 3 mots d'une lettre, séparés par 1 ou 2 caractères
  const mots: Mot[] = [];
  for (let i = 0; i < brut.length; i++) {
    let j = i;
    while (
      j + 1 < brut.length && brut[j].fin - brut[j].debut === 1 && brut[j + 1].fin - brut[j + 1].debut === 1
      && brut[j + 1].debut - brut[j].fin <= 2 && /^[\s.\-_*'’]*$/.test(texte.slice(brut[j].fin, brut[j + 1].debut))
    ) j++;
    if (j - i >= 2) {
      mots.push({ debut: brut[i].debut, fin: brut[j].fin, norm: normaliser(brut.slice(i, j + 1).map((m) => m.norm).join('')) });
      i = j;
    } else mots.push(brut[i]);
  }
  return mots;
}

function correspond(mot: string, cible: string, racine: boolean): boolean {
  if (INNOCENTS.has(mot)) return false;
  return racine ? mot.startsWith(cible) : mot === cible;
}

/** Positions [début, fin) des expressions trouvées. */
function chercher(mots: Mot[], entrees: Entree[]): { debut: number; fin: number }[] {
  const trouve: { debut: number; fin: number }[] = [];
  for (let i = 0; i < mots.length; i++) {
    for (const e of entrees) {
      if (i + e.mots.length > mots.length) continue;
      const ok = e.mots.every((cible, k) => correspond(mots[i + k].norm, cible, e.racine && k === e.mots.length - 1));
      if (ok) {
        trouve.push({ debut: mots[i].debut, fin: mots[i + e.mots.length - 1].fin });
        break;
      }
    }
  }
  return trouve;
}

export interface Verdict {
  /** true : la lettre contient une expression interdite et doit être refusée. */
  interdit: boolean;
  /** Le texte, gros mots remplacés par des condiments. */
  texte: string;
  /** Nombre de gros mots remplacés. */
  remplaces: number;
}

/** `graine` choisit les condiments : même texte, même graine → même résultat. */
export function filtrer(texte: string, graine = 0): Verdict {
  const mots = decouper(texte);
  if (chercher(mots, E_INTERDITS).length) return { interdit: true, texte, remplaces: 0 };
  const zones = chercher(mots, E_GROS);
  if (!zones.length) return { interdit: false, texte, remplaces: 0 };
  let sortie = '';
  let curseur = 0;
  let n = 0;
  for (const z of zones) {
    if (z.debut < curseur) continue;
    const original = texte.slice(z.debut, z.fin);
    let c = CONDIMENTS[(graine + n * 7) % CONDIMENTS.length];
    if (original === original.toUpperCase() && /\p{Lu}/u.test(original)) c = c.toUpperCase();
    else if (/^\p{Lu}/u.test(original)) c = c[0].toUpperCase() + c.slice(1);
    sortie += texte.slice(curseur, z.debut) + c;
    curseur = z.fin;
    n++;
  }
  return { interdit: false, texte: sortie + texte.slice(curseur), remplaces: n };
}
