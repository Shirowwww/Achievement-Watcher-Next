---
title: "Narzędzia zaawansowane"
description: "Narzędzia konserwacji w Ustawienia, Zaawansowane: czyszczenie pamięci podręcznych, diagnostyka, kopia zapasowa profilu, ręczne AppID i resetowanie."
---

# Narzędzia zaawansowane

Te narzędzia są w **Ustawienia → Zaawansowane** lub w menu prawego przycisku gry. Karta Zaawansowane
istnieje tylko wtedy, gdy interfejs jest w trybie **Zaawansowanym**: przełącz kontrolkę **Interfejs** u góry
Ustawień, jeśli jej nie widzisz. Nic nie ginie po powrocie.

<div align="center">
<picture><source srcset="../assets/shot/advanced-panel-800.webp 800w, ../assets/shot/advanced-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/advanced-panel.png" width="720" height="529" alt="Ustawienia - Zaawansowane, konfiguracja i konserwacja"></picture><br>
<sub>Konfiguracja &amp; konserwacja; pozostałe sekcje zwijają się pod nią</sub>
</div>

## Konfiguracja i konserwacja {#setup-and-maintenance}

| Narzędzie | Co robi |
|---|---|
| **Napraw wszystkie wykryte gry** | Uruchamia odpowiednią naprawę (Steam/GBE Fork lub Ubisoft/Uplay R2) dla każdej zgodnej wykrytej gry ze znanym folderem instalacji. To odbudowuje gry, które już mają konfigurację. |
| **Wyłącz akcelerację sprzętową** | Wyłącza akcelerację GPU, gdy okno lub nakładka zachowują się źle. Wymaga ponownego uruchomienia. |
| **Wyczyść pamięci podręczne** | Usuwa tylko pamięci podręczne możliwe do ponownego pobrania: pliki aktualizacji, pamięć podręczną schematów i ikon Steam/Ubisoft oraz pobrane narzędzia naprawcze emulatorów. Ustawienia, zapisy, kopie zapasowe i pliki umieszczone ręcznie nigdy nie są ruszane. |
| **Ponownie sprawdź listy osiągnięć** | Sprawdza w Steam osiągnięcia dodane przez aktualizację gry. Dzieje się to co 3 dni; przycisk wymusza to teraz. |
| **Automatyczne aktualizacje danych o osiągnięciach** | Domyślnie włączone. Wyłączone zatrzymuje to ponowne sprawdzanie i naprawę pustych opisów, dla osób, które prowadzą `steam_cache` ręcznie. **Ponownie sprawdź listy osiągnięć** nadal działa, gdy jest wyłączone. |

Ustawienia naprawy właściwe dla źródła są w **Ustawienia → Emulatory**. **Ubisoft / Uplay R2** zawiera
stan pakietu, kontrolki importu/przywracania DLL i ukierunkowaną naprawę zbiorczą; szczegóły loadera i INI pozostają
automatyczne.

**Wyczyść pamięci podręczne** to pierwsza rzecz do wypróbowania, gdy aktualizacja wciąż zawodzi na tym samym pobranym pliku.

## Diagnostyka {#diagnostics}

<div align="center">
<picture><source srcset="../assets/shot/diagnostics-panel-800.webp 800w, ../assets/shot/diagnostics-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/diagnostics-panel.png" width="720" height="529" alt="Ustawienia - Zaawansowane, diagnostyka" loading="lazy" decoding="async"></picture><br>
<sub>Wersje i jedno kliknięcie do folderów logów i danych</sub>
</div>

Karta Diagnostyka wypisuje wersje aplikacji, Electrona, Node i Chrome oraz otwiera folder logów,
folder danych lub sprawdzenie aktualizacji. **Eksportuj dzienniki (.zip)** pakuje wszystkie pliki logów w jedno archiwum,
gdy aplikacja działa; ręczne kopiowanie jest zawodne, ponieważ procesy je zapisujące nigdy się nie zatrzymują.
Twoja nazwa użytkownika oraz każdy klucz, token lub hasło są zamaskowane w archiwum, a nie w logach na dysku. Zobacz
[Rozwiązywanie problemów](troubleshooting.md#open-logs-and-local-data), aby dowiedzieć się, czego potrzebuje zgłoszenie błędu.

## Kopia zapasowa profilu {#profile-backup}

<div align="center">
<picture><source srcset="../assets/shot/profile-backup-panel-800.webp 800w, ../assets/shot/profile-backup-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/profile-backup-panel.png" width="720" height="529" alt="Ustawienia - Zaawansowane, kopia zapasowa profilu" loading="lazy" decoding="async"></picture><br>
<sub>Eksportuj profil i Przywróć profil, w Ustawienia → Zaawansowane</sub>
</div>

**Eksportuj profil…** zapisuje twoje ustawienia, wybory biblioteki, presety, motywy, okładki, własne tła,
punkty przywracania GBE i czas gry w jednym pliku `.awbackup`, na potrzeby ponownej instalacji lub nowego komputera. Logowania,
pamięci podręczne i logi nigdy nie są zapisywane, więc potem logujesz się ponownie do Epic, Steam, Xbox, PlayStation i
RetroAchievements. **Przywróć profil…** najpierw sprawdza cały plik i stosuje go przy
następnym uruchomieniu. Zastępowane pliki są zachowywane, a nieudane przywracanie przywraca wszystko.

## Usunięte gry {#removed-games}

Gra usunięta przez **Usuń z AW Next** jest wymieniona w **Ustawienia → Ogólne → Usunięte gry**
i można ją przywracać pojedynczo lub wszystkie naraz. Użyj tego dla błądzącego folderu, który skanowanie wciąż
znajduje, a który nie jest grą; aby ukryć prawdziwą grę, lżejsze jest **Ukryj w widoku**
(zobacz [Ukrywanie, usuwanie lub czyszczenie gry](#hide-remove-or-clear-a-game)).

## Zresetuj osiągnięcia gry {#reset-a-games-achievements}

**Zresetuj osiągnięcia**, na stronie gry obok czasu gry lub w jej menu prawego przycisku, odsyła
każde osiągnięcie do stanu zablokowanego, abyś mógł przejść grę od nowa. AW Next ogłasza je jako
nowe, gdy się odblokują.

<div align="center">
<picture><source srcset="../assets/shot/achievements-800.webp 800w, ../assets/shot/achievements.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/achievements.png" width="800" height="492" alt="Strona gry z opcją Zresetuj osiągnięcia" loading="lazy" decoding="async"></picture><br>
<sub>Reset znajduje się obok licznika ukończenia na stronie samej gry</sub>
</div>

Każdy użyty plik ma najpierw kopię zapasową w
`%APPDATA%\Achievement Watcher Next\backups\achievements\<appid>\<date>\`, a potwierdzenie wymienia
dokładne pliki, zanim cokolwiek zostanie ruszone. Plik, którego kopia się nie udała, jest pomijany, a nie czyszczony.

| Źródło | Co robi reset |
|---|---|
| Emulatory Steam (Goldberg / GBE i zgodne układy, w tym Goldberg SocialClub i Uplay R2) | Usuwa zapis osiągnięć. Emulator zapisuje nowy przy następnym odblokowaniu. |
| RPCS3 | Usuwa `TROPUSR.DAT`. Lista trofeów (`TROPCONF.SFM`) zostaje nietknięta. |
| ShadPS4 | Blokuje ponownie trofea wewnątrz `TROP*.XML`, który zawiera też listę trofeów, więc plik jest edytowany, a nie usuwany. |
| KytyPS5 | Usuwa pliki odblokowań gry `trophies_*.json`. Lista trofeów zostaje w pakiecie samej gry. |
| Xenia | Czyści flagę zdobycia wewnątrz `.gpd`, który zawiera też listę osiągnięć, więc plik jest edytowany. |
| Steam, GOG Galaxy, Ubisoft Connect, EA, Epic, Xbox | **Niemożliwe.** Te źródła trzymają odblokowania na twoim koncie i synchronizują je ponownie; tylko konto może je wyczyścić. AW Next o tym mówi. |

Liczniki postępu przechowywane obok osiągnięć (`stats.ini`, `stats.bin`, …) również są resetowane i mają kopię zapasową:
w osiągnięciu „przejedź 1000 km” licznik to postęp, a pozostawienie go pełnego sprawiłoby, że
osiągnięcie odpaliłoby od razu albo już nigdy.

**Przywróć kopię zapasową osiągnięć**, w tym samym menu prawego przycisku, przywraca cały reset. Odśwież
bibliotekę potem, aby odczytać przywrócone odblokowania.

> [!NOTE]
> Reset czyści też własny zapis AW Next o tym, co zostało już odblokowane, także w działającym
> trackerze w tle. W przeciwnym razie ponownie zdobyte osiągnięcie nigdy nie zostałoby ogłoszone.

## Zablokuj ponownie pojedyncze osiągnięcie {#re-lock-a-single-achievement}

Kliknij prawym przyciskiem odblokowane osiągnięcie na stronie gry i wybierz **Zablokuj to osiągnięcie ponownie**, aby
zagrać jeszcze raz tylko pod to. Tylko to osiągnięcie wraca do zablokowanego: jego flaga, czas odblokowania i
postęp w zapisie emulatora, jego licznik, gdy zapis go z nim łączy, oraz własny
zapis AW Next, więc zostanie ogłoszone jako nowe, gdy je zdobędziesz. Potwierdzenie wymienia pliki, a każdy plik
ma najpierw kopię zapasową, jak przy resecie; **Przywróć kopię zapasową osiągnięć** je przywraca.

Najpierw zamknij grę. Emulator trzyma odblokowania w pamięci i zapisuje je z powrotem, gdy gra
się kończy, co cofnęłoby zmianę, więc AW Next odmawia, gdy gra jest uruchomiona.

Działa z tekstowymi zapisami emulatorów Steam (Goldberg i GSE, CODEX, RUNE, OnlineFix, RLD!,
3DM, ALI213, TENOKE, Hoodlum, RAZOR1911, CreamAPI), UniverseLAN, Nemirtingas, Uplay R1 i R2,
GreenLuma i LumaPlay w Windows oraz z zapisami konsol RPCS3, ShadPS4, Xenia, KytyPS5, portami
Xbox 360 i XLLN. Zapisy SmartSteamEmu (`stats.bin`) i SKIDROW (`achieve.dat`) nie są edytowane po jednym
osiągnięciu, ponieważ ich układ nie jest udokumentowany; dla nich użyj **Zresetuj osiągnięcia**.

## Ukrywanie, usuwanie lub czyszczenie gry {#hide-remove-or-clear-a-game}

Menu prawego przycisku gry ma trzy sposoby na to, by zniknęła, od najlżejszego do najsilniejszego:

| Pozycja | Co się dzieje | Jak cofnąć |
|---|---|---|
| **Ukryj w widoku** | Gra znika z Wszystkie gry, każdej kolekcji i statystyk, ale jest nadal śledzona i nadal powiadamia. | Menu Kolekcje pokazuje widok **Ukryte**, gdy jakaś gra jest ukryta; kliknij ją tam prawym przyciskiem i wybierz **Pokaż ponownie**. |
| **Usuń z AW Next** | Skanowanie pomija grę: znika z biblioteki. Przeznaczone dla narzędzi i innych rzeczy, które nie są grami. | **Ustawienia → Ogólne → Usunięte gry**. |
| **Wyczyść dane tej gry…** | Wszystko, co AW Next trzyma o grze, zostaje skasowane: jej zapisy osiągnięć (najpierw z kopią zapasową, jak przy resecie), czas gry, zapamiętana lista osiągnięć i ikony, ustawienia poszczególnej gry oraz konfiguracja emulatora, którą AW Next zapisał w jej folderze. Potwierdzenie najpierw wymienia każdą część. | Nie ma czego cofać: następne skanowanie znajduje grę ponownie jako nową. |

## Zmiana nazwy gry {#renaming-a-game}

**Ustawienia gry → Zmień nazwę…**, w menu prawego przycisku, ustawia nazwę, pod którą gra jest pokazywana: na jej
kafelku i ekranie, w wyszukiwaniu i sortowaniu, w powiadomieniach oraz w folderach, do których zapisywane są zrzuty ekranu i klipy.
Wyszukiwanie nadal znajduje grę po jej oryginalnej nazwie. Zostaw pole puste albo wybierz
**Przywróć oryginalną nazwę**, aby wrócić. Nazwa jest przechowywana dla każdej gry w `cfg/gameTitles.json`, więc
przetrwa ponowne skanowania i wchodzi w skład kopii zapasowej profilu. Wyszukiwanie okładek i dopasowywanie gier używają oryginalnej
nazwy.

**Ustawienia → Ogólne → Tytuły gier w moim języku**, domyślnie włączone, pokazuje gry Steam pod
tytułem, jaki Steam im nadaje w języku twoich osiągnięć (we własnym języku gry, gdy ją ma).
Okładki podążają za tym samym językiem. Lokalny katalog Steam odpowiada dla gier, które zna twój klient Steam;
pozostałe są pytane raz, partiami, i sprawdzane ponownie po miesiącu. Nazwa, którą sam ustawisz, zawsze
ma pierwszeństwo.

## Edycja czasu gry {#editing-a-games-playtime}

**Osiągnięcia i czas gry → Edytuj czas gry…**, w menu prawego przycisku, zastępuje łączny czas gry,
na przykład przeniesiony z innego trackera lub taki, który pominął sesje. Wpisz godziny
(`12.5`) albo godziny i minuty (`12h30` lub `12:30`). Data ostatniej sesji jest zachowywana, a AW Next
dodaje późniejsze sesje do nowej sumy. Gra, którą posiadasz na Steam, nigdy nie spada poniżej czasu gry, jaki Steam
podaje: następne skanowanie podnosi niższą sumę z powrotem do wartości ze Steam.

## Inny język osiągnięć dla jednej gry {#a-different-achievement-language-for-one-game}

**Ustawienia gry → Język osiągnięć**, w menu prawego przycisku, pokazuje osiągnięcia i
powiadomienia jednej gry w innym języku niż reszta biblioteki. **Taki jak w aplikacji** wraca do
wyboru globalnego.

## Ręczne dodawanie gry {#add-a-game-manually}

Przycisk `+` obok wyszukiwarki biblioteki dodaje grę na podstawie tytułu i pliku wykonywalnego, z opcjonalną
platformą i AppID Steam. Użyj go dla gry, której żadne źródło nie wykrywa: samodzielnej kompilacji, instalacji
przenośnej lub emulatora, który uruchamiasz sam.

Gra dodana ręcznie:

- da się ją uruchomić i śledzi czas gry jak każdy inny wpis;
- pokazuje **Brak osiągnięć**, jeśli ich nie ma, i jest pomijana w statystykach ukończenia zamiast
  liczyć się jako 0%;
- może później przyjąć schemat osiągnięć Steam po dodaniu AppID, bez ponownego tworzenia;
- zachowuje zabezpieczoną diagnostykę poszczególnej gry, podczas gdy działania destrukcyjne pozostają ukryte.

Foldery dodane ręcznie mają na liście Foldery małą ikonę, aby odróżnić je od lokalizacji
znalezionych przez Inteligentne wyszukiwanie.

## Ręczne ustawianie AppID gry {#set-a-games-appid-by-hand}

Kliknij prawym przyciskiem grę, której nazwa folderu pasuje do kilku wydań Steam, tak że automatyczne dopasowanie wybrało
złe, i wybierz **Ustaw AppID ręcznie...**. Wybór jest zapamiętywany dla folderu instalacji i
zapisywany w `steam_appid.txt`; **Wyczyść ręczne AppID** go cofa. **Popraw plik
identyfikatora gry** w Stanie gry też prosi o AppID, zaczynając od własnej sugestii AW Next.

## Oznaczanie osiągnięcia jako odblokowanego {#mark-an-achievement-as-unlocked}

Osiągnięcie, którego źródło nie widzi (zdobyte, zanim skonfigurowałeś śledzenie, albo nigdy niezapisane przez
emulator), można oznaczyć w jego menu prawego przycisku za pomocą **Oznacz jako odblokowane ręcznie**. **Cofnij ręczne
odblokowanie** to cofa. Ręczne odblokowania przetrwają skanowania i są czyszczone przez reset.

## Kroki pod osiągnięciem {#steps-under-an-achievement}

Długie osiągnięcie można podzielić na kroki, które sam wpisujesz i odznaczasz. Najedź na nie na stronie gry
i otwórz **Kroki**, albo kliknij je prawym przyciskiem i wybierz **Dodaj kroki**, a potem wpisz krok i naciśnij Enter.
Kliknij pole, aby odznaczyć krok, kliknij dwukrotnie jego tekst, aby zmienić nazwę, i użyj krzyżyka, aby go usunąć.
Gra nigdy nie zgłasza kroków, więc tylko wypełniają one pasek osiągnięcia: odblokowanie nadal pochodzi
z gry, a gdy nastąpi, każdy krok pokazuje się jako wykonany. Nakładka w grze pokazuje te same kroki i
odznacza je myszą lub kontrolerem.

**Kroki** w nagłówku gry eksportują listę do pliku do udostępnienia albo ją importują. Plik zawiera
teksty, a nie odznaczenia, a jego osiągnięcia są dopasowywane po id, potem po nazwie; kroki, które już istnieją,
zachowują odznaczenia. Kroki żyją w `cfg/achievement-steps.json` i trafiają do kopii zapasowej profilu.

## Narzędzia emulatorów i napraw {#emulator-and-repair-tools}

Diagnoza i naprawa konfiguracji Goldberg / GBE Fork, instalator środowiska GBE, Steamless i
opcjonalne obejście sprawdzania API są w **Ustawienia → Emulatory** oraz w podmenu
**Emulator i narzędzia** każdej gry. Ich przewodniki:

- [Konfiguracja Goldberg / GBE](emulator-setup.md) - diagnozowanie i naprawa emulowanej gry Steam
- [Konfiguracja Uplay, R1 i R2](uplay-r2.md) - odpowiednik dla Ubisoftu
- [Opis techniczny Goldberg / GBE](../goldberg-gbe.md) - formaty plików i reguły wykrywania

**Usuń konfigurację emulatora AW Next**, w tym samym menu, cofa tylko sekcję DLC, przełączniki
i klucze tożsamości, które AW Next zapisał w `configs.user.ini` gry, nigdy wartość ustawioną przez ciebie lub repack,
i usuwa plik tylko wtedy, gdy nic więcej w nim nie zostało. Najpierw pokazuje dokładnie, co usunie,
co jest jedynym sposobem na odzyskanie, jeśli nigdy nie zrobiłeś kopii tego pliku.

**Zastosuj poprawkę osiągnięć GOG (UniverseLAN)…** pojawia się przy grze GOG zawierającej bibliotekę dll Galaxy. Instaluje
kompilację UniverseLAN pasującą do SDK Galaxy tej gry, zachowuje oryginalną dll jako kopię zapasową i
nigdy nie nadpisuje istniejących zapisów UniverseLAN. Odblokowania, które zapisuje w `%LOCALAPPDATA%\UniverseLAN`,
są czytane i ogłaszane jak każde inne.

Jeśli naprawa podmieniła na obsługiwany emulator, **Cofnij zmianę emulatora** w
[Stan gry](game-health.md#the-repairs) przywraca własne pliki cracka.

> [!WARNING]
> Naprawy tworzą kopie zapasowe, ale nadal modyfikują pliki gry. Używaj ich tylko z grami, które posiadasz.

---

**Dalej:** [FAQ](faq.md) - krótkie odpowiedzi na najczęściej pojawiające się pytania.

<div align="center">

[← Dokumentacja](README.md) · [Rozwiązywanie problemów](troubleshooting.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
