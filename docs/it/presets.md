---
title: "Preset e Preset Designer"
description: "L'aspetto del popup di sblocco: i nove preset inclusi, il Preset Designer e la condivisione dei tuoi file .awpreset."
---

# Preset e Preset Designer

Un **preset** è l'aspetto del popup dell'overlay di gioco: la sua disposizione, i colori, il movimento e il modo
in cui rappresenta uno sblocco raro o un completamento al 100%. Sceglilo in **Impostazioni → Notifiche → Preimpostazione**,
creane uno tuo in **Impostazioni → Preset notifiche** oppure importane uno che qualcuno ha condiviso con te.
Il pulsante a griglia accanto all'impostazione del preset mostra ogni preset come un'immagine della sua scheda: fai clic su uno per
usarlo.

> [!NOTE]
> I preset danno stile all'overlay di gioco. Con **Tipo di notifica** impostato su *Notifica di Windows*,
> nulla di ciò che descrive un preset viene disegnato e la scheda Preset notifiche non viene mostrata.

## I preset inclusi {#the-bundled-presets}

AW Next ne include dieci, ciascuno con una propria composizione, un proprio carattere, un proprio movimento e un proprio colore.

| Preset | Che cos'è |
| --- | --- |
| **AW Next** | Quello predefinito. La palette dell'app, una barra d'accento lungo il bordo sinistro, un'icona con anello e il nome del gioco sopra l'obiettivo. |
| **Steam Modern** | La piastra blu notte con il marchio Steam dietro al testo, angoli squadrati, che scorre verso l'alto dal bordo inferiore. |
| **Steam Original** | Una copia del popup che il client Steam disegna oggi: gradiente ardesia, un tenue marchio Steam sovradimensionato, un'icona quadrata e solo un bordo dorato per uno sblocco raro. |
| **Epic Games** | Piatto, neutro e con spalle squadrate, con i margini più ampi del gruppo e una sola linea lungo il bordo sinistro. |
| **PlayStation** | Il carattere della console e il lungo pannello dal grigio al nero, con il marchio PlayStation che pulsa dentro un anello sulla destra. |
| **Xbox** | Una pillola scura con un arco verde che percorre una sola volta l'icona circolare e si stabilizza in un anello fisso. |
| **Cover** | La grafica del gioco come sfondo, che scorre lentamente, con una velatura sotto il testo e il carattere più grande del gruppo. |
| **Glass** | Traslucido e discreto: nessuna barra d'accento e nessun colore finché uno sblocco raro o al 100% non ne porta uno. |
| **Arcade** | Verde fosforo su nero, monospazio e maiuscolo, con linee di scansione e un bordo netto sfalsato. Uno sblocco raro passa all'ambra. |
| **Slim** | Quello basso, su nero assoluto: la stessa larghezza degli altri a metà altezza, pensato per scomparire su un pannello OLED. |

Tutti i preset hanno la stessa larghezza, quindi cambiare preset non sposta mai il popup di lato.

### I quattro stati che ogni preset disegna {#the-four-states-every-preset-draws}

| Stato | Che aspetto ha |
| --- | --- |
| **Normale** | L'accento proprio del preset. |
| **Raro** | Oro al 5% o meno, argento fino al 10%, bronzo fino al 15% (i limiti si possono cambiare in **Impostazioni → Generale → Soglie di rarità**), più la percentuale di sblocco stampata sulla scheda, un bagliore più forte e un bordo aggiunto. |
| **Completamento al 100%** | Un trattamento freddo e più luminoso con un bordo raddoppiato. |
| **Avanzamento** | Una barra di avanzamento con un'etichetta `current/max - %`. |

Il preset che scegli disegna da sé il raro e il 100%, quindi c'è una sola impostazione del preset, non tre. Le
sostituzioni per emulatore restano in **Impostazioni → Notifiche → Emulatori** (modalità Avanzata): Xenia,
RPCS3, shadPS4 e Kyty possono ciascuno avere un proprio preset e un proprio suono.

Un preset usa il suono scelto nella scheda Notifiche a meno che non ne imposti uno proprio, quindi cambiare l'aspetto
non cambia ciò che si sente. Un preset condiviso può portare con sé un proprio suono: vedi
[Condividere un preset](#share-a-preset). **Opacità** (dal 30% al 100%) nella scheda Notifiche stabilisce quanto è trasparente
il popup.

> [!NOTE]
> I preset distribuiti con nomi precedenti vengono ancora riconosciuti: `Shirow`/`Default`/`Midnight`/`xqjan` diventano
> **AW Next**, `Steam` diventa **Steam Modern**, `PS4`/`PS5 enhanced` diventano **PlayStation**,
> `Xbox 360`/`Xbox One` diventano **Xbox**, `Game Cover`/`Sunset` diventano **Cover**, `Clean`/`Modern`/`Smooth Pop` diventano **Glass**,
> `Neon Future`/`LAZ0RBOX` diventano **Arcade**, e quelli della community `ArmsofGod`, `Epic Preset`
> e `mudoss` diventano **Pantheon**, **Onyx** e **Outline**. **Hexagon** e **Indiana** della community
> sono stati rimossi, ed essi e `TigerDX Award` ripiegano su **AW Next**. Un preset tuo con uno
> di questi nomi ha la precedenza sulla sostituzione.

## Crea il tuo {#design-your-own}

Il designer ha una propria scheda, **Impostazioni → Preset notifiche**, raggiungibile anche dal pulsante degli strumenti
accanto all'impostazione del preset. Tutto si imposta con controlli normali: nessun CSS, JSON o file da
modificare.

<div align="center">
<picture><source srcset="../assets/shot/notification-preset-panel-800.webp 800w, ../assets/shot/notification-preset-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notification-preset-panel.png" width="720" height="530" alt="Il Preset Designer"></picture><br>
<sub>Parti da un design completo, poi modellalo sotto un'anteprima dal vivo del popup reale, che resta sullo schermo mentre i controlli scorrono</sub>
</div>

### Punti di partenza {#starting-points}

La prima riga contiene quattordici design completi: *Classic*, *Aurora*, *Neon*, *Cover*, *Minimal*,
*Console*, *Terminal*, *Slate*, *Paper* (l'unico design chiaro), *Ember*, *Frost*, *Poster*, *Pixel*
e *Ribbon*. Ognuno è un normale insieme di valori dei controlli, quindi sceglierne uno equivale a spostare ogni
controllo a mano: tienilo così com'è oppure usalo come base.

| Azione | Che cosa fa |
| --- | --- |
| **Sorprendimi** | Costruisce un design che non hai provato: sceglie un tipo di scheda (piatta, sfumata, neon, sopra la grafica, vetrosa, terminale o chiara), poi tira a sorte ogni controllo entro ciò che quel tipo consente. |
| **Duplica** | Mantiene il design attuale e libera il nome, così il successivo **Crea preimpostazione** aggiunge un preset invece di sostituire quello da cui deriva. |

Nulla viene salvato finché non premi **Crea preimpostazione**.

### L'anteprima {#the-preview}

L'anteprima è la notifica stessa, disegnata dalla stessa pagina, dagli stessi stili e dallo stesso motore che si usano in un gioco. Resta
fissata in cima al pannello mentre i controlli scorrono.

| Controllo | Che cosa mostra |
| --- | --- |
| **Scheda** | Il popup alla sua dimensione reale. La dimensione in pixel e lo zoom dell'anteprima sono scritti sotto. |
| **Confronta** | Tutte e quattro le notifiche insieme, due per due. |
| **Schermo** | Il popup su uno schermo simulato a **720p**, **1080p**, **1440p** o **4K**, nella sua vera dimensione relativa e nell'angolo in cui le notifiche sono impostate per comparire. |
| **Normale / Raro / 100% / Avanzamento** | Le quattro notifiche in cui un preset deve avere un bell'aspetto. In **Confronta**, quella che scegli viene disegnata a piena intensità. |
| **Riproduci** | Riproduce una volta entrata, permanenza e uscita, con i tempi propri del preset. |
| **Sfondo** | Ciò su cui viene giudicato il popup: trasparenza, una scena scura, una luminosa o la grafica della tua libreria. |
| **Posizione / Dimensione** | Rispecchiano le impostazioni omonime nella scheda Notifiche e le modificano. Mostrate solo nella vista **Schermo**. Un popup che hai posizionato a mano viene disegnato in basso al centro e contrassegnato. |

### Orientarsi {#finding-your-way-around}

Il designer ha nove gruppi e una sessantina di controlli, con un filtro e una cronologia di annullamento.

| | Che cosa fa |
| --- | --- |
| **Il filtro** | Scrivi nella casella sopra i gruppi e restano solo i controlli corrispondenti. Cerca tra etichette, voci dei menu a tendina e il nome stesso della proprietà, quindi sia `corner` sia `radius` trovano lo stesso cursore, e un nome letto da un file `.awpreset` trova il suo controllo. Una corrispondenza dietro **Avanzate** lo apre. **Esc** svuota la casella. |
| **Annulla / ripristina** | Le due frecce accanto al filtro, oppure **Ctrl+Z** e **Ctrl+Y** (funziona anche **Ctrl+Shift+Z**). Un trascinamento di cursore è un passo. Caricare un preset, scegliere un punto di partenza o premere Ripristina avvia una cronologia nuova. |

**Layout e dimensioni** e **Colori e sfondo** partono aperti; gli altri gruppi si aprono con un clic e la maggior parte
ha un'area **Avanzate** per le regolazioni di precisione.

### I controlli {#the-controls}

Nella modalità di interfaccia **Semplice** le metà Avanzate non vengono mostrate.

| Gruppo | Che cosa comprende |
| --- | --- |
| **Layout e dimensioni** | Icona a sinistra, a destra, sopra il testo o assente; allineamento del testo; larghezza, margini interni e spaziatura del popup; e se il **nome del gioco** viene stampato sopra l'obiettivo. |
| **Testo** | Carattere (una di cinque famiglie, oppure **un file di carattere tuo**: TTF, OTF, WOFF o WOFF2, al massimo 4 MB, copiato nel preset), dimensione di titolo e descrizione, su quante righe può andare a capo la descrizione e colore del titolo. In Avanzate: spessore del titolo, maiuscolo, spaziatura tra le lettere, un'ombra del testo e un contorno attorno a ogni glifo. |
| **Colori e sfondo** | Un colore pieno, un gradiente a due colori con un angolo, la **grafica del gioco stesso** oppure **un'immagine tua** (copiata nel preset), attenuata, sfocata e inquadrata dietro il testo. Più colore del testo, accento e opacità. In Avanzate, una **texture** (griglia, punti, tratteggio o puntinatura) sopra lo sfondo e sotto il testo. |
| **Icona** | Dimensione, **forma** (quadrato arrotondato, cerchio, squircle, esagono o rombo) e, in Avanzate, un bordo e un bagliore nel colore d'accento. L'arrotondamento degli angoli vale solo per il quadrato arrotondato. Un **logo** (PNG, JPEG, GIF, WebP o BMP, al massimo 5 MB) può stare dietro il testo in un angolo o al centro di un lato, con una dimensione e una distanza dal bordo; viene copiato nel preset come il carattere. |
| **Bordo e angoli** | Raggio degli angoli, quale bordo porta la barra d'accento (o un contorno completo, o nessuno) e il suo spessore; in Avanzate, un bordo di un colore tuo. |
| **Ombra e bagliore** | Profondità dell'ombra portata, bagliore d'accento e se quel bagliore **pulsa** o **respira** mentre il popup è sullo schermo. |
| **Animazione e durata** | Da quale bordo il popup entra e verso quale esce (oppure dissolvenza, o zoom) e quanto resta. In Avanzate: distanza percorsa, velocità di entrata e di uscita, la curva di entrata (morbida, lineare, rimbalzo, delicata, scatto o elastica) e una **curva di uscita**. |
| **Raro e 100%** | Colore e bagliore per uno sblocco raro e per il 100%, una **tinta di stato** che vela l'intera scheda, se la barra di avanzamento viene mostrata e se un **badge di rarità** stampa la percentuale di sblocco. In Avanzate: lo spessore della barra di avanzamento, i livelli argento e bronzo e un **lucchetto** prima del titolo di un obiettivo nascosto. |
| **Suono** | Un suono che questo preset riproduce al posto di quello nella scheda Notifiche. Lascia **Impostazione dell'app** per non usarne nessuno. |

| Azione | Che cosa fa |
| --- | --- |
| **Mostra sullo schermo** | Disegna il design come un vero popup dell'overlay, a dimensione piena, nella posizione configurata e nello stato che l'anteprima mostra, senza salvarlo. |
| **Crea preimpostazione** | Lo salva e lo seleziona come preset attivo. |
| **Aggiorna preimpostazione** | Lo stesso pulsante quando il nome corrisponde a un preset creato dal designer: sostituisce quel preset invece di aggiungerne un altro. |
| **Modifica una preimpostazione** | Ricarica nei controlli uno dei preset generati da te, con ogni valore così com'era salvato. |
| **Ripristina** | Riporta i controlli al design predefinito. Nulla cambia su disco. |
| **Rinomina** | Compare quando è caricato un preset generato. Scrivi il nuovo nome nel campo del nome e premilo: il preset viene rinominato su disco e le impostazioni di notifica che puntavano ad esso lo seguono. |
| **Elimina** | Compare quando è caricato un preset generato e lo rimuove dopo una conferma. |
| **Esporta** / **Importa** | Spostano un preset tra macchine: vedi [Condividere un preset](#share-a-preset). |

Solo i preset generati da questo designer possono essere riaperti o eliminati: esso memorizza le proprie impostazioni in un
`aw-preset.json` accanto ai file generati, ed è quel file a rendere modificabile un preset. I preset inclusi e
quelli scritti a mano non vengono mai toccati.

> [!NOTE]
> Un preset che hai già creato mantiene i suoi file così come generati. Aprirlo nel designer e salvarlo
> gli applica i valori predefiniti di oggi, tra cui uno sblocco raro e un completamento al 100% che ridisegnano l'intero
> popup.

> [!NOTE]
> I preset che crei sono memorizzati in `%APPDATA%\Achievement Watcher Next\presets\Users Presets`, non nella
> cartella di installazione, e sopravvivono agli aggiornamenti dell'app.

### L'editor del layout {#the-layout-editor}

**Editor**, sotto l'anteprima, apre il design a schermo intero: la scheda al centro, i suoi livelli a
sinistra, le impostazioni dell'elemento selezionato a destra. Trascina qualsiasi cosa sulla scheda per spostarla, tira un
angolo per ridimensionarla, ruotala con la maniglia rotonda. La prima volta che si apre, un breve tour mostra
dove sono le cose; **?** elenca ogni scorciatoia e può riavviare il tour.

| | Che cosa fa |
| --- | --- |
| **Aggiungi** | Un testo, un'immagine, un rettangolo, un'ellisse, una linea o un'**icona** (trofeo, medaglia, corona, stella e altre otto). Ognuno è un livello a sé. |
| **Immagini animate** | Una GIF o una WebP animata (al massimo 5 MB) si riproduce sulla scheda. **Riproduci di nuovo la GIF a ogni popup** la fa ripartire dal primo fotogramma ogni volta che il popup compare. |
| **Parole del popup** | Un testo può contenere `{game}`, `{title}`, `{detail}`, `{rarity}` e `{tier}`: i pulsanti sotto il campo di testo li inseriscono e il popup mette al loro posto il nome del gioco, l'obiettivo, la sua descrizione, la sua percentuale di sblocco o il nome del suo grado. |
| **Riempimento** | Una forma o un'icona viene dipinta con un colore, un gradiente, un gradiente circolare, il colore del grado del popup (diventa bronzo, argento o oro insieme alla scheda), oppure il colore di un solo grado qualunque sia il popup. |
| **Forme** | Una stella ha un numero di punte e una profondità, una freccia una punta e un'asta, un triangolo un vertice che scorre lungo la base. Ogni forma tranne l'ellisse può avere angoli arrotondati, un contorno o una linea può essere tratteggiato o puntinato, e una forma, un'icona o un'immagine può essere specchiata. Un'immagine può essere ritagliata in una qualsiasi di queste forme. |
| **Trasparente** | Una forma diversa da una linea può essere impostata come trasparente. Non dipinge nulla da sola: tutto ciò che c'è sotto di essa, la scheda, la sua icona e il testo e gli elementi sottostanti, viene tagliato dove si trova, così il desktop traspare dal foro. Gli elementi sopra di essa restano. Una forma trasparente resta ferma, e l'interruttore non è offerto su un preset incluso. |
| **Ombra e bagliore** | Un testo, una forma o un'icona proietta un'ombra o emette un bagliore, in nero, nel colore del grado del popup o in un colore tuo. |
| **Uno stato alla volta** | L'editor lavora sullo stato che l'anteprima mostra (normale, bronzo, argento, oro, 100% o avanzamento). **Modifica: Tutti** cambia l'elemento per ogni stato; **Modifica: solo Oro** (o qualunque stato sia mostrato) lo cambia solo per quello stato, qualsiasi cosa, dal colore alla posizione, e un elemento aggiunto allora compare solo in quello stato. **Visibile** nasconde o mostra l'elemento allo stesso modo, così una corona che solo uno sblocco oro mostra è una sola icona disattivata ovunque tranne che nell'oro. Uno stato con impostazioni proprie per l'elemento selezionato lo segnala, e **Torna alla base** gli fa seguire di nuovo gli altri. Le parti della scheda (titolo, icona, descrizione) funzionano allo stesso modo. |
| **Entrata e ciclo** | Come un elemento entra una volta che la scheda è su (dissolvenza, salita, caduta, da un lato, zoom, comparsa, scossa o lampo; un testo può anche scriversi da solo, e un testo di rarità o avanzamento conta fino al valore) e dopo quale ritardo, poi se continua a muoversi mentre il popup è mostrato: un impulso, un galleggiamento, un'oscillazione, una rotazione o un luccichio. L'editor resta fermo mentre lavori; **Riproduci** mostra il movimento. |
| **Linea temporale** | Una barra lungo il fondo dell'editor mostra quando ogni elemento entra e per quanto tempo. Trascina una barra per spostare o allungare la sua entrata, premi **Riproduci** per guardare la scheda, o trascina lungo il righello per fermarti su un istante. Resta chiusa finché non cambia un'impostazione di animazione. |
| **Caselle di testo** | Il titolo, la descrizione e la riga del gioco possono essere riformulati e dotati di una casella propria: un riempimento, un margine interno, angoli arrotondati e un contorno. La barra di avanzamento ha uno spessore e un colore della traccia, e le icone possono essere quadrate. |
| **Posizione e dimensione** | Valori digitati per X, Y, larghezza e altezza, e sei pulsanti che allineano l'elemento ai bordi o al centro della scheda. |
| **Livelli** | L'occhio nasconde un elemento. Il lucchetto lo blocca al suo posto: non può essere spostato, ridimensionato o eliminato finché non viene sbloccato, e un clic lo attraversa. Le frecce cambiano l'ordine di sovrapposizione. |
| **Più elementi insieme** | **Maiusc** o **Ctrl** + clic aggiunge un elemento alla selezione o lo toglie, un trascinamento da un punto vuoto prende tutto ciò che il riquadro tocca, e **Ctrl+A** prende tutto. Il gruppo si sposta come uno, si allinea alla scheda o a se stesso, e viene duplicato, copiato o eliminato in un colpo solo. |
| **Copia e incolla** | **Ctrl+C** e **Ctrl+V** copiano la selezione, anche in un altro preset. I selettori di colore propongono i colori che il design usa già. |

I file di preset creati prima di questa versione continuano a funzionare, e un preset che non usa nulla di tutto ciò ha lo stesso aspetto e
si esporta come prima.

## Personalizza un preset incluso {#customize-a-bundled-preset}

**Personalizza un preset incluso**, in cima al designer, parte da un preset distribuito con
l'app. Nulla di quel preset viene copiato o modificato: il livello che salvi è poche righe che lo nominano, più
i valori che hai cambiato, sovrapposti al preset incluso così come viene distribuito. Se una versione successiva migliora il
preset incluso, il tuo livello migliora con esso.

Spunta le sezioni da cambiare: **sfondo** (un colore o un gradiente), **colore del testo**, **accento**,
**bordo**, **bagliore**, **carattere** (una delle cinque famiglie o un file di carattere tuo) e **logo**.
I controlli partono dai colori propri del preset incluso. L'anteprima e **Mostra sullo schermo** mostrano il
preset incluso con il tuo livello sopra.

<div align="center">
<picture><source srcset="../assets/shot/preset-customize-panel-800.webp 800w, ../assets/shot/preset-customize-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/preset-customize-panel.png" width="720" height="530" alt="Personalizzazione del preset AW Next con un file di carattere e un logo, in anteprima dal vivo" loading="lazy" decoding="async"></picture><br>
<sub>AW Next con un file di carattere proprio e un logo nell'angolo in alto a destra: cambiano solo le sezioni spuntate</sub>
</div>

- Funziona con i preset dell'elenco **Preset predefiniti**, che disegnano tutti la stessa scheda. I preset della
  community (Batman, Onyx, Outline e gli altri) disegnano layout propri e non vengono proposti.
- Un livello non può essere esportato come `.awpreset`, perché esiste solo sopra il preset incluso
  dell'installazione che lo ha creato. Per condividere un design, costruiscilo con il designer.
- La **sorgente browser OBS** ignora i livelli e mostra invece il preset predefinito.
- Il popup mantiene la dimensione della finestra del preset incluso, quindi un bagliore o un bordo grande possono essere tagliati.

## Importa un tema da Steam Achievement Notifier {#import-a-theme-from-steam-achievement-notifier}

I temi di **Steam Achievement Notifier** (SAN) arrivano interi. AW Next disegna un tema importato
con i layout di scheda propri di SAN, quindi ha l'aspetto e il movimento che aveva in SAN: tutti gli undici layout, alla
dimensione del testo di SAN e con l'impostazione di scala propria del tema. Due pulsanti nella scheda **Preset notifiche**
importano i temi:

- **Importa tema SAN** legge un file `.san`, oppure il `usertheme.json` dentro un tema che SAN ha già
  decompresso, con le immagini e i suoni accanto.
- **Importa da SAN su questo PC** legge le impostazioni di SAN quando SAN è installato qui, e importa
  in un colpo tutti i temi salvati su questo PC. I quattro temi in uso (normale, semi-raro, raro e 100%)
  diventano un solo preset, `SAN - <theme name>`, che passa dall'uno all'altro come fa SAN, e ogni altro tema
  salvato diventa un preset a sé. Eseguirlo di nuovo aggiorna quei preset invece di aggiungere
  copie e non tocca mai un preset tuo che ha lo stesso nome.

I preset SAN installati vengono ricostruiti da soli.

### Che cosa arriva {#what-comes-across}

Tutto ciò che il tema contiene: ogni impostazione, le sue immagini (sfondo, maschera, loghi e decorazioni,
bordo dell'icona, badge delle percentuali, icona dell'obiettivo nascosto), il suo carattere e i suoi suoni (uno per stato, oppure
una cartella da cui SAN sceglie a caso). Il preset porta con sé tutto, quindi SAN poi non serve più,
e si esporta come `.awpreset`.

Il suo aspetto è quello di SAN, non dei cursori del designer: **Modifica una preimpostazione** lo mostra come un'immagine, con un pannello
per due scelte sotto.

- **Immagine del trofeo**, per un tema che disegna un trofeo di bronzo, uno d'argento e uno d'oro: *Segue il
  grado* mostra quello che corrisponde allo sblocco, oppure scegli un solo colore per mostrarlo sempre.
- **Tema per grado** disegna un grado con un altro tema SAN importato, suono compreso, così uno sblocco oro
  può avere un aspetto completamente diverso da uno bronzo.

Tutto il resto si cambia in SAN e si importa di nuovo.

Lo stato che una notifica riceve segue le tue impostazioni di rarità in AW Next. Un completamento al 100% usa la
scheda 100% di SAN. In modalità rara, oro e argento usano la sua scheda rara e il bronzo quella semi-rara; in modalità
trofei, oro, argento e bronzo usano rara, semi-rara e normale. Un suono raro o 100% scelto in AW
Next prevale su quello del tema, e la posizione e la dimensione del popup provengono dalla scheda **Notifiche**.

Il rapporto dopo un'importazione elenca ciò che non è potuto arrivare: un file che il tema nomina ma non ha portato,
un'immagine o un carattere rifiutato e impostazioni di un SAN più recente che questa versione non disegna ancora. Viene
scritto anche nel log dell'app.

### Che cosa viene controllato prima di installare qualsiasi cosa {#what-is-checked-before-anything-is-installed}

Le regole sono quelle di un `.awpreset`, perché il file di un tema proviene dalla macchina di qualcun altro. Nulla
al suo interno viene eseguito o valutato; viene letto solo il suo `usertheme.json`. Ogni percorso viene verificato rispetto al
pacchetto in cui è arrivato, e i percorsi assoluti che SAN scrive vengono letti come solo nomi di file. Vengono estratti solo immagini,
caratteri e audio, per tipo di file e con un limite di dimensione; un SVG che potrebbe eseguire uno script
e un file che non è un carattere vengono rifiutati. Ogni impostazione viene controllata per tipo e intervallo. Un'importazione
che fallisce lascia intatti tutti i preset che hai già.

## Condividere un preset {#share-a-preset}

**Esporta** e **Importa**, nella scheda **Preset notifiche**, spostano un preset tra macchine come un unico
file `.awpreset`: lo stile, ogni immagine e carattere che usa, le sue impostazioni del designer e i suoi metadati.

La [galleria dei preset](../gallery/) raccoglie questi file: sfoglia, scaricane uno e importalo, oppure aggiungi il
tuo. Che cosa deve essere un invio e che cosa viene controllato prima che venga elencato si trova in
[Le gallerie della community](community-galleries.md).

**Esporta** scrive ciò che la scheda sta mostrando, con il nome nel campo **Nome**: il design nei
controlli, salvato o no, così un preset in corso può essere condiviso senza crearlo prima. Un preset
importato selezionato in **Modifica una preimpostazione** viene esportato dal disco così com'è, perché il suo aspetto risiede in file
che i controlli non possono descrivere. Viaggia solo il preset: nessun percorso della tua macchina, nessun nome di account, nessuna
tua impostazione.

**Importa** chiede il file, lo controlla e lo installa in `presets\Users Presets`. Se il nome
è già usato, da uno dei tuoi preset o da uno incluso, scegli **Mantieni entrambe** (l'importazione finisce sotto
`Name (2)`) oppure **Sostituisci**. Nulla viene scritto finché non rispondi.

Un preset importato compare in **Modifica una preimpostazione**, viene selezionato e da lì può essere esportato di nuovo o eliminato.
Un preset creato dal designer torna completo per ulteriori modifiche. Un preset scritto a mano
ottiene il suo aspetto da file che i controlli non possono riprodurre, quindi i controlli restano come sono e il campo
del nome resta vuoto.

### Che cosa viene controllato prima di installare qualsiasi cosa {#what-is-checked-before-anything-is-installed-1}

Un pacchetto viene convalidato per intero e rifiutato del tutto, mai installato in parte, quando:

- non è un pacchetto di preset, oppure il suo manifest manca o è malformato;
- richiede un AW Next più recente di quello in esecuzione, oppure un formato di pacchetto più recente;
- contiene un file che il formato non descrive: un programma, uno script o qualsiasi cosa fuori da
  `preset/` e `sounds/`;
- qualsiasi percorso al suo interno punta fuori dalla propria cartella.

Nulla all'interno di un pacchetto viene eseguito o valutato mentre viene controllato o installato. La pagina del preset
viene disegnata più tardi, nella stessa finestra di notifica in sandbox di un preset incluso.

### Che cosa contiene un pacchetto {#what-a-package-contains}

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

Il manifest viene conservato accanto al preset installato come `aw-package.json`. Dice all'app che il preset
è stato importato e può essere rimosso di nuovo, e porta la descrizione e i crediti nella prossima esportazione.

Un suono che hai importato tu viaggia con il preset; un suono incluso no, perché il manifest
lo nomina e ogni installazione lo ha. L'importazione non cambia mai il suono che hai selezionato e non
sovrascrive mai uno che hai: un file diverso con lo stesso nome arriva come `name (2)`.

Il campo facoltativo `author` viene compilato solo dal file del preset stesso, quindi nulla viene attribuito a te
a meno che tu non ce lo metta.

---

**Avanti:** [Overlay](overlay.md) - l'elenco degli obiettivi in gioco, che è separato da questi
popup.

<div align="center">

[← Documentazione](README.md) · [Notifiche](notifications.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
