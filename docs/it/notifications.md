---
title: "Notifiche e popup degli obiettivi"
description: "Popup dell'overlay o notifiche di Windows: modalità di consegna, Automatico, suoni, posizione, modalità trofei, OBS, screenshot ricordo e clip video."
---

# Notifiche e popup degli obiettivi

AW Next annuncia uno sblocco con una notifica nativa di Windows (toast), un popup dell'overlay di gioco oppure
entrambi. Scegli come in **Impostazioni → Notifiche**.

Su Linux la notifica è quella del desktop stesso (GNOME o KDE) e l'overlay funziona allo stesso modo.
Non disturbare e l'interruttore Notifiche prioritarie sono trattati in [Desktop supportati](linux.md#supported-desktops).

<div align="center">
<picture><source srcset="../assets/shot/notifications-panel-800.webp 800w, ../assets/shot/notifications-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notifications-panel.png" width="720" height="529" alt="Impostazioni - Notifiche"></picture><br>
<sub>Una modalità di consegna, un preset - Automatico gestisce il resto</sub>
</div>

## Scegli una modalità di consegna {#choose-a-delivery-mode}

| Modalità | Comportamento |
|---|---|
| **Automatico** (predefinito) | L'overlay di gioco quando può essere mostrato, una notifica di Windows quando non può. |
| **Overlay di gioco** | Sempre il popup stilizzato sopra il gioco in esecuzione, anche a schermo intero esclusivo, dove potrebbe non essere visibile. Se l'overlay non riesce a mostrarsi affatto, quella notifica arriva come notifica di Windows. |
| **Notifica di Windows** | Sempre la notifica di sistema di Windows. Le notifiche di obiettivi e avanzamento usano l'icona dell'obiettivo; le notifiche del tempo di gioco possono includere la grafica del gioco e una barra di avanzamento. |
| **Entrambi** | Lo stesso evento su entrambi i canali. |

AW Next pubblica da solo le notifiche di Windows e non avvia nessun altro programma, PowerShell compreso, quindi
compaiono subito. Un app id personalizzato impostato in `options.ini` (`[notification_advanced] appID`) passa
ancora per il vecchio percorso PowerShell.

La finestra della libreria può restare chiusa in ogni modalità: il tracker in background gestisce la consegna.

<div align="center">
<picture><source srcset="../assets/shot/notification-popup.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup.png" width="440" height="126" alt="Un popup di sblocco" loading="lazy" decoding="async"></picture><br>
<sub>Il popup dell'overlay, disegnato dal preset selezionato con la grafica del gioco stesso</sub>
</div>

Qualunque sia la modalità, **Websocket @localhost:8082** trasmette ogni evento di notifica come JSON su un
websocket locale, per gli overlay dello streaming e altri strumenti. È attivo per impostazione predefinita, ascolta solo su `127.0.0.1`
e non mostra nulla da solo. Disattivalo se non lo usi. Lo stesso indirizzo serve un overlay per lo streaming già pronto:
vedi [Mostra gli sblocchi in streaming (OBS)](#show-unlocks-on-stream-obs).

> [!TIP]
> Usa i pulsanti di prova dopo aver cambiato la modalità. Una prova riuscita conferma il percorso di visualizzazione; uno
> sblocco reale dipende comunque dal fatto che la sorgente del gioco sia osservata correttamente.

### Come decide Automatico {#how-automatic-decides}

Ogni notifica viene instradata una sola volta, in base a ciò che AW Next può osservare in quel momento:

| Situazione | Che cosa succede |
|---|---|
| Nulla copre lo schermo | Overlay di gioco. |
| Il gioco è a **schermo intero** (Direct3D con le ottimizzazioni a schermo intero di Windows, che la maggior parte dei giochi ha) | Notifica di Windows, mostrata sopra il gioco senza sottrargli il focus: una notifica prioritaria quando sono attive, altrimenti un promemoria che AW Next chiude dopo il consueto tempo di notifica. I giochi senza bordi e in finestra mantengono l'overlay. |
| Il gioco occupa lo schermo in **modalità esclusiva legacy** (giochi più vecchi, molti giochi OpenGL o ottimizzazioni a schermo intero disattivate) | Nulla di un'altra app viene disegnato su quello schermo. La notifica va nel Centro notifiche; il suo suono e la vibrazione del controller vengono comunque riprodotti. La modalità senza bordi nel gioco la riporta sullo schermo. |
| L'app non può mostrare il popup (nessun preset utilizzabile, renderer non disponibile) | Una notifica di Windows. |
| L'overlay non riesce a mostrarsi | Notifiche di Windows per dieci minuti, poi l'overlay viene riprovato. |
| L'overlay è stato richiesto ma non ha mai risposto | Nessuna seconda notifica, per evitare un duplicato. Lo sblocco successivo usa una notifica di Windows. |

AW Next ricorda quale canale ha consegnato per ultimo per ogni gioco e lo usa solo come criterio di spareggio quando
Windows non sa dire se un gioco è a schermo intero esclusivo. Un ripiego avviene solo dopo un fallimento certo, quindi
lo stesso sblocco non viene mai annunciato due volte. AW Next non si inietta nei giochi né forza cambi
di modalità di visualizzazione.

### Dove viene mostrato lo stato attuale {#where-the-current-state-is-shown}

Il pannello **Stato dei giochi** di un gioco ha una riga Notifiche che indica il canale che ha consegnato l'ultima
notifica e perché, per esempio *Funziona - ripiego su Windows attivo* (modalità Semplice). Se non c'è ancora
nessuna notifica mostra la modalità configurata. Se Windows ha tenuto una notifica nel Centro notifiche
perché il gioco era a schermo intero o Non disturbare era attivo, la riga lo dice. Vedi
[Stato dei giochi](game-health.md).

## Notifiche prioritarie di Windows {#priority-windows-notifications}

I giochi a schermo intero e altre regole automatiche di Windows possono attivare **Non disturbare**, che invia
i toast ordinari al Centro notifiche senza mostrarli. **Impostazioni → Notifiche → Notifiche
prioritarie** contrassegna gli sblocchi degli obiettivi come importanti. Windows chiede una volta se AW Next può inviarle;
cambia la risposta nelle impostazioni di notifica di Windows.

È disattivato per impostazione predefinita e riguarda solo gli sblocchi di obiettivi e di completamento, mai l'avanzamento o il tempo di gioco.
Il toast usa lo scenario `urgent`, che richiede Windows 11 (build 22546) o successivo; su Windows 10
l'impostazione non fa nulla. Vedi [la documentazione Microsoft sulle notifiche delle app](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content).

## Giochi gestiti da Steam {#games-steam-runs}

Steam mostra un proprio pop-up per i giochi che avvia, quindi AW Next per impostazione predefinita resta in silenzio per quelli. Attiva
**Impostazioni → Notifiche → Giochi del client Steam** per ricevere anche la notifica di AW Next, con il suo suono,
overlay, rarità e screenshot ricordo. Copre i giochi posseduti e quelli aggiunti tramite SteamTools,
LuaTools o GreenLuma: AW Next segue il file delle statistiche che Steam riscrive in `appcache\stats`. Per mantenere
solo la notifica di AW Next, disattiva **Steam → Impostazioni → Notifiche → Sblocco un obiettivo**.

## Come appare il popup {#how-the-popup-looks}

L'aspetto del popup di gioco è un **preset**: dieci sono inclusi nell'app, puoi crearne di tuoi e un
preset può essere condiviso come un unico file `.awpreset`. Vedi [Preset e Preset Designer](presets.md).
**Opacità** (dal 30% al 100%) nelle stesse impostazioni stabilisce quanto è trasparente il popup.

## Suoni, volume e durata {#sounds-volume-and-duration}

- Importa file `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a` o `.aac` dalle impostazioni delle Notifiche.
- **Casuale** nell'elenco dei suoni riproduce un file diverso dei tuoi a ogni notifica e a ogni
  anteprima o prova.
- **Suono per obiettivo raro** e **Suono di completamento al 100%** (modalità Avanzata) danno a quei popup un suono
  proprio, per l'overlay e per le notifiche di Windows. Entrambi partono da "Come gli sblocchi"; "Nessuno" rende
  silenzioso quel tipo di popup. Un suono scelto per un gioco nel suo pannello ha comunque la precedenza.
- **Suono dell'avanzamento** (modalità Avanzata) fa lo stesso per i popup di avanzamento. Ha la precedenza sul suono
  proprio di un gioco, tranne per un gioco impostato senza suono. Per silenziare i popup di avanzamento di un gioco, fai clic con il pulsante destro su di esso e
  disattiva il suo avanzamento.
- **Emulatori** (modalità Avanzata) dà a ogni console il proprio preset e suono: sono elencati Xenia, RPCS3, shadPS4 e
  Kyty. I giochi Xbox 360 ricompilati seguono la scelta di Xenia, i port PS4 quella di shadPS4, e
  **Come il principale** mantiene le impostazioni principali.
- Il volume dell'overlay va dallo 0% al 200%; oltre il 100% l'overlay amplifica il suono. La riproduzione delle notifiche
  di Windows è limitata dal percorso audio del sistema.
- La durata segue il preset oppure usa un limite fisso.
- Le notifiche del tempo di gioco sono silenziose.

Un preset condiviso può portare con sé un proprio suono, che sostituisce quello selezionato qui. Vedi
[Condividere un preset](presets.md#share-a-preset).

## Posizione e scala {#position-and-scale}

Scegli una posizione ad angolo, sul bordo o centrata nelle impostazioni delle Notifiche. Le posizioni sono misurate
rispetto all'intero schermo, quindi un ancoraggio in basso si trova sul bordo inferiore, non sopra la barra delle applicazioni, e la
scheda tocca i bordi scelti qualunque sia lo spazio per ombra o bagliore che il suo preset lascia intorno. AW
misura ogni preset una volta per posizione, in background dopo il suo primo popup, quindi quel primo popup
compare nel vecchio punto. Un preset la cui scheda segue la lunghezza del testo (PS5 Steam, Slim)
viene misurato a ogni popup, il che lo ritarda di circa mezzo secondo.

**Riposiziona** sposta la posizione personalizzata, usata esattamente come l'hai lasciata; una salvata su un monitor
non più presente viene riportata in vista. Con più schermi, il popup compare sullo schermo del gioco
a cui stai giocando, non su quello sotto il mouse, e una posizione personalizzata mantiene il proprio posto rispetto a quello
schermo. Le notifiche di Windows compaiono sempre sullo schermo principale.

L'impostazione della scala ridimensiona l'intero popup senza cambiarne la disposizione, e **Riposiziona** ne mostra
l'anteprima a quella scala.

### Popup di avanzamento {#progress-popups}

Gli obiettivi a contatore (uccidi 50 nemici, percorri 100 km) possono generare un popup di avanzamento a ogni passo. In
modalità Avanzata, **Posizione avanzamento** e **Dimensione avanzamento** danno a quei popup un posto e una
dimensione propri. **Come gli sblocchi**, l'opzione predefinita, segue la posizione propria di un gioco quando ne ha una; qualsiasi altra
scelta si applica ai popup di avanzamento di ogni gioco. Il mirino accanto a **Posizione avanzamento** colloca
un ancoraggio personalizzato solo per l'avanzamento. Queste impostazioni spostano solo il popup di gioco.

**Tappe di avanzamento**, nelle impostazioni comuni delle notifiche, mostra una notifica di avanzamento solo quando
un contatore supera un altro 10, 25 o 50% del suo obiettivo. Si applica al popup e alla notifica
di Windows. Lo sblocco vero e proprio viene sempre mostrato.

L'elenco dell'overlay ha proprie scorciatoie da tastiera (vedi la
[guida all'overlay](overlay.md#keyboard-shortcuts-overlay-open)) e un controllo facoltativo con gamepad (vedi la
[guida al controller](controller.md)).

## Comportamento per singolo gioco {#per-game-behavior}

Apri il pannello degli strumenti di un gioco e scegli **Notifica** per dare a quel gioco un proprio preset del popup,
posizione, suono o scala. Ogni campo eredita l'impostazione globale, e vengono memorizzati solo i valori che
modifichi; il suono offre anche il silenzio e il casuale. Il mirino accanto a Posizione trascina un'anteprima fino al punto in cui
dovrebbe comparire il popup di quel gioco. I cinque pulsanti di prova mostrano l'anteprima di quel gioco e della sua grafica senza
cambiare l'avanzamento degli obiettivi. Un preset o un suono rimosso ripiega sul valore globale, e rinominare
un preset utente ne conserva le assegnazioni ai giochi.

Fai clic con il pulsante destro su un gioco per silenziare le sue notifiche di avanzamento mantenendo quelle di sblocco e di
completamento.

Un obiettivo con una percentuale di sblocco globale pari o inferiore al limite di rarità stampa la sua percentuale e ottiene
lo stile raro del preset: **oro** al 5% o meno, **argento** fino al 10%, **bronzo** fino al 15%. Sposta
questi limiti con **Impostazioni → Generale → Soglie di rarità** impostate su Personalizzato (modalità Avanzata).

### Modalità trofei {#trophy-mode}

**Impostazioni → Generale → Visualizzazione della rarità** passa alla **Modalità trofei**: ogni obiettivo viene classificato in base alla
sua percentuale di sblocco globale (oro sotto il 20%, argento sotto il 50%, bronzo altrimenti o quando la percentuale è
sconosciuta) nella finestra del gioco, nell'overlay, nei trofei del profilo e nella notifica. Le **Soglie di
rarità** spostano i limiti. Tutti e tre i gradi usano lo stile raro del preset (`state-rare` più
`tier-gold`, `tier-silver` o `tier-bronze`); il platino resta lo stato di completamento separato. L'app
dà a un preset il suo grado in `rarityTier` (con `rarityMode` e il `rarityGrade` localizzato); un preset
senza il campo ripiega sulla percentuale.

Con un account PlayStation collegato (**Impostazioni → Sorgente**), un gioco uscito anche su
PlayStation usa il suo vero elenco di trofei, da qualunque sorgente provengano i suoi obiettivi: ogni obiettivo prende il
grado e il gruppo di DLC del trofeo con lo stesso nome o la stessa descrizione. Il vero platino compare in ogni
modalità di rarità (pagina del gioco, statistiche, popup del 100%) con nome, descrizione e icona, e conta una volta ottenuto
quel trofeo, anche con trofei di DLC ancora da ottenere. Gli emulatori PlayStation mantengono i propri trofei. AW
trova l'elenco dal nome originale del gioco, quindi rinominare un gioco non cambia nulla.

Ogni sorgente mostra il popup del 100%, comprese quelle in tempo reale (Xenia, port ricompilati, GOG Galaxy,
Ubisoft Connect, Xbox PC). Quando il gioco ha un platino, l'obiettivo legato ad esso compare come
platino.

<div align="center">
<picture><source srcset="../assets/shot/trophy-profile.webp 640w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/trophy-profile.png" width="440" height="148" alt="L'intestazione del profilo con i conteggi dei trofei platino, oro, argento, bronzo e comuni" loading="lazy" decoding="async"></picture><br>
<sub>Il profilo conta ogni sblocco per grado, con il platino per i giochi completati</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/trophy-game-panel.webp 800w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/trophy-game-panel.png" width="560" height="672" alt="La pagina di un gioco in cui ogni obiettivo è classificato oro, argento o bronzo" loading="lazy" decoding="async"></picture><br>
<sub>Nella pagina di un gioco ogni obiettivo porta il proprio grado e la percentuale di giocatori che lo hanno</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/notification-popup-trophy.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup-trophy.png" width="440" height="126" alt="Un popup di sblocco disegnato nello stile oro" loading="lazy" decoding="async"></picture><br>
<sub>Uno sblocco oro nel preset di AW Next</sub>
</div>

## Mostra gli sblocchi in streaming (OBS) {#show-unlocks-on-stream-obs}

Catturare il popup come finestra non funziona: la finestra del popup vive pochi secondi, quindi OBS non
la prende mai. Usa una sorgente **Browser**, che OBS tiene caricata per l'intero streaming.

1. **Impostazioni -> Notifiche -> Sorgente browser OBS.** **Anteprima** apre la pagina nel tuo browser
   con uno sblocco di esempio ogni dieci secondi, il modo più rapido per verificare che la catena funzioni. **Copia link**
   copia l'indirizzo.
2. In OBS: **+ -> Browser**, incolla l'indirizzo in **URL**.
3. Imposta una **Larghezza** e un'**Altezza** qualsiasi. La scheda si ridimensiona per riempire il riquadro.

La sorgente mostra lo stesso preset, la stessa grafica e lo stesso stile di rarità del popup di gioco e segue il
preset che scegli nelle Impostazioni. I pulsanti di prova sotto **Impostazioni -> Notifiche** vi scrivono dentro anche,
qualunque sia la modalità di consegna.

> [!TIP]
> **Una sorgente più grande dà una scheda più nitida.** La scheda viene impaginata alla dimensione della sorgente, non allungata.
> Dai alla sorgente circa il doppio del riquadro del preset e posizionala a metà dimensione nella tua scena:
> `http://127.0.0.1:8082/obs/_config` riporta entrambi i numeri. Solo l'icona dell'obiettivo resta sfocata,
> perché Steam la pubblica a 64x64.

### Opzioni {#options}

Aggiungile all'indirizzo, `?first=x&then=y`:

| Opzione | Effetto |
|---|---|
| `?test=1` | Ripete uno sblocco di esempio ogni dieci secondi, per posizionare la sorgente. Rimuovila dopo. |
| `?scale=2` | Fissa la scheda a quello zoom invece di adattarla alla sorgente. `?scale=app` segue la scala impostata nelle Impostazioni. |
| `?duration=8000` | Tiene ogni scheda per quel numero di millisecondi invece della durata configurata. |
| `?sound=1` | Riproduce il suono della notifica tramite la sorgente browser, così arriva allo streaming senza catturare l'audio del desktop. Disattivato per impostazione predefinita, perché l'app lo riproduce già sui tuoi altoparlanti. Spunta **Controlla l'audio tramite OBS** sulla sorgente per inserirlo nel mix. |
| `/obs/preset/Xbox/` | Usa un solo preset con nome per lo streaming, qualunque sia quello impostato sul desktop. Funziona qualsiasi nome di preset installato, compresi i tuoi. |

### Note {#notes}

- La pagina è vuota tra uno sblocco e l'altro per scelta: non viene disegnato nulla, quindi non costa CPU finché non compare un
  obiettivo.
- È solo locale. La pagina e il feed ascoltano su `127.0.0.1`, quindi nient'altro sulla tua rete può
  raggiungerli.
- Le icone degli obiettivi vengono servite da questa macchina per le sorgenti che tengono la grafica in locale
  (Goldberg, emulatori, la grafica della tua libreria), e solo per le immagini che una notifica ha annunciato.
- Una sola copia di AW Next serve l'indirizzo: quella partita per prima. Una seconda istanza, o qualsiasi altra cosa
  sulla porta 8082, lascia la sorgente senza nulla a cui connettersi. Chiudi la copia in più e la sorgente
  si riconnette nel giro di pochi secondi.
- Se la sorgente resta vuota su uno sblocco reale, controlla che i pulsanti di prova funzionino, poi che la riga
  **Websocket** sia attiva.

## Obiettivi nelle pagine della libreria di Steam {#achievements-on-steams-library-pages}

Steam non mostra obiettivi nella pagina di un collegamento non-Steam. Un plugin per Steam (Millennium sul
desktop, Decky in Game Mode) può chiedere ad AW Next gli obiettivi di quel collegamento sullo stesso feed locale,
`ws://127.0.0.1:8082`, e disegnarli da sé. AW Next risponde per un gioco alla volta: il plugin deve
indicarlo, e la risposta non contiene cartelle, account né nomi di sorgenti.

Il plugin Millennium di AW Next, nella cartella `millennium/` del repository, lo fa per ogni
collegamento che AW Next riconosce: la pagina del gioco mostra allora la sezione Obiettivi di Steam stessa, il contatore
nella barra di gioco, l'elenco completo e la scheda "Le tue cose" di Big Picture. Un collegamento viene abbinato al meglio quando
avvia lo stesso exe dell'**Eseguibile** del gioco in AW Next. Il suo README descrive l'installazione, che cosa
controllare quando una pagina resta vuota e come convive con Steam Cartridges, NativeGameLink e Game
Data Linker. L'estensione Playnite in `playnite/` chiede nello stesso modo, per qualsiasi gioco di una libreria
Playnite, e il suo README descrive l'installazione e i pannelli che un tema può collocare. La richiesta qui sotto è
per chi scrive un altro plugin.

Il plugin invia:

```json
{ "cmd": "bridge-game", "id": "r1", "exe": "D:\\Games\\Pinyon Shift\\pinyon_shift.exe", "launchOptions": "", "steamAppId": 0, "name": "Forza Horizon" }
```

Ogni campo tranne `cmd` è facoltativo, e ognuno che aggiunge aiuta. AW Next li prova in quest'ordine: l'exe
che la libreria ha trovato per un gioco, una cartella di gioco o una ROM indicata nelle opzioni di avvio (un
collegamento a un emulatore), un AppID Steam, un launcher nella cartella del gioco, il nome del file exe, poi il titolo esatto.
Quando un passaggio corrisponde a più di un gioco, AW Next risponde "non trovato".

La risposta:

```json
{ "cmd": "bridge-game", "id": "r1", "bridge": 1, "found": true,
  "game": { "id": "x360-4D5309C9", "name": "Forza Horizon", "total": 50, "unlocked": 12,
    "achievements": [{ "id": "1", "name": "...", "description": "...", "icon": "https://...", "iconLocked": "https://...",
      "hidden": false, "rarity": 12.5, "unlocked": true, "unlockedAt": 1790000000 }] } }
```

- `unlockedAt` è in secondi Unix. `rarity` e `progress` (`{ "current": 6, "max": 50 }` su un
  obiettivo bloccato in parte completato) ci sono solo quando AW Next li conosce.
- Un'icona memorizzata su questo PC arriva come indirizzo `http://127.0.0.1:8082/bridge/icon/...`.
- L'elenco è la libreria come l'ha vista l'ultima scansione, più gli sblocchi annunciati da allora. Gli sblocchi
  arrivano comunque sul feed: quando uno porta l'`id` del gioco in `appID`, chiedi di nuovo per aggiornare la pagina.
- Il plugin si connette dalle pagine di Steam stesso (`https://steamloopback.host`) o da un processo nativo;
  i siti web vengono rifiutati. Se è impostata una password del websocket, serve la stessa password.
- Non dovrebbe connettersi come `?client=decky`: quel nome dice ad AW Next che Steam mostra le proprie
  notifiche, e AW Next allora tiene disattivato il proprio popup.

## Screenshot ricordo {#screenshot-souvenirs}

**Screenshot allo sblocco** salva un'immagine dello schermo un attimo dopo che compare un obiettivo, una volta che il
popup ha finito di apparire, così la notifica è nello scatto. I file finiscono in
`<folder>\<game>\<achievement> - <date>.png`, con la data nell'ora locale del PC. **Apri cartella** nella stessa riga la apre, creandola
prima se serve. La cartella predefinita è `Pictures\Achievement Watcher Next` e può essere cambiata.

Gli obiettivi sbloccati nello stesso secondo mantengono ciascuno il proprio file, e un gioco il cui titolo Windows
rifiuta come nome di cartella ottiene comunque i suoi screenshot. Con più monitor lo screenshot ricordo cattura
il monitor su cui si trova il gioco, come le clip video; senza una finestra di gioco visibile, prende il monitor
della finestra in primo piano, poi quello principale.

### Giocare con HDR di Windows attivo {#playing-with-windows-hdr-on}

**Screenshot HDR** è impostato per impostazione predefinita su **Automatico**. Al momento della cattura, AW Next verifica se l'HDR è attivo
sul display che mostra il gioco. In tal caso, un helper monouso cattura un fotogramma FP16 tramite Windows
Graphics Capture e applica il tone mapping alle alte luci in un PNG SDR/sRGB, poi termina. Con l'HDR disattivato,
**Automatico** e **No** usano la cattura standard. Qualsiasi errore dell'helper (supporto di Windows mancante, una
cattura bloccata, un timeout) ripiega anch'esso sullo screenshot standard, così il ricordo e la
notifica non vanno persi.

## Clip video {#video-clips}

**Clip video allo sblocco** funziona come il video dei trofei di una console. Mentre un gioco tracciato da AW Next è in esecuzione,
gli ultimi secondi di gioco vengono tenuti in memoria, già compressi dall'encoder video della scheda grafica.
Quando compare un obiettivo, il tratto intorno ad esso viene salvato come MP4 in
`<folder>\<game>\<achievement> - <date>.mp4`, con il popup nel mezzo. La cartella è
`Videos\Achievement Watcher Next` a meno che tu non ne scelga un'altra. Gli obiettivi sbloccati a breve distanza
condividono una sola clip.

| Impostazione | Scelte | Predefinito |
|---|---|---|
| Durata della clip | Da 10 a 60 secondi | 20 s |
| Prima dello sblocco | Da 0 secondi all'intera clip. Alzalo se le notifiche arrivano in ritardo nei giochi pesanti | Metà della clip |
| Formato | H.264, HEVC o AV1, salvato come MP4 | H.264 |
| Risoluzione | Schermo, 2160p, 1440p, 1080p o 720p, mai oltre lo schermo | 1080p |
| Frequenza fotogrammi | 30 FPS, 60 FPS o Sbloccata, che segue il tuo schermo (120, 144, 240 Hz) | 30 FPS |
| Qualità | Bassa, Media o Alta | Media |
| Audio | Solo il gioco, oppure l'intero PC | Solo il gioco |

<div align="center">
<picture><source srcset="../assets/shot/video-clip-panel-800.webp 800w, ../assets/shot/video-clip-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/video-clip-panel.png" width="720" height="529" alt="Impostazioni, Notifiche: la sezione Clip video con il suo interruttore di attivazione" loading="lazy" decoding="async"></picture><br>
<sub>La sezione Clip video si trova in fondo alla scheda Notifiche ed è disattivata finché non la attivi</sub>
</div>

La riga sotto la tabella stima la dimensione di una clip per il tuo schermo. È un limite massimo: l'encoder
lavora a bitrate costante e una scena tranquilla produce un file più piccolo.

- **Costo.** Nulla è in esecuzione finché non lo è un gioco. Cattura, scalatura e codifica restano sulla GPU, su un
  blocco encoder separato da quello che renderizza il gioco. Il registratore usa ben meno dell'1 % della CPU
  e da 70 a 110 MB di memoria circa più una clip. Nulla viene scritto su disco finché un obiettivo
  non si sblocca.
- **Formato.** H.264 si riproduce ovunque, Discord e telefoni compresi. HEVC e AV1 producono file più piccoli.
  AV1 richiede una GeForce RTX 40, Radeon RX 7000, Intel Arc o successive; senza il formato scelto la clip
  viene registrata in H.264. Una scheda senza encoder H.264 hardware usa l'encoder software di Windows, sul
  processore, a 1080p e 30 FPS al massimo.
- **Frequenza fotogrammi.** **Sbloccata** registra alla frequenza di aggiornamento del monitor che mostra il gioco e
  la segue quando cambia. Se l'encoder rifiuta una frequenza, il registratore scende a 60, poi a 30
  FPS, e lo scrive nel log. La stima della dimensione presuppone il doppio del bitrate a 30 FPS per Sbloccata.
- **Se il registratore smette di rispondere.** AW Next lo riavvia dopo un'attesa che raddoppia a ogni volta, e
  rinuncia per un gioco dopo cinque riavvii falliti. Una clip la cui scrittura fallisce a metà viene tenuta se ciò che
  è stato scritto si riproduce, altrimenti rimossa. Una clip lasciata a metà da un PC che si è spento viene ripulita
  la volta successiva in cui viene registrato un gioco.
- **HDR.** Con l'HDR di Windows attivo, le clip vengono sottoposte a tone mapping come gli screenshot HDR; **Screenshot HDR** impostato su
  **No** vale anche per le clip.
- **Audio.** **Solo il gioco** esclude la chat vocale e la musica. Se l'audio del gioco non può essere registrato
  da solo, viene registrato l'intero PC.
- **Che cosa viene catturato.** Il monitor che mostra il gioco, notifiche comprese. Un gioco molto vecchio a schermo
  intero esclusivo può registrare fotogrammi neri.

## Rivedere un ricordo {#seeing-a-souvenir-again}

Fai clic con il tasto destro su un obiettivo sbloccato nell'app e scegli **Mostra screenshot** o **Mostra clip**
per aprirlo in un visualizzatore, con gli altri file dello stesso obiettivo a portata di clic e **Mostra nella
cartella** per trovare il file. Nell'overlay in gioco, i piccoli pulsanti sotto **Sbloccato** aprono lo stesso
visualizzatore; con un controller, sinistra e destra scorrono, A riproduce una clip e B la chiude.

AW Next annota quale file appartiene a quale obiettivo nel momento in cui lo prende in carico, quindi rinominare il
gioco o cambiare la lingua dell'app non fa perdere il collegamento. Gli screenshot e le clip fatti prima di questa
versione si trovano dal nome del file, nelle cartelle impostate sopra.

## Se una prova o uno sblocco non compare {#if-a-test-or-unlock-does-not-appear}

1. Conferma che le notifiche siano attive e leggi la riga Notifiche del pannello
   **[Stato dei giochi](game-health.md)** del gioco.
2. Controlla che il tracker in background sia in esecuzione.
3. Per gli overlay, seleziona un preset valido e riprova fuori da un gioco a schermo intero esclusivo.
   **Automatico** gestisce già entrambi i casi.
4. Se un gioco a schermo intero o Non disturbare nasconde le notifiche di Windows, attiva **Notifiche
   prioritarie** e approva la richiesta una tantum di Windows.
5. Controlla le impostazioni di notifica di Windows per AW Next.
6. Apri **Impostazioni → Avanzate → Diagnostica** e controlla i log.

Se il problema persiste, continua con [Risoluzione dei problemi](troubleshooting.md#notifications-do-not-appear).

---

**Avanti:** [Preset e Preset Designer](presets.md) - l'aspetto del popup e come crearne uno
tuo.

<div align="center">

[← Documentazione](README.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
