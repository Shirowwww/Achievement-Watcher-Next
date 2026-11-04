---
title: "Premiers pas"
description: "Installez Achievement Watcher Next, suivez le guide de premier lancement, choisissez Simple ou Avancé, retrouvez vos jeux et gardez l'application à jour."
---

# Premiers pas

AW Next est une application de bureau pour Windows et Linux. Les versions embarquent leur propre environnement d'exécution : Node.js n'est nécessaire que pour compiler depuis les sources. Sous Linux, installez l'AppImage comme l'explique [Linux et Steam Deck](linux.md), puis revenez ici : tout ce qui suit s'applique, avec `~/.config/Achievement Watcher Next` à la place de `%APPDATA%\Achievement Watcher Next`.

## Installation {#install}

| Étape | Windows 10 et 11 | Linux (x64, bêta) |
|---|---|---|
| **Le récupérer** | Depuis la [dernière version](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) : `Achievement.Watcher.Setup.<version>.exe`, ou `Achievement.Watcher.Portable.<version>.zip` pour garder ses données à côté de l'application | Depuis la même version : `Achievement.Watcher.<version>.AppImage` |
| **Le lancer** | Lancez l'installateur, choisissez un dossier, puis ouvrez AW Next depuis le menu Démarrer | `chmod +x`, puis lancez-le. Il faut FUSE 2 : `libfuse2t64` sur Ubuntu 24.04 |
| **Données** | `%APPDATA%\Achievement Watcher Next` (la version portable garde un dossier `data` à côté de l'exécutable) | `~/.config/Achievement Watcher Next` |

> [!WARNING]
> L'installateur est signé avec le certificat auto-signé du projet (`CN=Shirow`), donc Windows
> SmartScreen peut encore demander une confirmation. Voir
> [Avertissement de l'antivirus ou de SmartScreen](troubleshooting.md#antivirus-or-smartscreen-warning). Les
> mises à jour dans l'application n'installent qu'une version signée par ce certificat, épinglé par son empreinte.

## Premier lancement {#first-launch}

<div align="center">
<picture><source srcset="../assets/shot/onboarding-dialog-800.webp 800w, ../assets/shot/onboarding-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-dialog.png" width="720" height="475" alt="Guide de premier lancement : choix de la langue et de l'interface Simple ou Avancée"></picture><br>
<sub>Six étapes : bases, profil, jeux, sources, apparence et alertes, puis un récapitulatif final</sub>
</div>

Le guide de premier lancement demande les choix qui remplissent la bibliothèque :

- **Bases** : la langue (interface, et métadonnées des jeux quand une source en propose) et l'interface,
  Simple ou Avancée (voir plus bas). Aucune n'est présélectionnée.
- **Profil** : le nom affiché dans l'en-tête, un avatar local facultatif et votre compte Steam principal.
- **Jeux** : ce qui a été trouvé sur ce PC, avec les totaux. N'ajoutez un dossier que s'il manque quelque chose.
- **Sources** : des connexions facultatives (Steam, Epic, Xbox, PlayStation, RetroAchievements) qui lisent votre
  vraie bibliothèque et les déblocages faits sur un autre PC. Vous pouvez les passer et vous connecter plus tard dans **Paramètres →
  Sources**. Tous les interrupteurs de source sont sous **Affiner les sources**, repliés parce que les réglages par défaut lisent
  tout ce qui est installé.
- **Apparence et alertes** : le thème et la façon dont les déblocages sont annoncés, avec un bouton **Tester la notification**.
  Le réglage par défaut, **Automatique**, n'impose aucune décision.
- **Terminé** : un récapitulatif avec un bouton **Modifier** pour chaque choix, et des pointeurs vers les collections, le mode
  trophées, les clips vidéo et l'overlay.

<div align="center">
<picture><source srcset="../assets/shot/onboarding-ready-dialog-800.webp 800w, ../assets/shot/onboarding-ready-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-ready-dialog.png" width="720" height="475" alt="La dernière étape du guide de premier lancement, avec le récapitulatif et les cartes « Bon à savoir »" loading="lazy" decoding="async"></picture><br>
<sub>La dernière étape : chaque choix avec son bouton Modifier, puis une carte par fonction à connaître</sub>
</div>

**Passer la configuration** garde vos réponses, laisse le reste tel quel et lance le premier scan. **Paramètres →
Général** rouvre le guide.

## Simple et Avancé {#simple-and-advanced}

Choisissez l'un des deux dans le guide de premier lancement, et changez à tout moment avec le contrôle **Interface** en haut des
**Paramètres**.

<div align="center">
<picture><source srcset="../assets/shot/settings-panel-800.webp 800w, ../assets/shot/settings-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/settings-panel.png" width="720" height="529" alt="Les paramètres d'AW Next" loading="lazy" decoding="async"></picture><br>
<sub>Le contrôle Interface se trouve à côté du titre du panneau ; le champ de recherche filtre tous les onglets à la fois</sub>
</div>

- **Simple** montre les onglets de tous les jours : Général, Apparence, Manette, Notification, Presets de
  notification, Sources, Dossiers et Aide.
- **Avancé** ajoute les onglets **Steam / GBE Fork**, **Ubisoft / Uplay R1/R2** et **Avancé**, ainsi que les
  options plus poussées à l'intérieur des autres onglets.

**Simple masque des commandes et ne désactive jamais rien.** Le suivi, le scan et les notifications se comportent
de la même façon, et chaque valeur que vous avez réglée est toujours là quand vous revenez en arrière. Game Health suit la même idée :
Simple affiche *Données de succès trouvées* ou *Détecté au démarrage du jeu*, Avancé donne les totaux exacts, les fichiers et
les noms de processus. Une installation existante passe en **Avancé**, donc rien de ce que vous utilisiez ne disparaît.

Le champ de recherche en haut des **Paramètres** filtre tous les onglets à la fois et compte les résultats par onglet.
Il cherche dans les libellés, les descriptions, les valeurs des options et les noms internes, si bien que `hideZero` trouve la même ligne dans
n'importe quelle langue. `Ctrl+F` y place le curseur et `Échap` l'efface.

## La bibliothèque {#the-library}

Dans **Paramètres → Sources**, le bouclier signale les bibliothèques officielles des clients de bureau. Activez une ligne et actualisez ;
seules les bibliothèques détectées sur ce PC apparaissent. Voir [Sources compatibles](sources.md).

Le sélecteur entre la recherche de la bibliothèque et le bouton `+` bascule entre six vues : grandes cartes,
jaquettes en portrait, leurs deux variantes compactes, une liste et un tableau détaillé avec le temps de jeu et la dernière
session. Le choix est enregistré, et chaque vue a les mêmes cartes, filtres et menu contextuel.

<div align="center">
<picture><source srcset="../assets/shot/library-views-800.webp 800w, ../assets/shot/library-views.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/library-views.png" width="800" height="492" alt="La vue Détails de la bibliothèque avec le dernier succès, la dernière session et le temps de jeu" loading="lazy" decoding="async"></picture><br>
<sub>La vue Détails : dernier succès, dernière session et temps de jeu de chaque jeu en un coup d'œil</sub>
</div>

**Paramètres → Apparence → Tuiles de la bibliothèque** règle la taille des tuiles et l'espace entre elles (jusqu'à 0), et
affiche ou masque le nom du jeu, la barre de progression, l'icône de plateforme, le voyant de santé et les deux boutons, pour toutes les vues
à la fois. Un jeu que Steam liste sans succès affiche son illustration à la place d'une barre ; **Barre des jeux
sans succès** ramène la barre.

Faites un clic droit sur un jeu pour le renommer, modifier son temps de jeu ou l'ajouter à une collection. Un nom que vous définissez survit
aux nouveaux scans et aux restaurations, tandis que les jaquettes et la reconnaissance gardent le titre d'origine. Les jeux Steam peuvent prendre leur
titre dans la langue de vos succès (**Paramètres → Général**).

### Collections {#collections}

Les collections sont vos propres groupes de jeux. Faites un clic droit sur un jeu, choisissez **Collections**, puis cochez-en une ou
créez-en une. Le bouton des collections à côté de l'interrupteur des jeux installés filtre la bibliothèque sur une
seule collection, et les chiffres du profil suivent.

<div align="center">
<img src="../assets/shot/collections-flow.webp" width="800" height="493" alt="Création d'une collection Favoris, ajout d'un jeu depuis son menu du clic droit, puis sélection de la collection dans le menu de filtre pour que la bibliothèque et les totaux du profil se limitent à ses jeux" loading="lazy"><br>
<sub>Créez une collection, ajoutez des jeux depuis leur menu du clic droit, puis filtrez la bibliothèque avec elle</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/collections-panel-800.webp 800w, ../assets/shot/collections-panel.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/collections-panel.png" width="800" height="289" alt="La bibliothèque filtrée sur une collection Favoris, les chiffres du profil ne comptant que ses jeux" loading="lazy" decoding="async"></picture><br>
<sub>Affichage d'une seule collection : le bouton prend son icône et sa couleur, et les totaux ne comptent que ses jeux</sub>
</div>

Une collection a un nom, une couleur et une icône ou une image de votre choix. **Modifier la collection…** dans le
menu du bouton ouvre l'éditeur, où vous pouvez aussi la supprimer ; ses jeux restent dans la bibliothèque.

<div align="center">
<picture><source srcset="../assets/shot/collection-editor.webp 550w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/collection-editor.png" width="360" height="337" alt="L'éditeur de collection, avec le nom, la couleur, l'icône et l'image" loading="lazy" decoding="async"></picture><br>
<sub>L'éditeur de collection</sub>
</div>

### Statistiques de la bibliothèque {#library-stats}

Le bouton rond à côté du taux de complétion dans l'en-tête du profil ouvre les **Statistiques de la bibliothèque** : complétion
globale, nombres de succès débloqués et verrouillés, moyenne par jeu, temps de jeu moyen et suivi, nombre de trophées,
et une ligne par plateforme. **Afficher uniquement les jeux installés** limite les totaux à ce PC. La flèche
à côté du bouton replie l'en-tête du profil sur une seule ligne, ce qui laisse plus de place à la bibliothèque (**Paramètres
→ Apparence → Profil** propose le même choix).

<div align="center">
<picture><source srcset="../assets/shot/stats-overview-800.webp 800w, ../assets/shot/stats-overview.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-overview.png" width="800" height="514" alt="Le panneau des statistiques de la bibliothèque : complétion globale, nombres de succès débloqués et verrouillés, moyenne par jeu et temps de jeu" loading="lazy" decoding="async"></picture><br>
<sub>La vue d'ensemble : complétion, totaux, moyenne par jeu et temps de jeu</sub>
</div>

**Trophées** compte un platine pour chaque jeu terminé (un jeu PlayStation une fois son trophée de platine
obtenu) et note chaque autre succès débloqué selon sa rareté, avec les seuils sous la barre (ils
suivent le réglage de rareté dans [Notifications](notifications.md#trophy-mode)). **Jeux platine** liste
ce que vous avez terminé et quand, **Succès les plus rares** les plus difficiles que vous possédez, et **Tous les succès**
ouvre la liste complète.

<div align="center">
<picture><source srcset="../assets/shot/stats-trophies-800.webp 800w, ../assets/shot/stats-trophies.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-trophies.png" width="800" height="514" alt="Les nombres de trophées, les jeux platine, les succès les plus rares et le tableau par plateforme" loading="lazy" decoding="async"></picture><br>
<sub>Trophées, jeux platine, déblocages les plus rares et totaux par plateforme</sub>
</div>

## Thèmes {#themes}

**Paramètres → Apparence** habille toute l'application et l'overlay en jeu. Treize palettes sont intégrées,
et chacune est modifiable : choisissez un thème et l'éditeur s'ouvre sur ses couleurs, une ligne par couche (fond de
fenêtre, barre du haut, panneau de la bibliothèque, cartes et lignes, fenêtre des paramètres, texte, texte atténué, bordures, accent).
Chaque couche prend une couleur avec une opacité et, au choix, un dégradé, et les cinq couches de surface peuvent
aussi recevoir une image de fond avec un ajustement et soit un voile coloré, soit un flou.

La modification s'affiche en direct et n'écrit rien. **Enregistrer le thème** en fait un thème à vous : gardez le nom pour
remplacer ce thème, ou tapez-en un autre pour en obtenir un second. **Personnalisé…** est l'emplacement de travail, toujours
modifiable et jamais écrasé par un enregistrement fait depuis lui. **Tout réinitialiser** restaure le thème que vous
modifiez : un thème intégré retrouve sa propre palette, un thème enregistré ou importé retrouve ce qui est sur le disque, et
Personnalisé revient à la palette par défaut.

**Fichiers de thème** transforme un thème en un seul fichier portable. **Exporter le thème…** écrit un `.awtheme` avec la
palette, les dégradés, les effets et les images que vous avez utilisés, et rien sur votre machine (une image voyage sous forme
d'octets, jamais de chemin). L'export d'un thème intégré est refusé tant que vous ne l'avez pas enregistré sous votre propre nom, puisque
le fichier s'installerait sinon comme « Nord » ailleurs et masquerait le Nord déjà présent. **Importer un
thème…** commence par montrer l'application dessinée avec ce thème, avec son nom, son auteur, sa version et le nombre d'images, et
n'installe qu'après votre confirmation. **Supprimer le thème** retire un thème importé avec ses images.

Un `.awtheme` ne contient que des couleurs, des nombres et des images : il ne peut donc rien exécuter ni accéder au réseau
(voir [la référence du format](../awtheme-format.md)). Les thèmes faits par d'autres sont dans la
[galerie de thèmes](../gallery/themes/), et envoyer le vôtre ne demande que [un fichier](community-galleries.md). Un simple
fichier `*.css` déposé dans `%APPDATA%\Achievement Watcher Next\themes` apparaît toujours dans le sélecteur, mais
ne peut pas être exporté.

## Aide et astuces {#help-and-tips}

**Paramètres → Aide** est une référence vivante, regroupée selon la façon dont une question se pose : **Pour commencer**,
**Quelque chose ne va pas**, **Jeux émulés** et **Personnalisation**. Elle montre votre vrai raccourci, la disposition et les
affectations de votre manette, votre thème et votre mode de notification, et se met à jour quand vous changez les paramètres. Sa recherche
ignore la casse et les accents, et chaque sujet est disponible dans les deux modes d'interface.

## Trouver les jeux et les sauvegardes {#find-games-and-saves}

Ouvrez **Paramètres → Dossiers** et choisissez un chemin :

- **Recherche auto** propose tout ce qu'elle trouve à votre approbation avant d'ajouter quoi que ce soit. Elle reconnaît les dossiers
  de bibliothèque d'après leur nom (« Games », « Jeux », « Repacks » et leurs équivalents dans une vingtaine de langues, plus
  « Emulators » et « Emulation ») sur tous les lecteurs, et elle lit ce que les lanceurs ont enregistré : les manifestes
  Epic, les entrées de registre de GOG Galaxy et d'Ubisoft Connect, et le pointeur que Windows écrit pour le
  lecteur choisi pour les jeux Xbox. Cela trouve une bibliothèque nommée d'après une boutique (`D:\Epic Games`,
  `D:\XboxGames`) sans l'explorer. Les jeux qu'un lanceur possède gardent leur propre source. Recherche auto ajoute
  tout le reste du même dossier, généralement là où atterrit un repack ou une version Goldberg.
- **Ajouter un dossier** surveille un emplacement que vous sélectionnez.
- **Générer les configs** lance un scan plus complet et peut appliquer les options de configuration d'émulateur activées.

Si un dossier est refusé, sélectionnez le répertoire qui contient directement les dossiers de sauvegarde, les dossiers d'AppID,
`steam_settings` ou la configuration de l'émulateur. [Dépannage](troubleshooting.md#a-game-is-missing)
liste les premières vérifications. Quand le nom d'un dossier correspond à plusieurs versions Steam et que la correspondance est mauvaise,
faites un clic droit sur le jeu et choisissez **Définir l'AppID manuellement...** (voir
[Définir l'AppID d'un jeu à la main](advanced.md#set-a-games-appid-by-hand)).

Les listes de succès n'exigent aucune clé d'API Web Steam : elles viennent de points d'accès publics et sont mises en cache par
langue, si bien que la bibliothèque fonctionne ensuite hors ligne ([comment](sources.md#steam-metadata-without-an-api-key)).

## Notifications {#notifications}

**Paramètres → Notification** règle le mode de diffusion : **Automatique** (le réglage par défaut : l'overlay en jeu quand
il peut s'afficher, une notification Windows ou de bureau quand il ne le peut pas, et jamais le même déblocage deux fois),
**Overlay en jeu**, **Notification Windows**, ou **Les deux**. Si le mode Ne pas déranger de Windows masque les
notifications pendant que vous jouez, activez **Notifications prioritaires** et approuvez la demande unique. Des boutons
de test permettent de tout essayer avant de lancer un jeu. Voir [Notifications](notifications.md) et
[ce que regarde Automatique](notifications.md#how-automatic-decides).

## Vérifier un jeu {#check-on-a-game}

Le bouton **outils** d'une tuile de jeu ouvre son panneau **Game Health** : si AW Next peut voir le jeu, lire
ses succès et annoncer ses déblocages, et les réparations qui s'appliquent. C'est la première chose à ouvrir
avant de signaler un problème (voir [Game Health](game-health.md)). Pour rejouer un jeu depuis zéro, utilisez
[Réinitialiser les succès](advanced.md#reset-a-games-achievements), qui sauvegarde tout au préalable.

## Zone de notification et démarrage {#tray-and-startup}

Fermer la fenêtre principale garde AW Next dans la zone de notification, où le suiveur en arrière-plan continue de surveiller
les fichiers et les processus pour le temps de jeu et les déblocages. Quand aucune fenêtre n'est ouverte, il rend sa mémoire à Windows,
et le scan périodique de la bibliothèque attend la fin d'un jeu en cours. **Paramètres → Avancé → Mises à jour automatiques des données de succès**
désactive ce scan pour qui entretient `steam_cache` à la main. Le démarrage d'AW Next avec Windows et sa fermeture dans la zone de notification
se règlent dans **Paramètres → Général**. Pour quitter complètement, utilisez le menu de la zone de
notification.

## Mises à jour et données existantes {#updates-and-existing-data}

Les versions installées consultent le flux de versions GitHub du projet, jamais pendant une partie. Une nouvelle version est
annoncée par une notification de bureau et une pastille dans la barre de titre (l'icône de la zone de notification affiche aussi un point bleu), et
rien ne vole le focus à un jeu ou à une autre application. L'avis reste jusqu'à ce que vous le fermiez et revient
après une partie.

Cliquez sur la notification ou sur la pastille pour ouvrir la fenêtre de mise à jour. Elle montre les notes de version de chaque
version que vous avez ignorée et la taille du téléchargement, avec **Mettre à jour**, **Plus tard** et **Ignorer cette version**.
Rien ne se télécharge avant votre choix. Après **Mettre à jour**, la même fenêtre suit le téléchargement, que
vous pouvez annuler ou envoyer en arrière-plan. La pastille de la barre de titre montre l'état et ramène la fenêtre.
Quand le téléchargement se termine, l'installateur affiche sa propre carte de progression et AW Next redémarre. Si un jeu est
en cours, l'installation attend sa fermeture, ou vous pouvez installer quand même depuis la fenêtre. **Paramètres →
Vérifier les mises à jour** ouvre la fenêtre immédiatement. Les mises à jour ne téléchargent que ce qui a changé et reviennent d'elles-mêmes à
l'installateur complet en cas d'échec. L'AppImage Linux se met à jour depuis les mêmes versions (voir
[Mises à jour Linux](linux.md#updates)).

Une version plus récente installée par-dessus une plus ancienne garde vos données dans `%APPDATA%\Achievement Watcher Next` :
paramètres, dossiers surveillés, caches, temps de jeu, journaux, ressources de notification et données de compte locales. Au
premier lancement après la mise à niveau, AW Next importe une installation antérieure :

| Vous venez de | Importé depuis | Ce qui se passe |
|---|---|---|
| Achievement Watcher 3.x | `%APPDATA%\Achievement Watcher 3.0` | Les paramètres, presets, thèmes, jaquettes, caches, sauvegardes et journaux sont repris |
| Achievement Watcher 1.6.8 | `%APPDATA%\Achievement Watcher` | Pareil, pour ceux qui ont sauté la 3.x |
| Une machine neuve | rien | AW Next démarre avec ses réglages par défaut |

L'import ne s'exécute qu'une fois, copie les petits fichiers, crée des liens physiques pour les gros fichiers écrits une seule fois et **ne supprime ni ne
modifie jamais le dossier qu'il a lu**. Les compteurs de temps de jeu stockés dans le registre sont repris aussi, et les
captures d'écran passent dans `Pictures\Achievement Watcher Next` sauf si vous avez choisi votre propre dossier.

La désinstallation propose une seule option, désactivée par défaut : **Supprimer aussi les paramètres, le cache et les données enregistrées** (ou
`--delete-app-data` pour une désinstallation silencieuse), qui retire le dossier de données et le temps de jeu du registre.
Si une mise à jour échoue sans cesse sur le même fichier téléchargé, **Paramètres → Avancé → Vider les caches** supprime
uniquement les caches qu'on peut retélécharger (fichiers de mise à jour, schémas et icônes Steam et Ubisoft, outils de correction d'émulateur).
Les paramètres, les sauvegardes de jeu et les copies de secours restent.

---

**Suite :** [Sources compatibles](sources.md) : ce qu'AW Next sait lire, et ce dont chaque source a besoin.

*Passez directement à ce qu'il vous faut : [Notifications](notifications.md) ·
[Game Health](game-health.md) · [Configuration Goldberg / GBE](emulator-setup.md) ·
[Dépannage](troubleshooting.md)*

<div align="center">

[← Documentation](README.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
