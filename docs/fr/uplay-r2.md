---
title: "Configuration de Goldberg Uplay, R1 et R2"
description: "Configurez les succès des jeux Ubisoft compatibles avec les chargeurs Uplay R1 et R2, et réparez-les en toute sécurité."
---

# Configuration de Goldberg Uplay (R1 et R2)

AW Next dispose d'une réparation distincte pour les jeux Ubisoft qui tournent avec l'émulateur Goldberg Uplay. Il ne
touche jamais aux installations officielles d'Ubisoft Connect : un jeu n'est sélectionné qu'une fois qu'AW Next a prouvé le
chargeur exact et la génération qu'il utilise.

Un jeu Ubisoft ne charge que la génération de chargeur avec laquelle son exécutable a été lié : à peu près 2019
et après, c'est **R2**, tout ce qui précède est **R1**. AW Next détecte et répare celle qui s'applique, puisque
la mauvaise génération déposerait une DLL que le jeu n'ouvre jamais. Un jeu Ubisoft à deux identifiants de produit (un
jeu de base et son édition Complete) fonctionne dans les deux cas : une sauvegarde sous l'un ou l'autre identifiant est lue, et un identifiant
d'objectif seul qu'elle contient est mis en correspondance avec la liste des succès Steam.

> [!WARNING]
> La réparation modifie des fichiers de jeu. Utilisez-la uniquement avec des jeux que vous possédez.

## Réparer un jeu {#repair-a-game}

Depuis **Game Health** :

1. Ajoutez la bibliothèque du jeu dans **Paramètres → Dossiers** et scannez-la.
2. Ouvrez le panneau **Game Health** du jeu et examinez **Diagnostiquer la configuration Uplay R1/R2**.
3. Lancez **Appliquer le correctif de succès Ubisoft** et lancez le jeu une fois.

Depuis **Paramètres → Émulateurs → Ubisoft / Uplay R1/R2** :

<div align="center">
<picture><source srcset="../assets/shot/uplay-r2-panel-800.webp 800w, ../assets/shot/uplay-r2-panel.webp 928w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/uplay-r2-panel.png" width="720" height="536" alt="Paramètres - Ubisoft / Uplay R2"></picture><br>
<sub>Le paquet de réparation intégré est vérifié avant que le moindre jeu soit touché</sub>
</div>

- **Corriger automatiquement les nouveaux jeux détectés** : l'interrupteur également affiché sous Steam / GBE Fork, appliqué
  aussi aux jeux Ubisoft. Désactivé par défaut.
- **Réparer les jeux Uplay R1/R2 détectés** : répare chaque installation détectée en un seul lot confirmé.
- **Importer ou remplacer des DLL** / **Restaurer les DLL intégrées** : utilisez votre propre version du chargeur, ou revenez à
  celle qu'AW Next fournit. Une DLL choisie manuellement n'a pas besoin d'une empreinte SHA-256 connue, mais ce doit être un
  chargeur Uplay valide capable de gérer les succès, avec un nom et une architecture cohérents.

Les DLL intégrées se trouvent dans `app/resources/uplayR2/` (R2) et `app/resources/uplayR1/` (R1). AW Next
vérifie leurs empreintes, leur architecture PE et leur capacité à gérer les succès avant qu'une réparation puisse les utiliser, et
conserve une archive de récupération à côté.

La même transaction de réparation s'exécute depuis le menu contextuel, Game Health, la réparation automatique, Tout réparer et le
bouton de lot. Elle fait un instantané de chaque DLL, schéma et INI modifié sous `<game>\.aw-backups\<timestamp>\`
et les restaure automatiquement si la validation échoue ensuite. Répéter une réparation identique ne fait
rien.

## Associer un jeu non reconnu à sa version Steam {#linking-an-unmapped-game-to-its-steam-release}

AW Next associe seul la plupart des jeux Ubisoft à leur version Steam, pour convertir les noms de succès Steam
en identifiants d'objectifs Ubisoft qu'attend le chargeur. Quand il n'y arrive pas, choisissez vous-même la version
avec **Identifier le jeu (AppID Steam)** dans le menu du clic droit du jeu. Une association qui ne peut pas être
confirmée est refusée, car une mauvaise écrirait la liste de succès d'un autre jeu dans le dossier
de ce jeu.

Ouvrir une fois la page des succès du jeu dans Ubisoft Connect peut aider AW Next à reconnaître un titre qui
en a besoin, comme Brawlhalla ou The Crew 2. Le choix que vous confirmez est mémorisé pour ce dossier
d'installation précis. L'association automatique (la table intégrée, le catalogue Ubisoft en direct et la
règle de correspondance des titres) est décrite dans la [référence Uplay R1/R2](../uplay-reference.md).

## Un jeu qui ne demande jamais de succès {#a-game-that-never-asks-for-an-achievement}

Certains titres Ubisoft demandent d'abord la session Ubisoft au chargeur, et le chargeur répond à partir d'une
clé vide. Ces jeux lisent la clé vide comme une déconnexion et n'appellent jamais l'API des succès. La configuration
semble correcte et rien n'est enregistré. Avatar: Frontiers of Pandora se comporte ainsi.

Quand le journal de diagnostic de Game Health le prouve, il propose **Activer les succès hors connexion** sur le contrôle
Configuration émulateur. Cela ajoute une clé de session factice à côté du jeu : pas une vraie session
Ubisoft, aucun compte impliqué, rien envoyé nulle part, juste de quoi passer ce seul contrôle. Elle n'est jamais
ajoutée automatiquement, parce qu'un jeton non légitime peut casser certains jeux.

**Lancez le jeu une fois après l'avoir activé.** D'ici là, la ligne indique *Succès hors connexion activés,
lancez le jeu une fois*. Le bouton à côté indique alors **Désactiver les succès hors connexion**, qui retire
la clé.

Cela ne s'applique qu'aux chargeurs R2 ; l'INI de R1 contient une clé sans rapport. Le [guide Goldberg / GBE](emulator-setup.md)
couvre l'équivalent Steam de cette réparation.

## Les succès restent à 0 % {#achievements-remain-at-0}

- Relancez **Diagnostiquer la configuration Uplay R1/R2** après une mise à jour du jeu, car les mises à jour retirent souvent le schéma
  ou réinitialisent le nombre de déblocages.
- Lisez `upc_r2.log` (ou `upc_r1.log`) à côté de la DLL du chargeur : il consigne chaque numéro d'objectif que le
  jeu demande. Gardez **Journal de diagnostic** activé, dans **Paramètres → Émulateurs → Ubisoft / Uplay R1/R2**.
  Game Health en a besoin pour distinguer un jeu qui n'a jamais rien demandé d'un jeu qui demande un objectif que le schéma
  ne contient pas. C'est activé par défaut, et AW Next réduit le journal une fois qu'il dépasse 25 Mo.
- Consultez `%APPDATA%\Achievement Watcher Next\logs\parser.log`.

## Note sur l'antivirus {#antivirus-note}

Si un antivirus supprime une DLL de chargeur isolée, ou met en quarantaine l'archive de récupération en cours de route, Game
Health signale un problème d'antivirus et propose d'autoriser le dossier et de remettre les fichiers en place. Vous n'avez pas
besoin de chercher un remplaçant vous-même.

L'identité, les identifiants d'objectifs et le journal du chargeur sont couverts dans la [référence Uplay R1/R2](../uplay-reference.md).

<div align="center">

[← Documentation](README.md) · [Dépannage](troubleshooting.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
