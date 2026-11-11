---
title: "Sources compatibles"
description: "Toutes les sources de jeux qu'Achievement Watcher Next lit - Steam, GOG, Epic, Ubisoft, EA, Xbox PC, émulateurs et RetroAchievements - et ce dont chacune a besoin."
---

# Sources compatibles

Une **source** est un endroit où AW Next lit des succès : les données locales d'un lanceur, un fichier de sauvegarde
compatible Steam ou le fichier de trophées d'un émulateur de console. Chaque source a son propre interrupteur dans **Paramètres →
Sources**.

AW Next lit Steam, GOG Galaxy, Ubisoft Connect, Epic Games, Xbox PC, le journal local des succès d'EA Desktop,
RetroAchievements, les émulateurs de console et les fichiers de sauvegarde des émulateurs Steam comme Goldberg, GBE
Fork, CODEX, RUNE et CPY. Il n'exige aucune clé d'API Web Steam et aucun compte.

<div align="center">
<picture><source srcset="../assets/shot/sources-panel-800.webp 800w, ../assets/shot/sources-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/sources-panel.png" width="720" height="529" alt="Paramètres - Sources de jeux"></picture><br>
<sub>Chaque source a son propre interrupteur ; le bouclier signale les bibliothèques officielles des clients de bureau</sub>
</div>

Après avoir activé une source, actualisez la bibliothèque. Seules les bibliothèques détectées sur ce PC s'affichent.

## Bibliothèques officielles des plateformes {#official-platform-libraries}

Ces sources lisent les données locales du lanceur lui-même et portent un bouclier dans les Paramètres.

| Source | Ce qu'AW Next lit | Ce qu'il faut |
|---|---|---|
| **Steam** | L'état local de l'appcache, les données du profil public, les schémas de succès et les métadonnées des produits | Steam installé ; connecter un compte est facultatif |
| **GOG Galaxy** | Les bases de données locales du client Galaxy, ainsi que les anciennes sauvegardes compatibles et UniverseLAN | GOG Galaxy installé, ou un jeu qui utilise UniverseLAN |
| **Ubisoft Connect** | Les données locales natives et les anciens formats Uplay | Ubisoft Connect installé |
| **Epic Games** | Les installations locales, ainsi que les jeux que possède le compte et leur état officiel des succès une fois connecté | Le lanceur Epic Games pour les installations locales ; une connexion de compte pour le reste |
| **Xbox PC** | Les installations locales Game Pass et Microsoft Store, ainsi que les jeux que possède le compte et leur état sur Xbox Network | L'application Xbox pour les installations locales ; une connexion de compte pour le reste |
| **Rockstar Games Launcher** | Les jeux qu'il a installés, avec la liste des succès de leur version Steam, et leur état de déblocage une fois connecté | Le Rockstar Games Launcher installé ; une connexion de compte pour les déblocages |

**Steam**, **Epic Games** et **Xbox PC** ont chacun trois réglages : **Aucun**, **Installé** (les jeux de
ce PC) ou **Possédé** (toute la bibliothèque que possède le compte). **Possédé** liste aussi des jeux qui ne sont pas
installés ici et exige la connexion de compte ci-dessous. **GOG Galaxy** propose **Aucun**, **Installé**
ou **Joué** : Galaxy garde les données de jeu d'un titre après sa désinstallation, et **Joué** liste
encore ces jeux.

Les **Bibliothèques Steam**, sous la carte du compte Steam, listent chaque dossier de bibliothèque Steam de ce PC. Désactivez-en
un et ses jeux quittent la liste, Tous les jeux compris, par exemple pour un disque que vous gardez branché comme
stockage. Ils reviennent quand vous le réactivez.

> [!NOTE]
> Les déblocages Steam sont lus dans les statistiques que Steam conserve sur ce PC. Un profil privé, ou des **Détails
> du jeu** privés, fonctionnent pour tous les jeux lancés ici, y compris ceux ajoutés par SteamTools, LuaTools ou
> GreenLuma, et une carte se met à jour dès que Steam enregistre un déblocage. Un profil public n'ajoute que votre
> nom et votre avatar. Les jeux joués uniquement sur un autre PC exigent la connexion de compte ci-dessous. Ces déblocages
> déclenchent une notification AW Next dès que **Jeux du client Steam** est activé dans Notification (voir
> [Notifications](notifications.md#games-steam-runs)).

> [!NOTE]
> **EA Desktop** est un cas à part : il lit le journal local des succès d'EA Desktop pour les jeux situés hors des dossiers
> gérés par EA, et n'importe pas votre bibliothèque EA habituelle.

> [!NOTE]
> Les jeux du **Rockstar Games Launcher** affichent tous leurs succès verrouillés tant que vous ne connectez pas votre compte Rockstar Games. Social Club garde ceux que vous avez débloqués dans un fichier chiffré avec la clé de votre compte, donc AW Next interroge Rockstar à la place.

### Comptes connectés {#connected-accounts}

Steam, Epic, Xbox PC, PlayStation et Rockstar Games peuvent chacun être connectés depuis les Paramètres pour lire ce que les fichiers locaux
ne contiennent pas. Chaque jeton est chiffré avant d'être stocké sur ce PC, et tout le reste fonctionne
sans aucun compte.

| Compte | Ce que la connexion ajoute |
|---|---|
| **Steam** | Deux interrupteurs, désactivés par défaut et affichés quand la source Steam est sur **Possédé** : **ajouter les jeux que vous possédez** et **ajouter les jeux partagés avec vous par le Partage familial Steam**. Ils permettent à un profil privé, ou à un profil qui n'a jamais installé la plupart de sa bibliothèque ici, de lister les bons jeux. Chacun allonge nettement le premier scan, puisque chaque jeu ajouté résout ses succès et ses visuels une fois. Un jeu sans rien à lire en local est alors lu depuis votre profil Steam, dont les détails du jeu doivent être publics ; la réponse est mise en cache pendant six heures. **Masquer les jeux qui ne sont plus dans votre bibliothèque Steam** retire les restes, mais jamais un jeu installé ici ou partagé par le Partage familial Steam. Vous vous connectez sur la page de Valve elle-même. |
| **Epic Games** | Vos succès débloqués et, avec **Possédé**, toute la bibliothèque : chaque jeu avec sa liste complète, l'état de déblocage et la rareté. Quelques jeux possédés ont des succès que les données de la boutique d'Epic ne listent jamais (Shadow of the Tomb Raider, Civilization VI). Ils sont tout de même listés, d'après games-infos-datas de Nemirtingas, mais sans état de déblocage, qu'Epic ne partage pas même quand vous êtes connecté. Les noms, descriptions et raretés d'un jeu installé fonctionnent sans compte. |
| **Xbox PC** | L'état de déblocage et la rareté depuis Xbox Network pour votre bibliothèque, mis en cache en local. Avec **Possédé**, il apporte aussi les jeux que le compte n'a joués qu'ailleurs. |
| **PlayStation** | Vos jeux et trophées PlayStation, avec le taux propre à Sony pour chaque trophée, actualisés tous les trois jours en arrière-plan. Un jeu que vous ne possédez pas peut être ajouté par son nom depuis le catalogue de Sony, et retiré de la même façon. Un jeu issu de n'importe quelle autre source qui est aussi sorti sur PlayStation affiche le vrai platine de sa liste, et en mode trophées ses vrais niveaux et groupes de DLC (voir [Notifications](notifications.md#trophy-mode)). Vous vous connectez sur la page de Sony elle-même. |
| **Rockstar Games** | L'état de déblocage et les dates de déblocage des jeux installés par le Rockstar Games Launcher. Rockstar numérote ses succès, et AW Next les nomme avec la liste que le launcher garde dans `Documents\Rockstar Games\Social Club\Titles` : un jeu dont la liste manque à cet endroit reste entièrement verrouillé. Vérifié sur GTA V, les deux éditions. Vous vous connectez sur la page de Rockstar elle-même, et la session qu'elle laisse est conservée chiffrée pour renouveler le jeton. |

Une tuile porte un petit badge pour ce que la connexion a établi : acheté sur cette boutique, partagé par le
Partage familial Steam, ou n'est plus dans votre bibliothèque.

## Sauvegardes compatibles Steam {#steam-compatible-saves}

AW Next lit les fichiers de succès et de statistiques que les émulateurs Steam écrivent (`achievements.json`,
`achievements.ini`, `achievements.bin`, `stats.ini` et les structures compatibles) aux endroits qu'utilisent ces
outils. Cela couvre **Goldberg** et **GBE Fork** (qu'AW Next peut aussi installer et réparer),
**GreenLuma**, **LumaPlay**, **SmartSteamEmu**, **CreamAPI**, les émulateurs **Nemirtingas** et les versions
scene à la structure compatible. Pour un jeu dont les fichiers sont ailleurs, ajoutez le dossier dans
**Paramètres → Dossiers**.

<div align="center">
<picture><source srcset="../assets/shot/folders-panel-800.webp 800w, ../assets/shot/folders-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/folders-panel.png" width="720" height="529" alt="Paramètres - Dossiers" loading="lazy" decoding="async"></picture><br>
<sub>Les dossiers qu'AW Next vérifie de lui-même, et ceux que vous ajoutez - sauvegardes par jeu ou bibliothèques entières</sub>
</div>

Une version portable de CODEX, RUNE ou CPY écrit normalement dans `%PUBLIC%\Documents\Steam\<SOURCE>\<appid>`,
mais une copie portable garde cette arborescence dans le dossier du jeu, où rien ne la cherche. Il suffit d'ajouter le
dossier du jeu lui-même dans **Paramètres → Dossiers** : son `steam_emu.ini` (ou `cpy.ini`) donne
l'AppID, et l'arborescence des sauvegardes est cherchée à côté avant l'emplacement partagé. Un jeu sans sauvegarde
est tout de même ajouté, à 0 %.

Une version sans configuration d'émulateur, ou dont vous avez supprimé l'ini, fonctionne aussi : l'arborescence des sauvegardes est lue directement,
puisque `Steam\RUNE\<appid>` porte l'AppID dans le nom de son dossier. Les mêmes structures sont testées un niveau
sous le dossier que vous ajoutez, ce qui permet de pointer AW vers toute une bibliothèque de jeux.

Quand un dossier est inutilisable, AW dit pourquoi : il contient un jeu mais aucun fichier de déblocage lisible, il ne contient
rien qui concerne les succès, ou c'est une version **EA app**. Les versions EA app gardent les succès sur le
compte EA, pas sur le disque, elles sont donc lues par la source EA et aucun dossier ajouté ne peut les
faire apparaître. Le message indique aussi combien de structures ont été testées, ce qui distingue « rien trouvé » de « pas
regardé ».

Trois cas ont leur propre traitement :

- **Goldberg SocialClub** : la variante Rockstar et Social Club, avec son propre interrupteur.
- **RUNE Ubisoft Connect** : l'émulateur Ubisoft de RUNE garde des fichiers `achievements.cfg` dans
  `Documents\RUNE\Ubisoft Connect\achievements`. Ils sont trouvés sans ajouter de dossier (ajouter un
  dossier `RUNE\Ubisoft Connect` dans **Paramètres → Dossiers** fonctionne aussi) et suivent l'interrupteur de l'émulateur
  Ubisoft Connect. Les noms et les icônes viennent de la liste d'Ubisoft Connect pour le jeu ; sans elle,
  seuls les numéros de succès s'affichent.
- **Uplay R2** : l'équivalent Ubisoft du chemin Goldberg, pour les titres compatibles. Il n'a pas d'interrupteur
  propre : les sauvegardes passent par la source d'émulateur Steam, et ses outils de réparation et de chargeur sont dans
  **Paramètres → Émulateurs → Ubisoft / Uplay R1/R2**. Voir [Configuration d'Uplay R2](uplay-r2.md).

Si un jeu qui utilise l'un d'eux n'affiche aucun succès, son panneau **Game Health** nomme l'élément manquant.
Voir [Game Health](game-health.md) et [Configuration Goldberg / GBE](emulator-setup.md).

## Émulateurs de console {#console-emulators}

| Émulateur | Console | Fichier de trophées / succès |
|---|---|---|
| **RPCS3** | PlayStation 3 | `TROPUSR.DAT` à côté de la liste des trophées |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`, qui contient la liste et l'état obtenu |
| **KytyPS5** | PlayStation 5 | `_Trophies\<title>\trophies_*.json` à côté de l'émulateur ; la liste vient du paquet `sce_sys\trophy2` du jeu |
| **Xenia** | Xbox 360 | `.gpd`, qui contient lui aussi les deux |

Chacun est surveillé en direct, donc un déblocage déclenche une notification comme n'importe quel autre. RPCS3, ShadPS4 et Xenia peuvent
déplacer leurs données hors du chemin par défaut, et AW Next lit les réglages que lit l'émulateur :

- **RPCS3** : le dossier des trophées suit `vfs.yml` (y compris une redirection relative à `$(EmulatorDir)`), un
  dossier `portable` à côté de l'exécutable, et `RPCS3_CONFIG_DIR`.
- **ShadPS4** : reconnu que vous pointiez vers l'émulateur, son dossier `user`, `game_data` lui-même ou
  (depuis la 0.19) son dossier `trophy` ou `home\<user>\trophy`. Sa configuration est lue à l'un ou l'autre des deux endroits
  où shadPS4 l'a rangée.
- **Xenia** : suit `storage_root` et `content_root` dans sa configuration.
- **KytyPS5** : reconnu que vous pointiez vers l'émulateur, son dossier `_Trophies` ou le dossier d'un seul
  jeu. Les jeux sont cherchés dans les dossiers de jeux du lanceur KytyPS5 (`Kyty.ini`) et à côté de
  l'émulateur, décompressés ou sous forme d'archive `.zar`. La liste des trophées se trouve dans le jeu lui-même, donc un jeu
  supprimé après qu'AW Next l'a vu reste listé comme non installé, à partir de la copie de sa liste et de ses visuels conservée
  alors. Un jeu du lanceur est listé avant son premier trophée. Seul l'utilisateur actif compte : celui défini
  pour le jeu dans le lanceur, sinon l'utilisateur global de l'émulateur. Sans réglage d'utilisateur, les trophées de chaque utilisateur
  sont ajoutés.

Un disque virtuel RPCS3 déplacé ou un dossier de données ShadPS4 peut donc être ajouté directement dans **Paramètres → Dossiers**,
sans exécutable d'émulateur à proximité.

## RetroAchievements {#retroachievements}

Les jeux joués sur n'importe quel émulateur qui rapporte à RetroAchievements viennent de votre compte, pas d'un
fichier. Activez la source **RetroAchievements** et remplissez la carte du compte en dessous : votre nom d'utilisateur
et la **Clé Web API** de retroachievements.org/settings. La clé est chiffrée avant d'être stockée
sur ce PC.

<div align="center">
<picture><source srcset="../assets/shot/retroachievements-panel-800.webp 800w, ../assets/shot/retroachievements-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/retroachievements-panel.png" width="720" height="529" alt="Paramètres, Sources : l'interrupteur RetroAchievements au-dessus des cartes de compte" loading="lazy" decoding="async"></picture><br>
<sub>L'interrupteur RetroAchievements, avec les cartes de compte Epic et Steam en dessous</sub>
</div>

**Importer la bibliothèque** ajoute chaque jeu auquel vous avez joué, avec ses succès, ses dates de déblocage, ses points et sa rareté.
Un second import ne récupère que les jeux dont la progression a bougé, et un jeu joué pour la première fois est
ajouté tout seul. Les nouveaux déblocages sont annoncés en quelques secondes tant qu'un émulateur qui rapporte à
RetroAchievements tourne (RetroArch, DuckStation, PCSX2, PPSSPP, Dolphin, BizHawk, Project64 ou toute
autre version intégrant RA, reconnue par son nom ou par la dll RetroAchievements à côté), et en quelques
minutes sinon.

AW Next lit les déblocages sur retroachievements.org, donc RetroAchievements doit rester activé dans l'émulateur :
le désactiver là-bas empêche l'envoi des déblocages. Pour ne voir que la notification d'AW Next, masquez la fenêtre
contextuelle de l'émulateur. Dans RetroArch, c'est **Settings → Achievements → Visibility → Unlock
Notifications**. RetroBat réécrit `retroarch.cfg` à chaque lancement : fermez donc RetroBat et ajoutez cette ligne
à `RetroBat\emulationstation\.emulationstation\es_settings.cfg` :

```xml
<string name="global.retroarch.cheevos_visibility_unlock" value="false" />
```

Utilisez `cheevos_visibility_mastery` de la même façon pour la fenêtre contextuelle de maîtrise.

## Autres sources {#other-sources}

| Source | Ce que c'est |
|---|---|
| **Jeux Xbox 360 recompilés pour PC** | Les portages ReXGlue et similaires gardent leur liste de succès dans un dossier `achievements` (`.toml`, `.tsv`) ou dans `SaveData\Achievements.json`, dans le dossier du jeu ou dans `Documents\<game>`. La liste vient du `default.xex` du jeu, dans toutes les langues qu'il fournit, les succès secrets restant secrets. [dbox.tools](https://dbox.tools) ajoute les succès de DLC et Exophase la part de joueurs par succès. Une liste dans `Documents` est trouvée toute seule ; pour une liste dans le dossier du jeu, **Recherche auto** retrouve un portage connu dans vos bibliothèques de jeux à partir de son exécutable, avant même son premier succès ; ailleurs, ajoutez ce dossier dans **Paramètres → Dossiers**. Les déblocages sont notifiés en direct, le temps de jeu est suivi, et Réinitialiser les succès fonctionne. Plus de quatre-vingts portages connus (Sonic Unleashed, Sonic the Hedgehog jusqu'à Marathon Recompiled, Blue Dragon re:Blue, Lost Odyssey, Perfect Dark Zero, Fable II, Gears of War 2, Forza Motorsport 4, GoldenEye 007, Skate 2, Marvel Ultimate Alliance, Eternal Sonata, la collection Trials et d'autres) sont listés à partir de leur exécutable avant leur premier succès. Un portage qui garde une liste par profil compte pour un seul jeu. La source suit l'interrupteur Xenia. |
| **Jeux PS4 portés sur PC** | Bloodborne, la collection Uncharted (une entrée par jeu), God of War III Remastered, MediEvil et d'autres portages construits sur le lanceur `run.py`. Aussi des portages sans lui (Dragon's Crown Pro, inFAMOUS Second Son et First Light, The Last Guardian, Gravity Rush 2, Killzone Shadow Fall, Driveclub, Unicorn Overlord, Fist of the North Star: Lost Paradise, UFC 3, PROTOTYPE et PROTOTYPE 2 avec une entrée chacun, les jeux UFC de PORTHEON), des portages sur l'environnement de BilalReloaded comme son portage de la Nathan Drake Collection, Odin Sphere Leifthrasir et 13 Sentinels: Aegis Rim, ReCasted (Ratchet & Clank, dont le `trophies\trophies.log` se trouve dans son propre dossier et dont le platine est accordé une fois les 46 autres trophées obtenus), et des portages qui écrivent leur propre liste, comme Crash Team Racing Nitro-Fueled. **Recherche auto** retrouve un portage dans vos bibliothèques de jeux à partir de ses propres fichiers (`run.py`, `trophy.key`, `rcps4-probe.exe` de ReCasted), et parmi les jeux installés par Quiver Launcher ; ailleurs, ajoutez le dossier du portage dans **Paramètres → Dossiers**. La liste des trophées, les niveaux et les icônes viennent du dump du jeu d'origine vers lequel pointe le lanceur du portage (`sce_sys\trophy`, même avec un `npbind.dat` chiffré), ou du `user\trophies\<title id>\trophies.tsv` du portage lui-même. Les déblocages viennent de celui de `trophies.log`, `last_run.log`, `analysis\<name>-user\trophy\trophyNN.txt`, `progress_user<N>.txt`, `<title id>-user<N>.bin`, `trophies.dat` ou `unlocked.txt` que le portage écrit, tous les profils fusionnés, et sont notifiés en direct. La rareté vient des listes PS4 d'Exophase. Son interrupteur est **PS4 Recomp**. |
| **Games for Windows LIVE** | Les installations XLiveLessNess. Les enregistrements de déblocage de chaque profil sont lus, et la liste, ses textes et ses icônes viennent de l'exécutable du jeu lui-même, donc rien n'est téléchargé. Les succès de DLC viennent du `spa.bin` de chaque pack de contenu dans le dossier `dlc\<title id>` de XLiveLessNess. Surveillé en direct. |
| **Dead Space 2 MarkerPatch, Alice: Madness Returns MadnessPatch** | Une copie Steam avec le mod installé est trouvée toute seule. Pour toute autre copie, ajoutez le dossier du jeu dans **Paramètres → Dossiers** (un dossier à l'intérieur, comme `Binaries\Win32`, compte comme le dossier du jeu) ou laissez **Recherche auto** parcourir vos bibliothèques. La liste est construite à partir des textes et des images du mod, et les déblocages qu'il enregistre sont notifiés en direct. Chacun a son propre interrupteur, et rien n'est lu tant que l'`AchievementSupport` du mod est désactivé. |
| **Portages PC** | *The Legend of Zelda: Link's Awakening DX HD* (LADXHD Updated). Ajoutez le dossier du jeu dans **Paramètres → Dossiers**. Les 110 succès, leurs textes dans les langues du jeu et leurs images viennent de l'installation. Les déblocages sont lus dans `%LOCALAPPDATA%\Zelda_LA\achievements` (à côté du jeu quand il a un `portable.txt`). Le fichier ne contient aucune date : un déblocage est daté du moment où il a été vu. |
| **Portages PC recompilés** | *Twilight Princess* (Dusklight), *Super Mario 64* (Ghostship), *Diddy Kong Racing* (DKR-R), *Super Mario Bros. Remastered*, *Super Mario Sunshine* avec le mod Super Mario Eclipse (SMS Launcher), *Super Mario All-Stars* (le portage PC de Darhkfox), *Road Rash 64 Recompiled*, *F-Zero X* (G-Diffuser), et *Pikmin* et *Pikmin 2* (Open Nectar). Ces portages intègrent leur liste de succès au jeu, donc AW Next fournit chaque liste, en anglais, tirée des sources du portage. Les images des succès viennent du dossier de SMS Launcher lui-même, ou sont récupérées une fois depuis les dépôts de Ghostship, de Super Mario Bros. Remastered et de Road Rash 64 ; les autres portages dessinent les leurs dans le code, donc leurs succès affichent l'icône du jeu. Un portage est trouvé à partir de son fichier de déblocage sous `%APPDATA%` ou `%LOCALAPPDATA%` (`TwilitRealm\Dusklight`, `DKRPort`, `SMB1R`, `sms-launcher`, `RoadRash64Recompiled`), à partir des jeux installés par Quiver Launcher (version 3 ou 4), par **Recherche auto** à partir de son exécutable dans vos bibliothèques de jeux, ou à partir de son dossier dans **Paramètres → Dossiers**. Ghostship, Super Mario All-Stars, G-Diffuser et Open Nectar gardent leurs sauvegardes à côté du jeu, il leur faut donc l'une des trois dernières méthodes ; ajouter le dossier d'Open Nectar trouve aussi Pikmin 2 dans son dossier `pikmin2`. Une installation portable (`portable.txt`, ou le `data_location.json` de Dusklight) est lue là où elle écrit. DKR-R, SMS Launcher, Super Mario All-Stars et G-Diffuser gardent la date de chaque déblocage ; pour les autres, un déblocage est daté du moment où il a été vu. Sous Linux, les versions natives sont lues dans `~/.local/share` et `~/.config`, et les versions Windows dans leur préfixe Wine ou Proton. Elles partagent l'interrupteur des portages PC. |
| **FINAL FANTASY VII (2013)** | Cette réédition précède les succès Steamworks et garde ses 36 déblocages dans un champ de bits de 8 octets à côté de ses sauvegardes, trouvé dans Documents sans ajouter le dossier. |
| **Mémoire des succès vus** | Garde un jeu listé après la disparition de sa sauvegarde, avec les déblocages vus par le suiveur en arrière-plan. |
| **Jeux ajoutés manuellement** | Un jeu ajouté à partir d'un titre et d'un exécutable, avec une plateforme et un AppID Steam facultatifs. Voir [Outils avancés](advanced.md#add-a-game-manually). |

## Métadonnées Steam, sans clé d'API {#steam-metadata-without-an-api-key}

AW Next n'utilise aucune clé d'API Web Steam ni aucun compte Steam connecté pour cela. La liste de chaque jeu vient d'
une chaîne sans clé : d'abord le point d'accès officiel `GetGameAchievements` (descriptions masquées, icônes, rareté
globale et ensembles de succès de Steam), puis la page des succès de SteamCommunity (le même schéma, dans
votre langue), puis SteamHunters, et une extraction par navigateur seulement en dernier recours.

Comme sur Steam, un succès archivé par le développeur ne compte que si vous l'avez obtenu. Sinon il est exclu
de la liste, du pourcentage et de la notification de platine.

Les résultats sont mis en cache par langue dans `%APPDATA%\Achievement Watcher Next\steam_cache\schema`, si bien que les sources
locales et les jeux déjà vus fonctionnent hors ligne.

Steam n'annonce jamais qu'une mise à jour a ajouté des succès, donc une liste en cache se revérifie toute seule tous les 3
jours et récupère les nouveaux sans en retirer aucun. Pour vérifier tout de suite, utilisez **Paramètres → Avancé →
Revérifier les listes de succès**. **Mises à jour automatiques des données de succès**, au même endroit, désactive la
revérification périodique pour qui entretient `steam_cache` à la main. Le bouton fonctionne toujours.

Les succès de DLC et de mise à jour portent le nom de leur groupe (par exemple *Hearts of Stone*) sous le
titre, tiré de la même recherche.

## Les sources que vous ne voyez pas {#sources-you-do-not-see}

En mode **Simple**, la liste des Sources replie six lignes marginales : GreenLuma, LumaPlay, les deux
émulateurs Nemirtingas (les lecteurs de sauvegardes GOG et Epic), Goldberg SocialClub et l'import du cache de
notifications. Une ligne ne se replie que si elle est activée et qu'aucun jeu de votre bibliothèque n'en provient. Désactivez-en une,
ou possédez un jeu qu'elle a détecté, et la ligne revient, si bien que le mode d'interface ne masque jamais la commande qui
expliquerait un jeu manquant. **Avancé** liste toujours toutes les sources.

---

**Suite :** [Notifications](notifications.md), pour choisir comment les déblocages sont annoncés.

*Configuration propre à chaque source : [Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[Game Health](game-health.md)*

<div align="center">

[← Documentation](README.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
