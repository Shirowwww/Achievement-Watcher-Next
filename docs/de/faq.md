---
title: "FAQ zum Erfolgs-Tracker"
description: "Kurze Antworten zu Konten, Quellen, Benachrichtigungen, Sicherheit, Sicherungen und unterstützten Plattformen von Achievement Watcher Next."
---

# FAQ zum Erfolgs-Tracker

Kurze Antworten auf die üblichen Fragen. Jede verweist auf die Anleitung, die das Thema behandelt.

## Einrichtung {#getting-set-up}

### Brauche ich einen Steam-Web-API-Schlüssel oder eine Anmeldung bei Steam? {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
Nein. Erfolgslisten kommen aus einer Kette öffentlicher Endpunkte, die keinen Schlüssel braucht, und nichts verlangt ein
Konto. Deine eigenen Steam-Freischaltungen werden aus den Statistiken gelesen, die Steam auf diesem PC führt, ein privates Profil
funktioniert also für jedes hier gespielte Spiel. Steam zu verbinden ist optional: Es ergänzt Spiele, die nur auf deinen
anderen PCs gespielt wurden, und die Steam-Familienfreigabe. Siehe [Verbundene Konten](sources.md#connected-accounts).

### Auf welchen Plattformen läuft es? {#which-platforms-does-it-run-on}
Windows 10 und 11 sowie Linux (x64). Die Releases bringen ihre eigene Laufzeitumgebung mit. Node.js wird nur zum
Bauen aus dem Quellcode gebraucht.

### Läuft es unter Linux oder auf dem Steam Deck? {#does-it-run-on-linux-or-the-steam-deck}
Unter Linux ja, als Beta: ein natives AppImage (nie über Wine ausgeführt) für GNOME und KDE Plasma, unter
Wayland oder X11. Es findet Spiele, die über Steam und Proton, Wine, Lutris, Heroic oder Bottles laufen, und aktualisiert
sich selbst aus denselben Releases wie die Windows-App. Auf dem Steam Deck ist die Unterstützung neu und wurde nicht auf einem echten
Deck geprüft. Siehe [Linux und das Steam Deck](linux.md).

### Unterstützt es RetroAchievements? {#does-it-support-retroachievements}
Ja. Schalte die Quelle **RetroAchievements** ein, verbinde dein Konto mit Benutzernamen und Web-API-
Schlüssel, und **Bibliothek importieren** holt jedes Spiel, das du gespielt hast. Neue Freischaltungen werden gemeldet, solange ein
RetroAchievements-fähiger Emulator läuft. Siehe [RetroAchievements](sources.md#retroachievements).

### Zeigt es PlayStation-Trophäen? {#does-it-show-playstation-trophies}
Ja. Verbinde dein PlayStation-Konto unter **Einstellungen → Quellen** (du meldest dich auf der Seite von Sony an), und deine
Spiele und Trophäen werden importiert, mit Sonys Quote für jede Trophäe. Ein Spiel aus einer anderen Quelle, das
auch für PlayStation erschienen ist, zeigt das echte Platin seiner Liste. Siehe
[Verbundene Konten](sources.md#connected-accounts).

### Muss ich ein Konto verbinden? {#do-i-have-to-connect-an-account}
Nein. Steam, Epic, Xbox PC und PlayStation lassen sich jeweils verbinden, um zu lesen, was lokale Dateien nicht enthalten,
und RetroAchievements fragt nach deinem Benutzernamen und Web-API-Schlüssel. Jedes Token und jeder Schlüssel wird verschlüsselt, bevor
er auf diesem PC gespeichert wird. Alles andere funktioniert ohne Konto.

### Funktioniert es offline? {#does-it-work-offline}
Ja, für lokale Quellen und alles, was bereits zwischengespeichert ist. Erfolgsnamen, Beschreibungen und Artwork werden
einmal abgerufen und dann aus `%APPDATA%\Achievement Watcher Next\steam_cache` wiederverwendet
(`~/.config/Achievement Watcher Next/steam_cache` unter Linux).

### Verliere ich etwas, wenn ich den Modus Einfach wähle? {#do-i-lose-anything-by-choosing-simple-mode}
Nein. Einfach blendet Bedienelemente aus und schaltet nie eine Funktion ab. Nichts, was scannt, überwacht oder gespeichert wird,
ändert sich, und das Zurückwechseln stellt jedes Bedienelement mit seinem Wert wieder her. Siehe
[Erste Schritte](getting-started.md#simple-and-advanced).

### Kann es Spiele zeigen, die ich besitze, aber nie installiert habe, oder Freischaltungen von einem anderen PC? {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
Ja. Steht die Quelle Steam auf **Im Besitz**, listen zwei Schalter in der Steam-Kontokarte, **Die Spiele hinzufügen, die dir
gehören** und **Die Spiele hinzufügen, die über Steam Family mit dir geteilt werden**, deine ganze Bibliothek auf. Beide
sind standardmäßig aus, weil eine große Bibliothek den ersten Scan deutlich verlängert. Ist ein Steam-Konto
verbunden, wird ein Spiel, das lokal nichts zu lesen hat, aus deinem Steam-Profil gelesen (dessen Spieldetails
öffentlich sein müssen), und die Antwort wird sechs Stunden zwischengespeichert. Siehe
[Verbundene Konten](sources.md#connected-accounts).

## Die Bibliothek {#the-library}

### Ein Spiel fehlt {#a-game-is-missing}
Prüfe, ob seine Quelle unter **Einstellungen → Quellen** aktiviert ist, starte **Intelligente Suche** unter **Einstellungen →
Ordner** und schalte **Nur installierte Spiele anzeigen** aus, um zu sehen, ob das Spiel bekannt, aber nicht mehr
installiert ist. Die vollständige Checkliste steht unter [Fehlerbehebung](troubleshooting.md#a-game-is-missing).

### Ein Spiel zeigt »Keine Erfolge« {#a-game-shows-no-achievements}
Dieses Spiel hat keinen Erfolgssatz. Es bleibt startbar und erfasst weiter die Spielzeit, und es bleibt aus
den Abschlussstatistiken heraus, statt als 0 % zu zählen. Seine Kachel zeigt Artwork, wo der Fortschrittsbalken wäre.
**Einstellungen → Darstellung → Bibliothekskacheln → Balken bei Spielen ohne Erfolge** bringt den
Balken zurück.

### Ein Spiel zeigt 0 %, obwohl ich Erfolge freigeschaltet habe {#a-game-shows-0-although-i-have-unlocked-achievements}
Das Spiel hat ein Schema, aber zur Laufzeit keine Freischaltungsdatei. Öffne sein [Game Health](game-health.md)-Fenster: Es
nennt das fehlende Teil und bietet nur die Reparaturen an, die zutreffen.

### Warum erscheint dasselbe Spiel zweimal? {#why-does-the-same-game-appear-twice}
Es wurde über zwei Quellen gefunden. **Duplikate zusammenführen** unter Einstellungen → Allgemein fasst sie zusammen. Ist ein
Eintrag ein veralteter Spielstandordner für ein Spiel, das du jetzt anderswo besitzt, setze ihn auf die schwarze Liste.

### Ein Spiel-Update hat Erfolge hinzugefügt, und ich sehe sie nicht {#a-game-update-added-achievements-and-i-do-not-see-them}
Eine zwischengespeicherte Liste prüft sich alle 3 Tage selbst erneut. Um neue sofort zu übernehmen, nutze **Einstellungen → Erweitert →
Erfolgslisten erneut prüfen**, was auch bei ausgeschalteten **Automatischen Aktualisierungen der Erfolgsdaten** funktioniert. Keine der
beiden Prüfungen entfernt etwas bereits Zwischengespeichertes.

### Ein Spiel wurde der falschen Steam-Fassung zugeordnet {#a-game-was-matched-to-the-wrong-steam-release}
Klicke es mit der rechten Maustaste an und wähle **AppID manuell festlegen...**. Die AppID wird in `steam_appid.txt` geschrieben und
für diesen Installationsordner gemerkt. Siehe [Die AppID eines Spiels von Hand festlegen](advanced.md#set-a-games-appid-by-hand).

## Benachrichtigungen {#notifications}

### Nichts erscheint, wenn ich etwas freischalte {#nothing-appears-when-i-unlock-something}
Beginne mit der Zeile Benachrichtigungen im [Game Health](game-health.md)-Fenster dieses Spiels, die den
Weg nennt, der zuletzt zugestellt hat, und warum. Folge dann
[Wenn ein Test oder eine Freischaltung nicht erscheint](notifications.md#if-a-test-or-unlock-does-not-appear).

### Das Overlay-Popup erscheint in einem bestimmten Spiel nicht {#the-overlay-popup-does-not-show-in-one-particular-game}
Dieses Spiel läuft wahrscheinlich im exklusiven Vollbild, wo ein Popup, das immer im Vordergrund ist, nicht gezeichnet werden kann. Bei
**Automatisch** sendet AW Next diese Freischaltung als Windows-Benachrichtigung, die über dem Spiel erscheint. Ein Spiel im
klassischen exklusiven Modus lässt nichts durch: Stelle es auf randloses Fenster um. Siehe
[wie Automatisch entscheidet](notifications.md#how-automatic-decides).

### Benachrichtigungen sind verborgen, während ich spiele {#notifications-are-hidden-while-i-play}
Das ist »Nicht stören« von Windows. Aktiviere **Prioritätsbenachrichtigungen** und bestätige die einmalige Anfrage von Windows.
Siehe [Windows-Prioritätsbenachrichtigungen](notifications.md#priority-windows-notifications).

### Kann ich das Aussehen des Popups ändern oder ein Design teilen? {#can-i-change-how-the-popup-looks-or-share-a-design}
Ja. Zehn Presets werden mit der App geliefert, der **Preset-Designer** baut deine eigenen mit gewöhnlichen Bedienelementen,
und jedes Preset lässt sich in eine `.awpreset`-Datei exportieren. Siehe [Presets und der Preset-Designer](presets.md).

### Kann ich Freischaltungen in meinen Stream einblenden? {#can-i-put-unlocks-on-my-stream}
Ja, mit einer Browser-Quelle in OBS. Das Popup als Fenster aufzunehmen kann nicht funktionieren, da es nur für
eine Freischaltung existiert und verschwunden ist, bevor OBS es auflistet; deshalb liefert AW Next dasselbe Popup als Seite. Die Adresse steht
unter Einstellungen → Benachrichtigung → **OBS-Browserquelle**. Siehe
[Freischaltungen im Stream zeigen (OBS)](notifications.md#show-unlocks-on-stream-obs).

### Ist das Overlay dasselbe wie das Popup? {#is-the-overlay-the-same-thing-as-the-popup}
Nein. Das Popup ist eine einmalige Benachrichtigung, gestaltet von einem Preset. Das **Overlay** ist die vollständige Erfolgs-
liste, die du mit `Strg+Umschalt+K` öffnest, während ein Spiel läuft. Siehe die [Overlay-Anleitung](overlay.md).

### Unter Linux tut Strg+Umschalt+K in meinem Spiel nichts {#on-linux-ctrlshiftk-does-nothing-in-my-game}
Unter Wayland sieht AW Next keine Tasten, die gedrückt werden, während ein natives Wayland-Fenster den Fokus hat, etwa ein
Linux-Spiel im Wayland-Modus oder Proton mit seinem Wayland-Treiber. Binde in den Tastatureinstellungen deines Desktops eine Taste
an `/home/you/.local/bin/achievement-watcher --toggle-overlay`, wobei du `you` durch deinen
Benutzernamen ersetzt. AW Next hält diesen Befehl auf das aktuelle AppImage gerichtet, das Tastenkürzel übersteht also
Updates. Siehe [Overlay-Tastenkürzel](linux.md#overlay-shortcut).

## Sicherheit und Daten {#safety-and-data}

### Verändert AW Next meine Spiele oder sendet es etwas von meinem PC weg? {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
Nur auf deinen Wunsch. Das Lesen von Erfolgen ist schreibgeschützt. Die Emulator-Reparaturwerkzeuge (das Untermenü
**Emulator & Tools** im Rechtsklickmenü eines Spiels und **Einstellungen → Emulatoren**) schreiben in einen Spielordner, immer
nach einer Bestätigung und mit einer Sicherung. Nutze sie nur mit Spielen, die du besitzt. Über schreibgeschützte Abfragen
und das, was ein verbundenes Konto zurückliefert, hinaus verlässt nichts diesen PC. Siehe
[Was diesen PC verlässt](README.md#what-leaves-this-pc).

### Mein Virenscanner hat eine Datei markiert oder entfernt {#my-antivirus-flagged-or-removed-a-file}
Es ist fast sicher der Steam-Emulator oder ein Ubisoft-Loader, und ein Fehlalarm: Diese Dateien ersetzen
die Steam- oder Ubisoft-Bibliothek eines Spiels, und genau dieses Verhalten suchen Erkennungs-Engines. Nichts wird
geschrieben, es sei denn, du hast eine Reparatur ausgeführt, **Einstellungen → Emulatoren** geöffnet oder die automatische Reparatur eingeschaltet. Lasse
die Datei zu, die dein Virenscanner genannt hat, oder schließe `%APPDATA%\Achievement Watcher Next\cache` aus. Schalte den
Schutz nie ab. Siehe [Fehlerbehebung → Virenscanner](troubleshooting.md#antivirus-or-smartscreen-warning).

### Windows SmartScreen warnt vor dem Installer {#windows-smartscreen-warns-about-the-installer}
Releases sind mit dem eigenen Zertifikat des Projekts signiert, festgelegt über den Fingerabdruck, statt mit einem kommerziellen,
daher kann SmartScreen um Bestätigung bitten. Du musst dieses Zertifikat nie installieren: Der Updater in der App
prüft den Unterzeichner, den festgelegten Fingerabdruck und dass die Datei nach der Signierung nicht verändert wurde,
bevor er etwas installiert. Lade nur von der
[offiziellen Releases-Seite](https://github.com/Shirowwww/Achievement-Watcher-Next/releases) herunter. Um einen
Installer selbst zu prüfen, führe `Get-FileHash <installer> -Algorithm SHA256` aus und öffne
`https://www.virustotal.com/gui/file/<hash>`. Das aktuelle Release ist
[3.12.5](https://www.virustotal.com/gui/file/364b7ecdc1d039e74066ec924453ba665ff33b36dded965703c3373fa53b58ea).
Siehe [Fehlerbehebung → Ein Release selbst prüfen](troubleshooting.md#checking-a-release-yourself).

### Warum erscheint unter Linux eine Schlüsselbund-Abfrage? {#on-linux-why-does-a-keyring-prompt-appear}
AW Next verschlüsselt seine Anmelde-Token mit einem Schlüssel, den der Schlüsselbund deines Desktops hält (GNOME Keyring oder KDE
Wallet). Bei automatischer Anmeldung bleibt der Schlüsselbund gesperrt, daher bittet der Desktop dich beim Start von AW Next, ihn zu entsperren oder
einen anzulegen. Abbrechen ist unbedenklich: Die App funktioniert weiter, und die Abfrage kommt beim nächsten Start wieder.
Siehe [Schlüsselbund-Abfrage](linux.md#keyring-prompt).

### Wo liegen meine Daten, gehen sie bei einem Update verloren, und wie groß sind Updates? {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
Alles liegt in `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next` unter Linux),
und eine neuere Version darüber zu installieren behält es. Beim ersten Start nach dem Upgrade wird ein älterer Achievement-
Watcher-Ordner importiert, ohne ihn zu verändern oder zu löschen. Updates laden nur herunter, was sich seit deiner
installierten Version geändert hat, und weichen bei einem Fehler von selbst auf einen vollständigen Download aus. Siehe
[Updates und vorhandene Daten](getting-started.md#updates-and-existing-data).

### Wie ziehe ich auf einen neuen PC um oder sichere meine Einrichtung? {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**Einstellungen → Erweitert → Profilsicherung → Profil exportieren…** schreibt deine Einstellungen, Bibliotheksentscheidungen,
Presets, Designs, Cover und Spielzeit in eine `.awbackup`-Datei. Installiere AW Next auf dem neuen PC, wähle
**Profil wiederherstellen…**, und es wird beim nächsten Start angewendet; die Dateien, die es ersetzt, bleiben erhalten. Anmeldungen
werden nie gespeichert, verbinde also Steam, Epic, Xbox, PlayStation und RetroAchievements erneut. Siehe
[Profilsicherung](advanced.md#profile-backup).

### Gibt es eine portable Version? {#is-there-a-portable-version}
Ja. Das portable ZIP hält die App und ihre Daten in einem Ordner und prüft denselben Release-Feed wie die
installierte App. Es lädt den Installer nie herunter und führt ihn nie aus: Es bietet die Release-Seite an, wenn eine neuere
Version erschienen ist, und das Entpacken des neuen Archivs über den alten Ordner behält deine Daten.

### Wie beende ich vollständig? {#how-do-i-quit-completely}
Beim Schließen des Fensters bleibt AW Next im Infobereich, damit die Verfolgung weiterläuft. Nutze zum Beenden das Menü des Infobereichs.

## Das Projekt {#the-project}

### Funktioniert es mit Goldberg-, GBE-Fork- und CODEX-Spielen? {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
Ja. AW Next liest die Erfolgsdateien, die Goldberg, GBE Fork, CODEX, RUNE und CPY schreiben, und kann
die GBE-Fork-Laufzeit für ein Spiel installieren und reparieren. Siehe [Kompatible Quellen](sources.md) und
[Goldberg- und GBE-Fork-Einrichtung](emulator-setup.md).

### Ist das dieselbe App wie der Achievement Watcher von Xan105? {#is-this-the-same-app-as-xan105s-achievement-watcher}
Nein, es ist eine Fortführung. AW Next führt den Achievement Watcher von Xan105 und den 2.x-Zweig von darktakayanagi fort,
auf einer aktuellen Electron-Laufzeit, mit Linux-Unterstützung, mehr Quellen und einem Zustandsbericht pro Spiel
mit geführten Reparaturen. Siehe den [Vergleich](comparison.md).

### Ist es sicher bei gecrackten Spielen? {#is-it-safe-to-use-with-cracked-games}
Das Lesen von Erfolgen ist schreibgeschützt. Die Reparaturwerkzeuge schreiben nur nach einer Bestätigung in einen Spielordner und
mit einer Sicherung, und die automatische Reparatur ist standardmäßig aus. Nutze sie nur mit Spielen, die du besitzt. Ein Virenscanner
kann eine Emulator-Datei als Fehlalarm markieren. Siehe
[Fehlerbehebung → Virenscanner](troubleshooting.md#antivirus-or-smartscreen-warning).

### Wie unterscheidet es sich vom Achievement Watcher 2.x? {#how-does-this-differ-from-achievement-watcher-2x}
AW Next führt ihn mit einer modernen Laufzeit und einer großen Überarbeitung bei Kompatibilität, Zuverlässigkeit und
Funktionen fort. Siehe den [Vergleich](comparison.md).

### Kann es mir Spiele, Schlüssel oder Konten besorgen? {#can-it-get-me-games-keys-or-accounts}
Nein, und der Issue-Tracker kann dabei ebenfalls nicht helfen. AW Next enthält keine Spieldateien und umgeht keine
Online-Besitzprüfungen.

### Ich habe einen Fehler gefunden oder eine Idee {#i-found-a-bug-or-have-an-idea}
[Eröffne ein Issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) mit der App-Version,
deiner Windows-Version (oder Linux-Distribution und Desktop), der betroffenen Quelle und den relevanten Protokollen.
Melde eine vermutete Sicherheitslücke vertraulich über die
[Sicherheitsrichtlinie](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md). Für eine
Frage oder Hilfe, bevor du weißt, ob es ein Fehler ist, frage auf dem [Discord-Server](https://discord.gg/DjTMrDsXTh).

---

**Immer noch festgefahren?** [Fehlerbehebung](troubleshooting.md) geht jedes Symptom der Reihe nach durch.

<div align="center">

[← Dokumentation](README.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
