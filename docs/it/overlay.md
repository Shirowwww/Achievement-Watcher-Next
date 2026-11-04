---
title: "Elenco degli obiettivi in gioco (overlay)"
description: "L'elenco degli obiettivi in gioco aperto con Ctrl+Shift+K: ricerca, filtri, rarità, descrizioni nascoste e personalizzazione."
---

# Elenco degli obiettivi in gioco (overlay)

L'overlay di gioco (`Ctrl+Shift+K` per impostazione predefinita mentre è in esecuzione un gioco supportato) mostra l'elenco
degli obiettivi del gioco in corso senza uscirne: nomi, descrizioni, stato di blocco, date di sblocco e
avanzamento. Trascinalo dall'intestazione; resta in primo piano sopra il gioco. Su Linux, un gioco in esecuzione nativa
sotto Wayland non passa oltre la scorciatoia: associa invece `~/.local/bin/achievement-watcher --toggle-overlay`
a un tasto, come mostra [Scorciatoia dell'overlay](linux.md#overlay-shortcut).

<div align="center">
<picture><source srcset="../assets/shot/overlay.webp 569w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/overlay.png" width="360" height="633" alt="Elenco degli obiettivi nell'overlay di gioco"></picture><br>
<sub>Colonne di stato, rarità e data, con ricerca e filtri</sub>
</div>

## Come apro l'elenco degli obiettivi in un gioco? {#how-do-i-open-the-achievement-list-in-a-game}

Premi `Ctrl+Shift+K` mentre è in esecuzione un gioco supportato. È la scorciatoia predefinita. L'overlay elenca ogni
obiettivo di quel gioco con il suo stato, la data di sblocco, la rarità e l'avanzamento, e puoi cercarvi dentro.
Premi di nuovo la scorciatoia per chiuderlo. Con un controller, quella predefinita è **Back + Start + LB**.

Su Linux sotto Wayland, un gioco in esecuzione come finestra Wayland nativa non passa mai il tasto ad AW Next.
Associa invece `~/.local/bin/achievement-watcher --toggle-overlay` a un tasto nelle impostazioni della tastiera
del tuo desktop. Vedi [Scorciatoia dell'overlay](linux.md#overlay-shortcut).

## L'overlay è lo stesso del popup di sblocco? {#is-the-overlay-the-same-as-the-unlock-popup}

No. Il popup è una notifica singola che compare quando qualcosa si sblocca, con lo stile di un preset (vedi
[Notifiche](notifications.md)). L'overlay è l'elenco completo di un gioco, aperto da te, e
resta finché non lo chiudi.

## Che cosa mostra {#what-it-shows}

- Una barra di statistiche con `sbloccati / totale` e la percentuale di completamento.
- Una riga per ogni obiettivo con una pillola di stato colorata (`Sbloccato` / `Bloccato`), la data di sblocco per gli
  obiettivi ottenuti e una barra di avanzamento con un'etichetta `current / max` per gli obiettivi a progresso.
- Un badge di rarità (`★ 12.3%`) per ogni obiettivo con una percentuale di sblocco nota. Gli obiettivi comuni usano
  un badge grigio scuro; quelli rari usano oro, argento e bronzo con un morbido alone, al 5%, 10% e 15% per
  impostazione predefinita. **Impostazioni → Generale → Visualizzazione della rarità** cambia i livelli o passa ai gradi dei trofei.

## Obiettivi nascosti {#hidden-achievements}

L'overlay non rivela un obiettivo nascosto che non hai sbloccato: come nella finestra principale, la sua
descrizione dice *Nascosto - clicca per rivelare*. Fai clic su di essa, oppure premi **A** su un controller, per rivelare
solo quella descrizione. La ricerca ignora le descrizioni ancora nascoste.

<div align="center">
<picture><source srcset="../assets/shot/overlay-hidden-800.webp 800w, ../assets/shot/overlay-hidden.webp 1162w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/overlay-hidden.png" width="560" height="482" alt="L'elenco dell'overlay due volte: descrizioni nascoste mascherate, poi una rivelata" loading="lazy" decoding="async"></picture><br>
<sub>Prima e dopo un clic su "We've all been there before...": viene rivelata solo quella descrizione</sub>
</div>

## Ricerca e filtri {#search-and-filters}

- La casella di ricerca filtra le righe per nome e descrizione dell'obiettivo mentre scrivi.
- Le pillole sopra l'elenco passano da **Tutti** a **Sbloccati**, **Bloccati** e **In corso**.
- Fare clic sull'intestazione di colonna **Rarità**, **Data** o **Stato** ordina in senso crescente, poi decrescente,
  poi torna all'ordine naturale. Si ordina una sola colonna alla volta.
- `/` porta il cursore nella casella di ricerca. `Esc` la svuota, oppure chiude il pannello delle opzioni se è aperto.

## Controller (gamepad) {#controller-gamepad}

Attiva **Controlla l'overlay di gioco con un controller** in **Impostazioni → Controller** per usare
l'overlay con un gamepad. Con le associazioni predefinite:

- **Back + Start + LB** apre o chiude l'overlay.
- **LB + X** attiva o disattiva la modalità di navigazione: un anello di selezione mostra dove ti trovi e un piccolo badge **UI**
  compare nell'intestazione dell'overlay.
- In modalità di navigazione, la croce direzionale o la levetta sinistra sposta la selezione, **A** conferma, **B** annulla, **X**
  porta il cursore nella ricerca e **Y** apre il pannello delle opzioni.
- Tenendo premuti **LB + RB** si sposta l'overlay con la levetta sinistra e si scorre l'elenco con la levetta
  destra.

Ogni scorciatoia è configurabile, i nomi dei pulsanti seguono la disposizione che scegli e la barra dei suggerimenti
dell'overlay mostra le tue associazioni. La [guida al controller](controller.md) descrive le impostazioni, i pad supportati
e l'avvertenza di Windows sul fatto che il gioco continua a vedere la pressione dei tuoi pulsanti.

## Personalizzazione {#customization}

Il pulsante **⚙** nell'intestazione dell'overlay apre le opzioni:

- **Accento**: cinque preset di colore, un selettore di colore personalizzato oppure **Usa il tema dell'app** per seguire il tema
  della finestra principale (usato per l'avanzamento, i filtri attivi, gli anelli di selezione e il bagliore delle righe sbloccate).
- **Densità**: spaziatura delle righe Compatto, Accogliente o Spazioso.
- **Dimensione icone**: Piccola, Media o Grande.
- **Zoom**: dall'80% al 125% della dimensione del pannello.
- **Opacità**: dal 40% al 100% dello sfondo del pannello.
- **Interruttori di visualizzazione** per la barra delle statistiche, le barre di avanzamento, i badge di rarità e le descrizioni.

Le modifiche si applicano subito e vengono salvate in locale. **Ripristina** riporta l'aspetto originale. Le
opzioni funzionano da tastiera: i menu di zoom e opacità mostrano un anello di selezione, gli interruttori si attivano con
Tab e Spazio, e le animazioni seguono l'impostazione di riduzione del movimento del sistema.

## Scorciatoie da tastiera (overlay aperto) {#keyboard-shortcuts-overlay-open}

- `Ctrl+Alt+Shift+Frecce` - sposta di poco la finestra dell'overlay.
- `Ctrl+Alt+Shift+1` … `5` - aggancia a una posizione predefinita.
- `Ctrl+Alt+Shift+C` - attiva o disattiva il click-through.

## Note {#notes}

- L'overlay segue la lingua dell'interfaccia selezionata nell'app.
- Dopo la prima apertura, la finestra dell'overlay viene tenuta nascosta e riutilizzata per 5 minuti, quindi riattivarla
  è quasi istantaneo. Mentre è nascosta mette in pausa il polling del controller e, dopo 5 minuti di
  inattività, la finestra viene rilasciata per liberare memoria.
- Il contenuto delle righe viene sottoposto a escaping prima del rendering; i dati degli obiettivi vengono solo mostrati, mai eseguiti.
- L'elenco dell'overlay è separato dai preset delle *notifiche* singole dell'overlay (Impostazioni →
  Notifiche), dove si configura l'aspetto del popup.

---

**Avanti:** [Guida al controller](controller.md) - usare l'overlay e l'app con un gamepad.

<div align="center">

[← Documentazione](README.md) · [Guida alle notifiche](notifications.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
