---
title: "FAQ sul tracker di obiettivi"
description: "Risposte brevi su account, sorgenti, notifiche, sicurezza, backup e piattaforme supportate da Achievement Watcher Next."
---

# FAQ sul tracker di obiettivi

Risposte brevi alle domande più comuni. Ognuna rimanda alla guida che la tratta.

## Per cominciare {#getting-set-up}

### Mi serve una chiave Steam Web API, o devo accedere a Steam? {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
No. Gli elenchi degli obiettivi provengono da una catena di endpoint pubblici che non richiede chiavi, e nulla richiede un
account. I tuoi sblocchi Steam vengono letti dalle statistiche che Steam conserva su questo PC, quindi un profilo privato
funziona per ogni gioco giocato qui. Collegare Steam è facoltativo: aggiunge i giochi giocati solo sugli
altri tuoi PC e Steam Family. Vedi [Account collegati](sources.md#connected-accounts).

### Su quali piattaforme funziona? {#which-platforms-does-it-run-on}
Windows 10 e 11, e Linux (x64). Le release includono il proprio runtime. Node.js serve solo per
compilare dal codice sorgente.

### Funziona su Linux o su Steam Deck? {#does-it-run-on-linux-or-the-steam-deck}
Su Linux sì, come beta: un AppImage nativo (mai eseguito tramite Wine) per GNOME e KDE Plasma, sotto
Wayland o X11. Trova i giochi avviati con Steam e Proton, Wine, Lutris, Heroic o Bottles, e si aggiorna
da solo dalle stesse release dell'app per Windows. Su Steam Deck il supporto è nuovo e non è stato
verificato su un vero Deck. Vedi [Linux e Steam Deck](linux.md).

### Supporta RetroAchievements? {#does-it-support-retroachievements}
Sì. Attiva la sorgente **RetroAchievements**, collega il tuo account con nome utente e chiave Web API,
e **Importa libreria** porta dentro ogni gioco che hai giocato. I nuovi sblocchi vengono annunciati mentre è in esecuzione un qualsiasi
emulatore compatibile con RetroAchievements. Vedi [RetroAchievements](sources.md#retroachievements).

### Mostra i trofei PlayStation? {#does-it-show-playstation-trophies}
Sì. Collega il tuo account PlayStation in **Impostazioni → Sorgente** (accedi sulla pagina di Sony) e i tuoi
giochi e trofei vengono importati, con la percentuale di Sony per ogni trofeo. Un gioco di un'altra sorgente che è
uscito anche su PlayStation mostra il vero platino del suo elenco. Vedi
[Account collegati](sources.md#connected-accounts).

### Devo collegare un account? {#do-i-have-to-connect-an-account}
No. Steam, Epic, Xbox PC e PlayStation possono essere collegati per leggere ciò che i file locali non contengono,
e RetroAchievements chiede il tuo nome utente e la chiave Web API. Ogni token e chiave viene cifrato prima di
essere salvato su questo PC. Tutto il resto funziona senza account.

### Funziona offline? {#does-it-work-offline}
Sì, per le sorgenti locali e per tutto ciò che è già in cache. Nomi, descrizioni e grafica degli obiettivi vengono
recuperati una volta, poi riutilizzati da `%APPDATA%\Achievement Watcher Next\steam_cache`
(`~/.config/Achievement Watcher Next/steam_cache` su Linux).

### Perdo qualcosa scegliendo la modalità Semplice? {#do-i-lose-anything-by-choosing-simple-mode}
No. Semplice nasconde dei controlli e non disattiva mai una funzione. Nulla di ciò che scansiona, osserva o viene salvato
cambia, e tornare indietro ripristina ogni controllo con il suo valore. Vedi
[Per iniziare](getting-started.md#simple-and-advanced).

### Può mostrare i giochi che possiedo ma non ho mai installato, o gli sblocchi di un altro PC? {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
Sì. Con la sorgente Steam impostata su **Posseduti**, due interruttori nella scheda dell'account Steam, **Aggiungi i giochi
che possiedi** e **Aggiungi i giochi condivisi con te tramite Steam Family**, elencano l'intera libreria. Entrambi
sono disattivati per impostazione predefinita perché una libreria grande allunga molto la prima scansione. Con un account Steam
collegato, un gioco senza nulla da leggere in locale viene letto dal tuo profilo Steam (i dettagli del gioco
devono essere pubblici) e la risposta resta in cache per sei ore. Vedi
[Account collegati](sources.md#connected-accounts).

## La libreria {#the-library}

### Manca un gioco {#a-game-is-missing}
Verifica che la sua sorgente sia attiva in **Impostazioni → Sorgente**, esegui **Ricerca smart** in **Impostazioni →
Cartelle** e disattiva **Mostra solo i giochi installati** per vedere se il gioco è noto ma non più
installato. L'elenco completo dei controlli è in [Risoluzione dei problemi](troubleshooting.md#a-game-is-missing).

### Un gioco mostra "Nessun obiettivo" {#a-game-shows-no-achievements}
Quel gioco non ha un set di obiettivi. Resta avviabile e continua a tracciare il tempo di gioco, ed è escluso
dalle statistiche di completamento invece di contare come 0%. Il suo riquadro mostra la grafica al posto della barra di avanzamento.
**Impostazioni → Aspetto → Riquadri della libreria → Barra dei giochi senza obiettivi** riporta la
barra.

### Un gioco mostra 0% anche se ho sbloccato degli obiettivi {#a-game-shows-0-although-i-have-unlocked-achievements}
Il gioco ha uno schema ma nessun file di sblocchi in esecuzione. Apri il suo pannello [Stato dei giochi](game-health.md): indica
il pezzo mancante e propone solo le riparazioni che si applicano.

### Perché lo stesso gioco compare due volte? {#why-does-the-same-game-appear-twice}
È stato trovato tramite due sorgenti. **Unisci duplicati** in Impostazioni → Generale li combina. Se una
voce è una cartella di salvataggi vecchia di un gioco che ora possiedi altrove, mettila nella lista nera.

### Un aggiornamento del gioco ha aggiunto obiettivi e non li vedo {#a-game-update-added-achievements-and-i-do-not-see-them}
Un elenco in cache si ricontrolla da solo ogni 3 giorni. Per rilevare subito quelli nuovi, usa **Impostazioni → Avanzate →
Riverifica elenchi obiettivi**, che funziona anche con **Aggiornamenti automatici dei dati sugli obiettivi** disattivati. Nessuno dei due
controlli rimuove nulla di ciò che è già in cache.

### Un gioco è stato abbinato alla release Steam sbagliata {#a-game-was-matched-to-the-wrong-steam-release}
Fai clic con il pulsante destro e scegli **Imposta AppID manualmente...**. L'AppID viene scritto in `steam_appid.txt` e
ricordato per quella cartella di installazione. Vedi [Impostare a mano l'AppID di un gioco](advanced.md#set-a-games-appid-by-hand).

## Notifiche {#notifications}

### Non compare nulla quando sblocco qualcosa {#nothing-appears-when-i-unlock-something}
Inizia dalla riga Notifiche del pannello [Stato dei giochi](game-health.md) di quel gioco, che indica il
canale che ha consegnato per ultimo e perché. Poi segui
[Se una prova o uno sblocco non compare](notifications.md#if-a-test-or-unlock-does-not-appear).

### Il popup dell'overlay non compare in un gioco in particolare {#the-overlay-popup-does-not-show-in-one-particular-game}
Quel gioco è probabilmente a schermo intero esclusivo, dove un popup sempre in primo piano non può essere disegnato. Con
**Automatico**, AW Next invia quello sblocco come notifica di Windows mostrata sopra il gioco. Un gioco in
modalità esclusiva legacy non lascia passare nulla: passalo alla modalità senza bordi. Vedi
[come decide Automatico](notifications.md#how-automatic-decides).

### Le notifiche sono nascoste mentre gioco {#notifications-are-hidden-while-i-play}
È Non disturbare di Windows. Attiva le **Notifiche prioritarie** e approva la richiesta una tantum di Windows. Vedi [Notifiche prioritarie di Windows](notifications.md#priority-windows-notifications).

### Posso cambiare l'aspetto del popup, o condividere un design? {#can-i-change-how-the-popup-looks-or-share-a-design}
Sì. Dieci preset sono inclusi nell'app, il **Preset Designer** costruisce i tuoi con controlli normali,
e qualsiasi preset si esporta in un unico file `.awpreset`. Vedi [Preset e Preset Designer](presets.md).

### Posso mostrare gli sblocchi nel mio streaming? {#can-i-put-unlocks-on-my-stream}
Sì, con una sorgente Browser in OBS. Catturare il popup come finestra non può funzionare, perché esiste per
un solo sblocco ed è sparito prima che OBS lo elenchi, quindi AW Next serve lo stesso popup come pagina. L'indirizzo è
in Impostazioni → Notifiche → **Sorgente browser OBS**. Vedi
[Mostra gli sblocchi in streaming (OBS)](notifications.md#show-unlocks-on-stream-obs).

### L'overlay è la stessa cosa del popup? {#is-the-overlay-the-same-thing-as-the-popup}
No. Il popup è una notifica singola con lo stile di un preset. L'**overlay** è l'elenco completo degli obiettivi
che apri con `Ctrl+Shift+K` mentre un gioco è in esecuzione. Vedi la [guida all'overlay](overlay.md).

### Su Linux, Ctrl+Shift+K non fa nulla nel mio gioco {#on-linux-ctrlshiftk-does-nothing-in-my-game}
Sotto Wayland, AW Next non può vedere i tasti premuti mentre ha il focus una finestra Wayland nativa, come un
gioco Linux in modalità Wayland o Proton con il suo driver Wayland. Associa un tasto nelle impostazioni della tastiera del desktop
a `/home/you/.local/bin/achievement-watcher --toggle-overlay`, con il tuo nome utente al posto
di `you`. AW Next mantiene quel comando puntato all'AppImage attuale, quindi la scorciatoia sopravvive agli
aggiornamenti. Vedi [Scorciatoia dell'overlay](linux.md#overlay-shortcut).

## Sicurezza e dati {#safety-and-data}

### AW Next modifica i miei giochi, o invia qualcosa fuori dal mio PC? {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
Solo quando lo chiedi. Leggere gli obiettivi è di sola lettura. Gli strumenti di riparazione degli emulatori (il sottomenu
**Emulatore e strumenti** del tasto destro di un gioco e **Impostazioni → Emulatori**) scrivono in una cartella di gioco, sempre
dopo una conferma e con un backup. Usali solo con giochi che possiedi. Oltre alle ricerche di sola lettura
e a ciò che un account collegato rimanda indietro, nulla esce da questo PC. Vedi
[Che cosa esce da questo PC](README.md#what-leaves-this-pc).

### Il mio antivirus ha segnalato o rimosso un file {#my-antivirus-flagged-or-removed-a-file}
Quasi certamente è l'emulatore Steam o un loader Ubisoft, ed è un falso positivo: questi file sostituiscono
la libreria Steam o Ubisoft di un gioco, che è il comportamento che cercano i motori di rilevamento. Nulla viene
scritto a meno che tu non abbia eseguito una riparazione, aperto **Impostazioni → Emulatori** o attivato la riparazione automatica. Consenti
il file nominato dal tuo antivirus, oppure escludi `%APPDATA%\Achievement Watcher Next\cache`. Non disattivare mai
la protezione. Vedi [Risoluzione dei problemi → Antivirus](troubleshooting.md#antivirus-or-smartscreen-warning).

### Windows SmartScreen avvisa riguardo all'installer {#windows-smartscreen-warns-about-the-installer}
Le release sono firmate con il certificato proprio del progetto, fissato dall'impronta digitale, e non con uno commerciale,
quindi SmartScreen può chiedere conferma. Non devi mai installare quel certificato: l'updater dell'app
verifica il firmatario, l'impronta digitale fissata e che il file non sia stato modificato dopo la firma
prima di installare qualsiasi cosa. Scarica solo dalla
[pagina ufficiale delle release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases). Per controllare un
installer da solo, esegui `Get-FileHash <installer> -Algorithm SHA256` e apri
`https://www.virustotal.com/gui/file/<hash>`. La release attuale è la
[3.12.7](https://www.virustotal.com/gui/file/fb836d9224e789f3095243771266457fca1cb0cee367724e9c9b3c370f4e260d).
Vedi [Risoluzione dei problemi → Controllare una release da solo](troubleshooting.md#checking-a-release-yourself).

### Su Linux, perché compare una richiesta del portachiavi? {#on-linux-why-does-a-keyring-prompt-appear}
AW Next cifra i token di accesso con una chiave custodita dal portachiavi del desktop (GNOME Keyring o KDE
Wallet). Con l'accesso automatico il portachiavi resta bloccato, quindi il desktop ti chiede di sbloccarne o crearne
uno quando AW Next si avvia. Annullare è sicuro: l'app continua a funzionare e la richiesta ritorna al successivo
avvio. Vedi [Richiesta del portachiavi](linux.md#keyring-prompt).

### Dove sono i miei dati, aggiornare li fa perdere, e quanto sono grandi gli aggiornamenti? {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
Tutto è in `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next` su Linux),
e installare una build più recente lo conserva. Il primo avvio dopo l'aggiornamento importa una vecchia cartella di Achievement
Watcher senza modificarla né eliminarla. Gli aggiornamenti scaricano solo ciò che è cambiato rispetto alla versione
installata e ripiegano da soli su un download completo se questo non riesce. Vedi
[Aggiornamenti e dati esistenti](getting-started.md#updates-and-existing-data).

### Come mi sposto su un nuovo PC, o faccio il backup della mia configurazione? {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**Impostazioni → Avanzate → Backup del profilo → Esporta profilo…** scrive impostazioni, scelte della libreria,
preset, temi, copertine e tempo di gioco in un unico file `.awbackup`. Installa AW Next sul nuovo PC, scegli
**Ripristina profilo…**, e viene applicato al successivo avvio; i file che sostituisce vengono conservati. Gli accessi
non vengono mai salvati, quindi collega di nuovo Steam, Epic, Xbox, PlayStation e RetroAchievements. Vedi
[Backup del profilo](advanced.md#profile-backup).

### Esiste una versione portatile? {#is-there-a-portable-version}
Sì. Lo ZIP portatile tiene l'app e i suoi dati in una sola cartella e controlla lo stesso feed delle release dell'app
installata. Non scarica né esegue mai l'installer: propone la pagina della release quando esce una versione
più recente, ed estrarre il nuovo archivio sopra la vecchia cartella conserva i tuoi dati.

### Come esco completamente? {#how-do-i-quit-completely}
Chiudere la finestra mantiene AW Next nell'area di notifica, così il tracciamento continua. Usa il menu dell'area di notifica per uscire.

## Il progetto {#the-project}

### Funziona con i giochi Goldberg, GBE Fork e CODEX? {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
Sì. AW Next legge i file degli obiettivi scritti da Goldberg, GBE Fork, CODEX, RUNE e CPY, e può
installare e riparare il runtime di GBE Fork per un gioco. Vedi [Sorgenti compatibili](sources.md) e
[Configurazione di Goldberg e GBE Fork](emulator-setup.md).

### È la stessa app di Achievement Watcher di Xan105? {#is-this-the-same-app-as-xan105s-achievement-watcher}
No, ne è una continuazione. AW Next continua Achievement Watcher di Xan105 e il ramo 2.x di darktakayanagi,
su un runtime Electron attuale, con supporto per Linux, più sorgenti e un rapporto sullo stato di ogni gioco
con riparazioni guidate. Vedi il [Confronto](comparison.md).

### È sicuro da usare con i giochi crackati? {#is-it-safe-to-use-with-cracked-games}
Leggere gli obiettivi è di sola lettura. Gli strumenti di riparazione scrivono in una cartella di gioco solo dopo una conferma e
con un backup, e la riparazione automatica è disattivata per impostazione predefinita. Usali solo con giochi che possiedi. Un antivirus
può segnalare un file di emulatore come falso positivo. Vedi
[Risoluzione dei problemi → Antivirus](troubleshooting.md#antivirus-or-smartscreen-warning).

### In cosa si differenzia da Achievement Watcher 2.x? {#how-does-this-differ-from-achievement-watcher-2x}
AW Next ne è la continuazione con un runtime moderno e un ampio lavoro su compatibilità, affidabilità e
funzioni. Vedi il [Confronto](comparison.md).

### Può procurarmi giochi, chiavi o account? {#can-it-get-me-games-keys-or-accounts}
No, e nemmeno l'issue tracker può aiutare in questo. AW Next non contiene file di gioco e non
aggira i controlli di proprietà online.

### Ho trovato un bug o ho un'idea {#i-found-a-bug-or-have-an-idea}
[Apri una issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) con la versione dell'app,
la tua versione di Windows (o la distribuzione e il desktop Linux), la sorgente coinvolta e i log rilevanti.
Segnala una sospetta vulnerabilità in privato tramite la
[politica di sicurezza](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md). Per una
domanda, o per un aiuto prima di sapere se è un bug, chiedi sul [server Discord](https://discord.gg/DjTMrDsXTh).

---

**Sei ancora bloccato?** [Risoluzione dei problemi](troubleshooting.md) esamina ogni sintomo in ordine.

<div align="center">

[← Documentazione](README.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
