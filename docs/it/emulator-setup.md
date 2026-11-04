---
title: "Configurazione degli obiettivi Goldberg e GBE Fork"
description: "Diagnostica o ripara un gioco Steam emulato con Goldberg o GBE Fork, con un backup e una conferma prima di ogni scrittura."
---

# Configurazione degli obiettivi Goldberg e GBE Fork

AW Next legge i salvataggi degli obiettivi prodotti da Goldberg, GBE Fork e dalle strutture compatibili degli emulatori Steam.
Può anche diagnosticare e riparare la configurazione locale dell'emulatore di un gioco quando lo schema, l'
AppID o i file di runtime sono incompleti.

## Come ottengo le notifiche degli obiettivi con Goldberg o GBE Fork? {#how-do-i-get-achievement-notifications-with-goldberg-or-gbe-fork}

Goldberg e GBE Fork sono emulatori Steam: sostituiscono la libreria Steam e registrano gli sblocchi in un
file di salvataggio, `achievements.json`, in `%APPDATA%\GSE Saves\<appid>`. Un secondo file con lo stesso nome,
nella cartella `steam_settings` del gioco, descrive soltanto gli obiettivi. AW Next legge entrambi e mostra
il popup di sblocco sopra il gioco. Aggiungi la cartella del gioco in **Impostazioni → Cartelle**, esegui **Ricerca smart**
e fai clic con il pulsante destro sul gioco scegliendo **Diagnostica emulatore** se resta allo 0%. Nulla viene scritto nella
cartella del gioco finché non chiedi una riparazione.

> [!WARNING]
> Gli strumenti di riparazione sono facoltativi. Modificano file all'interno della cartella del gioco selezionato, quindi usali solo
> con giochi che possiedi e conserva ogni backup aggiuntivo che ti interessa.

## Lo schema e i file di salvataggio sono diversi {#schema-and-save-files-are-different}

Due file non correlati si chiamano comunemente `achievements.json`:

| | File dello schema | File di salvataggio di runtime |
|---|---|---|
| Posizione tipica | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` oppure `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| Scritto da | Il gioco o la configurazione dell'emulatore | L'emulatore mentre il gioco è in esecuzione |
| Scopo | Nomi, descrizioni e icone degli obiettivi | Quali obiettivi si sono sbloccati |
| Quando manca | La gestione degli obiettivi in gioco può essere incompleta; AW Next può usare un'altra sorgente di schema | Il gioco mostra 0% finché non viene scritto il primo sblocco |

Un file di schema non dimostra che sia stato sbloccato nulla, e un salvataggio di runtime senza voci ottenute è uno 0%
valido. Entrambe le cartelle di salvataggio possono esistere per un gioco: AW Next legge quella che contiene gli sblocchi. Se una configurazione GBE o
Goldberg reindirizza i salvataggi altrove (`local_save_path`), AW Next osserva la cartella in cui
finiscono.

## Procedura consigliata {#recommended-workflow}

1. Aggiungi la libreria dei giochi o la radice dei salvataggi in **Impostazioni → Cartelle**.
2. Esegui **Ricerca smart** o **Genera configurazioni**.
3. Se il gioco mostra dati mancanti, fai clic con il pulsante destro e scegli **Diagnostica emulatore**.
4. Leggi il rapporto prima di applicare una riparazione.
5. Usa **Applica fix emulatore** per installare la DLL di runtime e riparare insieme `steam_settings`.
6. Avvia il gioco, sblocca un obiettivo e aggiorna AW Next se necessario.

La configurazione automatica per i giochi appena scoperti è facoltativa in **Impostazioni → Emulatori → Steam / GBE
Fork**. Con essa disattivata, una scansione della libreria non scrive nulla in una cartella di gioco (nessuna DLL, nessun file di configurazione,
nemmeno un `achievements.json` mancante) finché non chiedi una riparazione.

<div align="center">
<picture><source srcset="../assets/shot/steam-gbe-panel-800.webp 800w, ../assets/shot/steam-gbe-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/steam-gbe-panel.png" width="720" height="529" alt="Impostazioni - Steam / GBE Fork"></picture><br>
<sub>Riparazione automatica, gli interruttori di DLC e identità, e lo strumento facoltativo per estrarre SteamStub</sub>
</div>

## Azioni del menu contestuale {#context-menu-actions}

<div align="center">
<picture><source srcset="../assets/shot/emulator-tools-800.webp 800w, ../assets/shot/emulator-tools.webp 1049w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/emulator-tools.png" width="560" height="336" alt="Menu contestuale Emulatore e strumenti" loading="lazy" decoding="async"></picture><br>
<sub>Tasto destro su un gioco → Emulatore &amp; strumenti</sub>
</div>

### Diagnostica emulatore {#diagnose-emulator}

Riporta il tipo di emulatore rilevato, l'AppID, la posizione di `steam_settings`, i conteggi di schema e salvataggi, le voci
o le icone mancanti, i percorsi di salvataggio personalizzati e le discrepanze degli AppID, e se il runtime installato è quello
che AW Next vi ha messo. La diagnosi è di sola lettura.

### Applica fix emulatore {#apply-emulator-fix}

Ripara la DLL di runtime e lo schema in un solo passaggio:

- scarica e mette in cache una release corrispondente di GBE Fork e installa l'architettura della DLL di cui il gioco ha bisogno
  (`steam_api.dll` o `steam_api64.dll`), conservando come backup qualsiasi file esistente;
- costruisce `steam_settings\achievements.json` (e la sua cartella `images`) in modo che corrisponda all'elenco degli obiettivi
  Steam, e scarica le icone;
- scrive `steam_appid.txt` quando manca;
- scrive i file di configurazione di GBE (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

Ogni file che sostituisce viene prima salvato in backup, e le riparazioni dello schema conservano anche copie con data e ora in
`steam_settings\.aw-backups`. Il runtime viene installato come una normale sostituzione di DLL; AW Next non
configura un launcher ColdClient separato.

Anche le build pacchettizzate di Unreal Engine vengono riparate allo stesso modo. I loro file Steam si trovano in
`Engine\Binaries\ThirdParty\Steamworks` invece che accanto all'eseguibile, e AW Next li trova, li installa
e li controlla lì.

### Proprietà dei DLC e identità dell'account {#dlc-ownership-and-account-identity}

Due interruttori in **Impostazioni → Emulatori → Steam / GBE Fork**, entrambi disattivati per impostazione predefinita e indipendenti dalla
riparazione automatica:

| Impostazione | Che cosa scrive |
|---|---|
| **Gestisci la proprietà dei DLC** | `configs.app.ini`, così l'emulatore segnala ogni DLC come posseduto |
| **Scrivi nome account e lingua** | Il nome del tuo account e la lingua, in `configs.user.ini` |

Nessuno dei due influisce sugli obiettivi. Lasciali disattivati per mantenere un gioco originale, o se gestisci a mano i DLC o l'identità.

La scheda **Identità dell'emulatore** sotto di essi mostra che cosa viene scritto:

| Campo | Che cosa fa |
|---|---|
| **Nome account** | Scritto finché **Scrivi nome account e lingua** è attivo. Vuoto usa il nome del tuo profilo AW Next. |
| **Steam ID** | Scritto finché quell'interruttore è attivo; vuoto mantiene quello proprio di ogni gioco. Il pulsante del dado ne crea uno valido a caso, e un errore di battitura viene segnalato mentre scrivi e mai scritto. |
| **Cartella dei salvataggi** | Si applica non appena ne scegli una: ogni gioco corretto o riparato da quel momento salva lì (`local_save_path`), e AW Next la osserva per le notifiche in tempo reale. Vuoto mantiene `%APPDATA%\GSE Saves`. |

Per annullare ciò che uno dei due interruttori ha scritto, fai clic con il pulsante destro su un gioco e scegli **Rimuovi la configurazione
dell'emulatore di AW Next**. Mostra esattamente che cosa rimuoverà prima di fare qualsiasi cosa. Rimuove solo la sezione
DLC, gli interruttori e le chiavi di identità aggiunti da AW Next, mantiene ogni valore impostato da te o dal repack, ed elimina
un file solo quando al suo interno non resta nient'altro.

### Usare una tua DLL dell'emulatore {#using-your-own-emulator-dll}

**Impostazioni → Emulatori → DLL dell'emulatore** importa la tua `steam_api.dll` o `steam_api64.dll` e
la installa al posto della build di GBE Fork scaricata, a ogni correzione e a ogni correzione automatica. L'
architettura che non importi continua a provenire dalla build ufficiale, come gli strumenti dell'interfaccia.

Un file importato viene riconvalidato a ogni uso: deve essere un vero PE dell'architettura indicata dal suo nome
e deve essere una DLL di emulatore Steam. Un file che non supera il controllo viene segnalato e ignorato, mai
installato. **Usa la versione ufficiale** rimuove l'importazione e torna alla release scaricata.

### Rimuovi DRM Steam (Steamless) {#remove-steam-drm-steamless}

Prova a decomprimere SteamStub dall'eseguibile selezionato quando una sostituzione di DLL non riesce a caricarsi. L'eseguibile originale
viene conservato come `*.steamstub.bak`. Non fa nulla per i giochi senza SteamStub e non aggira i
controlli di proprietà lato server.

### Backup e ripristino {#back-up-and-restore}

Fai clic con il pulsante destro su **Esegui il backup di GBE/Goldberg** per salvare un'istantanea della DLL attuale e dei file `steam_settings`, oppure
**Ripristina l'ultimo backup di GBE/Goldberg** per recuperarne uno. Un backup segnala quando la cartella conteneva già
una configurazione scritta da AW Next, così non viene mai scambiato per l'originale intatto.

## Imposta AppID manualmente {#set-appid-manually}

Quando il nome della cartella di un gioco corrisponde a più release di Steam e l'abbinamento automatico ha scelto quella sbagliata,
fai clic con il pulsante destro e scegli **Imposta AppID manualmente**. L'AppID viene scritto in `steam_appid.txt` e
ricordato per quella cartella di installazione, così le riparazioni successive lo usano invece di tirare a indovinare di nuovo. **Cancella l'AppID
manuale**, nello stesso menu, lo rimuove.

## Problemi comuni {#common-problems}

### Il gioco manca {#the-game-is-missing}

- Avvia l'emulatore una volta così che crei un salvataggio di runtime, oppure aggiungi la vera libreria del gioco così che il rilevamento possa
  trovare `steam_settings`, `steam_appid.txt` o la DLL dell'API Steam.
- Verifica che la cartella aggiunta nelle Impostazioni sia abbastanza in alto da contenere la cartella del gioco, ma non un intero
  disco di dati estranei.
- Esegui **Genera configurazioni** e controlla il numero di risultati.

### Ogni obiettivo resta bloccato {#every-achievement-remains-locked}

Controlla queste cause in ordine:

1. **Non si è ancora sbloccato nulla.** Un salvataggio di runtime assente o vuoto è previsto.
2. **I nomi dello schema non corrispondono alle chiavi del salvataggio.** Esegui **Diagnostica emulatore**, poi ripara lo schema.
3. **Il percorso di salvataggio è personalizzato.** Indica ad AW Next la vera radice dei salvataggi oppure rimuovi la
   sostituzione segnaposto.
4. **L'AppID è sbagliato.** Usa **Imposta AppID manualmente** prima di eseguire un'altra riparazione.

### Mancano descrizioni o icone {#descriptions-or-icons-are-missing}

Esegui una riparazione completa con il download delle icone attivo. Quando i metadati online non sono disponibili, AW Next può riutilizzare uno
schema locale valido, ma non può inventare descrizioni che nessuna sorgente possiede.

### Le notifiche in gioco mancano ma la libreria si aggiorna {#in-game-notifications-are-missing-but-the-library-updates}

AW Next legge il salvataggio di runtime, ma lo schema dell'emulatore del gioco o il suo overlay possono essere incompleti. Verifica
che `steam_settings\achievements.json` abbia gli stessi nomi API del salvataggio di runtime e percorsi di icona
validi.

## Limitazioni {#limitations}

Alcuni giochi non riportano affatto gli obiettivi tramite Steamworks, anche se venduti su Steam, e non possono
essere tracciati tramite un percorso di salvataggio Goldberg o GBE. AW Next inoltre non può riparare un gioco la cui vera identità
o il cui schema di obiettivi non riesce a risolvere in modo sicuro.

Il [riferimento tecnico Goldberg/GBE](../goldberg-gbe.md) tratta i formati di file, le regole di rilevamento e i
dettagli di implementazione.

---

**Avanti:** [Configurazione Uplay, R1 e R2](uplay-r2.md), l'equivalente per Ubisoft per i giochi che non caricano
`steam_api.dll`.

<div align="center">

[← Documentazione](README.md) · [Riferimento tecnico](../goldberg-gbe.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
