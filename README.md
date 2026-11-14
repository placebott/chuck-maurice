# Chuck Maurice : Opération Cornichon 🥒

> BOSS 001 — LE BOCAL. Niveau de menace : NATIONAL.

Premier mini-jeu du projet **Chuck Maurice**, un univers de jeux d’arcade absurdes inspiré des années 1990. Chuck, héros d’action français des années 80 à la moustache impeccable, à la coupe mulet et aux muscles disproportionnés, doit accomplir une mission capitale : ouvrir un pot de cornichons.

## État du projet

Première version jouable d’**Opération Cornichon** : écran titre, briefing, partie de 20 secondes, quatre dénouements, score, statistiques, médailles et son. Voir « Stack et lancement » pour les commandes.

Reste à faire avant publication : essais sur de vrais téléphones, réglage de la difficulté par des joueurs, validation du son à l’oreille, crédits.

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
│       └── sprites/        # Sprites du jeu, générés depuis les originaux (ne pas éditer à la main)
├── scripts/
│   └── build_assets.py     # Détourage, découpe et réduction des originaux vers sprites/
├── src/
│   ├── main.ts             # Contrôleur : enchaînement des écrans et entrées
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
└── tests/                  # Futurs tests des règles et de la progression
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

## Périmètre

La priorité est une première version complète d’**Opération Cornichon**. Les autres missions, le site arcade complet, la publication sur chuckmaurice.com et l’idée d’un beat’em all sont des évolutions ultérieures, hors de cette initialisation.

## Droits et crédits

Les crédits, sources et conditions d’utilisation des images, polices et sons devront être documentés avant diffusion. Aucune licence de redistribution n’est attribuée automatiquement par ce README.
