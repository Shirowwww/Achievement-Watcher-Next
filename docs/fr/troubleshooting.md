---
title: "Dépannage"
description: "Solutions pour les jeux manquants, la progression erronée, les notifications qui n'apparaissent pas, le temps de jeu et les alertes de l'antivirus ou de SmartScreen."
---

# Dépannage

## Commencez ici {#start-here}

Si le problème concerne **un seul jeu**, ouvrez d'abord le panneau **[Game Health](game-health.md)** de ce jeu.
Il indique si AW Next peut voir le jeu, lire ses succès et annoncer ses déblocages, et
ne propose que les réparations qui s'appliquent. La plupart des problèmes d'un seul jeu s'arrêtent là.

Utilisez le reste de cette page pour les problèmes qui touchent toute l'application. **Paramètres → Aide** en propose une
version courte des premières vérifications sous *Quelque chose ne va pas* (Game health et Dépannage), et sa
ligne *Votre configuration actuelle* montre votre thème, votre mode de notification, votre manette, le raccourci de l'overlay et le nombre de
sources activées. Pour une question avant d'être sûr qu'il s'agit d'un bug, demandez sur le
[serveur Discord](https://discord.gg/DjTMrDsXTh). Dans un rapport de bug, indiquez la version de l'application, la version de
Windows, la source concernée, les étapes exactes et les journaux pertinents.

## Sous Linux {#on-linux}

L'application Linux a des problèmes que cette page ne couvre pas. L'AppImage ne démarre pas sans FUSE 2
(`libfuse2t64` sous Ubuntu 24.04). Le trousseau ne demande son mot de passe qu'avec la connexion automatique. Le
raccourci de l'overlay sous Wayland est à associer dans les réglages du clavier de votre bureau. Chacun a sa solution
dans [Linux et Steam Deck](linux.md#install). Le reste de cette page décrit Windows ; sous Linux,
les journaux sont dans `~/.config/Achievement Watcher Next/logs`.

## Ouvrir les journaux et les données locales {#open-logs-and-local-data}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Paramètres - Avancé, diagnostics"></picture><br>
<sub>Versions de l'application et de l'environnement, et accès rapide aux journaux, aux données et aux vérifications de mise à jour</sub>
</div>

L'onglet **Avancé** n'existe qu'en mode Avancé. Si vous ne le voyez pas, passez le contrôle **Interface**
en haut des **Paramètres** de Simple à Avancé ; on ne perd rien en revenant en arrière (voir
[getting-started.md](getting-started.md#simple-and-advanced)).

**Paramètres → Avancé → Diagnostics** ouvre le dossier des journaux ou des données. Le chemin des journaux par défaut est :

```text
%APPDATA%\Achievement Watcher Next\logs
```

Les fichiers les plus utiles sont en général `Achievement Watcher.log`, `renderer.log`, `parser.log` et les
journaux du Watchdog de la source concernée. Une défaillance qui traverse le scan, l'interface et les notifications en demande
plusieurs : utilisez donc **Exporter les journaux (.zip)** dans la même carte plutôt que de copier les fichiers à la main :
les processus qui écrivent les journaux ne s'arrêtent jamais, si bien qu'une copie manuelle peut saisir une ligne à moitié écrite. L'
export fonctionne pendant que l'application tourne et ajoute un `about.txt` avec les versions de l'application, d'Electron, de Node et de Chrome.

L'archive est destinée à un ticket public, ses copies sont donc masquées : votre nom d'utilisateur Windows dans chaque
chemin devient `[username]`, et les clés, jetons et mots de passe deviennent `[redacted]`, `[token]` ou
`[apikey]`. Les journaux sur votre disque ne changent pas, et un fichier qui ne peut pas être masqué est exclu.
Le masquage repose sur des formes connues, relisez donc les fichiers avant de les publier ; un dossier de jeu qui porte votre nom,
par exemple, reste tel quel.

Les journaux sont complétés, jamais tronqués, si bien qu'un plantage survit au lancement suivant. Chaque exécution commence par un
repère, suivi d'un bloc `[diag]` avec ce qu'un rapport de bug demande : versions, chemins d'installation et de données,
la manière dont l'application a été lancée, la langue et le thème, et la géométrie de chaque écran :

```text
===== session 2026-08-11T00:53:31.890Z pid=19276 =====
[diag] app: Achievement Watcher 3.10.0 (packaged)
[diag] runtime: electron 43.4.0 · chrome 150.0.7871.224 · node 24.18.1 · v8 15.0
[diag] display: 3056414223 1080x1920 @1x work=1080x1872 rotation=270
[diag] display: 3933707034 (primary) 2048x1152 @1.25x work=2048x1104 rotation=0
```

Collez ce bloc dans un ticket. Les problèmes de taille et de placement de fenêtre viennent presque toujours de la mise à l'échelle de l'affichage
ou de plusieurs moniteurs, et les lignes `[MainWindow]` qui suivent consignent les limites et l'écran de la fenêtre
à chaque fois qu'elle est affichée, déplacée, redimensionnée ou fermée.

Chaque fichier de journal passe à `<name>.log.1` au-delà de 2 Mo, de sorte qu'une génération plus ancienne est conservée.

## Un jeu est manquant {#a-game-is-missing}

1. Ouvrez **Paramètres → Sources** et vérifiez que l'intégration concernée est activée.
2. Ouvrez **Paramètres → Dossiers**, lancez **Recherche auto**, puis utilisez **Générer les configs** pour un scan complet.
3. Ajoutez à la main la bibliothèque de jeux ou la racine des sauvegardes si elle utilise un emplacement personnalisé.
4. Désactivez **Afficher uniquement les jeux installés** pour voir si le jeu est connu mais n'est plus considéré comme
   installé.
5. Pour les sauvegardes d'émulateur, lancez le jeu une fois pour qu'il crée un dossier d'exécution.

S'il ne reste que des résidus d'anciennes sauvegardes et que les fichiers du jeu ont disparu, le filtre des jeux installés masque
l'entrée.

Un jeu dont les métadonnées n'ont pas pu être récupérées reste dans la liste : ce qui est sur le disque décide qu'un jeu
existe, et la recherche en ligne ne fait que l'enjoliver. L'entrée affiche le nom connu en local et
se complète lors d'un scan ultérieur.

## Les succès restent verrouillés ou affichent 0 % {#achievements-stay-locked-or-show-0}

Sans fichier de déblocage d'exécution, c'est 0 %, même avec une liste de succès complète.

Ouvrez le panneau **[Game Health](game-health.md)** du jeu : il nomme l'élément manquant et propose la
réparation, qu'il s'agisse de réécrire les données de succès, de restaurer le fichier d'émulateur ou de corriger un
`steam_appid.txt` qui désigne un autre jeu. Pour vérifier à la main :

- vérifiez que l'AppID ou l'identifiant de plateforme détecté correspond au bon jeu ;
- vérifiez s'il y a un chemin de sauvegarde personnalisé ;
- ne réparez un schéma `steam_settings` inadapté qu'après avoir examiné le rapport ;
- si vous avez joué sur un autre PC, connectez ce compte Steam : un jeu sans rien à lire en local est
  alors lu depuis votre profil Steam, dont les détails du jeu doivent être publics. La réponse est mise en cache pendant six
  heures (voir [Comptes connectés](sources.md#connected-accounts)).

Les sauvegardes d'émulateur Steam peuvent être réparties entre `%APPDATA%\GSE Saves` et
`%APPDATA%\Goldberg SteamEmu Saves` pour le même jeu. AW Next lit celui qui contient les déblocages, vous
n'avez donc pas à corriger cela à la main.

Un jeu sans ensemble de succès n'a pas de barre de progression plutôt que 0 % (ou **Pas de succès**, si vous
avez rétabli cette barre dans **Paramètres → Apparence → Tuiles de la bibliothèque**) et il est exclu des
statistiques de complétion.

**Cela fonctionne depuis le bouton Jouer d'AW Next mais pas depuis un raccourci Steam.** Un jeu piraté ajouté à Steam
comme jeu hors Steam est lancé avec son propre identifiant de jeu, et GBE Fork lit cet identifiant avant son
`steam_appid.txt`, si bien que les déblocages sont enregistrés sous le numéro du raccourci et n'atteignent jamais la carte du
jeu. Steam transmet le vrai identifiant quand un `steam_appid.txt` se trouve dans le dossier de démarrage du raccourci (Démarrer
dans) ; un fichier placé seulement à côté de l'exécutable n'est pas lu. Game Health signale un raccourci dont le dossier de démarrage
en est dépourvu, et sa réparation y écrit le fichier.

**Un crack scene est utilisé et rien n'est jamais enregistré.** Certains cracks ne rapportent jamais de succès.
Après une heure de jeu sans rien d'enregistré, Game Health le dit et, quand ce crack est le fichier de la bibliothèque
Steam du jeu, propose d'installer par-dessus l'émulateur pris en charge, et de l'annuler plus tard.

**Halo: Campaign Evolved et The Crew Motorfest n'enregistrent rien hors ligne.** Les serveurs de l'éditeur
attribuent leurs succès, donc aucun crack ni émulateur ne peut les enregistrer. Leur panneau Game Health le dit.

Voir [Configuration de Goldberg et GBE Fork](emulator-setup.md#common-problems) ou [Configuration de Goldberg Uplay R2](uplay-r2.md#achievements-remain-at-0) pour des étapes propres à chaque source.

## Le mauvais jeu a été associé {#the-wrong-game-was-matched}

Quand le nom du dossier d'un jeu correspond à plusieurs versions Steam et que l'association automatique a choisi la mauvaise,
faites un clic droit dessus et choisissez **Définir l'AppID manuellement...**. L'AppID saisi est écrit dans
`steam_appid.txt` et mémorisé pour ce dossier d'installation, de sorte que les réparations ultérieures l'utilisent ; **Effacer l'AppID manuel**,
dans le même menu, l'annule. La réparation **Corriger le fichier d'identification** de Game Health demande
elle aussi l'AppID. Détails : [Définir l'AppID d'un jeu à la main](advanced.md#set-a-games-appid-by-hand).

Une différence n'est pas toujours la faute de l'émulateur. S'il a été configuré exprès pour l'ID présent sur le disque, laissez-le
tel quel.

## Des noms, des descriptions ou des visuels sont manquants {#names-descriptions-or-artwork-are-missing}

- Actualisez en étant en ligne pour que l'application puisse réessayer ses sources de métadonnées.
- Vérifiez l'identité de plateforme du jeu ; un mauvais AppID Steam peut renvoyer des métadonnées convaincantes mais sans
  rapport.
- Pour Goldberg/GBE, un schéma local valide peut combler une partie des textes manquants hors ligne.
- Utilisez les actions de jaquette du jeu pour réessayer ou choisir un visuel local quand les sources automatiques échouent.

Une carte intitulée par son seul AppID Steam signifie que la recherche du nom est revenue vide alors que le visuel,
qui ne dépend que de l'AppID, a été résolu. Le scan suivant remplace le numéro dès que la recherche
aboutit.

Les succès de DLC et de mise à jour affichent leur groupe d'appartenance sous le titre (par exemple une étiquette « Hearts of
Stone »), d'après les ensembles de succès propres à Steam ou, pour un jeu qui n'en a pas, d'après SteamHunters.

Les descriptions de succès masqués restent masquées quand toutes les sources disponibles les omettent.

## Une mise à jour du jeu a ajouté des succès qui n'apparaissent pas {#a-game-update-added-achievements-that-arent-showing-up}

Un schéma en cache se revérifie auprès de Steam tous les 3 jours, puisque Steam n'annonce jamais les nouveaux
succès. Pour les récupérer tout de suite, utilisez **Paramètres → Avancé → Revérifier les listes de succès**, qui
fonctionne même quand **Mises à jour automatiques des données de succès** est désactivé. Cet interrupteur, également sous Paramètres →
Avancé, n'arrête que la vérification périodique et la réparation des descriptions vides. Aucune des deux vérifications ne supprime
de succès ni de déblocages existants. Ne le désactivez que si vous entretenez `steam_cache` à la main.

## Une mise à jour reste bloquée sur le même fichier {#an-update-is-stuck-on-the-same-file}

Les fichiers de mise à jour téléchargés sont conservés d'une exécution à l'autre. Si un téléchargement échoue sans cesse sur le même fichier, utilisez
**Paramètres → Avancé → Vider les caches** et vérifiez de nouveau les mises à jour. Seuls les caches qu'on peut retélécharger sont
supprimés ; les paramètres, les données de jeu et les journaux restent.

Les mises à jour ne téléchargent normalement que la partie de l'installateur qui a changé, et reviennent d'elles-mêmes à
l'installateur complet en cas d'échec.

AW Next annonce une nouvelle version par une notification Windows et une pastille dans la barre de titre, et un clic sur
l'une ou l'autre ouvre la fenêtre de mise à jour, qui liste les notes de version de chaque version ignorée. L'
avis reste jusqu'à ce que vous le fermiez et revient après une partie, jamais pendant. L'icône de la zone de notification porte
entre-temps un point bleu. **Paramètres → Vérifier les mises à jour** ouvre immédiatement la fenêtre.

**Mise à jour refusée.** Chaque mise à jour est vérifiée par rapport au certificat de signature épinglé du projet avant
son installation, pas avec n'importe quelle signature ni avec le SHA-512 publié à côté, puisque les deux viennent de
la même version. Un refus signifie presque toujours que le fichier téléchargé a été altéré ou corrompu :
videz les caches comme ci-dessus et téléchargez de nouveau depuis la
[page officielle des Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases).

## Les notifications n'apparaissent pas {#notifications-do-not-appear}

1. Vérifiez que le suiveur en arrière-plan tourne.
2. Ouvrez le jeu et lisez la ligne Notifications de son panneau **Game Health** : elle nomme le canal
   qui a diffusé la dernière notification de ce jeu, et pourquoi.
3. Utilisez les tests normal, rare et overlay sous **Paramètres → Notification**.
4. Vérifiez le mode de diffusion et le preset sélectionné. En **Automatique**, une popup d'overlay absente est souvent
   le repli prévu : voir [Notifications](notifications.md#how-automatic-decides).
5. Vérifiez les autorisations de notification de Windows pour AW Next.
6. Si le problème n'arrive que pendant une partie ou en plein écran, activez **Notifications prioritaires** sous
   **Paramètres → Notification** et acceptez la demande d'autorisation de Windows.
7. Testez l'overlay en dehors du plein écran exclusif.
8. Examinez les journaux juste après un test ou un déblocage raté.

Si la bibliothèque se met à jour mais qu'aucune notification n'apparaît, le problème vient du canal de notification. Si la
bibliothèque reste inchangée elle aussi, diagnostiquez d'abord la source ou le chemin des sauvegardes.

## La source navigateur OBS reste vide {#the-obs-browser-source-stays-empty}

1. Appuyez sur **Aperçu** sous **Paramètres → Notification → Source navigateur OBS**, ou ouvrez
   `http://127.0.0.1:8082/obs/?test=1`. Une carte d'exemple toutes les dix secondes signifie que la page et le flux
   fonctionnent, et que le problème vient des réglages de la source dans OBS.
2. Rien du tout, pas même une page blanche : une autre copie d'AW Next, ou un autre programme, occupe le port
   8082. Seule la copie qui a démarré en premier sert l'adresse.
3. Une page blanche est normale entre deux déblocages. Utilisez `?test=1` pour la voir se dessiner.
4. Vérifiez que **Websocket @localhost:8082** est activé sous **Paramètres → Notification → Transport** : la
   source lit ce flux.
5. La carte remplit la taille de la source. Si elle paraît floue, donnez à la source plus de pixels et
   placez-la plus petite dans la scène.

Voir [Afficher les déblocages en stream (OBS)](notifications.md#show-unlocks-on-stream-obs) pour la configuration complète.

## Un jeu ne démarre pas depuis le bouton Jouer {#a-game-will-not-start-from-the-play-button}

Certains jeux exigent les droits d'administrateur, parce que leur manifeste ou leur lanceur les demande. Windows
refuse de les démarrer comme AW Next démarre normalement un jeu et signale `EACCES`.

AW Next réessaie alors via l'interpréteur de Windows, qui affiche l'invite UAC habituelle, si bien que le jeu
démarre une fois que vous confirmez. Si cela est refusé aussi, AW Next propose de réessayer en administrateur. Seul le
jeu est élevé, puisqu'un AW Next élevé créerait des fichiers que votre compte normal ne pourrait pas réécrire.
Fermer l'invite UAC est traité comme une décision, pas comme une erreur.

## Le temps de jeu n'est pas suivi {#playtime-is-not-tracked}

AW Next suit l'exécutable de jeu configuré et la durée de vie de son processus. Si un lanceur, un utilitaire ou un
binaire de nom différent démarre à la place :

- faites un clic droit sur le jeu et ouvrez sa configuration ;
- sélectionnez l'exécutable qui reste actif pendant que vous jouez ;
- évitez les processus de lanceur et de gestion des plantages ;
- relancez le jeu après l'enregistrement.

Un jeu Java qui démarre via `javaw.exe` et dont le lanceur se ferme est suivi automatiquement par ce processus
Java.

Pour corriger un total déjà faux, utilisez **Succès et temps de jeu → Modifier le temps de jeu…** (voir
[Modifier le temps de jeu d'un jeu](advanced.md#editing-a-games-playtime)).

## Les trophées PlayStation ne s'importent pas {#playstation-trophies-do-not-import}

- *La session PlayStation a expiré* : reconnectez le compte dans **Paramètres → Sources**.
- *PlayStation demande de ralentir* ou *Suspendu par PlayStation* : Sony limite la fréquence des requêtes. Relancez
  l'import dans quelques minutes et il reprend là où il s'est arrêté.
- *Pas encore de liste de trophées sur ce compte* : le compte n'a aucune liste de trophées à importer.

## Un jeu Epic Nemirtingas n'enregistre rien {#a-nemirtingas-epic-game-records-nothing}

Quand le dossier d'un jeu contient l'émulateur (sa bibliothèque `EOSSDK` avec un
`nepice_settings\NemirtingasEpicEmu.json` à côté), l'onglet **Game health** du jeu affiche une ligne
**Émulateur Epic** :

- **SavePath doit valoir `"appdata"`.** L'émulateur n'écrit les succès dans
  `%APPDATA%\NemirtingasEpicEmu`, où AW Next les lit, qu'avec cette valeur ; toute autre valeur les garde
  dans le dossier du jeu. La ligne avertit quand il est réglé sur autre chose.
- **Certains jeux ont besoin des arguments de lancement Epic.** Certains jeux EOS ne se connectent à l'émulateur, et donc n'enregistrent
  un succès, que lorsqu'un lanceur passe `-epicapp=...` et les autres. Tant que l'émulateur n'a
  rien enregistré, la ligne propose **Ajouter les arguments de lancement Epic**, qui les écrit dans les réglages de lancement du jeu
  à partir de l'`AppId` de la configuration. Un `.bat` qui les passe fonctionne aussi.
- Si le jeu plante au lancement avec l'émulateur en place, désactivez son plugin d'overlay
  (`"Plugins": { "Overlay": { "Enabled": false } }`) ; la ligne vous le rappelle tant qu'il est activé.

## Ubisoft ou Uplay R2 utilise la mauvaise action {#ubisoft-or-uplay-r2-uses-the-wrong-action}

Les jeux Ubisoft doivent recevoir les métadonnées Ubisoft et la réparation Uplay R2, pas l'action GBE de Steam. Lancez un
nouveau scan de dossier et vérifiez l'icône de la source. Si le jeu est toujours mal identifié, joignez `parser.log`,
la source affichée et les ID, ainsi que le nom du répertoire du jeu, à un rapport.

## Avertissement de l'antivirus ou de SmartScreen {#antivirus-or-smartscreen-warning}

Les versions packagées sont signées avec le certificat propre au projet, épinglé par son empreinte exacte, et non
émis par une autorité publiquement reconnue, donc Windows SmartScreen peut encore avertir. Vous n'avez jamais besoin
d'installer le certificat. Avant d'installer une mise à jour, AW Next vérifie qu'elle est signée, que le
signataire est `CN=Shirow`, que l'empreinte correspond à l'une des deux épinglées par l'application, et que le
fichier n'a pas été modifié après la signature. Le SHA-512 publié avec une version ne peut pas remplacer cette vérification,
puisque les deux seraient remplacés ensemble. Les DLL d'émulateur facultatives peuvent aussi déclencher des détections heuristiques.
Téléchargez uniquement depuis la
[page officielle des Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases), et comparez
l'installateur avec le SHA-512 du `latest.yml` correspondant pour une seconde vérification.

Ne désactivez pas la protection du système. Signalez un fichier mis en quarantaine issu de la version officielle à
l'éditeur de l'antivirus comme faux positif.

### Vérifier une version vous-même {#checking-a-release-yourself}

Chaque installateur publié peut être recherché sur VirusTotal par son SHA-256 :

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.12.5.exe" -Algorithm SHA256
```

Ouvrez `https://www.virustotal.com/gui/file/<the hash it prints>`. Si le fichier est celui qui a été publié,
le rapport s'y trouve déjà. Pour la version actuelle, c'est
[l'installateur 3.12.5](https://www.virustotal.com/gui/file/364b7ecdc1d039e74066ec924453ba665ff33b36dded965703c3373fa53b58ea)
(`364b7ecdc1d039e74066ec924453ba665ff33b36dded965703c3373fa53b58ea`).

Le résultat liste ce que pense chaque moteur. Une poignée de détections heuristiques sur une version qui embarque
des fichiers d'émulateur est le faux positif décrit ci-dessous. Ce qui compte, c'est que le hachage corresponde au fichier
publié sur la page des versions.

### Les fichiers d'émulateur sont signalés {#the-emulator-files-are-flagged}

C'est la détection que les gens rencontrent réellement, et c'est un faux positif. Enregistrer des succès pour un
jeu sans client de boutique lancé revient à placer une bibliothèque de substitution à côté de lui : l'émulateur Steam (GBE
Fork) ou un chargeur Ubisoft. Les moteurs de détection surveillent exactement cela, ils signalent donc ce que le fichier
*fait*, pas ce qu'il contient. Windows Defender met en quarantaine d'un coup toutes les copies qu'il voit : dans le dossier
du jeu, installées avec AW Next, et dans son cache.

**Quand cela se produit.** Au moment où un fichier est écrit, et seulement alors :

| Ce que vous avez fait | Ce qui est écrit |
|---|---|
| Lancé une réparation, depuis le menu d'un jeu ou depuis les Paramètres | l'émulateur ou le chargeur, dans le dossier de ce jeu |
| Ouvert **Paramètres → Émulateurs → Ubisoft / Uplay R1/R2** | les chargeurs intégrés, dans le cache propre d'AW Next |
| Activé **Corriger automatiquement les nouveaux jeux détectés** | la même chose, pendant un scan, pour chaque jeu qui en a besoin |

Lancer AW Next n'en écrit aucun. La réparation automatique est désactivée sauf si vous l'activez, et elle vous avertit
au préalable, avec la possibilité d'ajouter d'abord une exclusion à Defender. Si elle était déjà activée, le même
avertissement apparaît une fois, avant la première écriture, avec l'exclusion et l'interrupteur de désactivation dans la boîte de dialogue.
Rien n'est écrit tant que la fenêtre est masquée dans la zone de notification.

**Ce que fait AW Next.** Une mise en quarantaine est signalée comme un problème d'antivirus, avec un bouton pour
autoriser le dossier dans Windows Defender et un autre pour remettre les fichiers retirés. **Paramètres →
Émulateurs → Ubisoft / Uplay R1/R2 → Restaurer les DLL intégrées** les restaure à tout moment.

**Que faire.** Autorisez le fichier que votre antivirus a nommé, ou excluez
`%APPDATA%\Achievement Watcher Next\cache`. Cela protège les copies propres d'AW Next ; la copie dans un dossier de
jeu peut encore être signalée, excluez donc ce dossier aussi si cela se répète. Signaler le faux
positif à votre éditeur le corrige pour tout le monde.

Windows Defender nomme l'archive de GBE Fork `Trojan:Win32/Suschil!rfn` pendant qu'AW Next la télécharge dans
son cache. C'est le même faux positif : autorisez-la, ou excluez le dossier du cache, et relancez
la correction.

**À vérifier d'abord.** Les deux sont des logiciels tiers et libres : l'émulateur Steam vient des
[versions officielles de GSE Fork](https://github.com/Detanup01/gbe_fork), et les chargeurs Ubisoft sont livrés dans
`app/resources/uplayR1/` et `app/resources/uplayR2/` dans le dépôt. AW Next vérifie ceux qui sont intégrés
par rapport à des empreintes SHA-256 connues, à leur architecture PE et à leur capacité à gérer les succès avant que toute
réparation les utilise, et refuse un fichier qui échoue.

### Un antivirus réagit pendant qu'AW Next tourne {#an-antivirus-reacts-while-aw-next-runs}

Les moteurs comportementaux (System Watcher de Kaspersky, Advanced Threat Defense de Bitdefender) jugent ce qu'un
programme fait, pas ce qu'il contient. AW Next ne lance pas PowerShell pour les notifications Windows, les sons de toast
ni la vérification de signature des mises à jour, et ne compile pas de code dans `%TEMP%` : les captures d'écran utilisent l'
utilitaire natif livré avec l'application, et la vérification des notifications appelle Windows directement.

Si votre antivirus réagit malgré tout, notez le nom exact de la détection et signalez le fichier qu'il nomme comme faux
positif. Pour Kaspersky, c'est [opentip.kaspersky.com](https://opentip.kaspersky.com) : recherchez le fichier
par son hachage, puis **Submit to reanalyze**.

## La fenêtre ne s'ouvre pas {#the-window-does-not-open}

- Utilisez l'icône de la zone de notification au cas où l'application aurait démarré masquée.
- Terminez un processus AW Next bloqué, puis relancez-le.
- Retirez `ELECTRON_RUN_AS_NODE` de l'environnement s'il a été défini pour le développement ; il fait démarrer
  Electron comme un simple Node.
- Consultez `renderer.log` et le journal principal de l'application pour la première erreur.
- Essayez **Paramètres → Général → Désactiver l'accélération matérielle** si l'interface reste visible assez longtemps pour
  le changer.

## Repartir d'un profil neuf {#start-with-a-fresh-profile}

À utiliser seulement après avoir sauvegardé les données que vous voulez garder :

1. Quittez complètement AW Next depuis la zone de notification.
2. Renommez `%APPDATA%\Achievement Watcher Next` en `Achievement Watcher Next.backup`.
3. Démarrez l'application et reproduisez le problème avec le nouveau profil.

Si le problème disparaît, restaurez uniquement les données dont vous avez besoin ou joignez les fichiers de configuration pertinents au
rapport. Renommer garde un chemin de retour ; supprimer, non.

## Signaler le problème {#report-the-problem}

Cherchez d'abord parmi les [tickets existants](https://github.com/Shirowwww/Achievement-Watcher-Next/issues). Si
aucun ne correspond, ouvrez un bug avec le modèle du dépôt et joignez les journaux après avoir retiré tout ce que vous
ne voulez pas partager publiquement.

---

**Voir aussi :** [FAQ](faq.md) pour des réponses courtes · [Outils avancés](advanced.md) pour la maintenance,
le vidage des caches et les réinitialisations · [Game Health](game-health.md) pour les problèmes d'un seul jeu.

Le parcours utilisateur s'arrête ici. La documentation devient ensuite technique :
la [référence Goldberg/GBE](../goldberg-gbe.md) pour les formats de fichiers et les règles de détection, et
[Architecture](../architecture.md) pour les frontières application / moteur de rendu / Watchdog.

<div align="center">

[← Documentation](README.md) · [Premiers pas](getting-started.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
