---
title: "Galerie społeczności"
description: "Weź preset powiadomień lub motyw stworzony przez kogoś innego albo wyślij własny do galerii społeczności."
---

# Galerie społeczności

Dwie galerie, jedna usługa, jeden zestaw reguł.

| | | |
|---|---|---|
| [Galeria presetów](../gallery/) | `.awpreset` | Okno powiadomienia: układ, krój pisma, kolory, ruch i dźwięk |
| [Galeria motywów](../gallery/themes/) | `.awtheme` | Reszta aplikacji: okno, pasek tytułu, biblioteka, listy osiągnięć, ustawienia i nakładka |

Aby pobrać z którejkolwiek, weź plik, a potem użyj **Ustawienia → Presety powiadomień → Importuj** albo
**Ustawienia → Wygląd → Importuj**. Ta strona opisuje drugą stronę: jak dodać własny, co jest sprawdzane
i co może mówić karta.

## Wysyłanie {#sending-one}

Przebieg jest taki sam dla obu i nic nie opuszcza twojej przeglądarki, dopóki nie naciśniesz **Opublikuj**.

1. **Wyeksportuj go.** Użyj Ustawienia → Presety powiadomień → Eksportuj dla presetu albo Ustawienia → Wygląd →
   Eksportuj dla motywu. Plik niesie już nazwę, opis, wersję, tagi i wersję AW Next,
   której potrzebuje.
2. **Wybierz plik** w panelu *Wyślij własny* na stronie galerii albo upuść go na panel. Wybranie
   niczego nie wysyła: plik czeka, gdy uzupełniasz resztę, a panel podaje, co zawiera.
3. **Sprawdź, co ma mówić karta.** Cztery pola są wypełniane z pakietu, gdy tylko go wybierzesz:
   **nazwa**, jednowierszowy **opis**, **tagi** i **autorstwo**. Autorstwo to autor, którego
   aplikacja zapisała podczas eksportu, więc jest to nazwa, pod którą występujesz, i jest puste tylko wtedy, gdy wybrano brak
   wskazania autora. Wpisz tag i naciśnij Enter, aby zrobić z niego znacznik; kliknij znacznik, aby go usunąć.

   **Nazwa to jedyne pole, które trzeba wypełnić.** Nagłówkuje kartę i daje adres, pod którym
   plik jest publikowany, a nazwa wybrana przez kogoś innego to to, co moderator kończy przepisując.
   Opublikuj pozostaje nieaktywne, dopóki jej nie ma. Pozostałe trzy mogą zostać puste, a karta wtedy nie niesie
   w tych miejscach niczego.
4. **Naciśnij Opublikuj.** Trwa to kilka sekund, ponieważ obraz jest renderowany, a nie zgadywany. Potem
   czeka: nic nie pojawia się w galerii, zanim opiekun tego nie zatwierdzi.

Wszystko w tych polach to **sugestia**. Nadpisuje pakiet tylko tam, gdzie jest wypełnione,
jest czyszczone dokładnie tak jak manifest, a opiekun widzi wszystkie cztery obok wyrenderowanego obrazu, zanim
cokolwiek zostanie opublikowane. Nic z tego nie decyduje o nazwie pliku ani adresie: usługa buduje adres z
nazwy, zachowuje małe litery, cyfry i myślniki, a wszystko inne odrzuca.

Twoja przeglądarka odczytuje pola z pakietu (jego `manifest.json` i nic więcej). Sam plik
opuszcza komputer dopiero po naciśnięciu Opublikuj.

| | Preset | Motyw |
|---|---|---|
| Pakiet | Najwyżej 4 MB | Najwyżej 8 MB |
| Limit | Pięć zgłoszeń na godzinę z jednego adresu, presety i motywy razem | |

## Obrazu nie wysyłasz ty {#the-picture-is-not-yours-to-send}

Do żadnej z galerii nie można dołączyć zrzutu ekranu. Usługa renderuje obraz z twojego pakietu.

W przypadku **presetu** rysuje okno z pakietu, w tym samym dokumencie w piaskownicy, którego używa aplikacja,
raz w przeglądarce bez sieci i bez własnych skryptów, w rozmiarze, w jakim aplikacja je pokazuje. Rysuje je
w każdym stanie, który preset musi obsłużyć: zwykłe odblokowanie, brązowe, srebrne i złote rzadkie,
okno 100% i krok postępu. Karta pokazuje jedno naraz, z przyciskiem strzałki po każdej stronie, aby
je przeglądać, a powiększony obraz to ten, który jest widoczny. Sprawdź wszystkie sześć podczas projektowania: preset,
który dobrze wygląda tylko w jednym z nich, ujawni to tutaj.

**Motyw** to kolory i liczby, więc serwer rysuje stały przykład interfejsu AW Next z
twoim motywem (pasek tytułu, wiersz profilu, biblioteka, lista ostatnio odblokowanych, powierzchnia ustawień) i
go fotografuje. To ten sam przykład, który Ustawienia pokazują przed importem, w tym samym rozmiarze. Leży on za każdym razem na tych samych czterech
gradientach tła, więc przezroczysty motyw nie renderuje się jako wyblakły projekt, a dwa
renderowania jednego pliku są zgodne.

Tekst przykładu to stała w kodzie źródłowym aplikacji, więc karta nie może zawierać twojej biblioteki, konta, ścieżki ani
gry, ani pokazywać wersji zgłoszenia, której nie wysłałeś.

## Co podróżuje w pliku {#what-travels-in-a-file}

**`.awpreset`** zawiera dokument i arkusz stylów presetu, jego obrazy, czcionki i dźwięk
oraz ustawienia designera, które za nim stoją. Nic o twoim komputerze.

**`.awtheme`** zawiera kolory, gradienty, dopasowania, ustawienia efektów i każdy wybrany przez ciebie obraz tła
i nic więcej: żadnego arkusza stylów, znaczników ani skryptu. Obraz podróżuje jako bajty pod nazwą zbudowaną z
jego warstwy, nigdy jako ścieżka z twojego folderu obrazów. Pełna lista jest w
[formacie `.awtheme`](../awtheme-format.md).

**Motywu w postaci arkusza stylów użytkownika nie można wyeksportować.** Plik `.css` wrzucony do
`%APPDATA%\Achievement Watcher Next\themes` nie jest plikiem `.awtheme`, a Eksportuj go odrzuca. Udostępnij sam
plik `.css`.

## Tła i inne zasoby {#backgrounds-and-other-assets}

Wszystko wewnątrz pakietu jest redystrybuowane każdemu, kto go pobierze, więc musi być twoje do
redystrybucji:

- Własna grafika albo coś na licencji, która na to pozwala. Znaleziona tapeta zwykle nie jest
  ani jednym, ani drugim, podobnie jak kupiona czcionka.
- Nic z logo, znakiem wodnym ani wypalonym tekstem. Motyw to wygląd, a nie rozmieszczenie.
- Nic, co nie przeszłoby jako tło pulpitu w pracy.

Motyw złożony wyłącznie z kolorów jest mile widziany i najłatwiejszy do przyjęcia.

## Autorstwo i licencja {#credit-and-licence}

Nazwa na karcie to to, co w końcu powie pole **Autorstwo**. Zaczyna od autora, którego aplikacja
zapisała podczas eksportu, więc zwykle jest poprawna. Zmień ją, jeśli występujesz pod inną nazwą, albo ją opróżnij,
a karta nie poda żadnej nazwy. Opiekun może dodać odnośnik do twojego profilu podczas zatwierdzania.

**Wszystko wymienione w którejkolwiek galerii jest publikowane na licencji
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Wysyłając, zgadzasz się na to, potwierdzasz,
że to twoja własna praca i że wszystko w niej jest twoje do przekazania.

## Co jest sprawdzane {#what-is-checked}

Zgłoszenie musi przejść dwie warstwy.

**Własny czytnik aplikacji.** `app/util/presetPackage.js` i `app/util/themePackage.js`, moduły, które
działają przy Imporcie, walidują pakiet: manifest, wersję formatu, minimalną wersję aplikacji, każdą
ścieżkę w nim, typy plików, rozmiary i punkt wejścia. Usługa galerii używa tych plików
dosłownie, więc reguła dodana tam obowiązuje tutaj od następnej kompilacji i nic nie może zostać wystawione, czego aplikacja
by nie odrzuciła.

**Własne limity galerii**, których prywatny import nie potrzebuje:

| | |
|---|---|
| Nazwa pliku | Małe litery, cyfry i myślniki, od 2 do 48 znaków, budowana przez usługę z nazwy |
| Pakiet | 4 MB dla presetu, 8 MB dla motywu |
| Obraz | Renderowany przez usługę, raz na stan, i odrzucany, jeśli któryś wyjdzie poza rozmiar obsługiwany przez wpis (najwyżej 500 KB każdy) |
| Nazwa | Unikalna w swojej galerii, ponieważ dwa wpisy o tej samej nazwie kolidują przy imporcie |

Nic w pakiecie nie jest wykonywane podczas sprawdzania, a strona internetowa nigdy go nie renderuje: karta pokazuje
obraz wytworzony przez usługę. Preset działa tylko w aplikacji, w tym samym okienku powiadomień w piaskownicy,
którego używa wbudowany preset, a motyw nie może niczego uruchomić nigdzie.

## Co jest odrzucane {#what-gets-refused}

- Cudza praca, chyba że ta osoba się zgodziła, a ty podajesz jej autorstwo.
- Zasoby, których nie możesz redystrybuować.
- Okno udające coś innego: okno dialogowe systemu, reklamę, adres do odwiedzenia.
- Reklama, logo lub wezwanie do działania wypalone w obrazie tła.
- Paleta, która sprawia, że tekst jest nieczytelny.
- Prawie duplikat czegoś już wystawionego.

Odrzucenie zachowuje sumę kontrolną i usuwa bajty, więc ponowne wysłanie tego samego pliku jest rozpoznawane
zamiast trafiać do kolejki dwa razy.

## Aktualizacja lub usunięcie własnego {#updating-or-removing-yours}

Wyślij nowszy plik w ten sam sposób, z podwyższoną wersją wewnątrz pakietu, i napisz w
opisie, że zastępuje wcześniejszą kartę, aby opiekun mógł ją zdjąć. Aby usunąć
wpis, [otwórz zgłoszenie](https://github.com/Shirowwww/Achievement-Watcher-Next/issues/new/choose) i
napisz, której karty dotyczy.

## Gdy nie ma panelu {#when-the-panel-is-not-there}

Żaden serwer galerii nie odpowiada, a strona wyświetla kopię opublikowaną obok niej. Wszystko, co już jest w
galerii, nadal można pobrać. Tylko wysłanie czegoś nowego musi poczekać, więc spróbuj ponownie później.

Projekt prowadzi usługę, która sprawia, że panel się pojawia, i nie jest ona częścią tego repozytorium, więc
nie ma nic do zainstalowania.

## Motywy z Steam Achievement Notifier {#themes-from-steam-achievement-notifier}

Nie są tu wystawiane i nie będą.

Motywy SAN to pliki `.san`, które ludzie przekazują sobie bezpośrednio. Repozytorium SAN nie ma folderu z motywami, listy
na wiki ani kanału, więc kompilacja nie ma na co wskazać. Pliki należą do osób, które je stworzyły,
i nie są licencjonowane do redystrybucji, a repozytorium SAN nie ma żadnej licencji. Skopiowanie
któregokolwiek z nich tutaj oznaczałoby ponowne opublikowanie cudzej pracy bez pozwolenia.

AW Next czyta za to twoje. **Ustawienia → Presety powiadomień → Importuj motyw SAN** czyta plik `.san`
albo `usertheme.json` już rozpakowanego motywu, a **Importuj z SAN na tym PC** czyta
własne ustawienia SAN. Tak czy inaczej motyw staje się presetem AW Next, rysowanym silnikiem SAN
w rozmiarze SAN, i eksportuje się jako `.awpreset` jak każdy inny. To, co przechodzi, opisano w
[Presety](presets.md#import-a-theme-from-steam-achievement-notifier).

Jeśli zaimportowałeś własny, wyeksportuj go i wyślij ten. Wtedy to twój preset, z autorstwem na twoje nazwisko.

- [Steam Achievement Notifier](https://github.com/SteamAchievementNotifier/SteamAchievementNotifier)

---

**Dalej:** [Presety i Preset Designer](presets.md): czym jest preset i jak go zrobić.

<div align="center">

[← Dokumentacja](README.md) · [Galeria presetów](../gallery/) · [Galeria motywów](../gallery/themes/) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
