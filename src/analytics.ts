import { inject } from '@vercel/analytics';

// Vercel Web Analytics (visiteurs, pages, pays, appareils).
// Importé par chaque page du site ; n'envoie rien en développement local.
inject();
