---
title: "Le gallerie della community"
description: "Prendi un preset di notifica o un tema creato da qualcun altro, oppure invia il tuo alla galleria della community."
---

# Le gallerie della community

Due gallerie, un servizio, un solo insieme di regole.

| | | |
|---|---|---|
| [Galleria dei preset](../gallery/) | `.awpreset` | Il popup di notifica: disposizione, carattere, colori, movimento e suono |
| [Galleria dei temi](../gallery/themes/) | `.awtheme` | Il resto dell'app: finestra, barra del titolo, libreria, elenchi degli obiettivi, impostazioni e overlay |

Per scaricare da una delle due, prendi il file, poi usa **Impostazioni → Preset notifiche → Importa** oppure
**Impostazioni → Aspetto → Importa**. Questa pagina tratta l'altro lato: come aggiungerne uno, che cosa viene controllato
e che cosa può dire una scheda.

## Inviarne uno {#sending-one}

Il procedimento è lo stesso per entrambe, e nulla lascia il tuo browser finché non premi **Pubblica**.

1. **Esportalo.** Usa Impostazioni → Preset notifiche → Esporta per un preset, oppure Impostazioni → Aspetto →
   Esporta per un tema. Il file porta già il nome, la descrizione, la versione, i tag e la versione di AW Next
   di cui ha bisogno.
2. **Scegli il file** nel pannello *Invia il tuo* nella pagina della galleria, oppure trascinalo sul pannello. Scegliere
   non invia nulla: il file attende mentre compili il resto, e il pannello indica che cosa contiene.
3. **Controlla che cosa dirà la scheda.** Quattro caselle vengono compilate dal pacchetto non appena lo scegli:
   un **nome**, una **descrizione** di una riga, dei **tag** e un **credito**. Il credito è l'autore che
   l'app ha registrato quando hai esportato, quindi è il nome con cui ti presenti, ed è vuoto solo se hai scelto di non
   essere citato. Scrivi un tag e premi Invio per trasformarlo in un chip; fai clic su un chip per rimuoverlo.

   **Il nome è l'unica casella che deve essere compilata.** Intesta la scheda e dà l'indirizzo con cui il
   file viene pubblicato, e un nome scelto da qualcun altro è ciò che un moderatore finisce per riscrivere.
   Pubblica resta inattivo finché non ce n'è uno. Le altre tre possono restare vuote, e la scheda allora non porta
   nulla in quei punti.
4. **Premi Pubblica.** Ci vogliono pochi secondi, perché l'immagine viene disegnata, non indovinata. Poi
   attende: nulla compare in una galleria prima che un maintainer lo approvi.

Tutto ciò che si trova in quelle caselle è un **suggerimento**. Sostituisce il pacchetto solo dove è compilato,
viene ripulito esattamente come un manifest, e un maintainer vede tutte e quattro accanto all'immagine disegnata prima che
venga pubblicato qualsiasi cosa. Nulla di tutto ciò decide un nome di file o un indirizzo: il servizio costruisce l'indirizzo dal
nome, mantiene lettere minuscole, cifre e trattini, e rifiuta qualsiasi altra cosa.

Il tuo browser legge le caselle dal pacchetto (il suo `manifest.json` e nient'altro). Il file stesso
lascia il computer solo quando premi Pubblica.

| | Preset | Tema |
|---|---|---|
| Pacchetto | Al massimo 4 MB | Al massimo 8 MB |
| Frequenza | Cinque invii all'ora da uno stesso indirizzo, preset e temi insieme | |

## L'immagine non spetta a te inviarla {#the-picture-is-not-yours-to-send}

Non puoi allegare uno screenshot a nessuna delle due gallerie. Il servizio disegna l'immagine dal tuo pacchetto.

Per un **preset**, disegna il popup dal pacchetto, nello stesso documento in sandbox che usa l'app,
una volta in un browser senza rete e senza script propri, alla dimensione con cui l'app lo mostra. Lo disegna
in ogni stato che un preset deve gestire: uno sblocco ordinario, uno raro di bronzo, uno d'argento e uno d'oro,
il popup del 100% e un passaggio di avanzamento. Una scheda ne mostra uno alla volta, con un pulsante a freccia su ogni lato per
scorrerli, e l'immagine ingrandita è quella mostrata. Controlla tutti e sei quando progetti: un
preset che si legge bene solo in uno di essi qui si vede.

Un **tema** è fatto di colori e numeri, quindi il server disegna un esempio fisso dell'interfaccia di AW Next con
il tuo tema (barra del titolo, riga del profilo, libreria, elenco degli sbloccati di recente, superficie delle impostazioni) e lo
fotografa. È l'esempio che le Impostazioni mostrano prima di un'importazione, alla stessa dimensione. Poggia sugli stessi quattro
gradienti di sfondo ogni volta, così un tema trasparente non risulta un design sbiadito e due
rendering dello stesso file coincidono.

Il testo dell'esempio è una costante nel codice sorgente dell'app, quindi una scheda non può portare una libreria, un account, un percorso o un
gioco tuo, né mostrare una versione dell'invio che non hai mandato.

## Che cosa viaggia in un file {#what-travels-in-a-file}

Un **`.awpreset`** contiene il documento e il foglio di stile del preset, le sue immagini, i caratteri e il suono,
e le impostazioni del designer che ci stanno dietro. Nulla sulla tua macchina.

Un **`.awtheme`** contiene colori, gradienti, adattamenti, impostazioni degli effetti e qualsiasi immagine di sfondo che hai scelto,
e nient'altro: nessun foglio di stile, markup o script. Un'immagine viaggia come byte con un nome costruito dal
suo livello, mai come percorso fuori dalla tua cartella delle immagini. L'elenco completo è in
[il formato `.awtheme`](../awtheme-format.md).

Un **tema a foglio di stile utente non può essere esportato.** Un `.css` che hai copiato in
`%APPDATA%\Achievement Watcher Next\themes` non è un `.awtheme`, ed Esporta lo rifiuta. Condividi il
`.css` stesso.

## Sfondi e altre risorse {#backgrounds-and-other-assets}

Tutto ciò che si trova in un pacchetto viene ridistribuito a chiunque lo scarichi, quindi deve essere tuo da
ridistribuire:

- Grafica tua, o qualcosa sotto una licenza che lo consenta. Uno sfondo che hai trovato di solito non è
  né l'uno né l'altro, e nemmeno un carattere che hai comprato.
- Nulla con un logo, una filigrana o testo incorporato. Un tema è un aspetto, non una collocazione.
- Nulla che non passerebbe come sfondo del desktop al lavoro.

Un tema fatto solo di colori è benvenuto e il tipo più facile da accettare.

## Credito e licenza {#credit-and-licence}

Il nome su una scheda è ciò che la casella **Credito** finisce per dire. Parte dall'autore che l'app
ha registrato quando hai esportato, quindi di solito è giusto. Cambialo se ti presenti con un altro nome, oppure svuotalo
e la scheda non porta alcun nome. Un maintainer può aggiungere un link al tuo profilo quando lo approva.

**Tutto ciò che è elencato in una delle due gallerie è pubblicato sotto
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Inviando accetti questa licenza, confermi
che è opera tua e che tutto ciò che contiene è tuo da dare.

## Che cosa viene controllato {#what-is-checked}

Un invio deve superare due livelli.

**Il lettore dell'app.** `app/util/presetPackage.js` e `app/util/themePackage.js`, i moduli che
vengono eseguiti all'Importazione, convalidano il pacchetto: il manifest, la versione del formato, la versione minima dell'app, ogni
percorso al suo interno, i tipi di file, le dimensioni e il punto di ingresso. Il servizio della galleria usa quei file
alla lettera, quindi una regola aggiunta lì si applica qui alla build successiva, e non può essere elencato nulla che l'app
rifiuterebbe.

**I limiti propri della galleria**, di cui un'importazione privata non ha bisogno:

| | |
|---|---|
| Nome del file | Lettere minuscole, cifre e trattini, da 2 a 48 caratteri, costruito dal servizio a partire dal nome |
| Pacchetto | 4 MB per un preset, 8 MB per un tema |
| Immagine | Disegnata dal servizio, una volta per stato, e rifiutata se una risulta fuori dalla dimensione che un elenco serve (500 KB al massimo ciascuna) |
| Nome | Univoco nella sua galleria, perché due voci con lo stesso nome collidono all'importazione |

Nulla in un pacchetto viene eseguito mentre viene controllato, e il sito web non ne disegna mai uno: una scheda mostra
un'immagine prodotta dal servizio. Un preset gira solo nell'app, nella stessa finestra di notifica in sandbox
che usa un preset incluso, e un tema non può eseguire nulla da nessuna parte.

## Che cosa viene rifiutato {#what-gets-refused}

- Il lavoro di qualcun altro, a meno che non abbia detto di sì e tu lo citi.
- Risorse che non puoi ridistribuire.
- Un popup che si finge qualcos'altro: una finestra di sistema, una pubblicità, un indirizzo da visitare.
- Una pubblicità, un logo o un invito all'azione incorporati in un'immagine di sfondo.
- Una palette che rende illeggibile il testo.
- Un quasi duplicato di qualcosa già elencato.

Un rifiuto conserva il checksum ed elimina i byte, così inviare di nuovo lo stesso file viene riconosciuto
invece di essere messo in coda due volte.

## Aggiornare o rimuovere il tuo {#updating-or-removing-yours}

Invia il file più recente nello stesso modo, con la versione all'interno del pacchetto aumentata, e scrivi nella
descrizione che sostituisce una scheda precedente così che un maintainer possa toglierla. Per far
rimuovere una voce, [apri una issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) e
indica di quale scheda si tratta.

## Quando il pannello non c'è {#when-the-panel-is-not-there}

Nessun server della galleria risponde, e la pagina elenca una copia pubblicata accanto ad essa. Tutto ciò che è già in una
galleria può comunque essere scaricato. Solo l'invio di qualcosa di nuovo deve attendere, quindi riprova più tardi.

Il progetto gestisce il servizio che fa comparire il pannello, e non fa parte di questo repository, quindi
non c'è nulla da installare per esso.

## Temi di Steam Achievement Notifier {#themes-from-steam-achievement-notifier}

Non sono elencati qui e non lo saranno.

I temi SAN sono file `.san` che le persone si passano direttamente. Il repository di SAN non ha una cartella di temi, un elenco
nel wiki né un feed, quindi una build non ha nulla a cui puntare. I file appartengono alle persone che li hanno fatti
e non sono concessi in licenza per la ridistribuzione, e il repository di SAN non porta alcuna licenza. Copiare
l'uno o l'altro qui ripubblicherebbe il lavoro di altri senza permesso.

AW Next legge invece i tuoi. **Impostazioni → Preset notifiche → Importa tema SAN** legge un file `.san`,
oppure il `usertheme.json` di un tema già decompresso, e **Importa da SAN su questo PC** legge
le impostazioni di SAN stesso. In ogni caso il tema diventa un preset di AW Next, disegnato con il motore di SAN
alla dimensione di SAN, e si esporta come `.awpreset` come qualsiasi altro. Ciò che arriva è descritto in
[Preset](presets.md#import-a-theme-from-steam-achievement-notifier).

Se ne hai importato uno tuo, esportalo e invia quello. Allora è il tuo preset, con il credito a tuo nome.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Avanti:** [Preset e Preset Designer](presets.md): che cos'è un preset e come crearne uno.

<div align="center">

[← Documentazione](README.md) · [Galleria dei preset](../gallery/) · [Galleria dei temi](../gallery/themes/) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
