---
title: "Rozwiązywanie problemów"
description: "Rozwiązania dla brakujących gier, błędnego postępu, powiadomień, które się nie pojawiają, czasu gry oraz ostrzeżeń programu antywirusowego lub SmartScreen."
---

# Rozwiązywanie problemów

## Zacznij tutaj {#start-here}

Jeśli problem dotyczy **jednej gry**, otwórz najpierw panel **[Stan gry](game-health.md)** tej gry.
Mówi on, czy AW Next widzi grę, odczytuje jej osiągnięcia i ogłasza odblokowania, i
oferuje tylko te naprawy, które mają zastosowanie. Większość problemów z pojedynczą grą kończy się tam.

Resztę tej strony wykorzystaj do problemów dotyczących całej aplikacji. **Ustawienia → Pomoc** zawiera krótszą
wersję pierwszych kontroli w sekcji *Coś nie działa* (Stan gry i Rozwiązywanie problemów), a jej wiersz
*Twoja bieżąca konfiguracja* pokazuje motyw, tryb powiadomień, kontroler, skrót nakładki i liczbę
włączonych źródeł. W przypadku pytania, zanim będziesz pewien, że to błąd, zapytaj na
[serwerze Discord](https://discord.gg/DjTMrDsXTh). W zgłoszeniu błędu podaj wersję aplikacji, wersję
Windows, zaangażowane źródło, dokładne kroki i odpowiednie logi.

## W systemie Linux {#on-linux}

Aplikacja na Linuksa ma problemy, których ta strona nie obejmuje. AppImage nie uruchamia się bez FUSE 2
(`libfuse2t64` w Ubuntu 24.04). Pęk kluczy pyta o hasło tylko przy automatycznym logowaniu.
Skrót nakładki pod Wayland to taki, który przypisujesz w ustawieniach klawiatury pulpitu. Każdy ma swoje rozwiązanie
w [Linux i Steam Deck](linux.md#install). Reszta tej strony opisuje Windows; w systemie Linux
logi są w `~/.config/Achievement Watcher Next/logs`.

## Otwieranie logów i danych lokalnych {#open-logs-and-local-data}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Ustawienia - Zaawansowane, diagnostyka"></picture><br>
<sub>Wersje aplikacji i środowiska uruchomieniowego oraz szybki dostęp do logów, danych i sprawdzania aktualizacji</sub>
</div>

Karta **Zaawansowane** istnieje tylko w trybie Zaawansowanym. Jeśli jej nie widzisz, przełącz kontrolkę **Interfejs**
u góry **Ustawień** z Prostego na Zaawansowany; nic nie ginie po powrocie (zobacz
[getting-started.md](getting-started.md#simple-and-advanced)).

**Ustawienia → Zaawansowane → Diagnostyka** otwiera katalog logów lub danych. Domyślna ścieżka logów to:

```text
%APPDATA%\Achievement Watcher Next\logs
```

Najbardziej przydatne pliki to zwykle `Achievement Watcher.log`, `renderer.log`, `parser.log` oraz logi
Watchdoga dotkniętego źródła. Awaria obejmująca skanowanie, interfejs i powiadomienia wymaga
kilku z nich, więc użyj **Eksportuj dzienniki (.zip)** w tej samej karcie zamiast kopiować pliki ręcznie:
procesy zapisujące logi nigdy nie przestają działać, więc ręczna kopia może złapać wiersz zapisany do połowy.
Eksport działa przy uruchomionej aplikacji i dodaje plik `about.txt` z wersjami aplikacji, Electrona, Node i Chrome.

Archiwum jest przeznaczone do publicznego zgłoszenia, więc jego kopie są zamaskowane: twoja nazwa użytkownika Windows w każdej
ścieżce zamienia się w `[username]`, a klucze, tokeny i hasła w `[redacted]`, `[token]` lub
`[apikey]`. Logi na twoim dysku pozostają bez zmian, a plik, którego nie da się zamaskować, jest pomijany.
Maskowanie działa na znanych wzorcach, więc przeczytaj pliki przed opublikowaniem; folder gry nazwany twoim imieniem,
na przykład, zostaje bez zmian.

Logi są dopisywane, nigdy nie obcinane, więc awaria przetrwa następne uruchomienie. Każde uruchomienie zaczyna się od
znacznika, po którym następuje blok `[diag]` z tym, czego potrzebuje zgłoszenie błędu: wersje, ścieżki instalacji i danych,
sposób uruchomienia aplikacji, język i motyw oraz geometria każdego wyświetlacza:

```text
===== session 2026-08-11T00:53:31.890Z pid=19276 =====
[diag] app: Achievement Watcher 3.10.0 (packaged)
[diag] runtime: electron 43.4.0 · chrome 150.0.7871.224 · node 24.18.1 · v8 15.0
[diag] display: 3056414223 1080x1920 @1x work=1080x1872 rotation=270
[diag] display: 3933707034 (primary) 2048x1152 @1.25x work=2048x1104 rotation=0
```

Wklej ten blok do zgłoszenia. Problemy z rozmiarem i położeniem okna to prawie zawsze skalowanie wyświetlacza
lub wiele monitorów, a wiersze `[MainWindow]`, które po nim następują, zapisują granice okna i wyświetlacz
za każdym razem, gdy jest pokazywane, przesuwane, zmieniane rozmiarem lub zamykane.

Każdy plik logu rotuje do `<name>.log.1` po przekroczeniu 2 MB, więc zachowywana jest jedna starsza generacja.

## Brakuje gry {#a-game-is-missing}

1. Otwórz **Ustawienia → Źródło** i potwierdź, że odpowiednia integracja jest włączona.
2. Otwórz **Ustawienia → Foldery**, uruchom **Inteligentne wyszukiwanie**, a potem użyj **Generuj konfiguracje** do pełnego skanowania.
3. Dodaj ręcznie bibliotekę gier lub katalog główny zapisów, jeśli używa niestandardowej lokalizacji.
4. Wyłącz **Pokaż tylko zainstalowane gry**, aby sprawdzić, czy gra jest znana, ale nie jest już uznawana
   za zainstalowaną.
5. W przypadku zapisów emulatorów uruchom grę raz, aby utworzyła folder środowiska uruchomieniowego.

Jeśli zostały tylko resztki starych zapisów, a plików gry już nie ma, filtr samych zainstalowanych ukrywa
wpis.

Gra, której metadanych nie udało się pobrać, zostaje na liście: to, co jest na dysku, decyduje, że gra
istnieje, a wyszukiwanie online tylko ją ozdabia. Wpis pokazuje znaną lokalnie nazwę i
uzupełnia się przy późniejszym skanowaniu.

## Osiągnięcia pozostają zablokowane lub pokazują 0% {#achievements-stay-locked-or-show-0}

Brak pliku odblokowań środowiska uruchomieniowego oznacza 0%, nawet przy kompletnej liście osiągnięć.

Otwórz panel **[Stan gry](game-health.md)** gry: wskazuje brakującą część i oferuje
naprawę, czy to zapisanie danych osiągnięć na nowo, przywrócenie pliku emulatora, czy poprawienie
`steam_appid.txt` wskazującego inną grę. Aby sprawdzić ręcznie:

- zweryfikuj, czy wykryty AppID lub identyfikator platformy należy do właściwej gry;
- sprawdź, czy jest niestandardowa ścieżka zapisu;
- napraw niezgodny schemat `steam_settings` dopiero po przejrzeniu raportu;
- jeśli grałeś na innym komputerze, połącz to konto Steam: gra, której nie da się odczytać lokalnie, jest
  wtedy odczytywana z twojego profilu Steam, którego szczegóły gier muszą być publiczne. Odpowiedź jest zapamiętywana na sześć
  godzin (zobacz [Połączone konta](sources.md#connected-accounts)).

Zapisy emulatorów Steam mogą być rozdzielone między `%APPDATA%\GSE Saves` a
`%APPDATA%\Goldberg SteamEmu Saves` dla tej samej gry. AW Next czyta ten, który zawiera odblokowania, więc
nie musisz tego naprawiać ręcznie.

Gra bez zestawu osiągnięć ma brak paska postępu zamiast 0% (albo **Brak osiągnięć**, jeśli
ponownie włączyłeś ten pasek w **Ustawienia → Wygląd → Kafelki biblioteki**) i jest pomijana w statystykach
ukończenia.

**Działa z przycisku Graj w AW Next, ale nie ze skrótu Steam.** Gra z crackiem dodana do Steam
jako gra spoza Steam jest uruchamiana z własnym identyfikatorem gry, a GBE Fork czyta ten identyfikator przed swoim
`steam_appid.txt`, więc odblokowania są zapisywane pod numerem skrótu i nigdy nie docierają do karty gry.
Steam przekazuje prawdziwy identyfikator, gdy `steam_appid.txt` leży w folderze startowym skrótu (Rozpocznij
w); plik obok samego pliku wykonywalnego nie jest czytany. Stan gry oznacza skrót, którego folder startowy
go nie ma, a jego naprawa zapisuje tam plik.

**Crack scene jest używany i nic nigdy nie jest zapisywane.** Niektóre cracki nigdy nie zgłaszają osiągnięć.
Po godzinie gry bez niczego zapisanego Stan gry o tym informuje i, gdy ten crack jest plikiem biblioteki Steam
gry, proponuje zainstalowanie na nim obsługiwanego emulatora oraz późniejsze cofnięcie tego.

**Halo: Campaign Evolved i The Crew Motorfest nie zapisują niczego offline.** Serwery wydawcy
przyznają ich osiągnięcia, więc żaden crack ani emulator nie może ich zapisać. Ich panel Stan gry o tym mówi.

Zobacz [Konfiguracja Goldberg i GBE Fork](emulator-setup.md#common-problems) lub [Konfiguracja Goldberg Uplay R2](uplay-r2.md#achievements-remain-at-0), aby poznać kroki właściwe dla danego źródła.

## Dopasowano złą grę {#the-wrong-game-was-matched}

Gdy nazwa folderu gry pasuje do kilku wydań Steam, a automatyczne dopasowanie wybrało
złe, kliknij ją prawym przyciskiem i wybierz **Ustaw AppID ręcznie...**. Wpisany AppID jest zapisywany w
`steam_appid.txt` i zapamiętywany dla tego folderu instalacji, więc późniejsze naprawy go używają; **Wyczyść ręczne
AppID**, w tym samym menu, je cofa. Naprawa **Popraw plik identyfikatora gry** w Stanie gry też prosi
o AppID. Szczegóły: [Ręczne ustawianie AppID gry](advanced.md#set-a-games-appid-by-hand).

Niezgodność nie zawsze jest winą emulatora. Jeśli został celowo skonfigurowany pod identyfikator zapisany na dysku, zostaw
go w spokoju.

## Brakuje nazw, opisów lub grafik {#names-descriptions-or-artwork-are-missing}

- Odśwież, będąc online, aby aplikacja mogła ponowić próbę w źródłach metadanych.
- Potwierdź tożsamość platformową gry; błędny AppID Steam może zwrócić przekonujące, ale niezwiązane
  metadane.
- W przypadku Goldberg/GBE poprawny lokalny schemat może uzupełnić część brakującego tekstu offline.
- Użyj akcji okładki gry, aby ponowić próbę lub wybrać lokalną grafikę, gdy źródła automatyczne zawodzą.

Karta zatytułowana samym AppID Steam oznacza, że wyszukiwanie nazwy zwróciło pusty wynik, podczas gdy grafika,
pochodząca wyłącznie z AppID, została znaleziona. Następne skanowanie zastępuje numer, gdy wyszukiwanie
się powiedzie.

Osiągnięcia z DLC i aktualizacji pokazują pod tytułem grupę, do której należą (na przykład znacznik „Hearts of
Stone”), z własnych zestawów osiągnięć Steam lub, dla gry bez nich, z SteamHunters.

Opisy ukrytych osiągnięć pozostają ukryte, gdy każde dostępne źródło je pomija.

## Aktualizacja gry dodała osiągnięcia, które się nie pojawiają {#a-game-update-added-achievements-that-arent-showing-up}

Zapamiętany schemat sprawdza się ponownie w Steam co 3 dni, ponieważ Steam nigdy nie ogłasza nowych
osiągnięć. Aby wychwycić je od razu, użyj **Ustawienia → Zaawansowane → Ponownie sprawdź listy osiągnięć**, co
działa nawet przy wyłączonych **Automatyczne aktualizacje danych o osiągnięciach**. Ten przełącznik, również w Ustawienia →
Zaawansowane, zatrzymuje tylko okresowe sprawdzanie i naprawę pustych opisów. Żadne z tych sprawdzeń nie usuwa
istniejących osiągnięć ani odblokowań. Wyłącz go tylko wtedy, gdy prowadzisz `steam_cache` ręcznie.

## Aktualizacja utknęła na tym samym pliku {#an-update-is-stuck-on-the-same-file}

Pobrane pliki aktualizacji są zachowywane między uruchomieniami. Jeśli pobieranie wciąż zawodzi na tym samym pliku, użyj
**Ustawienia → Zaawansowane → Wyczyść pamięci podręczne** i sprawdź aktualizacje ponownie. Usuwane są tylko pamięci podręczne,
które można pobrać ponownie; ustawienia, dane gier i logi zostają.

Aktualizacje zwykle pobierają tylko tę część instalatora, która się zmieniła, i same wracają do pełnego
instalatora, jeśli to się nie powiedzie.

AW Next ogłasza nową wersję powiadomieniem systemu Windows i znaczkiem na pasku tytułu, a kliknięcie
któregokolwiek z nich otwiera okno aktualizacji, które wymienia informacje o wydaniu każdej pominiętej wersji. Komunikat
zostaje, dopóki go nie zamkniesz, i wraca po zakończeniu gry, nigdy w jej trakcie. Ikona w zasobniku w tym czasie
ma niebieską kropkę. **Ustawienia → Sprawdź aktualizacje** otwiera okno od razu.

**Aktualizacja odrzucona.** Każda aktualizacja jest sprawdzana względem przypiętego certyfikatu podpisującego projektu, zanim
zostanie zainstalowana, nie dowolnym podpisem i nie sumą SHA-512 opublikowaną obok niej, ponieważ obie pochodzą z
tego samego wydania. Odrzucenie prawie zawsze oznacza, że pobrany plik został zmanipulowany lub uszkodzony:
wyczyść pamięci podręczne jak wyżej i pobierz ponownie z
[oficjalnej strony Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases).

## Powiadomienia się nie pojawiają {#notifications-do-not-appear}

1. Upewnij się, że tracker w tle działa.
2. Otwórz grę i przeczytaj wiersz Powiadomienia w jej panelu **Stan gry**: wskazuje drogę,
   która dostarczyła ostatnie powiadomienie dla tej gry, i dlaczego.
3. Użyj testów zwykłego, rzadkiego i nakładki w **Ustawienia → Powiadomienia**.
4. Potwierdź tryb dostarczania i wybrany preset. W trybie **Automatycznie** brak okna nakładki jest często
   zamierzonym rozwiązaniem zastępczym: zobacz [Powiadomienia](notifications.md#how-automatic-decides).
5. Sprawdź uprawnienia powiadomień Windows dla AW Next.
6. Jeśli problem występuje tylko podczas gry lub na pełnym ekranie, włącz **Powiadomienia priorytetowe** w
   **Ustawienia → Powiadomienia** i zaakceptuj monit o uprawnienie Windows.
7. Przetestuj nakładkę poza wyłącznym pełnym ekranem.
8. Przejrzyj logi zaraz po nieudanym teście lub odblokowaniu.

Jeśli biblioteka się aktualizuje, a powiadomienie się nie pojawia, problemem jest droga powiadomień. Jeśli
biblioteka też pozostaje bez zmian, najpierw zdiagnozuj źródło lub ścieżkę zapisów.

## Źródło przeglądarki OBS pozostaje puste {#the-obs-browser-source-stays-empty}

1. Naciśnij **Podgląd** w **Ustawienia → Powiadomienia → Źródło przeglądarki OBS** albo otwórz
   `http://127.0.0.1:8082/obs/?test=1`. Przykładowa karta co dziesięć sekund oznacza, że strona i kanał
   działają, a problem leży w ustawieniach źródła w OBS.
2. Zupełnie nic, nawet pustej strony: inna kopia AW Next lub inny program zajmuje port
   8082. Adres obsługuje tylko kopia, która uruchomiła się pierwsza.
3. Pusta strona między odblokowaniami jest normalna. Użyj `?test=1`, aby zobaczyć, jak się rysuje.
4. Sprawdź, czy **Websocket @localhost:8082** jest włączony w **Ustawienia → Powiadomienia → Transport**: źródło
   czyta ten kanał.
5. Karta wypełnia dowolny rozmiar źródła. Jeśli wygląda na miękką, daj źródłu więcej pikseli i
   umieść je mniejsze w scenie.

Pełną konfigurację znajdziesz w [Pokazuj odblokowania na streamie (OBS)](notifications.md#show-unlocks-on-stream-obs).

## Gra nie uruchamia się przyciskiem Graj {#a-game-will-not-start-from-the-play-button}

Niektóre gry wymagają uprawnień administratora, ponieważ ich manifest lub launcher o to prosi. Windows
odmawia ich uruchomienia w sposób, w jaki AW Next zwykle uruchamia grę, i zgłasza `EACCES`.

AW Next ponawia wtedy próbę przez powłokę Windows, która wyświetla zwykły monit UAC, więc gra
uruchamia się po twoim potwierdzeniu. Jeśli i to zostanie odrzucone, AW Next proponuje ponowić próbę jako administrator. Tylko
gra jest podnoszona, ponieważ podniesiony AW Next tworzyłby pliki, których twoje zwykłe konto nie może zapisać ponownie.
Odrzucenie monitu UAC jest traktowane jako decyzja, a nie błąd.

## Czas gry nie jest śledzony {#playtime-is-not-tracked}

AW Next śledzi skonfigurowany plik wykonywalny gry i czas życia jego procesu. Jeśli zamiast niego uruchamia się launcher, pomocnik lub
plik o innej nazwie:

- kliknij grę prawym przyciskiem i otwórz jej konfigurację;
- wybierz plik wykonywalny, który pozostaje aktywny podczas gry;
- unikaj procesów launchera i obsługi awarii;
- uruchom grę ponownie po zapisaniu.

Gra w Javie, która uruchamia się przez `javaw.exe` i kończy własny launcher, jest śledzona automatycznie przez ten proces
Java.

Aby poprawić już błędną sumę, użyj **Osiągnięcia i czas gry → Edytuj czas gry…** (zobacz
[Edycja czasu gry](advanced.md#editing-a-games-playtime)).

## Trofea PlayStation się nie importują {#playstation-trophies-do-not-import}

- *Sesja PlayStation wygasła*: połącz konto ponownie w **Ustawienia → Źródło**.
- *PlayStation prosi o zwolnienie tempa* lub *Wstrzymane przez PlayStation*: Sony ogranicza częstotliwość żądań. Zaimportuj
  ponownie za kilka minut, a import będzie kontynuowany od miejsca, w którym się zatrzymał.
- *Na tym koncie nie ma jeszcze listy trofeów*: konto nie ma listy trofeów do zaimportowania.

## Gra Nemirtingas Epic niczego nie zapisuje {#a-nemirtingas-epic-game-records-nothing}

Gdy folder gry zawiera emulator (jego bibliotekę `EOSSDK` z
`nepice_settings\NemirtingasEpicEmu.json` obok), karta **Stan gry** tej gry pokazuje wiersz
**Emulator Epic**:

- **SavePath musi mieć wartość `"appdata"`.** Emulator zapisuje osiągnięcia w
  `%APPDATA%\NemirtingasEpicEmu`, skąd czyta je AW Next, tylko przy tej wartości; każda inna zostawia je
  w folderze gry. Wiersz ostrzega, gdy ustawiono coś innego.
- **Niektóre gry potrzebują argumentów uruchamiania Epic.** Niektóre gry EOS logują się do emulatora, a więc zapisują
  osiągnięcie, tylko gdy launcher przekazuje `-epicapp=...` i pozostałe. Dopóki emulator niczego nie
  zapisał, wiersz oferuje **Dodaj argumenty uruchamiania Epic**, co zapisuje je w ustawieniach
  uruchamiania gry na podstawie `AppId` z konfiguracji. Działa też plik `.bat`, który je przekazuje.
- Jeśli gra zawiesza się przy uruchomieniu z zainstalowanym emulatorem, wyłącz jego wtyczkę nakładki
  (`"Plugins": { "Overlay": { "Enabled": false } }`); wiersz przypomina o tym, dopóki jest włączona.

## Ubisoft lub Uplay R2 używa złej akcji {#ubisoft-or-uplay-r2-uses-the-wrong-action}

Gry Ubisoftu powinny dostać metadane Ubisoftu i naprawę Uplay R2, a nie akcję GBE dla Steam. Uruchom
nowe skanowanie folderów i sprawdź ikonę źródła. Jeśli gra nadal jest błędnie rozpoznawana, dołącz do zgłoszenia `parser.log`,
wyświetlone źródło i identyfikatory oraz nazwę katalogu gry.

## Ostrzeżenie programu antywirusowego lub SmartScreen {#antivirus-or-smartscreen-warning}

Wydania pakietowe są podpisane własnym certyfikatem projektu, przypiętym według dokładnego odcisku palca, a nie
wystawionym przez publicznie zaufany urząd, więc Windows SmartScreen może nadal ostrzegać. Nigdy nie musisz
instalować certyfikatu. Przed zainstalowaniem aktualizacji AW Next sprawdza, czy jest podpisana, czy
podpisującym jest `CN=Shirow`, czy odcisk palca pasuje do jednego z dwóch przypiętych w aplikacji i czy
plik nie został zmodyfikowany po podpisaniu. Suma SHA-512 publikowana z wydaniem nie może zastąpić tego sprawdzenia,
ponieważ obie zostałyby podmienione razem. Opcjonalne biblioteki DLL emulatorów mogą też wywoływać wykrycia heurystyczne.
Pobieraj wyłącznie z
[oficjalnej strony Releases](https://github.com/Shirowwww/Achievement-Watcher-Next/releases) i porównaj
instalator z sumą SHA-512 w odpowiednim `latest.yml` dla drugiego sprawdzenia.

Nie wyłączaj ochrony w całym systemie. Zgłoś plik poddany kwarantannie, pochodzący z oficjalnego wydania, dostawcy
programu antywirusowego jako fałszywy alarm.

### Samodzielne sprawdzenie wydania {#checking-a-release-yourself}

Każdy opublikowany instalator można wyszukać w VirusTotal po jego SHA-256:

```powershell
Get-FileHash "Achievement.Watcher.Setup.3.12.7.exe" -Algorithm SHA256
```

Otwórz `https://www.virustotal.com/gui/file/<the hash it prints>`. Jeśli plik jest tym opublikowanym,
raport już tam jest. Dla bieżącego wydania jest to
[instalator 3.12.7](https://www.virustotal.com/gui/file/183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96)
(`183be0f0780edcf4377607a357313125d53b9091f50c7114e3bee3998b5a4d96`).

Wynik wymienia, co myśli każdy silnik. Garstka wykryć heurystycznych w kompilacji zawierającej
pliki emulatorów to fałszywy alarm opisany niżej. Liczy się to, że suma pasuje do pliku
opublikowanego na stronie wydań.

### Pliki emulatorów są oznaczane {#the-emulator-files-are-flagged}

To wykrycie, na które ludzie faktycznie trafiają, i jest to fałszywy alarm. Zapisywanie osiągnięć dla
gry bez uruchomionego klienta sklepu oznacza umieszczenie obok niej biblioteki zastępczej: emulatora Steam (GBE
Fork) lub loadera Ubisoftu. Silniki wykrywania pilnują dokładnie tego, więc oznaczają to, co plik
*robi*, a nie to, co zawiera. Windows Defender poddaje kwarantannie od razu każdą kopię, którą widzi: w folderze
gry, zainstalowaną z AW Next i w jego pamięci podręcznej.

**Kiedy się uruchamia.** W chwili zapisu pliku i tylko wtedy:

| Co zrobiłeś | Co jest zapisywane |
|---|---|
| Uruchomiłeś naprawę, z menu gry lub z Ustawień | emulator lub loader, do folderu tej gry |
| Otworzyłeś **Ustawienia → Emulatory → Ubisoft / Uplay R1/R2** | wbudowane loadery, do własnej pamięci podręcznej AW Next |
| Włączyłeś **Automatycznie naprawiaj nowo wykryte gry** | to samo, podczas skanowania, dla każdej gry, która tego potrzebuje |

Uruchomienie AW Next nie zapisuje żadnego z nich. Automatyczna naprawa jest wyłączona, dopóki jej nie włączysz, i ostrzega
wcześniej, dając możliwość dodania najpierw wykluczenia Defendera. Jeśli była już włączona, to samo
ostrzeżenie pojawia się raz, przed pierwszym zapisem, z wykluczeniem i przełącznikiem wyłączenia w oknie dialogowym.
Nic nie jest zapisywane, gdy okno jest ukryte w zasobniku.

**Co robi z tym AW Next.** Kwarantanna jest zgłaszana jako problem programu antywirusowego, z przyciskiem
zezwalającym na folder w Windows Defender i drugim do przywracania usuniętych plików. **Ustawienia →
Emulatory → Ubisoft / Uplay R1/R2 → Przywróć wbudowane DLL** przywraca je w dowolnej chwili.

**Co zrobić.** Zezwól na plik, który wskazał twój program antywirusowy, albo wyklucz
`%APPDATA%\Achievement Watcher Next\cache`. To chroni własne kopie AW Next; kopia w folderze
gry nadal może być oznaczona, więc wyklucz też ten folder, jeśli to się powtarza. Zgłoszenie fałszywego
alarmu twojemu dostawcy naprawia go dla wszystkich.

Windows Defender nazywa archiwum GBE Fork `Trojan:Win32/Suschil!rfn`, gdy AW Next pobiera je do
swojej pamięci podręcznej. To ten sam fałszywy alarm: zezwól na niego albo wyklucz folder pamięci podręcznej i uruchom
poprawkę ponownie.

**Do sprawdzenia najpierw.** Oba są zewnętrzne i mają otwarty kod: emulator Steam pochodzi z oficjalnych
[wydań GSE Fork](https://github.com/Detanup01/gbe_fork), a loadery Ubisoftu są dostarczane w
`app/resources/uplayR1/` i `app/resources/uplayR2/` w repozytorium. AW Next weryfikuje te wbudowane
względem znanych skrótów SHA-256, ich architektury PE i zdolności do obsługi osiągnięć, zanim jakakolwiek
naprawa ich użyje, i odrzuca plik, który nie przejdzie sprawdzenia.

### Program antywirusowy reaguje, gdy działa AW Next {#an-antivirus-reacts-while-aw-next-runs}

Silniki behawioralne (System Watcher w Kaspersky, Advanced Threat Defense w Bitdefender) oceniają to, co
program robi, a nie to, co zawiera. AW Next nie uruchamia PowerShella do powiadomień Windows, dźwięków toast
ani sprawdzania podpisu aktualizacji i nie kompiluje kodu do `%TEMP%`: zrzuty ekranu używają
natywnego pomocnika dostarczanego z aplikacją, a sprawdzanie powiadomień wywołuje Windows bezpośrednio.

Jeśli twój program antywirusowy mimo to reaguje, zanotuj dokładną nazwę wykrycia i zgłoś plik, który wskazuje, jako fałszywy
alarm. W przypadku Kaspersky jest to [opentip.kaspersky.com](https://opentip.kaspersky.com): wyszukaj plik
po jego sumie, a potem **Submit to reanalyze**.

## Okno się nie otwiera {#the-window-does-not-open}

- Użyj ikony w zasobniku (w obszarze powiadomień), na wypadek gdyby aplikacja uruchomiła się ukryta.
- Zakończ zawieszony proces AW Next, a potem uruchom go ponownie.
- Usuń `ELECTRON_RUN_AS_NODE` ze środowiska, jeśli ustawiono ją na potrzeby programowania; powoduje, że
  Electron uruchamia się jako zwykły Node.
- Sprawdź `renderer.log` i główny log aplikacji, aby znaleźć pierwszy błąd.
- Spróbuj **Ustawienia → Ogólne → Wyłącz akcelerację sprzętową**, jeśli interfejs pozostaje widoczny dość długo, aby
  to zmienić.

## Zacznij od nowego profilu {#start-with-a-fresh-profile}

Użyj tego dopiero po utworzeniu kopii zapasowej danych, które chcesz zachować:

1. Zamknij AW Next całkowicie z zasobnika.
2. Zmień nazwę `%APPDATA%\Achievement Watcher Next` na `Achievement Watcher Next.backup`.
3. Uruchom aplikację i odtwórz problem z nowym profilem.

Jeśli problem zniknie, przywróć tylko potrzebne dane albo dołącz odpowiednie pliki konfiguracyjne do
zgłoszenia. Zmiana nazwy zostawia drogę powrotną; usunięcie nie.

## Zgłoś problem {#report-the-problem}

Najpierw przeszukaj [istniejące zgłoszenia](https://github.com/Shirowwww/Achievement-Watcher-Next/issues). Jeśli
żadne nie pasuje, otwórz zgłoszenie błędu z użyciem szablonu repozytorium i dołącz logi po usunięciu wszystkiego, czego
nie chcesz udostępniać publicznie.

---

**Zobacz też:** [FAQ](faq.md) po krótkie odpowiedzi · [Narzędzia zaawansowane](advanced.md) po konserwację,
czyszczenie pamięci podręcznych i resetowanie · [Stan gry](game-health.md) dla problemów z pojedynczą grą.

Ścieżka użytkownika kończy się tutaj. Dokumentacja staje się potem techniczna:
[Opis techniczny Goldberg/GBE](../goldberg-gbe.md) dla formatów plików i reguł wykrywania oraz
[Architektura](../architecture.md) dla granic między aplikacją / rendererem / Watchdogiem.

<div align="center">

[← Dokumentacja](README.md) · [Pierwsze kroki](getting-started.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
