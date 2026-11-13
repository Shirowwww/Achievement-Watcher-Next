---
title: "FAQ o trackerze osiągnięć"
description: "Krótkie odpowiedzi o kontach, źródłach, powiadomieniach, bezpieczeństwie, kopiach zapasowych i obsługiwanych platformach Achievement Watcher Next."
---

# FAQ o trackerze osiągnięć

Krótkie odpowiedzi na typowe pytania. Każda odsyła do przewodnika, który ją omawia.

## Na start {#getting-set-up}

### Czy potrzebuję klucza Steam Web API albo logowania do Steam? {#do-i-need-a-steam-web-api-key-or-to-sign-in-to-steam}
Nie. Listy osiągnięć pochodzą z łańcucha publicznych punktów końcowych, który nie wymaga klucza, i nic nie wymaga
konta. Twoje odblokowania Steam są odczytywane ze statystyk, które Steam trzyma na tym komputerze, więc prywatny profil
działa dla każdej gry uruchamianej tutaj. Połączenie ze Steam jest opcjonalne: dodaje gry uruchamiane tylko na twoich
innych komputerach oraz Rodzinę Steam. Zobacz [Połączone konta](sources.md#connected-accounts).

### Na jakich platformach działa? {#which-platforms-does-it-run-on}
Windows 10 i 11 oraz Linux (x64). Wydania zawierają własne środowisko uruchomieniowe. Node.js jest potrzebny tylko do
budowania ze źródeł.

### Czy działa na Linuksie albo Steam Deck? {#does-it-run-on-linux-or-the-steam-deck}
Na Linuksie tak, jako beta: natywny AppImage (nigdy uruchamiany przez Wine) dla GNOME i KDE Plasma, pod
Wayland lub X11. Znajduje gry uruchamiane przez Steam i Proton, Wine, Lutris, Heroic lub Bottles i aktualizuje się
sam z tych samych wydań co aplikacja dla Windows. Na Steam Deck wsparcie jest nowe i nie zostało
sprawdzone na prawdziwym Decku. Zobacz [Linux i Steam Deck](linux.md).

### Czy obsługuje RetroAchievements? {#does-it-support-retroachievements}
Tak. Włącz źródło **RetroAchievements**, połącz konto za pomocą nazwy użytkownika i klucza Web API,
a **Importuj bibliotekę** wprowadzi każdą grę, w którą grałeś. Nowe odblokowania są ogłaszane, gdy działa dowolny
emulator obsługujący RetroAchievements. Zobacz [RetroAchievements](sources.md#retroachievements).

### Czy pokazuje trofea PlayStation? {#does-it-show-playstation-trophies}
Tak. Połącz konto PlayStation w **Ustawienia → Źródło** (logujesz się na stronie Sony), a twoje
gry i trofea zostaną zaimportowane, ze współczynnikiem Sony dla każdego trofeum. Gra z innego źródła, która
ukazała się też na PlayStation, pokazuje prawdziwą platynę swojej listy. Zobacz
[Połączone konta](sources.md#connected-accounts).

### Czy muszę łączyć konto? {#do-i-have-to-connect-an-account}
Nie. Steam, Epic, Xbox PC i PlayStation można połączyć, aby czytać to, czego lokalne pliki nie zawierają,
a RetroAchievements prosi o nazwę użytkownika i klucz Web API. Każdy token i klucz jest szyfrowany przed
zapisaniem na tym komputerze. Wszystko inne działa bez konta.

### Czy działa offline? {#does-it-work-offline}
Tak, dla źródeł lokalnych i wszystkiego, co jest już w pamięci podręcznej. Nazwy osiągnięć, opisy i grafiki są
pobierane raz, a potem używane ponownie z `%APPDATA%\Achievement Watcher Next\steam_cache`
(`~/.config/Achievement Watcher Next/steam_cache` w systemie Linux).

### Czy coś tracę, wybierając tryb Prosty? {#do-i-lose-anything-by-choosing-simple-mode}
Nie. Tryb Prosty ukrywa kontrolki i nigdy nie wyłącza funkcji. Nic z tego, co skanuje, obserwuje lub jest zapisywane,
się nie zmienia, a powrót przywraca każdą kontrolkę z jej wartością. Zobacz
[Pierwsze kroki](getting-started.md#simple-and-advanced).

### Czy może pokazać gry, które posiadam, ale nigdy nie zainstalowałem, albo odblokowania z innego komputera? {#can-it-show-games-i-own-but-never-installed-or-unlocks-from-another-pc}
Tak. Przy źródle Steam ustawionym na **Posiadane** dwa przełączniki na karcie konta Steam, **Dodaj gry, które posiadasz**
i **Dodaj gry udostępnione tobie przez Rodzinę Steam**, wymieniają całą twoją bibliotekę. Oba
są domyślnie wyłączone, ponieważ duża biblioteka znacznie wydłuża pierwsze skanowanie. Gdy konto Steam jest
połączone, gra, której nie da się odczytać lokalnie, jest czytana z twojego profilu Steam (jego szczegóły gier
muszą być publiczne), a odpowiedź jest zapamiętywana na sześć godzin. Zobacz
[Połączone konta](sources.md#connected-accounts).

## Biblioteka {#the-library}

### Brakuje gry {#a-game-is-missing}
Sprawdź, czy jej źródło jest włączone w **Ustawienia → Źródło**, uruchom **Inteligentne wyszukiwanie** w **Ustawienia →
Foldery** i wyłącz **Pokaż tylko zainstalowane gry**, aby sprawdzić, czy gra jest znana, ale nie jest już
zainstalowana. Pełna lista kontrolna jest w [Rozwiązywanie problemów](troubleshooting.md#a-game-is-missing).

### Gra pokazuje „Brak osiągnięć” {#a-game-shows-no-achievements}
Ta gra nie ma zestawu osiągnięć. Nadal można ją uruchomić i śledzi czas gry, a w statystykach ukończenia jest
pomijana zamiast liczyć się jako 0%. Jej kafelek pokazuje grafikę tam, gdzie byłby pasek postępu.
**Ustawienia → Wygląd → Kafelki biblioteki → Pasek gier bez osiągnięć** przywraca
pasek.

### Gra pokazuje 0%, chociaż odblokowałem osiągnięcia {#a-game-shows-0-although-i-have-unlocked-achievements}
Gra ma schemat, ale nie ma pliku odblokowań w czasie działania. Otwórz jej panel [Stan gry](game-health.md): wskazuje
brakujący element i oferuje tylko te naprawy, które mają zastosowanie.

### Dlaczego ta sama gra pojawia się dwa razy? {#why-does-the-same-game-appear-twice}
Została znaleziona przez dwa źródła. **Scal duplikaty** w Ustawienia → Ogólne łączy je. Jeśli jeden
wpis to stary folder zapisów gry, którą teraz masz gdzie indziej, dodaj go do czarnej listy.

### Aktualizacja gry dodała osiągnięcia, a ich nie widzę {#a-game-update-added-achievements-and-i-do-not-see-them}
Zapamiętana lista sprawdza się ponownie co 3 dni. Aby wychwycić nowe teraz, użyj **Ustawienia → Zaawansowane →
Ponownie sprawdź listy osiągnięć**, co działa nawet przy wyłączonych **Automatyczne aktualizacje danych o osiągnięciach**. Żadne z
tych sprawdzeń nie usuwa niczego, co jest już w pamięci podręcznej.

### Gra została dopasowana do złego wydania Steam {#a-game-was-matched-to-the-wrong-steam-release}
Kliknij ją prawym przyciskiem i wybierz **Ustaw AppID ręcznie...**. AppID jest zapisywany w `steam_appid.txt` i
zapamiętywany dla tego folderu instalacji. Zobacz [Ręczne ustawianie AppID gry](advanced.md#set-a-games-appid-by-hand).

## Powiadomienia {#notifications}

### Nic się nie pojawia, gdy coś odblokuję {#nothing-appears-when-i-unlock-something}
Zacznij od wiersza Powiadomienia w panelu [Stan gry](game-health.md) tej gry, który wskazuje
drogę, którą ostatnio dostarczono powiadomienie, i dlaczego. Potem postępuj według
[Jeśli test lub odblokowanie się nie pojawia](notifications.md#if-a-test-or-unlock-does-not-appear).

### Okno nakładki nie pokazuje się w jednej konkretnej grze {#the-overlay-popup-does-not-show-in-one-particular-game}
Ta gra jest prawdopodobnie w wyłącznym pełnym ekranie, gdzie okno zawsze na wierzchu nie może zostać narysowane. W trybie
**Automatycznie** AW Next wysyła to odblokowanie jako powiadomienie systemu Windows pokazane nad grą. Gra w
starszym trybie wyłącznym nie przepuszcza niczego: przełącz ją na tryb bez ramki. Zobacz
[jak decyduje Automatycznie](notifications.md#how-automatic-decides).

### Powiadomienia są ukryte, gdy gram {#notifications-are-hidden-while-i-play}
To funkcja Nie przeszkadzać w Windows. Włącz **Powiadomienia priorytetowe** i zatwierdź jednorazową prośbę Windows. Zobacz [Priorytetowe powiadomienia systemu Windows](notifications.md#priority-windows-notifications).

### Czy mogę zmienić wygląd okna albo udostępnić projekt? {#can-i-change-how-the-popup-looks-or-share-a-design}
Tak. Dziesięć presetów jest dołączonych do aplikacji, **Preset Designer** buduje twoje własne zwykłymi kontrolkami,
a każdy preset eksportuje się do jednego pliku `.awpreset`. Zobacz [Presety i Preset Designer](presets.md).

### Czy mogę pokazywać odblokowania na streamie? {#can-i-put-unlocks-on-my-stream}
Tak, za pomocą źródła Przeglądarka w OBS. Przechwytywanie okna nie może działać, ponieważ istnieje ono dla
jednego odblokowania i znika, zanim OBS je wymieni, więc AW Next udostępnia to samo okno jako stronę. Adres jest
w Ustawienia → Powiadomienia → **Źródło przeglądarki OBS**. Zobacz
[Pokazuj odblokowania na streamie (OBS)](notifications.md#show-unlocks-on-stream-obs).

### Czy nakładka to to samo co okno? {#is-the-overlay-the-same-thing-as-the-popup}
Nie. Okno to jednorazowe powiadomienie stylizowane przez preset. **Nakładka** to pełna lista osiągnięć,
którą otwierasz skrótem `Ctrl+Shift+K`, gdy działa gra. Zobacz [przewodnik po nakładce](overlay.md).

### W systemie Linux Ctrl+Shift+K nic nie robi w mojej grze {#on-linux-ctrlshiftk-does-nothing-in-my-game}
Pod Wayland AW Next nie widzi klawiszy naciśniętych, gdy fokus ma natywne okno Wayland, takie jak
gra linuksowa w trybie Wayland albo Proton ze sterownikiem Wayland. Przypisz klawisz w ustawieniach klawiatury pulpitu
do `/home/you/.local/bin/achievement-watcher --toggle-overlay`, wstawiając swoją nazwę użytkownika zamiast
`you`. AW Next utrzymuje to polecenie wskazujące na bieżący AppImage, więc skrót przetrwa
aktualizacje. Zobacz [Skrót nakładki](linux.md#overlay-shortcut).

## Bezpieczeństwo i dane {#safety-and-data}

### Czy AW Next modyfikuje moje gry albo wysyła coś z mojego komputera? {#does-aw-next-modify-my-games-or-send-anything-off-my-pc}
Tylko wtedy, gdy o to poprosisz. Odczyt osiągnięć jest tylko do odczytu. Narzędzia naprawy emulatorów (podmenu
**Emulator i narzędzia** w menu prawego przycisku gry oraz **Ustawienia → Emulatory**) zapisują w folderze gry, zawsze
po potwierdzeniu i z kopią zapasową. Używaj ich tylko z grami, które posiadasz. Poza zapytaniami tylko do odczytu
i tym, co odsyła połączone konto, nic nie opuszcza tego komputera. Zobacz
[Co opuszcza ten komputer](README.md#what-leaves-this-pc).

### Mój program antywirusowy oznaczył lub usunął plik {#my-antivirus-flagged-or-removed-a-file}
To prawie na pewno emulator Steam albo loader Ubisoftu i fałszywy alarm: te pliki zastępują
bibliotekę Steam lub Ubisoftu gry, a to właśnie zachowanie, którego szukają silniki wykrywania. Nic nie jest
zapisywane, chyba że uruchomiłeś naprawę, otworzyłeś **Ustawienia → Emulatory** albo włączyłeś automatyczną naprawę. Zezwól na
plik wskazany przez program antywirusowy albo wyklucz `%APPDATA%\Achievement Watcher Next\cache`. Nigdy nie wyłączaj
ochrony. Zobacz [Rozwiązywanie problemów → Program antywirusowy](troubleshooting.md#antivirus-or-smartscreen-warning).

### Windows SmartScreen ostrzega przed instalatorem {#windows-smartscreen-warns-about-the-installer}
Wydania są podpisane własnym certyfikatem projektu, przypiętym przez odcisk palca, a nie komercyjnym,
więc SmartScreen może prosić o potwierdzenie. Nigdy nie musisz instalować tego certyfikatu: aktualizator w aplikacji
sprawdza podpisującego, przypięty odcisk palca i to, czy plik nie został zmodyfikowany po podpisaniu,
zanim cokolwiek zainstaluje. Pobieraj tylko z
[oficjalnej strony wydań](https://github.com/Shirowwww/Achievement-Watcher-Next/releases). Aby samodzielnie sprawdzić
instalator, uruchom `Get-FileHash <installer> -Algorithm SHA256` i otwórz
`https://www.virustotal.com/gui/file/<hash>`. Bieżące wydanie to
[3.12.7](https://www.virustotal.com/gui/file/fb836d9224e789f3095243771266457fca1cb0cee367724e9c9b3c370f4e260d).
Zobacz [Rozwiązywanie problemów → Samodzielne sprawdzenie wydania](troubleshooting.md#checking-a-release-yourself).

### Dlaczego w systemie Linux pojawia się monit o pęk kluczy? {#on-linux-why-does-a-keyring-prompt-appear}
AW Next szyfruje swoje tokeny logowania kluczem przechowywanym przez pęk kluczy pulpitu (GNOME Keyring lub KDE
Wallet). Przy automatycznym logowaniu pęk kluczy pozostaje zablokowany, więc pulpit prosi o odblokowanie lub utworzenie
go przy uruchomieniu AW Next. Anulowanie jest bezpieczne: aplikacja nadal działa, a monit wraca przy następnym
uruchomieniu. Zobacz [Monit o pęk kluczy](linux.md#keyring-prompt).

### Gdzie są moje dane, czy aktualizacja je traci i jak duże są aktualizacje? {#where-is-my-data-does-updating-lose-it-and-how-big-are-updates}
Wszystko jest w `%APPDATA%\Achievement Watcher Next` (`~/.config/Achievement Watcher Next` w systemie Linux),
a instalacja nowszej kompilacji je zachowuje. Pierwsze uruchomienie po aktualizacji importuje starszy folder Achievement
Watcher bez jego modyfikowania ani usuwania. Aktualizacje pobierają tylko to, co zmieniło się od zainstalowanej
wersji, i same wracają do pełnego pobierania, jeśli to się nie powiedzie. Zobacz
[Aktualizacje i istniejące dane](getting-started.md#updates-and-existing-data).

### Jak przenieść się na nowy komputer albo zrobić kopię zapasową konfiguracji? {#how-do-i-move-to-a-new-pc-or-back-up-my-setup}
**Ustawienia → Zaawansowane → Kopia zapasowa profilu → Eksportuj profil…** zapisuje twoje ustawienia, wybory biblioteki,
presety, motywy, okładki i czas gry w jednym pliku `.awbackup`. Zainstaluj AW Next na nowym komputerze, wybierz
**Przywróć profil…**, a zostanie zastosowany przy następnym uruchomieniu; zastępowane pliki są zachowywane. Logowania
nigdy nie są zapisywane, więc połącz ponownie Steam, Epic, Xbox, PlayStation i RetroAchievements. Zobacz
[Kopia zapasowa profilu](advanced.md#profile-backup).

### Czy jest wersja przenośna? {#is-there-a-portable-version}
Tak. Przenośny ZIP trzyma aplikację i jej dane w jednym folderze i sprawdza ten sam kanał wydań co zainstalowana
aplikacja. Nigdy nie pobiera ani nie uruchamia instalatora: proponuje stronę wydania, gdy ukaże się nowsza
wersja, a rozpakowanie nowego archiwum na stary folder zachowuje twoje dane.

### Jak wyjść całkowicie? {#how-do-i-quit-completely}
Zamknięcie okna zostawia AW Next w zasobniku systemowym, więc śledzenie trwa dalej. Użyj menu zasobnika, aby wyjść.

## Projekt {#the-project}

### Czy działa z grami Goldberg, GBE Fork i CODEX? {#does-it-work-with-goldberg-gbe-fork-and-codex-games}
Tak. AW Next czyta pliki osiągnięć zapisywane przez Goldberg, GBE Fork, CODEX, RUNE i CPY i potrafi
zainstalować oraz naprawić środowisko GBE Fork dla gry. Zobacz [Zgodne źródła](sources.md) i
[Konfiguracja Goldberg i GBE Fork](emulator-setup.md).

### Czy to ta sama aplikacja co Achievement Watcher Xan105? {#is-this-the-same-app-as-xan105s-achievement-watcher}
Nie, to kontynuacja. AW Next kontynuuje Achievement Watcher Xan105 i gałąź 2.x darktakayanagi,
na aktualnym środowisku Electron, z obsługą Linuksa, większą liczbą źródeł i raportem o stanie każdej gry
z kierowanymi naprawami. Zobacz [Porównanie](comparison.md).

### Czy jest bezpieczny w użyciu z grami z crackiem? {#is-it-safe-to-use-with-cracked-games}
Odczyt osiągnięć jest tylko do odczytu. Narzędzia naprawy zapisują w folderze gry dopiero po potwierdzeniu i
z kopią zapasową, a automatyczna naprawa jest domyślnie wyłączona. Używaj ich tylko z grami, które posiadasz. Program antywirusowy
może oznaczyć plik emulatora jako fałszywy alarm. Zobacz
[Rozwiązywanie problemów → Program antywirusowy](troubleshooting.md#antivirus-or-smartscreen-warning).

### Czym różni się od Achievement Watcher 2.x? {#how-does-this-differ-from-achievement-watcher-2x}
AW Next kontynuuje go na nowoczesnym środowisku i po dużej rewizji zgodności, niezawodności i
funkcji. Zobacz [Porównanie](comparison.md).

### Czy może mi załatwić gry, klucze lub konta? {#can-it-get-me-games-keys-or-accounts}
Nie, a system zgłoszeń też w tym nie pomoże. AW Next nie zawiera plików gier i nie
omija sprawdzania własności online.

### Znalazłem błąd albo mam pomysł {#i-found-a-bug-or-have-an-idea}
[Otwórz zgłoszenie](https://github.com/Shirowwww/Achievement-Watcher-Next/issues), podając wersję aplikacji,
wersję Windows (albo dystrybucję Linuksa i środowisko graficzne), zaangażowane źródło i odpowiednie logi.
Podejrzenie luki w zabezpieczeniach zgłoś prywatnie przez
[politykę bezpieczeństwa](https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/SECURITY.md). W razie
pytania lub potrzeby pomocy, zanim wiesz, że to błąd, zapytaj na [serwerze Discord](https://discord.gg/DjTMrDsXTh).

---

**Nadal utknąłeś?** [Rozwiązywanie problemów](troubleshooting.md) omawia po kolei każdy objaw.

<div align="center">

[← Dokumentacja](README.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
