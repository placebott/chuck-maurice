# Rapport de conformité : prototype Embarquement face à la vidéo de référence

But : distinguer ce qui reproduit fidèlement une **mécanique** observée de ce qui reste une approximation ou une hypothèse. Observations détaillées : [level43-observations.md](level43-observations.md).

**Conclusion d'abord.** Le prototype n'est **pas** un clone du niveau 43 : ce niveau (plateau, pièces, positions, compteurs, files) n'est pas reproduit, par choix de périmètre, et un niveau original le remplace. Côté **mécaniques**, les règles observées sans ambiguïté sont conformes. Deux règles restent non vérifiées (blocage par une autre couleur, collecte multiple), et elles sont réglables.

Statuts : **Conforme** (identique à ce qui est observé) · **Approximatif** (même principe, détail différent ou non mesuré) · **Non vérifié** (la vidéo ne permet pas de trancher ; choix réglable) · **Non implémenté**.

## Mécaniques

| Élément | Observé dans la vidéo | Implémenté | Statut |
| --- | --- | --- | --- |
| Contact de collecte | La pièce doit recouvrir le personnage ; l'adjacence ne suffit pas (O1, O2) | H1 `overlap` par défaut | Conforme |
| Moment de la collecte | Pendant le glisser, dès le recouvrement (O3) | H2 `step` : à chaque case franchie, et au lâcher | Conforme |
| Compteur de pièce | Nombre restant, −1 par personnage (O4) | `remaining` affiché dans le coin bas-droit, mis à jour à l'arrivée de chaque personnage | Conforme |
| Capacité indépendante de la taille | 6 sur une pièce de 4 cases (O5) | `capacity` par pièce dans le JSON | Conforme |
| Pièce pleine | Disparaît, cases libérées (O6) | H6 `remove` | Conforme |
| Déplacement | Libre dans les deux axes, sur la grille (O7, O8) | H8 `free`, case par case, sans traversée | Conforme |
| Fluidité | Mouvement continu, arrêt aligné sur la grille | Suit le doigt dans sa case, se cale sur la grille au lâcher | Approximatif |
| Collisions entre pièces | Jamais de chevauchement (P3) | Interdit par le moteur, testé sur des milliers de gestes | Conforme |
| Personnage d'une autre couleur | Jamais vu sous une pièce ; jamais vu bloquer (U1) | H5 `other-colors` (bloquant), réglable | Non vérifié |
| Plusieurs personnages recouverts d'un coup | Non filmé (U2) | H3 `all`, réglable | Non vérifié |
| Distributeur : déclenchement | Pièce de la couleur de tête sur l'entrée (O10) | Entrée recouverte + couleur de tête | Conforme |
| Distributeur : débit | Un par un, tant que la tête correspond (O10) | H9 `while-matching`, animé un par un (0,38 s) | Conforme |
| Distributeur : affichage | Tête de file + nombre restant (O9) | Cabine hors grille, tête + nombre | Conforme |
| Distributeur : places insuffisantes | Non filmé (U6) | S'arrête aux places libres | Non vérifié |
| Victoire | Dernière pièce disparue, distributeurs vides (O11) | H7 `both` | Conforme |
| Écran de victoire | « Well done », étoiles, confettis, monnaie | « Niveau réussi ! », temps restant, coups, confettis | Approximatif |
| Chronomètre : affichage | mm:ss, décompte (O12) | mm:ss arrondi à la seconde supérieure | Conforme |
| Chronomètre : départ | Probablement au premier déplacement (P1) | H10 `first-move`, réglable | Approximatif |
| Défaite | Non filmée (U5) | « Temps écoulé » + Recommencer à 00:00 | Non vérifié |
| Pause | Bouton présent, effet non filmé | Arrête temps et gestes ; Reprendre / Recommencer | Approximatif |
| Recommencer | Bouton présent | Réinitialise pièces, personnages, files et chronomètre | Approximatif |
| Bonus (3 boutons du bas) | Présents | Absents (hors périmètre) | Non implémenté |
| Rotation des pièces | Jamais vue | Absente | Conforme |
| Graphismes | Assets propriétaires | Formes et personnages dessinés en code | Non implémenté (volontaire) |

## Niveau

| Élément | Observé dans la vidéo | Implémenté | Statut |
| --- | --- | --- | --- |
| Plateau initial du niveau 43 | 7 × 8, 8 pièces, 20 personnages, 2 distributeurs | Niveau original *Heure de pointe* : 7 × 8, 7 pièces, 16 personnages, 2 distributeurs latéraux (4 et 3 personnages) | Non implémenté (choix de périmètre) |
| Formes, orientations, positions | Relevées dans `level43_seed.json` | Non reprises | Non implémenté (choix de périmètre) |
| Compteurs du niveau 43 | Lisibles en partie | Non repris | Non implémenté (choix de périmètre) |
| Files des distributeurs du niveau 43 | En partie déductibles des compteurs | Non reprises | Non implémenté (choix de périmètre) |
| Numéro et durée | 43, 02:05 | 1, 03:00 (donnés par le JSON du niveau) | Non implémenté (choix de périmètre) |
| Format de niveau | — | JSON : grille, formes, couleurs, capacités, personnages, distributeurs, durée, règles | Conforme aux exigences |

## Vérification de faisabilité

- Le solveur du projet (`src/embarquement/engine/solver.ts`) trouve une solution en 25 coups au niveau *Heure de pointe* sous les règles par défaut. Il en trouve aussi sous chaque variante des hypothèses incertaines : personnages non bloquants, collecte au lâcher, contact par un côté, un seul personnage par passage au distributeur.
- Chaque solution est **rejouée avec les vrais gestes** du moteur (`grab`, `dragTo` case par case, `release`) dans les tests unitaires.
- Le test de bout en bout la rejoue **à la souris dans Chrome** jusqu'à l'écran « Niveau réussi ! ».
