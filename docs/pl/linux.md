---
title: "Tracker osiągnięć dla Linuksa i Steam Deck"
description: "Zainstaluj AppImage i dbaj o jego aktualność, przypisz nakładkę do klawisza w GNOME lub KDE i uruchamiaj gry przez Steam, Proton, Lutris, Heroic lub Bottles."
---

# Tracker osiągnięć dla Linuksa i Steam Deck

AW Next działa w systemie Linux (x64) jako aplikacja natywna, nigdy przez Wine. Śledzi gry uruchamiane przez Steam
i Proton, Wine, Lutris, Heroic lub Bottles, natywne gry linuksowe i obsługiwane emulatory, z taką samą
biblioteką, oknami, nakładką i czasem gry jak w Windows.

Wersja na Linuksa to **beta**. Testowano ją na GNOME i KDE Plasma, w prefiksach Wine i Proton oraz
z grami testowymi, ale nie na wielu prawdziwych komputerach: prawdziwym Steam Decku, prawdziwych gamepadach, każdym launcherze i
każdym wydaniu scene. Jeśli coś nie działa, najbardziej pomaga
[zgłoszenie](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) z twoją dystrybucją, środowiskiem graficznym
i logami.

## Instalacja {#install}

1. Otwórz [najnowsze wydanie](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest)
   i pobierz `Achievement.Watcher.<version>.AppImage`.
2. Umieść go we własnym folderze, takim jak `~/Applications`, i nadaj mu prawo wykonywania: w menedżerze
   plików **Właściwości → Zezwalaj na wykonywanie pliku jako programu** albo w terminalu:

   ```bash
   chmod +x Achievement.Watcher.*.AppImage
   ```

3. Uruchom go i przejdź przez przewodnik pierwszego uruchomienia jak w Windows (zobacz [Pierwsze kroki](getting-started.md)).

AppImage wymaga FUSE 2, którego niektóre dystrybucje, w tym Ubuntu 24.04, już domyślnie nie
instalują. Jeśli plik się nie uruchamia, zainstaluj go: `libfuse2t64` w Ubuntu 24.04 i nowszych, `libfuse2` w
starszych Ubuntu i Debianie, `fuse-libs` w Fedorze, `fuse2` w Arch.

Przy pierwszym uruchomieniu AW Next dodaje się do menu aplikacji. **Ustawienia → Ogólne → Uruchamiaj przy starcie** uruchamia go, ukrytego w zasobniku, przy każdym logowaniu. Ustawienia, pamięci podręczne, czas gry i logi znajdują się w
`~/.config/Achievement Watcher Next`.

## Aktualizacje {#updates}

AppImage aktualizuje się sam z tych samych wydań GitHub co aplikacja dla Windows. Nowa wersja jest
ogłaszana powiadomieniem pulpitu i znaczkiem na pasku tytułu i pyta o zgodę przed pobraniem. Potem
sprawdza plik względem skrótu SHA-512 opublikowanego z wydaniem (`latest-linux.yml`), zastępuje
stary AppImage i uruchamia się ponownie. Jeśli gra jest uruchomiona, aktualizacja czeka na jej zamknięcie. Twoje dane zostają
tam, gdzie były.

Nowy plik ma w nazwie nową wersję. Wpis **Uruchamiaj przy starcie** i polecenie
`~/.local/bin/achievement-watcher` podążają za nim. Launcher, który sam stworzyłeś i który wskazuje plik
AppImage po nazwie, nadal wskazuje starą nazwę, więc skieruj go zamiast tego na to polecenie.

## Obsługiwane środowiska graficzne {#supported-desktops}

AW Next jest testowany na GNOME i KDE Plasma, pod Wayland i X11 (Ubuntu 24.04 z GNOME 46 i
Plasma 5.27) oraz na Fedorze 44 z GNOME 50, Plasma 6.7, Hyprland 0.56 i COSMIC 1.0, w maszynie
wirtualnej. Inne środowiska mogą działać, ale nie były sprawdzane.

- **Wayland.** AW Next restartuje się raz przez XWayland przy starcie, aby jego okna i nakładka mogły
  pozostać nad grami, które działają jako okna X11 pod Wine i Proton. Hyprland i COSMIC uruchamiają XWayland
  domyślnie. Bez niego (`xwayland.enabled = false` w Hyprland) AW Next pozostaje natywną aplikacją Wayland:
  biblioteka, zasobnik i powiadomienia działają, ale kompozytor umieszcza okna i nakładkę jak
  każde okno, a okno zabiera grze klawiaturę, gdy jest pokazywane.
- **Zasobnik.** KDE i COSMIC pokazują ikonę zasobnika bez zmian. GNOME potrzebuje rozszerzenia AppIndicator, które
  Ubuntu dostarcza włączone. Hyprland potrzebuje paska z zasobnikiem, takiego jak Waybar z modułem `tray`.
  Bez zasobnika zamknięcie okna minimalizuje AW Next zamiast go ukrywać; Hyprland nie ma zminimalizowanych
  okien, więc tam ukrywa, a ponowne uruchomienie AW Next przywraca okno.
- **Powiadomienia** są własnymi powiadomieniami pulpitu. Nie przeszkadzać je ukrywa, chyba że włączone są **Ustawienia → Powiadomienia →
  Powiadomienia priorytetowe**, a wtedy odblokowania nadal się pokazują w GNOME i KDE. Hyprland nie ma
  własnych: uruchom demona powiadomień, takiego jak mako, dunst lub SwayNC. mako rysuje pod grą na pełnym
  ekranie, chyba że jego konfiguracja ustawia `layer=overlay`, i trzyma każde powiadomienie, dopóki go nie klikniesz, chyba że
  ustawia `default-timeout` (w milisekundach). COSMIC wstrzymuje swoje powiadomienia, gdy gra jest na pełnym
  ekranie. Własne okno AW Next i tak pokazuje się nad grą.
- Opcje, które istnieją tylko w Windows, są w Ustawieniach odpowiednio oznaczone.

## Zrzuty ekranu i klipy {#screenshots-and-clips}

Zrzuty ekranu i klipy każdego odblokowania działają na X11 i Wayland. Klipy nagrywa
gpu-screen-recorder za pomocą karty graficznej, gdy jest zainstalowany. Jeśli wybierzesz to w Ustawieniach, własny
programowy rejestrator AW Next zapisuje zamiast tego pliki WebM i pokazuje, ile to kosztowało.

Pod Wayland pierwszy zrzut ekranu sprawia, że pulpit pyta, czy aplikacje mogą robić zrzuty ekranu (GNOME 47
i nowsze, KDE Plasma 6, COSMIC i Hyprland). AW Next czeka kilka sekund na odpowiedź, a potem pomija
ten zrzut i zrzuty odblokowań, które przychodzą, gdy pytanie jest otwarte. Kliknij **Zezwól**, bo Enter
wybiera **Odmów** w GNOME i Hyprland, a kolejne zrzuty ekranu powstają bez słowa. Jeśli odmówisz,
AW Next nie robi zrzutów ekranu i nie pyta ponownie. Aby zostać zapytanym ponownie przy następnym zrzucie ekranu,
uruchom:

```bash
flatpak permission-remove screenshot screenshot
```

Rejestrator programowy przechwytuje ekran przez okno dialogowe udostępniania ekranu pulpitu, które
wraca za każdym razem, gdy gra się uruchamia, a w COSMIC i Hyprland wyprowadza grę z pełnego ekranu.
gpu-screen-recorder pyta raz.

## Skrót nakładki {#overlay-shortcut}

`Ctrl+Shift+K` otwiera nakładkę, gdy fokus ma gra Wine lub Proton. Pod Wayland AW Next nie może
zobaczyć klawisza naciśniętego, gdy fokus ma **natywne okno Wayland**, takie jak gra linuksowa w trybie Wayland lub
Proton ze sterownikiem Wayland. Dla takich gier nie ma skrótu w grze.

Skrót z ustawień klawiatury pulpitu od tego nie zależy. Niech uruchamia to polecenie,
z `you` zastąpionym twoją nazwą użytkownika (GNOME nie rozwija `~`, więc wpisz pełną ścieżkę):

```bash
/home/you/.local/bin/achievement-watcher --toggle-overlay
```

Otwiera lub zamyka nakładkę już uruchomionej kopii i nie uruchamia niczego więcej. Polecenie istnieje
od pierwszego uruchomienia AppImage, a AW Next odświeża je przy każdym starcie, więc podąża za aktualizacjami.

- **GNOME:** **Ustawienia → Klawiatura → Wyświetl i dostosuj skróty → Skróty niestandardowe → Dodaj skrót**.
  Nazwij go, wklej polecenie, a potem naciśnij wybrane klawisze.
- **KDE Plasma 6:** **Ustawienia systemowe → Klawiatura → Skróty → Dodaj nowy → Polecenie lub skrypt**, wklej
  polecenie, a potem ustaw skrót.
- **KDE Plasma 5:** **Ustawienia systemowe → Skróty → Skróty niestandardowe → Edytuj → Nowy → Skrót globalny →
  Polecenie/URL**. Ustaw klawisze w **Wyzwalacz**, a polecenie w **Akcja**.
- **Hyprland** 0.55 i nowszy, w `~/.config/hypr/hyprland.lua`:

  ```lua
  hl.bind("CTRL + SHIFT + K", hl.dsp.exec_cmd("/home/you/.local/bin/achievement-watcher --toggle-overlay"))
  ```

  W starszym `hyprland.conf` ta sama linia wygląda tak:
  `bind = CTRL SHIFT, K, exec, /home/you/.local/bin/achievement-watcher --toggle-overlay`.
  Hyprland przechwytuje klawisze przed jakimkolwiek oknem, więc jedno naciśnięcie otwiera lub zamyka nakładkę raz,
  niezależnie od gry.
- **COSMIC:** **Ustawienia → Urządzenia wejściowe → Klawiatura → Skróty klawiszowe → Skróty niestandardowe → Dodaj
  skrót**. Wypełnij **Nazwa skrótu** i **Polecenie**, a potem wpisz klawisze. Działa też nad natywną grą
  Wayland. Ustawienie COSMIC **Skróty globalne w aplikacjach X11** nie pomaga: AW Next
  nadal tam nie widzi klawiszy.

W Hyprland i COSMIC nakładka pokazuje się nad grą na pełnym ekranie, Wine lub natywną Wayland. Przy włączonym
**Skup na nakładce po otwarciu** (zobacz [przewodnik po kontrolerze](controller.md)) oba wyprowadzają grę
z pełnego ekranu, aby ją pokazać. W Hyprland ta reguła okna utrzymuje grę na pełnym ekranie, a nakładkę
nad nią:

```lua
hl.window_rule({ name = "aw-next-overlay", match = { title = "Achievements Overlay" }, float = true, pin = true })
```

Kontroler też działa. AW Next czyta gamepady bezpośrednio, więc skróty kontrolera z
[przewodnika po kontrolerze](controller.md) otwierają i obsługują nakładkę, nie zabierając niczego grze.
Gdy działa Steam Input, AW Next czyta tylko wirtualne pady Steam, więc jedno naciśnięcie nie jest liczone dwa razy.

## Monit o pęk kluczy {#keyring-prompt}

Nieliczne sekrety, które AW Next przechowuje (tokeny logowania Steam, Epic, Xbox i PlayStation, klucz RetroAchievements,
hasło Steam emulatora), są szyfrowane kluczem przechowywanym przez pęk kluczy pulpitu: GNOME Keyring
lub KDE Wallet. Hyprland nie ma własnego i używa zainstalowanego, który uruchamia się, gdy AW Next po raz pierwszy
o niego poprosi.

Przy **automatycznym logowaniu** pęk kluczy nie jest odblokowany po rozpoczęciu sesji. Gdy AW Next po raz pierwszy
go potrzebuje, pulpit prosi o jego odblokowanie albo utworzenie, jeśli go nie ma; KDE otwiera asystenta KDE
Wallet. Odpowiedz, a AW Next działa dalej. Jeśli anulujesz, AW Next nadal działa, raz mówi, że
twoje połączenia nie są chronione, a pulpit pyta ponownie przy następnym uruchomieniu. Monit nigdy
nie blokuje aplikacji: śledzenie i powiadomienia działają, gdy jest otwarty.

## Steam i Proton {#steam-and-proton}

AW Next znajduje klienta Steam niezależnie od tego, czy pochodzi z twojej dystrybucji (`steam-installer`, `steam`),
z Flathub, czy jako Snap, wraz z jego folderami bibliotek na innych dyskach i prefiksem Proton każdej gry.
Przy dwóch zainstalowanych klientach Steam podąża za tym, który uruchomiono ostatni.

Odblokowania gier uruchamianych przez sam Steam są czytane z plików Steam, jak w Windows. AW Next pokazuje je
dopiero po włączeniu **Ustawienia → Powiadomienia → Gry klienta Steam**, ponieważ Steam pokazuje własne okno dla
takich gier.

## Wine, Lutris, Heroic i Bottles {#wine-lutris-heroic-and-bottles}

Każde źródło jest czytane wewnątrz prefiksu gry, wraz z jego rejestrem Windows: gra z emulatorem
Steam (Goldberg, GBE Fork i pozostałe w [Zgodne źródła](sources.md)), zapis Ubisoftu lub GOG
i tak dalej. **Inteligentne wyszukiwanie** przeszukuje twój katalog domowy, inne dyski i każdy znany prefiks.

- **Lutris** i **Bottles**: zainstalowane przez nie gry i programy są wymieniane wraz z ich prefiksem.
- **Heroic**: gry Epic zainstalowane przez Heroic są rozpoznawane jako gry Epic.
- **Czyste Wine**: domyślny prefiks `~/.wine` i każdy dodany przez ciebie folder prefiksu.
- **Natywne gry linuksowe** z Goldberg lub GBE Fork (`libsteam_api.so`) są czytane z ich linuksowych folderów
  zapisów.

**Graj** uruchamia grę przez launcher, do którego należy (Steam, Lutris, Heroic), a czas gry jest
liczony na podstawie procesu gry. Naprawy emulatorów z [Stan gry](game-health.md) działają z
AppImage i zapisują wewnątrz prefiksu gry, z kopią zapasową jak zawsze.

## Emulatory {#emulators}

RPCS3, shadPS4, RetroArch i Xenia są znajdowane w swoich linuksowych folderach; RPCS3 i shadPS4 także wtedy, gdy
pochodzą z Flathub. Odblokowania RetroAchievements są ogłaszane niezależnie od emulatora, gdy źródło jest
połączone.

## Steam Deck {#steam-deck}

Obsługa Steam Deck jest nowa i **nie została sprawdzona na prawdziwym Decku**. Co ma robić:

- W **Trybie pulpitu** AW Next to ten sam AppImage co na każdym pulpicie Linuksa. Pierwsze okno mieści się na
  ekranie Decka 1280x800, a gry na karcie microSD są znajdowane.
- Przy włączonym **Uruchamiaj przy starcie** AW Next działa także w **Trybie gry**: startuje jako usługa w tle,
  gdy tylko Steam jest gotowy.
- Tryb gry nie pokazuje powiadomień pulpitu, więc AW Next rysuje każde odblokowanie jako własne okno nad
  grą, od lewego górnego rogu. Nakładka wydajności SteamOS może to okno zasłaniać.
- **Wtyczka Decky** w folderze `decky/` repozytorium wysyła każde odblokowanie do własnych powiadomień Steam,
  które Tryb gry zawsze rysuje. Dopóki nasłuchuje, AW Next trzyma własne okno wyłączone, więc
  widzisz jedno powiadomienie. Bez wtyczki zastępczym rozwiązaniem jest okno. Na razie instalujesz ją
  ręcznie: zbuduj ją (`npm install`, potem `npm run build`) i skopiuj do
  `~/homebrew/plugins/achievement-watcher/`, jak wyjaśnia jej
  [README](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/decky/README.md).
  Wymaga uruchomionego AW Next z włączonym kanałem websocket, co jest ustawieniem domyślnym.

Okno sprawdzono w sesji Trybu gry odtworzonej na komputerze, a wtyczka Decky ma tylko testy
jednostkowe. Jeśli wypróbujesz któreś z nich na prawdziwym Decku, pomoże
[zgłoszenie](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) z opisem tego, co zobaczyłeś.

## Zgłaszanie problemu {#reporting-a-problem}

Podaj swoją dystrybucję, środowisko graficzne (GNOME lub KDE, Wayland lub X11), sposób uruchamiania gry (Steam z Proton,
Lutris, Heroic, Bottles, Wine) i pliki z `~/.config/Achievement Watcher Next/logs`.

---

**Dalej:** [Rozwiązywanie problemów](troubleshooting.md), dla problemów z wykrywaniem, postępem, powiadomieniami i czasem
gry.

<div align="center">

[← Dokumentacja](README.md) · [Pierwsze kroki](getting-started.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
