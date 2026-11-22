/**
 * Page « Vie privée et mentions légales » (confidentialite.html) :
 *   - bouton qui efface tout ce que le site a rangé dans le navigateur ;
 *   - formulaire confidentiel vers le guichet du Courrier des fans (prive: true) : jamais publié,
 *     lisible seulement par le gardien (courrier?cle=…).
 */
import './analytics';

const GUICHET = 'https://vyylxdcqbxyhqusuwshf.supabase.co/functions/v1/courrier';
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

// ------------------------------------------------------------------ effacer ses données

/** Toutes les clés du site dans le stockage du navigateur (voir l'article 1 de la page). */
const DU_SITE = (cle: string) => cle.startsWith('chuck-maurice:') || cle.startsWith('grand-debarras.') || cle.startsWith('cm_');

$('effacer').addEventListener('click', () => {
  const retour = $('effacer-retour');
  if (!confirm('Effacer records, médailles, progression et clés de vos lettres sur cet appareil ? C’est définitif.')) return;
  let n = 0;
  for (const zone of [localStorage, sessionStorage]) {
    try {
      for (const cle of Object.keys(zone).filter(DU_SITE)) { zone.removeItem(cle); n++; }
    } catch { /* stockage indisponible */ }
  }
  retour.className = 'retour oui';
  retour.textContent = n
    ? `${n} élément${n > 1 ? 's' : ''} effacé${n > 1 ? 's' : ''}. Chuck a tout oublié. Sauf votre visage.`
    : 'Rien à effacer : ce navigateur ne garde rien du site.';
});

// ------------------------------------------------------------------ message confidentiel

const REFUS: Record<string, string> = {
  robot: 'Message refusé par le contrôle anti-robots.',
  lien: 'Les liens ne passent pas : écrivez l’adresse en toutes lettres.',
  pseudo: 'Indiquez un nom ou un pseudo (24 caractères au plus).',
  message: 'Votre demande doit faire entre 2 et 1000 caractères.',
  debit: 'Trop de messages envoyés depuis votre connexion. Réessayez dans une heure.',
  doublon: 'Ce message exact a déjà été reçu.',
  guichet: 'Le guichet est saturé. Réessayez dans une heure.',
  panne: 'Le message n’a pas pu partir. Réessayez dans un instant.',
};

let jeton = '';
let jetonA = 0;
async function nouveauJeton(): Promise<void> {
  try {
    const r = await (await fetch(`${GUICHET}?limite=1`)).json();
    jeton = String(r.jeton ?? '');
    jetonA = Date.now();
  } catch { /* on réessaiera à l'envoi */ }
}
void nouveauJeton();

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

$<HTMLFormElement>('prive').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bouton = $<HTMLButtonElement>('p-envoyer');
  const retour = $('p-retour');
  const pseudo = $<HTMLInputElement>('p-pseudo').value.trim();
  const message = $<HTMLTextAreaElement>('p-message').value.trim();
  const dire = (texte: string, ok: boolean) => { retour.textContent = texte; retour.className = `retour ${ok ? 'oui' : 'non'}`; };
  if (!pseudo) return dire(REFUS.pseudo, false);
  if (message.length < 2) return dire(REFUS.message, false);

  bouton.disabled = true;
  dire('Envoi…', true);
  if (!jeton) await nouveauJeton();
  const manque = 3200 - (Date.now() - jetonA);
  if (manque > 0) await attendre(manque);
  let r: { ok?: boolean; raison?: string } = {};
  try {
    r = await (await fetch(GUICHET, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prive: true, pseudo, message, site: $<HTMLInputElement>('p-site').value, jeton }),
    })).json();
  } catch {
    r = { ok: false, raison: 'panne' };
  }
  bouton.disabled = false;
  if (!r.ok) {
    if (r.raison === 'jeton' || r.raison === 'trop-vite') void nouveauJeton();
    return dire(REFUS[r.raison ?? ''] ?? REFUS.panne, false);
  }
  $<HTMLTextAreaElement>('p-message').value = '';
  dire('Message confidentiel transmis. Seul le Ministère le lira.', true);
});
