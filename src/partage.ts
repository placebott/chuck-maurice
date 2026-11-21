/**
 * Partage sur les réseaux : de simples liens vers les pages de partage officielles de Facebook, X et
 * WhatsApp. Aucun script de ces réseaux n'est chargé sur le site (ni pisteur, ni cookie).
 *
 * Facebook n'accepte que l'adresse : le texte et l'image viennent des balises de la page (voir le
 * plugin « seo » de vite.config.ts). X et WhatsApp reprennent le texte du joueur.
 */
import { partage, type Reseau, type Sujet } from './analytics';
import './styles/partage.css';

export interface Message {
  title: string;
  text: string;
}

const RESEAUX: { id: Exclude<Reseau, 'menu' | 'lien'>; nom: string; lien: (texte: string, url: string) => string }[] = [
  { id: 'facebook', nom: 'Facebook', lien: (_t, u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: 'x', nom: 'X', lien: (t, u) => `https://x.com/intent/post?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { id: 'whatsapp', nom: 'WhatsApp', lien: (t, u) => `https://wa.me/?text=${encodeURIComponent(`${t} ${u}`)}` },
];

/** Rangée de boutons : Facebook, X, WhatsApp, et « Copier le lien » si demandé. */
export function rangeeReseaux(sujet: Sujet, message: () => Message | null, options: { copier?: boolean; classe?: string } = {}): HTMLElement {
  const rangee = document.createElement('div');
  rangee.className = `reseaux ${options.classe ?? ''}`.trim();
  rangee.setAttribute('role', 'group');
  rangee.setAttribute('aria-label', 'Partager sur les réseaux');
  for (const r of RESEAUX) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `reseau reseau-${r.id}`;
    b.textContent = r.nom;
    b.setAttribute('aria-label', `Partager sur ${r.nom}`);
    b.addEventListener('click', () => {
      const m = message();
      if (!m) return;
      window.open(r.lien(m.text, partage(sujet, r.id)), '_blank', 'noopener,noreferrer');
    });
    rangee.append(b);
  }
  if (options.copier) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reseau reseau-lien';
    b.textContent = 'Copier le lien';
    b.addEventListener('click', () => {
      const m = message();
      if (!m) return;
      const url = partage(sujet, 'lien');
      void navigator.clipboard?.writeText(url).then(() => {
        b.textContent = 'Copié !';
        setTimeout(() => (b.textContent = 'Copier le lien'), 1800);
      }).catch(() => window.prompt('Adresse à copier :', url));
    });
    rangee.append(b);
  }
  return rangee;
}

/** Écran de résultat d'une mission : les réseaux sous les boutons, à côté de PARTAGER. */
export function monterReseaux(boutonPartager: HTMLElement, sujet: Sujet, message: () => Message | null): void {
  const actions = boutonPartager.parentElement;
  if (!actions) return;
  actions.after(rangeeReseaux(sujet, message, { classe: 'reseaux-mission' }));
}

/**
 * Pages sans jeu (accueil, courrier) : tout élément `data-partage="<sujet>"` reçoit sa rangée.
 * Le texte partagé est dans `data-texte`, le titre dans `data-titre`.
 */
for (const hote of document.querySelectorAll<HTMLElement>('[data-partage]')) {
  const sujet = hote.dataset.partage as Sujet;
  const message = (): Message => ({ title: hote.dataset.titre ?? document.title, text: hote.dataset.texte ?? document.title });
  hote.append(rangeeReseaux(sujet, message, { copier: true, classe: 'reseaux-page' }));
  if (navigator.share) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reseau reseau-menu';
    b.textContent = 'Autre…';
    b.addEventListener('click', () => {
      const m = message();
      void navigator.share({ title: m.title, text: m.text, url: partage(sujet, 'menu') }).catch(() => undefined);
    });
    hote.querySelector('.reseaux')?.append(b);
  }
}
