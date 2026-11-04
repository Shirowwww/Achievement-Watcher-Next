---
title: "Comparaison d'AW Next"
description: "En quoi Achievement Watcher Next diffère d'Achievement Watcher 2.x et de l'application Achievements, fonctionnalité par fonctionnalité."
---

# Comparaison d'AW Next

Achievement Watcher Next est une alternative à l'Achievement Watcher de Xan105, et son successeur. Il
fonctionne sous Windows et Linux, lit les sauvegardes de Steam, GOG, Epic, Ubisoft, Xbox PC et des émulateurs Steam, répare une
configuration Goldberg ou GBE Fork depuis l'application, et choisit lui-même son canal de notification. Achievements de
PSerban93 est l'autre suiveur Windows en développement actif, et Sentinel ne fonctionne que sous Linux.

AW Next prolonge [l'Achievement Watcher d'origine de Xan105](https://github.com/xan105/Achievement-Watcher)
et [la branche 2.x de darktakayanagi](https://github.com/darktakayanagi/Achievement-Watcher). Cette page le
met en regard de cette lignée, d'[Achievements](https://github.com/PSerban93/Achievements), l'autre suiveur
Windows en développement actif, et de [Sentinel](https://github.com/RemakeCode/sentinel), un observateur
réservé à Linux pour les sauvegardes d'émulateurs Steam.

Les quatre lisent bien les succès, la vraie question est donc de savoir quels extras correspondent à votre façon de jouer. Les tableaux
indiquent ce que chaque projet fait et ce qu'il ne fait pas.

Des parties d'AW Next sont dérivées d'Achievements sous sa licence MIT : quand une ligne marque les deux
projets, l'implémentation a parfois commencé chez JokerVerse. Voir
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE).

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| Plateforme | Windows et Linux | Windows uniquement | Windows uniquement | Linux uniquement |
| Licence | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| Environnement de bureau | Electron 44 | Electron 44 | Electron 12 | Go avec GTK 4 et WebKitGTK 6 |
| Développement | Actif | Actif (dernier push le 22 octobre 2026) | Archivé le 13 octobre 2026, en lecture seule | Actif (v2.1.1, 11 octobre 2026) |

## D'où viennent les succès {#where-the-achievements-come-from}

| Source | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Bibliothèques locales officielles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · sous Linux : Steam, Heroic, Lutris et Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (ancien) | ❌ |
| Connexion de compte facultative | ✅ Steam (jeux possédés, jeux partagés en famille, déblocages de vos autres PC) · Epic · Xbox (Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Sauvegardes d'émulateurs Steam | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · structures CODEX/RUNE/EMPRESS/Online-Fix/Tenoke, aussi sous Linux (préfixes Wine, et natif pour Goldberg et GBE) | ✅ Couverture comparable | ✅ Émulateurs Steam | ⚠️ Goldberg/GSE · CODEX · RUNE, dans des préfixes Wine/Proton |
| Versions portables sans configuration | ✅ Arborescence des sauvegardes lue seule | ⚠️ Saisie manuelle | ❌ | ⚠️ Préfixes ajoutés à la main |
| Goldberg Uplay R2 (Ubisoft) | ✅ Selon la version du chargeur | ❌ | ❌ | ✅ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| Émulateurs de console | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ RPCS3 seulement | ❌ |
| Jeux Xbox 360 recompilés pour PC (ReXGlue et similaires) | ✅ Liste, icônes, DLC et déblocages en direct, plus de 60 portages connus, versions Linux | ✅ | ❌ | ❌ |
| Jeux PS4 portés sur PC | ✅ run.py, portages natifs et à exécutable unique, PROTOTYPE, PORTHEON (UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess, schéma, DLC et icônes lus depuis le jeu | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ Jeux joués importés, jeux trouvés sur le disque via l'historique ou les playlists de RetroArch, déblocages en direct avec n'importe quel émulateur | ✅ | ❌ | ❌ |
| Correctifs de niche | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| Détection des dossiers | ✅ Configuration auto et Recherche auto | ✅ Configuration auto | ✅ Recherche auto | ⚠️ Rescanne les préfixes que vous ajoutez |
| Dossiers personnalisés et jeux manuels | ✅ Par jeu ou pour toute la bibliothèque | ✅ Par jeu | ⚠️ Configuration manuelle | ⚠️ Chemins de préfixe et d'émulateur |

AW Next et Achievements lisent maintenant à peu près les mêmes sources. AW Next va plus loin dans les structures de PC
émulés et c'est le seul des quatre qui sache corriger les sauvegardes Uplay R2 et SocialClub.

## Quand un jeu ne remonte rien {#when-a-game-does-not-report}

Tous les suiveurs peuvent vous dire qu'un jeu est bloqué à 0 %. AW Next essaie aussi de le réparer.

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Rapport de santé par jeu avec réparations guidées | ✅ | ❌ | ❌ | ❌ |
| Installer et réparer l'environnement d'exécution de l'émulateur | ✅ Goldberg / GBE, schémas compris | ⚠️ Génération de schéma | ❌ Manuel | ⚠️ Configuration au mieux avec le fork de Goldberg |
| Sauvegarde et restauration avant toute modification | ✅ Plus Steamless et contournement facultatif du contrôle d'API | ❌ | ❌ | ❌ |
| Réinitialiser ou restaurer les succès d'un jeu | ✅ | ❌ | ❌ | ❌ |
| Déblocage manuel | ✅ | ❌ | ❌ | ❌ |
| Définir l'AppID d'un jeu à la main | ✅ | ❌ | ❌ | ❌ |
| Source forcée par jeu | ✅ Auto / Steam / Ubisoft | ❌ | ❌ | ⚠️ Une seule source de données pour toute la bibliothèque |
| Liste noire et complétion hors ligne des noms | ✅ | ⚠️ Liste noire | ❌ | ❌ |

## Notifications {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Canaux | ✅ Toast natif + overlay en jeu + source navigateur OBS + toast Steam en Mode Jeu (plugin Decky) | ✅ Toast natif + overlay animé | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ Notification de bureau + plugin Decky en Mode Jeu |
| Choisit lui-même son canal | ✅ Mode Automatique, selon l'état de chaque jeu | ❌ Choix fixe | ❌ Choix fixe | ❌ |
| Concepteur de presets, sans code | ✅ 14 modèles de départ, aperçu en direct, 10 presets fournis dont Steam Original | ⚠️ Presets et thèmes intégrés, ceux sur mesure écrits en HTML/CSS | ❌ | ❌ |
| Presets partageables | ✅ `.awpreset` + galerie communautaire | ❌ | ❌ | ❌ |
| Style de rareté, de platine et de complétion | ✅ Rareté à 3 niveaux, barre de complétion | ✅ Rareté | ❌ | ❌ |
| Presets par émulateur | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| Sons | ✅ Choix aléatoire, FLAC/M4A/AAC | ✅ | ⚠️ Fichier personnalisé | ✅ Sons personnalisés |
| Captures d'écran | ✅ Capture compatible HDR sous Windows (mappage de tons BT.2408), aussi sous Linux avec X11 et Wayland | ✅ Capture HDR | ✅ | ❌ |
| Clips vidéo d'un déblocage | ✅ 10-30 s, 30/60 FPS, H.264 · HEVC · AV1, mappage de tons HDR ; sous Linux, gpu-screen-recorder ou l'enregistreur WebM intégré | ✅ 10-30 s, 30/60 FPS | ⚠️ Via OBS | ❌ |
| Notifications de temps de jeu et de progression | ✅ Coupure de la progression par jeu | ✅ Coupure de la progression par jeu | ✅ Temps de jeu | ✅ Progression, en plusieurs étapes |
| Apparence de notification propre à chaque jeu | ✅ Chaque jeu peut remplacer le preset, la position, le son et l'échelle | ❌ | ❌ | ❌ |

## L'application elle-même {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Recherche dans la bibliothèque, les jeux et les succès | ✅ | ✅ | ✅ | ⚠️ Tri de la bibliothèque |
| Filtre des jeux installés et actions sur les jeux | ✅ Filtre · désinstallation · restauration | ⚠️ Filtre par plateforme | ❌ | ❌ |
| Navigation complète à la manette | ✅ Application + overlay, sous Windows et Linux | ✅ Application + overlay | ❌ Prévu | ⚠️ Via le plugin Decky |
| Steam Deck | ⚠️ Plugin Decky, pas encore confirmé sur un vrai Deck | ❌ | ❌ | ✅ Plugin Decky dans Gamescope |
| Thèmes | ✅ Intégrés + éditeur Personnalisé + `.awtheme` partageable + galerie | ✅ Intégrés + fichiers de thème utilisateur | ❌ | ❌ |
| Langues de l'interface | ✅ 28 intégrées | ✅ Environ 30 intégrées | ✅ 18 | ❌ |
| Processus en arrière-plan | ✅ Un seul démon dans la zone de notification | ✅ Application dans la zone de notification | ⚠️ Watchdog distinct | ✅ Application dans la zone de notification |
| Téléchargements d'environnement supplémentaires | ✅ Aucun environnement de navigateur ; le fork de GBE n'est récupéré que lorsque vous l'installez ou le réparez | ⚠️ Chromium de Playwright | ✅ Aucun | ⚠️ GTK 4 et WebKitGTK 6 du système |
| Accès au clavier et aux lecteurs d'écran | ✅ Paramètres, boîtes de dialogue et overlay accessibles par Tab, focus rendu à la fermeture d'une boîte de dialogue | ⚠️ Raccourcis clavier et carte de la manette | ❌ | ❌ |
| Installateur, désinstallateur et fenêtre de mise à jour | ✅ Installateur et désinstallateur propres, fenêtre de mise à jour avec notes de version et progression | ❌ | ❌ | ⚠️ Paquets de distribution et Flatpak |
| Documentation | ✅ Guides, spécifications de formats et galeries | ⚠️ README | ⚠️ README | ⚠️ README et un guide Goldberg |

## Linux et Steam Deck {#linux-and-the-steam-deck}

AW Next existe aussi comme application Linux native (AppImage x64, jamais via Wine). Il suit les jeux lancés
via Steam et Proton, Wine, Lutris, Heroic et Bottles, et les jeux Linux natifs, avec les mêmes
popups, le même overlay et le même temps de jeu que sous Windows. La prise en charge du Steam Deck est récente : les notifications du Mode Jeu passent
par le plugin Decky du dépôt, et ni le plugin ni la popup du Mode Jeu n'ont été
confirmés sur un vrai Deck.

<sub>✅ = pris en charge et documenté · ⚠️ = partiel, manuel ou un autre flux de travail · ❌ = indisponible ou
non documenté sur la branche publique actuelle. Les colonnes des concurrents ont été comparées à leurs README
publics, aux métadonnées GitHub et aux manifestes de paquets le 22 octobre 2026. La colonne AW Next reflète la version
3.12.2 et les changements non publiés d'octobre 2026. Un ❌ dans une autre colonne signifie en général non documenté
plutôt qu'impossible, et tous ces projets avancent vite.</sub>

## Hydra et Steam Achievement Manager {#hydra-and-steam-achievement-manager}

Deux autres outils reviennent dans les mêmes recherches, et ils font un autre travail.

- [Hydra](https://hydralauncher.gg/) se décrit comme un lanceur de jeux qui permet de télécharger des jeux
  et de suivre des succès. AW Next ne télécharge pas de jeux.
- [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) se décrit comme une
  application légère et portable servant à gérer les succès et les statistiques sur Steam. Il exige le
  client Steam, un compte Steam et un accès réseau. AW Next affiche et suit les succès et n'exige aucun
  compte Steam.

Aucun des deux ne figure dans les tableaux ci-dessus, qui comparent les suiveurs lisant les sauvegardes locales et d'émulateurs.

## En bref {#in-short}

**AW Next** convient à une bibliothèque qui doit continuer de fonctionner sous Windows et Linux : lanceurs officiels et
sauvegardes émulées côte à côte, un rapport de santé qui répare une configuration Goldberg ou GBE au lieu de
seulement la signaler, des notifications qui choisissent elles-mêmes leur canal, et des presets et thèmes que vous pouvez concevoir et
partager.

**Achievements** a une longue liste de sources sous Windows, dont RetroAchievements, des portages recompilés et
des correctifs de niche, avec une bonne configuration automatique, un overlay animé et des clips vidéo d'un déblocage.

**Achievement Watcher 2.x** est la base historique, avec une large compatibilité d'émulateurs et d'anciens
canaux de notification sous Electron 12. Son dépôt a été archivé le 13 octobre 2026 et n'est plus
maintenu.

**Sentinel** est une option Linux légère pour les sauvegardes Goldberg, CODEX et RUNE, avec un plugin Steam Deck
bien intégré.

---

<div align="center">

[← Documentation](README.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
