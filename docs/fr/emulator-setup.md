---
title: "Configuration des succès Goldberg et GBE Fork"
description: "Diagnostiquez ou réparez un jeu Steam émulé avec Goldberg ou GBE Fork, avec une sauvegarde et une confirmation avant chaque écriture."
---

# Configuration des succès Goldberg et GBE Fork

AW Next lit les sauvegardes de succès que produisent Goldberg, GBE Fork et les structures d'émulateurs Steam
compatibles. Il peut aussi diagnostiquer et réparer la configuration locale de l'émulateur d'un jeu quand le schéma,
l'AppID ou les fichiers d'exécution sont incomplets.

## Comment obtenir des notifications de succès avec Goldberg ou GBE Fork ? {#how-do-i-get-achievement-notifications-with-goldberg-or-gbe-fork}

Goldberg et GBE Fork sont des émulateurs Steam : ils se substituent à la bibliothèque Steam et enregistrent les déblocages dans un
fichier de sauvegarde, `achievements.json`, sous `%APPDATA%\GSE Saves\<appid>`. Un second fichier du même nom,
dans le dossier `steam_settings` du jeu, ne fait que décrire les succès. AW Next lit les deux et affiche
la popup de déblocage par-dessus le jeu. Ajoutez le dossier du jeu dans **Paramètres → Dossiers**, lancez **Recherche auto**,
puis faites un clic droit sur le jeu et choisissez **Diagnostiquer l'émulateur** s'il reste à 0 %. Rien n'est écrit dans le
dossier du jeu tant que vous ne demandez pas une réparation.

> [!WARNING]
> Les outils de réparation sont facultatifs. Ils modifient des fichiers dans le dossier de jeu sélectionné : utilisez-les uniquement
> avec des jeux que vous possédez, et gardez toute sauvegarde supplémentaire qui vous importe.

## Le schéma et les fichiers de sauvegarde sont différents {#schema-and-save-files-are-different}

Deux fichiers sans rapport portent couramment le nom `achievements.json` :

| | Fichier de schéma | Fichier de sauvegarde d'exécution |
|---|---|---|
| Emplacement habituel | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` ou `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| Écrit par | Le jeu ou la configuration de l'émulateur | L'émulateur pendant que le jeu tourne |
| Rôle | Noms, descriptions et icônes des succès | Quels succès sont débloqués |
| Quand il manque | La gestion des succès en jeu peut être incomplète ; AW Next peut utiliser une autre source de schéma | Le jeu affiche 0 % jusqu'à l'écriture du premier déblocage |

Un fichier de schéma ne prouve pas qu'un succès est débloqué, et une sauvegarde d'exécution sans entrée obtenue est un 0 %
valide. Les deux dossiers de sauvegarde peuvent exister pour un même jeu : AW Next lit celui qui contient les déblocages. Si une configuration GBE ou
Goldberg redirige les sauvegardes ailleurs (`local_save_path`), AW Next surveille le dossier où elles
atterrissent.

## Procédure recommandée {#recommended-workflow}

1. Ajoutez la bibliothèque de jeux ou la racine des sauvegardes dans **Paramètres → Dossiers**.
2. Lancez **Recherche auto** ou **Générer les configs**.
3. Si le jeu affiche des données manquantes, faites un clic droit dessus et choisissez **Diagnostiquer l'émulateur**.
4. Lisez le rapport avant d'appliquer une réparation.
5. Utilisez **Appliquer le fix émulateur** pour installer la DLL d'exécution et réparer `steam_settings` en même temps.
6. Lancez le jeu, débloquez un succès et actualisez AW Next si besoin.

La configuration automatique des jeux nouvellement découverts est facultative, sous **Paramètres → Émulateurs → Steam / GBE
Fork**. Quand elle est désactivée, un scan de bibliothèque n'écrit rien dans un dossier de jeu (ni DLL, ni fichier de configuration,
pas même un `achievements.json` manquant) tant que vous ne demandez pas une réparation.

<div align="center">
<picture><source srcset="../assets/shot/steam-gbe-panel-800.webp 800w, ../assets/shot/steam-gbe-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/steam-gbe-panel.png" width="720" height="529" alt="Paramètres - Steam / GBE Fork"></picture><br>
<sub>La réparation automatique, les interrupteurs DLC et identité, et le décompresseur SteamStub facultatif</sub>
</div>

## Actions du menu contextuel {#context-menu-actions}

<div align="center">
<picture><source srcset="../assets/shot/emulator-tools-800.webp 800w, ../assets/shot/emulator-tools.webp 1049w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/emulator-tools.png" width="560" height="336" alt="Menu contextuel Émulateur et outils" loading="lazy" decoding="async"></picture><br>
<sub>Clic droit sur un jeu → Émulateur &amp; outils</sub>
</div>

### Diagnostiquer l'émulateur {#diagnose-emulator}

Indique le type d'émulateur détecté, l'AppID, l'emplacement de `steam_settings`, le nombre d'éléments du schéma et des sauvegardes, les
entrées ou icônes manquantes, les chemins de sauvegarde personnalisés et les différences d'AppID, et si l'environnement d'exécution installé est celui
qu'AW Next y a placé. Le diagnostic est en lecture seule.

### Appliquer le fix émulateur {#apply-emulator-fix}

Répare la DLL d'exécution et le schéma en une seule étape :

- télécharge et met en cache une version de GBE Fork correspondante et installe l'architecture de DLL dont le jeu a besoin
  (`steam_api.dll` ou `steam_api64.dll`), en gardant tout fichier existant en sauvegarde ;
- construit `steam_settings\achievements.json` (et son dossier `images`) d'après la liste des succès
  Steam, et télécharge les icônes ;
- écrit `steam_appid.txt` s'il manque ;
- écrit les fichiers de configuration GBE (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

Chaque fichier qu'il remplace est d'abord sauvegardé, et les réparations de schéma gardent aussi des copies horodatées sous
`steam_settings\.aw-backups`. L'environnement d'exécution est installé comme un remplacement de DLL normal ; AW Next ne
configure pas de lanceur ColdClient distinct.

Les versions packagées d'Unreal Engine sont réparées de la même façon. Leurs fichiers Steam se trouvent sous
`Engine\Binaries\ThirdParty\Steamworks` plutôt qu'à côté de l'exécutable, et AW Next les y trouve, les installe
et les vérifie.

### Propriété des DLC et identité du compte {#dlc-ownership-and-account-identity}

Deux interrupteurs dans **Paramètres → Émulateurs → Steam / GBE Fork**, tous deux désactivés par défaut et indépendants de
la réparation automatique :

| Réglage | Ce qu'il écrit |
|---|---|
| **Gérer la propriété des DLC** | `configs.app.ini`, pour que l'émulateur signale chaque DLC comme possédé |
| **Écrire le nom de compte et la langue** | Votre nom de compte et votre langue, dans `configs.user.ini` |

Aucun des deux n'affecte les succès. Laissez-les désactivés pour garder un jeu d'origine, ou si vous gérez les DLC ou l'identité
à la main.

La carte **Identité de l'émulateur** en dessous montre ce qui est écrit :

| Champ | Ce qu'il fait |
|---|---|
| **Nom du compte** | Écrit tant que **Écrire le nom de compte et la langue** est activé. Vide, il utilise le nom de votre profil AW Next. |
| **Steam ID** | Écrit tant que cet interrupteur est activé ; vide, il garde celui de chaque jeu. Le bouton dé en génère un valide au hasard, et une faute de frappe est signalée pendant la saisie et jamais écrite. |
| **Dossier de sauvegarde** | S'applique dès que vous en choisissez un : chaque jeu corrigé ou réparé à partir de là y enregistre (`local_save_path`), et AW Next le surveille pour les notifications en direct. Vide, il garde `%APPDATA%\GSE Saves`. |

Pour annuler ce que l'un ou l'autre interrupteur a écrit, faites un clic droit sur un jeu et choisissez **Retirer la configuration émulateur d'AW Next**.
Il montre exactement ce qu'il va retirer avant de faire quoi que ce soit. Il ne retire que la section
DLC, les interrupteurs et les clés d'identité qu'AW Next a ajoutés, garde chaque valeur que vous ou le repack avez définie, et ne supprime
un fichier que s'il ne reste plus rien d'autre dedans.

### Utiliser votre propre DLL d'émulateur {#using-your-own-emulator-dll}

**Paramètres → Émulateurs → DLL d'émulateur** importe votre propre `steam_api.dll` ou `steam_api64.dll` et
l'installe à la place de la version téléchargée de GBE Fork, à chaque correction et à chaque correction automatique. L'
architecture que vous n'importez pas vient toujours de la version officielle, tout comme les outils d'interface.

Un fichier importé est revalidé à chaque utilisation : ce doit être un vrai PE de l'architecture que son nom
annonce, et ce doit être une DLL d'émulateur Steam. Un fichier qui échoue est signalé et ignoré, jamais
installé. **Utiliser la version officielle** supprime l'import et revient à la version téléchargée.

### Retirer le DRM Steam (Steamless) {#remove-steam-drm-steamless}

Tente de décompresser SteamStub depuis l'exécutable sélectionné quand un remplacement de DLL ne peut pas se charger. L'exécutable
d'origine est conservé sous le nom `*.steamstub.bak`. Cela ne fait rien pour les jeux sans SteamStub et ne contourne pas
les contrôles de propriété côté serveur.

### Sauvegarder et restaurer {#back-up-and-restore}

Faites un clic droit sur **Sauvegarder GBE/Goldberg** pour prendre un instantané de la DLL et des fichiers `steam_settings` actuels, ou sur
**Restaurer la dernière sauvegarde GBE/Goldberg** pour en remettre une en place. Une sauvegarde note quand le dossier contenait déjà
une configuration qu'AW Next avait écrite, si bien qu'elle n'est jamais prise pour l'original intact.

## Définir l'AppID manuellement {#set-appid-manually}

Quand le nom du dossier d'un jeu correspond à plusieurs versions Steam et que l'association automatique a choisi la mauvaise,
faites un clic droit dessus et choisissez **Définir l'AppID manuellement**. L'AppID est écrit dans `steam_appid.txt` et
mémorisé pour ce dossier d'installation, si bien que les réparations suivantes l'utilisent au lieu de deviner de nouveau. **Effacer l'AppID
manuel**, dans le même menu, le retire.

## Problèmes courants {#common-problems}

### Le jeu est manquant {#the-game-is-missing}

- Lancez l'émulateur une fois pour qu'il crée une sauvegarde d'exécution, ou ajoutez la vraie bibliothèque de jeux pour que la détection puisse
  trouver `steam_settings`, `steam_appid.txt` ou la DLL de l'API Steam.
- Vérifiez que le dossier ajouté dans les Paramètres est assez haut pour contenir le dossier du jeu, mais n'est pas un disque entier
  de données sans rapport.
- Lancez **Générer les configs** et examinez le nombre de résultats.

### Tous les succès restent verrouillés {#every-achievement-remains-locked}

Vérifiez ces causes dans l'ordre :

1. **Rien n'est encore débloqué.** Une sauvegarde d'exécution absente ou vide est normale.
2. **Les noms du schéma ne correspondent pas aux clés de la sauvegarde.** Lancez **Diagnostiquer l'émulateur**, puis réparez le schéma.
3. **Le chemin de sauvegarde est personnalisé.** Dirigez AW Next vers la vraie racine des sauvegardes ou retirez la redéfinition
   factice.
4. **L'AppID est faux.** Utilisez **Définir l'AppID manuellement** avant de lancer une autre réparation.

### Des descriptions ou des icônes sont manquantes {#descriptions-or-icons-are-missing}

Lancez une réparation complète avec le téléchargement des icônes activé. Quand les métadonnées en ligne sont indisponibles, AW Next peut réutiliser un
schéma local valide, mais il ne peut pas inventer des descriptions qu'aucune source n'a.

### Les notifications en jeu manquent mais la bibliothèque se met à jour {#in-game-notifications-are-missing-but-the-library-updates}

AW Next lit la sauvegarde d'exécution, mais le schéma de l'émulateur du jeu ou son overlay peut être incomplet. Vérifiez
que `steam_settings\achievements.json` a les mêmes noms d'API que la sauvegarde d'exécution et des chemins d'icônes
valides.

## Limites {#limitations}

Certains jeux ne signalent pas du tout leurs succès via Steamworks, même vendus sur Steam, et ne peuvent pas
être suivis par un chemin de sauvegarde Goldberg ou GBE. AW Next ne peut pas non plus réparer un jeu dont il ne peut pas résoudre sûrement la véritable identité
ou le schéma de succès.

La [référence technique Goldberg/GBE](../goldberg-gbe.md) couvre les formats de fichiers, les règles de détection et les
détails d'implémentation.

---

**Suite :** [Configuration d'Uplay, R1 et R2](uplay-r2.md), l'équivalent Ubisoft pour les jeux qui ne chargent pas
`steam_api.dll`.

<div align="center">

[← Documentation](README.md) · [Référence technique](../goldberg-gbe.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
