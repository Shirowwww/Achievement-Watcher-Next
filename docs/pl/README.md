---
title: "Dokumentacja"
description: "Przewodniki po instalacji, konfiguracji i naprawie Achievement Watcher Next: źródła, powiadomienia, presety, nakładka i rozwiązywanie problemów."
permalink: /pl/README.html
---

<!--
  jekyll-readme-index still drops a file literally named README.md, even with readme_index.enabled: false
  in _config.yml. Explicit front matter with a permalink makes Jekyll publish it at README.html.
-->
<div align="center">

# Dokumentacja AW Next

Przewodniki po konfiguracji, codziennym użytkowaniu i konserwacji.

[Strona główna](../index.html) · [Pobierz](https://github.com/Shirowwww/Achievement-Watcher-Next/releases/latest) · [Galeria presetów](../gallery/) · [Galeria motywów](../gallery/themes/) · [Lista zmian](../changelog.md) · [Bezpieczeństwo](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md) · [Zgłoś problem](https://github.com/Shirowwww/Achievement-Watcher-Next/issues) · [Discord](https://discord.gg/DjTMrDsXTh)

<picture><source srcset="../assets/shot/home-800.webp 800w, ../assets/shot/home.webp 1280w" sizes="(max-width: 700px) 100vw, 800px"><img src="../screenshot/home.png" width="800" height="492" alt="Biblioteka AW Next"></picture>

</div>

## Zacznij tutaj {#start-here}

Czytaj po kolei albo przejdź od razu do tego, czego potrzebujesz. Każda strona kończy się odnośnikiem do następnej.

| # | Przewodnik | Czego dotyczy |
|---|---|---|
| 1 | [Pierwsze kroki](getting-started.md) | Instalacja, pierwsze uruchomienie, tryby Prosty i Zaawansowany, wyszukiwanie gier, aktualizacje |
| 2 | [Zgodne źródła](sources.md) | Każde źródło, które czyta AW Next, i czego wymaga |
| 3 | [Powiadomienia](notifications.md) | Tryby dostarczania, Automatycznie, dźwięki, położenie, zrzuty ekranu |
| 4 | [Presety i Preset Designer](presets.md) | Wygląd wyskakującego okna, projektowanie własnego, udostępnianie plików `.awpreset` |
| 5 | [Nakładka](overlay.md) | Lista osiągnięć w grze: wyszukiwanie, filtry, rzadkość |
| 6 | [Kontroler](controller.md) | Sterowanie aplikacją i nakładką za pomocą gamepada |
| 7 | [Stan gry](game-health.md) | Raport dla każdej gry i jego kierowane naprawy |
| 8 | [Rozwiązywanie problemów](troubleshooting.md) | Problemy z wykrywaniem, postępem, powiadomieniami i czasem gry |

## Gdy będzie potrzebne {#when-you-need-it}

| Przewodnik | Czego dotyczy |
|---|---|
| [FAQ](faq.md) | Krótkie odpowiedzi na najczęstsze pytania |
| [Linux i Steam Deck](linux.md) | AppImage i jego aktualizacje, środowiska graficzne, skrót nakładki, Steam, Proton i launchery |
| [Narzędzia zaawansowane](advanced.md) | Konserwacja, czyszczenie pamięci podręcznych, resetowanie, gry dodawane ręcznie, diagnostyka |
| [Konfiguracja Goldberg / GBE](emulator-setup.md) | Diagnozowanie lub naprawa emulowanej gry Steam |
| [Konfiguracja Uplay, R1 i R2](uplay-r2.md) | Odpowiednik dla Ubisoftu |
| [Porównanie](comparison.md) | Czym AW Next różni się od Achievement Watcher 2.x i Achievements |
| [Galerie społeczności](community-galleries.md) | Presety i motywy innych osób oraz wysyłanie własnych |

**Ustawienia → Pomoc** to najszybsze źródło informacji, gdy aplikacja jest otwarta. Dopasowuje się do twojej
konfiguracji (skrót nakładki, przypisania kontrolera, tryb powiadomień, motyw, włączone źródła) i filtruje
tematy w trakcie pisania.

## Dokumentacja dla programistów {#developer-reference}

Dla osób współtworzących projekt i każdego, kto buduje AW Next ze źródeł.

| Temat | Dokumentacja |
|---|---|
| Współtworzenie, gałęzie, testy, styl commitów | [CONTRIBUTING.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/CONTRIBUTING.md) |
| Środowisko programistyczne, uruchamianie, pakowanie | [BUILD.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/BUILD.md) |
| Granice między aplikacją, rendererem i Watchdogiem; kontrakt parsera | [Architektura](../architecture.md) |
| Formaty plików Goldberg / GBE, wykrywanie, niezmienniki naprawy | [Opis techniczny Goldberg / GBE](../goldberg-gbe.md) |
| Jak gry Uplay R1/R2 są rozpoznawane, naprawiane i odczytywane | [Opis techniczny Uplay R1/R2](../uplay-reference.md) |
| Wersjonowanie, publikowanie, CI, sprawdzanie automatycznej aktualizacji | [Proces wydań](../RELEASE_WORKFLOW.md) |
| Instalator, dezinstalator i aktualizator | [Instalator, dezinstalator i aktualizacje](../INSTALLER_AND_UPDATES.md) |
| Tłumaczenie, formatowanie Intl, kierowanie odnośników, linter języków | [Lokalizacja](../localization.md) |
| Pliki języków i zgodność kluczy | [app/locale/README.md](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/app/locale/README.md) |
| Przenośny plik motywu i jego wersje | [Format .awtheme](../awtheme-format.md) |

## Gdzie są twoje dane {#where-your-data-lives}

Wszystko, co zapisuje AW Next, znajduje się w **`%APPDATA%\Achievement Watcher Next`** (`~/.config/Achievement
Watcher Next` w systemie Linux, o takim samym układzie). Poniższe ścieżki są względne wobec tego folderu.
Aktualizacja zachowuje wszystko, a przy pierwszym uruchomieniu importowany jest starszy folder Achievement
Watcher, bez jego modyfikowania.

| Co | Gdzie |
|---|---|
| Ustawienia, indeksy i bazy danych | `cfg\` (`options.ini` to plik ustawień) |
| Logi | `logs\` |
| Presety, które utworzyłeś lub zaimportowałeś | `presets\Users Presets\` |
| Obrazy używane przez preset jako tło | `presets\images\` |
| Dźwięki, które dodałeś | `sounds\` |
| Motywy, które zapisałeś lub zaimportowałeś | `theme-packs\` |
| Obrazy używane przez motyw Niestandardowy | `theme-images\` |
| Motyw w postaci arkusza stylów, który tu wrzuciłeś | `themes\` |
| Kopie zapasowe osiągnięć oraz te zrobione przed naprawą GBE | `backups\achievements\`, `backups\gbe\` |
| Okładki i ikony gier | `covers\`, `gameIcons\` |
| Zrzuty ekranu | `Pictures\Achievement Watcher Next` (lub wybrany przez ciebie folder) |
| Zalogowane konta | `steam_session.enc`, `epic_tokens.enc`, `cfg\xbox-auth.json`, `cfg\psn-auth.json` |
| **Do ponownego pobrania:** schematy, ikony i rzadkość z platformy | `steam_cache\`, `uplay_cache\` |
| **Do ponownego pobrania:** pobrane narzędzia i wyniki skanowania folderów | `cache\` (oprócz `cache\uplayR2`, który zawiera dostarczoną przez ciebie bibliotekę DLL) |
| Zapisy GBE Fork (tworzone przez emulator) | `%APPDATA%\GSE Saves` |
| Zapisy klasycznego Goldberga (tak samo) | `%APPDATA%\Goldberg SteamEmu Saves` |

**Ustawienia → Zaawansowane → Wyczyść pamięci podręczne** opróżnia dwa wiersze, które można pobrać ponownie,
i nic więcej. Nic z `cfg\`, `presets\`, `theme-packs\`, `theme-images\`, `themes\`, `sounds\`, `covers\`,
`gameIcons\` ani `backups\` nie jest odtwarzane, więc skopiuj te foldery przed ponowną instalacją.

Zanim zgłosisz problem, uruchom **Ustawienia → Zaawansowane → Diagnostyka**, odtwórz problem jeden raz, a potem
usuń dane prywatne z logów, które dołączysz.

### Co opuszcza ten komputer {#what-leaves-this-pc}

AW Next nie ma analityki, telemetrii ani własnego konta. Wysyła tylko potrzebne zapytania i zapamiętuje
każdą odpowiedź w pamięci podręcznej, dzięki czemu biblioteka działa także offline.

| Prosi o | Od | Przesyłając |
|---|---|---|
| Listy osiągnięć, ikony, globalną rzadkość | Publiczne punkty końcowe Steam, stronę SteamCommunity, SteamHunters, Exophase | AppID gry i język interfejsu |
| Okładki i logo | CDN Steam, SteamDB, SteamGridDB | AppID lub tytuł gry |
| Sprawdzanie i pobieranie aktualizacji | Kanał wydań GitHub | Tylko samo żądanie |
| Narzędzia naprawcze, gdy uruchamiasz naprawę | Projekty GBE Fork, Steamless, API-bypass i CrakFiles | Tylko samo żądanie |
| Twoją bibliotekę i odblokowania, **tylko jeśli połączysz konto** | Steam, Epic, Xbox Network lub PlayStation Network | Token sesji konta; w przypadku odblokowań Steam publiczny Steam ID |
| Twoją bibliotekę RetroAchievements i odblokowania, **tylko jeśli wypełnisz kartę konta** | retroachievements.org | Twoją nazwę użytkownika i klucz Web API, przechowywane na tym komputerze w postaci zaszyfrowanej |
| Presety i motywy społeczności, **tylko jeśli otworzysz galerię lub coś w niej opublikujesz** | Usługa galerii, `aw-gallery.shirow.dedyn.io` | Żądanie listy; plik tylko po naciśnięciu Opublikuj |

Gdy plik wykonywalny gry zawiera prawdziwą ikonę 256 px, AW Next odczytuje ją z pliku i używa jako
logo bez odpytywania sieci.

Ta strona nie ustawia plików cookie, nie korzysta z analityki i ładuje czcionki oraz skrypty z własnego hosta.
Strony galerii pobierają swoją listę z usługi galerii podanej powyżej, a gdy jest nieosiągalna, korzystają
z kopii zapisanej obok nich.

Nic więcej nie jest wysyłane: ani biblioteka, ani czas gry, ani foldery, ani zrzuty ekranu.
Opcjonalna transmisja `Websocket @localhost:8082` nasłuchuje wyłącznie na `127.0.0.1`, więc mogą ją czytać tylko
programy działające na tym komputerze. Jedyna rzecz, którą wysyłasz świadomie, to preset lub motyw publikowany w galerii
(zobacz [Galerie społeczności](community-galleries.md)).
