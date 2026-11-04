---
title: "Presets und der Preset-Designer"
description: "Das Aussehen des Freischaltungs-Popups: die neun mitgelieferten Presets, der Preset-Designer und das Teilen deiner eigenen .awpreset-Datei."
---

# Presets und der Preset-Designer

Ein **Preset** ist das Aussehen des Overlay-Popups im Spiel: sein Layout, seine Farben, seine Bewegung und die Art, wie es
eine seltene Freischaltung oder einen 100-%-Abschluss darstellt. Wähle eines unter **Einstellungen → Benachrichtigung → Vorlage**,
gestalte dein eigenes unter **Einstellungen → Benachrichtigungs-Presets** oder importiere eines, das jemand mit dir geteilt hat.
Die Rasterschaltfläche neben der Preset-Einstellung zeigt jedes Preset als Bild seiner Karte: Klicke auf eines, um es
zu verwenden.

> [!NOTE]
> Presets gestalten das Overlay im Spiel. Steht der **Benachrichtigungstyp** auf *Windows-Benachrichtigung*,
> wird nichts von dem gezeichnet, was ein Preset beschreibt, und der Tab Benachrichtigungs-Presets wird nicht angezeigt.

## Die mitgelieferten Presets {#the-bundled-presets}

AW Next liefert zehn mit, jedes mit eigener Komposition, Schrift, Bewegung und Farbe.

| Preset | Was es ist |
| --- | --- |
| **AW Next** | Der Standard. Die eigene Palette der App, eine Akzentleiste am linken Rand, ein umringtes Symbol und der Name des Spiels über dem Erfolg. |
| **Steam Modern** | Die dunkelblaue Platte mit dem Steam-Zeichen hinter dem Text, eckige Ecken, schiebt sich vom unteren Rand nach oben. |
| **Steam Original** | Eine Kopie des Popups, das der Steam-Client heute zeichnet: Schiefer-Verlauf, ein schwaches, übergroßes Steam-Zeichen, ein eckiges Symbol und nur ein goldener Rand für eine seltene Freischaltung. |
| **Epic Games** | Flach, neutral und mit eckigen Schultern, mit den breitesten Stegen der Reihe und einer einzigen Linie am linken Rand. |
| **PlayStation** | Die Schrift der Konsole und ihr langes Feld von Grau nach Schwarz, mit dem PlayStation-Zeichen, das rechts in einem Ring pulsiert. |
| **Xbox** | Eine dunkle Pille mit einem grünen Bogen, der einmal um das runde Symbol läuft und sich zu einem ruhigen Ring setzt. |
| **Cover** | Das Artwork des Spiels als Hintergrund, langsam driftend, mit einem Schleier unter dem Text und der größten Schrift der Reihe. |
| **Glass** | Durchscheinend und ruhig: keine Akzentleiste und keine Farbe, bis eine seltene oder 100-%-Freischaltung eine mitbringt. |
| **Arcade** | Phosphorgrün auf Schwarz, Festbreitenschrift in Großbuchstaben, mit Scanlines und einer harten versetzten Kante. Eine seltene Freischaltung wechselt zu Bernstein. |
| **Slim** | Das flache, auf echtem Schwarz: gleiche Breite wie die übrigen bei halber Höhe, gebaut, um auf einem OLED-Display zu verschwinden. |

Jedes Preset hat dieselbe Breite, ein Wechsel des Presets verschiebt das Popup also nie seitlich.

### Die vier Zustände, die jedes Preset zeichnet {#the-four-states-every-preset-draws}

| Zustand | Wie er aussieht |
| --- | --- |
| **Normal** | Der eigene Akzent des Presets. |
| **Selten** | Gold bei 5 % oder weniger, Silber bis 10 %, Bronze bis 15 % (die Grenzen lassen sich unter **Einstellungen → Allgemein → Seltenheitsschwellen** ändern), dazu die auf der Karte gedruckte Freischaltungsquote, ein stärkeres Leuchten und ein zusätzlicher Rand. |
| **100 % Abschluss** | Eine kühle, hellere Darstellung mit doppeltem Rand. |
| **Fortschritt** | Ein Fortschrittsbalken mit einer Beschriftung `aktuell/max - %`. |

Das gewählte Preset zeichnet Selten und 100 % selbst, es gibt also eine Preset-Einstellung, nicht drei. Die
Überschreibungen pro Emulator bleiben unter **Einstellungen → Benachrichtigung → Emulatoren** (Modus Erweitert): Xenia,
RPCS3, shadPS4 und Kyty können jeweils ein eigenes Preset und einen eigenen Ton bekommen.

Ein Preset nutzt den im Tab Benachrichtigung gewählten Ton, sofern es keinen eigenen festlegt, eine Änderung des Aussehens
ändert also nicht, was du hörst. Ein geteiltes Preset kann einen eigenen Ton mitbringen: siehe
[Ein Preset teilen](#share-a-preset). **Deckkraft** (30 % bis 100 %) im Tab Benachrichtigung legt fest, wie durchsichtig
das Popup ist.

> [!NOTE]
> Unter früheren Namen gelieferte Presets werden weiterhin aufgelöst: `Shirow`/`Default`/`Midnight`/`xqjan` zu
> **AW Next**, `Steam` zu **Steam Modern**, `PS4`/`PS5 enhanced` zu **PlayStation**,
> `Xbox 360`/`Xbox One` zu **Xbox**, `Game Cover`/`Sunset` zu **Cover**, `Clean`/`Modern`/`Smooth Pop` zu **Glass**,
> `Neon Future`/`LAZ0RBOX` zu **Arcade**, und die Community-Presets `ArmsofGod`, `Epic Preset`
> und `mudoss` zu **Pantheon**, **Onyx** und **Outline**. Die Community-Presets **Hexagon** und **Indiana**
> wurden entfernt, und sie fallen wie `TigerDX Award` auf **AW Next** zurück. Ein eigenes Preset mit einem
> dieser Namen wird vor dem Ersatz verwendet.

## Eigene gestalten {#design-your-own}

Der Designer hat einen eigenen Tab, **Einstellungen → Benachrichtigungs-Presets**, den man auch über die Werkzeug-
Schaltfläche neben der Preset-Einstellung erreicht. Alles wird mit gewöhnlichen Bedienelementen eingestellt: kein CSS, JSON und keine Datei
zu bearbeiten.

<div align="center">
<picture><source srcset="../assets/shot/notification-preset-panel-800.webp 800w, ../assets/shot/notification-preset-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notification-preset-panel.png" width="720" height="530" alt="Der Preset-Designer"></picture><br>
<sub>Beginne mit einem fertigen Design und forme es unter einer Live-Vorschau des echten Popups, die auf dem Bildschirm bleibt, während die Bedienelemente scrollen</sub>
</div>

### Ausgangspunkte {#starting-points}

Die erste Reihe enthält vierzehn fertige Designs: *Classic*, *Aurora*, *Neon*, *Cover*, *Minimal*,
*Console*, *Terminal*, *Slate*, *Paper* (das einzige helle Design), *Ember*, *Frost*, *Poster*, *Pixel*
und *Ribbon*. Jedes ist ein gewöhnlicher Satz von Werten der Bedienelemente, eines zu wählen ist also dasselbe, wie jedes
Bedienelement von Hand zu bewegen: Behalte es oder nutze es als Grundlage.

| Aktion | Was sie tut |
| --- | --- |
| **Überrasch mich** | Baut ein Design, das du noch nicht probiert hast: Es wählt eine Kartenart (flach, Verlauf, Neon, über Artwork, gläsern, Terminal oder hell) und würfelt dann jedes Bedienelement innerhalb dessen, was diese Art erlaubt. |
| **Duplizieren** | Behält das aktuelle Design und gibt den Namen frei, sodass das nächste **Vorlage erstellen** ein Preset hinzufügt, statt das zu ersetzen, von dem es stammt. |

Nichts wird gespeichert, bis du **Vorlage erstellen** drückst.

### Die Vorschau {#the-preview}

Die Vorschau ist die Benachrichtigung selbst, gezeichnet von derselben Seite, denselben Stilen und derselben Engine wie in einem Spiel. Sie
bleibt oben im Fenster angeheftet, während die Bedienelemente scrollen.

| Bedienelement | Was es zeigt |
| --- | --- |
| **Karte** | Das Popup in seiner eigenen Größe. Pixelgröße und Vorschau-Zoom stehen darunter. |
| **Vergleich** | Alle vier Benachrichtigungen auf einmal, je zwei nebeneinander. |
| **Bildschirm** | Das Popup auf einem Attrappen-Display bei **720p**, **1080p**, **1440p** oder **4K**, in seiner wahren relativen Größe und in der Ecke, in der Benachrichtigungen erscheinen sollen. |
| **Normal / Selten / 100 % / Fortschritt** | Die vier Benachrichtigungen, in denen ein Preset gut aussehen muss. Im **Vergleich** wird die gewählte in voller Stärke gezeichnet. |
| **Abspielen** | Spielt Eingang, Halten und Ausgang einmal ab, mit den eigenen Zeiten des Presets. |
| **Hintergrund** | Wogegen das Popup beurteilt wird: Transparenz, eine dunkle Szene, eine helle oder Artwork aus deiner Bibliothek. |
| **Position / Größe** | Spiegeln die gleichnamigen Einstellungen im Tab Benachrichtigung und ändern sie. Nur in der Ansicht **Bildschirm** sichtbar. Ein von Hand platziertes Popup wird unten in der Mitte gezeichnet und beschriftet. |

### Sich zurechtfinden {#finding-your-way-around}

Der Designer hat neun Gruppen und gut sechzig Bedienelemente, mit einem Filter und einem Rückgängig-Verlauf.

| | Was es tut |
| --- | --- |
| **Der Filter** | Tippe in das Feld über den Gruppen, und nur die passenden Bedienelemente bleiben. Er durchsucht Beschriftungen, Wörter aus Auswahllisten und den eigenen Namen der Eigenschaft, sodass `corner` und `radius` denselben Regler finden und ein aus einer `.awpreset` gelesener Name sein Bedienelement findet. Ein Treffer hinter **Erweitert** öffnet es. **Esc** leert das Feld. |
| **Rückgängig / Wiederholen** | Die beiden Pfeile neben dem Filter oder **Strg+Z** und **Strg+Y** (**Strg+Umschalt+Z** geht auch). Ein Reglerzug ist ein Schritt. Ein Preset laden, einen Ausgangspunkt wählen oder Zurücksetzen drücken beginnt einen frischen Verlauf. |

**Layout & Größe** und **Farben & Hintergrund** starten geöffnet; die anderen Gruppen öffnen sich per Klick, und die meisten
haben einen Bereich **Erweitert** für die Feineinstellung.

### Die Bedienelemente {#the-controls}

Im Oberflächenmodus **Einfach** werden die Hälften Erweitert nicht angezeigt.

| Gruppe | Was sie umfasst |
| --- | --- |
| **Layout & Größe** | Symbol links, rechts, über dem Text oder gar nicht; Textausrichtung; Breite, Innenabstand und Abstände des Popups; und ob der **Name des Spiels** über dem Erfolg gedruckt wird. |
| **Text** | Schrift (eine von fünf Familien oder **eine eigene Schriftdatei**: TTF, OTF, WOFF oder WOFF2, höchstens 4 MB, ins Preset kopiert), Größe von Titel und Beschreibung, auf wie viele Zeilen die Beschreibung umbrechen darf, und die Titelfarbe. Unter Erweitert: Titelstärke, Großbuchstaben, Buchstabenabstand, ein Textschatten und eine Kontur um jedes Zeichen. |
| **Farben & Hintergrund** | Eine einfarbige Fläche, ein Zweifarbenverlauf mit Winkel, das **Artwork des Spiels** oder **ein eigenes Bild** (ins Preset kopiert), abgedunkelt, weichgezeichnet und gerahmt hinter dem Text. Dazu Textfarbe, Akzent und Deckkraft. Unter Erweitert eine **Textur** (Raster, Punkte, Schraffur oder Sprenkel) über dem Hintergrund und unter dem Text. |
| **Symbol** | Größe, **Form** (abgerundetes Quadrat, Kreis, Squircle, Sechseck oder Raute) und unter Erweitert ein Rahmen und ein Leuchten in der Akzentfarbe. Die Eckenrundung gilt nur für das abgerundete Quadrat. Ein **Logo** (PNG, JPEG, GIF, WebP oder BMP, höchstens 5 MB) kann hinter dem Text in einer Ecke oder in der Mitte einer Seite sitzen, mit Größe und Abstand zum Rand; es wird wie die Schrift ins Preset kopiert. |
| **Rahmen & Ecken** | Eckenradius, welcher Rand die Akzentleiste trägt (oder eine volle Kontur oder keine) und deren Stärke; unter Erweitert ein Rahmen in eigener Farbe. |
| **Schatten & Leuchten** | Tiefe des Schlagschattens, Akzentleuchten und ob dieses Leuchten **pulsiert** oder **atmet**, solange das Popup auf dem Bildschirm ist. |
| **Animation & Dauer** | Von welchem Rand das Popup hereinkommt und zu welchem es hinausgeht (oder Überblenden oder Zoom) und wie lange es bleibt. Unter Erweitert: Weg, Eingangs- und Ausgangsgeschwindigkeit, die Eingangskurve (weich, linear, Back, sanft, schnappend oder elastisch) und eine **Ausgangskurve**. |
| **Selten & Abschluss** | Farbe und Leuchten für eine seltene Freischaltung und für 100 %, eine **Zustandstönung**, die die ganze Karte überzieht, ob der Fortschrittsbalken erscheint und ob ein **Seltenheits-Badge** die Freischaltungsquote druckt. Unter Erweitert: die Stärke des Fortschrittsbalkens, die Silber- und Bronzestufen und ein **Vorhängeschloss** vor dem Titel eines versteckten Erfolgs. |
| **Ton** | Ein Ton, den dieses Preset statt des Tons aus dem Tab Benachrichtigung abspielt. Lass es auf **App-Einstellung**, um keinen zu haben. |

| Aktion | Was sie tut |
| --- | --- |
| **Auf dem Bildschirm zeigen** | Rendert das Design als echtes Overlay-Popup in voller Größe, an der eingestellten Position und im Zustand, den die Vorschau zeigt, ohne es zu speichern. |
| **Vorlage erstellen** | Speichert es und wählt es als aktives Preset aus. |
| **Vorlage aktualisieren** | Dieselbe Schaltfläche, sobald der Name zu einem vom Designer erstellten Preset passt: Sie ersetzt dieses Preset, statt ein weiteres hinzuzufügen. |
| **Vorlage bearbeiten** | Lädt eines deiner erzeugten Presets zurück in die Bedienelemente, mit jedem Wert wie gespeichert. |
| **Zurücksetzen** | Stellt die Bedienelemente auf das Standarddesign zurück. Auf dem Datenträger ändert sich nichts. |
| **Umbenennen** | Erscheint, sobald ein erzeugtes Preset geladen ist. Tippe den neuen Namen ins Namensfeld und drücke es: Das Preset wird auf dem Datenträger umbenannt, und die Benachrichtigungseinstellungen, die darauf zeigten, ziehen mit. |
| **Löschen** | Erscheint, sobald ein erzeugtes Preset geladen ist, und entfernt es nach einer Bestätigung. |
| **Exportieren** / **Importieren** | Verschieben ein Preset zwischen Rechnern: siehe [Ein Preset teilen](#share-a-preset). |

Nur Presets, die dieser Designer erzeugt hat, lassen sich erneut öffnen oder löschen: Er speichert seine Einstellungen in einer
`aw-preset.json` neben den erzeugten Dateien, und diese Datei macht ein Preset bearbeitbar. Mitgelieferte und
handgeschriebene Presets werden nie angefasst.

> [!NOTE]
> Ein bereits erstelltes Preset behält seine Dateien wie erzeugt. Es im Designer zu öffnen und zu speichern
> wendet die heutigen Standardwerte darauf an, darunter dass eine seltene Freischaltung und ein 100-%-Abschluss das ganze
> Popup neu einfärben.

> [!NOTE]
> Von dir erstellte Presets werden in `%APPDATA%\Achievement Watcher Next\presets\Users Presets` gespeichert, nicht im
> Installationsordner, und überstehen App-Updates.

### Der Layout-Editor {#the-layout-editor}

**Editor** unter der Vorschau öffnet das Design im Vollbild: die Karte in der Mitte, ihre Ebenen links,
die Einstellungen des Ausgewählten rechts. Ziehe etwas auf der Karte, um es zu verschieben, ziehe an einer
Ecke, um die Größe zu ändern, drehe es am runden Griff. Beim ersten Öffnen zeigt eine kurze Tour,
wo was ist; **?** listet jedes Tastenkürzel auf und kann die Tour wiederholen.

| | Was es tut |
| --- | --- |
| **Hinzufügen** | Ein Text, ein Bild, ein Rechteck, eine Ellipse, eine Linie oder ein **Symbol** (Pokal, Medaille, Krone, Stern und acht weitere). Jedes ist eine eigene Ebene. |
| **Animierte Bilder** | Ein GIF oder ein animiertes WebP (höchstens 5 MB) läuft auf der Karte. **GIF bei jedem Einblenden neu abspielen** startet es bei jedem Erscheinen des Popups am ersten Bild. |
| **Wörter des Popups** | Ein Text kann `{game}`, `{title}`, `{detail}`, `{rarity}` und `{tier}` enthalten: Die Schaltflächen unter dem Textfeld fügen sie ein, und das Popup setzt an ihrer Stelle den Namen des Spiels, den Erfolg, seine Beschreibung, seine Freischaltungsquote oder den Namen seiner Stufe ein. |
| **Füllung** | Eine Form oder ein Symbol wird mit einer Farbe, einem Verlauf, einem kreisförmigen Verlauf, der Farbe der Stufe des Popups (es wird mit der Karte bronzen, silbern oder golden) oder der Farbe einer Stufe unabhängig vom Popup gemalt. |
| **Formen** | Ein Stern hat eine Zackenzahl und eine Tiefe, ein Pfeil eine Spitze und einen Schaft, ein Dreieck eine obere Spitze, die an seiner Basis entlanggleitet. Jede Form außer der Ellipse kann abgerundete Ecken haben, eine Kontur oder Linie kann gestrichelt oder gepunktet sein, und eine Form, ein Symbol oder ein Bild kann gespiegelt werden. Ein Bild lässt sich in jede dieser Formen zuschneiden. |
| **Durchsichtig** | Eine Form außer einer Linie lässt sich durchsichtig schalten. Sie malt selbst nichts: Alles, was darunter gestapelt ist, die Karte, ihr Symbol und Text und die Elemente darunter, wird dort weggeschnitten, wo sie liegt, sodass der Desktop durch das Loch scheint. Elemente darüber bleiben. Eine durchsichtige Form steht still, und der Schalter wird bei einem mitgelieferten Preset nicht angeboten. |
| **Schatten und Leuchten** | Ein Text, eine Form oder ein Symbol wirft einen Schatten oder leuchtet, in Schwarz, in der Farbe der Stufe des Popups oder in einer eigenen Farbe. |
| **Ein Zustand nach dem anderen** | Der Editor arbeitet am Zustand, den die Vorschau zeigt (normal, Bronze, Silber, Gold, 100 % oder Fortschritt). **Bearbeiten: Alle** ändert das Element für jeden Zustand; **Bearbeiten: Nur Gold** (oder welcher Zustand gerade gezeigt wird) ändert es nur für diesen Zustand, alles von der Farbe bis zur Position, und ein dann hinzugefügtes Element erscheint nur in diesem Zustand. **Sichtbar** blendet das Element auf dieselbe Weise aus oder ein, sodass eine Krone, die nur eine Gold-Freischaltung zeigt, ein Symbol ist, das überall außer bei Gold abgeschaltet ist. Ein Zustand mit eigenen Einstellungen für das ausgewählte Element sagt das, und **Zurück zur Basis** lässt es wieder den anderen folgen. Die Teile der Karte (Titel, Symbol, Beschreibung) funktionieren genauso. |
| **Eingang und Schleife** | Wie ein Element hereinkommt, sobald die Karte steht (Überblenden, Aufsteigen, Fallen, von einer Seite, Zoom, Aufpoppen, Wackeln oder Aufblitzen; ein Text kann sich auch selbst schreiben, und ein Seltenheits- oder Fortschrittstext hochzählen) und nach welcher Verzögerung, dann ob es sich weiterbewegt, solange das Popup gezeigt wird: ein Pulsieren, Schweben, Schwingen, Drehen oder Glänzen. Der Editor steht still, während du arbeitest; **Abspielen** zeigt die Bewegung. |
| **Zeitleiste** | Eine Leiste am unteren Rand des Editors zeigt, wann jedes Element hereinkommt und wie lange. Ziehe eine Leiste, um ihren Eingang zu verschieben oder zu dehnen, drücke **Abspielen**, um die Karte anzusehen, oder ziehe am Lineal, um an einem Moment anzuhalten. Sie bleibt eingeklappt, bis sich eine Animationseinstellung ändert. |
| **Textfelder** | Titel, Beschreibung und Spielzeile lassen sich umformulieren und bekommen ein eigenes Feld: eine Füllung, Innenabstand, abgerundete Ecken und eine Kontur. Der Fortschrittsbalken hat eine Stärke und eine Spurfarbe, und Symbole können eckig sein. |
| **Position und Größe** | Eingegebene Werte für X, Y, Breite und Höhe und sechs Schaltflächen, die das Element an den Rändern oder der Mitte der Karte ausrichten. |
| **Ebenen** | Das Auge blendet ein Element aus. Das Vorhängeschloss hält es an Ort und Stelle: Es lässt sich nicht verschieben, in der Größe ändern oder löschen, bis es entsperrt ist, und ein Klick geht hindurch. Pfeile ändern die Stapelreihenfolge. |
| **Mehrere gleichzeitig** | **Umschalt** oder **Strg** + Klick fügt ein Element der Auswahl hinzu oder nimmt es heraus, ein Ziehen von einer leeren Stelle wählt alles, was der Rahmen berührt, und **Strg+A** wählt alles. Die Gruppe bewegt sich als Ganzes, richtet sich an der Karte oder an sich selbst aus und wird in einem Zug dupliziert, kopiert oder gelöscht. |
| **Kopieren und Einfügen** | **Strg+C** und **Strg+V** kopieren die Auswahl, auch in ein anderes Preset. Die Farbwähler bieten die Farben an, die das Design schon nutzt. |

Preset-Dateien, die vor dieser Version gemacht wurden, funktionieren weiter, und ein Preset, das nichts davon nutzt, sieht aus und
exportiert wie zuvor.

## Ein mitgeliefertes Preset anpassen {#customize-a-bundled-preset}

**Ein mitgeliefertes Preset anpassen** oben im Designer geht von einem Preset aus, das mit der
App kommt. Von diesem Preset wird nichts kopiert oder bearbeitet: Die Ebene, die du speicherst, besteht aus ein paar Zeilen, die es benennen, dazu
den Werten, die du geändert hast, gelegt über das mitgelieferte Preset, wie es ausgeliefert wird. Verbessert eine spätere Version das
mitgelieferte Preset, verbessert sich deine Ebene mit.

Hake die Abschnitte an, die du ändern willst: **Hintergrund** (eine Farbe oder ein Verlauf), **Textfarbe**, **Akzent**,
**Rahmen**, **Leuchten**, **Schrift** (eine der fünf Familien oder eine eigene Schriftdatei) und **Logo**.
Die Bedienelemente beginnen mit den eigenen Farben des mitgelieferten Presets. Die Vorschau und **Auf dem Bildschirm zeigen** zeigen das
mitgelieferte Preset mit deiner Ebene darüber.

<div align="center">
<picture><source srcset="../assets/shot/preset-customize-panel-800.webp 800w, ../assets/shot/preset-customize-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/preset-customize-panel.png" width="720" height="530" alt="Das Preset AW Next mit einer Schriftdatei und einem Logo angepasst, in Live-Vorschau" loading="lazy" decoding="async"></picture><br>
<sub>AW Next mit einer eigenen Schriftdatei und einem Logo in der oberen rechten Ecke: Nur angehakte Abschnitte ändern sich</sub>
</div>

- Es funktioniert mit den Presets der Liste **Standard-Presets**, die alle dieselbe Karte zeichnen. Community-
  Presets (Batman, Onyx, Outline und die anderen) zeichnen ihre eigenen Layouts und werden nicht angeboten.
- Eine Ebene lässt sich nicht als `.awpreset` exportieren, da sie nur auf dem mitgelieferten Preset der
  Installation existiert, die sie erstellt hat. Um ein Design zu teilen, baue es mit dem Designer.
- Die **OBS-Browserquelle** ignoriert Ebenen und zeigt stattdessen das Standard-Preset.
- Das Popup behält die Fenstergröße des mitgelieferten Presets, sodass ein großes Leuchten oder ein großer Rahmen abgeschnitten werden kann.

## Ein Theme aus Steam Achievement Notifier importieren {#import-a-theme-from-steam-achievement-notifier}

Themes aus **Steam Achievement Notifier** (SAN) kommen vollständig herüber. AW Next zeichnet ein importiertes Theme
mit den eigenen Kartenlayouts von SAN, es sieht also aus und bewegt sich wie in SAN: alle elf Layouts, in der Textgröße von SAN
und mit der eigenen Größeneinstellung des Themes. Zwei Schaltflächen im Tab **Benachrichtigungs-Presets**
importieren Themes:

- **SAN-Theme importieren** liest eine `.san`-Datei oder die `usertheme.json` in einem Theme, das SAN bereits
  entpackt hat, mit den Bildern und Tönen daneben.
- **Von SAN auf diesem PC importieren** liest die eigenen Einstellungen von SAN, wenn SAN hier installiert ist, und importiert
  alle auf diesem PC gespeicherten Themes in einem Zug. Die vier verwendeten Themes (normal, halbselten, selten und 100 %)
  werden zu einem Preset, `SAN - <theme name>`, das zwischen ihnen wechselt wie SAN, und jedes andere
  gespeicherte Theme wird ein eigenes Preset. Ein erneuter Lauf aktualisiert diese Presets, statt
  Kopien hinzuzufügen, und fasst nie eines deiner eigenen Presets mit demselben Namen an.

Installierte SAN-Presets werden von selbst neu aufgebaut.

### Was herüberkommt {#what-comes-across}

Alles, was das Theme enthält: jede Einstellung, seine Bilder (Hintergrund, Maske, Logos und Dekorationen,
Symbolrahmen, Prozent-Abzeichen, Symbol für versteckte Erfolge), seine Schrift und seine Töne (einer pro Zustand oder
ein Ordner, aus dem SAN zufällig wählt). Das Preset trägt alles davon, SAN wird danach also nicht gebraucht,
und es lässt sich als `.awpreset` exportieren.

Sein Aussehen ist das von SAN, nicht das der Regler des Designers: **Vorlage bearbeiten** zeigt es als Bild, mit einem Bereich
für zwei Auswahlen darunter.

- **Pokalbild**, für ein Theme, das einen Bronze-, einen Silber- und einen Goldpokal zeichnet: *Folgt der
  Stufe* zeigt den, der zur Freischaltung passt, oder wähle eine Farbe, um sie immer zu zeigen.
- **Theme pro Stufe** zeichnet eine Stufe mit einem anderen importierten SAN-Theme, samt Ton, sodass eine Gold-
  Freischaltung völlig anders aussehen kann als eine Bronze-Freischaltung.

Alles andere wird in SAN geändert und erneut importiert.

Der Zustand, den eine Benachrichtigung bekommt, folgt deinen Seltenheitseinstellungen in AW Next. Ein 100-%-Abschluss nutzt die 100-%-
Karte von SAN. Im Seltenheitsmodus nutzen Gold und Silber seine Karte für Selten und Bronze seine halbseltene; im Trophäen-
modus nutzen Gold, Silber und Bronze die Karten für selten, halbselten und normal. Ein in AW
Next gewählter Ton für Selten oder 100 % hat Vorrang vor dem des Themes, und Position und Größe des Popups kommen aus dem Tab **Benachrichtigung**.

Der Bericht nach einem Import listet auf, was nicht mitkommen konnte: eine Datei, die das Theme nennt, aber nicht mitbrachte,
ein abgelehntes Bild oder eine abgelehnte Schrift und Einstellungen eines neueren SAN, die diese Version noch nicht zeichnet. Er wird
auch ins App-Protokoll geschrieben.

### Was geprüft wird, bevor etwas installiert wird {#what-is-checked-before-anything-is-installed}

Es gelten die Regeln einer `.awpreset`, da eine Theme-Datei vom Rechner eines anderen stammt. Nichts
darin wird ausgeführt oder ausgewertet; nur seine `usertheme.json` wird gelesen. Jeder Pfad wird gegen das
Paket geprüft, aus dem er kam, und die absoluten Pfade, die SAN schreibt, werden nur als Dateinamen gelesen. Nur Bilder,
Schriften und Audio werden herausgenommen, nach Dateityp und unter einer Größengrenze; eine SVG, die ein Skript ausführen könnte,
und eine Datei, die keine Schrift ist, werden abgelehnt. Jede Einstellung wird auf Typ und Bereich geprüft. Ein Import,
der scheitert, lässt alle Presets, die du schon hast, unberührt.

## Ein Preset teilen {#share-a-preset}

**Exportieren** und **Importieren** im Tab **Benachrichtigungs-Presets** verschieben ein Preset zwischen Rechnern als eine einzige
`.awpreset`-Datei: den Stil, jedes verwendete Bild und jede Schrift, seine Designer-Einstellungen und seine Metadaten.

Die [Preset-Galerie](../gallery/) sammelt diese Dateien: stöbern, eine herunterladen und importieren oder deine
hinzufügen. Was eine Einreichung sein muss und was geprüft wird, bevor sie gelistet wird, steht in
[Die Community-Galerien](community-galleries.md).

**Exportieren** schreibt, was die Karte gerade zeigt, unter dem Namen im Feld **Name**: das Design in den
Bedienelementen, gespeichert oder nicht, sodass ein Preset in Arbeit geteilt werden kann, ohne es zuvor zu erstellen. Ein importiertes
Preset, das in **Vorlage bearbeiten** ausgewählt ist, wird unverändert vom Datenträger exportiert, da sein Aussehen in Dateien liegt,
die die Bedienelemente nicht beschreiben können. Nur das Preset reist: kein Pfad von deinem Rechner, kein Kontoname, keine
Einstellung von dir.

**Importieren** fragt nach der Datei, prüft sie und installiert sie unter `presets\Users Presets`. Ist der Name
vergeben, durch eines deiner Presets oder ein mitgeliefertes, wählst du **Beide behalten** (der Import landet unter
`Name (2)`) oder **Ersetzen**. Nichts wird geschrieben, bevor du antwortest.

Ein importiertes Preset erscheint in **Vorlage bearbeiten**, wird ausgewählt und kann von dort erneut exportiert oder gelöscht werden.
Ein vom Designer erstelltes Preset kommt vollständig zur weiteren Bearbeitung zurück. Ein handgeschriebenes Preset
bezieht sein Aussehen aus Dateien, die die Bedienelemente nicht nachbilden können, daher bleiben die Bedienelemente unverändert und das Namens-
feld bleibt leer.

### Was geprüft wird, bevor etwas installiert wird {#what-is-checked-before-anything-is-installed-1}

Ein Paket wird als Ganzes geprüft und vollständig abgelehnt, nie teilweise installiert, wenn:

- es kein Preset-Paket ist oder sein Manifest fehlt oder fehlerhaft ist;
- es ein neueres AW Next als das laufende oder ein neueres Paketformat braucht;
- es eine Datei enthält, die das Format nicht beschreibt: ein Programm, ein Skript oder irgendetwas außerhalb von
  `preset/` und `sounds/`;
- ein Pfad darin außerhalb seines eigenen Ordners zeigt.

Nichts in einem Paket wird beim Prüfen oder Installieren ausgeführt oder ausgewertet. Die Seite des Presets
wird später gerendert, im selben abgeschotteten Benachrichtigungsfenster wie ein mitgeliefertes Preset.

### Was ein Paket enthält {#what-a-package-contains}

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

Das Manifest wird neben dem installierten Preset als `aw-package.json` aufbewahrt. Es sagt der App, dass das Preset
importiert wurde und wieder entfernt werden darf, und trägt die Beschreibung und die Urheberangabe in den nächsten Export.

Ein Ton, den du selbst importiert hast, reist mit dem Preset; ein mitgelieferter nicht, da das Manifest
ihn nennt und jede Installation ihn hat. Der Import ändert nie den Ton, den du gewählt hast, und überschreibt nie
einen vorhandenen: Eine andere Datei desselben Namens kommt als `name (2)` an.

Das optionale Feld `author` wird nur aus der eigenen Datei des Presets gefüllt, sodass dir nichts zugeschrieben wird,
es sei denn, du trägst es dort ein.

---

**Weiter:** [Overlay](overlay.md) - die Erfolgsliste im Spiel, die von diesen
Popups getrennt ist.

<div align="center">

[← Dokumentation](README.md) · [Benachrichtigungen](notifications.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
