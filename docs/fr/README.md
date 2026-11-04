---
title: "Documentation"
description: "Guides pour installer, configurer et dépanner Achievement Watcher Next : sources, notifications, presets, overlay et résolution de problèmes."
permalink: /fr/README.html
---

<div align="center">

# Documentation d'AW Next

Guides pour la configuration, l'usage quotidien et la maintenance.

[Accueil](../index.html) · [Télécharger](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Galerie de presets](../gallery/) · [Galerie de thèmes](../gallery/themes/) · [Journal des modifications](../changelog.md) · [Sécurité](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Signaler un problème](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="../assets/shot/home-800.webp 800w, ../assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/home.png" width="800" height="492" alt="La bibliothèque d'AW Next"></picture>

</div>

## Commencez ici {#start-here}

Lisez dans l'ordre ou allez à ce dont vous avez besoin. Chaque page se termine par un lien vers la suivante.

| # | Guide | Ce qu'il couvre |
|---|-------|-----------------|
| 1 | [Premiers pas](getting-started.md) | Installation, premier lancement, Simple et Avancé, recherche des jeux, mises à jour |
| 2 | [Sources compatibles](sources.md) | Toutes les sources qu'AW Next lit, et ce dont chacune a besoin |
| 3 | [Notifications](notifications.md) | Modes de diffusion, Automatique, sons, position, captures d'écran |
| 4 | [Presets et concepteur de presets](presets.md) | L'apparence de la popup, créer la vôtre, partager des fichiers `.awpreset` |
| 5 | [Overlay](overlay.md) | La liste des succès en jeu : recherche, filtres, rareté |
| 6 | [Manette](controller.md) | Piloter l'application et l'overlay avec un gamepad |
| 7 | [Game Health](game-health.md) | Le rapport par jeu et ses réparations guidées |
| 8 | [Dépannage](troubleshooting.md) | Problèmes de détection, de progression, de notification et de temps de jeu |

## Quand vous en avez besoin {#when-you-need-it}

| Guide | Ce qu'il couvre |
|---|---|
| [FAQ](faq.md) | Réponses courtes aux questions habituelles |
| [Linux et Steam Deck](linux.md) | L'AppImage et ses mises à jour, les bureaux, le raccourci de l'overlay, Steam, Proton et les lanceurs |
| [Outils avancés](advanced.md) | Maintenance, vidage des caches, réinitialisations, jeux manuels, diagnostics |
| [Configuration Goldberg / GBE](emulator-setup.md) | Diagnostiquer ou réparer un jeu Steam émulé |
| [Configuration d'Uplay, R1 et R2](uplay-r2.md) | L'équivalent Ubisoft |
| [Comparaison](comparison.md) | En quoi AW Next diffère d'Achievement Watcher 2.x et d'Achievements |
| [Galeries communautaires](community-galleries.md) | Presets et thèmes d'autres personnes, et envoi des vôtres |

**Paramètres → Aide** est la référence la plus rapide quand l'application est ouverte. Elle s'adapte à votre configuration (raccourci de
l'overlay, affectations de la manette, mode de notification, thème, sources activées) et filtre ses sujets au fil de
la frappe.

## Référence pour les développeurs {#developer-reference}

Pour les contributeurs et toute personne qui compile AW Next depuis les sources.

| Sujet | Référence |
|---|---|
| Contribuer, branches, tests, style des commits | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| Mise en place du développement, exécution, packaging | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| Frontières application, moteur de rendu et Watchdog ; le contrat de l'analyseur | [Architecture](../architecture.md) |
| Formats de fichiers Goldberg / GBE, détection, invariants de réparation | [Référence Goldberg / GBE](../goldberg-gbe.md) |
| Comment les jeux Uplay R1/R2 sont identifiés, réparés et lus | [Référence Uplay R1/R2](../uplay-reference.md) |
| Gestion des versions, publication, CI, validation de la mise à jour automatique | [Processus de publication](../RELEASE_WORKFLOW.md) |
| L'installateur, le désinstallateur et l'outil de mise à jour | [Installateur, désinstallateur et mises à jour](../INSTALLER_AND_UPDATES.md) |
| Traduction, formatage Intl, routage des liens, le linter de locales | [Localisation](../localization.md) |
| Fichiers de locale et parité des clés | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| Le fichier de thème portable et ses versions | [Format .awtheme](../awtheme-format.md) |

## Où se trouvent vos données {#where-your-data-lives}

Tout ce qu'écrit AW Next se trouve sous **`%APPDATA%\Achievement Watcher Next`** (`~/.config/Achievement
Watcher Next` sous Linux, même organisation). Les chemins ci-dessous sont relatifs à ce dossier. Une mise à niveau garde tout, et
le premier lancement importe un ancien dossier Achievement Watcher sans le modifier.

| Quoi | Où |
|---|---|
| Paramètres, index et bases de données | `cfg\` (`options.ini` est le fichier de paramètres) |
| Journaux | `logs\` |
| Presets que vous avez créés ou importés | `presets\Users Presets\` |
| Images qu'un preset utilise comme fond | `presets\images\` |
| Sons que vous avez ajoutés | `sounds\` |
| Thèmes que vous avez enregistrés ou importés | `theme-packs\` |
| Images utilisées par le thème Personnalisé | `theme-images\` |
| Un thème en feuille de style que vous avez déposé | `themes\` |
| Sauvegardes de succès, et celles faites avant une réparation GBE | `backups\achievements\`, `backups\gbe\` |
| Jaquettes et icônes de jeux | `covers\`, `gameIcons\` |
| Captures d'écran | `Pictures\Achievement Watcher Next` (ou le dossier que vous avez choisi) |
| Comptes connectés | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json`, `cfg\psn-auth.json` |
| **Retéléchargeable :** schémas, icônes et rareté venant d'une plateforme | `steam_cache\`, `uplay_cache\` |
| **Retéléchargeable :** outils téléchargés et résultats de scan de dossiers | `cache\` (sauf `cache\uplayR2`, qui contient une DLL que vous avez fournie) |
| Sauvegardes GBE Fork (écrites par l'émulateur) | `%APPDATA%\GSE Saves` |
| Sauvegardes Goldberg classiques (idem) | `%APPDATA%\Goldberg SteamEmu Saves` |

**Paramètres → Avancé → Vider les caches** vide les deux lignes retéléchargeables et rien d'autre. Rien
sous `cfg\`, `presets\`, `theme-packs\`, `theme-images\`, `themes\`, `sounds\`, `covers\`,
`gameIcons\` ou `backups\` n'est régénéré, copiez-les donc avant une réinstallation.

Avant de signaler un problème, lancez **Paramètres → Avancé → Diagnostics**, reproduisez-le une fois, puis retirez
les données privées des journaux que vous joignez.

### Ce qui quitte ce PC {#what-leaves-this-pc}

AW Next n'a ni outil d'analyse, ni télémétrie, ni compte propre. Il n'envoie que les requêtes dont il a besoin,
et met chaque réponse en cache pour que la bibliothèque continue de fonctionner hors ligne.

| Il demande | À | En transmettant |
|---|---|---|
| Listes de succès, icônes, rareté globale | Aux points d'accès publics de Steam, à la page SteamCommunity, à SteamHunters, à Exophase | L'AppID d'un jeu et la langue de l'interface |
| Jaquettes et logos | Au CDN de Steam, à SteamDB, à SteamGridDB | L'AppID ou le titre d'un jeu |
| Vérifications et téléchargements de mises à jour | Au flux de versions GitHub | Rien d'autre que la requête |
| Outils de réparation, quand vous lancez une réparation | Aux projets GBE Fork, Steamless, API-bypass et CrakFiles | Rien d'autre que la requête |
| Votre bibliothèque et vos déblocages, **seulement si vous connectez un compte** | Steam, Epic, Xbox Network ou PlayStation Network | Le jeton de session du compte ; pour les déblocages Steam, le Steam ID public |
| Votre bibliothèque RetroAchievements et vos déblocages, **seulement si vous remplissez la carte du compte** | retroachievements.org | Votre nom d'utilisateur et votre clé Web API, stockés chiffrés sur ce PC |
| Presets et thèmes de la communauté, **seulement si vous ouvrez la galerie ou y publiez** | Le service de la galerie, `aw-gallery.shirow.dedyn.io` | La requête de listing ; un fichier seulement quand vous appuyez sur Publier |

Quand l'exécutable d'un jeu porte une vraie icône de 256 px, AW Next la lit dans le fichier et l'utilise comme
logo sans interroger le réseau.

Ce site web ne dépose aucun cookie, n'exécute aucun outil d'analyse et charge ses polices et ses scripts depuis son propre hôte.
Les pages de la galerie récupèrent leur listing auprès du service de galerie ci-dessus, et se rabattent sur la copie
publiée à côté quand il est injoignable.

Rien d'autre n'est envoyé : ni votre bibliothèque, ni votre temps de jeu, vos dossiers ou vos captures d'écran. La diffusion facultative
`Websocket @localhost:8082` n'écoute que sur `127.0.0.1`, si bien que seuls les programmes de ce PC peuvent la
lire. La seule chose que vous envoyez délibérément est un preset ou un thème que vous publiez dans une galerie (voir
[Les galeries communautaires](community-galleries.md)).
