---
title: "Guida al controller"
description: "Usa un controller Xbox, PlayStation o Switch per guidare Achievement Watcher Next e il suo overlay di gioco, e senti uno sblocco attraverso la vibrazione."
---

# Guida al controller (gamepad)

Un gamepad può guidare due posti distinti: la finestra principale e l'overlay di gioco. Entrambi si configurano in
**Impostazioni → Controller**.

<div align="center">
<picture><source srcset="../assets/shot/controller-panel-800.webp 800w, ../assets/shot/controller-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/controller-panel.png" width="720" height="529" alt="Impostazioni - Controller"></picture><br>
<sub>Navigazione dell'overlay e dell'app, layout e associazioni dei pulsanti per ogni scorciatoia</sub>
</div>

## I due interruttori {#the-two-switches}

| Impostazione | Predefinito | Che cosa riguarda |
|---|---|---|
| **Controlla l'app con il controller** | Attivo | La finestra principale di AW Next: libreria, dettagli dei giochi, impostazioni e ricerche. |
| **Controlla l'overlay di gioco con un controller** | Disattivo | L'overlay di gioco, pilotato dal tracker in background mentre giochi. |

La navigazione dell'app è un normale input della finestra e non costa nulla, quindi è attiva per impostazione predefinita. Il controllo dell'overlay carica
lo stack nativo del controller nel tracker in background, quindi è facoltativo.

## Scorciatoie in sintesi {#shortcuts-at-a-glance}

I nomi dei pulsanti usano il vocabolario Xbox; l'app li mostra nel layout che selezioni.

<div align="center">
<img src="../assets/img/controller-map.svg" width="700" height="422" alt="Un gamepad con le scorciatoie predefinite: LT apre Stato dei giochi, RT avvia il gioco, LB e RB cambiano scheda delle impostazioni, la croce direzionale sposta la selezione, A conferma, B annulla, X cerca, Y e Start aprono le Impostazioni, più le tre combinazioni dell'overlay" loading="lazy">
</div>

| Scorciatoia | Predefinito | Dove |
|---|---|---|
| Apri / chiudi l'overlay | **Back + Start + LB** | In gioco |
| Attiva la navigazione dell'overlay | **LB + X** | Overlay aperto |
| Sposta e scorri l'overlay | **LB + RB** (tenuti premuti) | Overlay aperto |
| Conferma | **A** | App + overlay |
| Indietro / annulla | **B** | App + overlay |
| Metti a fuoco la casella di ricerca | **X** | App + overlay |
| Apri le Impostazioni / le opzioni dell'overlay | **Y** | App + overlay |
| Apri le Impostazioni | **Start** | App |
| Avvia il gioco selezionato | **RT** | App, libreria |
| Apri Stato dei giochi per il gioco selezionato | **LT** | App, libreria |
| Scheda precedente / successiva delle impostazioni | **LB** / **RB** | App, Impostazioni aperte |
| Scorri la pagina | **LB** / **RB** | App, Impostazioni chiuse |

L'attivazione dell'overlay usa tre pulsanti, così non può scattare per caso durante una partita. Ogni scorciatoia dell'overlay
è configurabile e accetta da uno a tre pulsanti.

Nella libreria, la levetta si sposta tra i riquadri e **A** apre il gioco, come un clic. I due
controlli disegnati su un riquadro corrispondono ai grilletti: **RT** avvia il gioco selezionato e **LT** apre
il suo pannello Stato dei giochi. Entrambi non fanno nulla se non è selezionato un riquadro della libreria.

## Opzioni {#options}

- **Layout controller**: il vocabolario per i suggerimenti e i nomi dei pulsanti. **Auto** segue il pad collegato
  quando può essere identificato; gli altri sono **Xbox**, **PlayStation** e **Switch**.
- **Backend del controller**: **Automatico** sceglie il miglior backend di input disponibile, **XInput** è il più
  compatibile e **GameInput** si adatta alle versioni più recenti di Windows.
- **Associazioni**: da uno a tre pulsanti per ogni scorciatoia. Le scorciatoie possono condividere un pulsante (quelle predefinite lo fanno:
  **LB + X** e **LB + RB** usano entrambe LB), e il livello di input fa in modo che tenere premuta una combinazione non
  faccia scattare l'altra. Un pulsante ripetuto in una stessa associazione conta una volta sola. L'attivazione dell'overlay accetta anche
  il pulsante **Guide**; le due modalità dell'overlay no, perché l'API gamepad del browser che le legge
  non lo segnala in modo affidabile.
- **Metti a fuoco l'overlay all'apertura**: dà all'overlay il focus della tastiera, il che mette in pausa molti giochi che
  perdono il focus. Disattivato per impostazione predefinita.
- **Invia Esc al gioco all'apertura con il controller**: invia la pressione del tasto Esc al gioco
  in primo piano appena prima che si apra l'overlay, così molti giochi vanno in pausa o aprono il loro menu. Viene eseguito solo per le aperture
  avviate dal controller mentre un gioco è in esecuzione, mai per la scorciatoia da tastiera. Disattivato per impostazione predefinita.

## Finestra dell'app {#app-window}

Con la navigazione dell'app attiva, premere un qualsiasi pulsante del gamepad nella finestra principale fa comparire un anello di selezione. La
croce direzionale o la levetta sinistra si sposta tra i controlli, e valgono le scorciatoie sopra. Due dettagli:

- **B** esce prima da un campo di testo selezionato, poi torna indietro o annulla, così puoi uscire dalla casella
  di ricerca senza il mouse.
- **LB** / **RB** cambiano scheda delle impostazioni mentre le Impostazioni sono aperte e scorrono la pagina quando sono chiuse.

Muovere il mouse o premere un tasto della tastiera restituisce il controllo al mouse e alla tastiera.

## Overlay di gioco {#in-game-overlay}

**Back + Start + LB** apre o chiude l'overlay sopra il gioco in esecuzione. **LB + X** attiva poi
la modalità di navigazione: la croce direzionale o la levetta sinistra sposta l'anello di selezione, **A** conferma, **B** annulla, **X**
porta il cursore nella ricerca e **Y** apre il pannello delle opzioni. Tenendo premuti **LB + RB** si sposta l'overlay con la
levetta sinistra e si scorre l'elenco con la levetta destra.

Un piccolo badge **UI** compare nell'intestazione mentre la navigazione è attiva, e la barra dei suggerimenti mostra le tue
associazioni e il tuo layout. Il resto dell'overlay è nella [guida all'overlay](overlay.md).

> [!IMPORTANT]
> Windows non permette a un'app di terze parti di catturare un controller in modo esclusivo, quindi il gioco potrebbe comunque
> ricevere l'input dei pulsanti mentre l'overlay è aperto. Per mettere in pausa il gioco, attiva **Metti a fuoco l'overlay
> all'apertura** (la maggior parte dei giochi va in pausa quando perde il focus) oppure **Invia Esc al gioco all'apertura
> con il controller**.

## Pad supportati {#supported-pads}

Sono supportati i controller Xbox, PlayStation DualShock 4 / DualSense e Switch Pro. I pad Xbox
passano da XInput; i pad PlayStation e Switch vengono letti tramite HID grezzo, quindi non richiedono alcun
driver del produttore.

## Quando un controller non viene rilevato {#when-a-controller-is-not-detected}

1. Verifica che l'interruttore giusto sia attivo: la navigazione dell'app e il controllo dell'overlay sono separati.
2. Prova esplicitamente il backend **XInput**; **Automatico** può scegliere GameInput su una build in cui un dato pad
   non viene enumerato.
3. Controlla il pad nel pannello dei controller di gioco di Windows (`joy.cpl`). Se Windows non lo vede, nemmeno AW Next
   può vederlo.
4. Per una segnalazione di bug, aggiungi `debugLogging = true` alla sezione `[controller]` di
   `%APPDATA%\Achievement Watcher Next\cfg\options.ini` e riavvia. Il tracker in background scrive allora nel log
   la diagnostica a livello di pulsante. Non c'è un interruttore nell'interfaccia perché l'output è molto prolisso; disattivalo
   dopo.

---

**Avanti:** [Stato dei giochi](game-health.md) - il pannello per ogni gioco che dice perché un gioco è o non è
tracciato.

<div align="center">

[← Documentazione](README.md) · [Guida all'overlay](overlay.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## Su Linux {#on-linux}

Su Linux AW Next legge i gamepad dai dispositivi di input del kernel, e le scorciatoie sopra funzionano allo stesso
modo. Mentre Steam Input è in esecuzione, legge solo i pad virtuali di Steam, così una pressione non viene contata due volte. Lo
Steam Deck e il plugin Decky sono trattati in [Linux e Steam Deck](linux.md#steam-deck).
