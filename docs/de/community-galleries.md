---
title: "Die Community-Galerien"
description: "Ein Benachrichtigungs-Preset oder ein Design von jemand anderem übernehmen oder dein eigenes an die Community-Galerie schicken."
---

# Die Community-Galerien

Zwei Galerien, ein Dienst, ein Regelwerk.

| | | |
|---|---|---|
| [Preset-Galerie](../gallery/) | `.awpreset` | Das Benachrichtigungs-Popup: Layout, Schrift, Farben, Bewegung und Ton |
| [Design-Galerie](../gallery/themes/) | `.awtheme` | Der Rest der App: Fenster, Titelleiste, Bibliothek, Erfolgslisten, Einstellungen und Overlay |

Um aus einer von beiden herunterzuladen, nimm die Datei und nutze dann **Einstellungen → Benachrichtigungs-Presets → Importieren** oder
**Einstellungen → Darstellung → Importieren**. Diese Seite behandelt die andere Seite: wie man eines hinzufügt, was geprüft wird
und was eine Karte sagen darf.

## Eines einschicken {#sending-one}

Der Ablauf ist bei beiden gleich, und nichts verlässt deinen Browser, bevor du **Veröffentlichen** drückst.

1. **Exportiere es.** Nutze Einstellungen → Benachrichtigungs-Presets → Exportieren für ein Preset oder Einstellungen → Darstellung →
   Exportieren für ein Design. Die Datei trägt bereits Name, Beschreibung, Version, Tags und die AW-Next-Version,
   die sie braucht.
2. **Wähle die Datei** im Bereich *Schick deins* auf der Galerieseite oder ziehe sie auf den Bereich. Die Auswahl
   sendet nichts: Die Datei wartet, während du den Rest ausfüllst, und der Bereich nennt, was sie enthält.
3. **Prüfe, was die Karte sagen soll.** Vier Felder werden aus dem Paket befüllt, sobald du es wählst:
   ein **Name**, eine einzeilige **Beschreibung**, **Tags** und eine **Namensnennung**. Die Namensnennung ist der Autor, den die
   App beim Export festgehalten hat, also der Name, unter dem du auftrittst, und sie ist nur leer, wenn du dich gegen eine
   Nennung entschieden hast. Tippe einen Tag und drücke Enter, um daraus einen Chip zu machen; klicke einen Chip an, um ihn zu entfernen.

   **Der Name ist das einzige Feld, das ausgefüllt sein muss.** Er steht über der Karte und gibt die Adresse vor, unter der die
   Datei veröffentlicht wird, und ein Name, der für jemand anderen gewählt wurde, ist das, was ein Moderator am Ende umschreibt.
   Veröffentlichen bleibt wirkungslos, bis es einen gibt. Die anderen drei dürfen leer bleiben, und die Karte zeigt dann
   dort nichts.
4. **Drücke Veröffentlichen.** Es dauert einige Sekunden, weil das Bild gerendert und nicht geraten wird. Danach
   wartet es: Nichts erscheint in einer Galerie, bevor ein Betreuer es freigibt.

Alles in diesen Feldern ist ein **Vorschlag**. Er überschreibt das Paket nur dort, wo er ausgefüllt ist, er wird genau wie ein
Manifest bereinigt, und ein Betreuer sieht alle vier neben dem gerenderten Bild, bevor
etwas veröffentlicht wird. Nichts davon bestimmt einen Dateinamen oder eine Adresse: Der Dienst baut die Adresse aus
dem Namen, behält Kleinbuchstaben, Ziffern und Bindestriche und lehnt alles andere ab.

Dein Browser liest die Felder aus dem Paket (seiner `manifest.json` und sonst nichts). Die Datei selbst
verlässt ihn erst, wenn du Veröffentlichen drückst.

| | Preset | Design |
|---|---|---|
| Paket | Höchstens 4 MB | Höchstens 8 MB |
| Rate | Fünf Einreichungen pro Stunde von einer Adresse, Presets und Designs zusammen | |

## Das Bild schickst nicht du {#the-picture-is-not-yours-to-send}

Du kannst an keine der beiden Galerien einen Screenshot anhängen. Der Dienst rendert das Bild aus deinem Paket.

Bei einem **Preset** zeichnet er das Popup aus dem Paket, im selben abgeschotteten Dokument, das die App nutzt,
einmal in einem Browser ohne Netzwerk und ohne eigenes Scripting, in der Größe, in der die App es zeigt. Er zeichnet
es in jedem Zustand, den ein Preset beherrschen muss: eine gewöhnliche Freischaltung, eine seltene in Bronze, Silber und Gold,
das 100-%-Popup und einen Fortschrittsschritt. Eine Karte zeigt jeweils einen, mit einer Pfeiltaste auf jeder Seite, um
durchzublättern, und das vergrößerte Bild ist das gerade gezeigte. Prüfe beim Gestalten alle sechs: Ein
Preset, das nur in einem davon gut lesbar ist, zeigt das hier.

Ein **Design** besteht aus Farben und Zahlen, daher zeichnet der Server ein festes Muster der AW-Next-Oberfläche mit
deinem Design (Titelleiste, Profilzeile, Bibliothek, Liste der zuletzt freigeschalteten Erfolge, Einstellungsfläche) und fotografiert
es. Es ist das Muster, das die Einstellungen vor einem Import zeigen, in derselben Größe. Es liegt jedes Mal auf denselben vier
Hintergrundverläufen, sodass ein durchsichtiges Design nicht als blasses Design gerendert wird und zwei
Renderings einer Datei übereinstimmen.

Der Mustertext ist eine Konstante im Quellcode der App, daher kann eine Karte keine Bibliothek, kein Konto, keinen Pfad und kein
Spiel von dir tragen oder eine Fassung der Einreichung zeigen, die du nicht gesendet hast.

## Was in einer Datei mitreist {#what-travels-in-a-file}

Eine **`.awpreset`** enthält das Dokument und das Stylesheet des Presets, seine Bilder, Schriften und seinen Ton
und die Designer-Einstellungen dahinter. Nichts über deinen Rechner.

Eine **`.awtheme`** enthält Farben, Verläufe, Anpassungen, Effekteinstellungen und jedes von dir gewählte Hintergrundbild
und sonst nichts: kein Stylesheet, kein Markup, kein Skript. Ein Bild reist als Bytes unter einem Namen, der aus
seiner Ebene gebildet wird, nie als Pfad aus deinem Bilderordner. Die vollständige Liste steht in
[dem `.awtheme`-Format](../awtheme-format.md).

Ein **Design aus einem Benutzer-Stylesheet lässt sich nicht exportieren.** Eine `.css`, die du in
`%APPDATA%\Achievement Watcher Next\themes` abgelegt hast, ist keine `.awtheme`, und Exportieren lehnt sie ab. Teile die
`.css` selbst.

## Hintergründe und andere Assets {#backgrounds-and-other-assets}

Alles in einem Paket wird an jeden weiterverteilt, der es herunterlädt, es muss also dir gehören, damit du es
weitergeben darfst:

- Dein eigenes Artwork oder etwas unter einer Lizenz, die das erlaubt. Ein gefundenes Hintergrundbild ist meist
  keines von beidem, und eine gekaufte Schrift ebenso wenig.
- Nichts mit Logo, Wasserzeichen oder eingebranntem Text. Ein Design ist ein Aussehen, keine Platzierung.
- Nichts, was als Desktop-Hintergrund bei der Arbeit nicht durchginge.

Ein Design nur aus Farben ist willkommen und das am leichtesten anzunehmende.

## Namensnennung und Lizenz {#credit-and-licence}

Der Name auf einer Karte ist das, was das Feld **Namensnennung** am Ende sagt. Es beginnt mit dem Autor, den die App
beim Export festgehalten hat, ist also meist richtig. Ändere es, wenn du unter anderem Namen auftrittst, oder leere es,
und die Karte trägt keinen Namen. Ein Betreuer kann beim Freigeben einen Link zu deinem Profil hinzufügen.

**Alles, was in einer der beiden Galerien gelistet ist, wird unter
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) veröffentlicht.** Mit dem Einreichen stimmst du dem zu, bestätigst,
dass es dein eigenes Werk ist und dass alles darin dir zur Weitergabe gehört.

## Was geprüft wird {#what-is-checked}

Eine Einreichung muss zwei Ebenen bestehen.

**Der eigene Leser der App.** `app/util/presetPackage.js` und `app/util/themePackage.js`, die Module, die
beim Importieren laufen, validieren das Paket: das Manifest, die Formatversion, die Mindestversion der App, jeden
Pfad darin, die Dateitypen, die Größen und den Einstiegspunkt. Der Galerie-Dienst nutzt diese Dateien
unverändert, sodass eine dort hinzugefügte Regel hier beim nächsten Build gilt und nichts gelistet werden kann, was die App
ablehnen würde.

**Die eigenen Grenzen der Galerie**, die ein privater Import nicht braucht:

| | |
|---|---|
| Dateiname | Kleinbuchstaben, Ziffern und Bindestriche, 2 bis 48 Zeichen, vom Dienst aus dem Namen gebildet |
| Paket | 4 MB für ein Preset, 8 MB für ein Design |
| Bild | Vom Dienst gerendert, einmal pro Zustand, und abgelehnt, wenn eines außerhalb der Größe liegt, die ein Eintrag ausliefert (höchstens je 500 KB) |
| Name | Eindeutig in seiner Galerie, da zwei Einträge mit einem Namen beim Import kollidieren |

Nichts in einem Paket wird beim Prüfen ausgeführt, und die Website rendert nie eines: Eine Karte zeigt ein
vom Dienst erzeugtes Bild. Ein Preset läuft nur in der App, im selben abgeschotteten Benachrichtigungsfenster,
das auch ein mitgeliefertes Preset nutzt, und ein Design kann nirgends etwas ausführen.

## Was abgelehnt wird {#what-gets-refused}

- Das Werk eines anderen, es sei denn, er hat zugestimmt und du nennst ihn.
- Assets, die du nicht weiterverteilen darfst.
- Ein Popup, das sich als etwas anderes ausgibt: ein Systemdialog, eine Werbung, eine Adresse zum Besuchen.
- Eine Werbung, ein Logo oder eine Handlungsaufforderung, die in ein Hintergrundbild eingebrannt ist.
- Eine Palette, die Text unlesbar macht.
- Ein Beinahe-Duplikat von etwas bereits Gelistetem.

Eine Ablehnung behält die Prüfsumme und löscht die Bytes, sodass dieselbe Datei beim erneuten Senden erkannt wird,
statt zweimal eingereiht zu werden.

## Eigenes aktualisieren oder entfernen {#updating-or-removing-yours}

Sende die neuere Datei auf dieselbe Weise, mit erhöhter Version im Paket, und sage in der
Beschreibung, dass sie eine frühere Karte ersetzt, damit ein Betreuer jene entfernen kann. Um einen Eintrag
entfernen zu lassen, [eröffne ein Issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) und
nenne, um welche Karte es geht.

## Wenn der Bereich nicht da ist {#when-the-panel-is-not-there}

Kein Galerie-Server antwortet, und die Seite listet eine daneben veröffentlichte Kopie. Alles, was schon in einer
Galerie liegt, lässt sich weiterhin herunterladen. Nur das Einsenden von etwas Neuem muss warten, versuche es also später erneut.

Das Projekt betreibt den Dienst, der den Bereich erscheinen lässt, und er ist nicht Teil dieses Repositorys, daher
gibt es dafür nichts zu installieren.

## Designs aus Steam Achievement Notifier {#themes-from-steam-achievement-notifier}

Sie sind hier nicht gelistet und werden es nicht sein.

SAN-Designs sind `.san`-Dateien, die Leute direkt untereinander weitergeben. Das SAN-Repository hat weder Design-Ordner
noch Wiki-Liste noch Feed, ein Build hat also nichts, worauf er zeigen könnte. Die Dateien gehören denen, die sie gemacht haben, und
sind nicht zur Weiterverteilung lizenziert, und das SAN-Repository trägt überhaupt keine Lizenz. Eines von beiden
hierher zu kopieren, hieße, fremde Werke ohne Erlaubnis erneut zu veröffentlichen.

AW Next liest stattdessen deine. **Einstellungen → Benachrichtigungs-Presets → SAN-Theme importieren** liest eine `.san`-
Datei oder die `usertheme.json` eines bereits entpackten Themes, und **Von SAN auf diesem PC importieren** liest
die eigenen Einstellungen von SAN. In beiden Fällen wird das Theme zu einem AW-Next-Preset, gezeichnet mit der eigenen Engine von SAN
in der Größe von SAN, und lässt sich wie jedes andere als `.awpreset` exportieren. Was herüberkommt, steht in
[Presets](presets.md#import-a-theme-from-steam-achievement-notifier).

Hast du eines importiert, das dir gehört, exportiere es und reiche das ein. Dann ist es dein Preset, mit dir als Urheber genannt.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Weiter:** [Presets und der Preset-Designer](presets.md): was ein Preset ist und wie man eines macht.

<div align="center">

[← Dokumentation](README.md) · [Preset-Galerie](../gallery/) · [Design-Galerie](../gallery/themes/) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
