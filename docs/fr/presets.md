---
title: "Presets et concepteur de presets"
description: "L'apparence de la popup de déblocage : les neuf presets fournis, le concepteur de presets, et le partage de votre propre fichier .awpreset."
---

# Presets et concepteur de presets

Un **preset** est l'apparence de la popup de l'overlay en jeu : sa disposition, ses couleurs, ses animations et la façon dont elle
met en valeur un déblocage rare ou une complétion à 100 %. Choisissez-en un dans **Paramètres → Notification → Préréglage**,
créez le vôtre dans **Paramètres → Presets de notification**, ou importez-en un que quelqu'un a partagé avec vous.
Le bouton en grille à côté du réglage du preset montre chaque preset sous la forme d'une image de sa carte : cliquez sur l'un d'eux pour
l'utiliser.

> [!NOTE]
> Les presets décrivent le style de l'overlay en jeu. Quand **Type de notification** est réglé sur *Notification Windows*,
> rien de ce que décrit un preset n'est dessiné, et l'onglet Presets de notification n'est pas affiché.

## Les presets fournis {#the-bundled-presets}

AW Next en livre dix, chacun avec sa propre composition, sa typographie, ses animations et ses couleurs.

| Preset | Ce que c'est |
| --- | --- |
| **AW Next** | Le preset par défaut. La palette propre à l'application, un rail d'accent le long du bord gauche, une icône cerclée et le nom du jeu au-dessus du succès. |
| **Steam Modern** | La plaque bleu marine sombre avec la marque Steam derrière le texte, des coins carrés, qui glisse vers le haut depuis le bord inférieur. |
| **Steam Original** | Une copie de la popup que le client Steam dessine aujourd'hui : dégradé ardoise, une marque Steam surdimensionnée et discrète, une icône carrée, et seulement un liseré doré pour un déblocage rare. |
| **Epic Games** | Plat, neutre et aux épaules carrées, avec les marges les plus larges de la série et un seul filet le long du bord gauche. |
| **PlayStation** | La typographie de la console et son long panneau du gris au noir, avec la marque PlayStation qui pulse dans un anneau à droite. |
| **Xbox** | Une pilule sombre avec un arc vert qui fait une fois le tour de l'icône circulaire et se fixe en un anneau stable. |
| **Cover** | L'illustration du jeu en arrière-plan, qui dérive lentement, avec un voile sous le texte et la plus grande typographie de la série. |
| **Glass** | Translucide et discret : pas de barre d'accent, et aucune couleur tant qu'un déblocage rare ou à 100 % n'en apporte une. |
| **Arcade** | Vert phosphore sur noir, à chasse fixe et en majuscules, avec des lignes de balayage et un bord décalé net. Un déblocage rare passe à l'ambre. |
| **Slim** | Le plus bas, sur un vrai noir : la même largeur que les autres pour la moitié de la hauteur, conçu pour disparaître sur un écran OLED. |

Tous les presets ont la même largeur, donc changer de preset ne déplace jamais la popup sur le côté.

### Les quatre états que dessine chaque preset {#the-four-states-every-preset-draws}

| État | À quoi il ressemble |
| --- | --- |
| **Normal** | L'accent propre au preset. |
| **Rare** | Or à 5 % ou moins, argent jusqu'à 10 %, bronze jusqu'à 15 % (les limites se changent dans **Paramètres → Général → Seuils de rareté**), plus le taux de déblocage imprimé sur la carte, un halo plus fort et un bord ajouté. |
| **Complétion à 100 %** | Un traitement froid et plus lumineux avec un liseré doublé. |
| **Progression** | Une barre de progression avec une étiquette `courant/max - %`. |

Le preset que vous choisissez dessine lui-même le rare et le 100 %, il n'y a donc qu'un réglage de preset, pas trois. Les
remplacements par émulateur restent dans **Paramètres → Notification → Émulateurs** (mode Avancé) : Xenia,
RPCS3, shadPS4 et Kyty peuvent chacun prendre leur propre preset et leur propre son.

Un preset utilise le son choisi dans l'onglet Notification sauf s'il définit le sien, si bien que changer l'apparence
ne change pas ce que vous entendez. Un preset partagé peut apporter son propre son : voir
[Partager un preset](#share-a-preset). **Opacité** (de 30 % à 100 %) dans l'onglet Notification détermine la transparence
de la popup.

> [!NOTE]
> Les presets livrés sous des noms antérieurs fonctionnent toujours : `Shirow`/`Default`/`Midnight`/`xqjan` vers
> **AW Next**, `Steam` vers **Steam Modern**, `PS4`/`PS5 enhanced` vers **PlayStation**,
> `Xbox 360`/`Xbox One` vers **Xbox**, `Game Cover`/`Sunset` vers **Cover**, `Clean`/`Modern`/`Smooth Pop` vers **Glass**,
> `Neon Future`/`LAZ0RBOX` vers **Arcade**, et les presets communautaires `ArmsofGod`, `Epic Preset`
> et `mudoss` vers **Pantheon**, **Onyx** et **Outline**. Les presets communautaires **Hexagon** et **Indiana**
> ont été retirés, et ils retombent, comme `TigerDX Award`, sur **AW Next**. Un preset à vous portant l'un
> de ces noms est utilisé avant le remplaçant.

## Créer le vôtre {#design-your-own}

Le concepteur a son propre onglet, **Paramètres → Presets de notification**, accessible aussi par le bouton
d'outils à côté du réglage du preset. Tout se règle avec des commandes ordinaires : pas de CSS, de JSON ni de fichier
à modifier.

<div align="center">
<picture><source srcset="../assets/shot/notification-preset-panel-800.webp 800w, ../assets/shot/notification-preset-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notification-preset-panel.png" width="720" height="530" alt="Le concepteur de presets"></picture><br>
<sub>Partez d'un design complet, puis façonnez-le sous un aperçu en direct de la vraie popup, qui reste à l'écran pendant que les commandes défilent</sub>
</div>

### Points de départ {#starting-points}

La première rangée contient quatorze designs complets : *Classic*, *Aurora*, *Neon*, *Cover*, *Minimal*,
*Console*, *Terminal*, *Slate*, *Paper* (le seul design clair), *Ember*, *Frost*, *Poster*, *Pixel*
et *Ribbon*. Chacun est un simple ensemble de valeurs de commandes, donc en choisir un revient à déplacer chaque
commande à la main : gardez-le, ou servez-vous-en comme base.

| Action | Ce qu'elle fait |
| --- | --- |
| **Surprends-moi** | Construit un design que vous n'avez pas essayé : elle choisit un type de carte (plate, dégradée, néon, sur illustration, vitrée, terminal ou claire), puis tire au sort chaque commande dans ce que ce type permet. |
| **Dupliquer** | Garde le design actuel et libère le nom, de sorte que le prochain **Créer le preset** ajoute un preset au lieu de remplacer celui dont il vient. |

Rien n'est enregistré avant d'appuyer sur **Créer le preset**.

### L'aperçu {#the-preview}

L'aperçu est la notification elle-même, dessinée par la même page, les mêmes styles et le même moteur que dans un jeu. Il
reste épinglé en haut du panneau pendant que les commandes défilent.

| Commande | Ce qu'elle montre |
| --- | --- |
| **Carte** | La popup à sa propre taille. La taille en pixels et le zoom de l'aperçu sont imprimés dessous. |
| **Comparer** | Les quatre notifications à la fois, deux par deux. |
| **Écran** | La popup sur un écran factice en **720p**, **1080p**, **1440p** ou **4K**, à sa vraie taille relative et dans le coin où les notifications sont réglées pour apparaître. |
| **Normal / Rare / 100 % / Progression** | Les quatre notifications dans lesquelles un preset doit être réussi. Dans **Comparer**, celle que vous choisissez est dessinée à pleine intensité. |
| **Lire** | Joue l'entrée, le maintien et la sortie une fois, avec les durées propres au preset. |
| **Arrière-plan** | Ce contre quoi la popup est jugée : la transparence, une scène sombre, une scène claire, ou une illustration de votre bibliothèque. |
| **Position / Échelle** | Reprennent les réglages du même nom de l'onglet Notification, et les modifient. Affichés dans la vue **Écran** uniquement. Une popup placée à la main est dessinée en bas au centre et étiquetée. |

### S'y retrouver {#finding-your-way-around}

Le concepteur a neuf groupes et une soixantaine de commandes, avec un filtre et un historique d'annulation.

| | Ce qu'il fait |
| --- | --- |
| **Le filtre** | Tapez dans la case au-dessus des groupes et seules les commandes correspondantes restent. Il cherche dans les libellés, les mots des listes déroulantes et le nom propre de la propriété, si bien que `corner` et `radius` trouvent le même curseur, et un nom lu dans un `.awpreset` trouve sa commande. Une correspondance cachée derrière **Avancé** l'ouvre. **Échap** vide la case. |
| **Annuler / rétablir** | Les deux flèches à côté du filtre, ou **Ctrl+Z** et **Ctrl+Y** (**Ctrl+Maj+Z** fonctionne aussi). Un glissement de curseur compte pour une étape. Charger un preset, choisir un point de départ ou appuyer sur Réinitialiser démarre un historique neuf. |

**Disposition et taille** et **Couleurs et fond** démarrent ouverts ; les autres groupes s'ouvrent d'un clic, et la plupart
ont un volet **Avancé** pour les réglages fins.

### Les commandes {#the-controls}

En mode d'interface **Simple**, les moitiés Avancé ne sont pas affichées.

| Groupe | Ce qu'il couvre |
| --- | --- |
| **Disposition et taille** | Icône à gauche, à droite, au-dessus du texte ou absente ; alignement du texte ; largeur, marges intérieures et espacement de la popup ; et si le **nom du jeu** est imprimé au-dessus du succès. |
| **Texte** | Police (l'une de cinq familles, ou **un fichier de police à vous** : TTF, OTF, WOFF ou WOFF2, 4 Mo au plus, copié dans le preset), taille du titre et de la description, nombre de lignes sur lesquelles la description peut passer, et couleur du titre. Sous Avancé : graisse du titre, majuscules, espacement des lettres, une ombre du texte et un contour autour de chaque glyphe. |
| **Couleurs et fond** | Une couleur unie, un dégradé à deux couleurs avec un angle, **l'illustration du jeu**, ou **une image à vous** (copiée dans le preset), assombrie, floutée et encadrée derrière le texte. Plus la couleur du texte, l'accent et l'opacité. Sous Avancé, une **texture** (grille, points, hachures ou mouchetis) sur le fond et sous le texte. |
| **Icône** | Taille, **forme** (carré arrondi, cercle, squircle, hexagone ou losange) et, sous Avancé, une bordure et un halo à la couleur d'accent. L'arrondi des coins ne s'applique qu'au carré arrondi. Un **logo** (PNG, JPEG, GIF, WebP ou BMP, 5 Mo au plus) peut se placer derrière le texte dans un coin ou au milieu d'un côté, avec une taille et une distance au bord ; il est copié dans le preset comme la police. |
| **Bordure et coins** | Rayon des coins, bord qui porte la barre d'accent (ou un contour complet, ou aucun) et son épaisseur ; sous Avancé, une bordure de votre couleur. |
| **Ombre et halo** | Profondeur de l'ombre portée, halo d'accent, et si ce halo **pulse** ou **respire** pendant que la popup est à l'écran. |
| **Animation et durée** | Le bord d'où la popup entre et vers lequel elle sort (ou fondu, ou zoom) et combien de temps elle reste. Sous Avancé : distance parcourue, vitesse d'entrée et de sortie, la courbe d'entrée (douce, linéaire, retour, légère, sèche ou élastique) et une **courbe de sortie**. |
| **Rare et 100 %** | Couleur et halo d'un déblocage rare et du 100 %, une **teinte d'état** qui lave toute la carte, si la barre de progression s'affiche, et si un **badge de rareté** imprime le taux de déblocage. Sous Avancé : l'épaisseur de la barre de progression, les paliers argent et bronze, et un **cadenas** avant le titre d'un succès masqué. |
| **Son** | Un son que ce preset joue à la place de celui de l'onglet Notification. Laissez **Réglage de l'app** pour n'en avoir aucun. |

| Action | Ce qu'elle fait |
| --- | --- |
| **Afficher à l'écran** | Rend le design comme une vraie popup d'overlay, en pleine taille, à la position configurée et dans l'état que montre l'aperçu, sans l'enregistrer. |
| **Créer le preset** | L'enregistre et le sélectionne comme preset actif. |
| **Mettre à jour le preset** | Le même bouton quand le nom correspond à un preset créé par le concepteur : il remplace ce preset au lieu d'en ajouter un autre. |
| **Modifier un preset** | Recharge un de vos presets générés dans les commandes, avec chaque valeur telle qu'enregistrée. |
| **Réinitialiser** | Remet les commandes sur le design par défaut. Rien ne change sur le disque. |
| **Renommer** | Apparaît une fois un preset généré chargé. Tapez le nouveau nom dans le champ du nom et appuyez dessus : le preset est renommé sur le disque, et les réglages de notification qui le désignaient suivent. |
| **Supprimer** | Apparaît une fois un preset généré chargé, et le supprime après confirmation. |
| **Exporter** / **Importer** | Déplacent un preset entre machines : voir [Partager un preset](#share-a-preset). |

Seuls les presets que ce concepteur a générés peuvent être rouverts ou supprimés : il stocke ses réglages dans un
`aw-preset.json` à côté des fichiers générés, et ce fichier rend un preset modifiable. Les presets fournis et
écrits à la main ne sont jamais touchés.

> [!NOTE]
> Un preset que vous avez déjà créé garde ses fichiers tels que générés. L'ouvrir dans le concepteur et l'enregistrer
> lui applique les valeurs par défaut d'aujourd'hui, dont un déblocage rare et une complétion à 100 % qui repeignent toute la
> popup.

> [!NOTE]
> Les presets que vous créez sont stockés dans `%APPDATA%\Achievement Watcher Next\presets\Users Presets`, pas dans
> le dossier d'installation, et survivent aux mises à jour de l'application.

### L'éditeur de disposition {#the-layout-editor}

**Éditeur**, sous l'aperçu, ouvre le design en plein écran : la carte au milieu, ses calques à
gauche, les réglages de ce qui est sélectionné à droite. Faites glisser n'importe quoi sur la carte pour le déplacer, tirez un
coin pour le redimensionner, tournez-le avec la poignée ronde. À la première ouverture, une courte visite montre
où se trouvent les choses ; **?** liste chaque raccourci et peut rejouer la visite.

| | Ce qu'il fait |
| --- | --- |
| **Ajouter** | Un texte, une image, un rectangle, une ellipse, une ligne, ou une **icône** (trophée, médaille, couronne, étoile et huit autres). Chacun est un calque à part. |
| **Images animées** | Un GIF ou un WebP animé (5 Mo au plus) joue sur la carte. **Rejouer le GIF à chaque notification** le relance depuis sa première image chaque fois que la popup s'affiche. |
| **Mots de la popup** | Un texte peut contenir `{game}`, `{title}`, `{detail}`, `{rarity}` et `{tier}` : les boutons sous le champ de texte les insèrent, et la popup met à leur place le nom du jeu, le succès, sa description, son taux de déblocage ou le nom de son palier. |
| **Remplissage** | Une forme ou une icône est peinte avec une couleur, un dégradé, un dégradé circulaire, la couleur du palier de la popup (elle passe au bronze, à l'argent ou à l'or avec la carte), ou la couleur d'un palier quelle que soit la popup. |
| **Formes** | Une étoile a un nombre de branches et une profondeur, une flèche une pointe et une hampe, un triangle un sommet qui glisse le long de sa base. Toute forme sauf l'ellipse peut avoir des coins arrondis, un contour ou une ligne peut être en tirets ou en pointillés, et une forme, une icône ou une image peut être retournée. Une image peut être découpée selon n'importe laquelle de ces formes. |
| **Transparente** | Une forme autre qu'une ligne peut être rendue transparente. Elle ne peint rien elle-même : tout ce qui est empilé dessous, la carte, son icône, son texte et les éléments en dessous, est découpé là où elle se trouve, si bien que le bureau transparaît par le trou. Les éléments au-dessus restent. Une forme transparente reste immobile, et l'option n'est pas proposée sur un preset fourni. |
| **Ombre et halo** | Un texte, une forme ou une icône projette une ombre ou rayonne, en noir, dans la couleur du palier de la popup ou dans une couleur à vous. |
| **Un état à la fois** | L'éditeur travaille sur l'état que montre l'aperçu (normal, bronze, argent, or, 100 % ou progression). **Modifier : Tous** change l'élément pour tous les états ; **Modifier : Or seulement** (ou l'état affiché) le change pour cet état seul, de sa couleur à sa position, et un élément ajouté alors n'apparaît que dans cet état. **Visible** masque ou montre l'élément de la même façon, si bien qu'une couronne que seul un déblocage or affiche est une seule icône désactivée partout sauf en or. Un état qui a ses propres réglages pour l'élément sélectionné l'indique, et **Revenir à la base** lui fait suivre à nouveau les autres. Les parties de la carte (titre, icône, description) fonctionnent de la même façon. |
| **Entrée et boucle** | La façon dont un élément arrive une fois la carte affichée (fondu, montée, chute, depuis un côté, zoom, saut, secousse ou éclair ; un texte peut aussi s'écrire tout seul, et un texte de rareté ou de progression compter en montant) et après quel délai, puis s'il continue de bouger pendant que la popup est affichée : une pulsation, un flottement, un balancement, une rotation ou un éclat. L'éditeur reste immobile pendant que vous travaillez ; **Lire** montre le mouvement. |
| **Frise** | Une barre en bas de l'éditeur montre quand chaque élément entre et pour combien de temps. Faites glisser une barre pour déplacer ou étirer son entrée, appuyez sur **Lire** pour regarder la carte, ou faites glisser sur la règle pour vous arrêter sur un instant. Elle reste repliée jusqu'à ce qu'un réglage d'animation change. |
| **Zones de texte** | Le titre, la description et la ligne du jeu peuvent être reformulés et recevoir une zone à eux : un remplissage, des marges, des coins arrondis et un contour. La barre de progression a une épaisseur et une couleur de piste, et les icônes peuvent être carrées. |
| **Position et taille** | Des valeurs saisies pour X, Y, largeur et hauteur, et six boutons qui alignent l'élément sur les bords ou le centre de la carte. |
| **Calques** | L'œil masque un élément. Le cadenas le maintient en place : il ne peut être ni déplacé, ni redimensionné, ni supprimé tant qu'il n'est pas déverrouillé, et un clic le traverse. Les flèches changent l'ordre d'empilement. |
| **Plusieurs à la fois** | **Maj** ou **Ctrl** + clic ajoute un élément à la sélection ou l'en retire, un glissement depuis un endroit vide choisit tout ce que le cadre touche, et **Ctrl+A** choisit tout. Le groupe se déplace d'un bloc, s'aligne sur la carte ou sur lui-même, et se duplique, se copie ou se supprime d'un coup. |
| **Copier et coller** | **Ctrl+C** et **Ctrl+V** copient la sélection, y compris vers un autre preset. Les sélecteurs de couleur proposent les couleurs que le design utilise déjà. |

Les fichiers de preset créés avant cette version continuent de fonctionner, et un preset qui n'utilise rien de tout cela garde son apparence et
s'exporte comme avant.

## Personnaliser un preset fourni {#customize-a-bundled-preset}

**Personnaliser un preset fourni**, en haut du concepteur, part d'un preset livré avec
l'application. Rien de ce preset n'est copié ni modifié : la couche que vous enregistrez est de quelques lignes qui le nomment, plus
les valeurs que vous avez changées, posées sur le preset fourni tel qu'il est livré. Si une version ultérieure améliore le
preset fourni, votre couche en profite.

Cochez les sections à modifier : **fond** (une couleur ou un dégradé), **couleur du texte**, **accent**,
**bordure**, **halo**, **police** (l'une des cinq familles ou un fichier de police à vous) et **logo**.
Les commandes partent des couleurs propres au preset fourni. L'aperçu et **Afficher à l'écran** montrent le
preset fourni avec votre couche par-dessus.

<div align="center">
<picture><source srcset="../assets/shot/preset-customize-panel-800.webp 800w, ../assets/shot/preset-customize-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/preset-customize-panel.png" width="720" height="530" alt="Personnalisation du preset AW Next avec un fichier de police et un logo, aperçu en direct" loading="lazy" decoding="async"></picture><br>
<sub>AW Next avec son propre fichier de police et un logo dans le coin supérieur droit : seules les sections cochées changent</sub>
</div>

- Cela fonctionne avec les presets de la liste **Presets par défaut**, qui dessinent tous la même carte. Les presets
  communautaires (Batman, Onyx, Outline et les autres) dessinent leurs propres dispositions et ne sont pas proposés.
- Une couche ne peut pas être exportée en `.awpreset`, puisqu'elle n'existe que par-dessus le preset fourni de
  l'installation qui l'a créée. Pour partager un design, construisez-le avec le concepteur.
- La **source navigateur OBS** ignore les couches et affiche le preset par défaut à la place.
- La popup garde la taille de fenêtre du preset fourni, si bien qu'un grand halo ou une grande bordure peut être coupé.

## Importer un thème depuis Steam Achievement Notifier {#import-a-theme-from-steam-achievement-notifier}

Les thèmes de **Steam Achievement Notifier** (SAN) arrivent en entier. AW Next dessine un thème importé
avec les propres dispositions de carte de SAN, si bien qu'il a l'aspect et le mouvement qu'il avait dans SAN : les onze dispositions, à la taille
de texte de SAN et avec le réglage d'échelle propre au thème. Deux boutons de l'onglet **Presets de notification**
importent des thèmes :

- **Importer un thème SAN** lit un fichier `.san`, ou le `usertheme.json` d'un thème que SAN a déjà
  décompressé, avec les images et les sons à côté.
- **Importer depuis SAN sur ce PC** lit les propres réglages de SAN quand SAN est installé ici, et importe
  d'un coup tous les thèmes enregistrés sur ce PC. Les quatre thèmes utilisés (normal, semi-rare, rare et 100 %)
  forment un seul preset, `SAN - <theme name>`, qui bascule entre eux comme le fait SAN, et chaque autre thème
  enregistré devient un preset à part. Le relancer actualise ces presets au lieu d'ajouter des
  copies et ne touche jamais un de vos presets qui porte le même nom.

Les presets SAN installés sont reconstruits tout seuls.

### Ce qui est repris {#what-comes-across}

Tout ce que contient le thème : chaque réglage, ses images (fond, masque, logos et décorations,
bordure d'icône, badges de pourcentage, icône de succès masqué), sa police et ses sons (un par état, ou
un dossier dans lequel SAN pioche au hasard). Le preset emporte tout cela, donc SAN n'est plus nécessaire ensuite,
et il s'exporte en `.awpreset`.

Son apparence est celle de SAN, pas celle des curseurs du concepteur : **Modifier un preset** l'affiche comme une image, avec un panneau
de deux choix dessous.

- **Image du trophée**, pour un thème qui dessine un trophée de bronze, d'argent et d'or : *Suit le
  palier* montre celui qui correspond au déblocage, ou choisissez une couleur pour l'afficher toujours.
- **Thème par palier** dessine un palier avec un autre thème SAN importé, son compris, si bien qu'un déblocage or
  peut avoir un aspect entièrement différent d'un déblocage bronze.

Tout le reste se change dans SAN et s'importe de nouveau.

L'état que reçoit une notification suit vos réglages de rareté dans AW Next. Une complétion à 100 % utilise la carte
100 % de SAN. En mode rare, l'or et l'argent utilisent sa carte rare et le bronze sa carte semi-rare ; en mode
trophées, l'or, l'argent et le bronze utilisent les cartes rare, semi-rare et normale. Un son rare ou 100 % choisi dans AW
Next l'emporte sur celui du thème, et la position et la taille de la popup viennent de l'onglet **Notification**.

Le rapport après un import liste ce qui n'a pas pu venir : un fichier que le thème nomme sans l'avoir fourni,
une image ou une police refusée, et des réglages d'un SAN plus récent que cette version ne dessine pas encore. Il est
aussi écrit dans le journal de l'application.

### Ce qui est vérifié avant toute installation {#what-is-checked-before-anything-is-installed}

Les règles sont celles d'un `.awpreset`, puisqu'un fichier de thème vient de la machine de quelqu'un d'autre. Rien
à l'intérieur n'est exécuté ni évalué ; seul son `usertheme.json` est lu. Chaque chemin est vérifié par rapport au
paquet dont il vient, et les chemins absolus qu'écrit SAN sont lus comme de simples noms de fichier. Seuls les images,
polices et fichiers audio sont extraits, selon le type de fichier et sous une limite de taille ; un SVG qui pourrait exécuter un script
et un fichier qui n'est pas une police sont refusés. Chaque réglage est vérifié pour son type et sa plage. Un import
qui échoue laisse intacts tous les presets que vous avez déjà.

## Partager un preset {#share-a-preset}

**Exporter** et **Importer**, dans l'onglet **Presets de notification**, déplacent un preset entre machines dans un seul
fichier `.awpreset` : le style, chaque image et police qu'il utilise, ses réglages de concepteur et ses métadonnées.

La [galerie de presets](../gallery/) rassemble ces fichiers : parcourez-la, téléchargez-en un et importez-le, ou ajoutez
le vôtre. Ce qu'une soumission doit être, et ce qui est vérifié avant qu'elle soit listée, se trouve dans
[Les galeries communautaires](community-galleries.md).

**Exporter** écrit ce que montre la carte, sous le nom du champ **Nom** : le design présent dans les
commandes, enregistré ou non, de sorte qu'un preset en cours puisse être partagé sans le créer d'abord. Un preset
importé sélectionné dans **Modifier un preset** est exporté depuis le disque tel quel, puisque son apparence vit dans des fichiers
que les commandes ne savent pas décrire. Seul le preset voyage : aucun chemin de votre machine, aucun nom de compte, aucun
de vos réglages.

**Importer** demande le fichier, le vérifie et l'installe sous `presets\Users Presets`. Si le nom
est pris, par un de vos presets ou un preset fourni, vous choisissez **Garder les deux** (l'import atterrit sous
`Name (2)`) ou **Remplacer**. Rien n'est écrit avant votre réponse.

Un preset importé apparaît dans **Modifier un preset**, est sélectionné, et peut de là être exporté de nouveau ou supprimé.
Un preset créé par le concepteur revient complet pour de nouvelles modifications. Un preset écrit à la main
tire son apparence de fichiers que les commandes ne peuvent pas reproduire, si bien que les commandes restent telles quelles et le champ du nom
reste vide.

### Ce qui est vérifié avant toute installation {#what-is-checked-before-anything-is-installed-1}

Un paquet est validé en entier et refusé en bloc, jamais installé en partie, quand :

- ce n'est pas un paquet de preset, ou que son manifeste est absent ou mal formé ;
- il exige une version d'AW Next plus récente que celle qui tourne, ou un format de paquet plus récent ;
- il contient un fichier que le format ne décrit pas : un programme, un script, ou quoi que ce soit hors de
  `preset/` et `sounds/` ;
- un chemin qu'il contient pointe en dehors de son propre dossier.

Rien dans un paquet n'est exécuté ni évalué pendant sa vérification ou son installation. La page du preset
s'affiche plus tard, dans la même fenêtre de notification isolée qu'un preset fourni.

### Ce que contient un paquet {#what-a-package-contains}

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

Le manifeste est conservé à côté du preset installé sous le nom `aw-package.json`. Il indique à l'application que le preset
a été importé et peut être retiré à nouveau, et reporte la description et le crédit dans l'export suivant.

Un son que vous avez importé vous-même voyage avec le preset ; un son fourni, non, puisque le manifeste
le nomme et que chaque installation le possède. L'import ne change jamais le son que vous avez sélectionné et n'écrase jamais
un des vôtres : un fichier différent du même nom arrive sous le nom `name (2)`.

Le champ facultatif `author` n'est rempli qu'à partir du propre fichier du preset, donc rien ne vous est crédité
à moins que vous ne l'y mettiez.

---

**Suite :** [Overlay](overlay.md) - la liste des succès en jeu, distincte de ces
popups.

<div align="center">

[← Documentation](README.md) · [Notifications](notifications.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
