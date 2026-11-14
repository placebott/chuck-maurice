# Chuck Maurice : Opération Cornichon 🥒

> BOSS 001 — LE BOCAL. Niveau de menace : NATIONAL.

Premier mini-jeu du projet **Chuck Maurice**, un univers de jeux d’arcade absurdes inspiré des années 1990. Chuck, héros d’action français des années 80 à la moustache impeccable, à la coupe mulet et aux muscles disproportionnés, doit accomplir une mission capitale : ouvrir un pot de cornichons.

## État du projet

Première version jouable d’**Opération Cornichon** : écran titre, briefing, partie de 20 secondes, quatre dénouements, score, statistiques, médailles et son. Voir « Stack et lancement » pour les commandes.

Reste à faire avant publication : essais sur de vrais téléphones, réglage de la difficulté par des joueurs, validation du son à l’oreille, crédits.

**Mission 002 — Saucissonator 3000** est jouable sur sa propre page (`saucissonator.html`), accessible depuis l’accueil. Voir « Mission 002 » plus bas.

**Mission 003 — Olive Storm** est jouable sur `olive-storm.html`. Voir « Mission 003 » plus bas.

**Mission 004 — MAURIIIIICE !!! (Opération Bon Voisinage)** est jouable sur `mauriiiiice.html`. Voir « Mission 004 » plus bas.

## Expérience visée

Une partie courte de **20 secondes**, drôle, nerveuse et immédiatement rejouable, sur ordinateur et smartphone. Une tâche banale est mise en scène comme un combat de fin de jeu : introduction militaire, bocal menaçant, réactions exagérées de Chuck et résultats spectaculaires.

### Boucle de jeu prévue

1. Démarrer avec « SAUVER LA FRANCE ».
2. Cliquer, toucher ou utiliser le clavier pour augmenter la puissance de Chuck.
3. La jauge redescend progressivement : doser l’effort et choisir le bon moment.
4. Déclencher une action distincte « OUVRIR CE FOUTU BOCAL ».
5. Découvrir le résultat puis « PRENDRE SA REVANCHE ».

| Puissance au moment de l’ouverture | Résultat prévu |
| --- | --- |
| Moins de 70 % | Échec : le bocal résiste |
| De 70 à 85 % inclus | Victoire parfaite |
| Plus de 85 % et jusqu’à 95 % inclus | Victoire chaotique |
| Plus de 95 % | Explosion immédiate du bocal, sans attendre l’ouverture, et catastrophe dans la cuisine |

Les intervalles ci-dessus sont continus pour éviter un cas indéfini entre 85 et 86 % ; avec une jauge entière, la victoire chaotique correspond à 86–95 %. À l’expiration des 20 secondes, une tentative non résolue se termine en défaite. La vitesse de charge, la décroissance, le score et les médailles seront réglés pendant le développement et les essais.

### Écrans et progression à développer

- Écran titre, introduction, scène de jeu et écrans de résultat.
- Jauge de puissance, chronomètre et deux actions clairement séparées.
- Animations de repos, d’effort, de victoire et de défaite de Chuck.
- Tremblements du bocal, confettis et effets de destruction.
- Messages humoristiques variables : « LA FRANCE EST SAUVÉE ! », « LE BOCAL A GAGNÉ. LA NATION EST SOUS LE CHOC. », « 18 DÉPARTEMENTS ONT ÉTÉ ÉVACUÉS. »
- Meilleur score personnel, victoires, défaites et médailles conservés avec `localStorage`.
- Effets rétro via Web Audio, activés après interaction, et bouton pour couper le son.

Aucun compte joueur ni backend n’est prévu. Les données de progression restent dans le navigateur et peuvent disparaître si son stockage est effacé.

## Direction artistique

- Pixel art arcade **16 bits**, ambiance 1993 et humour français absurde.
- Conserver le design validé de Chuck et de la cuisine.
- Résolution logique cible : **480 × 270**, avec agrandissement net sans lissage.
- Phaser pour les sprites, animations et effets ; HTML/CSS pour les menus et contrôles lorsque cela facilite la lisibilité et l’accessibilité.
- Interface adaptée au clavier, à la souris et au tactile, avec de gros boutons et un focus visible.

Les maquettes sont des références de composition. Le jeu doit reconstruire les scènes avec des éléments indépendants, et non afficher une capture statique contenant de faux boutons.

## Arborescence

```text
chuck-maurice/
├── README.md
├── public/
│   └── assets/
│       ├── characters/     # Chuck : poses, sprites et animations
│       ├── objects/        # Bocal fermé, ouvert, brisé et accessoires
│       ├── backgrounds/    # Cuisine et décors
│       ├── references/     # Maquettes et planches de référence
│       ├── audio/          # Sons ou musiques exportés si nécessaires
│       ├── fonts/          # Polices avec droits d’utilisation adaptés
│       ├── ui/             # Éléments graphiques de l’interface
│       ├── sprites/        # Sprites des jeux, générés depuis les originaux (ne pas éditer à la main) ; saucissonator/ pour la mission 002
│       ├── shared/         # Originaux communs à plusieurs jeux : chuck/, kitchen/ (vides pour l’instant)
│       ├── saucissonator/  # Originaux du 2ᵉ jeu : objects/, characters/, references/
│       ├── olive-storm/    # Originaux du 3ᵉ jeu
│       └── bon-voisinage/  # Originaux du 4ᵉ jeu : backgrounds/, characters/, objects/, effects/, references/
├── scripts/
│   └── build_assets.py     # Détourage, découpe et réduction des originaux vers sprites/
│   └── build_saucissonator_assets.py  # Idem pour Saucissonator 3000
│   └── build_bon_voisinage_assets.py  # Idem pour MAURIIIIICE !!! (trois échelles de plan, Jean-Mi articulé)
├── src/
│   ├── main.ts             # Contrôleur d’Opération Cornichon : enchaînement des écrans et entrées
│   ├── saucissonator/      # Mission 002 : contrôleur, scène, règles, médailles, sauvegarde
│   ├── olive/              # Mission 003 : contrôleur, scène, physique, règles, médailles, sauvegarde
│   ├── voisinage/          # Mission 004 : contrôleur, entrée, scène, cinématiques, règles, médailles, sauvegarde
│   ├── game/
│   │   ├── scenes/         # Chargement, titre, partie et résultats
│   │   ├── entities/       # Chuck, bocal et objets de jeu
│   │   ├── systems/        # Puissance, temps, résultats et progression
│   │   └── config/         # Réglages du jeu et constantes
│   ├── ui/                 # Menus, contrôles et interface HTML
│   ├── audio/              # Synthèse Web Audio et gestion du son
│   ├── storage/            # Sauvegarde locale et gestion des erreurs
│   ├── styles/             # Styles, adaptation des écrans, pixel art
│   └── types/              # Types TypeScript partagés
├── docs/                   # Notes de conception et inventaire des assets
└── tests/                  # Tests des règles, de la physique et de l’équilibrage (missions 002, 003 et 004)
```

Les dossiers vides contiennent un fichier `.gitkeep` afin d’être conservés par Git. Ce fichier n’a aucun rôle dans le jeu et peut être retiré lorsqu’un dossier reçoit de vrais fichiers.

## Ajouter les visuels

Dans GitHub, ouvrir le dossier approprié, puis **Add file → Upload files** et enregistrer les fichiers.

| Dossier | Exemples de noms (facultatifs) |
| --- | --- |
| `public/assets/characters/` | `chuck_idle.png`, `chuck_straining.png` |
| `public/assets/objects/` | `jar_closed.png`, `jar_open.png`, `jar_explosion.png` |
| `public/assets/backgrounds/` | `kitchen.png` |
| `public/assets/references/` | `gameplay_mockup.png`, `victory_mockup.png` |

**Conserver les noms déjà choisis et tous les originaux.** Un futur inventaire pourra associer chaque image à son rôle sans imposer de renommage. Ne pas écraser ni déplacer automatiquement les visuels existants.

Avant intégration, vérifier les dimensions, la transparence, l’échelle, l’alignement des poses et les éventuelles grilles de sprites. Si un découpage ou redimensionnement est nécessaire, conserver l’original et produire une copie distincte. Utiliser les graphismes fournis ; signaler les éléments manquants avant d’en créer de nouveaux.

## Stack et lancement

**TypeScript, Phaser 3 et Vite**, application web statique. Versions fixées dans `package-lock.json`. Prérequis : Node.js 20 ou plus.

```bash
npm install
npm run dev      # développement, http://localhost:5173
npm run build    # vérification TypeScript + build de production dans dist/
npm run preview  # sert dist/ en local
```

### Commandes de jeu

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Faire monter la puissance | Espace, ↑ ou F (marteler) | bouton FORCER, ou toucher la scène |
| Tenter l’ouverture | Entrée ou O | bouton OUVRIR CE FOUTU BOCAL |
| Couper le son | M | bouton SON |
| Retour au menu | Échap | bouton MENU |

Toute la difficulté se règle dans `src/game/config/balance.ts`.

### Sprites

Les originaux de `public/assets/` ne sont jamais modifiés. `scripts/build_assets.py` en tire des copies prêtes pour le jeu dans `public/assets/sprites/` : fonds retirés, planches découpées en poses, réduction à la résolution 480 × 270. Après modification d’un original :

```bash
pip install pillow numpy scipy
npm run assets
```

Constats sur les originaux :

- `chuck_idle.png` (fond gris), `jar_open.png`, `jar_explosion.png` et `gameplay_mockup.png` (faux damier incrusté) n’ont pas de vraie transparence ; le script retire leur fond.
- `gameplay_mockup.png` n’est pas une maquette d’écran mais une pose de Chuck en torsion ; elle sert de pose d’effort principale.
- `victory_mockup.png` reste une référence de composition et n’est pas chargée par le jeu.

### Déploiement Cloudflare Pages

- Commande de build : `npm run build`
- Dossier de sortie : `dist`
- Variable d’environnement : `NODE_VERSION=20` (ou plus)

Le build retire de `dist/` les originaux et les maquettes (environ 15 Mo) : seuls les sprites sont déployés.

## Mission 002 — Saucissonator 3000

> 19h44. Le bocal est neutralisé. Mais l’apéritif est toujours en danger.

Douze rondelles à découper en 25 secondes, avec un couteau manifestement trop grand. Page : `saucissonator.html`, code dans `src/saucissonator/`, sprites dans `public/assets/sprites/saucissonator/`.

### Règles

- Le saucisson avance vers une ligne de coupe fixe : il rampe, puis glisse de plus en plus vite. Ce qui dépasse de la ligne au moment de la coupe **est** la rondelle : son épaisseur est mesurée, affichée et jugée.
- Parfaite (15 px ± 2) : 500 pts · correcte (± 5) : 250 · trop épaisse : 100 · trop fine : 50. Toutes les trois coupes parfaites d’affilée : +500 et « MODE CHARCUTERIE TACTIQUE ACTIVÉ ».
- Victoire : douze rondelles avant la fin du chrono, dont au moins huit correctes ou parfaites. La mission s’arrête donc dès la cinquième coupe ratée.
- Échecs : **le parpaing de porc** (les rondelles épaisses dominent), **vol aggravé de charcuterie** (les fines dominent, le boxer s’en charge), **la découpe nucléaire** (saucisson laissé filer jusqu’à la zone rouge, ou chrono écoulé sans erreur dominante).

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Trancher | Espace, ↓, Entrée, F ou X | bouton TRANCHER, clic, toucher ou geste vers le bas sur la scène |
| Couper le son | M | bouton SON |
| Retour au menu | Échap | bouton MENU |

La coupe part dès le contact du doigt (début du geste), sans attendre la fin du mouvement : c’est ce qui garde la précision.

Tous les réglages (durée, tolérances, vitesses, barème) sont dans `src/saucissonator/config/balance.ts`. Ils sont vérifiés par des joueurs simulés :

```bash
npm test                    # règles, médailles et équilibrage (node:test, sans dépendance ajoutée)
npm run assets:saucissonator  # régénère les sprites depuis public/assets/saucissonator/
```

### Ce qui est partagé avec Opération Cornichon

Décor (`kitchen`, `table`), poses de Chuck (`cool`, `rage`, `despair`), moteur sonore (`src/audio/sfx.ts`, étendu par `src/saucissonator/sfx.ts`), feuille de style et composants (`main.css` : boutons, jauge, panneaux, médailles, sélecteur de mission), réglage du son. La progression de chaque mission est stockée sous sa propre clé `localStorage`.

### Illustrations : constats

- Tous les originaux de `public/assets/saucissonator/` sont utilisés, sauf les trois maquettes de `references/`, qui servent de guide de composition.
- `chuck_cutting.png` : Chuck a le poing levé mais **pas de couteau en main** ; le jeu y accroche `knife.png`. Une seule pose de découpe existe : ses réactions passent par l’animation du sprite et par les poses d’Opération Cornichon.
- `boxer_stealing.png` porte déjà le saucisson : il n’existe pas de pose de course à vide, ni de boxer accoudé au plan de travail comme sur la maquette (le boxer debout est placé derrière le comptoir).
- Aucune illustration pour le plancher défoncé, le parpaing de porc (la rondelle épaisse est agrandie), la cuisine tranchée en deux ni les drapeaux de la maquette de victoire : ces effets sont produits par Phaser.
- La plupart des fichiers ont un faux damier blanc incrusté au lieu d’une vraie transparence ; `knife.png` a un halo sombre. Le script de sprites les détoure.

## Mission 003 — Olive Storm

> 19h46. Il n’y a pas d’olives dans le verre. Chuck refuse de faire trois mètres.

Jeu de tir balistique : trois olives à placer dans le verre, cinq tirs, 35 secondes. Page : `olive-storm.html`, code dans `src/olive/`, sprites dans `public/assets/sprites/olive-storm/`.

### Règles

- Le joueur ne règle que **l’angle** : la cuillère tire toujours avec la même force, et ne descend pas sous 40°, donc le tir est toujours en cloche. On vise en tirant vers l’arrière sur la scène (souris ou doigt) puis on relâche ; au clavier, flèches haut / bas puis Espace. Aucun angle chiffré n’est affiché, et l’angle de départ change à chaque mission.
- Seule l’amorce de la trajectoire est tracée, en gros points (la montée du lob jusqu’à son sommet en phase 1, un peu moins dès la phase 2 ; la retombée n’est jamais montrée), avec le même modèle que le tir, vent compris. Le reste s’estime, et se corrige d’un tir à l’autre.
- Une olive ne compte que si elle franchit l’ouverture du verre par le haut **et** s’immobilise à l’intérieur. Bord, flanc et pied ne rapportent rien.
- Phase 1 : tir réglementaire, environ 10° de marge autour de 56°. Phase 2 (après la 1ʳᵉ olive) : le ventilateur, placé derrière Chuck, pousse l’olive plus loin ; il faut lober plus haut, mais trop haut l’olive traverse le plafond : la fenêtre se resserre un peu (8,5° à 7,75° selon la force, tirée au sort à chaque mission et constante ensuite). Phase 3 (après la 2ᵉ) : le boxer bondit à intervalle fixe sur une trajectoire tracée à l’écran, avec un aboiement d’avertissement ; une olive interceptée est un tir manqué.
- Score par olive : 500, plus 300 (tir direct) **ou** 200 (au moins un rebond avant le verre), plus 500 si elle entre au centre. Trois tirs réussis d’affilée : +1000, une seule fois.
- Défaite quand l’objectif devient hors d’atteinte ou que le chrono tombe. La catastrophe dépend de la partie : **trahison canine** si la dernière olive perdue a été interceptée, **incident diplomatique** si une olive a ricoché sur la casserole, **incident spatial** si une olive a traversé le plafond ; sinon, selon que les tirs ratés étaient trop en cloche ou pas assez.
- Une olive trop longue quitte la cuisine par la droite : aucun mur ne la renvoie dans le verre.

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Viser | ↑ ↓ par demi-degré, Maj pour aller quatre fois plus vite | tirer vers l’arrière sur la scène, ou boutons PLUS HAUT / PLUS BAS |
| Tirer | Espace, Entrée ou F | relâcher, ou bouton FEU ! |
| Couper le son | M | bouton SON |
| Retour au menu | Échap | bouton MENU |

La physique (`src/olive/physics/world.ts`) et les règles (`src/olive/systems/mission.ts`) sont séparées de l’affichage et tournent à pas fixe : mêmes conditions initiales, même trajectoire. Gravité, force du tir, rebonds, vents possibles, longueur de l’amorce, boxer, durée et barème se règlent dans `src/olive/config/balance.ts`. `npm test` couvre les deux ; `npm run assets:olive` régénère les sprites.

### Illustrations

Les 15 fichiers de `public/assets/olive-storm/` sont tous utilisés, sans modification ; `scripts/build_olive_assets.py` en tire les dérivés du jeu.

- `fan.png` contient le ventilateur **et** son hélice : ils sont séparés pour faire tourner l’hélice.
- `fan.png` est affiché en miroir, à gauche, pour souffler dans le sens du tir.
- `window_open.png` est posée sur la fenêtre de la cuisine officielle, avec `jeanmi_garden.png` en arrière-plan.
- `jeanmi_idle.png` ne tient pas de verre : `pastis_glass.png` est placé dans sa main par le jeu, puis tombe seul.
- `boxer_intercept.png`, `jeanmi_angry.png`, `olive_splat.png`, `pan.png` et `pastis_glass.png` ont un faux damier incrusté au lieu d’une vraie transparence ; le script les détoure.
- Pas d’illustration pour le radar, le projecteur ni le plafond percé : effets Phaser. Le hurlement de Jean-Mi est un son de synthèse, accompagné du texte à l’écran.
- Réutilisés : la cuisine et le plan de travail, `chuck_despair` (mission 001), `boxer_idle` (mission 002).

## Mission 004 — MAURIIIIICE !!! (Opération Bon Voisinage)

> 19h58. Chuck démarre sa Fuego, allume son barbecue et teste sa sono. Pour lui, tout est normal.

Un « 1, 2, 3, soleil » à une seule commande : faire monter la colère de Jean-Mi à 100 % en 35 secondes, sans se faire prendre trois fois. Page : `mauriiiiice.html`, code dans `src/voisinage/`, sprites dans `public/assets/sprites/bon-voisinage/`.

### Règles

- **Une seule commande**, par maintien : barre Espace, clic gauche ou doigt, sur le gros bouton ou n’importe où sur la scène. Jean-Mi tourne le dos : on maintient, la colère monte. Il regarde : on relâche.
- Jean-Mi passe par trois états : **dos tourné → avertissement → regard**. Le regard est toujours précédé d’un avertissement complet (pose qui se retourne, « ! », bip, bouton et cadre qui virent au jaune) : 0,65 s à l’acte 1, 0,5 s à l’acte 2, 0,4 s à l’acte 3. 90 ms de tolérance au début du regard absorbent la latence d’un écran tactile.
- Maintenir pendant le regard = **flagrant délit** : un seul par regard, puis une pause comique. Après la pause Jean-Mi fixe encore Chuck pendant un regard complet (se faire prendre ne fait donc pas gagner de temps) et il faut relâcher puis rappuyer. Trois flagrants délits : défaite.
- La colère ne redescend jamais. Trois actes s’enchaînent seuls : **Fuego** (0–33 %), **barbecue** (33–80 %), **sono** (80–100 %), avec des retournements de plus en plus fréquents. Alerte à 95 %.
- Pendant l’acte du barbecue, la fumée envahit le jardin de Jean-Mi (bouffées rapides + gros paquets qui stagnent), même quand on ne maintient pas ; plus on attise, plus elle est dense.
- Le chronomètre ne compte que le jeu actif : pauses, changements d’acte et cinématiques ne le consomment pas.
- La commande est remise à zéro à chaque changement d’état (début de partie, pause, changement d’acte, fin) et relâchée d’office si la page perd le focus, passe en arrière-plan ou si le toucher est interrompu.
- Score : mission terminée 1 000, 100 par seconde restante, 1 000 sans flagrant délit, 200 par **relâchement précis** (dans les 0,24 dernière seconde de l’avertissement, après au moins 0,6 s de maintien, une fois par avertissement). En cas de défaite : 5 points par % de colère, plus les relâchements précis.
- Médailles : PAS VU, PAS PRIS · ROI DU LOTISSEMENT (10 s restantes) · LA GUERRE DES VOISINS · LE SHORT DE LA DISCORDE (cinématique vue jusqu’au bout) · C’EST DIMANCHE (une partie terminée avec un relâchement précis).

| Action | Clavier | Souris / tactile |
| --- | --- | --- |
| Faire comme d’habitude | maintenir Espace | maintenir le bouton ou la scène |
| Passer le briefing, revanche | Espace ou Entrée | toucher la scène, bouton REVANCHE |
| Couper le son | M | bouton SON |
| Réduire secousses et flashs | — | bouton SECOUSSES (écran titre et résultat) |
| Retour au menu | Échap | bouton RETOUR À L’ARCADE |

### Fins

- **Victoire — « Le short de la discorde »** : cinq plans (l’implosion, l’assaut de la clôture, le short se déchire, le silence de Chuck, le triomphe national), environ 10 secondes. Sans aucun flagrant délit, un court épilogue s’ajoute (« Tu veux que je mette moins fort ? »).
- **Trois flagrants délits — « Le dossier Jean-Mi »**.
- **Chronomètre écoulé — « La sieste de Jean-Mi »** : Jean-Mi a gagné le droit de boire son pastis au calme (illustration pleine page, en lent travelling), jusqu’à ce que Chuck retourne à sa Fuego.

### Architecture

| Rôle | Fichier |
| --- | --- |
| Réglages (durées, gains, seuils, barème) | `src/voisinage/config/balance.ts` |
| Textes | `src/voisinage/config/messages.ts` |
| Surveillance de Jean-Mi | `src/voisinage/systems/watch.ts` |
| Colère, chronomètre, actes, flagrants délits | `src/voisinage/systems/duel.ts` |
| Score, médailles, sauvegarde | `systems/score.ts`, `systems/medals.ts`, `save.ts` |
| Commande maintenir / relâcher | `src/voisinage/input.ts` |
| Plan de jeu Phaser | `src/voisinage/scenes/GardenScene.ts` |
| Cinématiques | `src/voisinage/scenes/cinematics.ts` |
| Bruitages (Web Audio, tout est synthétisé) | `src/voisinage/sfx.ts` |
| Interface HTML | `src/voisinage/ui.ts`, `src/styles/voisinage.css` |
| Machine à états de la page | `src/voisinage/main.ts` |

Les règles ne dépendent pas de l’affichage : `Duel.update(dt, maintenu)` suffit à dérouler une partie, ce que font les tests avec des joueurs simulés (attentif, expert, lent, trop gourmand). `npm test` les lance ; `npm run assets:voisinage` régénère les sprites et `src/voisinage/config/sprites.ts`.

### Illustrations

Les 18 fichiers d’origine de `public/assets/bon-voisinage/` portent les noms convenus ; aucun n’est modifié. S’y ajoutent, pour la fin au chronomètre, `backgrounds/jeanmi_pastis_victory.webp` (la scène complète, en gros plan) et `characters/jeanmi_pastis_victory.webp` (Jean-Mi seul dans sa chaise, détouré et animé dans le plan large). `scripts/build_bon_voisinage_assets.py` en tire les dérivés, à trois échelles (plan large, plan moyen, gros plan) pour que chaque plan s’affiche à 1 texel = 1 pixel de la scène 480×270, sans flou.

- `chuck_unbothered.png` ne montre pas Chuck bras croisés mais une main levée, l’autre sur la hanche : c’est sa pose « innocente ». `chuck_sunglasses.png` sert de pose « en pleine activité » pendant le jeu, et de geste des lunettes dans les cinématiques.
- `jeanmi_turn.png` et `jeanmi_watch.png` regardent vers la droite ; Chuck étant à gauche, ils sont affichés en miroir.
- `jeanmi_short_torn.png` contient Jean-Mi **et** un panneau de clôture vu de face. Il n’est jamais posé sur la clôture en perspective du décor : les plans où il apparaît utilisent des cadrages du décor sans cette clôture (`cine_*`), et la clôture y est prolongée par le même panneau, vidé de Jean-Mi (`fence_*`). Le bas de sa jambe pendante est détaché (`leg_*`) pour mouliner autour du genou ; le grillage est reconstitué derrière par décalage d’un nombre entier de mailles.
- `jeanmi_back.png` est découpé en tronc + deux jambes articulées à la hanche pour l’escalade.
- `sound_waves.png` a un faux damier incrusté : il est détouré et ses quatre arcs sont séparés. Les autres originaux ont un halo semi-transparent, coupé au seuil.
- `victory_reference.png` n’est pas chargée par le jeu : elle a guidé la composition des plans 4 et 5.
- Le verre de pastis vient de la mission 003 (`olive-storm/objects/pastis_glass.png`).
- Pas d’illustration pour le dossier de Jean-Mi, sa feuille, la table vue de près, le « ! » ni la feuille morte : petits éléments dessinés en code. Jean-Mi n’a pas de pose souriante debout : son sourire satisfait du « dossier » est joué avec `jeanmi_watch.png`.

## Périmètre

Quatre missions sont jouables : **Opération Cornichon**, **Saucissonator 3000**, **Olive Storm** et **MAURIIIIICE !!!**. Les autres missions, le site arcade complet, la publication sur chuckmaurice.com et l’idée d’un beat’em all sont des évolutions ultérieures, hors de cette initialisation.

## Droits et crédits

Les crédits, sources et conditions d’utilisation des images, polices et sons devront être documentés avant diffusion. Aucune licence de redistribution n’est attribuée automatiquement par ce README.
