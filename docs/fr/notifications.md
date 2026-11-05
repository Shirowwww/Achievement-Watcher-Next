---
title: "Notifications et popups de succès"
description: "Popups en overlay ou notifications Windows : modes de diffusion, Automatique, sons, position, mode trophées, OBS, captures d'écran souvenirs et clips vidéo."
---

# Notifications et popups de succès

AW Next annonce un déblocage par une notification Windows native (toast), une popup en overlay dans le jeu, ou
les deux. Choisissez le mode dans **Paramètres → Notification**.

Sous Linux, la notification est celle du bureau (GNOME ou KDE) et l'overlay fonctionne de la même façon.
Le mode Ne pas déranger et l'interrupteur Notifications prioritaires sont traités dans [Bureaux pris en charge](linux.md#supported-desktops).

<div align="center">
<picture><source srcset="../assets/shot/notifications-panel-800.webp 800w, ../assets/shot/notifications-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notifications-panel.png" width="720" height="529" alt="Paramètres - Notification"></picture><br>
<sub>Un mode de diffusion, un preset - Automatique s'occupe du reste</sub>
</div>

## Choisir un mode de diffusion {#choose-a-delivery-mode}

| Mode | Comportement |
|---|---|
| **Automatique** (par défaut) | L'overlay en jeu quand il peut s'afficher, une notification Windows quand il ne le peut pas. |
| **Overlay en jeu** | Toujours la popup stylisée au-dessus du jeu en cours, même en plein écran exclusif, où elle peut ne pas être visible. Si l'overlay ne peut pas s'afficher du tout, cette notification arrive sous forme de notification Windows. |
| **Notification Windows** | Toujours la notification système de Windows. Les notifications de succès et de progression utilisent l'icône du succès ; les notifications de temps de jeu peuvent inclure l'illustration du jeu et une barre de progression. |
| **Les deux** | Le même événement sur les deux canaux. |

AW Next publie lui-même les notifications Windows et ne lance aucun autre programme, PowerShell compris, si bien qu'elles
apparaissent aussitôt. Un identifiant d'application personnalisé défini dans `options.ini` (`[notification_advanced] appID`) passe encore
par l'ancienne voie PowerShell.

La fenêtre de la bibliothèque peut rester fermée dans tous les modes : le suiveur en arrière-plan gère la diffusion.

<div align="center">
<picture><source srcset="../assets/shot/notification-popup.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup.png" width="440" height="126" alt="Une popup de déblocage" loading="lazy" decoding="async"></picture><br>
<sub>La popup en overlay, dessinée par le preset choisi avec l'illustration du jeu</sub>
</div>

Quel que soit le mode, **Websocket @localhost:8082** diffuse chaque événement de notification en JSON sur un
websocket local, pour les overlays de stream et d'autres outils. Il est activé par défaut, n'écoute que sur `127.0.0.1`
et n'affiche rien lui-même. Désactivez-le si vous ne l'utilisez pas. La même adresse sert un overlay de
stream prêt à l'emploi : voir [Afficher les déblocages en stream (OBS)](#show-unlocks-on-stream-obs).

> [!TIP]
> Utilisez les boutons de test après avoir changé de mode. Un test réussi confirme le chemin d'affichage ; un vrai
> déblocage dépend encore de la bonne surveillance de la source du jeu.

### Comment Automatique décide {#how-automatic-decides}

Chaque notification est aiguillée une fois, d'après ce qu'AW Next peut observer à cet instant :

| Situation | Ce qui se passe |
|---|---|
| Rien ne recouvre l'écran | Overlay en jeu. |
| Le jeu est en **plein écran** (Direct3D avec les optimisations plein écran de Windows, ce qu'ont la plupart des jeux) | Notification Windows, affichée par-dessus le jeu sans lui prendre le focus : une notification prioritaire quand elles sont activées, sinon un rappel qu'AW Next ferme après la durée habituelle d'une notification. Les jeux en fenêtré sans bordure ou en fenêtre gardent l'overlay. |
| Le jeu occupe l'écran en **mode exclusif hérité** (jeux anciens, nombreux jeux OpenGL, ou optimisations plein écran désactivées) | Rien d'une autre application n'est dessiné sur cet écran. La notification va au Centre de notifications ; son son et la vibration de la manette fonctionnent toujours. Le mode sans bordure dans le jeu la ramène à l'écran. |
| L'application ne peut pas afficher la popup (aucun preset utilisable, moteur de rendu indisponible) | Une notification Windows. |
| L'overlay échoue à s'afficher | Notifications Windows pendant dix minutes, puis l'overlay est réessayé. |
| L'overlay a été demandé mais n'a jamais répondu | Pas de seconde notification, pour éviter un doublon. Le déblocage suivant utilise une notification Windows. |

AW Next retient quel canal a diffusé en dernier pour chaque jeu et ne s'en sert que comme départage quand
Windows ne peut pas dire si un jeu est en plein écran exclusif. Un repli n'a lieu qu'après un
échec avéré, si bien que le même déblocage n'est jamais annoncé deux fois. AW Next ne s'injecte pas dans les jeux et ne force pas
de changement de mode d'affichage.

### Où l'état actuel est affiché {#where-the-current-state-is-shown}

Le panneau **Game Health** d'un jeu a une ligne Notifications qui nomme le canal qui a diffusé la dernière
notification et pourquoi, par exemple *Fonctionne - repli Windows actif* (mode Simple). Sans
notification encore, elle montre le mode configuré. Si Windows a gardé une notification dans le Centre de notifications
parce que le jeu était en plein écran ou que Ne pas déranger était activé, la ligne le dit. Voir
[Game Health](game-health.md).

## Notifications Windows prioritaires {#priority-windows-notifications}

Les jeux en plein écran et d'autres règles automatiques de Windows peuvent activer **Ne pas déranger**, qui envoie
les toasts ordinaires au Centre de notifications sans les afficher. **Paramètres → Notification → Notifications
prioritaires** marque les déblocages de succès comme importants. Windows demande une fois si AW Next peut les
envoyer ; modifiez la réponse dans les paramètres de notification de Windows.

C'est désactivé par défaut et cela ne couvre que les déblocages de succès et de complétion, jamais la progression ni le temps de jeu.
Le toast utilise le scénario `urgent`, qui exige Windows 11 (build 22546) ou plus récent ; sous Windows 10,
le réglage ne fait rien. Voir [la documentation de Microsoft sur les notifications d'application](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content).

## Les jeux que Steam lance {#games-steam-runs}

Steam affiche sa propre popup pour les jeux qu'il lance, donc AW Next reste silencieux pour eux par défaut. Activez
**Paramètres → Notification → Jeux du client Steam** pour obtenir aussi la notification d'AW Next, avec son son,
son overlay, sa rareté et sa capture d'écran souvenir. Cela couvre les jeux possédés et les jeux ajoutés par SteamTools,
LuaTools ou GreenLuma : AW Next suit le fichier de statistiques que Steam réécrit dans `appcache\stats`. Pour ne garder
que la notification d'AW Next, désactivez **Steam → Paramètres → Notifications → Je débloque un succès**.

## L'apparence de la popup {#how-the-popup-looks}

L'apparence de la popup en jeu est un **preset** : dix sont livrés avec l'application, vous pouvez créer les vôtres, et un
preset se partage dans un seul fichier `.awpreset`. Voir [Presets et concepteur de presets](presets.md).
**Opacité** (de 30 % à 100 %) dans les mêmes réglages détermine la transparence de la popup.

## Sons, volume et durée {#sounds-volume-and-duration}

- Importez des fichiers `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a` ou `.aac` depuis les réglages de Notification.
- **Aléatoire** dans la liste des sons joue un fichier différent parmi les vôtres à chaque notification, et à chaque
  aperçu ou test.
- **Son du succès rare** et **Son de complétion à 100 %** (mode Avancé) donnent à ces popups leur propre
  son, pour l'overlay et les notifications Windows. Les deux démarrent sur « Comme les déblocages » ; « Aucun » rend
  ce type de popup silencieux. Un son choisi pour un jeu dans son propre panneau l'emporte toujours.
- **Son des progressions** (mode Avancé) fait de même pour les popups de progression. Il l'emporte sur le son propre
  d'un jeu, sauf pour un jeu réglé sans son. Pour couper les popups de progression d'un seul jeu, faites un clic droit dessus et
  coupez sa progression.
- **Émulateurs** (mode Avancé) donne à chaque console son propre preset et son propre son : Xenia, RPCS3, shadPS4 et
  Kyty sont listés. Les jeux Xbox 360 recompilés suivent le choix de Xenia, les portages PS4 celui de shadPS4, et
  **Comme le principal** garde les réglages principaux.
- Le volume de l'overlay va de 0 % à 200 % ; au-dessus de 100 %, l'overlay amplifie le son. La lecture des
  notifications Windows est limitée par le chemin audio du système.
- La durée suit le preset ou utilise un plafond fixe.
- Les notifications de temps de jeu sont silencieuses.

Un preset partagé peut porter son propre son, qui remplace celui choisi ici. Voir
[Partager un preset](presets.md#share-a-preset).

## Position et échelle {#position-and-scale}

Choisissez un coin, un bord ou une position centrée dans les réglages de Notification. Les positions sont mesurées
par rapport à l'écran entier : une ancre en bas se place sur le bord inférieur, pas au-dessus de la barre des tâches, et la
carte touche les bords choisis quelle que soit la place laissée autour d'elle par son preset pour l'ombre ou le halo. AW
mesure chaque preset une fois par position, en arrière-plan après sa première popup, si bien que cette première popup
s'affiche à l'ancien endroit. Un preset dont la carte suit la longueur de son texte (PS5 Steam, Slim)
est mesuré à chaque popup, ce qui la retient environ une demi-seconde.

**Repositionner** déplace la position personnalisée, utilisée exactement comme vous l'avez laissée ; une position enregistrée sur un écran
qui n'existe plus est ramenée à l'écran. Avec plusieurs écrans, la popup apparaît sur l'écran du jeu
auquel vous jouez, pas sur celui sous la souris, et une position personnalisée garde sa place relative à cet
écran. Les notifications Windows s'affichent toujours sur l'écran principal.

Le réglage d'échelle redimensionne toute la popup sans changer sa disposition, et **Repositionner** en montre
l'aperçu à cette échelle.

### Popups de progression {#progress-popups}

Les succès à compteur (tuer 50 ennemis, parcourir 100 km) peuvent déclencher une popup de progression à chaque étape. En
mode Avancé, **Position de la progression** et **Échelle de la progression** donnent à ces popups leur propre place et
leur propre taille. **Comme les déblocages**, le réglage par défaut, suit la position propre d'un jeu quand il en a une ; tout autre
choix s'applique aux popups de progression de tous les jeux. Le viseur à côté de **Position de la progression** place
une ancre personnalisée pour la progression seulement. Ces réglages ne déplacent que la popup en jeu.

**Étapes de progression**, dans les réglages communs de notification, n'affiche une notification de progression que lorsque
un compteur franchit encore 10, 25 ou 50 % de son objectif. Cela s'applique à la popup et à la notification Windows.
Le déblocage lui-même est toujours affiché.

La liste de l'overlay a ses propres raccourcis clavier (voir le
[guide de l'overlay](overlay.md#keyboard-shortcuts-overlay-open)) et une commande optionnelle à la manette (voir le
[guide de la manette](controller.md)).

## Comportement par jeu {#per-game-behavior}

Ouvrez le panneau d'outils d'un jeu et choisissez **Notification** pour lui donner son propre preset de popup,
sa position, son son ou son échelle. Chaque champ hérite du réglage global, et seules les valeurs que vous changez sont
enregistrées ; le son propose aussi le silence et l'aléatoire. Le viseur à côté de Position fait glisser un aperçu jusqu'à l'endroit
où la popup de ce jeu doit apparaître. Les cinq boutons de test montrent un aperçu de ce jeu et de son illustration sans
changer la progression des succès. Un preset ou un son supprimé retombe sur la valeur globale, et renommer
un preset utilisateur conserve ses affectations aux jeux.

Faites un clic droit sur un jeu pour couper ses notifications de progression tout en gardant les notifications de déblocage et de
complétion.

Un succès dont le taux de déblocage global est inférieur ou égal à la limite de rareté affiche son pourcentage et reçoit
le style rare du preset : **or** à 5 % ou moins, **argent** jusqu'à 10 %, **bronze** jusqu'à 15 %. Déplacez
ces limites avec **Paramètres → Général → Seuils de rareté** réglé sur Personnalisés (mode Avancé).

### Mode trophées {#trophy-mode}

**Paramètres → Général → Affichage de la rareté** bascule en **Mode trophées** : chaque succès est noté d'après
son taux de déblocage global (or sous 20 %, argent sous 50 %, bronze sinon ou quand le taux est
inconnu) dans la fenêtre du jeu, l'overlay, les trophées du profil et la notification. **Seuils de
rareté** déplace les bornes. Les trois niveaux utilisent le style rare du preset (`state-rare` plus
`tier-gold`, `tier-silver` ou `tier-bronze`) ; le platine reste l'état de complétion à part. L'application
donne son niveau à un preset dans `rarityTier` (avec `rarityMode` et le `rarityGrade` localisé) ; un preset
sans ce champ retombe sur le pourcentage.

Avec un compte PlayStation connecté (**Paramètres → Sources**), un jeu qui est aussi sorti sur
PlayStation utilise sa vraie liste de trophées, d'où que viennent ses succès : chaque succès prend le
niveau et le groupe de DLC du trophée de même nom ou de même description. Le vrai platine s'affiche dans chaque
mode de rareté (page du jeu, statistiques, popup 100 %) avec son nom, sa description et son icône, et compte une fois que ce
trophée est obtenu, même s'il reste des trophées de DLC. Les émulateurs PlayStation gardent leurs propres trophées. AW
trouve la liste grâce au nom d'origine du jeu, donc renommer un jeu ne change rien.

Chaque source déclenche la popup 100 %, y compris celles en direct (Xenia, portages recompilés, GOG Galaxy,
Ubisoft Connect, Xbox PC). Quand le jeu a un platine, le succès qui y est lié s'affiche comme
le platine.

<div align="center">
<picture><source srcset="../assets/shot/trophy-profile.webp 640w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/trophy-profile.png" width="440" height="148" alt="L'en-tête du profil avec les nombres de trophées platine, or, argent, bronze et communs" loading="lazy" decoding="async"></picture><br>
<sub>Le profil compte chaque déblocage par niveau, avec le platine pour les jeux terminés</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/trophy-game-panel.webp 800w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/trophy-game-panel.png" width="560" height="672" alt="Une page de jeu où chaque succès est noté or, argent ou bronze" loading="lazy" decoding="async"></picture><br>
<sub>Sur la page d'un jeu, chaque succès porte son niveau et la part de joueurs qui l'ont</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/notification-popup-trophy.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup-trophy.png" width="440" height="126" alt="Une popup de déblocage dessinée dans le style or" loading="lazy" decoding="async"></picture><br>
<sub>Un déblocage or dans le preset AW Next</sub>
</div>

## Afficher les déblocages en stream (OBS) {#show-unlocks-on-stream-obs}

Capturer la popup comme une fenêtre ne marche pas : la fenêtre de la popup ne vit que quelques secondes, donc OBS ne
l'attrape jamais. Utilisez une source **Navigateur**, qu'OBS garde chargée pendant tout le stream.

1. **Paramètres -> Notification -> Source navigateur OBS.** **Aperçu** ouvre la page dans votre navigateur
   avec un déblocage d'exemple toutes les dix secondes, la vérification la plus rapide que la chaîne fonctionne. **Copier le lien**
   copie l'adresse.
2. Dans OBS : **+ -> Navigateur**, collez l'adresse dans **URL**.
3. Réglez une **Largeur** et une **Hauteur** quelconques. La carte s'adapte pour remplir la zone.

La source montre le même preset, la même illustration et le même style de rareté que la popup en jeu et suit le
preset que vous choisissez dans les Paramètres. Les boutons de test sous **Paramètres -> Notification** y envoient aussi,
quel que soit le mode de diffusion.

> [!TIP]
> **Une source plus grande donne une carte plus nette.** La carte est mise en page à la taille de la source, sans être étirée.
> Donnez à la source environ le double de la zone du preset lui-même et placez-la à demi-taille dans votre scène :
> `http://127.0.0.1:8082/obs/_config` indique les deux valeurs. Seule l'icône du succès reste floue,
> puisque Steam la publie en 64x64.

### Options {#options}

Ajoutez-les à l'adresse, `?first=x&then=y` :

| Option | Effet |
|---|---|
| `?test=1` | Répète un déblocage d'exemple toutes les dix secondes, pour positionner la source. Retirez-le ensuite. |
| `?scale=2` | Fixe la carte à ce zoom au lieu de l'ajuster à la source. `?scale=app` suit l'échelle réglée dans les Paramètres. |
| `?duration=8000` | Garde chaque carte ce nombre de millisecondes au lieu de la durée configurée. |
| `?sound=1` | Joue le son de notification dans la source navigateur, ce qui l'envoie au stream sans capturer l'audio du bureau. Désactivé par défaut, puisque l'application le joue déjà sur vos haut-parleurs. Cochez **Contrôler l'audio via OBS** sur la source pour l'ajouter au mixage. |
| `/obs/preset/Xbox/` | Utilise un preset nommé pour le stream, quel que soit le réglage du bureau. Le nom de n'importe quel preset installé convient, y compris le vôtre. |

### Remarques {#notes}

- La page est vide entre deux déblocages, volontairement : rien n'est dessiné, donc elle ne coûte aucun CPU tant qu'un
  succès n'apparaît pas.
- Elle est strictement locale. La page et le flux n'écoutent que sur `127.0.0.1`, donc rien d'autre sur votre réseau ne peut
  les atteindre.
- Les icônes de succès sont servies depuis cette machine pour les sources qui gardent leurs illustrations en local
  (Goldberg, émulateurs, les visuels de votre propre bibliothèque), et seulement pour les images qu'une notification a annoncées.
- Une seule copie d'AW Next sert l'adresse : celle qui a démarré en premier. Une seconde instance, ou tout autre programme
  sur le port 8082, laisse la source sans rien à quoi se connecter. Fermez la copie en trop et la source
  se reconnecte en quelques secondes.
- Si la source reste vide lors d'un vrai déblocage, vérifiez que les boutons de test fonctionnent, puis que la ligne
  **Websocket** est activée.

## Les succès dans les pages de la bibliothèque Steam {#achievements-on-steams-library-pages}

Steam n'affiche aucun succès sur la page d'un raccourci hors Steam. Un plugin Steam (Millennium sur le
bureau, Decky en mode Jeu) peut demander à AW Next les succès de ce raccourci sur le même flux local,
`ws://127.0.0.1:8082`, et les dessiner lui-même. AW Next répond pour un seul jeu à la fois : le plugin doit
le nommer, et la réponse ne contient aucun dossier, compte ni nom de source.

Le plugin Millennium d'AW Next, dans le dossier `millennium/` du dépôt, le fait pour chaque
raccourci qu'AW Next reconnaît : la page du jeu affiche alors la propre section Succès de Steam, le compteur de
la barre de jeu, la liste complète et l'onglet « Vos affaires » du mode Big Picture. Un raccourci est reconnu au mieux quand il
lance le même exe que l'**Exécutable** du jeu dans AW Next. Son README couvre l'installation, ce qu'il faut
vérifier quand une page reste vide, et sa cohabitation avec Steam Cartridges, NativeGameLink et Game
Data Linker. L'extension Playnite dans `playnite/` demande de la même façon, pour n'importe quel jeu d'une bibliothèque
Playnite, et son README couvre l'installation et les panneaux qu'un thème peut placer. La requête ci-dessous s'adresse
à qui écrit un autre plugin.

Le plugin envoie :

```json
{ "cmd": "bridge-game", "id": "r1", "exe": "D:\\Games\\Pinyon Shift\\pinyon_shift.exe", "launchOptions": "", "steamAppId": 0, "name": "Forza Horizon" }
```

Tous les champs sauf `cmd` sont facultatifs, et chacun qu'il ajoute aide. AW Next les essaie dans cet ordre : l'
exe que la bibliothèque a trouvé pour un jeu, un dossier de jeu ou une ROM nommé dans les options de lancement (un raccourci
d'émulateur), un AppID Steam, un lanceur dans le dossier du jeu, le nom de fichier de l'exe, puis le titre exact.
Quand une étape correspond à plusieurs jeux, AW Next répond « introuvable ».

La réponse :

```json
{ "cmd": "bridge-game", "id": "r1", "bridge": 1, "found": true,
  "game": { "id": "x360-4D5309C9", "name": "Forza Horizon", "total": 50, "unlocked": 12,
    "achievements": [{ "id": "1", "name": "...", "description": "...", "icon": "https://...", "iconLocked": "https://...",
      "hidden": false, "rarity": 12.5, "unlocked": true, "unlockedAt": 1790000000 }] } }
```

- `unlockedAt` est en secondes Unix. `rarity` et `progress` (`{ "current": 6, "max": 50 }` sur un succès
  verrouillé en partie réalisé) ne sont présents que lorsqu'AW Next les connaît.
- Une icône stockée sur ce PC arrive sous la forme d'une adresse `http://127.0.0.1:8082/bridge/icon/...`.
- La liste est la bibliothèque telle que le dernier scan l'a vue, plus les déblocages annoncés depuis. Les déblocages
  arrivent toujours sur le flux : quand l'un porte l'`id` du jeu dans `appID`, redemandez pour actualiser la page.
- Le plugin se connecte depuis les pages propres de Steam (`https://steamloopback.host`) ou depuis un processus natif ;
  les sites web sont refusés. Si un mot de passe websocket est défini, il lui faut le même mot de passe.
- Il ne doit pas se connecter avec `?client=decky` : ce nom indique à AW Next que Steam affiche ses propres
  notifications, et AW Next garde alors sa propre popup désactivée.

## Captures d'écran souvenirs {#screenshot-souvenirs}

**Capture au déblocage** enregistre une image de l'écran un instant après l'apparition d'un succès, une fois que la
popup a fini de s'afficher, de sorte que la notification figure sur la capture. Les fichiers vont dans
`<folder>\<game>\<achievement> - <date>.png`, la date étant à l'heure locale du PC. **Ouvrir le dossier** dans la même ligne l'ouvre, en le créant
d'abord au besoin. Le dossier par défaut est `Pictures\Achievement Watcher Next` et peut être changé.

Les succès débloqués dans la même seconde gardent chacun leur fichier, et un jeu dont le titre est refusé par Windows
comme nom de dossier obtient tout de même ses captures. Avec plusieurs moniteurs, le souvenir capture
le moniteur où se trouve le jeu, comme les clips vidéo ; sans fenêtre de jeu visible, il prend le moniteur
de la fenêtre au premier plan, puis le principal.

### Jouer avec le HDR de Windows activé {#playing-with-windows-hdr-on}

**Captures HDR** vaut **Automatique** par défaut. Au moment de la capture, AW Next vérifie si le HDR est actif
sur l'écran qui affiche le jeu. Si c'est le cas, un utilitaire ponctuel capture une image FP16 via Windows
Graphics Capture et convertit ses hautes lumières en PNG SDR/sRGB par mappage de tons, puis se termine. Avec le HDR désactivé,
**Automatique** et **Désactivé** utilisent la capture standard. Toute défaillance de l'utilitaire (prise en charge de Windows absente, capture
bloquée, délai dépassé) retombe aussi sur la capture standard, de sorte que le souvenir et la
notification ne sont pas perdus.

## Clips vidéo {#video-clips}

**Clip vidéo au déblocage** fonctionne comme la vidéo de trophée d'une console. Pendant qu'un jeu suivi par AW Next tourne,
les dernières secondes de jeu sont gardées en mémoire, déjà compressées par l'encodeur vidéo de la carte graphique.
Quand un succès apparaît, la séquence qui l'entoure est enregistrée en MP4 dans
`<folder>\<game>\<achievement> - <date>.mp4`, avec la popup au milieu, sauf si vous la déplacez. Le dossier est
`Videos\Achievement Watcher Next` sauf si vous en choisissez un autre. Les succès débloqués à peu d'intervalle
partagent un même clip.

| Réglage | Choix | Par défaut |
|---|---|---|
| Durée du clip | 10 à 60 secondes | 20 s |
| Avant le succès | De 0 seconde à tout le clip. À monter quand les notifications arrivent en retard dans les jeux lourds | La moitié du clip |
| Format | H.264, HEVC ou AV1, enregistré en MP4 | H.264 |
| Résolution | Écran, 2160p, 1440p, 1080p ou 720p, jamais au-dessus de l'écran | 1080p |
| Images par seconde | 30 FPS, 60 FPS ou Illimitées, qui suit votre écran (120, 144, 240 Hz) | 30 FPS |
| Qualité | Basse, Moyenne ou Haute | Moyenne |
| Son | Jeu seulement, ou tout le PC | Jeu seulement |

<div align="center">
<picture><source srcset="../assets/shot/video-clip-panel-800.webp 800w, ../assets/shot/video-clip-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/video-clip-panel.png" width="720" height="529" alt="Paramètres, Notification : la section Clip vidéo avec son interrupteur" loading="lazy" decoding="async"></picture><br>
<sub>La section Clip vidéo se trouve en bas de l'onglet Notification et reste désactivée tant que vous ne l'activez pas</sub>
</div>

La ligne sous le tableau estime la taille d'un clip pour votre écran. C'est un plafond : l'encodeur
fonctionne à débit constant et une scène calme donne un fichier plus petit.

- **Coût.** Rien ne tourne tant qu'aucun jeu ne tourne. La capture, la mise à l'échelle et l'encodage restent sur le GPU, sur un
  bloc d'encodage distinct de celui qui affiche le jeu. L'enregistreur utilise bien moins de 1 % du CPU
  et environ 70 à 110 Mo de mémoire plus un clip. Rien n'est écrit sur le disque tant qu'un succès
  n'est pas débloqué.
- **Format.** Le H.264 se lit partout, Discord et les téléphones compris. HEVC et AV1 donnent des fichiers plus petits.
  L'AV1 demande une GeForce RTX 40, une Radeon RX 7000, une Intel Arc ou plus récent ; sans le format choisi, le clip
  est enregistré en H.264. Une carte sans encodeur H.264 matériel utilise l'encodeur logiciel de Windows, sur le
  processeur, en 1080p et 30 FPS au plus.
- **Images par seconde.** **Illimitées** enregistre à la fréquence de rafraîchissement du moniteur qui affiche le jeu et
  la suit quand elle change. Si l'encodeur refuse une fréquence, l'enregistreur redescend à 60, puis à 30
  FPS, et le consigne. L'estimation de taille suppose le double du débit à 30 FPS pour Illimitées.
- **Si l'enregistreur ne répond plus.** AW Next le redémarre après une attente qui double à chaque fois, et
  abandonne pour un jeu après cinq redémarrages ratés. Un clip dont l'écriture échoue à mi-chemin est gardé si ce qui
  a été écrit se lit, sinon supprimé. Un clip laissé à moitié écrit par un PC qui s'est arrêté est nettoyé
  la prochaine fois qu'un jeu est enregistré.
- **HDR.** Avec le HDR de Windows activé, les clips sont convertis par mappage de tons comme les captures HDR ; **Captures HDR** réglé sur
  **Désactivé** s'applique aussi aux clips.
- **Son.** **Jeu seulement** laisse de côté le chat vocal et la musique. Si le son du jeu ne peut pas être enregistré
  seul, tout le PC est enregistré.
- **Ce qui est capturé.** Le moniteur qui affiche le jeu, notifications comprises. Un très vieux jeu en plein écran
  exclusif peut enregistrer des images noires.

## Si un test ou un déblocage n'apparaît pas {#if-a-test-or-unlock-does-not-appear}

1. Vérifiez que les notifications sont activées, et lisez la ligne Notifications du panneau
   **[Game Health](game-health.md)** du jeu.
2. Vérifiez que le suiveur en arrière-plan tourne.
3. Pour les overlays, choisissez un preset valide et testez de nouveau en dehors d'un jeu en plein écran exclusif.
   **Automatique** gère déjà les deux cas.
4. Si un jeu en plein écran ou Ne pas déranger masque les notifications Windows, activez **Notifications
   prioritaires** et approuvez la demande unique de Windows.
5. Vérifiez les paramètres de notification de Windows pour AW Next.
6. Ouvrez **Paramètres → Avancé → Diagnostics** et examinez les journaux.

Si le problème persiste, poursuivez avec [Dépannage](troubleshooting.md#notifications-do-not-appear).

---

**Suite :** [Presets et concepteur de presets](presets.md) - l'apparence de la popup, et comment créer la
vôtre.

<div align="center">

[← Documentation](README.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
