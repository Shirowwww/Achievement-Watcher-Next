---
title: "Jak wypada AW Next"
description: "Czym Achievement Watcher Next różni się od Achievement Watcher 2.x i aplikacji Achievements, funkcja po funkcji."
---

# Jak wypada AW Next

Achievement Watcher Next to alternatywa i następca Achievement Watcher autorstwa Xan105. Działa w
Windows i Linuksie, czyta Steam, GOG, Epic, Ubisoft, Xbox PC i zapisy emulatorów Steam, naprawia
konfigurację Goldberg lub GBE Fork z poziomu aplikacji i sam wybiera drogę powiadomień. Achievements autorstwa
PSerban93 to drugi aktywnie rozwijany tracker dla Windows, a Sentinel jest tylko dla Linuksa.

AW Next kontynuuje [oryginalny Achievement Watcher Xan105](https://github.com/xan105/Achievement-Watcher)
i [gałąź 2.x darktakayanagi](https://github.com/darktakayanagi/Achievement-Watcher). Ta strona zestawia go
z tą linią, z [Achievements](https://github.com/PSerban93/Achievements), drugim
aktywnie rozwijanym trackerem dla Windows, oraz z [Sentinel](https://github.com/RemakeCode/sentinel),
obserwatorem emulowanych zapisów Steam tylko dla Linuksa.

Wszystkie cztery dobrze czytają osiągnięcia, więc użyteczne pytanie brzmi, które dodatki pasują do twojego sposobu grania. Tabele
zaznaczają, co robi każdy projekt, a czego nie.

Części AW Next pochodzą z Achievements na licencji MIT, więc tam, gdzie wiersz oznacza oba
projekty, implementacja czasem zaczynała jako ta od JokerVerse. Zobacz
[NOTICE](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/NOTICE).

| | **AW Next** | [Achievements](https://github.com/PSerban93/Achievements) | [AW 2.x](https://github.com/darktakayanagi/Achievement-Watcher) | [Sentinel](https://github.com/RemakeCode/sentinel) |
|---|:---:|:---:|:---:|:---:|
| Platforma | Windows i Linux | Tylko Windows | Tylko Windows | Tylko Linux |
| Licencja | LGPL-3.0 | MIT | LGPL-3.0 | MIT |
| Środowisko desktopowe | Electron 44 | Electron 44 | Electron 12 | Go z GTK 4 i WebKitGTK 6 |
| Rozwój | Aktywny | Aktywny (ostatni push 22 października 2026) | Zarchiwizowany 13 października 2026, tylko do odczytu | Aktywny (v2.1.1, 11 października 2026) |

## Skąd pochodzą osiągnięcia {#where-the-achievements-come-from}

| Źródło | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Oficjalne biblioteki lokalne | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC · w Linuksie: Steam, Heroic, Lutris i Bottles | ✅ Steam · GOG · Ubisoft · Epic · EA · Xbox PC | ⚠️ Steam · GOG · Epic · Uplay (starsze) | ❌ |
| Opcjonalne połączenie konta | ✅ Steam (gry posiadane, gry udostępnione przez Rodzinę, odblokowania z twoich innych komputerów) · Epic · Xbox (Windows) · PlayStation · RetroAchievements | ✅ Epic · GOG · Xbox · RetroAchievements | ❌ | ❌ |
| Zapisy emulatorów Steam | ✅ Goldberg · GBE · GreenLuma · CreamAPI · SSE · Nemirtingas · układy CODEX/RUNE/EMPRESS/Online-Fix/Tenoke, także w Linuksie (prefiksy Wine i natywnie dla Goldberg i GBE) | ✅ Porównywalny zakres | ✅ Emulatory Steam | ⚠️ Goldberg/GSE · CODEX · RUNE, w prefiksach Wine/Proton |
| Wydania przenośne bez konfiguracji | ✅ Drzewo zapisów jest czytane samo | ⚠️ Wpis ręczny | ❌ | ⚠️ Prefiksy dodawane ręcznie |
| Goldberg Uplay R2 (Ubisoft) | ✅ Świadomy wersji loadera | ❌ | ❌ | ✅ |
| Goldberg SocialClub (Rockstar / GTA) | ✅ | ❌ | ❌ | ❌ |
| Emulatory konsol | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ✅ RPCS3 · ShadPS4 · KytyPS5 · Xenia | ⚠️ Tylko RPCS3 | ❌ |
| Gry Xbox 360 zrekompilowane na PC (ReXGlue i podobne) | ✅ Lista, ikony, DLC i odblokowania na żywo, ponad 60 znanych portów, kompilacje linuksowe | ✅ | ❌ | ❌ |
| Gry z PS4 przeniesione na PC | ✅ run.py, porty natywne i jednoplikowe, PROTOTYPE, PORTHEON (UFC) | ✅ | ❌ | ❌ |
| Games for Windows LIVE | ✅ XLiveLessNess, schemat, DLC i ikony odczytywane z gry | ✅ XLiveLessNess | ❌ | ❌ |
| RetroAchievements | ✅ Zaimportowane zagrane gry, gry znalezione na dysku przez historię lub playlisty RetroArch, odblokowania na żywo z dowolnym emulatorem | ✅ | ❌ | ❌ |
| Niszowe łatki | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ✅ MarkerPatch · MadnessPatch · FINAL FANTASY VII (2013) | ❌ | ❌ |
| Wykrywanie folderów | ✅ Automatyczna konfiguracja i Inteligentne wyszukiwanie | ✅ Automatyczna konfiguracja | ✅ Inteligentne wyszukiwanie | ⚠️ Ponownie skanuje dodawane przez ciebie prefiksy |
| Foldery niestandardowe i gry ręczne | ✅ Dla pojedynczej gry lub całej biblioteki | ✅ Dla pojedynczej gry | ⚠️ Konfiguracja ręczna | ⚠️ Ścieżki prefiksów i emulatorów |

AW Next i Achievements czytają teraz mniej więcej te same źródła. AW Next sięga głębiej w układy emulowanych gier PC
i jest jedynym z czterech, który potrafi naprawić zapisy Uplay R2 i SocialClub.

## Gdy gra nic nie zgłasza {#when-a-game-does-not-report}

Każdy tracker potrafi powiedzieć, że gra tkwi na 0%. AW Next próbuje to także naprawić.

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Raport o stanie każdej gry z kierowanymi naprawami | ✅ | ❌ | ❌ | ❌ |
| Instalacja i naprawa środowiska emulatora | ✅ Goldberg / GBE, łącznie ze schematami | ⚠️ Generowanie schematu | ❌ Ręcznie | ⚠️ Konfiguracja w miarę możliwości z forkiem Goldberg |
| Kopia zapasowa i przywracanie przed każdą zmianą | ✅ Plus Steamless i opcjonalne obejście sprawdzania API | ❌ | ❌ | ❌ |
| Resetowanie lub przywracanie osiągnięć gry | ✅ | ❌ | ❌ | ❌ |
| Ręczne odblokowanie | ✅ | ❌ | ❌ | ❌ |
| Ręczne ustawianie AppID gry | ✅ | ❌ | ❌ | ❌ |
| Nadpisanie źródła dla poszczególnej gry | ✅ Auto / Steam / Ubisoft | ❌ | ❌ | ⚠️ Jedno źródło danych dla całej biblioteki |
| Czarna lista i uzupełnianie nazw offline | ✅ | ⚠️ Czarna lista | ❌ | ❌ |

## Powiadomienia {#notifications}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Drogi dostarczania | ✅ Natywny toast + nakładka w grze + źródło przeglądarki OBS + toast Steam w Trybie gry (wtyczka Decky) | ✅ Natywny toast + animowana nakładka | ⚠️ Toast · Chromium · WebSocket · GNTP | ⚠️ Powiadomienie pulpitu + wtyczka Decky w Trybie gry |
| Sam wybiera drogę dostarczania | ✅ Tryb Automatycznie, według stanu poszczególnej gry | ❌ Stały wybór | ❌ Stały wybór | ❌ |
| Preset designer, bez kodu | ✅ 14 szablonów startowych, podgląd na żywo, 10 wbudowanych presetów, w tym Steam Original | ⚠️ Wbudowane presety i motywy, własne pisane w HTML/CSS | ❌ | ❌ |
| Presety do udostępniania | ✅ `.awpreset` + galeria społeczności | ❌ | ❌ | ❌ |
| Stylizacja rzadkości, platyny i ukończenia | ✅ Rzadkość w 3 stopniach, pasek ukończenia | ✅ Rzadkość | ❌ | ❌ |
| Presety dla poszczególnych emulatorów | ✅ Xenia · RPCS3 · ShadPS4 | ✅ | ❌ | ❌ |
| Dźwięki | ✅ Losowy wybór, FLAC/M4A/AAC | ✅ | ⚠️ Własny plik | ✅ Własne dźwięki |
| Zrzuty ekranu | ✅ Przechwytywanie z obsługą HDR w Windows (mapowanie tonalne BT.2408), także w Linuksie pod X11 i Wayland | ✅ Przechwytywanie HDR | ✅ | ❌ |
| Klipy wideo z odblokowania | ✅ 10-60 s, 30/60 FPS, H.264 · HEVC · AV1, mapowanie tonalne HDR; w Linuksie gpu-screen-recorder lub wbudowany rejestrator WebM | ✅ 10-30 s, 30/60 FPS | ⚠️ Przez OBS | ❌ |
| Powiadomienia o czasie gry i postępie | ✅ Wyciszanie postępu dla poszczególnych gier | ✅ Wyciszanie postępu dla poszczególnych gier | ✅ Czas gry | ✅ Postęp, wieloetapowy |
| Własny wygląd powiadomień dla każdej gry | ✅ Każda gra może nadpisać preset, położenie, dźwięk i skalę | ❌ | ❌ | ❌ |

## Sama aplikacja {#the-app-itself}

| | **AW Next** | Achievements | AW 2.x | Sentinel |
|---|:---:|:---:|:---:|:---:|
| Wyszukiwanie biblioteki, gier i osiągnięć | ✅ | ✅ | ✅ | ⚠️ Sortowanie biblioteki |
| Filtr samych zainstalowanych i działania na grach | ✅ Filtr · odinstalowanie · przywracanie | ⚠️ Filtr platformy | ❌ | ❌ |
| Pełna nawigacja kontrolerem | ✅ Aplikacja + nakładka, w Windows i Linuksie | ✅ Aplikacja + nakładka | ❌ Planowana | ⚠️ Przez wtyczkę Decky |
| Steam Deck | ⚠️ Wtyczka Decky, jeszcze niepotwierdzona na prawdziwym Decku | ❌ | ❌ | ✅ Wtyczka Decky w Gamescope |
| Motywy | ✅ Wbudowane + edytor Niestandardowy + `.awtheme` do udostępniania + galeria | ✅ Wbudowane + pliki motywów użytkownika | ❌ | ❌ |
| Języki interfejsu | ✅ 28 wbudowanych | ✅ Około 30 wbudowanych | ✅ 18 | ❌ |
| Proces w tle | ✅ Jeden demon w zasobniku | ✅ Aplikacja w zasobniku | ⚠️ Osobny watchdog | ✅ Aplikacja w zasobniku |
| Dodatkowe pobrania środowiska | ✅ Brak środowiska przeglądarki; fork GBE jest pobierany tylko wtedy, gdy go instalujesz lub naprawiasz | ⚠️ Chromium z Playwright | ✅ Brak | ⚠️ GTK 4 i WebKitGTK 6 z systemu |
| Dostęp z klawiatury i czytnikiem ekranu | ✅ Ustawienia, okna dialogowe i nakładka dostępne klawiszem Tab, fokus wraca po zamknięciu okna dialogowego | ⚠️ Skróty klawiaturowe i mapa kontrolera | ❌ | ❌ |
| Instalator, dezinstalator i okno aktualizacji | ✅ Własny instalator i dezinstalator, okno aktualizacji z informacjami o wydaniu i postępem | ❌ | ❌ | ⚠️ Pakiety dystrybucji i Flatpak |
| Dokumentacja | ✅ Przewodniki, specyfikacje formatów i galerie | ⚠️ README | ⚠️ README | ⚠️ README i przewodnik po Goldberg |

## Linux i Steam Deck {#linux-and-the-steam-deck}

AW Next jest też dostarczany jako natywna aplikacja linuksowa (AppImage x64, nigdy przez Wine). Śledzi gry uruchamiane
przez Steam i Proton, Wine, Lutris, Heroic i Bottles oraz natywne gry linuksowe, z takimi samymi
oknami, nakładką i czasem gry jak w Windows. Obsługa Steam Deck jest nowa: powiadomienia w Trybie gry przechodzą
przez wtyczkę Decky z repozytorium, a ani wtyczka, ani okno w Trybie gry nie zostały
potwierdzone na prawdziwym Decku.

<sub>✅ = obsługiwane i udokumentowane · ⚠️ = częściowo, ręcznie lub inny sposób pracy · ❌ = niedostępne lub
nieudokumentowane w bieżącej gałęzi publicznej. Kolumny konkurencji porównano z ich publicznymi plikami README,
metadanymi GitHub i manifestami pakietów 22 października 2026. Kolumna AW Next odzwierciedla wersję
3.12.2 i niewydane zmiany z października 2026. ❌ w innej kolumnie zwykle oznacza brak dokumentacji,
a nie niemożliwość, i wszystkie te projekty szybko się zmieniają.</sub>

## Hydra i Steam Achievement Manager {#hydra-and-steam-achievement-manager}

Dwa inne narzędzia pojawiają się w tych samych wyszukiwaniach i robią coś innego.

- [Hydra](https://hydralauncher.gg/) opisuje się jako launcher gier, który pozwala pobierać gry
  i śledzić osiągnięcia. AW Next nie pobiera gier.
- [Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) opisuje się jako lekka,
  przenośna aplikacja do zarządzania osiągnięciami i statystykami w Steam. Wymaga klienta
  Steam, konta Steam i dostępu do sieci. AW Next pokazuje i śledzi osiągnięcia i nie potrzebuje konta
  Steam.

Żadne z nich nie ma miejsca w powyższych tabelach, które porównują trackery czytające zapisy lokalne i emulatorów.

## W skrócie {#in-short}

**AW Next** pasuje do biblioteki, która musi działać w Windows i Linuksie: oficjalne launchery i
emulowane zapisy obok siebie, raport o stanie, który naprawia konfigurację Goldberg lub GBE zamiast tylko
ją zgłaszać, powiadomienia wybierające własną drogę oraz presety i motywy, które możesz zaprojektować i
udostępnić.

**Achievements** ma szeroką listę źródeł w Windows, w tym RetroAchievements, zrekompilowane porty i
niszowe łatki, z silną automatyczną konfiguracją, animowaną nakładką i klipami wideo z odblokowania.

**Achievement Watcher 2.x** to historyczna baza, z szeroką zgodnością z emulatorami i starszymi
drogami powiadomień na Electron 12. Jego repozytorium zarchiwizowano 13 października 2026 i nie jest już
utrzymywane.

**Sentinel** to lekka opcja dla Linuksa dla zapisów Goldberg, CODEX i RUNE, z dobrze zintegrowaną
wtyczką dla Steam Deck.

---

<div align="center">

[← Dokumentacja](README.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
