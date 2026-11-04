---
title: "Lista osiągnięć w grze (nakładka)"
description: "Lista osiągnięć w grze otwierana skrótem Ctrl+Shift+K: wyszukiwanie, filtry, rzadkość, ukryte opisy i personalizacja."
---

# Lista osiągnięć w grze (nakładka)

Nakładka w grze (domyślnie `Ctrl+Shift+K`, gdy działa obsługiwana gra) pokazuje listę osiągnięć
uruchomionej gry bez wychodzenia z niej: nazwy, opisy, stan zablokowania, daty odblokowania i
postęp. Przeciągnij ją za nagłówek; pozostaje nad grą. W systemie Linux gra uruchomiona natywnie
pod Wayland nie przekazuje skrótu dalej: zamiast tego przypisz `~/.local/bin/achievement-watcher --toggle-overlay`
do klawisza, jak pokazuje [Skrót nakładki](linux.md#overlay-shortcut).

<div align="center">
<picture><source srcset="../assets/shot/overlay.webp 569w" sizes="(max-width: 700px) 100vw, 360px"><img src="../screenshot/overlay.png" width="360" height="633" alt="Lista osiągnięć w nakładce w grze"></picture><br>
<sub>Kolumny stanu, rzadkości i daty, z wyszukiwaniem i filtrami</sub>
</div>

## Jak otworzyć listę osiągnięć w grze? {#how-do-i-open-the-achievement-list-in-a-game}

Naciśnij `Ctrl+Shift+K`, gdy działa obsługiwana gra. To skrót domyślny. Nakładka wymienia każde
osiągnięcie tej gry wraz ze stanem, datą odblokowania, rzadkością i postępem i można w niej wyszukiwać.
Naciśnij skrót ponownie, aby ją zamknąć. Na kontrolerze domyślnie jest to **Back + Start + LB**.

W systemie Linux pod Wayland gra działająca jako natywne okno Wayland nigdy nie przekazuje klawisza do AW Next.
Zamiast tego przypisz `~/.local/bin/achievement-watcher --toggle-overlay` do klawisza w ustawieniach klawiatury
swojego pulpitu. Zobacz [Skrót nakładki](linux.md#overlay-shortcut).

## Czy nakładka to to samo co okno odblokowania? {#is-the-overlay-the-same-as-the-unlock-popup}

Nie. Okno to jednorazowe powiadomienie, które pojawia się po odblokowaniu czegoś, stylizowane przez preset (zobacz
[Powiadomienia](notifications.md)). Nakładka to pełna lista jednej gry, otwierana przez ciebie, która
zostaje, dopóki jej nie zamkniesz.

## Co pokazuje {#what-it-shows}

- Pasek statystyk z `odblokowane / razem` i procentem ukończenia.
- Jeden wiersz na osiągnięcie z kolorową pigułką stanu (`Odblokowane` / `Zablokowane`), datą odblokowania dla
  zdobytych osiągnięć i paskiem postępu z etykietą `current / max` dla osiągnięć z postępem.
- Odznakę rzadkości (`★ 12.3%`) dla każdego osiągnięcia ze znanym odsetkiem odblokowań. Zwykłe osiągnięcia używają
  ciemnoszarej odznaki; rzadkie używają złota, srebra i brązu z miękką poświatą, domyślnie przy 5%, 10% i 15%.
  **Ustawienia → Ogólne → Wyświetlanie rzadkości** zmienia stopnie lub przełącza na stopnie trofeów.

## Ukryte osiągnięcia {#hidden-achievements}

Nakładka nie psuje niespodzianki ukrytego osiągnięcia, którego nie odblokowałeś: tak jak w oknie głównym, jego
opis brzmi *Ukryte - kliknij, aby pokazać*. Kliknij go albo naciśnij **A** na kontrolerze, aby pokazać
tylko ten jeden opis. Wyszukiwanie pomija opisy, które są nadal zasłonięte.

<div align="center">
<picture><source srcset="../assets/shot/overlay-hidden-800.webp 800w, ../assets/shot/overlay-hidden.webp 1162w" sizes="(max-width: 700px) 100vw, 560px"><img src="../screenshot/overlay-hidden.png" width="560" height="482" alt="Lista nakładki dwukrotnie: ukryte opisy zasłonięte, a potem jeden odsłonięty" loading="lazy" decoding="async"></picture><br>
<sub>Przed kliknięciem „We've all been there before...” i po nim: odsłonięty zostaje tylko ten opis</sub>
</div>

## Wyszukiwanie i filtry {#search-and-filters}

- Pole wyszukiwania filtruje wiersze według nazwy i opisu osiągnięcia w trakcie pisania.
- Pigułki nad listą przełączają między **Wszystkie**, **Odblokowane**, **Zablokowane** i **W trakcie**.
- Kliknięcie nagłówka kolumny **Rzadkość**, **Data** lub **Stan** sortuje rosnąco, potem malejąco,
  a potem wraca do naturalnej kolejności. Naraz sortuje się jedna kolumna.
- `/` przenosi fokus do pola wyszukiwania. `Esc` je czyści albo zamyka panel opcji, jeśli jest otwarty.

## Kontroler (gamepad) {#controller-gamepad}

Włącz **Sterowanie nakładką w grze za pomocą kontrolera** w **Ustawienia → Kontroler**, aby sterować
nakładką gamepadem. Przy domyślnych przypisaniach:

- **Back + Start + LB** otwiera lub zamyka nakładkę.
- **LB + X** przełącza tryb nawigacji: pierścień fokusu pokazuje, gdzie jesteś, a mała odznaka **UI**
  pojawia się w nagłówku nakładki.
- W trybie nawigacji krzyżak lub lewy drążek przesuwa fokus, **A** potwierdza, **B** anuluje, **X**
  przenosi fokus do wyszukiwania, a **Y** otwiera panel opcji.
- Przytrzymanie **LB + RB** przesuwa nakładkę lewym drążkiem i przewija listę prawym
  drążkiem.

Każdy skrót można skonfigurować, nazwy przycisków podążają za wybranym układem, a pasek podpowiedzi nakładki
pokazuje twoje własne przypisania. [Przewodnik po kontrolerze](controller.md) opisuje ustawienia, obsługiwane pady
i zastrzeżenie dotyczące Windows, że gra nadal widzi naciśnięcia twoich przycisków.

## Personalizacja {#customization}

Przycisk **⚙** w nagłówku nakładki otwiera opcje:

- **Akcent**: pięć gotowych kolorów, własny próbnik koloru albo **Użyj motywu aplikacji**, aby podążać za motywem
  okna głównego (używany dla postępu, aktywnych filtrów, pierścieni fokusu i poświaty odblokowanych wierszy).
- **Gęstość**: odstępy wierszy Kompaktowy, Przytulny lub Przestronny.
- **Rozmiar ikon**: Mały, Średni lub Duży.
- **Powiększenie**: od 80% do 125% rozmiaru panelu.
- **Nieprzezroczystość**: od 40% do 100% tła panelu.
- **Przełączniki widoczności** paska statystyk, pasków postępu, odznak rzadkości i opisów.

Zmiany są stosowane od razu i zapisywane lokalnie. **Przywróć domyślne** przywraca pierwotny wygląd. Opcje
działają z klawiatury: menu powiększenia i nieprzezroczystości pokazują pierścień fokusu, przełączniki działają za pomocą
Tab i Spacji, a animacje podążają za systemowym ustawieniem ograniczenia ruchu.

## Skróty klawiszowe (nakładka otwarta) {#keyboard-shortcuts-overlay-open}

- `Ctrl+Alt+Shift+Strzałki` - przesuwa okno nakładki o kawałek.
- `Ctrl+Alt+Shift+1` … `5` - przyciąga do gotowego położenia.
- `Ctrl+Alt+Shift+C` - przełącza przepuszczanie kliknięć.

## Uwagi {#notes}

- Nakładka podąża za językiem interfejsu wybranym w aplikacji.
- Po pierwszym otwarciu okno nakładki jest trzymane ukryte i używane ponownie przez 5 minut, więc ponowne przełączenie
  jest niemal natychmiastowe. Gdy jest ukryte, wstrzymuje odpytywanie kontrolera, a po 5 minutach
  bezczynności okno jest zwalniane, aby oddać pamięć.
- Zawartość wierszy jest escapowana przed renderowaniem; dane osiągnięć są tylko wyświetlane, nigdy wykonywane.
- Lista nakładki jest osobna od jednorazowych presetów *powiadomień* nakładki (Ustawienia →
  Powiadomienia), w których konfiguruje się wygląd okna.

---

**Dalej:** [Przewodnik po kontrolerze](controller.md) - sterowanie nakładką i aplikacją za pomocą gamepada.

<div align="center">

[← Dokumentacja](README.md) · [Przewodnik po powiadomieniach](notifications.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
