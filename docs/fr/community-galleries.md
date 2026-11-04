---
title: "Les galeries communautaires"
description: "Récupérez un preset de notification ou un thème créé par quelqu'un d'autre, ou envoyez le vôtre à la galerie de la communauté."
---

# Les galeries communautaires

Deux galeries, un service, un seul ensemble de règles.

| | | |
|---|---|---|
| [Galerie de presets](../gallery/) | `.awpreset` | La popup de notification : disposition, typographie, couleurs, animations et son |
| [Galerie de thèmes](../gallery/themes/) | `.awtheme` | Le reste de l'application : fenêtre, barre de titre, bibliothèque, listes de succès, paramètres et overlay |

Pour télécharger depuis l'une ou l'autre, récupérez le fichier, puis utilisez **Paramètres → Presets de notification → Importer** ou
**Paramètres → Apparence → Importer**. Cette page couvre l'autre côté : comment en ajouter un, ce qui est vérifié,
et ce qu'une carte peut dire.

## En envoyer un {#sending-one}

Le déroulement est le même pour les deux, et rien ne quitte votre navigateur avant d'appuyer sur **Publier**.

1. **Exportez-le.** Utilisez Paramètres → Presets de notification → Exporter pour un preset, ou Paramètres → Apparence →
   Exporter pour un thème. Le fichier contient déjà le nom, la description, la version, les tags et la version d'AW Next
   dont il a besoin.
2. **Choisissez le fichier** dans le panneau *Envoie le tien* de la page de la galerie, ou déposez-le sur le panneau. Le choix
   n'envoie rien : le fichier attend pendant que vous remplissez le reste, et le panneau indique ce qu'il contient.
3. **Vérifiez ce que la carte doit dire.** Quatre champs sont remplis à partir du paquet dès que vous le choisissez :
   un **nom**, une **description** d'une ligne, des **tags** et un **crédit**. Le crédit est l'auteur que l'
   application a enregistré à l'export, c'est donc le nom sous lequel vous vous présentez, et il n'est vide que si vous avez choisi de ne pas
   être crédité. Tapez un tag et appuyez sur Entrée pour en faire une pastille ; cliquez sur une pastille pour la retirer.

   **Le nom est le seul champ qui doit être rempli.** Il coiffe la carte et donne l'adresse sous laquelle le
   fichier est publié, et un nom choisi pour quelqu'un d'autre est ce qu'un modérateur finit par réécrire.
   Publier reste inactif tant qu'il n'y en a pas. Les trois autres peuvent rester vides, et la carte n'affiche alors
   rien à cet endroit.
4. **Appuyez sur Publier.** Cela prend quelques secondes, parce que l'image est calculée, pas devinée. Ensuite, il
   attend : rien n'apparaît dans une galerie avant qu'un mainteneur l'approuve.

Tout ce qui se trouve dans ces champs est une **suggestion**. Cela remplace le paquet seulement là où c'est rempli, c'est
nettoyé exactement comme un manifeste, et un mainteneur voit les quatre à côté de l'image calculée avant que
quoi que ce soit soit publié. Rien de cela ne décide d'un nom de fichier ni d'une adresse : le service construit l'adresse à partir
du nom, garde les lettres minuscules, les chiffres et les tirets, et refuse tout le reste.

Votre navigateur lit les champs dans le paquet (son `manifest.json` et rien de plus). Le fichier lui-même
ne part que lorsque vous appuyez sur Publier.

| | Preset | Thème |
|---|---|---|
| Paquet | 4 Mo au plus | 8 Mo au plus |
| Fréquence | Cinq envois par heure depuis une même adresse, presets et thèmes confondus | |

## L'image n'est pas à vous de l'envoyer {#the-picture-is-not-yours-to-send}

Vous ne pouvez joindre de capture d'écran à aucune des deux galeries. Le service calcule l'image à partir de votre paquet.

Pour un **preset**, il dessine la popup à partir du paquet, dans le même document isolé que celui qu'utilise l'application,
une fois dans un navigateur sans réseau ni script propre, à la taille à laquelle l'application l'affiche. Il la dessine
dans chaque état qu'un preset doit gérer : un déblocage ordinaire, un rare bronze, argent et or,
la popup 100 % et une étape de progression. Une carte en montre un à la fois, avec un bouton fléché de chaque côté pour
les parcourir, et l'image agrandie est celle qui est affichée. Vérifiez les six pendant la conception : un
preset qui n'est lisible que dans un seul de ces états le montre ici.

Un **thème** n'est que des couleurs et des nombres, donc le serveur dessine un échantillon fixe de l'interface d'AW Next avec
votre thème (barre de titre, ligne de profil, bibliothèque, liste des derniers déblocages, surface des paramètres) et le photographie.
C'est l'échantillon que montrent les Paramètres avant un import, à la même taille. Il repose chaque fois sur les mêmes quatre
dégradés d'arrière-plan, si bien qu'un thème transparent ne s'affiche pas comme un design délavé et que deux
rendus d'un même fichier sont identiques.

Le texte de l'échantillon est une constante du code source de l'application, donc une carte ne peut pas porter une bibliothèque, un compte, un chemin ou un
jeu à vous, ni montrer une version de l'envoi que vous n'avez pas envoyée.

## Ce qui voyage dans un fichier {#what-travels-in-a-file}

Un **`.awpreset`** contient le document et la feuille de style du preset, ses images, ses polices et son son,
et les réglages du concepteur qui le sous-tendent. Rien sur votre machine.

Un **`.awtheme`** contient des couleurs, des dégradés, des ajustements, des réglages d'effets et toute image de fond que vous avez choisie,
et rien d'autre : ni feuille de style, ni balisage, ni script. Une image voyage sous forme d'octets sous un nom construit à partir
de son calque, jamais comme un chemin hors de votre dossier d'images. La liste complète est dans
[le format `.awtheme`](../awtheme-format.md).

Un **thème en feuille de style utilisateur ne peut pas être exporté.** Un `.css` que vous avez déposé dans
`%APPDATA%\Achievement Watcher Next\themes` n'est pas un `.awtheme`, et Exporter le refuse. Partagez le
`.css` lui-même.

## Arrière-plans et autres ressources {#backgrounds-and-other-assets}

Tout ce qui se trouve dans un paquet est redistribué à toute personne qui le télécharge, donc cela doit être à vous
de le redistribuer :

- Vos propres illustrations, ou quelque chose sous une licence qui le permet. Un fond d'écran trouvé en ligne n'est généralement ni l'un
  ni l'autre, et une police achetée non plus.
- Rien avec un logo, un filigrane ou du texte incrusté. Un thème est une apparence, pas un emplacement.
- Rien qui ne passerait pas pour un fond d'écran de bureau au travail.

Un thème fait de couleurs seules est bienvenu et c'est le plus facile à accepter.

## Crédit et licence {#credit-and-licence}

Le nom sur une carte est ce que le champ **Crédit** finit par dire. Il commence par l'auteur que l'application
a enregistré à l'export, donc il est généralement juste. Modifiez-le si vous êtes connu sous un autre nom, ou videz-le
et la carte n'affiche aucun nom. Un mainteneur peut ajouter un lien vers votre profil en l'approuvant.

**Tout ce qui est listé dans l'une ou l'autre galerie est publié sous
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** En envoyant, vous l'acceptez, vous confirmez
que c'est votre propre travail et que tout ce qu'il contient vous appartient de le céder.

## Ce qui est vérifié {#what-is-checked}

Un envoi doit passer deux couches.

**Le lecteur propre de l'application.** `app/util/presetPackage.js` et `app/util/themePackage.js`, les modules qui
s'exécutent à l'Import, valident le paquet : le manifeste, la version du format, la version minimale de l'application, chaque
chemin à l'intérieur, les types de fichiers, les tailles et le point d'entrée. Le service de la galerie utilise ces fichiers
tels quels, si bien qu'une règle ajoutée là s'applique ici à la prochaine compilation, et que rien ne peut être listé que l'application
refuserait.

**Les limites propres de la galerie**, dont un import privé n'a pas besoin :

| | |
|---|---|
| Nom de fichier | Lettres minuscules, chiffres et tirets, de 2 à 48 caractères, construit par le service à partir du nom |
| Paquet | 4 Mo pour un preset, 8 Mo pour un thème |
| Image | Calculée par le service, une fois par état, et refusée si l'une sort de la taille qu'un listing sert (500 Ko au plus chacune) |
| Nom | Unique dans sa galerie, puisque deux entrées de même nom entrent en collision à l'import |

Rien dans un paquet n'est exécuté pendant sa vérification, et le site web n'en affiche jamais un : une carte montre une
image produite par le service. Un preset ne s'exécute que dans l'application, dans la même fenêtre de notification isolée
qu'un preset fourni, et un thème ne peut rien exécuter nulle part.

## Ce qui est refusé {#what-gets-refused}

- Le travail de quelqu'un d'autre, sauf s'il a dit oui et que vous le créditez.
- Des ressources que vous ne pouvez pas redistribuer.
- Une popup qui se fait passer pour autre chose : une boîte de dialogue système, une publicité, une adresse à visiter.
- Une publicité, un logo ou un appel à l'action incrusté dans une image de fond.
- Une palette qui rend le texte illisible.
- Un quasi-doublon de quelque chose de déjà listé.

Un refus garde la somme de contrôle et supprime les octets, si bien qu'envoyer de nouveau le même fichier est reconnu
au lieu d'être mis deux fois en file d'attente.

## Mettre à jour ou retirer le vôtre {#updating-or-removing-yours}

Envoyez le fichier plus récent de la même façon, avec la version à l'intérieur du paquet augmentée, et dites dans la
description qu'il remplace une carte antérieure pour qu'un mainteneur puisse retirer celle-ci. Pour faire
retirer une entrée, [ouvrez un ticket](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) et
dites de quelle carte il s'agit.

## Quand le panneau n'est pas là {#when-the-panel-is-not-there}

Aucun serveur de galerie ne répond, et la page liste une copie publiée à côté. Tout ce qui se trouve déjà dans une
galerie peut encore être téléchargé. Seul l'envoi d'un élément nouveau doit attendre, réessayez donc plus tard.

Le projet gère le service qui fait apparaître le panneau, et il ne fait pas partie de ce dépôt, donc
il n'y a rien à installer pour lui.

## Thèmes de Steam Achievement Notifier {#themes-from-steam-achievement-notifier}

Ils ne sont pas listés ici et ne le seront pas.

Les thèmes SAN sont des fichiers `.san` que les gens se passent directement. Le dépôt SAN n'a ni dossier de thèmes,
ni liste wiki, ni flux, donc une version n'a rien vers quoi pointer. Les fichiers appartiennent à ceux qui les ont faits et
ne sont pas sous licence de redistribution, et le dépôt SAN ne porte aucune licence. Copier
l'un ou l'autre ici republierait le travail d'autres personnes sans permission.

AW Next lit plutôt les vôtres. **Paramètres → Presets de notification → Importer un thème SAN** lit un fichier `.san`,
ou le `usertheme.json` d'un thème déjà décompressé, et **Importer depuis SAN sur ce PC** lit
les propres réglages de SAN. Dans les deux cas, le thème devient un preset AW Next, dessiné avec le moteur propre de SAN
à la taille de SAN, et s'exporte en `.awpreset` comme n'importe quel autre. Ce qui est repris est dans
[Presets](presets.md#import-a-theme-from-steam-achievement-notifier).

Si vous en avez importé un qui est à vous, exportez-le et envoyez celui-là. C'est alors votre preset, crédité à votre nom.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Suite :** [Presets et concepteur de presets](presets.md) : ce qu'est un preset, et comment en faire un.

<div align="center">

[← Documentation](README.md) · [Galerie de presets](../gallery/) · [Galerie de thèmes](../gallery/themes/) · [Accueil du projet](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
