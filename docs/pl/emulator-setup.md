---
title: "Konfiguracja osiągnięć Goldberg i GBE Fork"
description: "Zdiagnozuj lub napraw emulowaną grę Steam z Goldberg albo GBE Fork, z kopią zapasową i potwierdzeniem przed każdym zapisem."
---

# Konfiguracja osiągnięć Goldberg i GBE Fork

AW Next czyta zapisy osiągnięć tworzone przez Goldberg, GBE Fork i zgodne układy emulatorów Steam.
Potrafi też zdiagnozować i naprawić lokalną konfigurację emulatora gry, gdy schemat, AppID
lub pliki środowiska uruchomieniowego są niekompletne.

## Jak uzyskać powiadomienia o osiągnięciach z Goldberg lub GBE Fork? {#how-do-i-get-achievement-notifications-with-goldberg-or-gbe-fork}

Goldberg i GBE Fork to emulatory Steam: zastępują bibliotekę Steam i zapisują odblokowania w
pliku zapisu, `achievements.json`, w `%APPDATA%\GSE Saves\<appid>`. Drugi plik o tej samej nazwie,
w folderze `steam_settings` gry, tylko opisuje osiągnięcia. AW Next czyta oba i pokazuje
okno odblokowania nad grą. Dodaj folder gry w **Ustawienia → Foldery**, uruchom **Inteligentne wyszukiwanie**
i kliknij grę prawym przyciskiem, wybierając **Diagnozuj emulator**, jeśli zostaje na 0%. Nic nie jest zapisywane w
folderze gry, dopóki nie poprosisz o naprawę.

> [!WARNING]
> Narzędzia naprawy są opcjonalne. Modyfikują pliki wewnątrz wybranego folderu gry, więc używaj ich tylko
> z grami, które posiadasz, i zachowaj każdą dodatkową kopię zapasową, na której ci zależy.

## Schemat i pliki zapisu to różne rzeczy {#schema-and-save-files-are-different}

Dwa niezwiązane pliki zwykle nazywają się `achievements.json`:

| | Plik schematu | Plik zapisu środowiska uruchomieniowego |
|---|---|---|
| Typowa lokalizacja | `<game>\steam_settings\achievements.json` | `%APPDATA%\GSE Saves\<appid>\achievements.json` lub `%APPDATA%\Goldberg SteamEmu Saves\<appid>\achievements.json` |
| Zapisywany przez | Grę lub konfigurację emulatora | Emulator podczas działania gry |
| Cel | Nazwy, opisy i ikony osiągnięć | Które osiągnięcia zostały odblokowane |
| Gdy brakuje | Obsługa osiągnięć w grze może być niekompletna; AW Next może użyć innego źródła schematu | Gra pokazuje 0%, dopóki nie zostanie zapisane pierwsze odblokowanie |

Plik schematu nie dowodzi, że cokolwiek zostało odblokowane, a zapis środowiska uruchomieniowego bez zdobytych wpisów to poprawne 0%.
Oba foldery zapisów mogą istnieć dla jednej gry: AW Next czyta ten, który zawiera odblokowania. Jeśli konfiguracja GBE lub
Goldberg przekierowuje zapisy gdzie indziej (`local_save_path`), AW Next obserwuje folder, w którym
lądują.

## Zalecany przebieg {#recommended-workflow}

1. Dodaj bibliotekę gier lub katalog główny zapisów w **Ustawienia → Foldery**.
2. Uruchom **Inteligentne wyszukiwanie** lub **Generuj konfiguracje**.
3. Jeśli gra pokazuje brakujące dane, kliknij ją prawym przyciskiem i wybierz **Diagnozuj emulator**.
4. Przeczytaj raport, zanim zastosujesz naprawę.
5. Użyj **Zastosuj poprawkę emulatora**, aby zainstalować bibliotekę DLL środowiska uruchomieniowego i naprawić `steam_settings` razem.
6. Uruchom grę, odblokuj osiągnięcie i w razie potrzeby odśwież AW Next.

Automatyczna konfiguracja nowo wykrytych gier jest opcjonalna w **Ustawienia → Emulatory → Steam / GBE
Fork**. Przy jej wyłączeniu skanowanie biblioteki niczego nie zapisuje w folderze gry (ani biblioteki DLL, ani pliku konfiguracji,
ani nawet brakującego `achievements.json`), dopóki nie poprosisz o naprawę.

<div align="center">
<picture><source srcset="../assets/shot/steam-gbe-panel-800.webp 800w, ../assets/shot/steam-gbe-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/steam-gbe-panel.png" width="720" height="529" alt="Ustawienia - Steam / GBE Fork"></picture><br>
<sub>Automatyczna naprawa, przełączniki DLC i tożsamości oraz opcjonalny program do rozpakowywania SteamStub</sub>
</div>

## Działania menu kontekstowego {#context-menu-actions}

<div align="center">
<picture><source srcset="../assets/shot/emulator-tools-800.webp 800w, ../assets/shot/emulator-tools.webp 1049w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/emulator-tools.png" width="560" height="336" alt="Menu kontekstowe Emulator i narzędzia" loading="lazy" decoding="async"></picture><br>
<sub>Prawy przycisk na grze → Emulator &amp; narzędzia</sub>
</div>

### Diagnozuj emulator {#diagnose-emulator}

Podaje wykryty typ emulatora, AppID, lokalizację `steam_settings`, liczby schematu i zapisów, brakujące wpisy
lub ikony, niestandardowe ścieżki zapisu i niezgodności AppID oraz to, czy zainstalowane środowisko uruchomieniowe jest tym, które
umieścił tam AW Next. Diagnoza jest tylko do odczytu.

### Zastosuj poprawkę emulatora {#apply-emulator-fix}

Naprawia bibliotekę DLL środowiska uruchomieniowego i schemat w jednym kroku:

- pobiera i zapamiętuje pasujące wydanie GBE Fork i instaluje architekturę DLL, której gra potrzebuje
  (`steam_api.dll` lub `steam_api64.dll`), zachowując każdy istniejący plik jako kopię zapasową;
- buduje `steam_settings\achievements.json` (i jego folder `images`) zgodnie z listą osiągnięć
  Steam i pobiera ikony;
- zapisuje `steam_appid.txt`, gdy go brakuje;
- zapisuje pliki konfiguracji GBE (`configs.app.ini`, `configs.main.ini`, `configs.user.ini`).

Każdy zastępowany plik ma najpierw kopię zapasową, a naprawy schematu zachowują też kopie z sygnaturą czasu w
`steam_settings\.aw-backups`. Środowisko uruchomieniowe jest instalowane jako zwykła podmiana DLL; AW Next nie
konfiguruje osobnego launchera ColdClient.

Spakowane kompilacje Unreal Engine są naprawiane tak samo. Ich pliki Steam leżą w
`Engine\Binaries\ThirdParty\Steamworks`, a nie obok pliku wykonywalnego, i AW Next je tam znajduje, instaluje
i sprawdza.

### Własność DLC i tożsamość konta {#dlc-ownership-and-account-identity}

Dwa przełączniki w **Ustawienia → Emulatory → Steam / GBE Fork**, oba domyślnie wyłączone i niezależne od
automatycznej naprawy:

| Ustawienie | Co zapisuje |
|---|---|
| **Zarządzaj własnością DLC** | `configs.app.ini`, aby emulator zgłaszał każde DLC jako posiadane |
| **Zapisuj nazwę konta i język** | Nazwę twojego konta i język, w `configs.user.ini` |

Żaden nie wpływa na osiągnięcia. Zostaw je wyłączone, aby gra pozostała oryginalna, lub jeśli zarządzasz DLC albo tożsamością ręcznie.

Karta **Tożsamość emulatora** pod nimi pokazuje, co jest zapisywane:

| Pole | Co robi |
|---|---|
| **Nazwa konta** | Zapisywana, gdy **Zapisuj nazwę konta i język** jest włączone. Puste używa nazwy twojego profilu AW Next. |
| **Steam ID** | Zapisywany, gdy ten przełącznik jest włączony; puste zachowuje własny każdej gry. Przycisk kostki tworzy losowy poprawny, a literówka jest oznaczana podczas pisania i nigdy nie jest zapisywana. |
| **Folder zapisów** | Obowiązuje, gdy tylko go wybierzesz: każda gra naprawiona lub poprawiona od tej chwili zapisuje tam (`local_save_path`), a AW Next obserwuje go pod kątem powiadomień na żywo. Puste zachowuje `%APPDATA%\GSE Saves`. |

Aby cofnąć to, co zapisał któryś przełącznik, kliknij grę prawym przyciskiem i wybierz **Usuń konfigurację emulatora
AW Next**. Pokazuje dokładnie, co usunie, zanim cokolwiek zrobi. Usuwa tylko sekcję
DLC, przełączniki i klucze tożsamości dodane przez AW Next, zachowuje każdą wartość ustawioną przez ciebie lub repack i usuwa
plik tylko wtedy, gdy nic więcej w nim nie zostało.

### Użycie własnej biblioteki DLL emulatora {#using-your-own-emulator-dll}

**Ustawienia → Emulatory → Biblioteka DLL emulatora** importuje twoją własną `steam_api.dll` lub `steam_api64.dll` i
instaluje ją zamiast pobranej kompilacji GBE Fork, przy każdej poprawce i każdej poprawce automatycznej. Architektura, której
nie zaimportujesz, nadal pochodzi z oficjalnej kompilacji, tak samo jak narzędzia interfejsu.

Zaimportowany plik jest walidowany ponownie przy każdym użyciu: musi być prawdziwym PE architektury, którą
deklaruje jego nazwa, i musi być biblioteką DLL emulatora Steam. Plik, który nie przejdzie, jest zgłaszany i ignorowany, nigdy
instalowany. **Użyj wersji oficjalnej** usuwa import i wraca do pobranego wydania.

### Usuń DRM Steam (Steamless) {#remove-steam-drm-steamless}

Próbuje rozpakować SteamStub z wybranego pliku wykonywalnego, gdy podmiana DLL nie może się załadować. Oryginalny plik wykonywalny
jest zachowywany jako `*.steamstub.bak`. Nic nie robi dla gier bez SteamStub i nie omija
sprawdzania własności po stronie serwera.

### Kopia zapasowa i przywracanie {#back-up-and-restore}

Kliknij prawym przyciskiem **Utwórz kopię zapasową GBE/Goldberg**, aby zrobić migawkę bieżącej DLL i plików `steam_settings`, albo
**Przywróć ostatnią kopię zapasową GBE/Goldberg**, aby przywrócić jedną z nich. Kopia zapasowa odnotowuje, gdy folder zawierał już
konfigurację zapisaną przez AW Next, więc nigdy nie jest mylona z nietkniętym oryginałem.

## Ustaw AppID ręcznie {#set-appid-manually}

Gdy nazwa folderu gry pasuje do kilku wydań Steam, a automatyczne dopasowanie wybrało złe,
kliknij ją prawym przyciskiem i wybierz **Ustaw AppID ręcznie**. AppID jest zapisywany w `steam_appid.txt` i
zapamiętywany dla tego folderu instalacji, więc późniejsze naprawy go używają zamiast ponownie zgadywać. **Wyczyść ręczne
AppID**, w tym samym menu, go usuwa.

## Typowe problemy {#common-problems}

### Brakuje gry {#the-game-is-missing}

- Uruchom emulator raz, aby utworzył zapis środowiska uruchomieniowego, albo dodaj prawdziwą bibliotekę gry, aby wykrywanie mogło
  znaleźć `steam_settings`, `steam_appid.txt` lub bibliotekę DLL API Steam.
- Sprawdź, czy folder dodany w Ustawieniach jest dość wysoko, by zawierać folder gry, ale nie cały
  dysk niezwiązanych danych.
- Uruchom **Generuj konfiguracje** i sprawdź liczbę wyników.

### Każde osiągnięcie pozostaje zablokowane {#every-achievement-remains-locked}

Sprawdź te przyczyny po kolei:

1. **Nic jeszcze nie zostało odblokowane.** Brak lub pusty zapis środowiska uruchomieniowego jest oczekiwany.
2. **Nazwy w schemacie nie pasują do kluczy zapisu.** Uruchom **Diagnozuj emulator**, a potem napraw schemat.
3. **Ścieżka zapisu jest niestandardowa.** Wskaż AW Next prawdziwy katalog główny zapisów albo usuń
   zastępcze nadpisanie.
4. **AppID jest błędny.** Użyj **Ustaw AppID ręcznie**, zanim uruchomisz kolejną naprawę.

### Brakuje opisów lub ikon {#descriptions-or-icons-are-missing}

Uruchom pełną naprawę z włączonym pobieraniem ikon. Gdy metadane online są niedostępne, AW Next może ponownie użyć poprawnego
lokalnego schematu, ale nie wymyśli opisów, których nie ma żadne źródło.

### Brakuje powiadomień w grze, ale biblioteka się aktualizuje {#in-game-notifications-are-missing-but-the-library-updates}

AW Next czyta zapis środowiska uruchomieniowego, ale własny schemat emulatora gry lub jego nakładka mogą być niekompletne. Sprawdź,
czy `steam_settings\achievements.json` ma te same nazwy API co zapis środowiska uruchomieniowego i poprawne ścieżki
ikon.

## Ograniczenia {#limitations}

Niektóre gry w ogóle nie zgłaszają osiągnięć przez Steamworks, nawet gdy są sprzedawane na Steam, i nie da się ich
śledzić przez ścieżkę zapisu Goldberg lub GBE. AW Next nie może też naprawić gry, której prawdziwej tożsamości
lub schematu osiągnięć nie potrafi bezpiecznie ustalić.

[Techniczny opis Goldberg/GBE](../goldberg-gbe.md) obejmuje formaty plików, reguły wykrywania i
szczegóły implementacji.

---

**Dalej:** [Konfiguracja Uplay, R1 i R2](uplay-r2.md), odpowiednik Ubisoftu dla gier, które nie ładują
`steam_api.dll`.

<div align="center">

[← Dokumentacja](README.md) · [Opis techniczny](../goldberg-gbe.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
