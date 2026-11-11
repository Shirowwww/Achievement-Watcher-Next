---
title: "Sorgenti compatibili"
description: "Tutte le sorgenti di giochi che Achievement Watcher Next legge - Steam, GOG, Epic, Ubisoft, EA, Xbox PC, emulatori e RetroAchievements - e di che cosa ha bisogno ciascuna."
---

# Sorgenti compatibili

Una **sorgente** è un luogo da cui AW Next legge gli obiettivi: i dati locali di un launcher, un file di
salvataggio compatibile con Steam o il file dei trofei di un emulatore di console. Ogni sorgente ha un proprio
interruttore in **Impostazioni → Sorgente**.

AW Next legge Steam, GOG Galaxy, Ubisoft Connect, Epic Games, Xbox PC, il registro locale degli obiettivi di
EA Desktop, RetroAchievements, gli emulatori di console e i file di salvataggio degli emulatori Steam come Goldberg,
GBE Fork, CODEX, RUNE e CPY. Non richiede alcuna chiave Steam Web API né alcun account.

<div align="center">
<picture><source srcset="../assets/shot/sources-panel-800.webp 800w, ../assets/shot/sources-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/sources-panel.png" width="720" height="529" alt="Impostazioni - Sorgenti dei giochi"></picture><br>
<sub>Ogni sorgente ha un interruttore separato; lo scudo contrassegna le librerie desktop ufficiali</sub>
</div>

Dopo aver attivato una sorgente, aggiorna la libreria. Vengono mostrate solo le librerie rilevate su questo PC.

## Librerie ufficiali delle piattaforme {#official-platform-libraries}

Leggono i dati locali del launcher stesso e portano uno scudo nelle Impostazioni.

| Sorgente | Che cosa legge AW Next | Di che cosa ha bisogno |
|---|---|---|
| **Steam** | Lo stato locale dell'appcache, i dati del profilo pubblico, gli schemi degli obiettivi e i metadati dei prodotti | Steam installato; collegare un account è facoltativo |
| **GOG Galaxy** | I database locali del client Galaxy, più i salvataggi legacy compatibili e UniverseLAN | GOG Galaxy installato, oppure un gioco che usa UniverseLAN |
| **Ubisoft Connect** | I dati locali nativi e i formati Uplay legacy | Ubisoft Connect installato |
| **Epic Games** | Le installazioni locali, più i giochi posseduti dall'account e il loro stato ufficiale degli obiettivi una volta collegato | Il launcher di Epic Games per le installazioni locali; il collegamento dell'account per il resto |
| **Xbox PC** | Le installazioni locali di Game Pass e Microsoft Store, più i giochi posseduti dall'account e il loro stato su Xbox Network | L'app Xbox per le installazioni locali; il collegamento dell'account per il resto |
| **Rockstar Games Launcher** | I giochi che ha installato, con l'elenco degli obiettivi della loro versione Steam | Il Rockstar Games Launcher installato |

**Steam**, **Epic Games** e **Xbox PC** hanno ciascuno tre impostazioni: **Nessuno**, **Installati** (i giochi su
questo PC) oppure **Posseduti** (l'intera libreria dell'account). **Posseduti** elenca anche i giochi non
installati qui e richiede il collegamento dell'account descritto sotto. **GOG Galaxy** offre **Nessuno**, **Installati**
oppure **Giocati**: Galaxy conserva i dati di gioco di un titolo anche dopo la disinstallazione, e **Giocati** elenca
comunque quei giochi.

**Librerie Steam**, sotto la scheda dell'account Steam, elenca tutte le cartelle delle librerie Steam presenti su
questo PC. Disattivane una e i suoi giochi escono dall'elenco, tutti quanti, per esempio un'unità che tieni
collegata come archivio. Tornano quando la riattivi.

> [!NOTE]
> Gli sblocchi di Steam vengono letti dalle statistiche che Steam conserva su questo PC. Un profilo privato, oppure
> **Dettagli del gioco** privati, funziona per ogni gioco giocato qui, compresi i giochi aggiunti tramite SteamTools,
> LuaTools o GreenLuma, e una scheda si aggiorna nel momento in cui Steam registra uno sblocco. Un profilo pubblico
> aggiunge soltanto il tuo nome e il tuo avatar. I giochi giocati solo su un altro PC richiedono il collegamento
> dell'account descritto sotto. Questi sblocchi generano una notifica di AW Next una volta attivato **Giochi del
> client Steam** sotto Notifiche (vedi
> [Notifiche](notifications.md#games-steam-runs)).

> [!NOTE]
> **EA Desktop** è diverso: legge il registro locale degli obiettivi di EA Desktop per i giochi fuori dalle cartelle
> gestite da EA, e non importa la tua normale libreria EA.

> [!NOTE]
> I giochi del **Rockstar Games Launcher** mostrano tutti gli obiettivi bloccati. Social Club salva quelli che hai sbloccato in un file cifrato con la chiave del tuo account, che AW Next non sa ancora leggere.

### Account collegati {#connected-accounts}

Steam, Epic, Xbox PC e PlayStation possono essere collegati dalle Impostazioni per leggere ciò che i file locali
non contengono. Ogni token viene cifrato prima di essere salvato su questo PC, e tutto il resto funziona
senza alcun account.

| Account | Che cosa aggiunge il collegamento |
|---|---|
| **Steam** | Due interruttori, disattivati per impostazione predefinita e mostrati quando la sorgente Steam è su **Posseduti**: **aggiungi i giochi che possiedi** e **aggiungi i giochi condivisi con te tramite Steam Family**. Permettono a un profilo privato, o a uno che non ha mai installato qui la maggior parte della libreria, di elencare i giochi giusti. Ognuno rende la prima scansione sensibilmente più lunga, perché ogni gioco aggiunto risolve una volta i suoi obiettivi e la sua grafica. Un gioco senza nulla da leggere in locale viene poi letto dal tuo profilo Steam, che richiede i dettagli del gioco pubblici; la risposta resta in cache per sei ore. **Nascondi i giochi che non sono più nella tua libreria Steam** rimuove gli avanzi, ma mai un gioco installato qui o condiviso tramite Steam Family. L'accesso avviene sulla pagina di Valve. |
| **Epic Games** | I tuoi obiettivi sbloccati e, con **Posseduti**, l'intera libreria: ogni gioco con il suo elenco completo, lo stato di sblocco e la rarità. Alcuni giochi posseduti hanno obiettivi che i dati dello store di Epic non elencano mai (Shadow of the Tomb Raider, Civilization VI). Vengono comunque elencati, dai games-infos-datas di Nemirtingas, ma senza stato di sblocco, che Epic non condivide nemmeno con l'accesso effettuato. Nomi, descrizioni e rarità di un gioco installato funzionano senza account. |
| **Xbox PC** | Stato di sblocco e rarità da Xbox Network per la tua libreria, messi in cache in locale. Con **Posseduti** porta anche i giochi che l'account ha giocato solo altrove. |
| **PlayStation** | I tuoi giochi PlayStation e i trofei, con la percentuale ufficiale di Sony per ciascun trofeo, aggiornati ogni tre giorni in background. Un gioco che non possiedi può essere aggiunto per nome dal catalogo di Sony, e rimosso allo stesso modo. Un gioco di qualsiasi altra sorgente uscito anche su PlayStation mostra il vero platino del suo elenco e, in modalità trofei, i suoi veri gradi e gruppi di DLC (vedi [Notifiche](notifications.md#trophy-mode)). L'accesso avviene sulla pagina di Sony. |

Un riquadro porta un piccolo badge per ciò che il collegamento ha stabilito: acquistato su quello store,
condiviso tramite Steam Family, oppure non più nella tua libreria.

## Salvataggi compatibili con Steam {#steam-compatible-saves}

AW Next legge i file di obiettivi e statistiche scritti dagli emulatori Steam (`achievements.json`,
`achievements.ini`, `achievements.bin`, `stats.ini` e strutture compatibili) nei luoghi in cui quegli
strumenti li scrivono. Ciò comprende **Goldberg** e **GBE Fork** (che AW Next può anche installare e riparare),
**GreenLuma**, **LumaPlay**, **SmartSteamEmu**, **CreamAPI**, gli emulatori **Nemirtingas** e le release scene
con una struttura compatibile. Per un gioco i cui file si trovano altrove, aggiungi la cartella in
**Impostazioni → Cartelle**.

<div align="center">
<picture><source srcset="../assets/shot/folders-panel-800.webp 800w, ../assets/shot/folders-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/folders-panel.png" width="720" height="529" alt="Impostazioni - Cartelle" loading="lazy" decoding="async"></picture><br>
<sub>Le cartelle che AW Next controlla da solo e quelle che aggiungi - salvataggi dei singoli giochi o intere librerie</sub>
</div>

Una release portatile di CODEX, RUNE o CPY di norma scrive in `%PUBLIC%\Documents\Steam\<SOURCE>\<appid>`,
ma una copia portatile tiene quell'albero dentro la cartella del gioco, dove nessuno lo cerca. Basta aggiungere
la cartella del gioco in **Impostazioni → Cartelle**: il suo `steam_emu.ini` (o `cpy.ini`) indica
l'AppID, e l'albero dei salvataggi viene cercato accanto ad esso prima della posizione condivisa. Un gioco senza
ancora alcun salvataggio viene comunque aggiunto, allo 0%.

Funziona anche una release senza configurazione dell'emulatore, o il cui ini hai eliminato: l'albero dei salvataggi
viene letto direttamente, perché `Steam\RUNE\<appid>` contiene l'AppID nel nome della cartella. Le stesse strutture
vengono verificate anche un livello sotto la cartella che aggiungi, così puoi indicare ad AW un'intera libreria di giochi.

Quando una cartella non può essere usata, AW dice perché: contiene un gioco ma nessun file di sblocchi leggibile,
non contiene nulla che riguardi gli obiettivi, oppure è una release di **EA app**. Le release di EA app tengono gli
obiettivi sull'account EA e non su disco, quindi vengono lette tramite la sorgente EA e nessuna cartella che aggiungi
può farle comparire. Il messaggio dice anche quante strutture sono state verificate, il che distingue "non trovato"
da "non guardato".

Tre casi hanno una gestione propria:

- **Goldberg SocialClub**: la variante per Rockstar e Social Club, con un interruttore proprio.
- **RUNE Ubisoft Connect**: l'emulatore Ubisoft di RUNE tiene i file `achievements.cfg` in
  `Documents\RUNE\Ubisoft Connect\achievements`. Vengono trovati senza aggiungere una cartella (funziona anche
  aggiungere una cartella `RUNE\Ubisoft Connect` in **Impostazioni → Cartelle**) e seguono l'interruttore
  dell'emulatore di Ubisoft Connect. Nomi e icone provengono dall'elenco di Ubisoft Connect per il gioco; senza di esso
  compaiono solo i numeri degli obiettivi.
- **Uplay R2**: l'equivalente Ubisoft del percorso Goldberg, per i titoli compatibili. Non ha un interruttore
  proprio: i salvataggi passano dalla sorgente degli emulatori Steam, e i suoi strumenti di riparazione e di loader sono in
  **Impostazioni → Emulatori → Ubisoft / Uplay R1/R2**. Vedi [Configurazione di Uplay R2](uplay-r2.md).

Se un gioco che usa uno di questi non mostra obiettivi, il suo pannello **Stato dei giochi** indica il pezzo mancante.
Vedi [Stato dei giochi](game-health.md) e [Configurazione Goldberg / GBE](emulator-setup.md).

## Emulatori di console {#console-emulators}

| Emulatore | Console | File dei trofei / obiettivi |
|---|---|---|
| **RPCS3** | PlayStation 3 | `TROPUSR.DAT` accanto all'elenco dei trofei |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`, che contiene l'elenco e lo stato ottenuto |
| **KytyPS5** | PlayStation 5 | `_Trophies\<title>\trophies_*.json` accanto all'emulatore; l'elenco proviene dal pacchetto `sce_sys\trophy2` del gioco |
| **Xenia** | Xbox 360 | `.gpd`, che contiene anch'esso entrambi |

Ognuno viene osservato in tempo reale, quindi uno sblocco genera una notifica come tutti gli altri. RPCS3, ShadPS4 e
Xenia possono spostare i propri dati fuori dal percorso predefinito, e AW Next legge le impostazioni che legge l'emulatore:

- **RPCS3**: la cartella dei trofei segue `vfs.yml` (compresa una rimappatura relativa a `$(EmulatorDir)`), una
  cartella `portable` accanto all'eseguibile e `RPCS3_CONFIG_DIR`.
- **ShadPS4**: riconosciuto sia che tu indichi l'emulatore, la sua cartella `user`, `game_data` stessa o
  (dalla 0.19) la sua cartella `trophy` oppure `home\<user>\trophy`. La sua configurazione viene letta da uno qualsiasi dei due
  posti in cui shadPS4 l'ha tenuta.
- **Xenia**: segue `storage_root` e `content_root` nella sua configurazione.
- **KytyPS5**: riconosciuto sia che tu indichi l'emulatore, la sua cartella `_Trophies` o la cartella di un singolo
  gioco. I giochi vengono cercati nelle cartelle dei giochi del launcher di KytyPS5 (`Kyty.ini`) e accanto
  all'emulatore, decompressi o come archivio `.zar`. L'elenco dei trofei risiede nel gioco stesso, quindi un gioco
  eliminato dopo che AW Next lo ha visto resta nell'elenco come non installato, grazie alla copia del suo elenco e della sua grafica conservata
  allora. Un gioco del launcher viene elencato prima del suo primo trofeo. Conta solo l'utente attivo: quello impostato
  per il gioco nel launcher, altrimenti l'utente globale dell'emulatore. Senza alcuna impostazione utente, vengono aggiunti
  i trofei di tutti gli utenti.

Perciò un disco virtuale RPCS3 spostato o una cartella di dati di ShadPS4 possono essere aggiunti direttamente in
**Impostazioni → Cartelle**, senza alcun eseguibile dell'emulatore nelle vicinanze.

## RetroAchievements {#retroachievements}

I giochi giocati su un emulatore che riporta a RetroAchievements provengono dal tuo account, non da un
file. Attiva la sorgente **RetroAchievements** e compila la scheda dell'account sotto di essa: il tuo nome utente
e la **chiave Web API** da retroachievements.org/settings. La chiave viene cifrata prima di essere salvata
su questo PC.

<div align="center">
<picture><source srcset="../assets/shot/retroachievements-panel-800.webp 800w, ../assets/shot/retroachievements-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/retroachievements-panel.png" width="720" height="529" alt="Impostazioni, Sorgenti: l'interruttore RetroAchievements sopra le schede degli account" loading="lazy" decoding="async"></picture><br>
<sub>L'interruttore RetroAchievements, con le schede degli account Epic e Steam sotto di esso</sub>
</div>

**Importa libreria** aggiunge ogni gioco che hai giocato, con i suoi obiettivi, le date di sblocco, i punti e la rarità.
Una seconda importazione recupera solo i giochi il cui avanzamento è cambiato, e un gioco giocato per la prima volta viene
aggiunto da solo. I nuovi sblocchi vengono annunciati nel giro di pochi secondi mentre è in esecuzione un emulatore che riporta a
RetroAchievements (RetroArch, DuckStation, PCSX2, PPSSPP, Dolphin, BizHawk, Project64 o qualsiasi altra
build integrata con RA, riconosciuta dal nome o dalla dll di RetroAchievements accanto ad essa), e nel giro di pochi
minuti negli altri casi.

AW Next legge gli sblocchi da retroachievements.org, quindi RetroAchievements deve restare attivo nell'emulatore:
disattivarlo lì impedisce l'invio degli sblocchi. Per vedere solo la notifica di AW Next, nascondi il
pop-up dell'emulatore stesso. In RetroArch si trova in **Impostazioni → Obiettivi → Visibilità → Notifiche di
sblocco**. RetroBat riscrive `retroarch.cfg` a ogni avvio, quindi chiudi RetroBat e aggiungi questa riga
a `RetroBat\emulationstation\.emulationstation\es_settings.cfg`:

```xml
<string name="global.retroarch.cheevos_visibility_unlock" value="false" />
```

Usa `cheevos_visibility_mastery` allo stesso modo per il pop-up della padronanza.

## Altre sorgenti {#other-sources}

| Sorgente | Che cos'è |
|---|---|
| **Giochi Xbox 360 ricompilati per PC** | I port ReXGlue e simili tengono il loro elenco di obiettivi in una cartella `achievements` (`.toml`, `.tsv`) o in `SaveData\Achievements.json`, nella cartella del gioco o in `Documents\<game>`. L'elenco proviene dal `default.xex` del gioco, in ogni lingua che include, con gli obiettivi segreti che restano segreti. [dbox.tools](https://dbox.tools) aggiunge gli obiettivi dei DLC ed Exophase la percentuale di giocatori per obiettivo. Un elenco in `Documents` viene trovato da solo; per uno nella cartella del gioco, **Ricerca smart** trova un port noto nelle tue librerie di giochi dal suo eseguibile, prima del suo primo obiettivo; altrove, aggiungi quella cartella in **Impostazioni → Cartelle**. Gli sblocchi vengono notificati in tempo reale, il tempo di gioco viene tracciato e Reimposta i successi funziona. Più di ottanta port noti (Sonic Unleashed, Sonic the Hedgehog tramite Marathon Recompiled, Blue Dragon re:Blue, Lost Odyssey, Perfect Dark Zero, Fable II, Gears of War 2, Forza Motorsport 4, GoldenEye 007, Skate 2, Marvel Ultimate Alliance, Eternal Sonata, la collezione Trials e altri) sono elencati a partire dal loro eseguibile prima del primo obiettivo. Un port che tiene un elenco per profilo è un solo gioco. La sorgente segue l'interruttore di Xenia. |
| **Giochi PS4 portati su PC** | Bloodborne, la collezione Uncharted (una voce per gioco), God of War III Remastered, MediEvil e altri port costruiti sul runner `run.py`. Anche port che non lo usano (Dragon's Crown Pro, inFAMOUS Second Son e First Light, The Last Guardian, Gravity Rush 2, Killzone Shadow Fall, Driveclub, Unicorn Overlord, Fist of the North Star: Lost Paradise, UFC 3, PROTOTYPE e PROTOTYPE 2 con una voce ciascuno, i giochi UFC di PORTHEON), port sul runtime di BilalReloaded come il suo port della Nathan Drake Collection, Odin Sphere Leifthrasir e 13 Sentinels: Aegis Rim, ReCasted (Ratchet & Clank, il cui `trophies\trophies.log` si trova nella sua cartella e il cui platino viene assegnato quando ci sono gli altri 46 trofei), e port che scrivono un proprio elenco, come Crash Team Racing Nitro-Fueled. **Ricerca smart** trova un port nelle tue librerie di giochi dai suoi file (`run.py`, `trophy.key`, `rcps4-probe.exe` di ReCasted) e tra i giochi installati da Quiver Launcher; altrove, aggiungi la cartella del port in **Impostazioni → Cartelle**. L'elenco dei trofei, i gradi e le icone provengono dal dump originale del gioco a cui punta il launcher del port (`sce_sys\trophy`, anche con un `npbind.dat` cifrato), oppure dal `user\trophies\<title id>\trophies.tsv` del port stesso. Gli sblocchi provengono da quello tra `trophies.log`, `last_run.log`, `analysis\<name>-user\trophy\trophyNN.txt`, `progress_user<N>.txt`, `<title id>-user<N>.bin`, `trophies.dat` o `unlocked.txt` che il port scrive, con tutti i profili uniti, e vengono notificati in tempo reale. La rarità proviene dagli elenchi PS4 di Exophase. Il suo interruttore è **PS4 Recomp**. |
| **Games for Windows LIVE** | Installazioni di XLiveLessNess. Vengono letti i record di sblocco di ogni profilo, e l'elenco, i suoi testi e le icone provengono dall'eseguibile del gioco stesso, quindi non viene scaricato nulla. Gli obiettivi dei DLC provengono dal `spa.bin` di ogni pacchetto di contenuti nella cartella `dlc\<title id>` di XLiveLessNess. Osservato in tempo reale. |
| **Dead Space 2 MarkerPatch, Alice: Madness Returns MadnessPatch** | Una copia Steam con la mod installata viene trovata da sola. Per qualsiasi altra copia, aggiungi la cartella del gioco in **Impostazioni → Cartelle** (una cartella al suo interno, come `Binaries\Win32`, vale come cartella del gioco) oppure lascia che **Ricerca smart** cerchi nelle tue librerie. L'elenco viene costruito dai testi e dalle immagini della mod stessa, e gli sblocchi che salva vengono notificati in tempo reale. Ognuno ha un proprio interruttore, e nulla viene letto finché `AchievementSupport` della mod è disattivato. |
| **Port per PC** | *The Legend of Zelda: Link's Awakening DX HD* (LADXHD Updated). Aggiungi la cartella del gioco in **Impostazioni → Cartelle**. I 110 obiettivi, i loro testi nelle lingue del gioco e le loro immagini provengono dall'installazione. Gli sblocchi vengono letti da `%LOCALAPPDATA%\Zelda_LA\achievements` (accanto al gioco quando ha un `portable.txt`). Il file non contiene date, quindi uno sblocco viene datato nel momento in cui è stato visto. |
| **Port per PC ricompilati** | *Twilight Princess* (Dusklight), *Super Mario 64* (Ghostship), *Diddy Kong Racing* (DKR-R), *Super Mario Bros. Remastered*, *Super Mario Sunshine* con la mod Super Mario Eclipse (SMS Launcher), *Super Mario All-Stars* (il port per PC di Darhkfox), *Road Rash 64 Recompiled*, *F-Zero X* (G-Diffuser), e *Pikmin* e *Pikmin 2* (Open Nectar). Questi port incorporano l'elenco degli obiettivi nel gioco, quindi AW Next include ogni elenco, in inglese, ricavato dal sorgente del port. Le immagini degli obiettivi provengono dalla cartella di SMS Launcher stesso, oppure vengono scaricate una volta dai repository di Ghostship, Super Mario Bros. Remastered e Road Rash 64; gli altri port le disegnano nel codice, quindi i loro obiettivi mostrano l'icona del gioco. Un port viene trovato dal suo file di sblocchi in `%APPDATA%` o `%LOCALAPPDATA%` (`TwilitRealm\Dusklight`, `DKRPort`, `SMB1R`, `sms-launcher`, `RoadRash64Recompiled`), dai giochi installati da Quiver Launcher (versione 3 o 4), con **Ricerca smart** dal suo eseguibile nelle tue librerie di giochi, oppure dalla sua cartella in **Impostazioni → Cartelle**. Ghostship, Super Mario All-Stars, G-Diffuser e Open Nectar tengono i loro salvataggi accanto al gioco, quindi serve una delle ultime tre; aggiungendo la cartella di Open Nectar si trova anche Pikmin 2 nella sua cartella `pikmin2`. Un'installazione portatile (`portable.txt`, o il `data_location.json` di Dusklight) viene letta dove scrive. DKR-R, SMS Launcher, Super Mario All-Stars e G-Diffuser conservano la data di ogni sblocco; per gli altri uno sblocco viene datato nel momento in cui è stato visto. Su Linux le build native vengono lette da `~/.local/share` e `~/.config`, e le build Windows dal loro prefisso Wine o Proton. Condividono l'interruttore dei port per PC. |
| **FINAL FANTASY VII (2013)** | Questa riedizione è precedente agli obiettivi Steamworks e tiene i suoi 36 sblocchi in un bitfield di 8 byte accanto ai salvataggi, trovato in Documents senza aggiungere la cartella. |
| **Ricorda gli sblocchi visti** | Mantiene un gioco nell'elenco dopo che il suo salvataggio è sparito, con gli sblocchi visti dal tracker in background. |
| **Giochi aggiunti manualmente** | Un gioco aggiunto a partire da un titolo e un eseguibile, con una piattaforma e un AppID Steam facoltativi. Vedi [Strumenti avanzati](advanced.md#add-a-game-manually). |

## Metadati di Steam, senza chiave API {#steam-metadata-without-an-api-key}

AW Next non usa alcuna chiave Steam Web API né alcun account Steam collegato per questo. L'elenco di ogni gioco proviene da
una catena senza chiave: prima l'endpoint ufficiale `GetGameAchievements` (descrizioni nascoste, icone, rarità
globale e set di obiettivi di Steam), poi la pagina degli obiettivi della SteamCommunity (lo stesso schema, nella
tua lingua), poi SteamHunters, e un'estrazione dal browser solo come ultima risorsa.

Come su Steam, un obiettivo archiviato dallo sviluppatore conta solo se lo hai ottenuto. In caso contrario viene escluso
dall'elenco, dalla percentuale e dalla notifica del platino.

I risultati vengono messi in cache per lingua in `%APPDATA%\Achievement Watcher Next\steam_cache\schema`, quindi le
sorgenti locali e i giochi già visti funzionano offline.

Steam non annuncia mai che un aggiornamento ha aggiunto degli obiettivi, quindi un elenco in cache si ricontrolla da solo ogni 3
giorni e ne rileva di nuovi senza rimuoverne nessuno. Per controllare subito, usa **Impostazioni → Avanzate →
Riverifica elenchi obiettivi**. **Aggiornamenti automatici dei dati sugli obiettivi**, nello stesso punto, disattiva il
ricontrollo periodico per chi gestisce `steam_cache` a mano. Il pulsante continua a funzionare.

Gli obiettivi di DLC e aggiornamenti portano il nome del loro gruppo (per esempio *Hearts of Stone*) sotto il
titolo, ricavato dalla stessa ricerca.

## Sorgenti che non vedi {#sources-you-do-not-see}

In modalità **Semplice** l'elenco delle Sorgenti ripiega sei righe di nicchia: GreenLuma, LumaPlay, i due
emulatori Nemirtingas (i lettori dei salvataggi di GOG ed Epic), Goldberg SocialClub e l'importazione della cache delle
notifiche. Una riga si ripiega solo finché è attiva e nessun gioco della tua libreria proviene da essa. Disattivane una,
oppure possiedi un gioco che ha rilevato, e la riga ricompare, così la modalità dell'interfaccia non nasconde mai il controllo che
spiegherebbe un gioco mancante. **Avanzata** elenca sempre tutte le sorgenti.

---

**Avanti:** [Notifiche](notifications.md), per scegliere come vengono annunciati gli sblocchi.

*Configurazione specifica per sorgente: [Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[Stato dei giochi](game-health.md)*

<div align="center">

[← Documentazione](README.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
