---
title: "Per iniziare"
description: "Installa Achievement Watcher Next, segui la guida del primo avvio, scegli Semplice o Avanzata, trova i tuoi giochi e mantieni l'app aggiornata."
---

# Per iniziare

AW Next è un'app desktop per Windows e Linux. Le release includono il proprio runtime, quindi Node.js serve
solo per compilare dal codice sorgente. Su Linux, installa l'AppImage come descritto in [Linux e Steam Deck](linux.md),
poi torna qui: tutto ciò che segue vale anche per Linux, con `~/.config/Achievement Watcher Next` al posto di
`%APPDATA%\Achievement Watcher Next`.

## Installazione {#install}

| Passaggio | Windows 10 e 11 | Linux (x64, beta) |
|---|---|---|
| **Scaricalo** | Dall'[ultima release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest): `Achievement.Watcher.Setup.<version>.exe`, oppure `Achievement.Watcher.Portable.<version>.zip` per tenere i dati accanto all'app | Dalla stessa release: `Achievement.Watcher.<version>.AppImage` |
| **Avvialo** | Esegui il programma di installazione, scegli una cartella, poi apri AW Next dal menu Start | `chmod +x`, poi eseguilo. Richiede FUSE 2: `libfuse2t64` su Ubuntu 24.04 |
| **Dati** | `%APPDATA%\Achievement Watcher Next` (la versione portatile tiene una cartella `data` accanto all'eseguibile) | `~/.config/Achievement Watcher Next` |

> [!WARNING]
> Il programma di installazione è firmato con il certificato autofirmato del progetto (`CN=Shirow`), quindi
> Windows SmartScreen potrebbe comunque chiedere conferma. Vedi
> [Avviso dell'antivirus o di SmartScreen](troubleshooting.md#antivirus-or-smartscreen-warning). Gli
> aggiornamenti dall'app installano solo una release firmata da quel certificato, fissato tramite l'impronta digitale.

## Primo avvio {#first-launch}

<div align="center">
<picture><source srcset="../assets/shot/onboarding-dialog-800.webp 800w, ../assets/shot/onboarding-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-dialog.png" width="720" height="475" alt="La guida del primo avvio, con la scelta della lingua e dell'interfaccia Semplice o Avanzata"></picture><br>
<sub>Sei passaggi: le basi, il profilo, i giochi, le sorgenti, aspetto e avvisi, e un riepilogo finale</sub>
</div>

La guida del primo avvio chiede le scelte che riempiono la libreria:

- **Basi**: la lingua (dell'interfaccia e, quando una sorgente la offre, dei metadati dei giochi) e l'interfaccia,
  Semplice o Avanzata (vedi sotto). Nessuna delle due è preselezionata.
- **Profilo**: il nome mostrato nell'intestazione, un avatar locale facoltativo e il tuo account Steam principale.
- **Giochi**: ciò che è stato trovato su questo PC, con i conteggi. Aggiungi una cartella solo se manca qualcosa.
- **Sorgenti**: accessi facoltativi (Steam, Epic, Xbox, PlayStation, RetroAchievements) che leggono la tua vera
  libreria e gli sblocchi fatti su un altro PC. Puoi saltarli e collegarti più tardi in **Impostazioni →
  Sorgente**. Tutti gli interruttori delle sorgenti sono sotto **Regola le sorgenti**, ripiegati perché i valori
  predefiniti leggono tutto ciò che è installato.
- **Aspetto e avvisi**: il tema e il modo in cui vengono annunciati gli sblocchi, con un pulsante **Prova notifica**.
  L'opzione predefinita, **Automatico**, non richiede alcuna decisione.
- **Pronto**: un riepilogo con un pulsante **Cambia** per ogni scelta e rimandi a raccolte, modalità trofei,
  clip video e overlay.

<div align="center">
<picture><source srcset="../assets/shot/onboarding-ready-dialog-800.webp 800w, ../assets/shot/onboarding-ready-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-ready-dialog.png" width="720" height="475" alt="L'ultimo passaggio della guida del primo avvio, con il riepilogo e le schede Da sapere" loading="lazy" decoding="async"></picture><br>
<sub>L'ultimo passaggio: ogni scelta con il suo pulsante Cambia, poi una scheda per ogni funzione da conoscere</sub>
</div>

**Salta la configurazione** conserva le tue risposte, lascia il resto com'era e avvia la prima scansione. **Impostazioni →
Generale** riapre la guida.

## Semplice e Avanzata {#simple-and-advanced}

Scegli una delle due nella guida del primo avvio e cambiala quando vuoi con il controllo **Interfaccia** in cima a
**Impostazioni**.

<div align="center">
<picture><source srcset="../assets/shot/settings-panel-800.webp 800w, ../assets/shot/settings-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/settings-panel.png" width="720" height="529" alt="Le impostazioni di AW Next" loading="lazy" decoding="async"></picture><br>
<sub>Il controllo Interfaccia si trova accanto al titolo del pannello; il campo di ricerca filtra tutte le schede insieme</sub>
</div>

- **Semplice** mostra le schede di uso quotidiano: Generale, Aspetto, Controller, Notifiche, Preset notifiche,
  Sorgente, Cartelle e Aiuto.
- **Avanzata** aggiunge le schede **Steam / GBE Fork**, **Ubisoft / Uplay R1/R2** e **Avanzate**, e le opzioni
  più approfondite all'interno delle altre schede.

**Semplice nasconde dei controlli, ma non disattiva mai nulla.** Il tracciamento, la scansione e le notifiche si
comportano allo stesso modo, e ogni valore che hai impostato resta al suo posto quando torni indietro. Lo stato dei
giochi segue la stessa idea: in Semplice dice *Dati degli obiettivi trovati* oppure *Rilevato all'avvio del gioco*, in Avanzata
fornisce conteggi, file e nomi di processo esatti. Un'installazione esistente passa ad **Avanzata**, così nulla di
ciò che usavi scompare.

Il campo di ricerca in cima a **Impostazioni** filtra tutte le schede insieme e conta le corrispondenze per scheda.
Cerca tra etichette, descrizioni, valori delle opzioni e nomi interni, così `hideZero` trova la stessa riga in
qualsiasi lingua. `Ctrl+F` ci porta il cursore e `Esc` lo svuota.

## La libreria {#the-library}

In **Impostazioni → Sorgente**, lo scudo contrassegna le librerie desktop ufficiali. Attiva una riga e aggiorna;
compaiono solo le librerie rilevate su questo PC. Vedi [Sorgenti compatibili](sources.md).

Il selettore tra la ricerca nella libreria e il pulsante `+` passa da una all'altra di sei viste: schede grandi,
copertine verticali, le loro due varianti compatte, un elenco e una tabella di dettaglio con tempo di gioco e
ultima sessione. La scelta viene salvata, e ogni vista ha le stesse schede, gli stessi filtri e lo stesso menu contestuale.

<div align="center">
<picture><source srcset="../assets/shot/library-views-800.webp 800w, ../assets/shot/library-views.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/library-views.png" width="800" height="492" alt="La vista Dettagli della libreria, con l'ultimo obiettivo, l'ultima sessione e il tempo di gioco" loading="lazy" decoding="async"></picture><br>
<sub>La vista Dettagli: ultimo obiettivo, ultima sessione e tempo di gioco di ogni gioco a colpo d'occhio</sub>
</div>

**Impostazioni → Aspetto → Riquadri della libreria** imposta la dimensione dei riquadri e lo spazio tra di essi
(fino a 0), e mostra o nasconde il nome del gioco, la barra di avanzamento, l'icona della piattaforma, il pallino di
stato e i due pulsanti, per tutte le viste insieme. Un gioco che Steam elenca senza obiettivi mostra la sua
grafica invece di una barra; **Barra dei giochi senza obiettivi** riporta la barra.

Fai clic con il pulsante destro su un gioco per rinominarlo, modificarne il tempo di gioco o aggiungerlo a una
raccolta. Un nome che imposti sopravvive alle nuove scansioni e ai ripristini, mentre le copertine e
l'abbinamento mantengono il titolo originale. I giochi Steam possono prendere il loro titolo nella lingua degli
obiettivi (**Impostazioni → Generale**).

### Raccolte {#collections}

Le raccolte sono gruppi di giochi creati da te. Fai clic con il pulsante destro su un gioco, scegli **Raccolte**
e spunta una raccolta o creane una nuova. Il pulsante delle raccolte accanto all'interruttore dei soli giochi
installati filtra la libreria su una raccolta, e i numeri del profilo la seguono.

<div align="center">
<img src="../assets/shot/collections-flow.webp" width="800" height="493" alt="Creazione di una raccolta Preferiti, aggiunta di un gioco dal suo menu del tasto destro, poi scelta della raccolta nel menu dei filtri così che la libreria e i totali del profilo si restringano ai suoi giochi" loading="lazy"><br>
<sub>Crea una raccolta, aggiungi i giochi dal loro menu del tasto destro, poi filtra la libreria con essa</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/collections-panel-800.webp 800w, ../assets/shot/collections-panel.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/collections-panel.png" width="800" height="289" alt="La libreria filtrata su una raccolta Preferiti, con i numeri del profilo che contano solo i suoi giochi" loading="lazy" decoding="async"></picture><br>
<sub>Visualizzare una sola raccolta: il pulsante prende la sua icona e il suo colore, e i totali contano solo i suoi giochi</sub>
</div>

Una raccolta ha un nome, un colore e un'icona o un'immagine tua. **Modifica raccolta…** nel menu del pulsante apre
l'editor, dove puoi anche eliminarla; i suoi giochi restano nella libreria.

<div align="center">
<picture><source srcset="../assets/shot/collection-editor.webp 550w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/collection-editor.png" width="360" height="337" alt="L'editor delle raccolte, con nome, colore, icona e immagine" loading="lazy" decoding="async"></picture><br>
<sub>L'editor delle raccolte</sub>
</div>

### Statistiche della libreria {#library-stats}

Il pulsante rotondo accanto al tasso di completamento nell'intestazione del profilo apre **Statistiche della
libreria**: completamento complessivo, numero di obiettivi sbloccati e bloccati, la media per gioco, il tempo di
gioco medio e quello tracciato, il numero di trofei e una riga per piattaforma. **Mostra solo i giochi installati**
limita i totali a questo PC. La freccia accanto al pulsante riduce l'intestazione del profilo a una sola riga, il
che lascia più spazio alla libreria (**Impostazioni → Aspetto → Profilo** offre la stessa scelta).

<div align="center">
<picture><source srcset="../assets/shot/stats-overview-800.webp 800w, ../assets/shot/stats-overview.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-overview.png" width="800" height="514" alt="Il pannello Statistiche della libreria: completamento complessivo, numero di obiettivi sbloccati e bloccati, media per gioco e tempo di gioco" loading="lazy" decoding="async"></picture><br>
<sub>La panoramica: completamento, conteggi, media per gioco e tempo di gioco</sub>
</div>

**Trofei** conta un platino per ogni gioco completato (un gioco PlayStation una volta ottenuto il suo trofeo di
platino) e classifica ogni altro obiettivo sbloccato in base alla rarità, con le soglie sotto la barra (seguono
l'impostazione della rarità in [Notifiche](notifications.md#trophy-mode)). **Giochi platino** elenca ciò che hai
completato e quando, **Obiettivi più rari** i più difficili che possiedi, e **Tutti gli obiettivi** apre l'elenco completo.

<div align="center">
<picture><source srcset="../assets/shot/stats-trophies-800.webp 800w, ../assets/shot/stats-trophies.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-trophies.png" width="800" height="514" alt="Il numero di trofei, i giochi platino, gli obiettivi più rari e la tabella per piattaforma" loading="lazy" decoding="async"></picture><br>
<sub>Trofei, giochi platino, sblocchi più rari e i totali per piattaforma</sub>
</div>

## Temi {#themes}

**Impostazioni → Aspetto** colora l'intera app e l'overlay di gioco. Sono incluse tredici palette, e ognuna può
essere modificata: scegli un tema e l'editor si apre sui suoi colori, una riga per livello (sfondo della finestra,
barra superiore, pannello della libreria, schede e righe, finestra delle impostazioni, testo, testo attenuato, bordi,
accento). Ogni livello accetta un colore con un'opacità e facoltativamente un gradiente, e i cinque livelli di
superficie possono anche avere un'immagine di sfondo con un adattamento e un velo colorato oppure una sfocatura.

La modifica mostra un'anteprima in tempo reale e non scrive nulla. **Salva tema** ne fa un tema tuo: mantieni il
nome per sostituire quel tema, oppure scrivine un altro per ottenerne un secondo. **Custom…** è lo spazio di prova,
sempre modificabile e mai sovrascritto da un salvataggio fatto a partire da esso. **Reimposta tutto** ripristina il
tema che stai modificando: un tema integrato torna alla sua palette, un tema salvato o importato torna a ciò che
c'è su disco, e Custom torna alla palette predefinita.

**File dei temi** trasforma un tema in un unico file portatile. **Esporta tema…** scrive un `.awtheme` con la
palette, i gradienti, gli effetti e le immagini che hai usato, e nulla sul tuo computer (un'immagine viaggia come
byte, mai come percorso). L'esportazione di un tema integrato viene rifiutata finché non lo salvi con un tuo nome,
perché altrimenti il file verrebbe installato altrove come "Nord" e coprirebbe il Nord già presente. **Importa
tema…** mostra prima l'app disegnata con quel tema, con il suo nome, autore, versione e numero di immagini, e
installa solo dopo la tua conferma. **Elimina tema** rimuove un tema importato insieme alle sue immagini.

Un `.awtheme` contiene solo colori, numeri e immagini, quindi non può eseguire nulla né raggiungere la rete
(vedi [il riferimento al formato](../awtheme-format.md)). I temi creati da altre persone sono nella
[galleria dei temi](../gallery/themes/), e per inviare il tuo basta [un solo file](community-galleries.md). Un semplice file
`*.css` copiato in `%APPDATA%\Achievement Watcher Next\themes` compare comunque nel selettore, ma
non può essere esportato.

## Aiuto e suggerimenti {#help-and-tips}

**Impostazioni → Aiuto** è un riferimento dal vivo, raggruppato in base a come nasce una domanda: **Primi passi**,
**Qualcosa non funziona**, **Giochi emulati** e **Personalizzazione**. Mostra la tua vera scorciatoia da tastiera, la
disposizione e le associazioni del controller, il tema e la modalità di notifica, e si aggiorna mentre cambi le
impostazioni. La sua ricerca ignora maiuscole e accenti, e ogni argomento è disponibile in entrambe le modalità
dell'interfaccia.

## Trova giochi e salvataggi {#find-games-and-saves}

Apri **Impostazioni → Cartelle** e scegli un percorso:

- **Ricerca smart** propone tutto ciò che trova e chiede la tua approvazione prima di aggiungere qualsiasi cosa.
  Riconosce le cartelle delle librerie dal nome ("Games", "Jeux", "Repacks" e i loro equivalenti in una ventina di
  lingue, più "Emulators" ed "Emulation") su ogni unità, e legge ciò che i launcher hanno registrato: i manifest
  di Epic, le voci di registro di GOG Galaxy e Ubisoft Connect e il puntatore che Windows scrive per l'unità scelta
  per i giochi Xbox. Così trova una libreria che porta il nome di uno store (`D:\Epic Games`,
  `D:\XboxGames`) senza scansionare. I giochi di proprietà di un launcher mantengono la propria sorgente. Ricerca smart
  aggiunge tutto il resto che si trova nella stessa cartella, di solito dove finisce un repack o una build Goldberg.
- **Aggiungi una cartella** controlla un percorso che selezioni.
- **Genera configurazioni** esegue una scansione più approfondita e può applicare le opzioni di configurazione
  degli emulatori abilitate.

Se una cartella viene rifiutata, seleziona la directory che contiene direttamente le cartelle dei salvataggi, le cartelle
degli AppID, `steam_settings` o la configurazione dell'emulatore. [Risoluzione dei problemi](troubleshooting.md#a-game-is-missing)
elenca i primi controlli. Quando il nome di una cartella corrisponde a più release di Steam e l'abbinamento è
sbagliato, fai clic con il pulsante destro sul gioco e scegli **Imposta AppID manualmente…** (vedi
[Impostare a mano l'AppID di un gioco](advanced.md#set-a-games-appid-by-hand)).

Gli elenchi degli obiettivi non richiedono alcuna chiave Steam Web API: provengono da endpoint pubblici e sono
messi in cache per lingua, quindi in seguito la libreria funziona anche offline ([come](sources.md#steam-metadata-without-an-api-key)).

## Notifiche {#notifications}

**Impostazioni → Notifiche** imposta la modalità di consegna: **Automatico** (l'opzione predefinita: l'overlay di
gioco quando può essere mostrato, una notifica di Windows o del desktop quando non può, e mai lo stesso sblocco
due volte), **Overlay di gioco**, **Notifica di Windows** oppure **Entrambi**. Se la funzione Non disturbare di
Windows nasconde le notifiche mentre giochi, attiva **Notifiche prioritarie** e approva la richiesta una tantum. I
pulsanti di prova ti permettono di provare tutto prima di avviare un gioco. Vedi [Notifiche](notifications.md) e
[cosa guarda Automatico](notifications.md#how-automatic-decides).

## Controlla un gioco {#check-on-a-game}

Il pulsante **strumenti** di un riquadro di gioco apre il suo pannello **Stato dei giochi**: se AW Next riesce a
vedere il gioco, leggerne gli obiettivi e annunciarne gli sblocchi, e le riparazioni applicabili. È la prima cosa da
aprire prima di segnalare un problema (vedi [Stato dei giochi](game-health.md)). Per rigiocare un gioco da zero, usa
[Reimposta i successi](advanced.md#reset-a-games-achievements), che prima salva un backup di tutto.

## Area di notifica e avvio {#tray-and-startup}

Chiudere la finestra principale mantiene AW Next nell'area di notifica, dove il tracker in background continua a
controllare file e processi per il tempo di gioco e gli sblocchi. Senza finestre aperte restituisce la memoria a
Windows, e la scansione periodica della libreria attende finché un gioco è in esecuzione. **Impostazioni → Avanzate →
Aggiornamenti automatici dei dati sugli obiettivi** disattiva quella scansione per chi gestisce `steam_cache` a mano.
Se AW Next si avvia con Windows e si chiude nell'area di notifica lo decidi in **Impostazioni → Generale**. Per
uscire del tutto, usa il menu dell'area di notifica.

## Aggiornamenti e dati esistenti {#updates-and-existing-data}

Le release installate controllano il feed delle release GitHub del progetto, mai durante una partita. Una nuova versione
viene annunciata da una notifica del desktop e da un'etichetta nella barra del titolo (anche l'icona nell'area di
notifica mostra un puntino blu), e nulla sottrae il focus a un gioco o a un'altra app. L'avviso resta finché non lo
chiudi e ricompare dopo una partita.

Fai clic sulla notifica o sull'etichetta per aprire la finestra di aggiornamento. Mostra le note di rilascio di ogni
versione saltata e la dimensione del download, con **Aggiorna ora**, **Più tardi** e **Salta questa versione**.
Nulla viene scaricato prima della tua scelta. Dopo **Aggiorna ora**, la stessa finestra segue il download, che puoi
annullare o mandare in background. L'etichetta nella barra del titolo mostra lo stato e riporta in primo piano la
finestra. Quando il download termina, il programma di installazione mostra la propria scheda di avanzamento e AW Next
si riavvia. Se un gioco è in esecuzione, l'installazione attende che si chiuda, oppure puoi installare comunque dalla
finestra. **Impostazioni → Controlla aggiornamenti** apre subito la finestra. Gli aggiornamenti scaricano solo ciò
che è cambiato e ripiegano da soli sull'installer completo se questo non riesce. L'AppImage per Linux si aggiorna dalle
stesse release (vedi [Aggiornamenti su Linux](linux.md#updates)).

Una build più recente installata sopra una più vecchia mantiene i tuoi dati in `%APPDATA%\Achievement Watcher Next`:
impostazioni, cartelle controllate, cache, tempo di gioco, log, risorse delle notifiche e dati degli account locali.
Al primo avvio dopo l'aggiornamento, AW Next importa un'installazione precedente:

| Provieni da | Importato da | Che cosa succede |
|---|---|---|
| Achievement Watcher 3.x | `%APPDATA%\Achievement Watcher 3.0` | Impostazioni, preset, temi, copertine, cache, backup e log vengono trasferiti |
| Achievement Watcher 1.6.8 | `%APPDATA%\Achievement Watcher` | Lo stesso, per chi ha saltato la 3.x |
| Un computer nuovo | nulla | AW Next parte con i valori predefiniti |

L'importazione viene eseguita una sola volta, copia i file piccoli, collega con hard link quelli grandi scritti una
sola volta e **non elimina né modifica mai la cartella da cui legge**. Anche i contatori del tempo di gioco
memorizzati nel registro vengono trasferiti, e gli screenshot passano a `Pictures\Achievement Watcher Next` a meno
che tu non abbia scelto una cartella tua.

La disinstallazione offre un'unica opzione, disattivata per impostazione predefinita: **Elimina anche impostazioni,
cache e dati salvati** (oppure `--delete-app-data` in una disinstallazione silenziosa), che rimuove la cartella dei
dati e il tempo di gioco nel registro. Se un aggiornamento continua a fallire sullo stesso file scaricato,
**Impostazioni → Avanzate → Svuota cache** elimina solo le cache riscaricabili (file di aggiornamento, schemi e icone
di Steam e Ubisoft, strumenti di correzione degli emulatori). Impostazioni, salvataggi e backup restano.

---

**Avanti:** [Sorgenti compatibili](sources.md): che cosa può leggere AW Next e di che cosa ha bisogno ogni sorgente.

*Salta avanti se sai già che cosa ti serve: [Notifiche](notifications.md) ·
[Stato dei giochi](game-health.md) · [Configurazione Goldberg / GBE](emulator-setup.md) ·
[Risoluzione dei problemi](troubleshooting.md)*

<div align="center">

[← Documentazione](README.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
