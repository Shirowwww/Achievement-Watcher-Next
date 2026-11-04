---
title: "Tracker di obiettivi per Linux e Steam Deck"
description: "Installa l'AppImage e mantienilo aggiornato, associa l'overlay a un tasto su GNOME o KDE e avvia i giochi tramite Steam, Proton, Lutris, Heroic o Bottles."
---

# Tracker di obiettivi per Linux e Steam Deck

AW Next funziona su Linux (x64) come app nativa, mai tramite Wine. Segue i giochi avviati con Steam
e Proton, Wine, Lutris, Heroic o Bottles, i giochi Linux nativi e gli emulatori supportati, con la
stessa libreria, gli stessi popup, lo stesso overlay e lo stesso tempo di gioco di Windows.

La build per Linux è una **beta**. È stata provata su GNOME e KDE Plasma, in prefissi Wine e Proton e
con giochi di prova, ma non su molte macchine reali: un vero Steam Deck, veri gamepad, ogni launcher e
ogni release scene. Se qualcosa non funziona, una
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) con la tua distribuzione, il tuo desktop
e i log è l'aiuto migliore.

## Installazione {#install}

1. Apri l'[ultima release](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
   e scarica `Achievement.Watcher.<version>.AppImage`.
2. Mettilo in una cartella tua, come `~/Applications`, e rendilo eseguibile: nel gestore
   di file, **Proprietà → Consenti l'esecuzione del file come programma**, oppure in un terminale:

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. Avvialo e segui la guida del primo avvio come su Windows (vedi [Per iniziare](getting-started.md)).

Un AppImage richiede FUSE 2, che alcune distribuzioni, Ubuntu 24.04 compresa, non installano più per
impostazione predefinita. Se il file non si avvia, installalo: `libfuse2t64` su Ubuntu 24.04 e successivi, `libfuse2` su
Ubuntu e Debian più vecchi, `fuse-libs` su Fedora, `fuse2` su Arch.

Al primo avvio AW Next si aggiunge al menu delle applicazioni. **Impostazioni → Generale → Avvia all'avvio del sistema** lo avvia, nascosto nell'area di notifica, a ogni accesso. Impostazioni, cache, tempo di gioco e log si trovano in
`~/.config/Achievement Watcher Next`.

## Aggiornamenti {#updates}

L'AppImage si aggiorna da solo dalle stesse release GitHub dell'app per Windows. Una nuova versione viene
annunciata da una notifica del desktop e dall'etichetta nella barra del titolo, e chiede il permesso prima di scaricare. Poi
controlla il file rispetto al digest SHA-512 pubblicato con la release (`latest-linux.yml`), sostituisce
il vecchio AppImage e si riavvia. Se un gioco è in esecuzione, l'aggiornamento attende che si chiuda. I tuoi dati restano
dove erano.

Il nuovo file ha la nuova versione nel nome. La voce **Avvia all'avvio del sistema** e il
comando `~/.local/bin/achievement-watcher` lo seguono. Un launcher creato da te che nomina il
file AppImage punta ancora al vecchio nome, quindi fallo puntare a quel comando.

## Desktop supportati {#supported-desktops}

AW Next è provato su GNOME e KDE Plasma, sotto Wayland e X11 (Ubuntu 24.04 con GNOME 46 e
Plasma 5.27), e su Fedora 44 con GNOME 50, Plasma 6.7, Hyprland 0.56 e COSMIC 1.0, in una macchina
virtuale. Altri desktop potrebbero funzionare ma non sono stati provati.

- **Wayland.** AW Next si riavvia da solo una volta tramite XWayland all'avvio, così i suoi popup e l'overlay possono
  restare sopra i giochi, che girano come finestre X11 sotto Wine e Proton. Hyprland e COSMIC avviano XWayland
  per impostazione predefinita. Senza di esso (`xwayland.enabled = false` su Hyprland), AW Next resta un'app Wayland nativa:
  la libreria, l'area di notifica e le notifiche funzionano, ma il compositor colloca i popup e l'overlay come
  qualsiasi finestra, e un popup toglie la tastiera al gioco mentre è mostrato.
- **Area di notifica.** KDE e COSMIC mostrano l'icona così com'è. GNOME richiede l'estensione AppIndicator, che
  Ubuntu include già attiva. Hyprland richiede una barra con un'area di notifica, come Waybar con il suo modulo `tray`.
  Senza un'area di notifica, chiudere la finestra minimizza AW Next invece di nasconderlo; Hyprland non ha finestre
  minimizzate, quindi lì la nasconde, e riavviare AW Next riporta la finestra.
- Le **notifiche** sono quelle del desktop stesso. Non disturbare le nasconde a meno che **Impostazioni → Notifiche →
  Notifiche prioritarie** non sia attivo, nel qual caso gli sblocchi vengono comunque mostrati su GNOME e KDE. Hyprland non ne ha
  di proprie: avvia un demone di notifiche come mako, dunst o SwayNC. mako disegna sotto un gioco a schermo
  intero a meno che la sua configurazione imposti `layer=overlay`, e mantiene ogni notifica finché non fai clic, a meno che
  imposti `default-timeout` (in millisecondi). COSMIC trattiene le sue notifiche mentre un gioco è a schermo
  intero. Il popup di AW Next compare comunque sopra il gioco.
- Le opzioni che esistono solo su Windows sono contrassegnate come tali nelle Impostazioni.

## Screenshot e clip {#screenshots-and-clips}

Screenshot e clip di ogni sblocco funzionano su X11 e su Wayland. Le clip vengono registrate da
gpu-screen-recorder con la scheda grafica quando è installato. Se lo scegli nelle Impostazioni, il registratore
software di AW Next salva invece file WebM e mostra quanto è costato.

Su Wayland, il primo screenshot fa chiedere al desktop se le app possono acquisire schermate (GNOME 47
e successivi, KDE Plasma 6, COSMIC e Hyprland). AW Next attende alcuni secondi la risposta, poi salta
quello scatto, e quelli degli sblocchi che arrivano mentre la domanda è aperta. Fai clic su **Consenti**, perché Invio
sceglie **Nega** su GNOME e Hyprland, e gli screenshot successivi vengono fatti senza una parola. Se lo neghi,
AW Next non fa screenshot e non chiede più. Per essere interpellato di nuovo al prossimo screenshot,
esegui:

```bash
flatpak permission-remove screenshot screenshot
```

Il registratore software cattura lo schermo tramite la finestra di condivisione dello schermo del desktop, che
ricompare a ogni avvio di un gioco e, su COSMIC e Hyprland, toglie il gioco dallo schermo intero.
gpu-screen-recorder lo chiede una sola volta.

## Scorciatoia dell'overlay {#overlay-shortcut}

`Ctrl+Shift+K` apre l'overlay mentre un gioco Wine o Proton ha il focus. Sotto Wayland, AW Next non può
vedere un tasto premuto mentre ha il focus una **finestra Wayland nativa**, come un gioco Linux in modalità Wayland o
Proton con il suo driver Wayland. Per quei giochi non esiste una scorciatoia in gioco.

Una scorciatoia dalle impostazioni della tastiera del desktop non dipende da questo. Fai eseguire questo comando,
sostituendo `you` con il tuo nome utente (GNOME non espande `~`, quindi scrivi il percorso completo):

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

Apre o chiude l'overlay della copia già in esecuzione e non avvia nient'altro. Il comando esiste
dal primo avvio dell'AppImage, e AW Next lo aggiorna a ogni avvio, quindi segue gli aggiornamenti.

- **GNOME:** **Impostazioni → Tastiera → Visualizza e personalizza le scorciatoie → Scorciatoie personalizzate → Aggiungi scorciatoia**.
  Dagli un nome, incolla il comando, poi premi i tasti che vuoi.
- **KDE Plasma 6:** **Impostazioni di sistema → Tastiera → Scorciatoie → Aggiungi nuova → Comando o script**, incolla
  il comando, poi imposta la scorciatoia.
- **KDE Plasma 5:** **Impostazioni di sistema → Scorciatoie → Scorciatoie personalizzate → Modifica → Nuova → Scorciatoia globale →
  Comando/URL**. Imposta i tasti in **Attivazione** e il comando in **Azione**.
- **Hyprland** 0.55 e successivi, in `~/.config/hypr/hyprland.lua`:

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  In un vecchio `hyprland.conf`, la stessa riga si scrive
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`.
  Hyprland prende i tasti prima di qualsiasi finestra, quindi una pressione apre o chiude l'overlay una volta sola,
  qualunque sia il gioco.
- **COSMIC:** **Impostazioni → Dispositivi di input → Tastiera → Scorciatoie da tastiera → Scorciatoie personalizzate → Aggiungi
  scorciatoia**. Compila **Nome della scorciatoia** e **Comando**, poi digita i tasti. Funziona anche su un gioco Wayland
  nativo. L'impostazione di COSMIC **Scorciatoie globali nelle applicazioni X11** non aiuta: AW Next
  continua a non vedere lì i tasti.

Su Hyprland e COSMIC l'overlay compare sopra un gioco a schermo intero, Wine o Wayland nativo. Con
**Metti a fuoco l'overlay all'apertura** attivo (vedi la [guida al controller](controller.md)), entrambi tolgono il gioco
dallo schermo intero per mostrarlo. Su Hyprland, questa regola di finestra mantiene il gioco a schermo intero e l'overlay
sopra di esso:

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

Funziona anche un controller. AW Next legge i gamepad direttamente, quindi le scorciatoie del controller della
[guida al controller](controller.md) aprono e guidano l'overlay senza togliere nulla al gioco.
Mentre Steam Input è in esecuzione, AW Next legge solo i pad virtuali di Steam, così una pressione non viene contata due volte.

## Richiesta del portachiavi {#keyring-prompt}

I pochi segreti che AW Next conserva (i token di accesso di Steam, Epic, Xbox e PlayStation, la chiave di RetroAchievements,
una password Steam dell'emulatore) sono cifrati con una chiave custodita dal portachiavi del desktop: GNOME Keyring
o KDE Wallet. Hyprland non ne ha uno proprio e usa quello installato, che si avvia quando AW Next lo
richiede per la prima volta.

Con l'**accesso automatico**, il portachiavi non è sbloccato all'avvio della sessione. La prima volta che AW Next
ne ha bisogno, il desktop ti chiede di sbloccarlo, o di crearne uno se non c'è; KDE apre l'assistente di KDE
Wallet. Rispondi e AW Next prosegue. Se annulli, AW Next continua a funzionare, dice una volta che
le tue connessioni non sono protette, e il desktop chiede di nuovo al successivo avvio. La richiesta non
blocca mai l'app: tracciamento e notifiche funzionano mentre è aperta.

## Steam e Proton {#steam-and-proton}

AW Next trova il client Steam sia che provenga dalla tua distribuzione (`steam-installer`, `steam`),
da Flathub o come Snap, insieme alle sue cartelle di libreria su altri dischi e al prefisso Proton di ogni gioco.
Con due client Steam installati, segue quello avviato per ultimo.

Gli sblocchi dei giochi che Steam stesso avvia vengono letti dai file di Steam, come su Windows. AW Next li mostra
solo quando **Impostazioni → Notifiche → Giochi del client Steam** è attivo, perché Steam mostra un proprio popup per
quei giochi.

## Wine, Lutris, Heroic e Bottles {#wine-lutris-heroic-and-bottles}

Ogni sorgente viene letta dentro il prefisso del gioco, registro di Windows compreso: un gioco con un emulatore
Steam (Goldberg, GBE Fork e gli altri in [Sorgenti compatibili](sources.md)), un salvataggio Ubisoft o GOG,
e così via. **Ricerca smart** cerca nella tua cartella home, negli altri dischi e in ogni prefisso che conosce.

- **Lutris** e **Bottles**: i giochi e i programmi che hanno installato vengono elencati con il loro prefisso.
- **Heroic**: i giochi Epic installati tramite Heroic vengono riconosciuti come giochi Epic.
- **Wine semplice**: il prefisso predefinito `~/.wine` e qualsiasi cartella di prefisso che aggiungi.
- **I giochi Linux nativi** con Goldberg o GBE Fork (`libsteam_api.so`) vengono letti dalle loro cartelle di
  salvataggio Linux.

**Gioca** avvia un gioco tramite il launcher a cui appartiene (Steam, Lutris, Heroic), e il tempo di gioco viene
contato dal processo del gioco. Le riparazioni degli emulatori di [Stato dei giochi](game-health.md) funzionano dall'
AppImage e scrivono dentro il prefisso del gioco, con un backup come sempre.

## Emulatori {#emulators}

RPCS3, shadPS4, RetroArch e Xenia vengono trovati nelle loro cartelle Linux; RPCS3 e shadPS4 anche quando
provengono da Flathub. Gli sblocchi di RetroAchievements vengono annunciati qualunque sia l'emulatore, una volta che la sorgente è
collegata.

## Steam Deck {#steam-deck}

Il supporto per Steam Deck è nuovo e **non è stato verificato su un vero Deck**. Ecco cosa dovrebbe fare:

- In **Modalità desktop**, AW Next è lo stesso AppImage di qualsiasi desktop Linux. La prima finestra si adatta allo
  schermo da 1280x800 del Deck, e i giochi sulla scheda microSD vengono trovati.
- Con **Avvia all'avvio del sistema** attivo, AW Next funziona anche in **Modalità gioco**: parte come servizio in background
  una volta avviato Steam.
- La Modalità gioco non mostra notifiche del desktop, quindi AW Next disegna ogni sblocco come un proprio popup sopra il
  gioco, a partire dall'angolo in alto a sinistra. L'overlay delle prestazioni di SteamOS può nascondere quel popup.
- Il **plugin Decky** nella cartella `decky/` del repository invia ogni sblocco alle notifiche di Steam stesso,
  che la Modalità gioco disegna sempre. Finché è in ascolto, AW Next tiene disattivato il proprio popup, così
  vedi una sola notifica. Senza il plugin il popup è il ripiego. Per ora lo installi
  a mano: compilalo (`npm install`, poi `npm run build`) e copialo in
  `~/homebrew/plugins/achievement-watcher/`, come spiega il suo
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md).
  Richiede AW Next in esecuzione con il feed websocket attivo, che è l'impostazione predefinita.

Il popup è stato verificato in una sessione in Modalità gioco riprodotta su un PC, e il plugin Decky ha solo test
unitari. Se provi uno dei due su un vero Deck, una
[issue](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) che dica cosa hai visto è utile.

## Segnalare un problema {#reporting-a-problem}

Indica la tua distribuzione, il desktop (GNOME o KDE, Wayland o X11), come viene avviato il gioco (Steam con Proton,
Lutris, Heroic, Bottles, Wine) e i file in `~/.config/Achievement Watcher Next/logs`.

---

**Avanti:** [Risoluzione dei problemi](troubleshooting.md), per i problemi di rilevamento, avanzamento, notifiche e tempo
di gioco.

<div align="center">

[← Documentazione](README.md) · [Per iniziare](getting-started.md) · [Home del progetto](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
