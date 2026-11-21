/**
 * Le Courrier des fans (courrier.html) : livre d'or sans compte.
 *
 * Les lettres sont gardées dans le projet Supabase « chuck-maurice » ; tout passe par la fonction
 * `courrier` (supabase/functions/courrier/index.ts), qui fait le tri anti-robots. Ici : l'affichage,
 * le formulaire et les réponses de Chuck.
 *
 * Gardien du courrier : ouvrir la page avec `?cle=<clé du gardien>` fait apparaître « Cacher » sous
 * chaque lettre. La clé quitte aussitôt l'adresse (elle reste dans l'onglet), pour ne pas partir
 * dans un partage.
 */
import { lettrePostee } from './analytics';
import './partage';

export const GUICHET = 'https://vyylxdcqbxyhqusuwshf.supabase.co/functions/v1/courrier';

interface Lettre {
  id: number;
  pseudo: string;
  message: string;
  mission: string | null;
  date: string;
  masque?: boolean;
}

/* =====================================================================
   TEXTES — tout le délire est ici, à modifier librement.
   La réponse et le tampon d'une lettre dépendent de son numéro : ils ne
   changent donc jamais d'une visite à l'autre.
   ===================================================================== */
const REPONSES = [
  'Chuck a lu ta lettre. Il a hoché la tête. Une fois.',
  'Chuck a souri. Trois sismographes ont réagi.',
  'Chuck a rangé ta lettre dans sa poche de poitrine. Côté cœur. Côté cornichons.',
  'Chuck a relu ta lettre. C’est la première fois qu’il relit quelque chose.',
  'Chuck a montré ta lettre au bocal. Le bocal s’est ouvert tout seul.',
  'Chuck a dit « pas mal ». Le Ministère a décrété un jour férié.',
  'Chuck a lu ta lettre à voix haute. Jean-Mi a baissé sa haie de dix centimètres.',
  'Chuck a répondu d’un regard. Tu devrais le recevoir d’ici jeudi.',
  'Chuck a encadré ta lettre. Sans clou. Elle tient par respect.',
  'Chuck a versé une larme. Elle a rebouché un nid-de-poule.',
  'Chuck a tamponné ta lettre lui-même. Le tampon a demandé un autographe.',
  'Chuck a plié ta lettre en avion. Elle a atterri à Toulouse.',
  'Chuck n’a rien dit. Chez lui, c’est une standing ovation.',
  'Chuck a lu ta lettre en épluchant un saucisson. Il a raté une rondelle. Historique.',
  'Chuck a transmis ta lettre au boxer. Le boxer l’a mangée. C’est sa façon d’archiver.',
  'Chuck a levé un sourcil. Le gauche. Celui des grandes occasions.',
  'Chuck t’a ajouté à sa liste. La bonne. Elle est très courte.',
  'Chuck a trinqué à ta santé. Avec le jus du bocal.',
];

const TAMPONS: { texte: string; couleur: string }[] = [
  { texte: 'Lu et approuvé', couleur: '#2e6b0c' },
  { texte: 'Transmis à Chuck', couleur: '#c01f15' },
  { texte: 'Classé condiment-défense', couleur: '#2f5fd0' },
  { texte: 'Vu par le boxer', couleur: '#8a4b0f' },
  { texte: 'Certifié sans robot', couleur: '#2e6b0c' },
  { texte: 'Priorité apéro', couleur: '#c01f15' },
  { texte: 'Contrôlé par Jean-Mi (à regret)', couleur: '#5b3a8c' },
  { texte: 'Archivé dans le bocal', couleur: '#2f5fd0' },
];

const MISSIONS: Record<string, string> = {
  cornichon: '🥒 Opération Cornichon',
  saucissonator: '🔪 Saucissonator 3000',
  'olive-storm': '🫒 Olive Storm',
  mauriiiiice: '📢 Mauriiiiice !!!',
  'grand-debarras': '📦 Le Grand Débarras',
  'boss-squadron': '🚀 Boss Squadron',
};

/** Ce que répond le guichet quand il refuse une lettre. */
const REFUS: Record<string, string> = {
  robot: 'Chuck a senti un robot. Chuck n’aime pas les robots.',
  'trop-vite': 'Trop rapide. Même Chuck met trois secondes à écrire une lettre.',
  jeton: 'Le guichet s’était assoupi. Réessayez, il est réveillé.',
  lien: 'Pas de liens. Chuck ne clique sur rien. Ce sont les liens qui cliquent sur Chuck.',
  pseudo: 'Il manque la signature. Chuck ne lit pas les lettres anonymes. Il les sent.',
  message: 'Entre 2 et 280 caractères. Chuck a un bocal sur le feu.',
  debit: 'Trois lettres par heure, dix par jour. Au-delà, c’est le monopole de Jean-Mi.',
  doublon: 'Chuck a déjà lu exactement cette lettre. Il a une mémoire de bocal.',
  guichet: 'Trop de courrier d’un coup : le guichet reprend son souffle. Revenez dans une heure.',
  origine: 'Ce guichet ne reçoit que depuis chuckmaurice.com.',
  panne: 'Le facteur a glissé sur un cornichon. Réessayez dans un instant.',
};

const BULLES_ATTENTE = ['J’attends.', 'Prends ton temps. Moi j’en ai pas.', 'Écris gros, j’ai pas mes lunettes. J’en ai jamais eu besoin.', 'Pas de fautes. Jean-Mi les compte.'];

/* ============ À partir d'ici, plus rien à toucher ============ */
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const ui = {
  carte: $<HTMLFormElement>('carte'),
  message: $<HTMLTextAreaElement>('message'),
  pseudo: $<HTMLInputElement>('pseudo'),
  mission: $<HTMLSelectElement>('mission'),
  site: $<HTMLInputElement>('site'),
  reste: $('reste'),
  envoyer: $<HTMLButtonElement>('envoyer'),
  avis: $('avis'),
  compteur: $('compteur'),
  mur: $('mur'),
  vide: $('vide'),
  suite: $<HTMLButtonElement>('suite'),
  chuck: $<HTMLImageElement>('chuck'),
  bulle: $('bulle'),
};

// --- gardien : la clé passe de l'adresse à l'onglet
const params = new URLSearchParams(location.search);
if (params.has('cle')) {
  try { sessionStorage.setItem('cm_cle_gardien', params.get('cle') ?? ''); } catch { /* onglet privé */ }
  params.delete('cle');
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}
let cle = '';
try { cle = sessionStorage.getItem('cm_cle_gardien') ?? ''; } catch { /* onglet privé */ }

let jeton = '';
let jetonRecuA = 0;
let total = 0;
let plusAncienne = 0;
let gardien = false;

async function appel(method: 'GET' | 'POST', corps?: unknown, requete = ''): Promise<{ ok: boolean; raison?: string } & Record<string, unknown>> {
  try {
    const r = await fetch(GUICHET + requete, {
      method,
      headers: corps ? { 'content-type': 'application/json' } : undefined,
      body: corps ? JSON.stringify(corps) : undefined,
    });
    return await r.json();
  } catch {
    return { ok: false, raison: 'panne' };
  }
}

function quand(iso: string): string {
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 60 * 24) return `il y a ${Math.floor(min / 60)} h`;
  if (min < 60 * 24 * 7) return `il y a ${Math.floor(min / 1440)} j`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texte?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

/** Une lettre du mur. Tout le texte du visiteur passe par textContent : jamais de HTML. */
function carteLettre(l: Lettre, neuve = false): HTMLElement {
  const a = el('article', `lettre${neuve ? ' neuve' : ''}${l.masque ? ' cachee' : ''}`);
  a.style.setProperty('--r', `${(((l.id * 37) % 9) - 4) * 0.45}deg`);
  const tampon = TAMPONS[(l.id * 7) % TAMPONS.length];
  const t = el('span', 'tampon', tampon.texte);
  t.style.setProperty('--c', tampon.couleur);
  t.style.setProperty('--t', `${((l.id * 13) % 17) - 8}deg`);
  a.append(el('p', 'no', `Lettre n° ${String(l.id).padStart(5, '0')}`), t, el('p', 'texte', l.message));
  const signe = el('p', 'signe', l.pseudo);
  signe.append(el('span', '', ` — ${quand(l.date)}`));
  a.append(signe);
  if (l.mission && MISSIONS[l.mission]) a.append(el('span', 'mission-tag', MISSIONS[l.mission]));
  const rep = el('p', 'reponse');
  rep.append(el('b', '', 'Réponse du bureau de Chuck'), document.createTextNode(REPONSES[l.id % REPONSES.length]));
  a.append(rep);
  if (gardien) {
    const b = el('button', 'garde', l.masque ? 'Remettre' : 'Cacher');
    b.type = 'button';
    b.addEventListener('click', async () => {
      const cacher = !a.classList.contains('cachee');
      const r = await appel('POST', { action: cacher ? 'masquer' : 'montrer', id: l.id, cle });
      if (!r.ok) return;
      a.classList.toggle('cachee', cacher);
      b.textContent = cacher ? 'Remettre' : 'Cacher';
    });
    a.append(b);
  }
  return a;
}

function afficherCompteur(): void {
  ui.compteur.replaceChildren();
  if (total === 0) {
    ui.compteur.textContent = 'Aucune lettre pour l’instant. Chuck fait semblant de ne pas regarder la boîte.';
    return;
  }
  ui.compteur.append(el('b', '', String(total)), document.createTextNode(total === 1
    ? ' lettre reçue. Chuck l’a lue quatre fois. Il nie.'
    : ' lettres reçues. Chuck les a toutes lues. En même temps.'));
}

async function charger(suite = false): Promise<void> {
  const q = new URLSearchParams({ limite: '24' });
  if (suite && plusAncienne) q.set('avant', String(plusAncienne));
  if (cle) q.set('cle', cle);
  const r = await appel('GET', undefined, `?${q}`);
  if (!r.ok) {
    if (!suite) ui.compteur.textContent = REFUS.panne;
    return;
  }
  jeton = String(r.jeton ?? '');
  jetonRecuA = Date.now();
  gardien = r.gardien === true;
  total = Number(r.total) || 0;
  const lettres = (r.lettres as Lettre[]) ?? [];
  for (const l of lettres) ui.mur.append(carteLettre(l));
  if (lettres.length) plusAncienne = lettres[lettres.length - 1].id;
  ui.suite.hidden = r.suite !== true;
  ui.vide.hidden = ui.mur.childElementCount > 0;
  afficherCompteur();
}

function avis(texte: string, genre: 'oui' | 'non' | '' = ''): void {
  ui.avis.textContent = texte;
  ui.avis.className = `avis ${genre}`.trim();
}

function chuck(pose: 'cool' | 'victory' | 'despair', bulle: string): void {
  ui.chuck.src = `./assets/sprites/chuck_${pose}.png`;
  ui.bulle.textContent = bulle;
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poster(): Promise<void> {
  const message = ui.message.value.trim();
  const pseudo = ui.pseudo.value.trim();
  if (message.length < 2) { avis(REFUS.message, 'non'); ui.message.focus(); return; }
  if (!pseudo) { avis(REFUS.pseudo, 'non'); ui.pseudo.focus(); return; }

  ui.envoyer.disabled = true;
  avis('Le facteur enfile ses bottes…');
  const corps = () => ({ pseudo, message, mission: ui.mission.value || null, site: ui.site.value, jeton });
  // le guichet veut un jeton vieux d'au moins 3 s : on patiente plutôt que d'essuyer un refus
  const manque = 3200 - (Date.now() - jetonRecuA);
  if (jeton && manque > 0) await attendre(manque);
  let r = await appel('POST', corps());
  if (!r.ok && (r.raison === 'jeton' || r.raison === 'trop-vite')) {
    // jeton périmé (page restée ouverte) : on en reprend un et on retente une fois
    const neuf = await appel('GET', undefined, '?limite=1');
    if (neuf.ok) {
      jeton = String(neuf.jeton ?? '');
      await attendre(3200);
      r = await appel('POST', corps());
    }
  }
  ui.envoyer.disabled = false;

  if (!r.ok) {
    avis(REFUS[r.raison ?? ''] ?? REFUS.panne, 'non');
    chuck('despair', r.raison === 'robot' ? 'Bip bip toi-même.' : 'Recommence. Calmement.');
    return;
  }
  const lettre = r.lettre as Lettre;
  lettrePostee(lettre.mission);
  try { localStorage.setItem('cm_pseudo', pseudo); } catch { /* tant pis */ }
  total++;
  afficherCompteur();
  avis('Lettre postée. Chuck l’a déjà lue. Il était derrière vous.', 'oui');
  chuck('victory', 'Reçu. Touché. Pas montré.');
  ui.vide.hidden = true;

  const deposer = () => {
    ui.mur.prepend(carteLettre(lettre, !calm));
    ui.message.value = '';
    compter();
    ui.carte.classList.remove('partie');
    if (!calm) {
      ui.carte.classList.add('revient');
      setTimeout(() => ui.carte.classList.remove('revient'), 600);
    }
    ui.mur.firstElementChild?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
  };
  if (calm) deposer();
  else {
    ui.carte.classList.add('partie');
    setTimeout(deposer, 850);
  }
}

function compter(): void {
  const reste = 280 - [...ui.message.value].length;
  ui.reste.textContent = String(reste);
  ui.reste.classList.toggle('limite', reste <= 30);
}

ui.carte.addEventListener('submit', (e) => { e.preventDefault(); void poster(); });
ui.message.addEventListener('input', compter);
ui.suite.addEventListener('click', () => void charger(true));
try { ui.pseudo.value = localStorage.getItem('cm_pseudo') ?? ''; } catch { /* tant pis */ }

// Chuck s'impatiente gentiment tant que rien n'est écrit
let humeur = 0;
setInterval(() => {
  if (ui.message.value || ui.chuck.src.includes('victory')) return;
  humeur = (humeur + 1) % BULLES_ATTENTE.length;
  chuck('cool', BULLES_ATTENTE[humeur]);
}, 7000);

compter();
void charger();
