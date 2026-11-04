---
title: "Einrichtung der Erfolge mit Goldberg und GBE Fork"
description: "Ein emuliertes Steam-Spiel mit Goldberg oder GBE Fork diagnostizieren oder reparieren, mit Sicherung und Bestätigung vor jedem Schreibvorgang."
---

# Einrichtung der Erfolge mit Goldberg und GBE Fork

AW Next liest die Erfolgsspielstände, die Goldberg, GBE Fork und kompatible Steam-Emulator-Aufbauten
erzeugen. Es kann außerdem die lokale Emulator-Konfiguration eines Spiels diagnostizieren und reparieren, wenn Schema,
AppID oder Laufzeitdateien unvollständig sind.

## Wie bekomme ich Erfolgsbenachrichtigungen mit Goldberg oder GBE Fork? {#how-do-i-get-achievement-notifications-with-goldberg-or-gbe-fork}

Goldberg und GBE Fork sind Steam-Emulatoren: Sie ersetzen die Steam-Bibliothek und erfassen Freischaltungen in einer
Spielstanddatei, `achievements.json`, unter `%APPDATA%\GSE Saves\<appid>`. Eine zweite Datei mit demselben Namen
im Ordner `steam_settings` des Spiels beschreibt die Erfolge nur. AW Next liest beide und zeigt
das Freischaltungs-Popup über dem Spiel. Füge den Spielordner unter **Einstellungen → Ordner** hinzu, starte **Intelligente Suche**
und klicke das Spiel mit der rechten Maustaste an und wähle **Emulator diagnostizieren**, wenn es bei 0 % bleibt. Es wird nichts in den
Spielordner geschrieben, bis du eine Reparatur anforderst.

> [!WARNING]
> Die Reparaturwerkzeuge sind optional. Sie verändern Dateien im gewählten Spielordner, nutze sie also nur
> mit Spielen, die du besitzt, und behalte jede zusätzliche Sicherung, die dir wichtig ist.

## Schema- und Spielstanddateien sind verschieden {#schema-and-save-files-are-different}

Zwei nicht zusammengehörige Dateien heißen häufig `achievements.json`:

| | Schemadatei | Spielstanddatei der Laufzeit |
|---|---|---|
| Typischer Ort | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` oder `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| Geschrieben von | Dem Spiel oder der Emulator-Einrichtung | Dem Emulator, während das Spiel läuft |
| Zweck | Namen, Beschreibungen und Symbole der Erfolge | Welche Erfolge freigeschaltet sind |
| Wenn sie fehlt | Die Erfolgsbehandlung im Spiel kann unvollständig sein; AW Next kann eine andere Schemaquelle nutzen | Das Spiel zeigt 0 %, bis die erste Freischaltung geschrieben wird |

Eine Schemadatei beweist nicht, dass etwas freigeschaltet ist, und ein Laufzeit-Spielstand ohne erreichten Eintrag ist ein gültiges
0 %. Beide Spielstandordner können für ein Spiel existieren: AW Next liest, welcher die Freischaltungen enthält. Leitet eine GBE- oder
Goldberg-Konfiguration Spielstände anderswohin um (`local_save_path`), überwacht AW Next den Ordner, in dem sie
landen.

## Empfohlener Ablauf {#recommended-workflow}

1. Füge die Spielebibliothek oder das Stammverzeichnis der Spielstände unter **Einstellungen → Ordner** hinzu.
2. Starte **Intelligente Suche** oder **Konfigurationen generieren**.
3. Zeigt das Spiel fehlende Daten, klicke es mit der rechten Maustaste an und wähle **Emulator diagnostizieren**.
4. Lies den Bericht, bevor du eine Reparatur anwendest.
5. Nutze **Emulator-Fix anwenden**, um die Laufzeit-DLL zu installieren und `steam_settings` gemeinsam zu reparieren.
6. Starte das Spiel, schalte einen Erfolg frei und aktualisiere AW Next bei Bedarf.

Die automatische Einrichtung neu entdeckter Spiele ist optional, unter **Einstellungen → Emulatoren → Steam / GBE
Fork**. Ist sie aus, schreibt ein Bibliotheksscan nichts in einen Spielordner (keine DLL, keine Konfigurationsdatei,
nicht einmal eine fehlende `achievements.json`), bis du eine Reparatur anforderst.

<div align="center">
<picture><source srcset="../assets/shot/steam-gbe-panel-800.webp 800w, ../assets/shot/steam-gbe-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/steam-gbe-panel.png" width="720" height="529" alt="Einstellungen - Steam / GBE Fork"></picture><br>
<sub>Automatische Reparatur, die Schalter für DLC und Identität und der optionale SteamStub-Entpacker</sub>
</div>

## Aktionen im Kontextmenü {#context-menu-actions}

<div align="center">
<picture><source srcset="../assets/shot/emulator-tools-800.webp 800w, ../assets/shot/emulator-tools.webp 1049w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/emulator-tools.png" width="560" height="336" alt="Kontextmenü Emulator & Tools" loading="lazy" decoding="async"></picture><br>
<sub>Rechtsklick auf ein Spiel → Emulator &amp; Tools</sub>
</div>

### Emulator diagnostizieren {#diagnose-emulator}

Meldet den erkannten Emulatortyp, die AppID, den Ort von `steam_settings`, die Anzahl von Schema und Spielständen, fehlende
Einträge oder Symbole, eigene Speicherpfade und AppID-Abweichungen und ob die installierte Laufzeit die ist, die
AW Next dort abgelegt hat. Die Diagnose ist schreibgeschützt.

### Emulator-Fix anwenden {#apply-emulator-fix}

Repariert die Laufzeit-DLL und das Schema in einem Schritt:

- lädt ein passendes GBE-Fork-Release herunter, speichert es zwischen und installiert die DLL-Architektur, die das Spiel braucht
  (`steam_api.dll` oder `steam_api64.dll`), wobei jede vorhandene Datei als Sicherung bleibt;
- baut `steam_settings\achievements.json` (und seinen Ordner `images`) passend zur Steam-Erfolgs-
  liste und lädt die Symbole herunter;
- schreibt `steam_appid.txt`, wenn sie fehlt;
- schreibt die GBE-Konfigurationsdateien (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

Jede Datei, die er ersetzt, wird zuerst gesichert, und Schema-Reparaturen behalten außerdem Kopien mit Zeitstempel unter
`steam_settings\.aw-backups`. Die Laufzeit wird als normaler DLL-Austausch installiert; AW Next richtet keinen
eigenen ColdClient-Launcher ein.

Verpackte Unreal-Engine-Builds werden genauso repariert. Ihre Steam-Dateien liegen unter
`Engine\Binaries\ThirdParty\Steamworks` statt neben der ausführbaren Datei, und AW Next findet, installiert
und prüft sie dort.

### DLC-Besitz und Kontoidentität {#dlc-ownership-and-account-identity}

Zwei Schalter unter **Einstellungen → Emulatoren → Steam / GBE Fork**, beide standardmäßig aus und unabhängig von der
automatischen Reparatur:

| Einstellung | Was sie schreibt |
|---|---|
| **DLC-Besitz verwalten** | `configs.app.ini`, damit der Emulator jedes DLC als besessen meldet |
| **Kontoname und Sprache schreiben** | Deinen Kontonamen und deine Sprache in `configs.user.ini` |

Keiner von beiden beeinflusst Erfolge. Lass sie aus, um ein Spiel unverändert zu halten, oder wenn du DLC oder Identität
von Hand verwaltest.

Die Karte **Emulator-Identität** darunter zeigt, was geschrieben wird:

| Feld | Was es tut |
|---|---|
| **Kontoname** | Wird geschrieben, solange **Kontoname und Sprache schreiben** an ist. Leer nutzt den Namen deines AW-Next-Profils. |
| **Steam ID** | Wird geschrieben, solange dieser Schalter an ist; leer behält die eigene jedes Spiels. Die Würfelschaltfläche erzeugt eine zufällige gültige, und ein Tippfehler wird beim Tippen markiert und nie geschrieben. |
| **Speicherordner** | Gilt, sobald du einen wählst: Jedes Spiel, das ab dann korrigiert oder repariert wird, speichert dort (`local_save_path`), und AW Next überwacht ihn für Live-Benachrichtigungen. Leer behält `%APPDATA%\GSE Saves`. |

Um zurückzunehmen, was einer der beiden Schalter geschrieben hat, klicke ein Spiel mit der rechten Maustaste an und wähle **Emulator-Konfiguration von AW Next entfernen**.
Es zeigt genau, was es entfernen wird, bevor es etwas tut. Es entfernt nur den DLC-
Abschnitt, die Schalter und Identitätsschlüssel, die AW Next hinzugefügt hat, behält jeden Wert, den du oder das Repack gesetzt hast, und löscht
eine Datei nur, wenn nichts anderes mehr darin steht.

### Eine eigene Emulator-DLL verwenden {#using-your-own-emulator-dll}

**Einstellungen → Emulatoren → Emulator-DLL** importiert deine eigene `steam_api.dll` oder `steam_api64.dll` und
installiert sie statt des heruntergeladenen GBE-Fork-Builds, bei jeder Korrektur und jeder automatischen Korrektur. Die
Architektur, die du nicht importierst, stammt weiterhin aus dem offiziellen Build, ebenso wie die Schnittstellenwerkzeuge.

Eine importierte Datei wird bei jeder Verwendung neu geprüft: Sie muss eine echte PE der Architektur sein, die ihr Name
behauptet, und sie muss eine Steam-Emulator-DLL sein. Eine Datei, die durchfällt, wird gemeldet und ignoriert, nie
installiert. **Offizielle Version verwenden** entfernt den Import und kehrt zum heruntergeladenen Release zurück.

### Steam-DRM entfernen (Steamless) {#remove-steam-drm-steamless}

Versucht, SteamStub aus der gewählten ausführbaren Datei zu entpacken, wenn ein DLL-Austausch nicht geladen werden kann. Die ursprüngliche
ausführbare Datei bleibt als `*.steamstub.bak` erhalten. Es bewirkt nichts bei Spielen ohne SteamStub und umgeht keine
serverseitigen Besitzprüfungen.

### Sichern und wiederherstellen {#back-up-and-restore}

Klicke mit der rechten Maustaste auf **GBE/Goldberg-Setup sichern**, um die aktuelle DLL und die Dateien in `steam_settings` zu sichern, oder auf
**Letzte GBE/Goldberg-Sicherung wiederherstellen**, um eine zurückzuholen. Eine Sicherung vermerkt, wenn der Ordner bereits
Konfiguration enthielt, die AW Next geschrieben hatte, sodass sie nie für das unberührte Original gehalten wird.

## AppID manuell festlegen {#set-appid-manually}

Passt der Ordnername eines Spiels auf mehrere Steam-Releases und die automatische Zuordnung hat das falsche gewählt,
klicke es mit der rechten Maustaste an und wähle **AppID manuell festlegen**. Die AppID wird in `steam_appid.txt` geschrieben und
für diesen Installationsordner gemerkt, sodass spätere Reparaturen sie nutzen, statt erneut zu raten. **Manuelle AppID
entfernen** im selben Menü nimmt sie wieder weg.

## Häufige Probleme {#common-problems}

### Das Spiel fehlt {#the-game-is-missing}

- Starte den Emulator einmal, damit er einen Laufzeit-Spielstand anlegt, oder füge die echte Spielebibliothek hinzu, damit die Erkennung
  `steam_settings`, `steam_appid.txt` oder die Steam-API-DLL finden kann.
- Prüfe, ob der in den Einstellungen hinzugefügte Ordner hoch genug liegt, um den Spielordner zu enthalten, aber nicht ein ganzes Laufwerk
  mit nicht zugehörigen Daten ist.
- Starte **Konfigurationen generieren** und sieh dir die Zahl der Ergebnisse an.

### Jeder Erfolg bleibt gesperrt {#every-achievement-remains-locked}

Prüfe diese Ursachen der Reihe nach:

1. **Noch nichts ist freigeschaltet.** Ein fehlender oder leerer Laufzeit-Spielstand ist zu erwarten.
2. **Schemanamen passen nicht zu den Schlüsseln im Spielstand.** Starte **Emulator diagnostizieren** und repariere dann das Schema.
3. **Der Speicherpfad ist angepasst.** Richte AW Next auf das tatsächliche Stammverzeichnis der Spielstände oder entferne die Platzhalter-
   Überschreibung.
4. **Die AppID ist falsch.** Nutze **AppID manuell festlegen**, bevor du eine weitere Reparatur ausführst.

### Beschreibungen oder Symbole fehlen {#descriptions-or-icons-are-missing}

Führe eine vollständige Reparatur mit aktiviertem Symbol-Download aus. Sind Online-Metadaten nicht verfügbar, kann AW Next ein
gültiges lokales Schema wiederverwenden, aber keine Beschreibungen erfinden, die keine Quelle hat.

### Benachrichtigungen im Spiel fehlen, aber die Bibliothek aktualisiert sich {#in-game-notifications-are-missing-but-the-library-updates}

AW Next liest den Laufzeit-Spielstand, aber das Emulator-Schema des Spiels oder dessen Overlay kann unvollständig sein. Prüfe,
ob `steam_settings\achievements.json` dieselben API-Namen wie der Laufzeit-Spielstand und gültige Symbol-
pfade hat.

## Einschränkungen {#limitations}

Manche Spiele melden Erfolge überhaupt nicht über Steamworks, auch wenn sie auf Steam verkauft werden, und lassen sich
nicht über einen Goldberg- oder GBE-Spielstandpfad verfolgen. AW Next kann außerdem kein Spiel reparieren, dessen wahre Identität
oder Erfolgsschema es nicht sicher auflösen kann.

Die [technische Goldberg/GBE-Referenz](../goldberg-gbe.md) behandelt Dateiformate, Erkennungsregeln und
Implementierungsdetails.

---

**Weiter:** [Uplay einrichten, R1 und R2](uplay-r2.md), das Ubisoft-Gegenstück für Spiele, die
`steam_api.dll` nicht laden.

<div align="center">

[← Dokumentation](README.md) · [Technische Referenz](../goldberg-gbe.md) · [Projektseite](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
