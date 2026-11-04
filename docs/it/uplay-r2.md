---
title: "Configurazione Goldberg Uplay, R1 e R2"
description: "Configura gli obiettivi dei giochi Ubisoft compatibili con i loader Uplay R1 e R2, e ripara tutto in sicurezza."
---

# Configurazione Goldberg Uplay (R1 e R2)

AW Next ha una riparazione separata per i giochi Ubisoft che girano con l'emulatore Goldberg Uplay. Non
tocca mai le installazioni ufficiali di Ubisoft Connect: un gioco viene selezionato solo dopo che AW Next ha dimostrato il
loader e la generazione esatti che usa.

Un gioco Ubisoft carica soltanto la generazione di loader con cui è stato collegato il suo eseguibile: all'incirca dal 2019
in poi è **R2**, tutto ciò che viene prima è **R1**. AW Next rileva e ripara quella che si applica, perché
la generazione sbagliata inserirebbe una DLL che il gioco non apre mai. Un gioco Ubisoft con due id di prodotto (un
gioco base e la sua Complete Edition) funziona in entrambi i casi: viene letto un salvataggio sotto uno qualsiasi degli id, e un id di obiettivo
nudo al suo interno viene abbinato all'elenco degli obiettivi Steam.

> [!WARNING]
> La riparazione modifica i file del gioco. Usala solo con giochi che possiedi.

## Riparare un gioco {#repair-a-game}

Da **Stato dei giochi**:

1. Aggiungi la libreria del gioco in **Impostazioni → Cartelle** ed esegui la scansione.
2. Apri il pannello **Stato dei giochi** del gioco e controlla **Diagnostica configurazione Uplay R1/R2**.
3. Esegui **Applica la correzione per gli obiettivi Ubisoft** e avvia il gioco una volta.

Da **Impostazioni → Emulatori → Ubisoft / Uplay R1/R2**:

<div align="center">
<picture><source srcset="../assets/shot/uplay-r2-panel-800.webp 800w, ../assets/shot/uplay-r2-panel.webp 928w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/uplay-r2-panel.png" width="720" height="536" alt="Impostazioni - Ubisoft / Uplay R2"></picture><br>
<sub>Il pacchetto di riparazione integrato viene verificato prima che qualsiasi gioco venga toccato</sub>
</div>

- **Correggi automaticamente i nuovi giochi rilevati**: l'interruttore mostrato anche sotto Steam / GBE Fork, applicato
  anche ai giochi Ubisoft. Disattivato per impostazione predefinita.
- **Ripara i giochi Uplay R1/R2 rilevati**: ripara ogni installazione rilevata in un unico blocco confermato.
- **Importa o sostituisci DLL** / **Ripristina DLL integrate**: usa una tua build del loader, oppure torna a
  quella fornita da AW Next. Una DLL selezionata manualmente non richiede un'impronta SHA-256 nota, ma deve essere un
  loader Uplay valido e in grado di gestire gli obiettivi, con un nome e un'architettura coerenti.

Le DLL integrate si trovano in `app/resources/uplayR2/` (R2) e `app/resources/uplayR1/` (R1). AW Next
ne controlla gli hash, l'architettura PE e la capacità di gestire gli obiettivi prima che una riparazione possa usarle, e
conserva un archivio di ripristino accanto ad esse.

La stessa transazione di riparazione viene eseguita dal menu contestuale, da Stato dei giochi, dalla riparazione automatica, da Correggi tutto e dal
pulsante di riparazione in blocco. Salva un'istantanea di ogni DLL, schema e INI modificato in `<game>\.aw-backups\<timestamp>\`
e li ripristina automaticamente se la convalida fallisce in seguito. Ripetere una riparazione identica
non ha alcun effetto.

## Collegare un gioco non abbinato alla sua release Steam {#linking-an-unmapped-game-to-its-steam-release}

AW Next abbina da solo la maggior parte dei giochi Ubisoft alla loro release Steam, per convertire i nomi degli obiettivi
Steam negli ID degli obiettivi Ubisoft che il loader si aspetta. Quando non ci riesce, scegli tu la release
con **Identifica il gioco (ID app Steam)** nel menu del tasto destro del gioco. Un abbinamento che non può essere
confermato viene rifiutato, perché uno sbagliato scriverebbe l'elenco degli obiettivi di un altro gioco nella cartella
di questo gioco.

Aprire una volta la pagina degli obiettivi del gioco in Ubisoft Connect può aiutare AW Next a riconoscere un titolo che
ne ha bisogno, come Brawlhalla o The Crew 2. La scelta che confermi viene ricordata per quella esatta
cartella di installazione. L'abbinamento automatico (la mappa integrata, il catalogo Ubisoft in tempo reale e la
regola di abbinamento dei titoli) è descritto nel [riferimento Uplay R1/R2](../uplay-reference.md).

## Un gioco che non chiede mai un obiettivo {#a-game-that-never-asks-for-an-achievement}

Alcuni titoli Ubisoft chiedono prima al loader la sessione Ubisoft, e il loader risponde da una chiave
vuota. Quei giochi leggono la chiave vuota come disconnessione e non chiamano mai l'API degli obiettivi. La configurazione
sembra corretta e non viene registrato nulla. Avatar: Frontiers of Pandora si comporta così.

Quando il log diagnostico di Stato dei giochi lo dimostra, propone **Attiva gli obiettivi offline** nel controllo
Configurazione emulatore. Aggiunge una chiave di sessione segnaposto accanto al gioco: non è una vera sessione
Ubisoft, non c'è alcun account coinvolto, non viene inviato nulla da nessuna parte, solo quanto basta per superare quel controllo. Non viene mai
aggiunta automaticamente, perché un token non legittimo può rompere alcuni giochi.

**Avvia il gioco una volta dopo averla attivata.** Fino ad allora la riga dice *Obiettivi offline attivi,
avvia il gioco una volta*. Il pulsante accanto dice poi **Disattiva gli obiettivi offline**, che toglie
di nuovo la chiave.

Questo vale solo per i loader R2; l'INI di R1 porta una chiave non correlata. La [guida Goldberg / GBE](emulator-setup.md)
tratta l'equivalente Steam di questa riparazione.

## Gli obiettivi restano allo 0% {#achievements-remain-at-0}

- Esegui di nuovo **Diagnostica configurazione Uplay R1/R2** dopo un aggiornamento del gioco, perché gli aggiornamenti spesso rimuovono lo schema
  o azzerano il conteggio degli sblocchi.
- Leggi `upc_r2.log` (o `upc_r1.log`) accanto alla DLL del loader: registra ogni numero di obiettivo che il
  gioco richiede. Tieni attivo il **Registro diagnostico**, in **Impostazioni → Emulatori → Ubisoft / Uplay R1/R2**.
  Stato dei giochi ne ha bisogno per distinguere un gioco che non ha mai chiesto nulla da uno che chiede un obiettivo che lo schema
  non contiene. È attivo per impostazione predefinita, e AW Next accorcia il log quando supera i 25 MB.
- Controlla `%APPDATA%\Achievement Watcher Next\logs\parser.log`.

## Nota sull'antivirus {#antivirus-note}

Se un software antivirus rimuove una DLL del loader sciolta, o mette in quarantena l'archivio di ripristino a metà, Stato dei
giochi segnala un problema dell'antivirus e propone di consentire la cartella e rimettere a posto i file. Non devi
cercare tu un sostituto.

Identità, ID degli obiettivi e log del loader sono trattati nel [riferimento Uplay R1/R2](../uplay-reference.md).

<div align="center">

[← Documentazione](README.md) · [Risoluzione dei problemi](troubleshooting.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
