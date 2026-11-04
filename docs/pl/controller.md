---
title: "Przewodnik po kontrolerze"
description: "Steruj Achievement Watcher Next i jego nakładką w grze za pomocą kontrolera Xbox, PlayStation lub Switch i poczuj odblokowanie dzięki wibracji."
---

# Przewodnik po kontrolerze (gamepadzie)

Gamepad może sterować dwoma osobnymi miejscami: oknem głównym i nakładką w grze. Oba konfiguruje się w
**Ustawienia → Kontroler**.

<div align="center">
<picture><source srcset="../assets/shot/controller-panel-800.webp 800w, ../assets/shot/controller-panel.webp 940w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/controller-panel.png" width="720" height="529" alt="Ustawienia - Kontroler"></picture><br>
<sub>Nawigacja po nakładce i aplikacji, układ oraz przypisania przycisków dla poszczególnych skrótów</sub>
</div>

## Dwa przełączniki {#the-two-switches}

| Ustawienie | Domyślnie | Czego dotyczy |
|---|---|---|
| **Steruj aplikacją kontrolerem** | Włączone | Główne okno AW Next: biblioteka, szczegóły gier, ustawienia i wyszukiwania. |
| **Sterowanie nakładką w grze za pomocą kontrolera** | Wyłączone | Nakładka w grze, sterowana przez tracker działający w tle podczas gry. |

Nawigacja po aplikacji to zwykłe wejście okna i nic nie kosztuje, więc jest domyślnie włączona. Sterowanie nakładką ładuje
natywny stos kontrolera w trackerze działającym w tle, więc jest opcjonalne.

## Skróty w skrócie {#shortcuts-at-a-glance}

Nazwy przycisków używają słownictwa Xbox; aplikacja pokazuje je w wybranym przez ciebie układzie.

<div align="center">
<img src="../assets/img/controller-map.svg" width="700" height="422" alt="Gamepad z domyślnymi skrótami: LT otwiera Stan gry, RT uruchamia grę, LB i RB zmieniają kartę ustawień, krzyżak przesuwa fokus, A potwierdza, B anuluje, X wyszukuje, Y i Start otwierają Ustawienia, a do tego trzy kombinacje nakładki" loading="lazy">
</div>

| Skrót | Domyślnie | Gdzie |
|---|---|---|
| Otwórz / zamknij nakładkę | **Back + Start + LB** | W grze |
| Przełącz nawigację po nakładce | **LB + X** | Nakładka otwarta |
| Przesuwaj i przewijaj nakładkę | **LB + RB** (przytrzymane) | Nakładka otwarta |
| Potwierdź | **A** | Aplikacja + nakładka |
| Wstecz / anuluj | **B** | Aplikacja + nakładka |
| Przenieś fokus do pola wyszukiwania | **X** | Aplikacja + nakładka |
| Otwórz Ustawienia / opcje nakładki | **Y** | Aplikacja + nakładka |
| Otwórz Ustawienia | **Start** | Aplikacja |
| Uruchom wybraną grę | **RT** | Aplikacja, biblioteka |
| Otwórz Stan gry dla wybranej gry | **LT** | Aplikacja, biblioteka |
| Poprzednia / następna karta ustawień | **LB** / **RB** | Aplikacja, Ustawienia otwarte |
| Przewiń stronę | **LB** / **RB** | Aplikacja, Ustawienia zamknięte |

Przełączenie nakładki używa trzech przycisków, aby nie mogło zadziałać przypadkiem w trakcie gry. Każdy skrót nakładki
można skonfigurować i przyjmuje on od jednego do trzech przycisków.

W bibliotece drążek przesuwa się między kafelkami, a **A** otwiera grę, jak kliknięcie. Dwie
kontrolki narysowane na kafelku odpowiadają spustom: **RT** uruchamia wybraną grę, a **LT** otwiera
jej panel Stan gry. Obie nic nie robią, jeśli nie jest zaznaczony kafelek biblioteki.

## Opcje {#options}

- **Układ kontrolera**: słownictwo podpowiedzi i nazw przycisków. **Automatycznie** podąża za podłączonym padem,
  gdy można go zidentyfikować; pozostałe to **Xbox**, **PlayStation** i **Switch**.
- **Backend kontrolera**: **Automatycznie** wybiera najlepszy dostępny backend wejścia, **XInput** jest najbardziej
  zgodny, a **GameInput** pasuje do nowszych kompilacji Windows.
- **Przypisania**: od jednego do trzech przycisków na skrót. Skróty mogą współdzielić przycisk (domyślne tak robią:
  **LB + X** i **LB + RB** używają LB), a warstwa wejścia dba o to, by przytrzymanie jednej kombinacji nie
  uruchomiło drugiej. Przycisk powtórzony w jednym przypisaniu liczy się raz. Przełączenie nakładki przyjmuje także
  przycisk **Guide**; dwa tryby nakładki nie, ponieważ API gamepada w przeglądarce, które je odczytuje,
  nie zgłasza go niezawodnie.
- **Skup na nakładce po otwarciu**: daje nakładce fokus klawiatury, co wstrzymuje wiele gier, które
  tracą fokus. Domyślnie wyłączone.
- **Wyślij Esc do gry przy otwieraniu kontrolerem**: wysyła naciśnięcie klawisza Esc do gry w
  fokusie tuż przed otwarciem nakładki, dzięki czemu wiele gier się wstrzymuje lub otwiera menu. Działa tylko przy otwarciach
  wywołanych kontrolerem, gdy gra jest uruchomiona, nigdy przy skrócie klawiaturowym. Domyślnie wyłączone.

## Okno aplikacji {#app-window}

Przy włączonej nawigacji po aplikacji naciśnięcie dowolnego przycisku gamepada w oknie głównym pokazuje pierścień fokusu. Krzyżak
lub lewy drążek przesuwa się między kontrolkami i obowiązują skróty powyżej. Dwa szczegóły:

- **B** najpierw opuszcza aktywne pole tekstowe, a potem cofa lub anuluje, więc możesz wyjść z pola
  wyszukiwania bez myszy.
- **LB** / **RB** przełączają karty ustawień, gdy Ustawienia są otwarte, i przewijają stronę, gdy są zamknięte.

Poruszenie myszą lub naciśnięcie klawisza klawiatury oddaje sterowanie myszy i klawiaturze.

## Nakładka w grze {#in-game-overlay}

**Back + Start + LB** otwiera lub zamyka nakładkę nad uruchomioną grą. **LB + X** przełącza potem
tryb nawigacji: krzyżak lub lewy drążek przesuwa pierścień fokusu, **A** potwierdza, **B** anuluje, **X**
przenosi fokus do wyszukiwania, a **Y** otwiera panel opcji. Przytrzymanie **LB + RB** przesuwa nakładkę lewym
drążkiem i przewija listę prawym drążkiem.

Mała odznaka **UI** pojawia się w nagłówku, gdy nawigacja jest aktywna, a pasek podpowiedzi pokazuje twoje własne
przypisania i układ. Reszta nakładki opisana jest w [przewodniku po nakładce](overlay.md).

> [!IMPORTANT]
> Windows nie pozwala aplikacji innej firmy przechwycić kontrolera na wyłączność, więc gra może nadal
> otrzymywać naciśnięcia przycisków, gdy nakładka jest otwarta. Aby wstrzymać grę, włącz **Skup na nakładce
> po otwarciu** (większość gier się wstrzymuje, gdy traci fokus) lub **Wyślij Esc do gry przy otwieraniu
> kontrolerem**.

## Obsługiwane pady {#supported-pads}

Obsługiwane są kontrolery Xbox, PlayStation DualShock 4 / DualSense i Switch Pro. Pady Xbox
przechodzą przez XInput; pady PlayStation i Switch są czytane przez surowy HID, więc nie potrzebują żadnego
sterownika producenta.

## Gdy kontroler nie jest wykrywany {#when-a-controller-is-not-detected}

1. Upewnij się, że właściwy przełącznik jest włączony: nawigacja po aplikacji i sterowanie nakładką to osobne rzeczy.
2. Spróbuj jawnie backendu **XInput**; **Automatycznie** może wybrać GameInput w kompilacji, w której dany pad
   nie jest wyliczany.
3. Sprawdź pad w panelu kontrolerów gier systemu Windows (`joy.cpl`). Jeśli Windows go nie widzi, AW Next
   też go nie zobaczy.
4. Do zgłoszenia błędu dodaj `debugLogging = true` do sekcji `[controller]` pliku
   `%APPDATA%\Achievement Watcher Next\cfg\options.ini` i uruchom ponownie. Tracker w tle zapisuje wtedy w logu
   diagnostykę na poziomie przycisków. Nie ma przełącznika w interfejsie, ponieważ wynik jest obszerny; wyłącz to
   potem.

---

**Dalej:** [Stan gry](game-health.md) - panel dla każdej gry, który mówi, dlaczego gra jest lub nie jest
śledzona.

<div align="center">

[← Dokumentacja](README.md) · [Przewodnik po nakładce](overlay.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>

## W systemie Linux {#on-linux}

W systemie Linux AW Next czyta gamepady z urządzeń wejściowych jądra, a powyższe skróty działają tak samo.
Gdy działa Steam Input, czyta tylko wirtualne pady Steam, więc jedno naciśnięcie nie jest liczone dwa razy. Steam
Deck i wtyczka Decky są opisane w [Linux i Steam Deck](linux.md#steam-deck).
