---
title: "Zgodne źródła"
description: "Wszystkie źródła gier, które czyta Achievement Watcher Next - Steam, GOG, Epic, Ubisoft, EA, Xbox PC, emulatory i RetroAchievements - oraz czego każde z nich wymaga."
---

# Zgodne źródła

**Źródło** to miejsce, z którego AW Next czyta osiągnięcia: lokalne dane launchera, zgodny ze Steam
plik zapisu albo plik trofeów emulatora konsoli. Każde źródło ma własny przełącznik w **Ustawienia →
Źródło**.

AW Next czyta Steam, GOG Galaxy, Ubisoft Connect, Epic Games, Xbox PC, lokalny dziennik osiągnięć EA Desktop,
RetroAchievements, emulatory konsol oraz pliki zapisu emulatorów Steam, takich jak Goldberg, GBE
Fork, CODEX, RUNE i CPY. Nie potrzebuje klucza Steam Web API ani konta.

<div align="center">
<picture><source srcset="../assets/shot/sources-panel-800.webp 800w, ../assets/shot/sources-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/sources-panel.png" width="720" height="529" alt="Ustawienia - Źródła gier"></picture><br>
<sub>Każde źródło to osobny przełącznik; tarcza oznacza oficjalne biblioteki desktopowe</sub>
</div>

Po włączeniu źródła odśwież bibliotekę. Pokazywane są tylko biblioteki wykryte na tym komputerze.

## Oficjalne biblioteki platform {#official-platform-libraries}

Czytają one lokalne dane samego launchera i mają tarczę w Ustawieniach.

| Źródło | Co czyta AW Next | Czego wymaga |
|---|---|---|
| **Steam** | Lokalny stan appcache, dane profilu publicznego, schematy osiągnięć i metadane produktów | Zainstalowany Steam; połączenie konta jest opcjonalne |
| **GOG Galaxy** | Lokalne bazy danych klienta Galaxy, a także zgodne starsze zapisy i UniverseLAN | Zainstalowany GOG Galaxy albo gra działająca z UniverseLAN |
| **Ubisoft Connect** | Natywne dane lokalne i starsze formaty Uplay | Zainstalowany Ubisoft Connect |
| **Epic Games** | Lokalne instalacje, a po połączeniu także gry należące do konta i ich oficjalny stan osiągnięć | Launcher Epic Games dla lokalnych instalacji; połączenie konta dla reszty |
| **Xbox PC** | Lokalne instalacje z Game Pass i Microsoft Store, a także gry należące do konta i ich stan w Xbox Network | Aplikacja Xbox dla lokalnych instalacji; połączenie konta dla reszty |

**Steam**, **Epic Games** i **Xbox PC** mają po trzy ustawienia: **Brak**, **Zainstalowane** (gry na tym
komputerze) lub **Posiadane** (cała biblioteka należąca do konta). **Posiadane** wymienia też gry, które nie są
tu zainstalowane, i wymaga połączenia konta opisanego niżej. **GOG Galaxy** oferuje **Brak**, **Zainstalowane**
lub **Zagrane**: Galaxy zachowuje dane o grze nawet po jej odinstalowaniu, a **Zagrane** nadal
wymienia takie gry.

**Biblioteki Steam**, pod kartą konta Steam, wymieniają każdy folder biblioteki Steam na tym komputerze. Wyłącz
jeden, a jego gry znikną z listy, wszystkie, na przykład dysk, który trzymasz podłączony jako
magazyn. Wracają po ponownym włączeniu.

> [!NOTE]
> Odblokowania Steam są odczytywane ze statystyk, które Steam trzyma na tym komputerze. Profil prywatny lub prywatne
> **Szczegóły gry** działają dla każdej gry uruchamianej tutaj, także dla gier dodanych przez SteamTools,
> LuaTools lub GreenLuma, a karta aktualizuje się w chwili, gdy Steam zapisze odblokowanie. Profil publiczny dodaje tylko twoją
> nazwę i awatar. Gry uruchamiane wyłącznie na innym komputerze wymagają połączenia konta opisanego niżej. Te odblokowania
> wywołują powiadomienie AW Next, gdy w Powiadomieniach włączone jest **Gry klienta Steam** (zobacz
> [Powiadomienia](notifications.md#games-steam-runs)).

> [!NOTE]
> **EA Desktop** jest inne: czyta lokalny dziennik osiągnięć EA Desktop dla gier spoza folderów
> zarządzanych przez EA i nie importuje twojej zwykłej biblioteki EA.

### Połączone konta {#connected-accounts}

Steam, Epic, Xbox PC i PlayStation można połączyć w Ustawieniach, aby czytać to, czego lokalne pliki
nie zawierają. Każdy token jest szyfrowany przed zapisaniem na tym komputerze, a wszystko inne działa
bez żadnego konta.

| Konto | Co dodaje połączenie |
|---|---|
| **Steam** | Dwa przełączniki, domyślnie wyłączone i widoczne, gdy źródło Steam ma wartość **Posiadane**: **dodaj gry, które posiadasz** oraz **dodaj gry udostępnione ci przez Rodzina Steam**. Pozwalają one profilowi prywatnemu lub takiemu, który nigdy nie zainstalował tu większości biblioteki, wymienić właściwe gry. Każdy z nich zauważalnie wydłuża pierwsze skanowanie, ponieważ każda dodana gra raz pobiera swoje osiągnięcia i grafiki. Gra, której nie da się odczytać lokalnie, jest potem czytana z twojego profilu Steam, co wymaga publicznych szczegółów gry; odpowiedź jest zapamiętywana na sześć godzin. **Ukryj gry, których nie ma już w twojej bibliotece Steam** usuwa pozostałości, ale nigdy gry zainstalowanej tutaj ani udostępnionej przez Rodzina Steam. Logujesz się na stronie samej Valve. |
| **Epic Games** | Twoje odblokowane osiągnięcia oraz, przy **Posiadane**, cała biblioteka: każda gra z pełną listą, stanem odblokowania i rzadkością. Kilka posiadanych gier ma osiągnięcia, których dane sklepu Epic nigdy nie wymieniają (Shadow of the Tomb Raider, Civilization VI). Nadal są wymieniane, z games-infos-datas Nemirtingasa, ale bez stanu odblokowania, którego Epic nie udostępnia nawet po zalogowaniu. Nazwy, opisy i rzadkość zainstalowanej gry działają bez konta. |
| **Xbox PC** | Stan odblokowania i rzadkość z Xbox Network dla twojej biblioteki, zapamiętane lokalnie. Przy **Posiadane** dodaje też gry, w które konto grało tylko gdzie indziej. |
| **PlayStation** | Twoje gry PlayStation i trofea, z oficjalnym współczynnikiem Sony dla każdego trofeum, odświeżane co trzy dni w tle. Grę, której nie posiadasz, można dodać po nazwie z katalogu Sony i w ten sam sposób usunąć. Gra z dowolnego innego źródła, która ukazała się też na PlayStation, pokazuje prawdziwą platynę swojej listy, a w trybie trofeów jej prawdziwe stopnie i grupy DLC (zobacz [Powiadomienia](notifications.md#trophy-mode)). Logujesz się na stronie samego Sony. |

Kafelek ma małą odznakę informującą o tym, co ustaliło połączenie: kupione w tym sklepie, udostępnione przez
Rodzina Steam albo już nieobecne w twojej bibliotece.

## Zapisy zgodne ze Steam {#steam-compatible-saves}

AW Next czyta pliki osiągnięć i statystyk zapisywane przez emulatory Steam (`achievements.json`,
`achievements.ini`, `achievements.bin`, `stats.ini` i zgodne układy) w miejscach, z których te
narzędzia korzystają. Obejmuje to **Goldberg** i **GBE Fork** (które AW Next potrafi też zainstalować i naprawić),
**GreenLuma**, **LumaPlay**, **SmartSteamEmu**, **CreamAPI**, emulatory **Nemirtingas** oraz wydania scene
o zgodnym układzie. Dla gry, której pliki są gdzie indziej, dodaj folder w
**Ustawienia → Foldery**.

<div align="center">
<picture><source srcset="../assets/shot/folders-panel-800.webp 800w, ../assets/shot/folders-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/folders-panel.png" width="720" height="529" alt="Ustawienia - Foldery" loading="lazy" decoding="async"></picture><br>
<sub>Foldery, które AW Next sprawdza samodzielnie, i te, które dodajesz - zapisy pojedynczych gier lub całe biblioteki</sub>
</div>

Przenośne wydanie CODEX, RUNE lub CPY zwykle zapisuje w `%PUBLIC%\Documents\Steam\<SOURCE>\<appid>`,
ale kopia przenośna trzyma to drzewo w folderze gry, gdzie nic go nie szuka. Wystarczy dodać
własny folder gry w **Ustawienia → Foldery**: jego `steam_emu.ini` (lub `cpy.ini`) podaje
AppID, a drzewo zapisów jest szukane obok niego przed wspólną lokalizacją. Gra bez żadnego jeszcze zapisu
też zostanie dodana, na poziomie 0%.

Działa także wydanie bez konfiguracji emulatora lub takie, któremu usunięto plik ini: drzewo zapisów jest czytane
bezpośrednio, bo `Steam\RUNE\<appid>` zawiera AppID w nazwie folderu. Te same układy są sprawdzane
poziom niżej niż dodany folder, więc możesz wskazać AW całą bibliotekę gier.

Gdy folderu nie da się użyć, AW podaje powód: zawiera grę, ale brak czytelnego pliku odblokowań,
nie zawiera niczego związanego z osiągnięciami albo jest wydaniem **EA app**. Wydania EA app trzymają osiągnięcia na
koncie EA, nie na dysku, więc są czytane przez źródło EA i żaden dodany folder nie sprawi,
że się pojawią. Komunikat mówi też, ile układów sprawdzono, co pozwala odróżnić „nic nie znaleziono” od „nie
sprawdzono”.

Trzy przypadki mają własną obsługę:

- **Goldberg SocialClub**: wariant dla Rockstar i Social Club, z własnym przełącznikiem.
- **RUNE Ubisoft Connect**: emulator Ubisoft w RUNE trzyma pliki `achievements.cfg` w
  `Documents\RUNE\Ubisoft Connect\achievements`. Są znajdowane bez dodawania folderu (dodanie folderu
  `RUNE\Ubisoft Connect` w **Ustawienia → Foldery** też działa) i podlegają przełącznikowi emulatora
  Ubisoft Connect. Nazwy i ikony pochodzą z listy Ubisoft Connect dla danej gry; bez niej
  widać tylko numery osiągnięć.
- **Uplay R2**: odpowiednik Ubisoftu dla ścieżki Goldberga, dla zgodnych tytułów. Nie ma własnego
  przełącznika: zapisy przechodzą przez źródło emulatorów Steam, a narzędzia naprawy i loadera są w
  **Ustawienia → Emulatory → Ubisoft / Uplay R1/R2**. Zobacz [Konfiguracja Uplay R2](uplay-r2.md).

Jeśli gra korzystająca z jednego z nich nie pokazuje osiągnięć, jej panel **Stan gry** wskazuje brakujący element.
Zobacz [Stan gry](game-health.md) i [Konfiguracja Goldberg / GBE](emulator-setup.md).

## Emulatory konsol {#console-emulators}

| Emulator | Konsola | Plik trofeów / osiągnięć |
|---|---|---|
| **RPCS3** | PlayStation 3 | `TROPUSR.DAT` obok listy trofeów |
| **ShadPS4** | PlayStation 4 | `TROP*.XML`, który zawiera listę i stan zdobycia |
| **KytyPS5** | PlayStation 5 | `_Trophies\<title>\trophies_*.json` obok emulatora; lista pochodzi z pakietu `sce_sys\trophy2` gry |
| **Xenia** | Xbox 360 | `.gpd`, który również zawiera jedno i drugie |

Każdy jest obserwowany na żywo, więc odblokowanie wywołuje powiadomienie jak każde inne. RPCS3, ShadPS4 i Xenia mogą
przenieść swoje dane poza domyślną ścieżkę, a AW Next czyta te same ustawienia, które czyta emulator:

- **RPCS3**: folder trofeów podąża za `vfs.yml` (w tym za przekierowaniem względnym do `$(EmulatorDir)`),
  folderem `portable` obok pliku wykonywalnego i zmienną `RPCS3_CONFIG_DIR`.
- **ShadPS4**: rozpoznawany niezależnie od tego, czy wskażesz emulator, jego folder `user`, sam `game_data` lub
  (od wersji 0.19) jego folder `trophy` albo `home\<user>\trophy`. Jego konfiguracja jest czytana z któregokolwiek z dwóch
  miejsc, w których shadPS4 ją trzymał.
- **Xenia**: podąża za `storage_root` i `content_root` w swojej konfiguracji.
- **KytyPS5**: rozpoznawany niezależnie od tego, czy wskażesz emulator, jego folder `_Trophies` czy folder jednej
  gry. Gry są szukane w folderach gier launchera KytyPS5 (`Kyty.ini`) i obok
  emulatora, rozpakowane lub jako archiwum `.zar`. Lista trofeów znajduje się w samej grze, więc gra
  usunięta po tym, jak AW Next ją zobaczył, pozostaje na liście jako niezainstalowana, na podstawie zachowanej wtedy kopii jej listy i grafik.
  Gra z launchera jest wymieniana przed pierwszym trofeum. Liczy się tylko aktywny użytkownik: ten ustawiony
  dla gry w launcherze, a w przeciwnym razie globalny użytkownik emulatora. Bez ustawienia użytkownika dodawane są
  trofea wszystkich użytkowników.

Dlatego przeniesiony wirtualny dysk RPCS3 lub folder danych ShadPS4 można dodać bezpośrednio w **Ustawienia → Foldery**,
bez żadnego pliku wykonywalnego emulatora w pobliżu.

## RetroAchievements {#retroachievements}

Gry uruchamiane na dowolnym emulatorze, który raportuje do RetroAchievements, pochodzą z twojego konta, nie z
pliku. Włącz źródło **RetroAchievements** i wypełnij pod nim kartę konta: swoją nazwę użytkownika
oraz **klucz Web API** ze strony retroachievements.org/settings. Klucz jest szyfrowany przed zapisaniem
na tym komputerze.

<div align="center">
<picture><source srcset="../assets/shot/retroachievements-panel-800.webp 800w, ../assets/shot/retroachievements-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/retroachievements-panel.png" width="720" height="529" alt="Ustawienia, Źródła: przełącznik RetroAchievements nad kartami kont" loading="lazy" decoding="async"></picture><br>
<sub>Przełącznik RetroAchievements, a pod nim karty kont Epic i Steam</sub>
</div>

**Importuj bibliotekę** dodaje każdą grę, w którą grałeś, z jej osiągnięciami, datami odblokowania, punktami i rzadkością.
Drugi import pobiera tylko gry, których postęp się zmienił, a gra uruchomiona po raz pierwszy jest
dodawana sama. Nowe odblokowania są ogłaszane w ciągu kilku sekund, gdy działa emulator raportujący do
RetroAchievements (RetroArch, DuckStation, PCSX2, PPSSPP, Dolphin, BizHawk, Project64 lub dowolna
inna kompilacja zintegrowana z RA, rozpoznawana po nazwie lub po bibliotece dll RetroAchievements obok niej), a w
przeciwnym razie w ciągu kilku minut.

AW Next czyta odblokowania z retroachievements.org, więc RetroAchievements musi pozostać włączone w emulatorze:
wyłączenie go tam wstrzymuje wysyłanie odblokowań. Aby widzieć tylko powiadomienie AW Next, ukryj
własne okienko emulatora. W RetroArch jest to **Ustawienia → Osiągnięcia → Widoczność → Powiadomienia o
odblokowaniu**. RetroBat przepisuje `retroarch.cfg` przy każdym uruchomieniu, więc zamknij RetroBat i dodaj tę linię
do `RetroBat\emulationstation\.emulationstation\es_settings.cfg`:

```xml
<string name="global.retroarch.cheevos_visibility_unlock" value="false" />
```

Użyj `cheevos_visibility_mastery` w ten sam sposób dla okienka mistrzostwa.

## Inne źródła {#other-sources}

| Źródło | Co to jest |
|---|---|
| **Gry Xbox 360 zrekompilowane na PC** | Porty ReXGlue i podobne trzymają listę osiągnięć w folderze `achievements` (`.toml`, `.tsv`) lub w `SaveData\Achievements.json`, w folderze gry albo w `Documents\<game>`. Lista pochodzi z `default.xex` samej gry, w każdym języku, który zawiera, a osiągnięcia sekretne pozostają sekretne. [dbox.tools](https://dbox.tools) dodaje osiągnięcia z DLC, a Exophase odsetek graczy dla każdego osiągnięcia. Lista w `Documents` jest znajdowana sama; dla listy w folderze gry dodaj ten folder w **Ustawienia → Foldery** lub użyj **Inteligentne wyszukiwanie**. Odblokowania są ogłaszane na żywo, czas gry jest śledzony, a Zresetuj osiągnięcia działa. Ponad osiemdziesiąt znanych portów (Sonic Unleashed, Sonic the Hedgehog przez Marathon Recompiled, Blue Dragon re:Blue, Lost Odyssey, Perfect Dark Zero, Fable II, Gears of War 2, Forza Motorsport 4, GoldenEye 007, Skate 2, Marvel Ultimate Alliance, Eternal Sonata, kolekcja Trials i inne) jest wymienianych na podstawie pliku wykonywalnego przed pierwszym osiągnięciem. Port, który trzyma jedną listę na profil, to jedna gra. Źródło podąża za przełącznikiem Xenia. |
| **Gry z PS4 przeniesione na PC** | Bloodborne, kolekcja Uncharted (jedna pozycja na grę), God of War III Remastered, MediEvil i inne porty zbudowane na runnerze `run.py`. Także porty bez niego (Dragon's Crown Pro, inFAMOUS Second Son i First Light, The Last Guardian, Gravity Rush 2, Killzone Shadow Fall, Driveclub, Unicorn Overlord, Fist of the North Star: Lost Paradise, UFC 3, PROTOTYPE i PROTOTYPE 2 po jednej pozycji, gry UFC od PORTHEON), porty na środowisku BilalReloaded, takie jak jego port Nathan Drake Collection, Odin Sphere Leifthrasir i 13 Sentinels: Aegis Rim, ReCasted (Ratchet & Clank, którego `trophies\trophies.log` leży we własnym folderze, a platyna jest przyznawana, gdy zdobyto pozostałe 46 trofeów), oraz porty zapisujące własną listę, jak Crash Team Racing Nitro-Fueled. Dodaj folder portu w **Ustawienia → Foldery**. Lista trofeów, stopnie i ikony pochodzą z oryginalnego zrzutu gry, na który wskazuje launcher portu (`sce_sys\trophy`, nawet z zaszyfrowanym `npbind.dat`), albo z własnego pliku `user\trophies\<title id>\trophies.tsv` portu. Odblokowania pochodzą z tego z plików `trophies.log`, `last_run.log`, `analysis\<name>-user\trophy\trophyNN.txt`, `progress_user<N>.txt`, `<title id>-user<N>.bin`, `trophies.dat` lub `unlocked.txt`, który zapisuje port, ze scalonymi wszystkimi profilami, i są ogłaszane na żywo. Rzadkość pochodzi z list PS4 w Exophase. Jego przełącznik to **PS4 Recomp**. |
| **Games for Windows LIVE** | Instalacje XLiveLessNess. Odczytywane są zapisy odblokowań każdego profilu, a lista, jej teksty i ikony pochodzą z samego pliku wykonywalnego gry, więc nic nie jest pobierane. Osiągnięcia z DLC pochodzą z `spa.bin` każdego pakietu zawartości w folderze `dlc\<title id>` XLiveLessNess. Obserwowane na żywo. |
| **Dead Space 2 MarkerPatch, Alice: Madness Returns MadnessPatch** | Kopia Steam z zainstalowanym modem jest znajdowana sama. Dla każdej innej kopii dodaj folder gry w **Ustawienia → Foldery** (folder wewnątrz niego, np. `Binaries\Win32`, liczy się jako folder gry) lub pozwól, by **Inteligentne wyszukiwanie** przeszukało twoje biblioteki. Lista jest budowana z własnych tekstów i obrazów moda, a odblokowania, które zapisuje, są ogłaszane na żywo. Każdy ma własny przełącznik i nic nie jest czytane, gdy `AchievementSupport` moda jest wyłączone. |
| **Porty na PC** | *The Legend of Zelda: Link's Awakening DX HD* (LADXHD Updated). Dodaj folder gry w **Ustawienia → Foldery**. 110 osiągnięć, ich teksty w językach gry i obrazy pochodzą z instalacji. Odblokowania są czytane z `%LOCALAPPDATA%\Zelda_LA\achievements` (obok gry, gdy ma plik `portable.txt`). Plik nie zawiera dat, więc odblokowanie dostaje datę, kiedy zostało zauważone. |
| **Zrekompilowane porty na PC** | *Twilight Princess* (Dusklight), *Super Mario 64* (Ghostship), *Diddy Kong Racing* (DKR-R), *Super Mario Bros. Remastered*, *Super Mario Sunshine* z modem Super Mario Eclipse (SMS Launcher), *Super Mario All-Stars* (port na PC autorstwa Darhkfox), *Road Rash 64 Recompiled*, *F-Zero X* (G-Diffuser) oraz *Pikmin* i *Pikmin 2* (Open Nectar). Te porty wbudowują listę osiągnięć w grę, więc AW Next dostarcza każdą listę, po angielsku, wziętą ze źródeł portu. Obrazy osiągnięć pochodzą z własnego folderu SMS Launcher albo są pobierane raz z repozytoriów Ghostship, Super Mario Bros. Remastered i Road Rash 64; pozostałe porty rysują je w kodzie, więc ich osiągnięcia pokazują ikonę gry. Port jest znajdowany po pliku odblokowań w `%APPDATA%` lub `%LOCALAPPDATA%` (`TwilitRealm\Dusklight`, `DKRPort`, `SMB1R`, `sms-launcher`, `RoadRash64Recompiled`), po grach zainstalowanych przez Quiver Launcher (wersja 3 lub 4) albo po jego folderze w **Ustawienia → Foldery**. Ghostship, Super Mario All-Stars, G-Diffuser i Open Nectar trzymają zapisy obok gry, więc potrzebują jednego z dwóch ostatnich sposobów; dodanie folderu Open Nectar znajduje też Pikmin 2 w jego folderze `pikmin2`. Instalacja przenośna (`portable.txt` lub `data_location.json` Dusklight) jest czytana tam, gdzie zapisuje. DKR-R, SMS Launcher, Super Mario All-Stars i G-Diffuser zachowują datę każdego odblokowania; w pozostałych odblokowanie dostaje datę, kiedy zostało zauważone. W systemie Linux natywne kompilacje są czytane z `~/.local/share` i `~/.config`, a kompilacje Windows z ich prefiksu Wine lub Proton. Dzielą przełącznik portów na PC. |
| **FINAL FANTASY VII (2013)** | To wznowienie powstało przed osiągnięciami Steamworks i trzyma swoje 36 odblokowań w 8-bajtowym polu bitowym obok zapisów, znajdowanym w Documents bez dodawania folderu. |
| **Zapamiętuj widziane odblokowania** | Utrzymuje grę na liście po zniknięciu jej zapisu, z odblokowaniami, które zobaczył tracker w tle. |
| **Gry dodane ręcznie** | Gra dodana na podstawie tytułu i pliku wykonywalnego, z opcjonalną platformą i AppID Steam. Zobacz [Narzędzia zaawansowane](advanced.md#add-a-game-manually). |

## Metadane Steam, bez klucza API {#steam-metadata-without-an-api-key}

AW Next nie używa do tego klucza Steam Web API ani połączonego konta Steam. Lista każdej gry pochodzi z
łańcucha bez kluczy: najpierw oficjalny punkt końcowy `GetGameAchievements` (ukryte opisy, ikony, globalna
rzadkość i zestawy osiągnięć Steam), potem strona osiągnięć SteamCommunity (ten sam schemat, w
twoim języku), potem SteamHunters, a pobranie przez przeglądarkę tylko w ostateczności.

Tak jak na Steam, osiągnięcie zarchiwizowane przez twórcę liczy się tylko wtedy, gdy je zdobyłeś. W przeciwnym razie jest pomijane
na liście, w procentach i w powiadomieniu o platynie.

Wyniki są zapamiętywane osobno dla każdego języka w `%APPDATA%\Achievement Watcher Next\steam_cache\schema`, więc źródła
lokalne i gry widziane wcześniej działają offline.

Steam nigdy nie ogłasza, że aktualizacja dodała osiągnięcia, więc zapamiętana lista sama sprawdza się ponownie co 3
dni i wychwytuje nowe, nie usuwając żadnych. Aby sprawdzić od razu, użyj **Ustawienia → Zaawansowane →
Ponownie sprawdź listy osiągnięć**. **Automatyczne aktualizacje danych o osiągnięciach** w tym samym miejscu wyłączają
okresowe ponowne sprawdzanie dla osób, które prowadzą `steam_cache` ręcznie. Przycisk nadal działa.

Osiągnięcia z DLC i aktualizacji mają pod tytułem nazwę swojej grupy (na przykład *Hearts of Stone*),
pobraną z tego samego zapytania.

## Źródła, których nie widzisz {#sources-you-do-not-see}

W trybie **Prostym** lista Źródeł zwija sześć niszowych wierszy: GreenLuma, LumaPlay, dwa
emulatory Nemirtingas (czytniki zapisów GOG i Epic), Goldberg SocialClub oraz import pamięci podręcznej
powiadomień. Wiersz zwija się tylko wtedy, gdy jest włączony i żadna gra w twojej bibliotece z niego nie pochodzi. Wyłącz jeden
albo miej grę, którą wykrył, a wiersz wraca, więc tryb interfejsu nigdy nie ukrywa kontrolki, która
wyjaśniłaby brakującą grę. **Zaawansowany** zawsze wymienia wszystkie źródła.

---

**Dalej:** [Powiadomienia](notifications.md), aby wybrać sposób ogłaszania odblokowań.

*Konfiguracja właściwa dla źródła: [Goldberg / GBE](emulator-setup.md) · [Uplay R2](uplay-r2.md) ·
[Stan gry](game-health.md)*

<div align="center">

[← Dokumentacja](README.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
