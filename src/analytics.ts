import { inject, track } from '@vercel/analytics';

// Vercel Web Analytics (visiteurs, pages, pays, appareils).
// Importé par chaque page du site ; n'envoie rien en développement local.
inject();

/* =====================================================================
   MESURE D'USAGE — une page ouverte n'est pas une partie jouée.

   Chaque jeu envoie trois événements, visibles dans Vercel > Analytics >
   Events, à filtrer par « jeu » :
     « Partie lancée »   rejouee = false pour la première partie de la visite
     « Partie terminée » resultat = dénouement de la partie
     « Partage »         clic sur PARTAGER ou sur un bouton de réseau (reseau = facebook, x, whatsapp, lien, menu)
     « Lettre postée »   une lettre déposée au Courrier des fans
   Deux propriétés au plus par événement, pour rester dans les limites de l'offre.
   ===================================================================== */
export type Jeu = 'cornichon' | 'saucissonator' | 'olive-storm' | 'mauriiiiice';
/** Ce qu'on partage : un jeu, l'accueil ou le Courrier des fans. */
export type Sujet = Jeu | 'accueil' | 'courrier';
export type Reseau = 'facebook' | 'x' | 'whatsapp' | 'lien' | 'menu';

let parties = 0;

export function partieLancee(jeu: Jeu): void {
  parties++;
  track('Partie lancée', { jeu, rejouee: parties > 1 });
}

export function partieTerminee(jeu: Jeu, resultat: string): void {
  track('Partie terminée', { jeu, resultat });
}

/**
 * Adresse à partager. L'étiquette utm_* fait apparaître dans Analytics les visiteurs
 * amenés par un partage (sinon comptés comme visites « directes »).
 */
export function partage(sujet: Sujet, reseau: Reseau = 'menu'): string {
  track('Partage', { jeu: sujet, reseau });
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('utm_source', 'partage');
  url.searchParams.set('utm_medium', reseau === 'menu' ? 'joueur' : reseau);
  url.searchParams.set('utm_campaign', sujet);
  return url.href;
}

export function lettrePostee(mission: string | null): void {
  track('Lettre postée', { mission: mission ?? 'aucune' });
}
