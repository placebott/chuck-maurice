# Observations de la vidéo de référence (Drop Away: Color Puzzle, niveau 43)

Source : la vidéo `level43_original.mp4` fournie (480 × 360, 30 i/s, 114,7 s), ses captures et `level43_seed.json`. Analyse faite image par image, à 1 s d'intervalle sur toute la partie et à 0,1 s autour des interactions clés. Les planches ont été extraites avec AVFoundation (un petit outil Swift), faute de ffmpeg sur la machine.

**Périmètre.** Ces notes ne servent qu'à établir les **mécaniques** du jeu. Le prototype ne reproduit pas le niveau 43 lui-même (plateau, pièces, positions, compteurs, files des distributeurs, numéro, durée) : recréer un niveau précis d'un jeu existant est hors du périmètre retenu. Le prototype livre à la place un niveau original, *Heure de pointe*, construit avec les mêmes mécaniques. Les données propres au niveau 43 ne sont donc pas retranscrites ici.

Vocabulaire : « pièce » = bloc coloré mobile ; « personnage » = petit bonhomme coloré ; « distributeur » = file de personnages hors de la grille ; « entrée » = case de la grille au pied d'un distributeur.

## Observations vérifiées

Chaque point a été vu plusieurs fois, sans ambiguïté.

| # | Observation | Où la voir |
| --- | --- | --- |
| O1 | Une pièce collecte un personnage de sa couleur quand elle **recouvre** sa case : le personnage disparaît dans la pièce avec une éclaboussure de sa couleur. | Barre rouge à t ≈ 1,2 s ; L vert foncé à t ≈ 2,2 s ; carré rose à t ≈ 9,5 s |
| O2 | Être **voisin** de sa pièce ne suffit pas, même par un côté : des personnages restent plusieurs secondes contre leur pièce sans être pris, puis le sont quand la pièce glisse dessous. | Personnage rose au-dessus du carré rose (0 → 9,5 s) ; personnage bleu dans le creux du L bleu (0 → 7 s) ; personnage jaune contre le L jaune (13 → 47 s) |
| O3 | La collecte a lieu **pendant le glisser** : l'éclaboussure apparaît alors que la pièce est encore tenue (contour en surbrillance), et la pièce poursuit ensuite son trajet. | Barre orange, t = 26,9 → 27,3 s ; barre rouge, t = 1,2 → 1,5 s |
| O4 | Chaque pièce affiche un **compteur** dans un coin ; il baisse d'une unité par personnage embarqué. | Barre rouge 3 → 2 à t ≈ 1,2 s ; L vert foncé 3 → 2 à t ≈ 2,2 s |
| O5 | Le compteur **ne suit pas le nombre de cases** : une pièce de 4 cases démarre à 6. | Capture initiale |
| O6 | À zéro, la pièce **disparaît** et ses cases redeviennent libres. | L jaune, t ≈ 97 → 98 s ; T bleu clair, t ≈ 106 → 107 s |
| O7 | Le déplacement est **libre** : une pièce change de ligne et de colonne dans un même glisser, et peut traverser presque toute la grille en une seconde. | L bleu, t = 73,9 → 74,2 s ; barre rouge, t = 104 → 105 s |
| O8 | Les pièces restent **alignées sur la grille** au repos ; pendant le glisser, une traînée claire marque les cases parcourues. | Toute la vidéo |
| O9 | Un distributeur montre le **personnage en tête** de file et un **nombre** qui baisse à chaque sortie : c'est le nombre de personnages restants. | Distributeur du haut : 6 → 5 → 4 (t = 89,2 → 89,6 s), puis → 3 → 2 (t ≈ 106 → 107 s), → 0 (t ≈ 111 s) |
| O10 | Un distributeur sert une pièce quand celle-ci **recouvre son entrée** et que la couleur de tête est la sienne. Les personnages descendent **un par un** (≈ 0,4 s chacun), tant que la tête garde cette couleur. Le suivant, d'une autre couleur, reste en tête. | Carré rose sous le distributeur du haut, t = 88,9 → 89,7 s : deux personnages roses descendent, un bleu clair prend la tête |
| O11 | La **victoire** arrive quand la dernière pièce disparaît, distributeurs vides : écran « Well done » avec étoiles et confettis. | t ≈ 111 → 113 s |
| O12 | Le chronomètre part de **02:05** et décompte en secondes. | Bandeau du haut |

## Règles probables

Cohérentes avec tout ce qui est visible, mais jamais isolées.

| # | Règle probable | Ce qui la soutient | Ce qui manque |
| --- | --- | --- | --- |
| P1 | Le chronomètre démarre au **premier déplacement**. | Il affiche 02:05 à t = 0 alors que la première pièce est déjà sélectionnée ; l'écart chrono/vidéo est d'environ 1 s. | La vidéo commence au premier geste : rien ne montre une attente sans geste. |
| P2 | Une pièce posée sur l'entrée est servie **dès qu'elle la recouvre**, comme pour les personnages de la grille. | La descente commence ≈ 0,2 s après la pose. | Impossible de dire si le doigt était déjà levé. |
| P3 | Les pièces ne se chevauchent jamais. | Aucune image ne montre deux pièces superposées. | Aucune collision « en force » n'a été filmée. |

## Points incertains

| # | Question | État |
| --- | --- | --- |
| U1 | Un personnage d'une **autre couleur** bloque-t-il une pièce ? | **Non vérifié.** Sur environ 200 images examinées, jamais une pièce n'apparaît sous un personnage d'une autre couleur. C'est compatible avec un blocage, ou avec un joueur qui les évite. Aucune séquence ne montre une pièce arrêtée net contre l'un d'eux. |
| U2 | Une pièce qui recouvre **deux** personnages de sa couleur d'un coup les prend-elle tous les deux ? | **Non vérifié** : jamais filmé. |
| U3 | Peut-on glisser une pièce **sous un distributeur** sans être servi (couleur de tête différente) ? | Probable : un L bleu passe sur l'entrée du haut (tête rose) sans effet, t ≈ 74,7 s. |
| U4 | Les **diagonales** comptent-elles ? | Sans objet si le contact se fait par recouvrement (O1, O2). |
| U5 | Que se passe-t-il à **00:00** ? | Non filmé : la défaite n'apparaît pas dans la vidéo. |
| U6 | Combien de personnages sort un distributeur quand la pièce a **moins de places** que la file de sa couleur ? | Non filmé ; le prototype s'arrête aux places libres. |
| U7 | Rôle exact des trois boutons du bas (bonus) et de la pause. | Hors périmètre : aucun bonus n'est repris. |

## Distributeurs : comportement retenu

- Un distributeur est une **file** de couleurs, extérieure à la grille, rattachée à une case d'entrée sur un bord.
- Il affiche la **tête** de file et le **nombre restant**.
- Quand une pièce **recouvre l'entrée** et que la tête est de sa couleur, les personnages sortent un par un tant que la tête garde cette couleur et que la pièce a de la place (O10). Une pièce d'une autre couleur sur l'entrée ne change rien (U3).
- La file n'avance que par ces sorties ; elle est **vide** en fin de partie gagnée (O11).

**Séquences.** Le prototype n'utilise pas les files du niveau 43 (voir *Périmètre*). Dans les données, chaque file est une liste de couleurs éditable (`feeders[].queue` du JSON de niveau), avec un drapeau `unverified` pour signaler une séquence supposée ou incomplète ; le mode DEBUG l'affiche.

## Déplacement et collecte : comportement retenu

- **Saisie** au doigt ou à la souris ; la pièce garde sa forme, son orientation et le point par lequel on la tient.
- **Glissement** case par case vers le doigt, sur la grille seulement, jamais à travers une pièce ni un personnage bloquant, même si le doigt saute plusieurs cases d'un coup. Au lâcher, la pièce reste sur sa dernière case valide.
- **Collecte** à chaque case franchie : tout personnage de la couleur de la pièce sous l'une de ses cases y tombe ; le compteur baisse ; à zéro, la pièce disparaît.
- **Distributeurs** traités dans le même passage, après les personnages de la grille.
- **Une seule collecte par personnage** : il quitte la grille ou la file à l'instant où il est pris ; repasser sur la même case ou la même entrée ne compte rien de plus.

## Différences entre le prototype et le jeu original

| Sujet | Jeu original | Prototype |
| --- | --- | --- |
| Niveau | Niveau 43 du jeu | Niveau original *Heure de pointe* (7 × 8, 7 pièces, 2 distributeurs latéraux) |
| Graphismes | Assets propriétaires | Formes vectorielles et personnages dessinés en code |
| Blocage par une autre couleur (U1) | Inconnu | Bloquant par défaut, réglable (H5) |
| Collecte multiple (U2) | Inconnue | Tous les personnages recouverts, dans la limite des places (H3), réglable |
| Défaite (U5) | Non filmée | Écran « Temps écoulé » avec Recommencer |
| Bonus, monnaie, étoiles | Présents | Absents (volontairement) |
| Rotation des pièces | Jamais vue | Absente |
| Animations | Riches (traînée, éclaboussure, confettis) | Courtes et simples (chute, onde, disparition, confettis) |
