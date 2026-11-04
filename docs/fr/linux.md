---
title: "Suivi de succès pour Linux et Steam Deck"
description: "Installez l'AppImage et gardez-la à jour, associez l'overlay à une touche sous GNOME ou KDE, et lancez vos jeux via Steam, Proton, Lutris, Heroic ou Bottles."
---

# Suivi de succès pour Linux et Steam Deck

AW Next fonctionne sous Linux (x64) comme une application native, jamais via Wine. Il suit les jeux lancés via Steam
et Proton, Wine, Lutris, Heroic ou Bottles, les jeux Linux natifs et les émulateurs pris en charge, avec la
même bibliothèque, les mêmes popups, le même overlay et le même temps de jeu que sous Windows.

La version Linux est une **bêta**. Elle a été testée sous GNOME et KDE Plasma, dans des préfixes Wine et Proton et
avec des jeux de test, mais pas sur beaucoup de vraies machines : un vrai Steam Deck, de vraies manettes, tous les lanceurs et
toutes les versions scene. Si quelque chose ne fonctionne pas, un
[ticket](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) indiquant votre distribution, votre bureau
et vos journaux aide le plus.

## Installation {#install}

1. Ouvrez la [dernière version](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
   et téléchargez `Achievement.Watcher.<version>.AppImage`.
2. Placez-la dans un dossier à vous, comme `~/Applications`, et rendez-la exécutable : dans le gestionnaire
   de fichiers, **Propriétés → Autoriser l'exécution du fichier comme un programme**, ou dans un terminal :

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. Lancez-la et suivez le guide de premier lancement comme sous Windows (voir [Premiers pas](getting-started.md)).

Une AppImage a besoin de FUSE 2, que certaines distributions, dont Ubuntu 24.04, n'installent plus par
défaut. Si le fichier ne démarre pas, installez-le : `libfuse2t64` sous Ubuntu 24.04 et suivantes, `libfuse2` sous
les versions plus anciennes d'Ubuntu et de Debian, `fuse-libs` sous Fedora, `fuse2` sous Arch.

Au premier démarrage, AW Next s'ajoute au menu des applications. **Paramètres → Général → Lancer au
démarrage** le lance, masqué dans la zone de notification, à chaque ouverture de session. Les paramètres, caches, temps de jeu et journaux se trouvent dans
`~/.config/Achievement Watcher Next`.

## Mises à jour {#updates}

L'AppImage se met à jour toute seule depuis les mêmes versions GitHub que l'application Windows. Une nouvelle version est
annoncée par une notification de bureau et la pastille de la barre de titre, et elle demande avant de télécharger. Elle
vérifie ensuite le fichier par rapport à l'empreinte SHA-512 publiée avec la version (`latest-linux.yml`), remplace
l'ancienne AppImage et redémarre. Si un jeu tourne, la mise à jour attend qu'il se ferme. Vos données restent
où elles étaient.

Le nouveau fichier porte la nouvelle version dans son nom. L'entrée **Lancer au démarrage** et la
commande `~/.local/bin/achievement-watcher` la suivent. Un lanceur que vous avez créé vous-même et qui nomme le fichier
AppImage pointe toujours vers l'ancien nom : faites-le plutôt pointer vers cette commande.

## Bureaux pris en charge {#supported-desktops}

AW Next est testé sous GNOME et KDE Plasma, avec Wayland et X11 (Ubuntu 24.04 avec GNOME 46 et
Plasma 5.27), et sous Fedora 44 avec GNOME 50, Plasma 6.7, Hyprland 0.56 et COSMIC 1.0, dans une machine
virtuelle. D'autres bureaux peuvent fonctionner mais n'ont pas été essayés.

- **Wayland.** AW Next se relance une fois via XWayland au démarrage pour que ses popups et son overlay puissent
  rester au-dessus des jeux, qui tournent comme des fenêtres X11 sous Wine et Proton. Hyprland et COSMIC démarrent XWayland
  par défaut. Sans lui (`xwayland.enabled = false` sous Hyprland), AW Next reste une application Wayland native :
  la bibliothèque, la zone de notification et les notifications fonctionnent, mais le compositeur place les popups et l'overlay comme
  n'importe quelle fenêtre, et une popup prend le clavier au jeu pendant qu'elle s'affiche.
- **Zone de notification.** KDE et COSMIC affichent l'icône de la zone de notification telle quelle. GNOME a besoin de l'extension AppIndicator, qu'
  Ubuntu fournit activée. Hyprland a besoin d'une barre avec une zone de notification, comme Waybar avec son module `tray`.
  Sans zone de notification, fermer la fenêtre réduit AW Next au lieu de le masquer ; Hyprland n'a pas de fenêtres
  réduites, donc là il se masque, et relancer AW Next ramène la fenêtre.
- **Les notifications** sont celles du bureau. Ne pas déranger les masque sauf si **Paramètres → Notification →
  Notifications prioritaires** est activé, auquel cas les déblocages s'affichent encore sous GNOME et KDE. Hyprland n'en a
  pas en propre : lancez un démon de notifications comme mako, dunst ou SwayNC. mako dessine sous un jeu en plein
  écran sauf si sa configuration définit `layer=overlay`, et garde chaque notification jusqu'à ce que vous cliquiez dessus sauf si
  elle définit `default-timeout` (en millisecondes). COSMIC retient ses notifications pendant qu'un jeu est en plein
  écran. La popup propre d'AW Next s'affiche au-dessus du jeu dans les deux cas.
- Les options qui n'existent que sous Windows sont signalées comme telles dans les Paramètres.

## Captures d'écran et clips {#screenshots-and-clips}

Les captures d'écran et les clips de chaque déblocage fonctionnent sous X11 et sous Wayland. Les clips sont enregistrés par
gpu-screen-recorder avec la carte graphique quand il est installé. Si vous le choisissez dans les Paramètres, l'enregistreur logiciel
propre à AW Next enregistre des fichiers WebM à la place et montre ce que cela a coûté.

Sous Wayland, la première capture d'écran fait demander au bureau si les applications peuvent prendre des captures (GNOME 47
et suivantes, KDE Plasma 6, COSMIC et Hyprland). AW Next attend quelques secondes la réponse, puis ignore
cette capture, ainsi que celles des déblocages qui arrivent pendant que la question est ouverte. Cliquez sur **Autoriser**, car Entrée
choisit **Refuser** sous GNOME et Hyprland, et les captures suivantes se font sans un mot. Si vous refusez,
AW Next ne prend aucune capture et ne redemande pas. Pour qu'on vous le redemande à la prochaine capture,
exécutez :

```bash
flatpak permission-remove screenshot screenshot
```

L'enregistreur logiciel capture l'écran via la boîte de dialogue de partage d'écran du bureau, qui revient
à chaque démarrage de jeu et, sous COSMIC et Hyprland, sort le jeu du plein écran.
gpu-screen-recorder ne demande qu'une fois.

## Raccourci de l'overlay {#overlay-shortcut}

`Ctrl+Maj+K` ouvre l'overlay pendant qu'un jeu Wine ou Proton a le focus. Sous Wayland, AW Next ne peut pas
voir une touche pressée pendant qu'une **fenêtre Wayland native** a le focus, comme un jeu Linux en mode Wayland ou
Proton avec son pilote Wayland. Il n'y a pas de raccourci en jeu pour ces jeux.

Un raccourci défini dans les réglages du clavier de votre bureau n'en dépend pas. Faites-lui exécuter cette commande,
en remplaçant `you` par votre nom d'utilisateur (GNOME n'étend pas `~`, écrivez donc le chemin complet) :

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

Elle ouvre ou ferme l'overlay de la copie déjà lancée et ne démarre rien d'autre. La commande existe
dès le premier démarrage de l'AppImage, et AW Next la met à jour à chaque démarrage, si bien qu'elle suit les mises à jour.

- **GNOME :** **Paramètres → Clavier → Voir et personnaliser les raccourcis → Raccourcis personnalisés → Ajouter un raccourci**.
  Nommez-le, collez la commande, puis appuyez sur les touches voulues.
- **KDE Plasma 6 :** **Configuration du système → Clavier → Raccourcis → Ajouter nouveau → Commande ou script**, collez
  la commande, puis définissez le raccourci.
- **KDE Plasma 5 :** **Configuration du système → Raccourcis → Raccourcis personnalisés → Modifier → Nouveau → Raccourci global →
  Commande/URL**. Réglez les touches dans **Déclencheur** et la commande dans **Action**.
- **Hyprland** 0.55 et suivantes, dans `~/.config/hypr/hyprland.lua` :

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  Dans un ancien `hyprland.conf`, la même ligne s'écrit
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`.
  Hyprland prend les touches avant toute fenêtre, si bien qu'un appui ouvre ou ferme l'overlay une seule fois,
  quel que soit le jeu.
- **COSMIC :** **Paramètres → Périphériques d'entrée → Clavier → Raccourcis clavier → Raccourcis personnalisés → Ajouter un
  raccourci**. Renseignez **Nom du raccourci** et **Commande**, puis tapez les touches. Cela fonctionne aussi avec un jeu
  Wayland natif. Le réglage **Raccourcis globaux dans les applications X11** de COSMIC n'aide pas : AW Next
  ne voit toujours pas les touches dans ce cas.

Sous Hyprland et COSMIC, l'overlay s'affiche au-dessus d'un jeu en plein écran, Wine ou Wayland natif. Avec
**Donner le focus à l'overlay à l'ouverture** activé (voir le [guide de la manette](controller.md)), les deux sortent le jeu
du plein écran pour l'afficher. Sous Hyprland, cette règle de fenêtre garde le jeu en plein écran et l'overlay
au-dessus :

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

Une manette fonctionne aussi. AW Next lit directement les gamepads, donc les raccourcis de manette du
[guide de la manette](controller.md) ouvrent et pilotent l'overlay sans rien prendre au jeu.
Pendant que Steam Input tourne, AW Next ne lit que les manettes virtuelles de Steam, si bien qu'un appui n'est pas compté deux fois.

## Invite du trousseau {#keyring-prompt}

Les quelques secrets qu'AW Next conserve (jetons de connexion Steam, Epic, Xbox et PlayStation, la clé RetroAchievements,
un mot de passe Steam d'émulateur) sont chiffrés avec une clé conservée par le trousseau de votre bureau : GNOME Keyring
ou KDE Wallet. Hyprland n'en a pas en propre et utilise celui qui est installé, qui démarre quand AW Next le
demande pour la première fois.

Avec la **connexion automatique**, le trousseau n'est pas déverrouillé au démarrage de la session. La première fois qu'AW Next
en a besoin, le bureau vous demande de le déverrouiller, ou d'en créer un s'il n'y en a pas ; KDE ouvre l'assistant
KDE Wallet. Répondez et AW Next continue. Si vous annulez, AW Next continue de fonctionner, dit une fois que
vos connexions ne sont pas protégées, et le bureau redemande au démarrage suivant. L'invite ne bloque jamais l'application :
le suivi et les notifications fonctionnent pendant qu'elle est ouverte.

## Steam et Proton {#steam-and-proton}

AW Next trouve le client Steam, qu'il vienne de votre distribution (`steam-installer`, `steam`),
de Flathub ou d'un Snap, ainsi que ses dossiers de bibliothèque sur d'autres disques et le préfixe Proton de chaque jeu.
Avec deux clients Steam installés, il suit celui qui a été lancé en dernier.

Les déblocages des jeux que Steam lance lui-même sont lus dans les fichiers propres de Steam, comme sous Windows. AW Next ne les affiche
en popup qu'une fois **Paramètres → Notification → Jeux du client Steam** activé, puisque Steam affiche sa propre popup pour
eux.

## Wine, Lutris, Heroic et Bottles {#wine-lutris-heroic-and-bottles}

Chaque source est lue à l'intérieur du préfixe du jeu, registre Windows compris : un jeu avec un émulateur Steam
(Goldberg, GBE Fork et les autres de [Sources compatibles](sources.md)), une sauvegarde Ubisoft ou GOG,
et ainsi de suite. **Recherche auto** explore votre dossier personnel, vos autres disques et tous les préfixes qu'elle connaît.

- **Lutris** et **Bottles** : les jeux et programmes qu'ils ont installés sont listés avec leur préfixe.
- **Heroic** : les jeux Epic installés via Heroic sont reconnus comme des jeux Epic.
- **Wine seul** : le préfixe par défaut `~/.wine` et tout dossier de préfixe que vous ajoutez.
- Les **jeux Linux natifs** avec Goldberg ou GBE Fork (`libsteam_api.so`) sont lus dans leurs dossiers de sauvegarde
  Linux.

**Jouer** lance un jeu via le lanceur auquel il appartient (Steam, Lutris, Heroic), et le temps de jeu est
compté à partir du processus du jeu. Les réparations d'émulateur de [Game Health](game-health.md) fonctionnent depuis
l'AppImage et écrivent dans le préfixe du jeu, avec une sauvegarde comme toujours.

## Émulateurs {#emulators}

RPCS3, shadPS4, RetroArch et Xenia sont trouvés dans leurs dossiers Linux ; RPCS3 et shadPS4 aussi quand ils
viennent de Flathub. Les déblocages RetroAchievements sont annoncés quel que soit l'émulateur, une fois la source
connectée.

## Steam Deck {#steam-deck}

La prise en charge du Steam Deck est récente et **n'a pas été vérifiée sur un vrai Deck**. Ce qu'elle est censée faire :

- En **Mode Bureau**, AW Next est la même AppImage que sur n'importe quel bureau Linux. La première fenêtre tient dans l'écran de
  1280x800 du Deck, et les jeux sur la carte microSD sont trouvés.
- Avec **Lancer au démarrage** activé, AW Next fonctionne aussi en **Mode Jeu** : il démarre comme un service
  en arrière-plan une fois Steam lancé.
- Le Mode Jeu n'affiche pas de notifications de bureau, donc AW Next dessine chaque déblocage comme sa propre popup par-dessus le
  jeu, depuis le coin supérieur gauche. La surcouche de performances de SteamOS peut masquer cette popup.
- Le **plugin Decky** du dossier `decky/` du dépôt envoie chaque déblocage aux notifications propres de Steam,
  que le Mode Jeu dessine toujours. Pendant qu'il écoute, AW Next garde sa propre popup désactivée, si bien que
  vous ne voyez qu'une notification. Sans le plugin, la popup sert de repli. Pour l'instant, vous l'installez à la
  main : compilez-le (`npm install`, puis `npm run build`) et copiez-le dans
  `~/homebrew/plugins/achievement-watcher/`, comme l'explique son
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md).
  Il faut qu'AW Next tourne avec son flux websocket activé, ce qui est le réglage par défaut.

La popup a été vérifiée dans une session Mode Jeu reproduite sur un PC, et le plugin Decky n'a que des tests
unitaires. Si vous essayez l'un ou l'autre sur un vrai Deck, un
[ticket](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) décrivant ce que vous avez vu aide.

## Signaler un problème {#reporting-a-problem}

Indiquez votre distribution, votre bureau (GNOME ou KDE, Wayland ou X11), la façon dont le jeu tourne (Steam avec Proton,
Lutris, Heroic, Bottles, Wine) et les fichiers de `~/.config/Achievement Watcher Next/logs`.

---

**Suite :** [Dépannage](troubleshooting.md), pour les problèmes de détection, de progression, de notification et de temps
de jeu.

<div align="center">

[← Documentation](README.md) · [Premiers pas](getting-started.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
