---
title: "Documentazione"
description: "Guide per installare, configurare e riparare Achievement Watcher Next: sorgenti, notifiche, preset, overlay e risoluzione dei problemi."
permalink: /it/README.html
---

<!--
  jekyll-readme-index still drops a file literally named README.md, even with readme_index.enabled: false
  in _config.yml. Explicit front matter with a permalink makes Jekyll publish it at README.html.
-->
<div align="center">

# Documentazione di AW Next

Guide per la configurazione, l'uso quotidiano e la manutenzione.

[Home](../index.html) · [Download](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Galleria dei preset](../gallery/) · [Galleria dei temi](../gallery/themes/) · [Changelog](../changelog.md) · [Sicurezza](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Segnala un problema](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="../assets/shot/home-800.webp 800w, ../assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/home.png" width="800" height="492" alt="La libreria di AW Next"></picture>

</div>

## Da dove iniziare {#start-here}

Leggi in ordine oppure vai direttamente a ciò che ti serve. Ogni pagina termina con un link alla successiva.

| # | Guida | Di cosa parla |
|---|---|---|
| 1 | [Per iniziare](getting-started.md) | Installazione, primo avvio, Semplice e Avanzata, ricerca dei giochi, aggiornamenti |
| 2 | [Sorgenti compatibili](sources.md) | Tutte le sorgenti che AW Next legge e che cosa richiede ciascuna |
| 3 | [Notifiche](notifications.md) | Modalità di consegna, Automatico, suoni, posizione, screenshot |
| 4 | [Preset e Preset Designer](presets.md) | L'aspetto del popup, come crearne uno tuo, condividere i file `.awpreset` |
| 5 | [Overlay](overlay.md) | L'elenco degli obiettivi in gioco: ricerca, filtri, rarità |
| 6 | [Controller](controller.md) | Usare l'app e l'overlay con un gamepad |
| 7 | [Stato dei giochi](game-health.md) | Il rapporto per ogni gioco e le sue riparazioni guidate |
| 8 | [Risoluzione dei problemi](troubleshooting.md) | Problemi di rilevamento, avanzamento, notifiche e tempo di gioco |

## Quando ti serve {#when-you-need-it}

| Guida | Di cosa parla |
|---|---|
| [FAQ](faq.md) | Risposte brevi alle domande più comuni |
| [Linux e Steam Deck](linux.md) | L'AppImage e i suoi aggiornamenti, i desktop, la scorciatoia dell'overlay, Steam, Proton e i launcher |
| [Strumenti avanzati](advanced.md) | Manutenzione, svuotamento delle cache, reimpostazioni, giochi manuali, diagnostica |
| [Configurazione Goldberg / GBE](emulator-setup.md) | Diagnosticare o riparare un gioco Steam emulato |
| [Configurazione Uplay, R1 e R2](uplay-r2.md) | L'equivalente per Ubisoft |
| [Confronto](comparison.md) | In cosa AW Next si differenzia da Achievement Watcher 2.x e da Achievements |
| [Gallerie della community](community-galleries.md) | Preset e temi di altre persone, e come inviare i tuoi |

**Impostazioni → Aiuto** è il riferimento più rapido mentre l'app è aperta. Si adatta alla tua configurazione
(scorciatoia dell'overlay, associazioni del controller, modalità di notifica, tema, sorgenti attive) e filtra
i suoi argomenti mentre scrivi.

## Riferimento per sviluppatori {#developer-reference}

Per chi contribuisce e per chi compila AW Next dal codice sorgente.

| Argomento | Riferimento |
|---|---|
| Contributi, branch, test, stile dei commit | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| Ambiente di sviluppo, esecuzione, pacchettizzazione | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| Confini tra app, renderer e Watchdog; il contratto del parser | [Architettura](../architecture.md) |
| Formati dei file Goldberg / GBE, rilevamento, invarianti di riparazione | [Riferimento Goldberg / GBE](../goldberg-gbe.md) |
| Come i giochi Uplay R1/R2 vengono identificati, riparati e letti | [Riferimento Uplay R1/R2](../uplay-reference.md) |
| Versioni, pubblicazione, CI, validazione dell'aggiornamento automatico | [Flusso di rilascio](../RELEASE_WORKFLOW.md) |
| Il programma di installazione, di disinstallazione e di aggiornamento | [Installazione, disinstallazione e aggiornamenti](../INSTALLER_AND_UPDATES.md) |
| Traduzione, formattazione Intl, instradamento dei link, il linter dei locali | [Localizzazione](../localization.md) |
| File dei locali e parità delle chiavi | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| Il file tema portatile e le sue versioni | [Formato .awtheme](../awtheme-format.md) |

## Dove sono i tuoi dati {#where-your-data-lives}

Tutto ciò che AW Next scrive si trova in **`%APPDATA%\Achievement Watcher Next`** (`~/.config/Achievement
Watcher Next` su Linux, con la stessa struttura). I percorsi qui sotto sono relativi a quella cartella. Un
aggiornamento conserva tutto, e al primo avvio viene importata una cartella Achievement Watcher precedente
senza modificarla.

| Che cosa | Dove |
|---|---|
| Impostazioni, indici e database | `cfg\` (`options.ini` è il file delle impostazioni) |
| Log | `logs\` |
| Preset creati o importati da te | `presets\Users Presets\` |
| Immagini usate da un preset come sfondo | `presets\images\` |
| Suoni che hai aggiunto | `sounds\` |
| Temi salvati o importati | `theme-packs\` |
| Immagini usate dal tema Custom | `theme-images\` |
| Un tema a foglio di stile che hai copiato qui | `themes\` |
| Backup degli obiettivi e quelli fatti prima di una riparazione GBE | `backups\achievements\`, `backups\gbe\` |
| Copertine e icone dei giochi | `covers\`, `gameIcons\` |
| Screenshot | `Pictures\Achievement Watcher Next` (o la cartella che hai scelto) |
| Account collegati | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json`, `cfg\psn-auth.json` |
| **Scaricabili di nuovo:** schemi, icone e rarità da una piattaforma | `steam_cache\`, `uplay_cache\` |
| **Scaricabili di nuovo:** strumenti scaricati e risultati della scansione delle cartelle | `cache\` (tranne `cache\uplayR2`, che contiene una DLL fornita da te) |
| Salvataggi di GBE Fork (scritti dall'emulatore) | `%APPDATA%\GSE Saves` |
| Salvataggi del Goldberg classico (stesso discorso) | `%APPDATA%\Goldberg SteamEmu Saves` |

**Impostazioni → Avanzate → Svuota cache** svuota le due righe riscaricabili e nient'altro. Nulla di ciò che
si trova in `cfg\`, `presets\`, `theme-packs\`, `theme-images\`, `themes\`, `sounds\`, `covers\`,
`gameIcons\` o `backups\` viene rigenerato, quindi copiali prima di una reinstallazione.

Prima di segnalare un problema, esegui **Impostazioni → Avanzate → Diagnostica**, riproduci il problema una
volta, poi rimuovi i dati privati dai log che allegherai.

### Che cosa esce da questo PC {#what-leaves-this-pc}

AW Next non ha analisi d'uso, né telemetria, né un account proprio. Invia solo le richieste che gli servono
e conserva in cache ogni risposta, così la libreria continua a funzionare offline.

| Richiede | A | Inviando |
|---|---|---|
| Elenchi degli obiettivi, icone, rarità globale | Gli endpoint pubblici di Steam, la pagina SteamCommunity, SteamHunters, Exophase | L'AppID di un gioco e la lingua dell'interfaccia |
| Copertine e loghi | La CDN di Steam, SteamDB, SteamGridDB | L'AppID o il titolo di un gioco |
| Controllo e download degli aggiornamenti | Il feed delle release di GitHub | Solo la richiesta |
| Strumenti di riparazione, quando avvii una riparazione | I progetti GBE Fork, Steamless, API-bypass e CrakFiles | Solo la richiesta |
| La tua libreria e i tuoi sblocchi, **solo se colleghi un account** | Steam, Epic, Xbox Network o PlayStation Network | Il token di sessione dell'account; per gli sblocchi Steam, lo Steam ID pubblico |
| La tua libreria RetroAchievements e i tuoi sblocchi, **solo se compili la scheda dell'account** | retroachievements.org | Il tuo nome utente e la chiave Web API, conservati cifrati su questo PC |
| Preset e temi della community, **solo se apri la galleria o vi pubblichi** | Il servizio della galleria, `aw-gallery.shirow.dedyn.io` | La richiesta dell'elenco; un file solo quando premi Pubblica |

Quando l'eseguibile di un gioco contiene una vera icona da 256 px, AW Next la legge dal file e la usa come
logo senza interrogare la rete.

Questo sito web non imposta cookie, non usa analisi d'uso e carica font e script dal proprio host.
Le pagine delle gallerie recuperano il loro elenco dal servizio della galleria indicato sopra e, se non è
raggiungibile, ripiegano sulla copia salvata accanto a loro.

Nient'altro viene caricato: né la tua libreria, né il tempo di gioco, né le cartelle, né gli screenshot.
Il broadcast facoltativo `Websocket @localhost:8082` ascolta solo su `127.0.0.1`, quindi solo i programmi
presenti su questo PC possono leggerlo. L'unica cosa che invii di tua volontà è un preset o un tema che
pubblichi in una galleria (vedi [Le gallerie della community](community-galleries.md)).
