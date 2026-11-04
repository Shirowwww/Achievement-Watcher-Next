---
title: "Presety i Preset Designer"
description: "Wygląd okna odblokowania: dziewięć wbudowanych presetów, Preset Designer i udostępnianie własnych plików .awpreset."
---

# Presety i Preset Designer

**Preset** to wygląd okna nakładki w grze: jego układ, kolory, ruch i sposób, w jaki
maluje rzadkie odblokowanie lub ukończenie na 100%. Wybierz go w **Ustawienia → Powiadomienia → Ustawienie**,
zaprojektuj własny w **Ustawienia → Presety powiadomień** albo zaimportuj taki, który ktoś ci udostępnił.
Przycisk siatki obok ustawienia presetu pokazuje każdy preset jako obraz jego karty: kliknij jeden, aby
go użyć.

> [!NOTE]
> Presety stylizują nakładkę w grze. Gdy **Typ powiadomienia** jest ustawiony na *Powiadomienie systemu Windows*,
> nic z tego, co opisuje preset, nie jest rysowane, a karta Presety powiadomień nie jest pokazywana.

## Wbudowane presety {#the-bundled-presets}

AW Next zawiera dziesięć, każdy z własną kompozycją, krojem pisma, ruchem i kolorem.

| Preset | Co to jest |
| --- | --- |
| **AW Next** | Domyślny. Własna paleta aplikacji, pasek akcentu wzdłuż lewej krawędzi, ikona w pierścieniu i nazwa gry nad osiągnięciem. |
| **Steam Modern** | Ciemnogranatowa płyta ze znakiem Steam za tekstem, prostymi rogami, wysuwająca się w górę z dolnej krawędzi. |
| **Steam Original** | Kopia okna, które dziś rysuje klient Steam: łupkowy gradient, ledwo widoczny, przewymiarowany znak Steam, kwadratowa ikona i tylko złota obwódka przy rzadkim odblokowaniu. |
| **Epic Games** | Płaski, neutralny i o kanciastych ramionach, z najszerszymi marginesami w zestawie i jedną linią wzdłuż lewej krawędzi. |
| **PlayStation** | Krój pisma konsoli i długi panel od szarości do czerni, ze znakiem PlayStation pulsującym w pierścieniu po prawej. |
| **Xbox** | Ciemna pigułka z zielonym łukiem, który raz obiega okrągłą ikonę i ustala się w stały pierścień. |
| **Cover** | Grafika gry jako tło, powoli dryfująca, z przyciemnieniem pod tekstem i największym krojem pisma w zestawie. |
| **Glass** | Półprzezroczysty i stonowany: bez paska akcentu i bez koloru, dopóki rzadkie lub 100% odblokowanie jakiegoś nie wniesie. |
| **Arcade** | Fosforowa zieleń na czerni, czcionka o stałej szerokości i wersaliki, z liniami skanowania i twardą przesuniętą krawędzią. Rzadkie odblokowanie zmienia się na bursztyn. |
| **Slim** | Niski, na prawdziwej czerni: ta sama szerokość co reszta przy połowie wysokości, zbudowany tak, by znikać na panelu OLED. |

Każdy preset ma tę samą szerokość, więc zmiana presetu nigdy nie przesuwa okna na bok.

### Cztery stany, które rysuje każdy preset {#the-four-states-every-preset-draws}

| Stan | Jak wygląda |
| --- | --- |
| **Zwykłe** | Własny akcent presetu. |
| **Rzadkie** | Złoto przy 5% lub mniej, srebro do 10%, brąz do 15% (granice można zmienić w **Ustawienia → Ogólne → Progi rzadkości**), plus odsetek odblokowań wypisany na karcie, mocniejsza poświata i dodatkowa krawędź. |
| **Ukończenie na 100%** | Zimne, jaśniejsze potraktowanie z podwojoną obwódką. |
| **Postęp** | Pasek postępu z etykietą `current/max - %`. |

Wybrany preset sam maluje rzadkie i 100%, więc jest jedno ustawienie presetu, a nie trzy.
Nadpisania dla poszczególnych emulatorów pozostają w **Ustawienia → Powiadomienia → Emulatory** (tryb Zaawansowany): Xenia,
RPCS3, shadPS4 i Kyty mogą mieć własny preset i dźwięk.

Preset używa dźwięku wybranego na karcie Powiadomienia, chyba że ustawia własny, więc zmiana wyglądu
nie zmienia tego, co słychać. Udostępniony preset może nieść własny dźwięk: zobacz
[Udostępnianie presetu](#share-a-preset). **Nieprzezroczystość** (od 30% do 100%) na karcie Powiadomienia określa, jak bardzo
okno jest przezroczyste.

> [!NOTE]
> Presety wydawane pod wcześniejszymi nazwami nadal są rozpoznawane: `Shirow`/`Default`/`Midnight`/`xqjan` to
> **AW Next**, `Steam` to **Steam Modern**, `PS4`/`PS5 enhanced` to **PlayStation**,
> `Xbox 360`/`Xbox One` to **Xbox**, `Game Cover`/`Sunset` to **Cover**, `Clean`/`Modern`/`Smooth Pop` to **Glass**,
> `Neon Future`/`LAZ0RBOX` to **Arcade**, a presety społeczności `ArmsofGod`, `Epic Preset`
> i `mudoss` to **Pantheon**, **Onyx** i **Outline**. Presety społeczności **Hexagon** i **Indiana**
> zostały usunięte, a one i `TigerDX Award` wracają do **AW Next**. Twój własny preset o jednej
> z tych nazw jest używany przed zamiennikiem.

## Zaprojektuj własny {#design-your-own}

Designer ma własną kartę, **Ustawienia → Presety powiadomień**, dostępną także z przycisku narzędzi
obok ustawienia presetu. Wszystko ustawia się zwykłymi kontrolkami: bez CSS, JSON ani pliku do
edycji.

<div align="center">
<picture><source srcset="../assets/shot/notification-preset-panel-800.webp 800w, ../assets/shot/notification-preset-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/notification-preset-panel.png" width="720" height="530" alt="Preset Designer"></picture><br>
<sub>Zacznij od kompletnego projektu, a potem kształtuj go pod podglądem na żywo prawdziwego okna, który zostaje na ekranie podczas przewijania kontrolek</sub>
</div>

### Punkty startowe {#starting-points}

Pierwszy rząd zawiera czternaście kompletnych projektów: *Classic*, *Aurora*, *Neon*, *Cover*, *Minimal*,
*Console*, *Terminal*, *Slate*, *Paper* (jedyny jasny projekt), *Ember*, *Frost*, *Poster*, *Pixel*
i *Ribbon*. Każdy to zwykły zestaw wartości kontrolek, więc wybranie jednego jest tym samym, co ręczne przestawienie każdej
kontrolki: zostaw go lub użyj jako bazy.

| Działanie | Co robi |
| --- | --- |
| **Zaskocz mnie** | Buduje projekt, którego jeszcze nie próbowałeś: wybiera rodzaj karty (płaska, gradientowa, neonowa, nad grafiką, szklista, terminalowa lub jasna), a potem losuje każdą kontrolkę w granicach, które ten rodzaj dopuszcza. |
| **Duplikuj** | Zachowuje bieżący projekt i zwalnia nazwę, dzięki czemu następne **Utwórz ustawienie** doda preset zamiast zastąpić ten, z którego pochodzi. |

Nic nie jest zapisywane, dopóki nie naciśniesz **Utwórz ustawienie**.

### Podgląd {#the-preview}

Podgląd to samo powiadomienie, rysowane przez tę samą stronę, te same style i ten sam silnik co w grze. Zostaje
przypięty u góry panelu podczas przewijania kontrolek.

| Kontrolka | Co pokazuje |
| --- | --- |
| **Karta** | Okno w jego własnym rozmiarze. Rozmiar w pikselach i powiększenie podglądu są wypisane pod nim. |
| **Porównaj** | Wszystkie cztery powiadomienia naraz, po dwa. |
| **Ekran** | Okno na makiecie wyświetlacza w **720p**, **1080p**, **1440p** lub **4K**, w prawdziwym względnym rozmiarze i w rogu, w którym powiadomienia mają się pojawiać. |
| **Zwykłe / Rzadkie / 100% / Postęp** | Cztery powiadomienia, w których preset musi dobrze wyglądać. W **Porównaj** wybrane przez ciebie jest rysowane z pełną mocą. |
| **Odtwórz** | Odtwarza wejście, wyświetlanie i wyjście raz, z własnymi czasami presetu. |
| **Tło** | To, na tle czego okno jest oceniane: przezroczystość, ciemna scena, jasna scena lub grafika z twojej biblioteki. |
| **Pozycja / Rozmiar** | Odzwierciedlają ustawienia o tych samych nazwach na karcie Powiadomienia i je zmieniają. Pokazywane tylko w widoku **Ekran**. Okno ustawione przez ciebie ręcznie jest rysowane na dole pośrodku i podpisane. |

### Jak się odnaleźć {#finding-your-way-around}

Designer ma dziewięć grup i ponad sześćdziesiąt kontrolek, z filtrem i historią cofania.

| | Co robi |
| --- | --- |
| **Filtr** | Wpisz tekst w polu nad grupami, a zostaną tylko pasujące kontrolki. Przeszukuje etykiety, słowa z list rozwijanych i własną nazwę właściwości, więc zarówno `corner`, jak i `radius` znajdują ten sam suwak, a nazwa odczytana z pliku `.awpreset` znajduje swoją kontrolkę. Dopasowanie ukryte za **Zaawansowane** otwiera tę sekcję. **Esc** czyści pole. |
| **Cofnij / ponów** | Dwie strzałki obok filtra albo **Ctrl+Z** i **Ctrl+Y** (**Ctrl+Shift+Z** też działa). Jedno przeciągnięcie suwaka to jeden krok. Wczytanie presetu, wybór punktu startowego lub naciśnięcie Resetuj zaczyna nową historię. |

**Układ i rozmiar** oraz **Kolory i tło** są domyślnie otwarte; pozostałe grupy otwierają się kliknięciem, a większość
ma sekcję **Zaawansowane** do dokładnych poprawek.

### Kontrolki {#the-controls}

W trybie interfejsu **Prostym** części Zaawansowane nie są pokazywane.

| Grupa | Co obejmuje |
| --- | --- |
| **Układ i rozmiar** | Ikona po lewej, po prawej, nad tekstem lub brak; wyrównanie tekstu; szerokość, wypełnienie i odstępy okna; oraz to, czy **nazwa gry** jest wypisana nad osiągnięciem. |
| **Tekst** | Czcionka (jedna z pięciu rodzin albo **twój własny plik czcionki**: TTF, OTF, WOFF lub WOFF2, najwyżej 4 MB, kopiowany do presetu), rozmiar tytułu i opisu, na ile wierszy może się zawijać opis oraz kolor tytułu. W Zaawansowanych: grubość tytułu, wersaliki, odstęp między literami, cień tekstu i obrys wokół każdego glifu. |
| **Kolory i tło** | Jednolity kolor, dwukolorowy gradient z kątem, **własna grafika gry** albo **twój własny obraz** (kopiowany do presetu), przyciemniony, rozmyty i obramowany za tekstem. Do tego kolor tekstu, akcent i nieprzezroczystość. W Zaawansowanych **tekstura** (siatka, kropki, kreskowanie lub plamki) nad tłem i pod tekstem. |
| **Ikona** | Rozmiar, **kształt** (zaokrąglony kwadrat, koło, squircle, sześciokąt lub romb) oraz, w Zaawansowanych, obramowanie i poświata w kolorze akcentu. Zaokrąglenie rogów dotyczy tylko zaokrąglonego kwadratu. **Logo** (PNG, JPEG, GIF, WebP lub BMP, najwyżej 5 MB) może leżeć za tekstem w rogu lub pośrodku boku, z rozmiarem i odległością od krawędzi; jest kopiowane do presetu tak jak czcionka. |
| **Obramowanie i rogi** | Promień rogów, która krawędź niesie pasek akcentu (albo pełny obrys, albo żadna) i jego grubość; w Zaawansowanych obramowanie w twoim własnym kolorze. |
| **Cień i poświata** | Głębokość cienia, poświata akcentu i to, czy ta poświata **pulsuje** lub **oddycha**, gdy okno jest na ekranie. |
| **Animacja i czas** | Z której krawędzi okno wchodzi i do której wychodzi (albo zanikanie, albo zbliżenie) oraz jak długo zostaje. W Zaawansowanych: dystans przesunięcia, szybkość wejścia i wyjścia, krzywa wejścia (gładka, liniowa, z cofnięciem, łagodna, gwałtowna lub sprężysta) i **krzywa wyjścia**. |
| **Rzadkie i 100%** | Kolor i poświata dla rzadkiego odblokowania i dla 100%, **odcień stanu**, który zalewa całą kartę, to, czy pasek postępu jest widoczny, i to, czy **odznaka rzadkości** wypisuje odsetek odblokowań. W Zaawansowanych: grubość paska postępu, stopnie srebrny i brązowy oraz **kłódka** przed tytułem ukrytego osiągnięcia. |
| **Dźwięk** | Dźwięk, który ten preset odtwarza zamiast dźwięku z karty Powiadomienia. Zostaw **Ustawienie aplikacji**, aby nie było żadnego. |

| Działanie | Co robi |
| --- | --- |
| **Pokaż na ekranie** | Renderuje projekt jako prawdziwe okno nakładki, w pełnym rozmiarze, w skonfigurowanym położeniu i w stanie pokazywanym przez podgląd, bez zapisywania. |
| **Utwórz ustawienie** | Zapisuje go i wybiera jako aktywny preset. |
| **Zaktualizuj ustawienie** | Ten sam przycisk, gdy nazwa zgadza się z presetem stworzonym przez designer: zastępuje ten preset zamiast dodawać następny. |
| **Edytuj ustawienie** | Wczytuje z powrotem do kontrolek jeden z wygenerowanych przez ciebie presetów, z każdą wartością taką, jak zapisano. |
| **Resetuj** | Przywraca kontrolki do projektu domyślnego. Na dysku nic się nie zmienia. |
| **Zmień nazwę** | Pojawia się po wczytaniu wygenerowanego presetu. Wpisz nową nazwę w polu nazwy i naciśnij go: preset zostaje przemianowany na dysku, a ustawienia powiadomień, które na niego wskazywały, podążają za nim. |
| **Usuń** | Pojawia się po wczytaniu wygenerowanego presetu i usuwa go po potwierdzeniu. |
| **Eksportuj** / **Importuj** | Przenoszą preset między komputerami: zobacz [Udostępnianie presetu](#share-a-preset). |

Można ponownie otworzyć lub usunąć tylko presety wygenerowane przez ten designer: przechowuje on swoje ustawienia w
`aw-preset.json` obok wygenerowanych plików, a ten plik czyni preset edytowalnym. Presety wbudowane i
pisane ręcznie nigdy nie są ruszane.

> [!NOTE]
> Preset, który już stworzyłeś, zachowuje swoje pliki w stanie wygenerowanym. Otwarcie go w designerze i zapisanie
> stosuje do niego dzisiejsze ustawienia domyślne, wśród nich rzadkie odblokowanie i ukończenie na 100% przemalowujące całe
> okno.

> [!NOTE]
> Tworzone przez ciebie presety są przechowywane w `%APPDATA%\Achievement Watcher Next\presets\Users Presets`, a nie w
> folderze instalacji, i przetrwają aktualizacje aplikacji.

### Edytor układu {#the-layout-editor}

**Edytor**, pod podglądem, otwiera projekt na pełnym ekranie: karta pośrodku, jej warstwy po
lewej, ustawienia zaznaczonego elementu po prawej. Przeciągnij cokolwiek na karcie, aby to przesunąć, pociągnij za
róg, aby zmienić rozmiar, obróć okrągłym uchwytem. Przy pierwszym otwarciu krótka wycieczka pokazuje,
gdzie co jest; **?** wymienia wszystkie skróty i może powtórzyć wycieczkę.

| | Co robi |
| --- | --- |
| **Dodaj** | Tekst, obraz, prostokąt, elipsę, linię albo **ikonę** (puchar, medal, korona, gwiazda i osiem innych). Każdy to osobna warstwa. |
| **Animowane obrazy** | GIF lub animowany WebP (najwyżej 5 MB) odtwarza się na karcie. **Odtwarzaj GIF od nowa przy każdym oknie** uruchamia go od pierwszej klatki za każdym razem, gdy okno się pokazuje. |
| **Słowa okna** | Tekst może zawierać `{game}`, `{title}`, `{detail}`, `{rarity}` i `{tier}`: przyciski pod polem tekstu je wstawiają, a okno podstawia w ich miejsce nazwę gry, osiągnięcie, jego opis, jego odsetek odblokowań lub nazwę jego stopnia. |
| **Wypełnienie** | Kształt lub ikona są malowane kolorem, gradientem, gradientem kołowym, kolorem stopnia okna (staje się brązowy, srebrny lub złoty razem z kartą) albo kolorem jednego stopnia, niezależnie od okna. |
| **Kształty** | Gwiazda ma liczbę ramion i głębokość, strzałka grot i trzon, trójkąt wierzchołek przesuwający się wzdłuż podstawy. Każdy kształt oprócz elipsy może mieć zaokrąglone rogi, obrys lub linia mogą być kreskowane albo kropkowane, a kształt, ikona lub obraz mogą być odbite lustrzanie. Obraz można przyciąć do dowolnego z tych kształtów. |
| **Przezroczysty** | Kształt inny niż linia można przełączyć na przezroczysty. Sam niczego nie maluje: wszystko, co jest pod nim ułożone, karta, jej ikona i tekst oraz elementy poniżej, jest wycinane w miejscu, gdzie leży, więc pulpit prześwituje przez otwór. Elementy powyżej zostają. Przezroczysty kształt stoi nieruchomo, a przełącznik nie jest oferowany dla wbudowanego presetu. |
| **Cień i poświata** | Tekst, kształt lub ikona rzuca cień albo świeci, na czarno, w kolorze stopnia okna lub w twoim własnym kolorze. |
| **Jeden stan naraz** | Edytor pracuje na stanie pokazywanym przez podgląd (zwykły, brąz, srebro, złoto, 100% lub postęp). **Edycja: Wszystkie** zmienia element dla każdego stanu; **Edycja: tylko Złoto** (albo który stan jest pokazany) zmienia go tylko dla tego stanu, cokolwiek, od koloru po położenie, a element dodany wtedy pojawia się tylko w tym stanie. **Widoczny** ukrywa lub pokazuje element w ten sam sposób, więc korona, którą pokazuje tylko złote odblokowanie, to jedna ikona wyłączona wszędzie poza złotem. Stan z własnymi ustawieniami dla zaznaczonego elementu o tym informuje, a **Wróć do podstawy** sprawia, że znów podąża za pozostałymi. Części karty (tytuł, ikona, opis) działają tak samo. |
| **Wejście i pętla** | Jak element wchodzi, gdy karta już jest (zanikanie, wznoszenie, opadanie, z boku, zbliżenie, wyskoczenie, drżenie lub błysk; tekst może też sam się wypisywać, a tekst rzadkości lub postępu odlicza do wartości) i po jakim opóźnieniu, a potem czy porusza się dalej, gdy okno jest pokazywane: puls, unoszenie, kołysanie, obrót lub błysk. Edytor stoi nieruchomo, gdy pracujesz; **Odtwórz** pokazuje ruch. |
| **Oś czasu** | Pasek wzdłuż dołu edytora pokazuje, kiedy każdy element wchodzi i na jak długo. Przeciągnij pasek, aby przesunąć lub rozciągnąć jego wejście, naciśnij **Odtwórz**, aby obejrzeć kartę, albo przeciągnij wzdłuż podziałki, aby zatrzymać się na jednej chwili. Pozostaje zwinięta, dopóki nie zmieni się ustawienie animacji. |
| **Pola tekstowe** | Tytuł, opis i wiersz gry można przeformułować i dać im własne pole: wypełnienie, margines, zaokrąglone rogi i obrys. Pasek postępu ma grubość i kolor ścieżki, a ikony mogą być kwadratowe. |
| **Pozycja i rozmiar** | Wpisywane wartości X, Y, szerokości i wysokości oraz sześć przycisków, które wyrównują element do krawędzi lub środka karty. |
| **Warstwy** | Oko ukrywa element. Kłódka trzyma go w miejscu: nie można go przesuwać, zmieniać jego rozmiaru ani usuwać, dopóki nie zostanie odblokowany, a kliknięcie przechodzi przez niego. Strzałki zmieniają kolejność nakładania. |
| **Kilka naraz** | **Shift** lub **Ctrl** + kliknięcie dodaje element do zaznaczenia lub go zdejmuje, przeciągnięcie z pustego miejsca zaznacza wszystko, czego dotyka ramka, a **Ctrl+A** zaznacza wszystko. Grupa przesuwa się jako jedność, wyrównuje się do karty lub do siebie samej i jest duplikowana, kopiowana lub usuwana za jednym razem. |
| **Kopiuj i wklej** | **Ctrl+C** i **Ctrl+V** kopiują zaznaczenie, także do innego presetu. Próbniki kolorów oferują kolory, których projekt już używa. |

Pliki presetów stworzone przed tą wersją nadal działają, a preset, który nie używa niczego z tego, wygląda i
eksportuje się jak dawniej.

## Dostosuj wbudowany preset {#customize-a-bundled-preset}

**Dostosuj wbudowany preset**, u góry designera, zaczyna od presetu dostarczanego z
aplikacją. Nic z tego presetu nie jest kopiowane ani edytowane: zapisywana przez ciebie warstwa to kilka wierszy go nazywających, plus
zmienione przez ciebie wartości, nałożone na wbudowany preset w takiej postaci, w jakiej jest dostarczany. Jeśli późniejsza wersja ulepszy
wbudowany preset, twoja warstwa ulepszy się razem z nim.

Zaznacz sekcje do zmiany: **tło** (kolor lub gradient), **kolor tekstu**, **akcent**,
**obramowanie**, **poświata**, **czcionka** (jedna z pięciu rodzin lub twój własny plik czcionki) i **logo**.
Kontrolki zaczynają od własnych kolorów wbudowanego presetu. Podgląd i **Pokaż na ekranie** pokazują
wbudowany preset z twoją warstwą na wierzchu.

<div align="center">
<picture><source srcset="../assets/shot/preset-customize-panel-800.webp 800w, ../assets/shot/preset-customize-panel.webp 939w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/preset-customize-panel.png" width="720" height="530" alt="Dostosowywanie presetu AW Next za pomocą pliku czcionki i logo, z podglądem na żywo" loading="lazy" decoding="async"></picture><br>
<sub>AW Next z własnym plikiem czcionki i logo w prawym górnym rogu: zmieniają się tylko zaznaczone sekcje</sub>
</div>

- Działa na presetach z listy **Presety domyślne**, które rysują tę samą kartę. Presety
  społeczności (Batman, Onyx, Outline i inne) rysują własne układy i nie są oferowane.
- Warstwy nie można wyeksportować jako `.awpreset`, ponieważ istnieje tylko nad wbudowanym presetem
  instalacji, która ją stworzyła. Aby udostępnić projekt, zbuduj go w designerze.
- **Źródło przeglądarki OBS** ignoruje warstwy i pokazuje preset domyślny.
- Okno zachowuje rozmiar okna wbudowanego presetu, więc duża poświata lub obramowanie mogą zostać obcięte.

## Import motywu ze Steam Achievement Notifier {#import-a-theme-from-steam-achievement-notifier}

Motywy ze **Steam Achievement Notifier** (SAN) przechodzą w całości. AW Next rysuje zaimportowany motyw
za pomocą własnych układów kart SAN, więc wygląda i porusza się tak jak w SAN: wszystkie jedenaście układów, w
rozmiarze tekstu SAN i z własnym ustawieniem skali motywu. Dwa przyciski na karcie **Presety powiadomień**
importują motywy:

- **Importuj motyw SAN** czyta jeden plik `.san` albo `usertheme.json` wewnątrz motywu, który SAN już
  rozpakował, z obrazami i dźwiękami obok.
- **Importuj z SAN na tym PC** czyta własne ustawienia SAN, gdy SAN jest tu zainstalowany, i importuje
  za jednym razem każdy motyw zapisany na tym komputerze. Cztery używane motywy (zwykły, półrzadki, rzadki i 100%)
  stają się jednym presetem, `SAN - <theme name>`, który przełącza się między nimi tak jak SAN, a każdy inny
  zapisany motyw staje się osobnym presetem. Ponowne uruchomienie odświeża te presety zamiast dodawać
  kopie i nigdy nie rusza twojego własnego presetu o tej samej nazwie.

Zainstalowane presety SAN są odbudowywane samodzielnie.

### Co przechodzi {#what-comes-across}

Wszystko, co zawiera motyw: każde ustawienie, jego obrazy (tło, maska, loga i dekoracje,
obramowanie ikony, odznaki procentów, ikona ukrytego osiągnięcia), jego czcionka i jego dźwięki (po jednym na stan albo
folder, z którego SAN losuje). Preset niesie to wszystko, więc SAN nie jest potem potrzebny,
a preset eksportuje się jako `.awpreset`.

Jego wygląd to wygląd SAN, a nie suwaków designera: **Edytuj ustawienie** pokazuje go jako obraz, z panelem
dla dwóch wyborów poniżej.

- **Obraz trofeum**, dla motywu rysującego brązowe, srebrne i złote trofeum: *Podąża za
  stopniem* pokazuje to, które pasuje do odblokowania, albo wybierz jeden kolor, by pokazywać go zawsze.
- **Motyw na stopień** rysuje jeden stopień innym zaimportowanym motywem SAN, wraz z jego dźwiękiem, więc złote
  odblokowanie może wyglądać zupełnie inaczej niż brązowe.

Wszystko inne zmienia się w SAN i importuje ponownie.

Stan, jaki dostaje powiadomienie, podąża za twoimi ustawieniami rzadkości w AW Next. Ukończenie na 100% używa
karty 100% z SAN. W trybie rzadkości złoto i srebro używają jego karty rzadkiej, a brąz półrzadkiej; w trybie
trofeów złoto, srebro i brąz używają rzadkiej, półrzadkiej i zwykłej. Dźwięk rzadki lub 100% wybrany w AW
Next ma pierwszeństwo przed dźwiękiem motywu, a położenie i rozmiar okna pochodzą z karty **Powiadomienia**.

Raport po imporcie wymienia to, co nie mogło przejść: plik, który motyw wymienia, ale nie przeniósł,
odrzucony obraz lub czcionkę oraz ustawienia z nowszego SAN, których ta wersja jeszcze nie rysuje. Jest
też zapisywany w logu aplikacji.

### Co jest sprawdzane przed zainstalowaniem czegokolwiek {#what-is-checked-before-anything-is-installed}

Obowiązują reguły pliku `.awpreset`, ponieważ plik motywu pochodzi z cudzego komputera. Nic
w jego wnętrzu nie jest uruchamiane ani wykonywane; czytany jest tylko jego `usertheme.json`. Każda ścieżka jest sprawdzana względem
pakietu, w którym przyszła, a bezwzględne ścieżki zapisywane przez SAN są czytane tylko jako nazwy plików. Wyjmowane są tylko obrazy,
czcionki i dźwięk, według typu pliku i z limitem rozmiaru; SVG, który mógłby uruchomić skrypt,
oraz plik, który nie jest czcionką, są odrzucane. Każde ustawienie jest sprawdzane pod kątem typu i zakresu. Import,
który się nie powiedzie, zostawia nietknięte wszystkie presety, które już masz.

## Udostępnianie presetu {#share-a-preset}

**Eksportuj** i **Importuj**, na karcie **Presety powiadomień**, przenoszą preset między komputerami jako jeden
plik `.awpreset`: styl, każdy obraz i czcionkę, których używa, jego ustawienia designera i metadane.

[Galeria presetów](../gallery/) zbiera te pliki: przeglądaj, pobierz jeden i zaimportuj albo dodaj
własny. Czym musi być zgłoszenie i co jest sprawdzane przed jego wystawieniem, opisano w
[Galerie społeczności](community-galleries.md).

**Eksportuj** zapisuje to, co pokazuje karta, pod nazwą z pola **Nazwa**: projekt w
kontrolkach, zapisany lub nie, więc preset w trakcie pracy można udostępnić bez wcześniejszego tworzenia. Zaimportowany
preset wybrany w **Edytuj ustawienie** jest eksportowany z dysku takim, jaki jest, ponieważ jego wygląd mieszka w plikach,
których kontrolki nie potrafią opisać. Podróżuje tylko preset: żadna ścieżka z twojego komputera, żadna nazwa konta, żadne
twoje ustawienie.

**Importuj** prosi o plik, sprawdza go i instaluje w `presets\Users Presets`. Jeśli nazwa
jest zajęta, przez jeden z twoich presetów lub wbudowany, wybierasz **Zachowaj oba** (import ląduje pod
`Name (2)`) albo **Zastąp**. Nic nie jest zapisywane, dopóki nie odpowiesz.

Zaimportowany preset pojawia się w **Edytuj ustawienie**, jest zaznaczony i stamtąd można go ponownie wyeksportować lub usunąć.
Preset stworzony przez designer wraca w całości do dalszej edycji. Preset pisany ręcznie
bierze swój wygląd z plików, których kontrolki nie potrafią odtworzyć, więc kontrolki zostają bez zmian, a pole
nazwy pozostaje puste.

### Co jest sprawdzane przed zainstalowaniem czegokolwiek {#what-is-checked-before-anything-is-installed-1}

Pakiet jest weryfikowany w całości i odrzucany w całości, nigdy nie instalowany częściowo, gdy:

- nie jest pakietem presetu albo jego manifest jest nieobecny lub źle sformułowany;
- wymaga nowszego AW Next niż uruchomiony albo nowszego formatu pakietu;
- zawiera plik, którego format nie opisuje: program, skrypt lub cokolwiek spoza
  `preset/` i `sounds/`;
- jakakolwiek ścieżka w jego wnętrzu wskazuje poza jego własny folder.

Nic wewnątrz pakietu nie jest uruchamiane ani wykonywane podczas sprawdzania ani instalowania. Strona presetu
jest renderowana później, w tym samym okienku powiadomień w piaskownicy co wbudowany preset.

### Co zawiera pakiet {#what-a-package-contains}

```text
manifest.json     name, description, author, version, tags, format version,
                  minimum AW Next version, and the designer settings
preset/           index.html, style.css, images and fonts (relative paths only)
sounds/           optional audio, added to your sound list on import
```

Manifest jest przechowywany obok zainstalowanego presetu jako `aw-package.json`. Informuje aplikację, że preset
został zaimportowany i może zostać ponownie usunięty, oraz przenosi opis i autorstwo do kolejnego eksportu.

Dźwięk, który sam zaimportowałeś, podróżuje z presetem; dźwięk wbudowany nie, ponieważ manifest
go wymienia, a każda instalacja go ma. Import nigdy nie zmienia wybranego przez ciebie dźwięku i nigdy nie
nadpisuje żadnego z twoich: inny plik o tej samej nazwie przychodzi jako `name (2)`.

Opcjonalne pole `author` jest wypełniane wyłącznie z pliku samego presetu, więc nic nie jest przypisywane tobie,
chyba że sam to wpiszesz.

---

**Dalej:** [Nakładka](overlay.md) - lista osiągnięć w grze, która jest osobna od tych
okien.

<div align="center">

[← Dokumentacja](README.md) · [Powiadomienia](notifications.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
