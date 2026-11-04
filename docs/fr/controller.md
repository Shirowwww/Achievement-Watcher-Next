---
title: "Guide de la manette"
description: "Pilotez Achievement Watcher Next et son overlay en jeu avec une manette Xbox, PlayStation ou Switch, et sentez un déblocage grâce à la vibration."
---

# Guide de la manette (gamepad)

Un gamepad peut piloter deux endroits distincts : la fenêtre principale et l'overlay en jeu. Les deux se règlent dans
**Paramètres → Manette**.

<div align="center">
<picture><source srcset="../assets/shot/controller-panel-800.webp 800w, ../assets/shot/controller-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/controller-panel.png" width="720" height="529" alt="Paramètres - Manette"></picture><br>
<sub>Navigation dans l'overlay et l'application, disposition et affectation des boutons par raccourci</sub>
</div>

## Les deux interrupteurs {#the-two-switches}

| Réglage | Par défaut | Ce qu'il couvre |
|---|---|---|
| **Contrôler l'app à la manette** | Activé | La fenêtre principale d'AW Next : bibliothèque, détails des jeux, paramètres et recherches. |
| **Contrôler l'overlay en jeu à la manette** | Désactivé | L'overlay en jeu, piloté par le suiveur en arrière-plan pendant que vous jouez. |

La navigation dans l'application est une simple entrée de fenêtre et ne coûte rien, elle est donc activée par défaut. Le contrôle de l'overlay charge
la pile native de la manette dans le suiveur en arrière-plan, il faut donc l'activer soi-même.

## Les raccourcis en un coup d'œil {#shortcuts-at-a-glance}

Les noms de boutons suivent le vocabulaire Xbox ; l'application les affiche dans la disposition que vous choisissez.

<div align="center">
<img src="../assets/img/controller-map.svg" width="700" height="422" alt="Un gamepad avec les raccourcis par défaut : LT ouvre Game Health, RT lance le jeu, LB et RB changent d'onglet des paramètres, la croix directionnelle déplace le focus, A confirme, B annule, X cherche, Y et Start ouvrent les Paramètres, plus les trois combinaisons de l'overlay" loading="lazy">
</div>

| Raccourci | Par défaut | Où |
|---|---|---|
| Ouvrir / fermer l'overlay | **Back + Start + LB** | En jeu |
| Activer la navigation dans l'overlay | **LB + X** | Overlay ouvert |
| Déplacer et faire défiler l'overlay | **LB + RB** (maintenus) | Overlay ouvert |
| Confirmer | **A** | Application + overlay |
| Retour / annuler | **B** | Application + overlay |
| Placer le curseur dans la recherche | **X** | Application + overlay |
| Ouvrir les Paramètres / les options de l'overlay | **Y** | Application + overlay |
| Ouvrir les Paramètres | **Start** | Application |
| Lancer le jeu sélectionné | **RT** | Application, bibliothèque |
| Ouvrir Game Health pour le jeu sélectionné | **LT** | Application, bibliothèque |
| Onglet précédent / suivant des paramètres | **LB** / **RB** | Application, Paramètres ouverts |
| Faire défiler la page | **LB** / **RB** | Application, Paramètres fermés |

La bascule de l'overlay utilise trois boutons pour ne pas se déclencher par accident en pleine partie. Chaque raccourci de l'overlay
est configurable et accepte de un à trois boutons.

Dans la bibliothèque, le stick se déplace entre les tuiles et **A** ouvre le jeu, comme un clic. Les deux
commandes dessinées sur une tuile correspondent aux gâchettes : **RT** lance le jeu sélectionné et **LT** ouvre
son panneau Game Health. Les deux ne font rien si aucune tuile de la bibliothèque n'est sélectionnée.

## Options {#options}

- **Type de manette** : le vocabulaire des indications et des noms de boutons. **Auto** suit la manette connectée
  quand elle peut être identifiée ; les autres sont **Xbox**, **PlayStation** et **Switch**.
- **Backend de la manette** : **Auto** choisit le meilleur backend d'entrée disponible, **XInput** est le plus
  compatible, et **GameInput** convient aux versions récentes de Windows.
- **Affectations** : de un à trois boutons par raccourci. Des raccourcis peuvent partager un bouton (c'est le cas par défaut :
  **LB + X** et **LB + RB** utilisent tous deux LB), et la couche d'entrée veille à ce que maintenir une combinaison ne
  déclenche pas l'autre. Un bouton répété dans une même affectation compte une fois. La bascule de l'overlay accepte aussi
  le bouton **Guide** ; les deux modes de l'overlay non, parce que l'API gamepad du navigateur qui les lit
  ne le signale pas de façon fiable.
- **Donner le focus à l'overlay à l'ouverture** : donne le focus clavier à l'overlay, ce qui met en pause de nombreux jeux qui
  perdent le focus. Désactivé par défaut.
- **Envoyer Échap au jeu à l'ouverture par manette** : envoie un appui sur la touche Échap au jeu qui a le focus
  juste avant l'ouverture de l'overlay, si bien que de nombreux jeux se mettent en pause ou ouvrent leur menu. Cela ne se produit que pour les ouvertures
  déclenchées à la manette pendant qu'un jeu tourne, jamais pour le raccourci clavier. Désactivé par défaut.

## Fenêtre de l'application {#app-window}

Avec la navigation dans l'application activée, appuyer sur n'importe quel bouton du gamepad dans la fenêtre principale fait apparaître un anneau de focus. La
croix directionnelle ou le stick gauche se déplace entre les commandes, et les raccourcis ci-dessus s'appliquent. Deux précisions :

- **B** quitte d'abord un champ de texte qui a le focus, puis revient en arrière ou annule, ce qui permet de quitter le champ de recherche
  sans la souris.
- **LB** / **RB** changent d'onglet des paramètres quand les Paramètres sont ouverts et font défiler la page quand ils sont fermés.

Bouger la souris ou appuyer sur une touche du clavier rend le contrôle à la souris et au clavier.

## Overlay en jeu {#in-game-overlay}

**Back + Start + LB** ouvre ou ferme l'overlay par-dessus le jeu en cours. **LB + X** bascule ensuite
le mode navigation : la croix directionnelle ou le stick gauche déplace l'anneau de focus, **A** confirme, **B** annule, **X**
place le curseur dans la recherche et **Y** ouvre le panneau des options. Maintenir **LB + RB** déplace l'overlay avec le
stick gauche et fait défiler la liste avec le stick droit.

Un petit badge **UI** s'affiche dans l'en-tête tant que la navigation est active, et la barre d'aide montre vos propres
affectations et votre disposition. Le reste de l'overlay est dans le [guide de l'overlay](overlay.md).

> [!IMPORTANT]
> Windows ne permet pas à une application tierce de capturer une manette de façon exclusive, si bien que le jeu peut encore
> recevoir les entrées des boutons pendant que l'overlay est ouvert. Pour mettre le jeu en pause, activez **Donner le focus à l'overlay
> à l'ouverture** (la plupart des jeux se mettent en pause quand ils perdent le focus) ou **Envoyer Échap au jeu à l'ouverture
> par manette**.

## Manettes prises en charge {#supported-pads}

Les manettes Xbox, les PlayStation DualShock 4 / DualSense et les manettes Switch Pro sont prises en charge. Les manettes Xbox
passent par XInput ; les manettes PlayStation et Switch sont lues en HID brut, elles n'ont donc besoin d'aucun pilote
du fabricant.

## Quand une manette n'est pas détectée {#when-a-controller-is-not-detected}

1. Vérifiez que le bon interrupteur est activé : la navigation dans l'application et le contrôle de l'overlay sont distincts.
2. Essayez explicitement le backend **XInput** ; **Auto** peut choisir GameInput sur une version où une manette donnée
   n'est pas énumérée.
3. Vérifiez la manette dans le panneau des contrôleurs de jeu de Windows (`joy.cpl`). Si Windows ne la voit pas, AW Next
   ne peut pas la voir non plus.
4. Pour un rapport de bug, ajoutez `debugLogging = true` à la section `[controller]` de
   `%APPDATA%\Achievement Watcher Next\cfg\options.ini` et redémarrez. Le suiveur en arrière-plan consigne alors
   des diagnostics au niveau des boutons. Il n'y a pas d'interrupteur dans l'interface parce que la sortie est verbeuse ; désactivez-le
   ensuite.

---

**Suite :** [Game Health](game-health.md) - le panneau par jeu qui explique pourquoi un jeu est ou n'est pas
suivi.

<div align="center">

[← Documentation](README.md) · [Guide de l'overlay](overlay.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## Sous Linux {#on-linux}

Sous Linux, AW Next lit les gamepads depuis les périphériques d'entrée du noyau, et les raccourcis ci-dessus fonctionnent de la même
façon. Pendant que Steam Input tourne, il ne lit que les manettes virtuelles de Steam, si bien qu'un appui n'est pas compté deux fois. Le
Steam Deck et le plugin Decky sont traités dans [Linux et Steam Deck](linux.md#steam-deck).
