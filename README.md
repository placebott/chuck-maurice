# Chuck Maurice : Opération Cornichon 🥒

> BOSS 001 — LE BOCAL. Niveau de menace : NATIONAL.

Premier mini-jeu du projet **Chuck Maurice**, un univers de jeux d’arcade absurdes inspiré des années 1990. Chuck, héros d’action français des années 80 à la moustache impeccable, à la coupe mulet et aux muscles disproportionnés, doit accomplir une mission capitale : ouvrir un pot de cornichons.

## État du projet

Ce dépôt contient pour le moment la documentation et les dossiers de préparation du projet **Phaser / TypeScript / Vite**. Le moteur, les dépendances et le jeu jouable ne sont pas encore installés : il n’existe pas encore de commande de lancement.

Lors de l’initialisation, le dépôt GitHub était vide. Les illustrations créées et validées séparément doivent encore y être téléversées. Les noms de fichiers indiqués ci-dessous sont des exemples, pas un inventaire d’images présentes.

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
| Plus de 95 % | Explosion du bocal et catastrophe dans la cuisine |

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
│       └── ui/             # Éléments graphiques de l’interface
├── src/
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

## Stack et lancement à venir

Stack prévue : **TypeScript, Phaser et Vite**, application web statique. Les versions seront fixées lors de l’installation et enregistrées dans un fichier de verrouillage.

L’initialisation actuelle ne crée pas encore `package.json`, `index.html`, les configurations TypeScript/Vite ni le point d’entrée. **Les commandes npm ne sont donc pas encore utilisables dans ce dépôt.**

La prochaine étape de développement devra :
1. Inspecter les fichiers présents, notamment les illustrations ajoutées depuis cette initialisation.
2. Installer et configurer la stack, ajouter les points d’entrée et les scripts de développement/construction.
3. Charger les assets et assembler la première scène jouable.
4. Implémenter la jauge, le chronomètre et les quatre résultats.
5. Ajouter les animations, le son, les menus et la progression locale.
6. Vérifier les limites 70/85/95 %, la fin du temps, le redémarrage, le stockage indisponible et les commandes clavier/tactiles.
7. Documenter les commandes réellement disponibles et vérifier la construction avant publication.

## Périmètre

La priorité est une première version complète d’**Opération Cornichon**. Les autres missions, le site arcade complet, la publication sur chuckmaurice.com et l’idée d’un beat’em all sont des évolutions ultérieures, hors de cette initialisation.

## Droits et crédits

Les crédits, sources et conditions d’utilisation des images, polices et sons devront être documentés avant diffusion. Aucune licence de redistribution n’est attribuée automatiquement par ce README.
