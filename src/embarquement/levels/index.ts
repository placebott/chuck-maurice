/**
 * Niveaux disponibles. Ajouter un niveau : déposer son JSON dans ce dossier
 * et l'inscrire ici ; il s'ouvre avec `embarquement.html?level=<clé>`.
 * Le contenu est validé au chargement par engine/level.ts.
 */
import demo from './demo.json';
import heureDePointe from './heure-de-pointe.json';

export const LEVELS: Readonly<Record<string, unknown>> = { 'heure-de-pointe': heureDePointe, demo };

export const DEFAULT_LEVEL = 'heure-de-pointe';
