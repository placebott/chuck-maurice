# Nain-Mi : extraction des 8 poses au repos

Source : `public/assets/sources/nainmi_sheet.png`, planche de présentation 1536 × 1024. Le fichier n'existait pas à cet emplacement ; c'est une copie de `~/Documents/ChatGPT/Drop Puzzle/Prototype Les Nain-Mi en plastique brillant.png`, identique à l'image fournie (écart moyen de 3 niveaux sur 255, dû à la compression de l'image collée).

Outil : `scripts/build_nainmi_assets.py` (Pillow et numpy, sans scipy). Il ne lit que la planche et réécrit tous les fichiers produits à chaque passage.

```bash
npm run assets:nainmi
```

Sorties :

- `public/assets/nainmi/<couleur>/idle.png` : 8 PNG RGBA 160 × 160, couleurs `red`, `blue`, `yellow`, `green`, `purple`, `orange`, `cyan`, `pink` ;
- `public/assets/nainmi/manifest.json` : cadre, ligne des pieds, boîte d'origine dans la planche, échelle, centrage et contrôles, personnage par personnage ;
- `public/assets/nainmi/controle.html` : planche de contrôle. En dev : `http://localhost:5173/assets/nainmi/controle.html`.

La planche source n'est pas déployée : `vite.config.ts` retire `assets/sources/` du build, comme les autres originaux.

## Résultat

Les 8 personnages sont détourés **sans retouche de dessin**. Chaque pixel opaque vient de la planche. Trois choses seulement changent :

- **l'alpha**, c'est-à-dire le détourage ;
- **la couleur des pixels de bord**, dont on retire la part de fond bleu nuit (sinon : halo sombre) ;
- **l'échelle**.

Aucune partie manquante n'a été inventée.

| Personnage | Taille dans la planche | Échelle | Dans le cadre 160 × 160 | Trou laissé transparent |
| --- | --- | --- | --- | --- |
| rouge | 143 × 194 | 0,763 | 110 × 148, x 25 → 135 | — |
| bleu | 142 × 194 | 0,763 | 108 × 148, x 26 → 134 | — |
| jaune | 140 × 194 | 0,763 | 106 × 148, x 27 → 133 | entre les jambes, 119 px |
| vert | 139 × 193 | 0,767 | 106 × 148, x 27 → 133 | — |
| violet | 140 × 194 | 0,763 | 107 × 148, x 27 → 134 | — |
| orange | 144 × 194 | 0,763 | 110 × 148, x 25 → 135 | — |
| cyan | 144 × 194 | 0,763 | 110 × 148, x 25 → 135 | entre les jambes, 56 px |
| rose | 146 × 194 | 0,763 | 112 × 148, x 24 → 136 | entre les jambes, 112 px |

Normalisation commune :

- **hauteur** : 148 px du haut du crâne au bas des semelles ;
- **pieds** : bas des semelles sur la ligne y = 154, soit 6 px de marge en bas comme en haut ;
- **centrage** : centre de la boîte englobante à x = 80, sauf le violet, à 80,5 (largeur impaire). Le centre de masse reste entre 79,4 et 80,1.

Proportions conservées : une seule échelle par personnage. Les écarts d'échelle (0,763 contre 0,767) viennent d'un personnage plus court de 1 px dans la planche. La réduction se fait au filtre Lanczos, en alpha prémultiplié, donc sans liseré sombre.

**Liseré mesuré** (luminosité moyenne des pixels de bord semi-transparents, moins celle de l'intérieur voisin) : entre −0,036 et +0,053 selon le personnage. Un halo sombre visible commencerait vers −0,08. Les valeurs positives (rouge, violet) viennent du reflet clair de contre-jour, qui fait partie du dessin.

## Comment le détourage est fait

1. **Fenêtre.** Une fenêtre est taillée autour de l'étiquette de couleur de chaque personnage. Elle est coupée à la ligne d'ombre de contact sous les semelles : l'étiquette commence 2 à 3 px plus bas.
2. **Couleur du personnage.** Un pixel est retenu si sa teinte est proche de celle du personnage, assez saturée et assez lumineuse. S'y ajoutent les reflets blancs qui les touchent. On garde le corps et ce qui y est relié. Le texte, le logo, le sol et les voisins tombent.
3. **Bleu et cyan.** Ils ont la même famille de teinte que le fond et son halo, vers 205-210°.
   - Leurs **parties claires** se séparent du fond par la luminosité.
   - Leurs **ombres** se séparent par la teinte, mesurée sur la planche : vers 223-240° pour le bleu (plus violet), vers 193-204° pour le cyan (plus vert).
4. **Plis sombres.** Les plis entre deux parties du corps (bras contre torse, menton) sont gardés s'ils font moins de 4 px de large (6 px pour bleu et cyan). Une fente bleu nuit, elle, montre le vrai fond : chez l'orange et le rose, c'est l'espace entre les jambes.
5. **Trous enfermés.** Dans la tête, ils sont rebouchés : ce sont des pupilles sombres. Ailleurs, ils sont laissés transparents s'ils montrent le fond.
6. **Bord.** L'alpha fractionnaire se calcule par projection entre le fond local et l'intérieur voisin. La couleur du bord est ensuite débarrassée de la part de fond. Les semelles se calculent contre l'ombre de contact noire, pas contre le sol bleuté.

## Problèmes de qualité et retouches à prévoir

Classés du plus au moins gênant.

1. **Résolution de la planche.** Les personnages y mesurent environ 194 px de haut. Le cadre de 160 px en garde 148, c'est-à-dire une réduction : aucun détail inventé.
   - À 48 px CSS : il faut 96 px physiques sur un écran de densité 2 et 144 px en densité 3 (iPhone 16 Pro Max). 148 px suffisent.
   - À 64 px CSS en densité 3 (192 px), l'image serait agrandie de 30 % et un peu floue.
   - **Retouche** : pour la taille « HD », il faut une source au moins deux fois plus grande.
2. **Pas d'ombre au sol.** L'ombre portée, le reflet coloré du sol brillant et la lueur du plateau sont retirés : ils appartenaient au décor de la planche. **Retouche** : si le jeu veut une ombre sous les pieds, la dessiner à part (ellipse sombre semi-transparente) plutôt que la garder dans le sprite.
3. **Intérieur des jambes du bleu.** Le bord de l'espace entre les jambes est irrégulier de 1 à 2 px dans le cadre de 160 px. Cause : l'ombre du pantalon et le fond y ont presque la même couleur. C'est invisible à 48 px. **Retouche** (facultative) : lisser ce contour à la main si le sprite doit être affiché en grand.
4. **Le rouge et le logo.** Le logo « Le Grand Débarras » de la planche touche presque son crâne, et son contour brun-rouge a la teinte du personnage. Une zone est retirée à la main (polygone dans le script), qui longe le crâne à 1 px près. Contrôle visuel : aucun reste du logo, crâne intact. **Retouche** : aucune, sauf si la planche change (polygone à revoir).
5. **Reflet de contre-jour bleuté.** Tous les personnages ont un reflet clair ou bleuté sur leur bord gauche et le haut du crâne : c'est l'éclairage de la planche, dessiné dans le personnage. Il est conservé, puisqu'il ne faut pas modifier les personnages. Sur le plateau gris clair, il passe inaperçu ; sur fond sombre il se voit comme un liseré clair (visible dans la planche de contrôle, ligne « Noir »). **Retouche** : seulement si le jeu adopte un fond chaud ou très sombre.
6. **Les 8 dessins ne sont pas des copies exactes.** La superposition de la planche de contrôle montre de petites différences de posture (coudes, écart des jambes, mèches). Un personnage n'est donc pas la simple recoloration d'un autre. Sans conséquence pour des poses fixes ; à garder en tête pour les animations.
7. **Bas des semelles.** Dans l'original, le bas des semelles est assombri par l'ombre de contact. La dernière rangée de pixels est donc un peu plus foncée et semi-transparente. C'est l'ombrage du dessin, pas un reste de fond : il est gardé.

## Non vérifié

- Affichage sur un vrai téléphone. La planche de contrôle a été vérifiée dans Chrome (densité 2), à 375 px de large sans défilement horizontal.
- Intégration au jeu : volontairement absente, le gameplay n'est pas modifié. À noter pour la suite : la palette d'*Embarquement* a 9 couleurs (dont `lime`), les Nain-Mi en ont 8 (pas de `lime`).
- Les autres poses de la planche (attente, panique, aspiration) ne sont pas traitées. Elles sont plus petites que la rangée du haut, environ 117 px de haut contre 194, et ne tiendraient pas 148 px sans agrandissement.
