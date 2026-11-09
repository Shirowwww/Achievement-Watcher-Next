---
title: "Powiadomienia i wyskakujące okna osiągnięć"
description: "Okna nakładki lub powiadomienia systemu Windows: tryby dostarczania, Automatycznie, dźwięki, położenie, tryb trofeów, OBS, zrzuty ekranu na pamiątkę i klipy wideo."
---

# Powiadomienia i wyskakujące okna osiągnięć

AW Next ogłasza odblokowanie natywnym powiadomieniem systemu Windows (toast), oknem nakładki w grze albo
jednym i drugim. Wybierz sposób w **Ustawienia → Powiadomienia**.

W systemie Linux powiadomienie pochodzi z samego pulpitu (GNOME lub KDE), a nakładka działa tak samo.
Tryb Nie przeszkadzać i przełącznik Powiadomień priorytetowych opisano w [Obsługiwane środowiska graficzne](linux.md#supported-desktops).

<div align="center">
<picture><source srcset="../assets/shot/notifications-panel-800.webp 800w, ../assets/shot/notifications-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notifications-panel.png" width="720" height="529" alt="Ustawienia - Powiadomienia"></picture><br>
<sub>Jeden tryb dostarczania, jeden preset - resztą zajmuje się Automatycznie</sub>
</div>

## Wybierz tryb dostarczania {#choose-a-delivery-mode}

| Tryb | Zachowanie |
|---|---|
| **Automatycznie** (domyślnie) | Nakładka w grze, gdy można ją pokazać, powiadomienie systemu Windows, gdy nie można. |
| **Nakładka w grze** | Zawsze stylizowane okno nad uruchomioną grą, także w wyłącznym pełnym ekranie, gdzie może być niewidoczne. Jeśli nakładka w ogóle nie może się wyświetlić, to powiadomienie przychodzi jako powiadomienie systemu Windows. |
| **Powiadomienie systemu Windows** | Zawsze systemowe powiadomienie Windows. Powiadomienia o osiągnięciach i postępie używają ikony osiągnięcia; powiadomienia o czasie gry mogą zawierać grafikę gry i pasek postępu. |
| **Oba** | To samo zdarzenie obiema drogami. |

AW Next samodzielnie wysyła powiadomienia systemu Windows i nie uruchamia żadnego innego programu, także PowerShella, więc
pojawiają się od razu. Własny identyfikator aplikacji ustawiony w `options.ini` (`[notification_advanced] appID`) nadal
przechodzi dawną drogą przez PowerShell.

Okno biblioteki może pozostać zamknięte w każdym trybie: dostarczaniem zajmuje się tracker działający w tle.

<div align="center">
<picture><source srcset="../assets/shot/notification-popup.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup.png" width="440" height="126" alt="Okno odblokowania" loading="lazy" decoding="async"></picture><br>
<sub>Okno nakładki, narysowane przez wybrany preset z grafiką samej gry</sub>
</div>

Niezależnie od trybu **Websocket @localhost:8082** rozgłasza każde zdarzenie powiadomienia jako JSON przez
lokalny websocket, dla nakładek streamingowych i innych narzędzi. Jest domyślnie włączony, nasłuchuje wyłącznie na `127.0.0.1`
i sam niczego nie wyświetla. Wyłącz go, jeśli z niego nie korzystasz. Ten sam adres udostępnia gotową
nakładkę streamingową: zobacz [Pokazuj odblokowania na streamie (OBS)](#show-unlocks-on-stream-obs).

> [!TIP]
> Po zmianie trybu użyj przycisków testowych. Udany test potwierdza drogę wyświetlania; prawdziwe
> odblokowanie nadal zależy od tego, czy źródło gry jest poprawnie obserwowane.

### Jak decyduje Automatycznie {#how-automatic-decides}

Każde powiadomienie jest kierowane raz, na podstawie tego, co AW Next może zaobserwować w tej chwili:

| Sytuacja | Co się dzieje |
|---|---|
| Nic nie zasłania ekranu | Nakładka w grze. |
| Gra jest w **pełnym ekranie** (Direct3D z optymalizacjami pełnoekranowymi Windows, które ma większość gier) | Powiadomienie systemu Windows, pokazane nad grą bez odbierania jej fokusu: powiadomienie priorytetowe, gdy są włączone, w przeciwnym razie przypomnienie, które AW Next zamyka po zwykłym czasie powiadomienia. Gry w trybie bez ramki i w oknie zachowują nakładkę. |
| Gra zajmuje ekran w **starszym trybie wyłącznym** (starsze gry, wiele gier OpenGL lub wyłączone optymalizacje pełnoekranowe) | Nic z innej aplikacji nie jest rysowane na tym ekranie. Powiadomienie trafia do Centrum powiadomień; jego dźwięk i wibracje kontrolera nadal działają. Tryb bez ramki w grze przywraca je na ekran. |
| Aplikacja nie może wyświetlić okna (brak użytecznego presetu, renderer niedostępny) | Powiadomienie systemu Windows. |
| Nakładka nie może się wyświetlić | Powiadomienia systemu Windows przez dziesięć minut, a potem nakładka jest próbowana ponownie. |
| Nakładka została poproszona, ale nigdy się nie odezwała | Brak drugiego powiadomienia, aby uniknąć duplikatu. Następne odblokowanie użyje powiadomienia systemu Windows. |

AW Next zapamiętuje, którą drogą ostatnio dostarczono powiadomienie dla każdej gry, i używa tego tylko jako rozstrzygnięcia remisu, gdy
Windows nie potrafi powiedzieć, czy gra jest w wyłącznym pełnym ekranie. Rozwiązanie zastępcze następuje tylko po jednoznacznej
porażce, więc to samo odblokowanie nigdy nie jest ogłaszane dwa razy. AW Next nie wstrzykuje się do gier ani nie wymusza zmian
trybu wyświetlania.

### Gdzie widać bieżący stan {#where-the-current-state-is-shown}

Panel **Stan gry** danej gry ma wiersz Powiadomienia z nazwą drogi, która dostarczyła ostatnie
powiadomienie, i powodem, na przykład *Działa - aktywne rozwiązanie zastępcze Windows* (tryb Prosty). Gdy nie było jeszcze
żadnego powiadomienia, pokazuje skonfigurowany tryb. Jeśli Windows zachował powiadomienie w Centrum powiadomień,
bo gra była na pełnym ekranie lub włączone było Nie przeszkadzać, wiersz o tym mówi. Zobacz
[Stan gry](game-health.md).

## Priorytetowe powiadomienia systemu Windows {#priority-windows-notifications}

Gry pełnoekranowe i inne automatyczne reguły Windows mogą włączyć **Nie przeszkadzać**, co wysyła
zwykłe powiadomienia toast do Centrum powiadomień bez ich pokazywania. **Ustawienia → Powiadomienia → Powiadomienia
priorytetowe** oznaczają odblokowania osiągnięć jako ważne. Windows raz pyta, czy AW Next może je wysyłać;
odpowiedź zmienisz w ustawieniach powiadomień Windows.

Są domyślnie wyłączone i obejmują tylko odblokowania osiągnięć i ukończenia, nigdy postęp ani czas gry.
Toast używa scenariusza `urgent`, który wymaga Windows 11 (kompilacja 22546) lub nowszego; w Windows 10
to ustawienie nic nie robi. Zobacz [dokumentację Microsoftu o powiadomieniach aplikacji](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-content).

## Gry uruchamiane przez Steam {#games-steam-runs}

Steam pokazuje własne okienko dla uruchamianych przez siebie gier, więc AW Next domyślnie milczy w ich sprawie. Włącz
**Ustawienia → Powiadomienia → Gry klienta Steam**, aby dostać także powiadomienie AW Next, z jego dźwiękiem,
nakładką, rzadkością i zrzutem ekranu na pamiątkę. Obejmuje gry posiadane oraz dodane przez SteamTools,
LuaTools lub GreenLuma: AW Next śledzi plik statystyk, który Steam przepisuje w `appcache\stats`. Aby zostawić
tylko powiadomienie AW Next, wyłącz **Steam → Ustawienia → Powiadomienia → Odblokowuję osiągnięcie**.

## Jak wygląda okno {#how-the-popup-looks}

Wygląd okna w grze to **preset**: dziesięć dołączono do aplikacji, możesz zaprojektować własny, a
preset można udostępnić jako jeden plik `.awpreset`. Zobacz [Presety i Preset Designer](presets.md).
**Nieprzezroczystość** (od 30% do 100%) w tych samych ustawieniach określa, jak bardzo okno jest przezroczyste.

## Dźwięki, głośność i czas trwania {#sounds-volume-and-duration}

- Importuj pliki `.wav`, `.mp3`, `.ogg`, `.flac`, `.m4a` lub `.aac` z ustawień Powiadomień.
- **Losowy** na liście dźwięków odtwarza inny z twoich plików przy każdym powiadomieniu oraz przy każdym
  podglądzie lub teście.
- **Dźwięk rzadkiego osiągnięcia** i **Dźwięk ukończenia na 100%** (tryb Zaawansowany) nadają tym oknom własny
  dźwięk, dla nakładki i powiadomień systemu Windows. Oba zaczynają od „Taki sam jak odblokowania”; „Brak” wycisza
  ten rodzaj okna. Dźwięk wybrany dla jednej gry w jej panelu nadal ma pierwszeństwo.
- **Dźwięk postępu** (tryb Zaawansowany) robi to samo dla okien postępu. Ma pierwszeństwo przed własnym dźwiękiem
  gry, z wyjątkiem gry ustawionej bez dźwięku. Aby wyciszyć okna postępu jednej gry, kliknij ją prawym przyciskiem i
  wycisz jej postęp.
- **Emulatory** (tryb Zaawansowany) dają każdej konsoli własny preset i dźwięk: wymieniono Xenia, RPCS3, shadPS4 i
  Kyty. Zrekompilowane gry Xbox 360 podążają za wyborem Xenii, porty PS4 za wyborem shadPS4, a
  **Taki sam jak główny** zachowuje ustawienia główne.
- Głośność nakładki wynosi od 0% do 200%; powyżej 100% nakładka wzmacnia dźwięk. Odtwarzanie powiadomień systemu
  Windows jest ograniczone przez systemową ścieżkę audio.
- Czas trwania wynika z presetu albo ze stałego limitu.
- Powiadomienia o czasie gry są ciche.

Udostępniony preset może nieść własny dźwięk, który zastępuje wybrany tutaj. Zobacz
[Udostępnianie presetu](presets.md#share-a-preset).

## Położenie i skala {#position-and-scale}

Wybierz narożnik, krawędź lub położenie wyśrodkowane w ustawieniach Powiadomień. Położenia są mierzone
względem całego ekranu, więc dolna kotwica leży na dolnej krawędzi, nie nad paskiem zadań, a
karta dotyka wybranych krawędzi, niezależnie od tego, ile miejsca na cień lub poświatę preset zostawia wokół niej. AW
mierzy każdy preset raz dla każdego położenia, w tle po jego pierwszym oknie, więc to pierwsze okno
pokazuje się w starym miejscu. Preset, którego karta zależy od długości tekstu (PS5 Steam, Slim),
jest mierzony przy każdym oknie, co opóźnia je o około pół sekundy.

**Zmień położenie** przesuwa położenie niestandardowe, używane dokładnie tak, jak je zostawiłeś; to zapisane na monitorze,
którego już nie ma, jest przywracane do widoku. Przy kilku ekranach okno pojawia się na ekranie gry,
w którą grasz, a nie tym pod myszą, a położenie niestandardowe zachowuje swoje miejsce względem tego
ekranu. Powiadomienia systemu Windows zawsze pokazują się na ekranie głównym.

Ustawienie skali zmienia rozmiar całego okna bez zmiany jego układu, a **Zmień położenie** pokazuje
podgląd w tej skali.

### Okna postępu {#progress-popups}

Osiągnięcia licznikowe (pokonaj 50 wrogów, przejedź 100 km) mogą wywoływać okno postępu na każdym kroku. W
trybie Zaawansowanym **Pozycja postępu** i **Rozmiar postępu** nadają tym oknom własne miejsce i
rozmiar. **Taki sam jak odblokowania**, wartość domyślna, podąża za własnym położeniem gry, jeśli je ma; każdy inny
wybór dotyczy okien postępu wszystkich gier. Celownik obok **Pozycja postępu** ustawia
niestandardową kotwicę tylko dla postępu. Te ustawienia przesuwają wyłącznie okno w grze.

**Kamienie milowe postępu**, we wspólnych ustawieniach powiadomień, pokazują powiadomienie o postępie tylko wtedy, gdy
licznik przekroczy kolejne 10, 25 lub 50% swojego celu. Dotyczy okna i powiadomienia systemu
Windows. Samo odblokowanie jest zawsze pokazywane.

Lista nakładki ma własne skróty klawiszowe (zobacz
[przewodnik po nakładce](overlay.md#keyboard-shortcuts-overlay-open)) i opcjonalne sterowanie gamepadem (zobacz
[przewodnik po kontrolerze](controller.md)).

## Zachowanie dla poszczególnych gier {#per-game-behavior}

Otwórz panel narzędzi gry i wybierz **Powiadomienie**, aby nadać tej grze własny preset okna,
położenie, dźwięk lub skalę. Każde pole dziedziczy ustawienie globalne, a zapisywane są tylko wartości, które
zmienisz; dźwięk oferuje także ciszę i losowy. Celownik obok Położenia przeciąga podgląd w miejsce, w którym
ma się pojawiać okno tej gry. Pięć przycisków testowych pokazuje podgląd tej gry i jej grafiki bez
zmiany postępu osiągnięć. Usunięty preset lub dźwięk wraca do wartości globalnej, a zmiana nazwy
presetu użytkownika zachowuje jego przypisania do gier.

Kliknij grę prawym przyciskiem, aby wyciszyć jej powiadomienia o postępie, zachowując powiadomienia o odblokowaniach i
ukończeniu.

Osiągnięcie z globalnym odsetkiem odblokowań równym granicy rzadkości lub niższym wyświetla swój procent i dostaje
rzadki styl presetu: **złoty** przy 5% lub mniej, **srebrny** do 10%, **brązowy** do 15%. Te granice
zmienisz w **Ustawienia → Ogólne → Progi rzadkości** ustawionych na Niestandardowe (tryb Zaawansowany).

### Tryb trofeów {#trophy-mode}

**Ustawienia → Ogólne → Wyświetlanie rzadkości** przełącza na **Tryb trofeów**: każde osiągnięcie jest oceniane według
globalnego odsetka odblokowań (złoto poniżej 20%, srebro poniżej 50%, brąz w pozostałych przypadkach lub gdy odsetek jest
nieznany) w oknie gry, nakładce, trofeach profilu i powiadomieniu. **Progi
rzadkości** przesuwają granice. Wszystkie trzy stopnie używają rzadkiego stylu presetu (`state-rare` plus
`tier-gold`, `tier-silver` lub `tier-bronze`); platyna pozostaje osobnym stanem ukończenia. Aplikacja
przekazuje presetowi stopień w `rarityTier` (wraz z `rarityMode` i zlokalizowanym `rarityGrade`); preset
bez tego pola wraca do procentu.

Po połączeniu konta PlayStation (**Ustawienia → Źródło**) gra, która ukazała się też na
PlayStation, używa swojej prawdziwej listy trofeów, skądkolwiek pochodzą jej osiągnięcia: każde osiągnięcie dostaje
stopień i grupę DLC trofeum o tej samej nazwie lub opisie. Prawdziwa platyna pokazuje się w każdym
trybie rzadkości (strona gry, statystyki, okno 100%) z nazwą, opisem i ikoną, i liczy się, gdy to
trofeum zostanie zdobyte, nawet jeśli zostały trofea z DLC. Emulatory PlayStation zachowują własne trofea. AW
znajduje listę po oryginalnej nazwie gry, więc zmiana nazwy gry niczego nie zmienia.

Każde źródło pokazuje okno 100%, także te działające na żywo (Xenia, zrekompilowane porty, GOG Galaxy,
Ubisoft Connect, Xbox PC). Gdy gra ma platynę, powiązane z nią osiągnięcie pojawia się jako
platyna.

<div align="center">
<picture><source srcset="../assets/shot/trophy-profile.webp 640w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/trophy-profile.png" width="440" height="148" alt="Nagłówek profilu z liczbami trofeów platynowych, złotych, srebrnych, brązowych i zwykłych" loading="lazy" decoding="async"></picture><br>
<sub>Profil liczy każde odblokowanie według stopnia, z platyną za ukończone gry</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/trophy-game-panel.webp 800w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/trophy-game-panel.png" width="560" height="672" alt="Strona gry, na której każde osiągnięcie jest ocenione jako złote, srebrne lub brązowe" loading="lazy" decoding="async"></picture><br>
<sub>Na stronie gry każde osiągnięcie ma swój stopień i odsetek graczy, którzy je mają</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/notification-popup-trophy.webp 594w" sizes="(max-width: 700px) 100vw, 440px"><img src="../screenshot/notification-popup-trophy.png" width="440" height="126" alt="Okno odblokowania narysowane w złotym stylu" loading="lazy" decoding="async"></picture><br>
<sub>Złote odblokowanie w presecie AW Next</sub>
</div>

## Pokazuj odblokowania na streamie (OBS) {#show-unlocks-on-stream-obs}

Przechwytywanie okna nie działa: okno jest widoczne przez kilka sekund, więc OBS nigdy
go nie złapie. Użyj źródła **Przeglądarka**, które OBS trzyma załadowane przez cały stream.

1. **Ustawienia -> Powiadomienia -> Źródło przeglądarki OBS.** **Podgląd** otwiera stronę w twojej przeglądarce
   z przykładowym odblokowaniem co dziesięć sekund, co jest najszybszym sprawdzeniem, czy cały łańcuch działa. **Kopiuj link**
   kopiuje adres.
2. W OBS: **+ -> Przeglądarka**, wklej adres w polu **URL**.
3. Ustaw dowolną **Szerokość** i **Wysokość**. Karta skaluje się, by wypełnić pole.

Źródło pokazuje ten sam preset, grafikę i styl rzadkości co okno w grze i podąża za
presetem wybranym w Ustawieniach. Przyciski testowe w **Ustawienia -> Powiadomienia** wysyłają do niego również,
niezależnie od trybu dostarczania.

> [!TIP]
> **Większe źródło to ostrzejsza karta.** Karta jest układana w rozmiarze źródła, nie rozciągana.
> Daj źródłu mniej więcej dwukrotność własnego pola presetu i umieść je w połowie rozmiaru w swojej scenie:
> `http://127.0.0.1:8082/obs/_config` podaje obie liczby. Tylko ikona osiągnięcia pozostaje miękka,
> ponieważ Steam publikuje ją w rozmiarze 64x64.

### Opcje {#options}

Dopisz je do adresu, `?first=x&then=y`:

| Opcja | Efekt |
|---|---|
| `?test=1` | Powtarza przykładowe odblokowanie co dziesięć sekund, do ustawiania położenia źródła. Usuń później. |
| `?scale=2` | Przypina kartę do tego powiększenia zamiast dopasowywać ją do źródła. `?scale=app` podąża za skalą ustawioną w Ustawieniach. |
| `?duration=8000` | Trzyma każdą kartę przez tyle milisekund zamiast skonfigurowanego czasu. |
| `?sound=1` | Odtwarza dźwięk powiadomienia przez źródło przeglądarki, dzięki czemu trafia do streamu bez przechwytywania dźwięku pulpitu. Domyślnie wyłączone, bo aplikacja już odtwarza go na twoich głośnikach. Zaznacz **Kontroluj dźwięk przez OBS** przy źródle, aby dodać go do miksu. |
| `/obs/preset/Xbox/` | Używa jednego wskazanego presetu na stream, niezależnie od ustawienia na pulpicie. Działa każda nazwa zainstalowanego presetu, także twoich własnych. |

### Uwagi {#notes}

- Strona jest pusta między odblokowaniami celowo: nic nie jest rysowane, więc nie zużywa CPU, dopóki nie pojawi się
  osiągnięcie.
- Działa tylko lokalnie. Strona i kanał nasłuchują na `127.0.0.1`, więc nic innego w twojej sieci nie może
  się z nimi połączyć.
- Ikony osiągnięć są serwowane z tego komputera dla źródeł, które trzymają grafikę lokalnie
  (Goldberg, emulatory, grafika z twojej biblioteki) i tylko dla obrazów, które ogłosiło powiadomienie.
- Adres obsługuje jedna kopia AW Next: ta, która uruchomiła się pierwsza. Druga instancja lub cokolwiek innego
  na porcie 8082 zostawia źródło bez niczego, z czym mogłoby się połączyć. Zamknij dodatkową kopię, a źródło
  połączy się ponownie w ciągu kilku sekund.
- Jeśli źródło pozostaje puste przy prawdziwym odblokowaniu, sprawdź, czy przyciski testowe działają, a potem czy wiersz
  **Websocket** jest włączony.

## Osiągnięcia na stronach biblioteki Steam {#achievements-on-steams-library-pages}

Steam nie pokazuje osiągnięć na stronie skrótu spoza Steam. Wtyczka Steam (Millennium na
komputerze, Decky w Trybie gry) może poprosić AW Next o osiągnięcia tego skrótu tym samym lokalnym kanałem,
`ws://127.0.0.1:8082`, i narysować je sama. AW Next odpowiada dla jednej gry naraz: wtyczka musi ją
wskazać, a odpowiedź nie zawiera folderu, konta ani nazwy źródła.

Własna wtyczka Millennium AW Next, w folderze `millennium/` repozytorium, robi to dla każdego
skrótu, który AW Next rozpoznaje: strona gry pokazuje wtedy własną sekcję Osiągnięcia Steam, licznik na
pasku gry, pełną listę i kartę „Twoje rzeczy” w Big Picture. Skrót jest najlepiej dopasowywany, gdy
uruchamia ten sam plik exe co pole **Plik gry** tej gry w AW Next. Jej README opisuje instalację, co
sprawdzić, gdy strona pozostaje pusta, i jak współistnieje ze Steam Cartridges, NativeGameLink i Game
Data Linker. Rozszerzenie Playnite w `playnite/` pyta w ten sam sposób, dla dowolnej gry z biblioteki
Playnite, a jego README opisuje instalację i panele, które motyw może umieścić. Poniższe żądanie jest
dla osób piszących inną wtyczkę.

Wtyczka wysyła:

```json
{ "cmd": "bridge-game", "id": "r1", "exe": "D:\\Games\\Pinyon Shift\\pinyon_shift.exe", "launchOptions": "", "steamAppId": 0, "name": "Forza Horizon" }
```

Każde pole oprócz `cmd` jest opcjonalne, a każde dodane pomaga. AW Next próbuje ich w tej kolejności: plik
exe, który biblioteka znalazła dla gry, folder gry lub ROM podany w opcjach uruchamiania (skrót
emulatora), AppID Steam, launcher w folderze gry, nazwa pliku exe, a na końcu dokładny tytuł.
Gdy jeden krok pasuje do więcej niż jednej gry, AW Next odpowiada „nie znaleziono”.

Odpowiedź:

```json
{ "cmd": "bridge-game", "id": "r1", "bridge": 1, "found": true,
  "game": { "id": "x360-4D5309C9", "name": "Forza Horizon", "total": 50, "unlocked": 12,
    "achievements": [{ "id": "1", "name": "...", "description": "...", "icon": "https://...", "iconLocked": "https://...",
      "hidden": false, "rarity": 12.5, "unlocked": true, "unlockedAt": 1790000000 }] } }
```

- `unlockedAt` jest w sekundach uniksowych. `rarity` oraz `progress` (`{ "current": 6, "max": 50 }` przy
  zablokowanym, częściowo wykonanym osiągnięciu) są obecne tylko wtedy, gdy AW Next je zna.
- Ikona zapisana na tym komputerze przychodzi jako adres `http://127.0.0.1:8082/bridge/icon/...`.
- Lista to biblioteka taka, jaką widziało ostatnie skanowanie, plus odblokowania ogłoszone od tamtej pory. Odblokowania
  nadal przychodzą kanałem: gdy któreś niesie `id` gry w `appID`, zapytaj ponownie, aby odświeżyć stronę.
- Wtyczka łączy się ze stron samego Steam (`https://steamloopback.host`) lub z procesu natywnego;
  strony internetowe są odrzucane. Gdy ustawiono hasło websocketu, potrzebne jest to samo hasło.
- Nie powinna łączyć się jako `?client=decky`: ta nazwa mówi AW Next, że Steam pokazuje własne
  powiadomienia, i AW Next wyłącza wtedy własne okno.

## Zrzuty ekranu na pamiątkę {#screenshot-souvenirs}

**Zrzut przy odblokowaniu** zapisuje obraz ekranu chwilę po pojawieniu się osiągnięcia, gdy
okno skończy się pojawiać, tak aby powiadomienie było na zdjęciu. Pliki trafiają do
`<folder>\<game>\<achievement> - <date>.png`, z datą w czasie lokalnym komputera. **Otwórz folder** w tym samym wierszu otwiera go, tworząc go
wcześniej, jeśli trzeba. Domyślny folder to `Pictures\Achievement Watcher Next` i można go zmienić.

Osiągnięcia odblokowane w tej samej sekundzie zachowują każde własny plik, a gra, której tytułu Windows
nie przyjmuje jako nazwy folderu, nadal dostaje swoje zrzuty. Przy kilku monitorach pamiątka przechwytuje
monitor, na którym jest gra, tak jak klipy wideo; bez widocznego okna gry bierze monitor
okna na wierzchu, a potem główny.

### Gra z włączonym HDR w Windows {#playing-with-windows-hdr-on}

**Zrzuty ekranu HDR** domyślnie mają wartość **Automatycznie**. W chwili przechwycenia AW Next sprawdza, czy HDR jest aktywny
na wyświetlaczu pokazującym grę. Jeśli tak, jednorazowy pomocnik przechwytuje klatkę FP16 przez Windows
Graphics Capture i mapuje jej światła do PNG SDR/sRGB, po czym kończy działanie. Przy wyłączonym HDR
**Automatycznie** i **Wyłączone** używają standardowego przechwytywania. Każda awaria pomocnika (brak obsługi w Windows,
zablokowane przechwytywanie, przekroczenie czasu) również wraca do standardowego zrzutu ekranu, więc pamiątka i
powiadomienie nie przepadają.

## Klipy wideo {#video-clips}

**Klip wideo po odblokowaniu** działa jak film z trofeum na konsoli. Gdy gra śledzona przez AW Next jest uruchomiona,
ostatnie sekundy rozgrywki są trzymane w pamięci, już skompresowane przez koder wideo karty graficznej.
Gdy pojawi się osiągnięcie, fragment wokół niego jest zapisywany jako MP4 w
`<folder>\<game>\<achievement> - <date>.mp4`, z oknem pośrodku. Folder to
`Videos\Achievement Watcher Next`, chyba że wybierzesz inny. Osiągnięcia odblokowane blisko siebie
współdzielą jeden klip.

| Ustawienie | Wybory | Domyślnie |
|---|---|---|
| Długość klipu | Od 10 do 60 sekund | 20 s |
| Przed odblokowaniem | Od 0 sekund do całego klipu. Zwiększ, gdy powiadomienia spóźniają się w wymagających grach | Połowa klipu |
| Format | H.264, HEVC lub AV1, zapisywane jako MP4 | H.264 |
| Rozdzielczość | Ekran, 2160p, 1440p, 1080p lub 720p, nigdy powyżej ekranu | 1080p |
| Liczba klatek | 30 FPS, 60 FPS lub Bez limitu, co podąża za twoim ekranem (120, 144, 240 Hz) | 30 FPS |
| Jakość | Niska, Średnia lub Wysoka | Średnia |
| Dźwięk | Tylko gra albo cały komputer | Tylko gra |

<div align="center">
<picture><source srcset="../assets/shot/video-clip-panel-800.webp 800w, ../assets/shot/video-clip-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/video-clip-panel.png" width="720" height="529" alt="Ustawienia, Powiadomienia: sekcja Klip wideo z przełącznikiem włącz/wyłącz" loading="lazy" decoding="async"></picture><br>
<sub>Sekcja Klip wideo znajduje się na dole karty Powiadomienia i jest wyłączona, dopóki jej nie włączysz</sub>
</div>

Wiersz pod tabelą szacuje rozmiar jednego klipu dla twojego ekranu. To górna granica: koder
pracuje ze stałą przepływnością, a spokojna scena daje mniejszy plik.

- **Koszt.** Nic nie działa, dopóki nie działa gra. Przechwytywanie, skalowanie i kodowanie zostają na GPU, na
  bloku kodera osobnym od tego, który renderuje grę. Rejestrator używa znacznie poniżej 1 % CPU
  i około 70 do 110 MB pamięci plus jeden klip. Nic nie jest zapisywane na dysku, dopóki osiągnięcie
  się nie odblokuje.
- **Format.** H.264 odtwarza się wszędzie, także na Discordzie i telefonach. HEVC i AV1 dają mniejsze pliki.
  AV1 wymaga GeForce RTX 40, Radeon RX 7000, Intel Arc lub nowszych; bez wybranego formatu klip
  jest nagrywany w H.264. Karta bez sprzętowego kodera H.264 używa programowego kodera Windows, na
  procesorze, w 1080p i najwyżej 30 FPS.
- **Liczba klatek.** **Bez limitu** nagrywa z częstotliwością odświeżania monitora pokazującego grę i
  podąża za nią, gdy się zmienia. Jeśli koder odrzuci częstotliwość, rejestrator schodzi do 60, potem do 30
  FPS i zapisuje to w logu. Szacunek rozmiaru zakłada dwukrotność przepływności 30 FPS dla Bez limitu.
- **Jeśli rejestrator przestanie odpowiadać.** AW Next uruchamia go ponownie po czasie oczekiwania, który za każdym razem się podwaja, i
  rezygnuje z danej gry po pięciu nieudanych restartach. Klip, którego zapis przerwał się w połowie, jest zachowywany, jeśli to, co
  zapisano, da się odtworzyć, w przeciwnym razie jest usuwany. Klip pozostawiony w połowie zapisany przez komputer, który się wyłączył, jest czyszczony
  przy następnym nagrywaniu gry.
- **HDR.** Przy włączonym HDR w Windows klipy są mapowane tonalnie jak zrzuty HDR; **Zrzuty ekranu HDR** ustawione na
  **Wyłączone** dotyczy także klipów.
- **Dźwięk.** **Tylko gra** pomija czat głosowy i muzykę. Jeśli dźwięku gry nie da się nagrać
  osobno, nagrywany jest cały komputer.
- **Co jest przechwytywane.** Monitor pokazujący grę, wraz z powiadomieniami. Bardzo stara gra w wyłącznym
  pełnym ekranie może nagrać czarne klatki.

## Ponowne oglądanie pamiątki {#seeing-a-souvenir-again}

Kliknij prawym przyciskiem odblokowane osiągnięcie w aplikacji i wybierz **Pokaż zrzut** albo **Pokaż klip**, aby
otworzyć je w przeglądarce, z innymi plikami tego samego osiągnięcia o jedno kliknięcie dalej i opcją **Pokaż w
folderze**, by znaleźć plik. W nakładce w grze małe przyciski pod **Odblokowane** otwierają tę samą przeglądarkę;
na kontrolerze lewo i prawo przełączają pliki, A odtwarza klip, a B go zamyka.

AW Next zapisuje, który plik należy do którego osiągnięcia, w chwili jego przejęcia, więc zmiana nazwy gry lub
języka aplikacji nie zrywa tego powiązania. Zrzuty ekranu i klipy zrobione przed tą wersją są odnajdywane po nazwie
pliku, w folderach ustawionych wyżej.

## Jeśli test lub odblokowanie się nie pojawia {#if-a-test-or-unlock-does-not-appear}

1. Upewnij się, że powiadomienia są włączone, i przeczytaj wiersz Powiadomienia w panelu
   **[Stan gry](game-health.md)** danej gry.
2. Sprawdź, czy tracker w tle działa.
3. W przypadku nakładek wybierz poprawny preset i przetestuj ponownie poza grą w wyłącznym pełnym ekranie.
   **Automatycznie** radzi sobie już z obydwoma przypadkami.
4. Jeśli gra pełnoekranowa lub Nie przeszkadzać ukrywa powiadomienia systemu Windows, włącz **Powiadomienia
   priorytetowe** i zatwierdź jednorazową prośbę Windows.
5. Sprawdź ustawienia powiadomień Windows dla AW Next.
6. Otwórz **Ustawienia → Zaawansowane → Diagnostyka** i sprawdź logi.

Jeśli problem nie ustępuje, przejdź do [Rozwiązywanie problemów](troubleshooting.md#notifications-do-not-appear).

---

**Dalej:** [Presety i Preset Designer](presets.md) - wygląd okna i jak zaprojektować
własne.

<div align="center">

[← Dokumentacja](README.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
