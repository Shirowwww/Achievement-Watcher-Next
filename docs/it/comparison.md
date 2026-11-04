---
title: "Come si confronta AW Next"
description: "In cosa Achievement Watcher Next si differenzia da Achievement Watcher 2.x e dall'app Achievements, funzione per funzione."
---

# Come si confronta AW Next

Achievement Watcher Next è un'alternativa e il successore di Achievement Watcher di Xan105. Funziona su
Windows e Linux, legge Steam, GOG, Epic, Ubisoft, Xbox PC e i salvataggi degli emulatori Steam, ripara una
configurazione Goldberg o GBE Fork dall'app e sceglie da solo il proprio canale di notifica. Achievements di
PSerban93 è l'altro tracker per Windows sviluppato attivamente, e Sentinel è solo per Linux.

AW Next continua [l'Achievement Watcher originale di Xan105](https://github.com/xan105/Achievement-Watcher)
e [il ramo 2.x di darktakayanagi](https://github.com/darktakayanagi/Achievement-Watcher). Questa pagina lo mette
accanto a quella discendenza, accanto ad [Achievements](https://github.com/PSerban93/Achievements), l'altro
tracker per Windows sviluppato attivamente, e accanto a [Sentinel](https://github.com/RemakeCode/sentinel), un
osservatore solo per Linux dei salvataggi Steam emulati.

Tutti e quattro leggono bene gli obiettivi, quindi la domanda utile è quali extra corrispondono al tuo modo di giocare. Le tabelle
indicano che cosa fa ciascun progetto e che cosa no.

Parti di AW Next derivano da Achievements con la sua licenza MIT, quindi dove una riga contrassegna entrambi i
progetti, l'implementazione a volte è partita da quella di JokerVerse. Vedi
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE).

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| Piattaforma | Windows e Linux | Solo Windows | Solo Windows | Solo Linux |
| Licenza | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| Runtime desktop | Electron 44 | Electron 44 | Electron 12 | Go con GTK 4 e WebKitGTK 6 |
| Sviluppo | Attivo | Attivo (ultimo push il 22 ottobre 2026) | Archiviato il 13 ottobre 2026, sola lettura | Attivo (v2.1.1, 11 ottobre 2026) |

## Da dove provengono gli obiettivi {#where-the-achievements-come-from}

| Sorgente | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Librerie locali ufficiali | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · su Linux: Steam, Heroic, Lutris e Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (legacy) | ❌ |
| Collegamento facoltativo dell'account | ✅ Steam (giochi posseduti, giochi condivisi con Family, sblocchi dei tuoi altri PC) · Epic · Xbox (Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Salvataggi degli emulatori Steam | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · strutture CODEX/RUNE/EMPRESS/Online-Fix/Tenoke, anche su Linux (prefissi Wine, e nativo per Goldberg e GBE) | ✅ Copertura paragonabile | ✅ Emulatori Steam | ⚠️ Goldberg/GSE · CODEX · RUNE, in prefissi Wine/Proton |
| Release portatili senza configurazione | ✅ L'albero dei salvataggi viene letto da solo | ⚠️ Inserimento manuale | ❌ | ⚠️ Prefissi aggiunti a mano |
| Goldberg Uplay R2 (Ubisoft) | ✅ Consapevole della versione del loader | ❌ | ❌ | ✅ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| Emulatori di console | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ Solo RPCS3 | ❌ |
| Giochi Xbox 360 ricompilati per PC (ReXGlue e simili) | ✅ Elenco, icone, DLC e sblocchi in tempo reale, oltre 60 port noti, build Linux | ✅ | ❌ | ❌ |
| Giochi PS4 portati su PC | ✅ run.py, port nativi e a eseguibile singolo, PROTOTYPE, PORTHEON (UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess, schema, DLC e icone letti dal gioco | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ Giochi giocati importati, giochi trovati su disco tramite la cronologia o le playlist di RetroArch, sblocchi in tempo reale con qualsiasi emulatore | ✅ | ❌ | ❌ |
| Patch di nicchia | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| Rilevamento delle cartelle | ✅ Configurazione automatica e Ricerca smart | ✅ Configurazione automatica | ✅ Ricerca smart | ⚠️ Riesamina i prefissi che aggiungi |
| Cartelle personalizzate e giochi manuali | ✅ Per singolo gioco o intera libreria | ✅ Per singolo gioco | ⚠️ Configurazione manuale | ⚠️ Percorsi di prefissi ed emulatori |

AW Next e Achievements ora leggono più o meno le stesse sorgenti. AW Next arriva più a fondo nelle strutture dei PC emulati
ed è l'unico dei quattro in grado di correggere i salvataggi di Uplay R2 e SocialClub.

## Quando un gioco non riporta nulla {#when-a-game-does-not-report}

Ogni tracker può dirti che un gioco è fermo allo 0%. AW Next prova anche a sistemarlo.

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Rapporto sullo stato di ogni gioco con riparazioni guidate | ✅ | ❌ | ❌ | ❌ |
| Installare e riparare il runtime dell'emulatore | ✅ Goldberg / GBE, schemi inclusi | ⚠️ Generazione dello schema | ❌ Manuale | ⚠️ Configurazione al meglio con il fork di Goldberg |
| Backup e ripristino prima di ogni modifica | ✅ Più Steamless e bypass facoltativo del controllo API | ❌ | ❌ | ❌ |
| Reimpostare o ripristinare gli obiettivi di un gioco | ✅ | ❌ | ❌ | ❌ |
| Sblocco manuale | ✅ | ❌ | ❌ | ❌ |
| Impostare a mano l'AppID di un gioco | ✅ | ❌ | ❌ | ❌ |
| Sostituzione della sorgente per singolo gioco | ✅ Auto / Steam / Ubisoft | ❌ | ❌ | ⚠️ Una sola sorgente di dati per l'intera libreria |
| Lista nera e recupero offline dei nomi | ✅ | ⚠️ Lista nera | ❌ | ❌ |

## Notifiche {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Canali | ✅ Toast nativo + overlay di gioco + sorgente browser OBS + toast Steam in Modalità gioco (plugin Decky) | ✅ Toast nativo + overlay animato | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ Notifica del desktop + plugin Decky in Modalità gioco |
| Sceglie da solo il proprio canale | ✅ Modalità Automatico, per stato del singolo gioco | ❌ Scelta fissa | ❌ Scelta fissa | ❌ |
| Preset designer, senza codice | ✅ 14 modelli di partenza, anteprima dal vivo, 10 preset inclusi tra cui Steam Original | ⚠️ Preset e temi integrati, quelli personalizzati scritti in HTML/CSS | ❌ | ❌ |
| Preset condivisibili | ✅ `.awpreset` + galleria della community | ❌ | ❌ | ❌ |
| Stile per rarità, platino e completamento | ✅ Rarità a 3 livelli, barra di completamento | ✅ Rarità | ❌ | ❌ |
| Preset per emulatore | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| Suoni | ✅ Scelta casuale, FLAC/M4A/AAC | ✅ | ⚠️ File personalizzato | ✅ Suoni personalizzati |
| Screenshot | ✅ Cattura compatibile con HDR su Windows (tone mapping BT.2408), anche su Linux sotto X11 e Wayland | ✅ Cattura HDR | ✅ | ❌ |
| Clip video di uno sblocco | ✅ 10-30 s, 30/60 FPS, H.264 · HEVC · AV1, tone mapping HDR; su Linux, gpu-screen-recorder o il registratore WebM integrato | ✅ 10-30 s, 30/60 FPS | ⚠️ Tramite OBS | ❌ |
| Notifiche di tempo di gioco e avanzamento | ✅ Silenziamento dell'avanzamento per singolo gioco | ✅ Silenziamento dell'avanzamento per singolo gioco | ✅ Tempo di gioco | ✅ Avanzamento, a più passaggi |
| Aspetto delle notifiche proprio per ogni gioco | ✅ Ogni gioco può sostituire preset, posizione, suono e scala | ❌ | ❌ | ❌ |

## L'app stessa {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Ricerca di libreria, giochi e obiettivi | ✅ | ✅ | ✅ | ⚠️ Ordinamento della libreria |
| Filtro dei soli installati e azioni sui giochi | ✅ Filtro · disinstallazione · ripristino | ⚠️ Filtro per piattaforma | ❌ | ❌ |
| Navigazione completa con il controller | ✅ App + overlay, su Windows e Linux | ✅ App + overlay | ❌ Pianificata | ⚠️ Tramite il plugin Decky |
| Steam Deck | ⚠️ Plugin Decky, non ancora confermato su un vero Deck | ❌ | ❌ | ✅ Plugin Decky in Gamescope |
| Temi | ✅ Integrati + editor Custom + `.awtheme` condivisibile + galleria | ✅ Integrati + file di tema utente | ❌ | ❌ |
| Lingue dell'interfaccia | ✅ 28 incluse | ✅ Circa 30 incluse | ✅ 18 | ❌ |
| Processo in background | ✅ Un solo demone nell'area di notifica | ✅ App nell'area di notifica | ⚠️ Watchdog separato | ✅ App nell'area di notifica |
| Download di runtime aggiuntivi | ✅ Nessun runtime del browser; il fork di GBE viene scaricato solo quando lo installi o lo ripari | ⚠️ Chromium di Playwright | ✅ Nessuno | ⚠️ GTK 4 e WebKitGTK 6 dal sistema |
| Accesso da tastiera e con screen reader | ✅ Impostazioni, finestre di dialogo e overlay raggiungibili con Tab, focus restituito alla chiusura di una finestra di dialogo | ⚠️ Scorciatoie da tastiera e mappa del controller | ❌ | ❌ |
| Installer, programma di disinstallazione e finestra di aggiornamento | ✅ Installer e programma di disinstallazione propri, finestra di aggiornamento con note di rilascio e avanzamento | ❌ | ❌ | ⚠️ Pacchetti della distribuzione e Flatpak |
| Documentazione | ✅ Guide, specifiche dei formati e gallerie | ⚠️ README | ⚠️ README | ⚠️ README e una guida a Goldberg |

## Linux e Steam Deck {#linux-and-the-steam-deck}

AW Next è distribuito anche come app Linux nativa (AppImage x64, mai tramite Wine). Segue i giochi avviati
con Steam e Proton, Wine, Lutris, Heroic e Bottles, e i giochi Linux nativi, con gli stessi
popup, overlay e tempo di gioco di Windows. Il supporto per Steam Deck è nuovo: le notifiche in Modalità gioco passano
dal plugin Decky nel repository, e né il plugin né il popup in Modalità gioco sono stati
confermati su un vero Deck.

<sub>✅ = supportato e documentato · ⚠️ = parziale, manuale o un flusso di lavoro diverso · ❌ = non disponibile o
non documentato nel ramo pubblico attuale. Le colonne dei concorrenti sono state confrontate con i loro README pubblici,
i metadati di GitHub e i manifest dei pacchetti il 22 ottobre 2026. La colonna di AW Next riflette la versione
3.12.2 e le modifiche non ancora rilasciate di ottobre 2026. Una ❌ in un'altra colonna di solito significa non documentato
e non impossibile, e tutti questi progetti si muovono in fretta.</sub>

## Hydra e Steam Achievement Manager {#hydra-and-steam-achievement-manager}

Altri due strumenti compaiono nelle stesse ricerche, e svolgono un lavoro diverso.

- [Hydra](https://hydralauncher.gg/) si descrive come un launcher di giochi che permette di scaricare giochi
  e tracciare gli obiettivi. AW Next non scarica giochi.
- [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) si descrive come un'applicazione
  leggera e portatile usata per gestire obiettivi e statistiche su Steam. Richiede il client Steam,
  un account Steam e l'accesso alla rete. AW Next mostra e traccia gli obiettivi e non richiede alcun
  account Steam.

Nessuno dei due è nelle tabelle sopra, che confrontano i tracker che leggono i salvataggi locali e degli emulatori.

## In breve {#in-short}

**AW Next** è adatto a una libreria che deve continuare a funzionare su Windows e Linux: launcher ufficiali e
salvataggi emulati affiancati, un rapporto sullo stato che ripara una configurazione Goldberg o GBE invece di
limitarsi a segnalarla, notifiche che scelgono da sole il proprio canale, e preset e temi che puoi progettare e
condividere.

**Achievements** ha un ampio elenco di sorgenti su Windows, tra cui RetroAchievements, port ricompilati e
patch di nicchia, con una forte configurazione automatica, un overlay animato e clip video di uno sblocco.

**Achievement Watcher 2.x** è la base storica, con ampia compatibilità con gli emulatori e canali di
notifica legacy su Electron 12. Il suo repository è stato archiviato il 13 ottobre 2026 e non è più
mantenuto.

**Sentinel** è un'opzione leggera per Linux per i salvataggi Goldberg, CODEX e RUNE, con un plugin per
Steam Deck ben integrato.

---

<div align="center">

[← Documentazione](README.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
