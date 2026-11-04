---
title: "Liste des succès en jeu (overlay)"
description: "La liste des succès en jeu ouverte avec Ctrl+Maj+K : recherche, filtres, rareté, descriptions masquées et personnalisation."
---

# Liste des succès en jeu (overlay)

L'overlay en jeu (`Ctrl+Maj+K` par défaut pendant qu'un jeu pris en charge tourne) affiche la liste des succès
du jeu en cours sans le quitter : noms, descriptions, état de verrouillage, dates de déblocage et
progression. Faites-le glisser par son en-tête ; il reste au-dessus du jeu. Sous Linux, un jeu qui tourne nativement
sous Wayland ne transmet pas le raccourci : associez plutôt `~/.local/bin/achievement-watcher --toggle-overlay`
à une touche, comme le montre [Raccourci de l'overlay](linux.md#overlay-shortcut).

<div align="center">
<picture><source srcset="../assets/shot/overlay.webp 569w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/overlay.png" width="360" height="633" alt="Liste des succès de l'overlay en jeu"></picture><br>
<sub>Colonnes d'état, de rareté et de date, avec recherche et filtres</sub>
</div>

## Comment ouvrir la liste des succès dans un jeu ? {#how-do-i-open-the-achievement-list-in-a-game}

Appuyez sur `Ctrl+Maj+K` pendant qu'un jeu pris en charge tourne. C'est le raccourci par défaut. L'overlay liste chaque
succès de ce jeu avec son état, sa date de déblocage, sa rareté et sa progression, et vous pouvez y chercher.
Appuyez de nouveau sur le raccourci pour le fermer. À la manette, le réglage par défaut est **Back + Start + LB**.

Sous Linux avec Wayland, un jeu qui tourne dans une fenêtre Wayland native ne transmet jamais la touche à AW Next.
Associez plutôt `~/.local/bin/achievement-watcher --toggle-overlay` à une touche dans les réglages du clavier de
votre bureau. Voir [Raccourci de l'overlay](linux.md#overlay-shortcut).

## L'overlay est-il la même chose que la popup de déblocage ? {#is-the-overlay-the-same-as-the-unlock-popup}

Non. La popup est une notification ponctuelle qui apparaît quand quelque chose se débloque, stylisée par un preset (voir
[Notifications](notifications.md)). L'overlay est la liste complète d'un jeu, ouverte par vous, et
reste jusqu'à ce que vous la fermiez.

## Ce qu'il affiche {#what-it-shows}

- Une barre de statistiques avec `débloqués / total` et le pourcentage de complétion.
- Une ligne par succès avec une pastille d'état colorée (`Débloqué` / `Verrouillé`), la date de déblocage pour les
  succès obtenus, et une barre de progression avec une étiquette `courant / max` pour les succès à progression.
- Un badge de rareté (`★ 12.3%`) pour chaque succès dont le taux de déblocage est connu. Les succès communs utilisent
  un badge gris foncé ; les rares utilisent l'or, l'argent et le bronze avec un halo doux, à 5 %, 10 % et 15 %
  par défaut. **Paramètres → Général → Affichage de la rareté** change les paliers ou bascule vers les niveaux de trophées.

## Succès masqués {#hidden-achievements}

L'overlay ne gâche pas un succès masqué que vous n'avez pas débloqué : comme dans la fenêtre principale, sa
description indique *Masqué - clique pour révéler*. Cliquez dessus, ou appuyez sur **A** à la manette, pour révéler
cette description. La recherche ignore les descriptions encore masquées.

<div align="center">
<picture><source srcset="../assets/shot/overlay-hidden-800.webp 800w, ../assets/shot/overlay-hidden.webp 1162w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/overlay-hidden.png" width="560" height="482" alt="La liste de l'overlay en double : descriptions masquées, puis une révélée" loading="lazy" decoding="async"></picture><br>
<sub>Avant et après un clic sur « We've all been there before... » : seule cette description est révélée</sub>
</div>

## Recherche et filtres {#search-and-filters}

- Le champ de recherche filtre les lignes par nom et description de succès au fil de la frappe.
- Les pastilles au-dessus de la liste basculent entre **Tous**, **Débloqués**, **Verrouillés** et **En cours**.
- Cliquer sur l'en-tête de colonne **Rareté**, **Date** ou **Statut** trie par ordre croissant, puis décroissant,
  puis revient à l'ordre naturel. Une seule colonne trie à la fois.
- `/` met le curseur dans le champ de recherche. `Échap` le vide, ou ferme le panneau des options s'il est ouvert.

## Manette (gamepad) {#controller-gamepad}

Activez **Contrôler l'overlay en jeu à la manette** dans **Paramètres → Manette** pour piloter
l'overlay avec un gamepad. Avec les affectations par défaut :

- **Back + Start + LB** ouvre ou ferme l'overlay.
- **LB + X** bascule le mode navigation : un anneau de focus montre où vous êtes, et un petit badge **UI**
  apparaît dans l'en-tête de l'overlay.
- En mode navigation, la croix directionnelle ou le stick gauche déplace le focus, **A** confirme, **B** annule, **X**
  place le curseur dans la recherche et **Y** ouvre le panneau des options.
- Maintenir **LB + RB** déplace l'overlay avec le stick gauche et fait défiler la liste avec le stick
  droit.

Chaque raccourci est configurable, les noms de boutons suivent la disposition choisie, et la barre d'aide de l'overlay
montre vos propres affectations. Le [guide de la manette](controller.md) couvre les réglages, les manettes prises en charge
et la réserve de Windows : le jeu voit toujours vos appuis sur les boutons.

## Personnalisation {#customization}

Le bouton **⚙** dans l'en-tête de l'overlay ouvre les options :

- **Accent** : cinq couleurs prédéfinies, un sélecteur de couleur libre, ou **Utiliser le thème de l'application** pour suivre le thème
  de la fenêtre principale (utilisé pour la progression, les filtres actifs, les anneaux de focus et la lueur des lignes débloquées).
- **Densité** : espacement des lignes Compact, Confortable ou Aéré.
- **Taille des icônes** : Petite, Moyenne ou Grande.
- **Zoom** : de 80 % à 125 % de la taille du panneau.
- **Opacité** : de 40 % à 100 % du fond du panneau.
- **Interrupteurs d'affichage** pour la barre de statistiques, les barres de progression, les badges de rareté et les descriptions.

Les changements s'appliquent aussitôt et sont enregistrés en local. **Réinitialiser** rétablit l'apparence d'origine. Les
options se règlent au clavier : les menus de zoom et d'opacité montrent un anneau de focus, les interrupteurs se basculent avec
Tab et Espace, et les animations suivent le réglage de réduction des animations du système.

## Raccourcis clavier (overlay ouvert) {#keyboard-shortcuts-overlay-open}

- `Ctrl+Alt+Maj+Flèches` - déplace légèrement la fenêtre de l'overlay.
- `Ctrl+Alt+Maj+1` … `5` - l'accroche à une position prédéfinie.
- `Ctrl+Alt+Maj+C` - active ou désactive le clic traversant.

## Remarques {#notes}

- L'overlay suit la langue d'interface choisie dans l'application.
- Après la première ouverture, la fenêtre de l'overlay est gardée masquée et réutilisée pendant 5 minutes, si bien que la rouvrir
  est quasi instantané. Tant qu'elle est masquée, elle suspend l'interrogation de la manette, et après 5 minutes
  d'inactivité la fenêtre est libérée pour récupérer de la mémoire.
- Le contenu des lignes est échappé avant l'affichage ; les données de succès sont seulement affichées, jamais exécutées.
- La liste de l'overlay est distincte des presets de *notification* ponctuelle de l'overlay (Paramètres →
  Notification), où l'apparence de la popup est configurée.

---

**Suite :** [Guide de la manette](controller.md) - piloter l'overlay et l'application avec un gamepad.

<div align="center">

[← Documentation](README.md) · [Guide des notifications](notifications.md) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
