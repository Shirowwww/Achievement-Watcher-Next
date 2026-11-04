---
title: "Stato dei giochi"
description: "Il rapporto per ogni gioco che dice perché un gioco è o non è tracciato, con le riparazioni guidate che si applicano."
---

# Stato dei giochi

Quando un gioco dà problemi, apri prima il suo pannello **Stato dei giochi**. Dice se AW Next riesce a vedere il
gioco, leggerne gli obiettivi e annunciarne gli sblocchi, e propone solo le riparazioni che si applicano.

Aprilo dal pulsante **strumenti** nell'angolo in alto a destra di un riquadro di gioco, oppure dal menu
del tasto destro del gioco. Il pannello ha tre schede: **Stato**, **Eseguibile**, che imposta il programma da
osservare mentre giochi, e **Notifica**, dove il gioco può avere un proprio preset del popup, una propria posizione,
un proprio suono e una propria scala (vedi [Comportamento per singolo gioco](notifications.md#per-game-behavior)).

<div align="center">
<picture><source srcset="../assets/shot/game-health-800.webp 800w, ../assets/shot/game-health.webp 903w" sizes="(max-width: 700px) 100vw, 620px"><img src="../screenshot/game-health.png" width="620" height="557" alt="Il pannello Stato dei giochi con uno stato Richiede attenzione, i suoi controlli e le riparazioni applicabili"></picture><br>
<sub>Uno stato, il motivo, i controlli che lo sostengono e le riparazioni applicabili</sub>
</div>

## I tre stati {#the-three-states}

| Stato | Che cosa significa |
|---|---|
| **Pronto** | Il gioco è rilevato, i suoi dati degli obiettivi sono disponibili e AW Next lo osserva per gli sblocchi. |
| **Richiede attenzione** | Il gioco funziona, ma una parte della sua configurazione è incompleta. I controlli mostrano quale. |
| **Non monitorato** | Manca qualcosa di essenziale, quindi nessuno sblocco può essere registrato: il gioco non si trova, non ha dati degli obiettivi o gli manca l'emulatore che scrive i suoi sblocchi. |

La frase sotto lo stato indica la causa, i controlli mostrano quale parte è difettosa e un pulsante di
riparazione agisce esattamente su quella.

- La modalità **Semplice** descrive gli esiti con parole semplici (*Dati degli obiettivi trovati*, *Rilevato all'avvio del gioco*).
  **Avanzata** aggiunge i conteggi esatti, il processo osservato e il canale di notifica.
- **Dettagli tecnici**, in fondo in entrambe le modalità, contiene ogni valore grezzo. Premi **Copia** per una segnalazione di
  bug. Un valore lungo scorre al passaggio del mouse.

Ai giochi per emulatori di console non vengono richiesti un eseguibile Windows né i file del gioco.

Alcuni giochi non registrano nulla offline, qualunque sia la configurazione. Halo: Campaign Evolved e The Crew
Motorfest hanno gli obiettivi assegnati dai server dell'editore, quindi un crack non ne salva nessuno. Il loro
pannello lo dice fin dal primo avvio.

## I controlli {#the-checks}

| Controllo | A cosa risponde | Rimedio tipico |
|---|---|---|
| **File del gioco** | La cartella di installazione c'è ancora? | **Individua il gioco** |
| **Eseguibile** | Quale programma dovrebbe essere osservato mentre giochi? | **Individua il gioco** |
| **Identità del gioco** | A quale AppID e piattaforma è stato abbinato questo gioco? La modalità Semplice lo omette. | **Correggi il file identificativo del gioco** oppure **Imposta AppID manualmente** |
| **Dati obiettivi** | Esiste un elenco degli obiettivi ed è completo? | **Riscrivi i dati degli obiettivi** |
| **Configurazione emulatore** | Un gioco che richiede un emulatore Steam ne ha uno, e quale lo serve? Per un gioco Ubisoft comprende anche il loader Uplay e se ha mai chiesto un obiettivo. | **Installa il file dell'emulatore**, **Passa all'emulatore supportato** oppure **Ripara il supporto agli obiettivi Ubisoft** |
| **Avanzamento** | È già stato trovato qualche sblocco o salvataggio? | Avvia il gioco e sblocca qualcosa |
| **Contatori di progresso** | Per i giochi in stile CODEX/RUNE che tracciano una statistica invece di uno sblocco semplice, AW Next ha recuperato la statistica dietro ogni obiettivo? Mostrato solo per i giochi che ne usano una. | **Recupera i contatori di progresso** |
| **Rilevamento dell'avvio del gioco** | Il tracker in background si accorge di quando questo gioco si avvia? Da solo non registra alcuno sblocco: è compito dell'emulatore. | **Monitora questo gioco** |
| **Notifiche** | Quale canale ha consegnato l'ultima notifica per questo gioco e perché? | **Invia una notifica di prova** |

## Le riparazioni {#the-repairs}

Il pannello mostra solo le riparazioni che possono sistemare questo gioco. Ognuna dice che cosa cambierà e dove vengono conservati
i file precedenti. Nulla viene riscritto senza un backup o una conferma.

| Riparazione | Che cosa fa |
|---|---|
| **Individua il gioco** | Apre un selettore per scegliere l'eseguibile da osservare. |
| **Apri la cartella del gioco** | Apre la cartella di installazione in Esplora file. |
| **Riscrivi i dati degli obiettivi** | Scrive l'elenco degli obiettivi, le icone e le impostazioni dell'emulatore, copiando prima i file esistenti in un backup. |
| **Installa il file dell'emulatore** | Scarica nella cartella del gioco la build supportata dell'emulatore, conservando il file che sostituisce come `.bak`. |
| **Passa all'emulatore supportato** | Per un gioco servito da un altro crack che non ha registrato nulla: installa sopra di esso l'emulatore supportato e rinomina la configurazione di quel crack in `.bak`. |
| **Annulla il cambio di emulatore** | Compare ovunque sia stata eseguita una delle due precedenti. Rimette i file del gioco dalle loro copie `.bak` e toglie l'emulatore supportato. |
| **Correggi il file identificativo del gioco** | Riscrive `steam_appid.txt` quando l'emulatore annuncia un gioco e AW Next ne ha abbinato un altro. Chiede l'AppID giusto, suggerendo l'abbinamento di AW Next, e conserva il file precedente. |
| **Recupera i contatori di progresso** | Chiede a Steam quale statistica guida ogni obiettivo, per i giochi in stile CODEX/RUNE. Non scrive nulla nella cartella del gioco. |
| **Ripara il supporto agli obiettivi Ubisoft** | Per un gioco Ubisoft compatibile, riscrive la configurazione del loader, lo schema e il reindirizzamento dei salvataggi in un'unica transazione, con ogni file toccato salvato in backup. Vedi [Configurazione di Uplay](uplay-r2.md). |
| **Attiva gli obiettivi offline** | Per un gioco Ubisoft il cui log del loader dimostra che non ha mai chiesto un obiettivo perché si crede disconnesso. Aggiunge una chiave di sessione segnaposto all'INI accanto al gioco; premilo di nuovo per rimuoverla. Vedi [Configurazione di Uplay](uplay-r2.md#a-game-that-never-asks-for-an-achievement). |
| **Monitora questo gioco** | Aggiunge il gioco al tracker in background così che il tempo di gioco e gli sblocchi in tempo reale vengano registrati. |
| **Riattiva le notifiche di progresso** | Riattiva le notifiche di progresso per un gioco che avevi silenziato. |
| **Invia una notifica di prova** | Genera una notifica con il nome e la grafica di questo gioco, attraverso il canale che userebbe davvero. |

> [!IMPORTANT]
> Una discrepanza non è sempre colpa dell'emulatore: se è stato configurato di proposito per l'ID presente su disco,
> lascialo stare. **Imposta AppID manualmente** (tasto destro) risolve una discrepanza dovuta al nome della cartella una volta per tutte, invece
> di correggere il file ogni volta. Vedi [Configurazione Goldberg / GBE](emulator-setup.md#set-appid-manually).

## Stati comuni e cosa fare {#common-states-and-what-to-do}

| Il pannello dice | Che cosa significa di solito |
|---|---|
| *Impossibile trovare un elenco degli obiettivi* | Il gioco non ha obiettivi, oppure la sua sorgente è disattivata. Controlla **Impostazioni → Sorgente**. |
| *Questo gioco richiede un emulatore Steam e non ne è configurato nessuno* | Usa **Applica correzione emulatore** dal menu del tasto destro. Vedi [Configurazione Goldberg / GBE](emulator-setup.md). |
| *Manca il file dell'emulatore che lo legge* | **Installa il file dell'emulatore** inserisce il runtime corrispondente. |
| *L'elenco degli obiettivi non corrisponde a ciò che il gioco cercherà* | **Riscrivi i dati degli obiettivi**. È il risultato abituale di un aggiornamento di un repack. |
| *Non è ancora stato trovato alcun avanzamento degli obiettivi* | Normale per un gioco a cui non hai giocato dopo averlo configurato. Avvialo e sblocca qualcosa. |
| *AW Next non sta osservando questo gioco mentre è in esecuzione* | **Monitora questo gioco** lo aggiunge al tracker. |
| *Non è stato possibile inviare l'ultima notifica* | Invia una notifica di prova, poi vedi [Notifiche](notifications.md#if-a-test-or-unlock-does-not-appear). |
| *Windows ha nascosto l'ultima notifica durante la partita* | È andata direttamente nel Centro notifiche perché il gioco era a schermo intero o Non disturbare era attivo. Attiva le [Notifiche prioritarie](notifications.md#priority-windows-notifications), oppure usa Automatico o Overlay di gioco. |
| *Funziona - ripiego su Windows attivo* | Non è un difetto. La consegna Automatica ha scelto una notifica di Windows per questo gioco; vedi [come decide Automatico](notifications.md#how-automatic-decides). |
| *Il gioco non ha mai chiesto un obiettivo* | Legge la sua sessione Ubisoft vuota come disconnessa. **Attiva gli obiettivi offline** lo sblocca; non viene inviato nulla da nessuna parte. Avvia il gioco una volta dopo. |
| *Obiettivi offline attivi, avvia il gioco una volta* | L'impostazione è scritta e non è ancora stato giudicato nulla. Il pulsante accanto ora dice **Disattiva gli obiettivi offline**. |
| *Servito da ALI213, OnlineFix, GBE Fork…* | L'emulatore che sta davvero leggendo quel gioco, nominato dai suoi stessi file. A un gioco Ubisoft servito in questo modo non viene proposta una riparazione Uplay: il suo livello Uplay non è usato, non è rotto. Ciò comprende le release che mantengono il `steam_api64.dll` di Valve: una build RUNE che gira da `Steam\steamclient64.dll`, o una release VOICES38 che carica il proprio GBE Fork rinominato (`steam_api64.v38`); non installare mai l'emulatore sopra quest'ultima. Le build Ubisoft di online-fix vengono riconosciute, e una correzione degli obiettivi lì avverte che il gioco online potrebbe smettere di funzionare. |
| *Mancano solo alcune icone* | **Riscrivi i dati degli obiettivi** scarica le icone mancanti. |
| *Eseguito per oltre un'ora e nemmeno un obiettivo registrato* | Molto probabilmente il crack che serve il gioco non riporta mai gli obiettivi. Usa **Passa all'emulatore supportato** quando è offerto; altrimenti controlla che il gioco si avvii dalla propria cartella. |
| *File identificativo del gioco*, con un collegamento Steam a questo gioco | Steam avvia un collegamento non-Steam senza alcun `steam_appid.txt` accanto, quindi l'emulatore salva con un altro ID. **Riscrivi i dati degli obiettivi** scrive lì il file. |

---

**Avanti:** [Risoluzione dei problemi](troubleshooting.md) - per i problemi che Stato dei giochi non risolve da solo.

<div align="center">

[← Documentazione](README.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
