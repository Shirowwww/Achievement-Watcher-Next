---
title: "Pierwsze kroki"
description: "Zainstaluj Achievement Watcher Next, przejdź przez przewodnik pierwszego uruchomienia, wybierz tryb Prosty lub Zaawansowany, znajdź swoje gry i dbaj o aktualizacje."
---

# Pierwsze kroki

AW Next to aplikacja desktopowa dla systemów Windows i Linux. Wydania zawierają własne środowisko uruchomieniowe, więc Node.js
jest potrzebny tylko do budowania ze źródeł. W systemie Linux zainstaluj AppImage tak, jak opisuje [Linux i Steam Deck](linux.md),
a potem wróć tutaj: wszystko poniżej obowiązuje również tam, z `~/.config/Achievement Watcher Next` zamiast
`%APPDATA%\Achievement Watcher Next`.

## Instalacja {#install}

| Krok | Windows 10 i 11 | Linux (x64, beta) |
|---|---|---|
| **Pobierz** | Z [najnowszego wydania](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest): `Achievement.Watcher.Setup.<version>.exe` albo `Achievement.Watcher.Portable.<version>.zip`, aby trzymać dane obok aplikacji | Z tego samego wydania: `Achievement.Watcher.<version>.AppImage` |
| **Uruchom** | Uruchom instalator, wybierz folder, a potem otwórz AW Next z menu Start | `chmod +x`, a potem uruchom. Wymaga FUSE 2: `libfuse2t64` w Ubuntu 24.04 |
| **Dane** | `%APPDATA%\Achievement Watcher Next` (wersja przenośna trzyma folder `data` obok pliku wykonywalnego) | `~/.config/Achievement Watcher Next` |

> [!WARNING]
> Instalator jest podpisany własnym certyfikatem projektu (`CN=Shirow`), więc Windows
> SmartScreen może nadal prosić o potwierdzenie. Zobacz
> [Ostrzeżenie programu antywirusowego lub SmartScreen](troubleshooting.md#antivirus-or-smartscreen-warning). Aktualizacje
> z poziomu aplikacji instalują wyłącznie wydanie podpisane tym certyfikatem, przypięte za pomocą odcisku palca.

## Pierwsze uruchomienie {#first-launch}

<div align="center">
<picture><source srcset="../assets/shot/onboarding-dialog-800.webp 800w, ../assets/shot/onboarding-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-dialog.png" width="720" height="475" alt="Przewodnik pierwszego uruchomienia, wybór języka oraz interfejsu Prostego lub Zaawansowanego"></picture><br>
<sub>Sześć kroków: podstawy, profil, gry, źródła, wygląd i alerty oraz podsumowanie na koniec</sub>
</div>

Przewodnik pierwszego uruchomienia pyta o wybory, które wypełniają bibliotekę:

- **Podstawy**: język (interfejsu oraz metadanych gier, gdy źródło je oferuje) i interfejs,
  Prosty lub Zaawansowany (patrz niżej). Żaden nie jest wybrany z góry.
- **Profil**: nazwa wyświetlana w nagłówku, opcjonalny lokalny awatar i twoje główne konto Steam.
- **Gry**: to, co znaleziono na tym komputerze, z liczbami. Dodaj folder tylko wtedy, gdy czegoś brakuje.
- **Źródła**: opcjonalne logowania (Steam, Epic, Xbox, PlayStation, RetroAchievements), które czytają twoją prawdziwą
  bibliotekę i odblokowania zdobyte na innym komputerze. Możesz je pominąć i połączyć później w **Ustawienia →
  Źródło**. Wszystkie przełączniki źródeł są w **Dostosuj źródła**, zwiniętym, bo ustawienia domyślne czytają
  wszystko, co jest zainstalowane.
- **Wygląd i alerty**: motyw i sposób ogłaszania odblokowań, z przyciskiem **Testuj powiadomienie**.
  Domyślne **Automatycznie** nie wymaga żadnej decyzji.
- **Gotowe**: podsumowanie z przyciskiem **Zmień** przy każdym wyborze oraz wskazówkami dotyczącymi kolekcji, trybu
  trofeów, klipów wideo i nakładki.

<div align="center">
<picture><source srcset="../assets/shot/onboarding-ready-dialog-800.webp 800w, ../assets/shot/onboarding-ready-dialog.webp 1280w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/onboarding-ready-dialog.png" width="720" height="475" alt="Ostatni krok przewodnika pierwszego uruchomienia, z podsumowaniem i kartami Warto wiedzieć" loading="lazy" decoding="async"></picture><br>
<sub>Ostatni krok: każdy wybór z przyciskiem Zmień, a potem jedna karta dla każdej funkcji wartej uwagi</sub>
</div>

**Pomiń konfigurację** zachowuje twoje odpowiedzi, resztę zostawia bez zmian i uruchamia pierwsze skanowanie. **Ustawienia →
Ogólne** ponownie otwiera przewodnik.

## Prosty i Zaawansowany {#simple-and-advanced}

Wybierz jeden w przewodniku pierwszego uruchomienia i zmieniaj go w dowolnej chwili za pomocą kontrolki **Interfejs** u góry
**Ustawień**.

<div align="center">
<picture><source srcset="../assets/shot/settings-panel-800.webp 800w, ../assets/shot/settings-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/settings-panel.png" width="720" height="529" alt="Ustawienia AW Next" loading="lazy" decoding="async"></picture><br>
<sub>Kontrolka Interfejs znajduje się obok tytułu panelu; pole wyszukiwania filtruje wszystkie karty naraz</sub>
</div>

- **Prosty** pokazuje karty na co dzień: Ogólne, Wygląd, Kontroler, Powiadomienia, Presety powiadomień,
  Źródło, Foldery i Pomoc.
- **Zaawansowany** dodaje karty **Steam / GBE Fork**, **Ubisoft / Uplay R1/R2** i **Zaawansowane** oraz głębsze
  opcje wewnątrz pozostałych kart.

**Tryb Prosty ukrywa kontrolki i niczego nie wyłącza.** Śledzenie, skanowanie i powiadomienia działają
tak samo, a każda ustawiona wartość czeka na miejscu, gdy wrócisz. Stan gry kieruje się tą samą ideą:
w trybie Prostym mówi *Znaleziono dane osiągnięć* albo *Wykrywane po uruchomieniu gry*, w Zaawansowanym podaje dokładne liczby, pliki i
nazwy procesów. Istniejąca instalacja jest przełączana na **Zaawansowany**, więc nic z tego, czego używałeś, nie znika.

Pole wyszukiwania u góry **Ustawień** filtruje wszystkie karty naraz i liczy trafienia dla każdej karty.
Przeszukuje etykiety, opisy, wartości opcji i nazwy wewnętrzne, więc `hideZero` znajdzie ten sam wiersz
w każdym języku. `Ctrl+F` przenosi do niego, a `Esc` je czyści.

## Biblioteka {#the-library}

W **Ustawienia → Źródło** tarcza oznacza oficjalne biblioteki desktopowe. Włącz wiersz i odśwież;
pojawiają się tylko biblioteki wykryte na tym komputerze. Zobacz [Zgodne źródła](sources.md).

Przełącznik między wyszukiwarką biblioteki a przyciskiem `+` zmienia jeden z sześciu widoków: duże karty,
okładki pionowe, ich dwa warianty kompaktowe, listę i tabelę szczegółów z czasem gry i ostatnią
sesją. Wybór jest zapamiętywany, a każdy widok ma te same karty, filtry i menu kontekstowe.

<div align="center">
<picture><source srcset="../assets/shot/library-views-800.webp 800w, ../assets/shot/library-views.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/library-views.png" width="800" height="492" alt="Widok Szczegóły biblioteki z ostatnim osiągnięciem, ostatnią sesją i czasem gry" loading="lazy" decoding="async"></picture><br>
<sub>Widok Szczegóły: ostatnie osiągnięcie, ostatnia sesja i czas gry każdej gry na pierwszy rzut oka</sub>
</div>

**Ustawienia → Wygląd → Kafelki biblioteki** ustawia rozmiar kafelków i odstęp między nimi (do 0) oraz
pokazuje lub ukrywa nazwę gry, pasek postępu, ikonę platformy, kropkę stanu i dwa przyciski, we wszystkich widokach
naraz. Gra, którą Steam wymienia bez osiągnięć, pokazuje swoją grafikę zamiast paska; **Pasek gier bez osiągnięć**
przywraca pasek.

Kliknij grę prawym przyciskiem, aby zmienić jej nazwę, edytować czas gry lub dodać ją do kolekcji. Ustawiona
przez ciebie nazwa przetrwa ponowne skanowania i przywracanie, a okładki i dopasowanie zachowują oryginalny tytuł. Gry ze Steam
mogą przyjmować tytuł w języku twoich osiągnięć (**Ustawienia → Ogólne**).

### Kolekcje {#collections}

Kolekcje to twoje własne grupy gier. Kliknij grę prawym przyciskiem, wybierz **Kolekcje**
i zaznacz jedną albo utwórz nową. Przycisk kolekcji obok przełącznika samych zainstalowanych gier
filtruje bibliotekę do jednej kolekcji, a liczby w profilu za nią podążają.

<div align="center">
<img src="../assets/shot/collections-flow.webp" width="800" height="493" alt="Tworzenie kolekcji Ulubione, dodawanie do niej gry z menu prawego przycisku, a potem wybór jej w menu filtra, tak że biblioteka i sumy w profilu zawężają się do jej gier" loading="lazy"><br>
<sub>Utwórz kolekcję, dodaj gry z ich menu prawego przycisku, a potem przefiltruj bibliotekę według niej</sub>
</div>

<div align="center">
<picture><source srcset="../assets/shot/collections-panel-800.webp 800w, ../assets/shot/collections-panel.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/collections-panel.png" width="800" height="289" alt="Biblioteka przefiltrowana do kolekcji Ulubione, z liczbami w profilu uwzględniającymi tylko jej gry" loading="lazy" decoding="async"></picture><br>
<sub>Podgląd jednej kolekcji: przycisk przejmuje jej ikonę i kolor, a sumy liczą tylko jej gry</sub>
</div>

Kolekcja ma nazwę, kolor oraz ikonę lub własny obraz. **Edytuj kolekcję…** w menu przycisku otwiera
edytor, w którym możesz ją też usunąć; jej gry zostają w bibliotece.

<div align="center">
<picture><source srcset="../assets/shot/collection-editor.webp 550w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/collection-editor.png" width="360" height="337" alt="Edytor kolekcji z nazwą, kolorem, ikoną i obrazem" loading="lazy" decoding="async"></picture><br>
<sub>Edytor kolekcji</sub>
</div>

### Statystyki biblioteki {#library-stats}

Okrągły przycisk obok wskaźnika ukończenia w nagłówku profilu otwiera **Statystyki biblioteki**: łączny
postęp ukończenia, liczby odblokowanych i zablokowanych osiągnięć, średnią na grę, średni i śledzony czas gry,
liczby trofeów i jeden wiersz na platformę. **Pokaż tylko zainstalowane gry** ogranicza sumy do tego komputera. Strzałka
obok przycisku zwija nagłówek profilu do jednego wiersza, co daje bibliotece więcej miejsca (**Ustawienia
→ Wygląd → Profil** ma ten sam wybór).

<div align="center">
<picture><source srcset="../assets/shot/stats-overview-800.webp 800w, ../assets/shot/stats-overview.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-overview.png" width="800" height="514" alt="Panel Statystyki biblioteki: łączny postęp ukończenia, liczby odblokowanych i zablokowanych osiągnięć, średnia na grę i czas gry" loading="lazy" decoding="async"></picture><br>
<sub>Przegląd: ukończenie, liczby, średnia na grę i czas gry</sub>
</div>

**Trofea** liczą platynę za każdą ukończoną grę (grę PlayStation po zdobyciu jej platynowego trofeum) i oceniają
każde inne odblokowane osiągnięcie według rzadkości, a progi widać pod paskiem (wynikają
z ustawienia rzadkości w [Powiadomieniach](notifications.md#trophy-mode)). **Gry z platyną** wymienia
ukończone gry i datę, **Najrzadsze osiągnięcia** najtrudniejsze z tych, które masz, a **Wszystkie osiągnięcia**
otwiera pełną listę.

<div align="center">
<picture><source srcset="../assets/shot/stats-trophies-800.webp 800w, ../assets/shot/stats-trophies.webp 1228w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/stats-trophies.png" width="800" height="514" alt="Liczby trofeów, gry z platyną, najrzadsze osiągnięcia i tabela według platform" loading="lazy" decoding="async"></picture><br>
<sub>Trofea, gry z platyną, najrzadsze odblokowania i sumy według platform</sub>
</div>

## Motywy {#themes}

**Ustawienia → Wygląd** maluje całą aplikację i nakładkę w grze. Wbudowanych jest trzynaście palet,
a każdą można edytować: wybierz motyw, a edytor otworzy się na jego kolorach, po jednym wierszu na warstwę (tło okna,
górny pasek, panel biblioteki, karty i wiersze, okno ustawień, tekst, przygaszony tekst, obramowania,
akcent). Każda warstwa przyjmuje kolor z przezroczystością i opcjonalnie gradient, a pięć warstw
powierzchni może też dostać obraz tła z dopasowaniem oraz kolorową przesłoną albo rozmyciem.

Edycja pokazuje podgląd na żywo i niczego nie zapisuje. **Zapisz motyw** robi z niego twój własny motyw: zachowaj nazwę,
aby zastąpić ten motyw, albo wpisz inną, aby mieć drugi. **Niestandardowy…** to miejsce na próby, zawsze
edytowalne i nigdy nienadpisywane zapisem wykonanym z niego. **Resetuj wszystko** przywraca motyw, który
edytujesz: motyw wbudowany wraca do swojej palety, zapisany lub zaimportowany motyw wraca do tego, co jest na dysku, a
Niestandardowy wraca do palety domyślnej.

**Pliki motywów** zamieniają motyw w jeden przenośny plik. **Eksportuj motyw…** zapisuje plik `.awtheme` z
paletą, gradientami, efektami i obrazami, których użyłeś, i niczym, co dotyczy twojego komputera (obraz podróżuje jako
bajty, nigdy jako ścieżka). Eksport motywu wbudowanego jest odrzucany, dopóki nie zapiszesz go pod własną nazwą, bo
inaczej plik zainstalowałby się gdzie indziej jako „Nord” i przesłonił już istniejący Nord. **Importuj
motyw…** najpierw pokazuje aplikację narysowaną z tym motywem, wraz z jego nazwą, autorem, wersją i liczbą obrazów, a
instaluje dopiero po twoim potwierdzeniu. **Usuń motyw** usuwa zaimportowany motyw wraz z jego obrazami.

Plik `.awtheme` zawiera tylko kolory, liczby i obrazy, więc nie może niczego uruchomić ani sięgnąć do sieci
(zobacz [opis formatu](../awtheme-format.md)). Motywy stworzone przez innych są w
[galerii motywów](../gallery/themes/), a wysłanie własnego wymaga [jednego pliku](community-galleries.md). Zwykły
plik `*.css` wrzucony do `%APPDATA%\Achievement Watcher Next\themes` nadal pojawia się w selektorze, ale
nie można go wyeksportować.

## Pomoc i wskazówki {#help-and-tips}

**Ustawienia → Pomoc** to żywa dokumentacja, pogrupowana według tego, jak pojawia się pytanie: **Pierwsze kroki**,
**Coś nie działa**, **Gry emulowane** i **Personalizacja**. Pokazuje twój prawdziwy skrót klawiszowy, układ kontrolera
i przypisania, motyw oraz tryb powiadomień, a odświeża się wraz ze zmianą ustawień. Jej wyszukiwarka
ignoruje wielkość liter i znaki diakrytyczne, a każdy temat jest dostępny w obu trybach interfejsu.

## Znajdź gry i zapisy {#find-games-and-saves}

Otwórz **Ustawienia → Foldery** i wybierz ścieżkę:

- **Inteligentne wyszukiwanie** przedstawia wszystko, co znajdzie, do zatwierdzenia przed dodaniem czegokolwiek. Rozpoznaje
  foldery bibliotek po nazwie („Games”, „Jeux”, „Repacks” i ich odpowiedniki w kilkudziesięciu językach, a także
  „Emulators” i „Emulation”) na każdym dysku oraz czyta to, co zapisały launchery: manifesty Epic,
  wpisy rejestru GOG Galaxy i Ubisoft Connect oraz wskaźnik, który Windows zapisuje dla dysku wybranego
  dla gier Xbox. Dzięki temu znajduje bibliotekę nazwaną od sklepu (`D:\Epic Games`,
  `D:\XboxGames`) bez skanowania. Gry należące do launchera zachowują własne źródło. Inteligentne wyszukiwanie dodaje
  wszystko inne z tego samego folderu, zwykle tam, gdzie ląduje repack lub kompilacja Goldberga.
- **Dodaj folder** obserwuje wskazaną przez ciebie lokalizację.
- **Generuj konfiguracje** uruchamia pełniejsze skanowanie i może zastosować włączone opcje konfiguracji
  emulatorów.

Jeśli folder zostanie odrzucony, wybierz katalog, który bezpośrednio zawiera foldery zapisów, foldery AppID,
`steam_settings` lub konfigurację emulatora. [Rozwiązywanie problemów](troubleshooting.md#a-game-is-missing)
podaje pierwsze kontrole. Gdy nazwa folderu pasuje do kilku wydań Steam, a dopasowanie jest błędne,
kliknij grę prawym przyciskiem i wybierz **Ustaw AppID ręcznie…** (zobacz
[Ręczne ustawianie AppID gry](advanced.md#set-a-games-appid-by-hand)).

Listy osiągnięć nie wymagają klucza Steam Web API: pochodzą z publicznych punktów końcowych i są
zapamiętywane osobno dla każdego języka, więc potem biblioteka działa offline ([jak](sources.md#steam-metadata-without-an-api-key)).

## Powiadomienia {#notifications}

**Ustawienia → Powiadomienia** ustawia tryb dostarczania: **Automatycznie** (domyślny: nakładka w grze, gdy
można ją pokazać, powiadomienie systemu Windows lub pulpitu, gdy nie można, i nigdy to samo odblokowanie
dwa razy), **Nakładka w grze**, **Powiadomienie systemu Windows** albo **Oba**. Jeśli funkcja Nie przeszkadzać w Windows ukrywa
powiadomienia podczas gry, włącz **Powiadomienia priorytetowe** i zatwierdź jednorazową prośbę. Przyciski
testowe pozwalają wypróbować wszystko przed uruchomieniem gry. Zobacz [Powiadomienia](notifications.md) i
[na co patrzy Automatycznie](notifications.md#how-automatic-decides).

## Sprawdź grę {#check-on-a-game}

Przycisk **narzędzi** na kafelku gry otwiera jej panel **Stan gry**: czy AW Next widzi grę, odczytuje
jej osiągnięcia i ogłasza odblokowania, oraz naprawy, które mają zastosowanie. To pierwsze miejsce do otwarcia
przed zgłoszeniem problemu (zobacz [Stan gry](game-health.md)). Aby zagrać w grę od zera, użyj
[Zresetuj osiągnięcia](advanced.md#reset-a-games-achievements), co najpierw tworzy kopię zapasową wszystkiego.

## Zasobnik i uruchamianie {#tray-and-startup}

Zamknięcie głównego okna zostawia AW Next w zasobniku systemowym, gdzie tracker działający w tle nadal obserwuje
pliki i procesy na potrzeby czasu gry i odblokowań. Gdy żadne okno nie jest otwarte, oddaje pamięć
Windows, a okresowe skanowanie biblioteki czeka, dopóki działa gra. **Ustawienia → Zaawansowane →
Automatyczne aktualizacje danych o osiągnięciach** wyłącza to skanowanie dla osób, które prowadzą `steam_cache` ręcznie.
To, czy AW Next uruchamia się z Windows i zamyka do zasobnika, jest w **Ustawienia → Ogólne**. Aby zamknąć go całkowicie,
użyj menu zasobnika.

## Aktualizacje i istniejące dane {#updates-and-existing-data}

Zainstalowane wydania sprawdzają kanał wydań GitHub projektu, nigdy podczas gry. Nowa wersja
jest ogłaszana powiadomieniem pulpitu i znaczkiem na pasku tytułu (ikona w zasobniku też pokazuje niebieską kropkę),
a nic nie odbiera fokusu grze ani innej aplikacji. Komunikat zostaje, dopóki go nie zamkniesz, i wraca
po zakończeniu gry.

Kliknij powiadomienie lub znaczek, aby otworzyć okno aktualizacji. Pokazuje ono informacje o wydaniu dla każdej
pominiętej wersji oraz rozmiar pobierania, z przyciskami **Zaktualizuj teraz**, **Później** i **Pomiń tę wersję**.
Nic nie jest pobierane przed twoim wyborem. Po **Zaktualizuj teraz** to samo okno śledzi pobieranie, które
możesz anulować lub wysłać w tło. Znaczek na pasku tytułu pokazuje stan i przywraca okno.
Gdy pobieranie się zakończy, instalator pokazuje własną kartę postępu, a AW Next uruchamia się ponownie. Jeśli gra jest
uruchomiona, instalacja czeka na jej zamknięcie albo możesz zainstalować mimo to z poziomu okna. **Ustawienia →
Sprawdź aktualizacje** otwiera okno od razu. Aktualizacje pobierają tylko to, co się zmieniło, i same wracają
do pełnego instalatora, jeśli to się nie powiedzie. AppImage dla Linuksa aktualizuje się z tych samych wydań (zobacz
[Aktualizacje w systemie Linux](linux.md#updates)).

Nowsza wersja zainstalowana na starszej zachowuje twoje dane w `%APPDATA%\Achievement Watcher Next`:
ustawienia, obserwowane foldery, pamięci podręczne, czas gry, logi, zasoby powiadomień i lokalne dane kont.
Przy pierwszym uruchomieniu po aktualizacji AW Next importuje wcześniejszą instalację:

| Skąd przechodzisz | Importowane z | Co się dzieje |
|---|---|---|
| Achievement Watcher 3.x | `%APPDATA%\Achievement Watcher 3.0` | Ustawienia, presety, motywy, okładki, pamięci podręczne, kopie zapasowe i logi są przenoszone |
| Achievement Watcher 1.6.8 | `%APPDATA%\Achievement Watcher` | To samo, dla osób, które pominęły 3.x |
| Nowy komputer | nic | AW Next startuje z ustawieniami domyślnymi |

Import działa jednorazowo, kopiuje małe pliki, tworzy twarde dowiązania do dużych plików zapisywanych tylko raz i
**nigdy nie usuwa ani nie modyfikuje folderu, z którego czyta**. Liczniki czasu gry przechowywane w rejestrze również
są przenoszone, a zrzuty ekranu trafiają do `Pictures\Achievement Watcher Next`, chyba że wybrałeś
własny folder.

Dezinstalacja oferuje jedną opcję, domyślnie wyłączoną: **Usuń także ustawienia, pamięć podręczną i zapisane dane**
(albo `--delete-app-data` przy cichej dezinstalacji), która usuwa folder danych i czas gry z rejestru.
Jeśli aktualizacja wciąż zawodzi na tym samym pobranym pliku, **Ustawienia → Zaawansowane → Wyczyść pamięci podręczne** usuwa
tylko pamięci podręczne, które można pobrać ponownie (pliki aktualizacji, schematy i ikony Steam oraz Ubisoft,
narzędzia naprawcze emulatorów). Ustawienia, zapisy i kopie zapasowe zostają.

---

**Dalej:** [Zgodne źródła](sources.md): co AW Next potrafi czytać i czego wymaga każde źródło.

*Przejdź dalej, jeśli wiesz, czego potrzebujesz: [Powiadomienia](notifications.md) ·
[Stan gry](game-health.md) · [Konfiguracja Goldberg / GBE](emulator-setup.md) ·
[Rozwiązywanie problemów](troubleshooting.md)*

<div align="center">

[← Dokumentacja](README.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
