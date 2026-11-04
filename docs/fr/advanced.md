---
title: "Outils avancés"
description: "Les outils de maintenance de Paramètres, Avancé : vidage des caches, diagnostics, sauvegarde du profil, AppID manuels et réinitialisations."
---

# Outils avancés

Ces outils se trouvent dans **Paramètres → Avancé** ou dans le menu du clic droit d'un jeu. L'onglet Avancé
n'existe que lorsque l'interface est en mode **Avancé** : changez le contrôle **Interface** en haut
des Paramètres si vous ne le voyez pas. On ne perd rien en revenant en arrière.

<div align="center">
<picture><source srcset="../assets/shot/advanced-panel-800.webp 800w, ../assets/shot/advanced-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/advanced-panel.png" width="720" height="529" alt="Paramètres - Avancé, configuration et maintenance"></picture><br>
<sub>Configuration &amp; maintenance ; les autres sections se replient en dessous</sub>
</div>

## Configuration et maintenance {#setup-and-maintenance}

| Outil | Ce qu'il fait |
|---|---|
| **Réparer tous les jeux détectés** | Lance la réparation adaptée (Steam/GBE Fork ou Ubisoft/Uplay R2) sur chaque jeu compatible détecté dont le dossier d'installation est connu. Cela reconstruit les jeux qui ont déjà une configuration. |
| **Désactiver l'accélération matérielle** | Coupe l'accélération GPU quand la fenêtre ou l'overlay se comporte mal. Demande un redémarrage. |
| **Vider les caches** | Supprime uniquement les caches qu'on peut retélécharger : fichiers de mise à jour, cache des schémas et des icônes Steam/Ubisoft, et outils de correction d'émulateur téléchargés. Les paramètres, sauvegardes de jeu, copies de secours et fichiers placés à la main ne sont jamais touchés. |
| **Revérifier les listes de succès** | Interroge Steam pour les succès ajoutés par une mise à jour d'un jeu. Cela se fait tous les 3 jours ; le bouton le force maintenant. |
| **Mises à jour automatiques des données de succès** | Activé par défaut. Désactivé, cela arrête cette revérification et la réparation des descriptions vides, pour qui entretient `steam_cache` à la main. **Revérifier les listes de succès** fonctionne toujours quand c'est désactivé. |

Les réglages de réparation propres à chaque source sont dans **Paramètres → Émulateurs**. **Ubisoft / Uplay R2** contient
l'état du paquet, les commandes d'import et de restauration des DLL, et la réparation groupée ciblée ; les détails du chargeur et de l'INI restent
automatiques.

**Vider les caches** est la première chose à essayer quand une mise à jour échoue sans cesse sur le même fichier téléchargé.

## Diagnostics {#diagnostics}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Paramètres - Avancé, diagnostics" loading="lazy" decoding="async"></picture><br>
<sub>Les versions, et un clic pour accéder aux dossiers des journaux et des données</sub>
</div>

La carte Diagnostics affiche les versions de l'application, d'Electron, de Node et de Chrome, et ouvre le dossier des journaux,
le dossier des données ou une vérification de mise à jour. **Exporter les journaux (.zip)** regroupe chaque fichier de journal dans une seule archive
pendant que l'application tourne ; les copier à la main n'est pas fiable parce que les processus qui les écrivent ne s'arrêtent jamais.
Votre nom d'utilisateur et toute clé, jeton ou mot de passe sont masqués dans l'archive, pas dans les journaux du disque. Voir
[Dépannage](troubleshooting.md#open-logs-and-local-data) pour ce qu'un rapport de bug demande.

## Sauvegarde du profil {#profile-backup}

<div align="center">
<picture><source srcset="../assets/shot/profile-backup-panel-800.webp 800w, ../assets/shot/profile-backup-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/profile-backup-panel.png" width="720" height="529" alt="Paramètres - Avancé, sauvegarde du profil" loading="lazy" decoding="async"></picture><br>
<sub>Exporter le profil et Restaurer le profil, sous Paramètres → Avancé</sub>
</div>

**Exporter le profil…** enregistre vos paramètres, choix de bibliothèque, presets, thèmes, jaquettes, arrière-plans personnalisés,
points de restauration GBE et temps de jeu dans un seul fichier `.awbackup`, pour une réinstallation ou un nouveau PC. Les connexions,
les caches et les journaux ne sont jamais enregistrés, vous vous reconnectez donc ensuite à Epic, Steam, Xbox, PlayStation et
RetroAchievements. **Restaurer le profil…** vérifie d'abord le fichier en entier et l'applique au
démarrage suivant. Les fichiers qu'il remplace sont conservés, et une restauration qui échoue remet tout en place.

## Jeux retirés {#removed-games}

Un jeu retiré avec **Retirer d'AW Next** est listé dans **Paramètres → Général → Jeux retirés**,
et peut être rétabli un par un ou tous à la fois. Utilisez cela pour un dossier parasite que le scan continue de
trouver mais qui n'est pas un jeu ; pour garder un vrai jeu hors de vue, **Masquer de l'affichage** est plus léger
(voir [Masquer, retirer ou effacer un jeu](#hide-remove-or-clear-a-game)).

## Réinitialiser les succès d'un jeu {#reset-a-games-achievements}

**Réinitialiser les succès**, sur la page du jeu à côté du temps de jeu ou dans son menu du clic droit, remet
chaque succès à l'état verrouillé pour que vous puissiez rejouer le jeu depuis le début. AW Next les annonce comme
nouveaux quand ils se débloquent.

<div align="center">
<picture><source srcset="../assets/shot/achievements-800.webp 800w, ../assets/shot/achievements.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/achievements.png" width="800" height="492" alt="Une page de jeu avec Réinitialiser les succès" loading="lazy" decoding="async"></picture><br>
<sub>Réinitialiser se trouve à côté du compteur de complétion sur la page du jeu elle-même</sub>
</div>

Chaque fichier concerné est d'abord sauvegardé dans
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`, et la confirmation liste
les fichiers exacts avant que quoi que ce soit soit touché. Un fichier dont la sauvegarde échoue est ignoré, pas vidé.

| Source | Ce que fait une réinitialisation |
|---|---|
| Émulateurs Steam (Goldberg / GBE et structures compatibles, dont Goldberg SocialClub et Uplay R2) | Supprime la sauvegarde des succès. L'émulateur en écrit une neuve au déblocage suivant. |
| RPCS3 | Supprime `TROPUSR.DAT`. La liste des trophées (`TROPCONF.SFM`) est laissée intacte. |
| ShadPS4 | Reverrouille les trophées dans `TROP*.XML`, qui contient aussi la liste des trophées, le fichier est donc modifié, pas supprimé. |
| KytyPS5 | Supprime les fichiers de déblocage `trophies_*.json` du jeu. La liste des trophées reste dans le paquet du jeu lui-même. |
| Xenia | Efface l'indicateur d'obtention dans le `.gpd`, qui contient aussi la liste des succès, le fichier est donc modifié. |
| Steam, GOG Galaxy, Ubisoft Connect, EA, Epic, Xbox | **Impossible.** Ces plateformes gardent les déblocages sur votre compte et les resynchronisent ; seul le compte peut les effacer. AW Next le dit. |

Les compteurs de progression stockés à côté des succès (`stats.ini`, `stats.bin`, …) sont aussi réinitialisés et
sauvegardés : pour un succès « parcourir 1000 km », le compteur est la progression, et le laisser plein ferait
se déclencher le succès aussitôt ou plus jamais.

**Restaurer une sauvegarde de succès**, dans le même menu du clic droit, remet en place toute une réinitialisation. Actualisez la
bibliothèque ensuite pour lire les déblocages restaurés.

> [!NOTE]
> Une réinitialisation efface aussi le registre propre d'AW Next de ce qui était déjà débloqué, y compris dans le
> suiveur en arrière-plan en cours d'exécution. Sinon, un succès regagné ne serait plus jamais annoncé.

## Reverrouiller un seul succès {#re-lock-a-single-achievement}

Faites un clic droit sur un succès débloqué sur la page du jeu et choisissez **Reverrouiller ce succès** pour
rejouer celui-là. Seul ce succès repasse à l'état verrouillé : son indicateur, son heure de déblocage et sa
progression dans la sauvegarde de l'émulateur, son compteur quand la sauvegarde en relie un, et le
registre propre d'AW Next, si bien qu'il est annoncé comme nouveau quand vous le gagnez. La confirmation liste les fichiers et chaque fichier
est d'abord sauvegardé, comme pour une réinitialisation ; **Restaurer une sauvegarde de succès** le remet en place.

Fermez d'abord le jeu. Un émulateur garde ses déblocages en mémoire et les réécrit à la fermeture du jeu,
ce qui annulerait la modification, donc AW Next refuse tant qu'un jeu tourne.

Cela fonctionne avec les sauvegardes texte des émulateurs Steam (Goldberg et GSE, CODEX, RUNE, OnlineFix, RLD!,
3DM, ALI213, TENOKE, Hoodlum, RAZOR1911, CreamAPI), UniverseLAN, Nemirtingas, Uplay R1 et R2,
GreenLuma et LumaPlay sous Windows, et les sauvegardes de console de RPCS3, ShadPS4, Xenia, KytyPS5, des portages Xbox
360 et de XLLN. Les sauvegardes de SmartSteamEmu (`stats.bin`) et de SKIDROW (`achieve.dat`) ne sont pas modifiées un
succès à la fois, leur structure n'étant pas documentée ; utilisez **Réinitialiser les succès** pour celles-là.

## Masquer, retirer ou effacer un jeu {#hide-remove-or-clear-a-game}

Le menu du clic droit d'un jeu propose trois façons de le faire disparaître, de la plus légère à la plus forte :

| Entrée | Ce qui se passe | Comment l'annuler |
|---|---|---|
| **Masquer de l'affichage** | Le jeu quitte Tous les jeux, chaque collection et les statistiques, mais il est toujours suivi et notifie toujours. | Le menu Collections montre une vue **Masqués** tant qu'un jeu est masqué ; faites un clic droit dessus là et choisissez **Réafficher**. |
| **Retirer d'AW Next** | Le scan ignore le jeu : il quitte la bibliothèque. Prévu pour les outils et autres choses qui ne sont pas des jeux. | **Paramètres → Général → Jeux retirés**. |
| **Effacer les infos du jeu...** | Tout ce qu'AW Next garde sur le jeu est effacé : ses sauvegardes de succès (sauvegardées d'abord, comme pour une réinitialisation), le temps de jeu, la liste des succès et les icônes en cache, les réglages par jeu, et la configuration d'émulateur qu'AW Next a écrite dans son dossier. La confirmation liste d'abord chaque élément. | Rien à annuler : le scan suivant retrouve le jeu comme un jeu nouveau. |

## Renommer un jeu {#renaming-a-game}

**Réglages du jeu → Renommer…**, dans le menu du clic droit, définit le nom sous lequel un jeu est affiché : sur sa
tuile et son écran, dans la recherche et le tri, dans les notifications, et dans les dossiers où les captures d'écran et les clips
sont enregistrés. La recherche trouve toujours le jeu par son nom d'origine. Laissez le champ vide, ou choisissez
**Rétablir le nom d'origine**, pour revenir en arrière. Le nom est conservé par jeu dans `cfg/gameTitles.json`, si bien qu'il
survit aux nouveaux scans et fait partie de la sauvegarde du profil. La recherche des jaquettes et la reconnaissance des jeux utilisent le nom
d'origine.

**Paramètres → Général → Titres des jeux dans ma langue**, activé par défaut, affiche les jeux Steam sous le
titre que Steam leur donne dans la langue de vos succès (la langue propre du jeu quand il en a une).
Les jaquettes suivent la même langue. Le catalogue local de Steam répond pour les jeux que votre client Steam connaît ;
les autres sont demandés une fois, par lots, et revérifiés après un mois. Un nom que vous définissez vous-même l'emporte
toujours.

## Modifier le temps de jeu d'un jeu {#editing-a-games-playtime}

**Succès et temps de jeu → Modifier le temps de jeu…**, dans le menu du clic droit, remplace le temps de jeu
total d'un jeu, par exemple un temps repris d'un autre suiveur ou un temps où des sessions ont manqué. Saisissez des heures
(`12.5`) ou des heures et des minutes (`12h30` ou `12:30`). La date de la dernière session est conservée, et AW Next
ajoute les sessions suivantes au nouveau total. Un jeu que vous possédez sur Steam ne descend jamais sous le temps de jeu que Steam
indique : le scan suivant remonte un total plus bas à celui de Steam.

## Une autre langue de succès pour un seul jeu {#a-different-achievement-language-for-one-game}

**Réglages du jeu → Langue des succès**, dans le menu du clic droit, affiche les succès et les notifications d'un jeu
dans une autre langue que le reste de la bibliothèque. **Comme l'application** revient au
choix global.

## Ajouter un jeu manuellement {#add-a-game-manually}

Le `+` à côté de la recherche de la bibliothèque ajoute un jeu à partir d'un titre et d'un exécutable, avec une plateforme
et un AppID Steam facultatifs. Utilisez-le pour un jeu qu'aucune source ne détecte : une version autonome, une installation
portable, ou un émulateur que vous lancez vous-même.

Un jeu ajouté manuellement :

- est lançable et suit le temps de jeu comme n'importe quelle autre entrée ;
- affiche **Pas de succès** s'il n'en a pas, et il est exclu des statistiques de complétion au lieu d'être
  compté à 0 % ;
- peut adopter plus tard un schéma de succès Steam en ajoutant l'AppID, sans être recréé ;
- conserve des diagnostics par jeu protégés, tandis que les actions destructrices restent masquées.

Les dossiers ajoutés manuellement portent une petite icône dans la liste des Dossiers, pour les distinguer des emplacements
découverts par Recherche auto.

## Définir l'AppID d'un jeu à la main {#set-a-games-appid-by-hand}

Faites un clic droit sur un jeu dont le nom de dossier correspond à plusieurs versions Steam, si bien que l'association automatique a choisi
la mauvaise, et choisissez **Définir l'AppID manuellement...**. Le choix est mémorisé par dossier d'installation et
écrit dans `steam_appid.txt` ; **Effacer l'AppID manuel** l'annule. La réparation **Corriger
le fichier d'identification** de Game Health demande aussi l'AppID, en partant de la suggestion d'AW Next.

## Marquer un succès comme débloqué {#mark-an-achievement-as-unlocked}

Un succès qu'une source ne peut pas voir (obtenu avant la mise en place du suivi, ou jamais enregistré par un
émulateur) peut être marqué depuis son menu du clic droit avec **Marquer comme débloqué manuellement**. **Annuler le déblocage
manuel** l'annule. Les déblocages manuels persistent d'un scan à l'autre et sont effacés par une réinitialisation.

## Étapes sous un succès {#steps-under-an-achievement}

Un long succès peut être découpé en étapes que vous écrivez et cochez vous-même. Survolez-le sur la page du jeu
et ouvrez **Étapes**, ou faites un clic droit dessus et choisissez **Ajouter des étapes**, puis tapez une étape et appuyez sur Entrée.
Cliquez sur une case pour cocher une étape, double-cliquez sur son texte pour la renommer, et utilisez la croix pour la supprimer.
Le jeu ne signale jamais d'étapes, elles ne font donc que remplir la barre du succès : le déblocage vient toujours de
le jeu, et une fois qu'il a lieu, chaque étape s'affiche comme faite. L'overlay en jeu montre les mêmes étapes et
les coche à la souris ou à la manette.

**Étapes** dans l'en-tête du jeu exporte la liste dans un fichier à partager, ou en importe une. Un fichier contient
les textes, pas les coches, et ses succès sont associés par identifiant, puis par nom ; les étapes déjà présentes
gardent leurs coches. Les étapes sont dans `cfg/achievement-steps.json` et vont dans la sauvegarde du profil.

## Outils d'émulateur et de réparation {#emulator-and-repair-tools}

Le diagnostic et la réparation des configurations Goldberg / GBE Fork, l'installateur de l'environnement GBE, Steamless et le
contournement facultatif du contrôle d'API se trouvent dans **Paramètres → Émulateurs** et dans le sous-menu **Émulateur et outils**
de chaque jeu. Leurs guides :

- [Configuration Goldberg / GBE](emulator-setup.md) - diagnostiquer et réparer un jeu Steam émulé
- [Configuration d'Uplay, R1 et R2](uplay-r2.md) - l'équivalent Ubisoft
- [Référence Goldberg / GBE](../goldberg-gbe.md) - formats de fichiers et règles de détection

**Retirer la configuration émulateur d'AW Next**, dans le même menu, n'annule que la section DLC, les interrupteurs
et les clés d'identité qu'AW Next a écrits dans le `configs.user.ini` d'un jeu, jamais une valeur que vous ou le repack avez définie,
et ne supprime le fichier que s'il ne reste plus rien d'autre dedans. Il montre d'abord exactement ce qu'il va retirer,
ce qui est le seul moyen de récupérer si vous n'aviez jamais sauvegardé ce fichier.

**Appliquer le correctif de succès GOG (UniverseLAN)...** apparaît sur un jeu GOG qui embarque une dll Galaxy. Il
installe la version d'UniverseLAN qui correspond au SDK Galaxy de ce jeu, garde la dll d'origine en sauvegarde et
n'écrase jamais les sauvegardes UniverseLAN existantes. Les déblocages qu'il écrit sous `%LOCALAPPDATA%\UniverseLAN`
sont lus et notifiés comme tous les autres.

Si une réparation a mis en place l'émulateur pris en charge, **Annuler le changement d'émulateur** dans
[Game Health](game-health.md#the-repairs) remet en place les fichiers propres du crack.

> [!WARNING]
> Les réparations créent des sauvegardes, mais elles modifient quand même des fichiers de jeu. Utilisez-les uniquement avec des jeux que vous possédez.

---

**Suite :** [FAQ](faq.md) - des réponses courtes aux questions les plus fréquentes.

<div align="center">

[← Documentation](README.md) · [Dépannage](troubleshooting.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
