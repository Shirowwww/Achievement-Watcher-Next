---
title: "Strumenti avanzati"
description: "Gli strumenti di manutenzione in Impostazioni, Avanzate: svuotare le cache, diagnostica, backup del profilo, AppID manuali e reimpostazioni."
---

# Strumenti avanzati

Questi strumenti si trovano in **Impostazioni → Avanzate** o nel menu del tasto destro di un gioco. La scheda Avanzate
esiste solo mentre l'interfaccia è in modalità **Avanzata**: porta il controllo **Interfaccia** in cima
alle Impostazioni su Avanzata se non la vedi. Non si perde nulla tornando indietro.

<div align="center">
<picture><source srcset="../assets/shot/advanced-panel-800.webp 800w, ../assets/shot/advanced-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/advanced-panel.png" width="720" height="529" alt="Impostazioni - Avanzate, configurazione e manutenzione"></picture><br>
<sub>Configurazione &amp; manutenzione; le altre sezioni si ripiegano sotto di essa</sub>
</div>

## Configurazione e manutenzione {#setup-and-maintenance}

| Strumento | Che cosa fa |
|---|---|
| **Correggi tutti i giochi rilevati** | Esegue la riparazione corrispondente (Steam/GBE Fork o Ubisoft/Uplay R2) su ogni gioco compatibile rilevato con una cartella di installazione nota. Ricostruisce i giochi che hanno già una configurazione. |
| **Disattiva l'accelerazione hardware** | Disattiva l'accelerazione GPU quando la finestra o l'overlay si comportano male. Richiede un riavvio. |
| **Svuota cache** | Elimina solo le cache riscaricabili: file di aggiornamento, cache degli schemi e delle icone di Steam/Ubisoft e strumenti di correzione degli emulatori scaricati. Impostazioni, salvataggi, backup e file inseriti a mano non vengono mai toccati. |
| **Riverifica elenchi obiettivi** | Controlla su Steam gli obiettivi aggiunti da un aggiornamento del gioco. Succede ogni 3 giorni; il pulsante lo forza subito. |
| **Aggiornamenti automatici dei dati sugli obiettivi** | Attivo per impostazione predefinita. Disattivato ferma quel ricontrollo e la riparazione delle descrizioni vuote, per chi gestisce `steam_cache` a mano. **Riverifica elenchi obiettivi** funziona comunque mentre è disattivato. |

Le impostazioni di riparazione specifiche per sorgente si trovano in **Impostazioni → Emulatori**. **Ubisoft / Uplay R2** contiene lo
stato del pacchetto, i controlli di importazione/ripristino delle DLL e la riparazione mirata in blocco; i dettagli del loader e dell'INI restano
automatici.

**Svuota cache** è la prima cosa da provare quando un aggiornamento continua a fallire sullo stesso file scaricato.

## Diagnostica {#diagnostics}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Impostazioni - Avanzate, diagnostica" loading="lazy" decoding="async"></picture><br>
<sub>Le versioni e un clic per arrivare alle cartelle dei log e dei dati</sub>
</div>

La scheda Diagnostica mostra le versioni di app, Electron, Node e Chrome, e apre la cartella dei log,
la cartella dei dati o un controllo degli aggiornamenti. **Esporta i registri (.zip)** raccoglie tutti i file di log in un unico archivio
mentre l'app è in esecuzione; copiarli a mano non è affidabile perché i processi che li scrivono non si fermano mai.
Il tuo nome utente e qualsiasi chiave, token o password sono oscurati nell'archivio, non nei log sul disco. Vedi
[Risoluzione dei problemi](troubleshooting.md#open-logs-and-local-data) per ciò che serve a una segnalazione di bug.

## Backup del profilo {#profile-backup}

<div align="center">
<picture><source srcset="../assets/shot/profile-backup-panel-800.webp 800w, ../assets/shot/profile-backup-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/profile-backup-panel.png" width="720" height="529" alt="Impostazioni - Avanzate, backup del profilo" loading="lazy" decoding="async"></picture><br>
<sub>Esporta profilo e Ripristina profilo, in Impostazioni → Avanzate</sub>
</div>

**Esporta profilo…** salva impostazioni, scelte della libreria, preset, temi, copertine, sfondi personalizzati,
punti di ripristino di GBE e tempo di gioco in un unico file `.awbackup`, per una reinstallazione o un nuovo PC. Accessi,
cache e log non vengono mai salvati, quindi dopo devi accedere di nuovo a Epic, Steam, Xbox, PlayStation e
RetroAchievements. **Ripristina profilo…** controlla prima l'intero file e lo applica al
successivo avvio. I file che sostituisce vengono conservati, e un ripristino fallito rimette tutto a posto.

## Giochi rimossi {#removed-games}

Un gioco tolto con **Rimuovi da AW Next** è elencato in **Impostazioni → Generale → Giochi rimossi**,
e può essere riportato uno alla volta o tutti insieme. Usalo per una cartella estranea che la scansione continua a
trovare ma che non è un gioco; per tenere fuori vista un gioco vero, **Nascondi dalla vista** è più leggero
(vedi [Nascondere, rimuovere o cancellare un gioco](#hide-remove-or-clear-a-game)).

## Reimposta gli obiettivi di un gioco {#reset-a-games-achievements}

**Reimposta i successi**, nella pagina del gioco accanto al tempo di gioco o nel suo menu del tasto destro, riporta
ogni obiettivo a bloccato così puoi giocare di nuovo il gioco da capo. AW Next li annuncia come
nuovi quando si sbloccano.

<div align="center">
<picture><source srcset="../assets/shot/achievements-800.webp 800w, ../assets/shot/achievements.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/achievements.png" width="800" height="492" alt="La pagina di un gioco con Reimposta i successi" loading="lazy" decoding="async"></picture><br>
<sub>Reimposta si trova accanto al conteggio di completamento nella pagina del gioco stesso</sub>
</div>

Ogni file coinvolto viene prima salvato in backup in
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`, e la conferma elenca
i file esatti prima che qualcosa venga toccato. Un file il cui backup fallisce viene saltato, non azzerato.

| Sorgente | Che cosa fa una reimpostazione |
|---|---|
| Emulatori Steam (Goldberg / GBE e strutture compatibili, compresi Goldberg SocialClub e Uplay R2) | Rimuove il salvataggio degli obiettivi. L'emulatore ne scrive uno nuovo al successivo sblocco. |
| RPCS3 | Rimuove `TROPUSR.DAT`. L'elenco dei trofei (`TROPCONF.SFM`) resta intatto. |
| ShadPS4 | Blocca di nuovo i trofei dentro `TROP*.XML`, che contiene anche l'elenco dei trofei, quindi il file viene modificato, non rimosso. |
| KytyPS5 | Rimuove i file di sblocco `trophies_*.json` del gioco. L'elenco dei trofei resta nel pacchetto del gioco. |
| Xenia | Azzera il flag di ottenuto dentro il `.gpd`, che contiene anche l'elenco degli obiettivi, quindi il file viene modificato. |
| Steam, GOG Galaxy, Ubisoft Connect, EA, Epic, Xbox | **Non possibile.** Queste sorgenti conservano gli sblocchi sul tuo account e li risincronizzano; solo l'account può cancellarli. AW Next lo dice. |

Anche i contatori di progresso memorizzati accanto agli obiettivi (`stats.ini`, `stats.bin`, …) vengono reimpostati e salvati in backup:
per un obiettivo "percorri 1000 km" il contatore è l'avanzamento, e lasciarlo pieno farebbe scattare
l'obiettivo subito oppure mai più.

**Ripristina un backup dei successi**, nello stesso menu del tasto destro, rimette a posto un'intera reimpostazione. Aggiorna la
libreria dopo per leggere gli sblocchi ripristinati.

> [!NOTE]
> Una reimpostazione cancella anche il registro di AW Next di ciò che era già stato sbloccato, compreso quello nel
> tracker in background in esecuzione. Altrimenti un obiettivo riottenuto non verrebbe più annunciato.

## Blocca di nuovo un singolo obiettivo {#re-lock-a-single-achievement}

Fai clic con il pulsante destro su un obiettivo sbloccato nella pagina del gioco e scegli **Blocca di nuovo questo successo** per
giocare di nuovo solo quello. Solo quell'obiettivo torna bloccato: il suo flag, l'orario di sblocco e
l'avanzamento nel salvataggio dell'emulatore, il suo contatore quando il salvataggio ne collega uno, e il
registro di AW Next, così viene annunciato come nuovo quando lo ottieni. La conferma elenca i file e ogni file
viene prima salvato in backup, come per una reimpostazione; **Ripristina un backup dei successi** lo rimette a posto.

Chiudi prima il gioco. Un emulatore tiene gli sblocchi in memoria e li riscrive all'uscita
del gioco, il che annullerebbe la modifica, quindi AW Next rifiuta mentre un gioco è in esecuzione.

Funziona con i salvataggi di testo degli emulatori Steam (Goldberg e GSE, CODEX, RUNE, OnlineFix, RLD!,
3DM, ALI213, TENOKE, Hoodlum, RAZOR1911, CreamAPI), UniverseLAN, Nemirtingas, Uplay R1 e R2,
GreenLuma e LumaPlay su Windows, e con i salvataggi per console di RPCS3, ShadPS4, Xenia, KytyPS5, i port
Xbox 360 e XLLN. I salvataggi di SmartSteamEmu (`stats.bin`) e SKIDROW (`achieve.dat`) non vengono modificati un
obiettivo alla volta, perché la loro struttura non è documentata; per quelli usa **Reimposta i successi**.

## Nascondere, rimuovere o cancellare un gioco {#hide-remove-or-clear-a-game}

Il menu del tasto destro di un gioco ha tre modi per farlo sparire, dal più leggero al più forte:

| Voce | Che cosa succede | Come annullare |
|---|---|---|
| **Nascondi dalla vista** | Il gioco esce da Tutti i giochi, da ogni raccolta e dalle statistiche, ma è ancora tracciato e continua a notificare. | Il menu Raccolte mostra una vista **Nascosti** finché un gioco è nascosto; fai clic con il pulsante destro lì e scegli **Mostra di nuovo**. |
| **Rimuovi da AW Next** | La scansione salta il gioco: esce dalla libreria. Pensato per strumenti e altre cose che non sono giochi. | **Impostazioni → Generale → Giochi rimossi**. |
| **Cancella i dati di questo gioco…** | Tutto ciò che AW Next conserva sul gioco viene cancellato: i suoi salvataggi degli obiettivi (prima salvati in backup, come fa una reimpostazione), il tempo di gioco, l'elenco degli obiettivi e le icone in cache, le impostazioni del singolo gioco e la configurazione dell'emulatore che AW Next ha scritto nella sua cartella. La conferma elenca prima ogni parte. | Nulla da annullare: la scansione successiva ritrova il gioco come nuovo. |

## Rinominare un gioco {#renaming-a-game}

**Impostazioni di gioco → Rinomina…**, nel menu del tasto destro, imposta il nome con cui un gioco viene mostrato: nel suo
riquadro e nella sua schermata, nella ricerca e nell'ordinamento, nelle notifiche e nelle cartelle in cui screenshot e clip
vengono salvati. La ricerca trova comunque il gioco con il suo nome originale. Lascia vuoto il campo, oppure scegli
**Ripristina il nome originale**, per tornare indietro. Il nome è conservato per ogni gioco in `cfg/gameTitles.json`, quindi
sopravvive alle nuove scansioni e fa parte di un backup del profilo. La ricerca delle copertine e l'abbinamento dei giochi usano il nome
originale.

**Impostazioni → Generale → Titoli dei giochi nella mia lingua**, attivo per impostazione predefinita, mostra i giochi Steam con il
titolo che Steam dà loro nella lingua degli obiettivi (la lingua propria del gioco quando ne ha una).
Anche le copertine seguono la stessa lingua. Il catalogo locale di Steam risponde per i giochi che il tuo client Steam conosce;
gli altri vengono richiesti una volta, in blocchi, e ricontrollati dopo un mese. Un nome che imposti tu vince sempre.

## Modificare il tempo di gioco di un gioco {#editing-a-games-playtime}

**Obiettivi e tempo di gioco → Modifica il tempo di gioco…**, nel menu del tasto destro, sostituisce il tempo di gioco totale di un gioco,
per esempio uno portato da un altro tracker o uno che ha perso sessioni. Scrivi le ore
(`12.5`) oppure ore e minuti (`12h30` o `12:30`). La data dell'ultima sessione viene conservata, e AW Next
aggiunge le sessioni successive al nuovo totale. Un gioco che possiedi su Steam non scende mai sotto il tempo di gioco che Steam
riporta: la scansione successiva riporta un totale più basso a quello di Steam.

## Una lingua degli obiettivi diversa per un solo gioco {#a-different-achievement-language-for-one-game}

**Impostazioni di gioco → Lingua degli obiettivi**, nel menu del tasto destro, mostra gli obiettivi e le
notifiche di un solo gioco in una lingua diversa dal resto della libreria. **Come l'app** torna alla
scelta globale.

## Aggiungere un gioco manualmente {#add-a-game-manually}

Il `+` accanto alla ricerca nella libreria aggiunge un gioco a partire da un titolo e un eseguibile, con una
piattaforma e un AppID Steam facoltativi. Usalo per un gioco che nessuna sorgente rileva: una build standalone, un'installazione
portatile o un emulatore che avvii tu stesso.

Un gioco aggiunto manualmente:

- è avviabile e traccia il tempo di gioco come qualsiasi altra voce;
- mostra **Nessun obiettivo** se non ne ha, ed è escluso dalle statistiche di completamento invece di
  contare come 0%;
- può adottare in seguito uno schema di obiettivi Steam aggiungendo l'AppID, senza essere ricreato;
- mantiene diagnostica protetta per il singolo gioco, mentre le azioni distruttive restano nascoste.

Le cartelle aggiunte manualmente portano una piccola icona nell'elenco Cartelle, per distinguerle dalle posizioni
scoperte da Ricerca smart.

## Impostare a mano l'AppID di un gioco {#set-a-games-appid-by-hand}

Fai clic con il pulsante destro su un gioco il cui nome di cartella corrisponde a più release di Steam, così che l'abbinamento automatico abbia scelto
quella sbagliata, e scegli **Imposta AppID manualmente...**. La scelta viene ricordata per cartella di installazione e
scritta in `steam_appid.txt`; **Cancella l'AppID manuale** la annulla. Anche **Correggi il file
identificativo del gioco** di Stato dei giochi chiede l'AppID, partendo dal suggerimento di AW Next.

## Segnare un obiettivo come sbloccato {#mark-an-achievement-as-unlocked}

Un obiettivo che una sorgente non riesce a vedere (ottenuto prima di configurare il tracciamento, o mai registrato da un
emulatore) può essere segnato dal suo menu del tasto destro con **Segna come sbloccato manualmente**. **Annulla sblocco
manuale** lo annulla. Gli sblocchi manuali persistono tra le scansioni e vengono cancellati da una reimpostazione.

## Passaggi sotto un obiettivo {#steps-under-an-achievement}

Un obiettivo lungo può essere diviso in passaggi che scrivi e spunti tu. Passa il mouse sopra di esso nella pagina del gioco
e apri **Passaggi**, oppure fai clic con il pulsante destro e scegli **Aggiungi passaggi**, poi scrivi un passaggio e premi Invio.
Fai clic su una casella per spuntare un passaggio, fai doppio clic sul suo testo per rinominarlo e usa la croce per rimuoverlo.
Il gioco non riporta mai i passaggi, quindi servono solo a riempire la barra dell'obiettivo: lo sblocco arriva comunque
dal gioco, e quando arriva ogni passaggio risulta completato. L'overlay di gioco mostra gli stessi passaggi e
li spunta con il mouse o con un controller.

**Passaggi** nell'intestazione del gioco esporta l'elenco in un file da condividere, oppure ne importa uno. Un file contiene
i testi, non le spunte, e i suoi obiettivi vengono abbinati per id, poi per nome; i passaggi già presenti
mantengono le loro spunte. I passaggi risiedono in `cfg/achievement-steps.json` e confluiscono nel backup del profilo.

## Strumenti per emulatori e riparazioni {#emulator-and-repair-tools}

La diagnosi e la riparazione delle configurazioni Goldberg / GBE Fork, l'installer del runtime GBE, Steamless e il
bypass facoltativo del controllo API si trovano in **Impostazioni → Emulatori** e nel sottomenu
**Emulatore e strumenti** di ogni gioco. Le loro guide:

- [Configurazione Goldberg / GBE](emulator-setup.md) - diagnosticare e riparare un gioco Steam emulato
- [Configurazione Uplay, R1 e R2](uplay-r2.md) - l'equivalente per Ubisoft
- [Riferimento Goldberg / GBE](../goldberg-gbe.md) - formati di file e regole di rilevamento

**Rimuovi la configurazione dell'emulatore di AW Next**, nello stesso menu, annulla solo la sezione DLC, gli interruttori
e le chiavi di identità che AW Next ha scritto nel `configs.user.ini` di un gioco, mai un valore impostato da te o dal repack,
ed elimina il file solo quando al suo interno non resta nient'altro. Mostra prima esattamente che cosa rimuoverà,
ed è l'unico modo per recuperare se non hai mai fatto un backup di quel file.

**Applica la correzione per gli obiettivi GOG (UniverseLAN)…** compare su un gioco GOG che include una dll di Galaxy. Installa
la build di UniverseLAN corrispondente all'SDK Galaxy di quel gioco, conserva la dll originale come backup e
non sovrascrive mai i salvataggi UniverseLAN esistenti. Gli sblocchi che scrive in `%LOCALAPPDATA%\UniverseLAN`
vengono letti e notificati come tutti gli altri.

Se una riparazione ha inserito l'emulatore supportato, **Annulla il cambio di emulatore** in
[Stato dei giochi](game-health.md#the-repairs) rimette a posto i file propri del crack.

> [!WARNING]
> Le riparazioni creano backup, ma modificano comunque i file del gioco. Usale solo con giochi che possiedi.

---

**Avanti:** [FAQ](faq.md) - risposte brevi alle domande che ricorrono più spesso.

<div align="center">

[← Documentazione](README.md) · [Risoluzione dei problemi](troubleshooting.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
