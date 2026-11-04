---
title: "FAQ du suivi de succès"
description: "Réponses courtes sur les comptes, les sources, les notifications, la sécurité, les sauvegardes et les plateformes prises en charge par Achievement Watcher Next."
---

# FAQ du suivi de succès

Réponses courtes aux questions habituelles. Chacune renvoie au guide qui la traite.

## Mise en route {#getting-set-up}

### Ai-je besoin d'une clé d'API Web Steam, ou de me connecter à Steam ? {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
Non. Les listes de succès viennent d'une chaîne de points d'accès publics qui n'exige aucune clé, et rien n'exige de
compte. Vos propres déblocages Steam sont lus dans les statistiques que Steam conserve sur ce PC, donc un profil privé
fonctionne pour tous les jeux joués ici. Connecter Steam est facultatif : cela ajoute les jeux joués uniquement sur vos
autres PC, et le Partage familial Steam. Voir [Comptes connectés](sources.md#connected-accounts).

### Sur quelles plateformes fonctionne-t-il ? {#which-platforms-does-it-run-on}
Windows 10 et 11, et Linux (x64). Les versions embarquent leur propre environnement d'exécution. Node.js n'est nécessaire que pour
compiler depuis les sources.

### Fonctionne-t-il sous Linux ou sur le Steam Deck ? {#does-it-run-on-linux-or-the-steam-deck}
Sous Linux, oui, en bêta : une AppImage native (jamais lancée via Wine) pour GNOME et KDE Plasma, sous
Wayland ou X11. Il retrouve les jeux lancés avec Steam et Proton, Wine, Lutris, Heroic ou Bottles, et se met à jour
tout seul depuis les mêmes versions que l'application Windows. Sur le Steam Deck, la prise en charge est récente et n'a pas été
vérifiée sur un vrai Deck. Voir [Linux et Steam Deck](linux.md).

### Prend-il en charge RetroAchievements ? {#does-it-support-retroachievements}
Oui. Activez la source **RetroAchievements**, connectez votre compte avec son nom d'utilisateur et sa clé Web API,
et **Importer la bibliothèque** ramène chaque jeu auquel vous avez joué. Les nouveaux déblocages sont annoncés tant qu'un
émulateur compatible RetroAchievements tourne. Voir [RetroAchievements](sources.md#retroachievements).

### Affiche-t-il les trophées PlayStation ? {#does-it-show-playstation-trophies}
Oui. Connectez votre compte PlayStation dans **Paramètres → Sources** (vous vous connectez sur la page de Sony) et vos
jeux et trophées sont importés, avec le taux de Sony pour chaque trophée. Un jeu d'une autre source qui est
aussi sorti sur PlayStation affiche le vrai platine de sa liste. Voir
[Comptes connectés](sources.md#connected-accounts).

### Dois-je connecter un compte ? {#do-i-have-to-connect-an-account}
Non. Steam, Epic, Xbox PC et PlayStation peuvent chacun être connectés pour lire ce que les fichiers locaux ne contiennent pas,
et RetroAchievements demande votre nom d'utilisateur et votre clé Web API. Chaque jeton et chaque clé est chiffré avant
d'être stocké sur ce PC. Tout le reste fonctionne sans compte.

### Fonctionne-t-il hors ligne ? {#does-it-work-offline}
Oui, pour les sources locales et tout ce qui est déjà en cache. Les noms, descriptions et visuels des succès sont
récupérés une fois, puis réutilisés depuis `%APPDATA%\Achievement Watcher Next\steam_cache`
(`~/.config/Achievement Watcher Next/steam_cache` sous Linux).

### Perd-on quelque chose en choisissant le mode Simple ? {#do-i-lose-anything-by-choosing-simple-mode}
Non. Simple masque des commandes et ne désactive jamais une fonction. Rien de ce qui scanne, surveille ou est stocké
ne change, et revenir en arrière restaure chaque commande avec sa valeur. Voir
[Premiers pas](getting-started.md#simple-and-advanced).

### Peut-il afficher des jeux que je possède sans les avoir installés, ou des déblocages d'un autre PC ? {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
Oui. Avec la source Steam réglée sur **Possédé**, deux interrupteurs de la carte du compte Steam, **Ajouter les jeux que vous
possédez** et **Ajouter les jeux partagés avec vous par le Partage familial Steam**, listent toute votre bibliothèque. Les deux
sont désactivés par défaut parce qu'une grande bibliothèque allonge beaucoup le premier scan. Avec un compte Steam
connecté, un jeu sans rien à lire en local est lu depuis votre profil Steam (ses détails du jeu
doivent être publics) et la réponse est mise en cache pendant six heures. Voir
[Comptes connectés](sources.md#connected-accounts).

## La bibliothèque {#the-library}

### Un jeu est manquant {#a-game-is-missing}
Vérifiez que sa source est activée dans **Paramètres → Sources**, lancez **Recherche auto** sous **Paramètres →
Dossiers**, et désactivez **Afficher uniquement les jeux installés** pour voir si le jeu est connu mais n'est plus
installé. La liste de vérification complète se trouve dans [Dépannage](troubleshooting.md#a-game-is-missing).

### Un jeu affiche « Pas de succès » {#a-game-shows-no-achievements}
Ce jeu n'a pas d'ensemble de succès. Il reste lançable et continue de suivre le temps de jeu, et il est exclu
des statistiques de complétion au lieu d'être compté à 0 %. Sa tuile affiche une illustration à la place de la barre de progression.
**Paramètres → Apparence → Tuiles de la bibliothèque → Barre des jeux sans succès** ramène la
barre.

### Un jeu affiche 0 % alors que j'ai débloqué des succès {#a-game-shows-0-although-i-have-unlocked-achievements}
Le jeu a un schéma mais pas de fichier de déblocage à l'exécution. Ouvrez son panneau [Game Health](game-health.md) : il
nomme l'élément manquant et ne propose que les réparations qui s'appliquent.

### Pourquoi le même jeu apparaît-il deux fois ? {#why-does-the-same-game-appear-twice}
Il a été trouvé par deux sources. **Fusionner les doublons** dans Paramètres → Général les combine. Si une
entrée est un dossier de sauvegarde périmé d'un jeu que vous possédez maintenant ailleurs, mettez-la sur liste noire.

### Une mise à jour du jeu a ajouté des succès et je ne les vois pas {#a-game-update-added-achievements-and-i-do-not-see-them}
Une liste en cache se revérifie toute seule tous les 3 jours. Pour récupérer les nouveaux tout de suite, utilisez **Paramètres → Avancé →
Revérifier les listes de succès**, qui fonctionne même avec **Mises à jour automatiques des données de succès** désactivé. Aucune des deux
vérifications ne supprime quoi que ce soit déjà en cache.

### Un jeu a été associé à la mauvaise version Steam {#a-game-was-matched-to-the-wrong-steam-release}
Faites un clic droit dessus et choisissez **Définir l'AppID manuellement...**. L'AppID est écrit dans `steam_appid.txt` et
mémorisé pour ce dossier d'installation. Voir [Définir l'AppID d'un jeu à la main](advanced.md#set-a-games-appid-by-hand).

## Notifications {#notifications}

### Rien n'apparaît quand je débloque quelque chose {#nothing-appears-when-i-unlock-something}
Commencez par la ligne Notifications du panneau [Game Health](game-health.md) de ce jeu, qui nomme le
canal qui a diffusé en dernier et pourquoi. Suivez ensuite
[Si un test ou un déblocage n'apparaît pas](notifications.md#if-a-test-or-unlock-does-not-appear).

### La popup de l'overlay ne s'affiche pas dans un jeu en particulier {#the-overlay-popup-does-not-show-in-one-particular-game}
Ce jeu est probablement en plein écran exclusif, où une popup toujours au premier plan ne peut pas être dessinée. En
**Automatique**, AW Next envoie ce déblocage sous forme de notification Windows affichée par-dessus le jeu. Un jeu en
mode exclusif hérité ne laisse rien passer : passez-le en mode sans bordure. Voir
[comment Automatique décide](notifications.md#how-automatic-decides).

### Les notifications sont masquées pendant que je joue {#notifications-are-hidden-while-i-play}
C'est le mode Ne pas déranger de Windows. Activez **Notifications prioritaires** et approuvez la demande unique de Windows.
Voir [Notifications Windows prioritaires](notifications.md#priority-windows-notifications).

### Puis-je changer l'apparence de la popup, ou partager un design ? {#can-i-change-how-the-popup-looks-or-share-a-design}
Oui. Dix presets sont livrés avec l'application, le **concepteur de presets** construit les vôtres avec des commandes ordinaires,
et tout preset s'exporte dans un seul fichier `.awpreset`. Voir [Presets et concepteur de presets](presets.md).

### Puis-je afficher mes déblocages sur mon stream ? {#can-i-put-unlocks-on-my-stream}
Oui, avec une source Navigateur dans OBS. Capturer la popup comme une fenêtre ne peut pas marcher, puisqu'elle n'existe que pendant
un déblocage et disparaît avant qu'OBS la liste, donc AW Next sert la même popup sous forme de page. L'adresse se trouve
dans Paramètres → Notification → **Source navigateur OBS**. Voir
[Afficher les déblocages en stream (OBS)](notifications.md#show-unlocks-on-stream-obs).

### L'overlay est-il la même chose que la popup ? {#is-the-overlay-the-same-thing-as-the-popup}
Non. La popup est une notification ponctuelle stylisée par un preset. L'**overlay** est la liste complète des succès
que vous ouvrez avec `Ctrl+Maj+K` pendant qu'un jeu tourne. Voir le [guide de l'overlay](overlay.md).

### Sous Linux, Ctrl+Maj+K ne fait rien dans mon jeu {#on-linux-ctrlshiftk-does-nothing-in-my-game}
Sous Wayland, AW Next ne voit pas les touches pressées pendant qu'une fenêtre Wayland native a le focus, comme un
jeu Linux en mode Wayland ou Proton avec son pilote Wayland. Associez une touche, dans les réglages du clavier de votre bureau,
à `/home/you/.local/bin/achievement-watcher --toggle-overlay`, en remplaçant `you` par votre nom
d'utilisateur. AW Next garde cette commande pointée sur l'AppImage actuelle, donc le raccourci survit aux
mises à jour. Voir [Raccourci de l'overlay](linux.md#overlay-shortcut).

## Sécurité et données {#safety-and-data}

### AW Next modifie-t-il mes jeux, ou envoie-t-il quelque chose hors de mon PC ? {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
Seulement si vous le demandez. La lecture des succès est en lecture seule. Les outils de réparation d'émulateur (le sous-menu
**Émulateur et outils** du clic droit d'un jeu et **Paramètres → Émulateurs**) écrivent dans un dossier de jeu, toujours
après une confirmation et avec une sauvegarde. Utilisez-les uniquement avec des jeux que vous possédez. En dehors des recherches en lecture seule
et de ce qu'un compte connecté renvoie, rien ne quitte ce PC. Voir
[Ce qui quitte ce PC](README.md#what-leaves-this-pc).

### Mon antivirus a signalé ou supprimé un fichier {#my-antivirus-flagged-or-removed-a-file}
C'est presque certainement l'émulateur Steam ou un chargeur Ubisoft, et un faux positif : ces fichiers se substituent
à la bibliothèque Steam ou Ubisoft d'un jeu, ce qui est le comportement que recherchent les moteurs de détection. Rien n'est
écrit sauf si vous avez lancé une réparation, ouvert **Paramètres → Émulateurs**, ou activé la réparation automatique. Autorisez
le fichier que votre antivirus a nommé, ou excluez `%APPDATA%\Achievement Watcher Next\cache`. Ne désactivez jamais
la protection. Voir [Dépannage → Antivirus](troubleshooting.md#antivirus-or-smartscreen-warning).

### Windows SmartScreen avertit à propos de l'installateur {#windows-smartscreen-warns-about-the-installer}
Les versions sont signées avec le certificat propre au projet, épinglé par son empreinte, plutôt qu'avec un certificat commercial,
donc SmartScreen peut demander une confirmation. Vous n'avez jamais besoin d'installer ce certificat : l'outil de mise à jour intégré
vérifie le signataire, l'empreinte épinglée et que le fichier n'a pas été modifié après la signature
avant d'installer quoi que ce soit. Téléchargez uniquement depuis la
[page officielle des versions](https://github.com/Shirowwww/Achievement-Watcher-Next/releases). Pour vérifier un
installateur vous-même, exécutez `Get-FileHash <installer> -Algorithm SHA256` et ouvrez
`https://www.virustotal.com/gui/file/<hash>`. La version actuelle est la
[3.12.5](https://www.virustotal.com/gui/file/364b7ecdc1d039e74066ec924453ba665ff33b36dded965703c3373fa53b58ea).
Voir [Dépannage → Vérifier une version vous-même](troubleshooting.md#checking-a-release-yourself).

### Sous Linux, pourquoi une invite de trousseau apparaît-elle ? {#on-linux-why-does-a-keyring-prompt-appear}
AW Next chiffre ses jetons de connexion avec une clé conservée par le trousseau de votre bureau (GNOME Keyring ou KDE
Wallet). Avec la connexion automatique, le trousseau reste verrouillé, donc le bureau vous demande de le déverrouiller ou d'en créer
un au démarrage d'AW Next. Annuler ne risque rien : l'application continue de fonctionner et l'invite revient au démarrage suivant.
Voir [Invite du trousseau](linux.md#keyring-prompt).

### Où sont mes données, une mise à jour les efface-t-elle, et quelle est la taille des mises à jour ? {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
Tout est dans `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next` sous Linux),
et installer une version plus récente le conserve. Le premier lancement après une mise à niveau importe un ancien dossier
d'Achievement Watcher sans le modifier ni le supprimer. Les mises à jour ne téléchargent que ce qui a changé depuis votre
version installée, et reviennent d'elles-mêmes à un téléchargement complet en cas d'échec. Voir
[Mises à jour et données existantes](getting-started.md#updates-and-existing-data).

### Comment passer à un nouveau PC, ou sauvegarder ma configuration ? {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**Paramètres → Avancé → Sauvegarde du profil → Exporter le profil…** écrit vos paramètres, vos choix de bibliothèque,
presets, thèmes, jaquettes et temps de jeu dans un seul fichier `.awbackup`. Installez AW Next sur le nouveau PC, choisissez
**Restaurer le profil…**, et il est appliqué au démarrage suivant ; les fichiers qu'il remplace sont conservés. Les connexions
ne sont jamais enregistrées, donc reconnectez Steam, Epic, Xbox, PlayStation et RetroAchievements. Voir
[Sauvegarde du profil](advanced.md#profile-backup).

### Existe-t-il une version portable ? {#is-there-a-portable-version}
Oui. Le ZIP portable garde l'application et ses données dans un seul dossier et consulte le même flux de versions que
l'application installée. Il ne télécharge ni n'exécute jamais l'installateur : il propose la page de la version quand une version plus récente
est disponible, et extraire la nouvelle archive par-dessus l'ancien dossier conserve vos données.

### Comment quitter complètement ? {#how-do-i-quit-completely}
Fermer la fenêtre garde AW Next dans la zone de notification pour que le suivi continue. Utilisez le menu de la zone de notification pour quitter.

## Le projet {#the-project}

### Fonctionne-t-il avec les jeux Goldberg, GBE Fork et CODEX ? {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
Oui. AW Next lit les fichiers de succès qu'écrivent Goldberg, GBE Fork, CODEX, RUNE et CPY, et il peut
installer et réparer l'environnement GBE Fork d'un jeu. Voir [Sources compatibles](sources.md) et
[Configuration de Goldberg et GBE Fork](emulator-setup.md).

### Est-ce la même application que l'Achievement Watcher de Xan105 ? {#is-this-the-same-app-as-xan105s-achievement-watcher}
Non, c'est une continuation. AW Next prolonge l'Achievement Watcher de Xan105 et la branche 2.x de darktakayanagi,
sur un environnement Electron actuel, avec la prise en charge de Linux, davantage de sources et un rapport de santé par jeu
avec des réparations guidées. Voir la [Comparaison](comparison.md).

### Est-ce sûr avec des jeux piratés ? {#is-it-safe-to-use-with-cracked-games}
La lecture des succès est en lecture seule. Les outils de réparation n'écrivent dans un dossier de jeu qu'après une confirmation et
avec une sauvegarde, et la réparation automatique est désactivée par défaut. Utilisez-les uniquement avec des jeux que vous possédez. Un antivirus
peut signaler un fichier d'émulateur comme faux positif. Voir
[Dépannage → Antivirus](troubleshooting.md#antivirus-or-smartscreen-warning).

### En quoi diffère-t-il d'Achievement Watcher 2.x ? {#how-does-this-differ-from-achievement-watcher-2x}
AW Next le prolonge avec un environnement moderne et un grand travail de compatibilité, de fiabilité et de
fonctionnalités. Voir la [Comparaison](comparison.md).

### Peut-il me procurer des jeux, des clés ou des comptes ? {#can-it-get-me-games-keys-or-accounts}
Non, et le suivi des tickets ne peut pas non plus aider pour cela. AW Next ne contient aucun fichier de jeu et ne contourne
pas les vérifications de propriété en ligne.

### J'ai trouvé un bug ou j'ai une idée {#i-found-a-bug-or-have-an-idea}
[Ouvrez un ticket](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) avec la version de l'application,
votre version de Windows (ou votre distribution Linux et votre bureau), la source concernée et les journaux pertinents.
Signalez une vulnérabilité présumée en privé via la
[politique de sécurité](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md). Pour une
question, ou pour de l'aide avant de savoir s'il s'agit d'un bug, demandez sur le [serveur Discord](https://discord.gg/DjTMrDsXTh).

---

**Toujours bloqué ?** [Dépannage](troubleshooting.md) passe en revue chaque symptôme dans l'ordre.

<div align="center">

[← Documentation](README.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
