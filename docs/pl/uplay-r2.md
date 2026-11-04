---
title: "Konfiguracja Goldberg Uplay, R1 i R2"
description: "Skonfiguruj osiągnięcia zgodnych gier Ubisoftu za pomocą loaderów Uplay R1 i R2 oraz bezpiecznie je naprawiaj."
---

# Konfiguracja Goldberg Uplay (R1 i R2)

AW Next ma osobną naprawę dla gier Ubisoftu uruchamianych przez emulator Goldberg Uplay. Nigdy nie
rusza oficjalnych instalacji Ubisoft Connect: gra jest wybierana dopiero wtedy, gdy AW Next udowodni, jakiego
dokładnie loadera i jakiej generacji używa.

Gra Ubisoftu ładuje tylko tę generację loadera, z którą zlinkowano jej plik wykonywalny: mniej więcej od 2019
roku to **R2**, wszystko wcześniejsze to **R1**. AW Next wykrywa i naprawia tę, która ma zastosowanie, ponieważ
zła generacja podrzuciłaby bibliotekę DLL, której gra nigdy nie otwiera. Gra Ubisoftu z dwoma identyfikatorami produktu (gra
podstawowa i jej Complete Edition) działa w obu przypadkach: zapis pod którymkolwiek identyfikatorem jest czytany, a goły identyfikator celu
wewnątrz niego jest dopasowywany do listy osiągnięć Steam.

> [!WARNING]
> Naprawa zmienia pliki gry. Używaj jej tylko z grami, które posiadasz.

## Naprawa gry {#repair-a-game}

Ze **Stan gry**:

1. Dodaj bibliotekę gry w **Ustawienia → Foldery** i przeskanuj ją.
2. Otwórz panel **Stan gry** tej gry i przejrzyj **Diagnozuj konfigurację Uplay R1/R2**.
3. Uruchom **Zastosuj poprawkę osiągnięć Ubisoft** i uruchom grę raz.

Z **Ustawienia → Emulatory → Ubisoft / Uplay R1/R2**:

<div align="center">
<picture><source srcset="../assets/shot/uplay-r2-panel-800.webp 800w, ../assets/shot/uplay-r2-panel.webp 928w" sizes="(max-width: 700px) 100vw, 720px"><img src="../screenshot/uplay-r2-panel.png" width="720" height="536" alt="Ustawienia - Ubisoft / Uplay R2"></picture><br>
<sub>Zintegrowany pakiet naprawczy jest weryfikowany, zanim jakakolwiek gra zostanie ruszona</sub>
</div>

- **Automatycznie naprawiaj nowo wykryte gry**: przełącznik widoczny także w Steam / GBE Fork, stosowany
  również do gier Ubisoftu. Domyślnie wyłączony.
- **Napraw wykryte gry Uplay R1/R2**: naprawia każdą wykrytą instalację w jednej potwierdzonej partii.
- **Importuj lub zastąp DLL** / **Przywróć wbudowane DLL**: użyj własnej kompilacji loadera albo wróć do
  tej, którą dostarcza AW Next. Ręcznie wybrana biblioteka DLL nie wymaga znanego odcisku SHA-256, ale musi być
  poprawnym loaderem Uplay zdolnym do obsługi osiągnięć, ze spójną nazwą i architekturą.

Zintegrowane biblioteki DLL są w `app/resources/uplayR2/` (R2) i `app/resources/uplayR1/` (R1). AW Next
sprawdza ich skróty, architekturę PE i zdolność do obsługi osiągnięć, zanim naprawa może ich użyć, i
trzyma obok nich archiwum odzyskiwania.

Ta sama transakcja naprawcza działa z menu kontekstowego, Stanu gry, automatycznej naprawy, Napraw wszystko i
przycisku partii. Robi migawkę każdej zmienionej DLL, schematu i INI w `<game>\.aw-backups\<timestamp>\`
i przywraca je automatycznie, jeśli późniejsza walidacja się nie powiedzie. Powtórzenie identycznej naprawy
nic nie zmienia.

## Łączenie niedopasowanej gry z jej wydaniem Steam {#linking-an-unmapped-game-to-its-steam-release}

AW Next sam dopasowuje większość gier Ubisoftu do ich wydania Steam, aby zamienić nazwy osiągnięć Steam
na identyfikatory celów Ubisoftu, których oczekuje loader. Gdy mu się nie uda, wybierz wydanie samodzielnie
za pomocą **Zidentyfikuj grę (ID aplikacji Steam)** w menu prawego przycisku gry. Parowanie, którego nie można
potwierdzić, jest odrzucane, ponieważ błędne zapisałoby listę osiągnięć innej gry w folderze
tej gry.

Otwarcie raz strony osiągnięć gry w Ubisoft Connect może pomóc AW Next rozpoznać tytuł, który
tego wymaga, taki jak Brawlhalla lub The Crew 2. Wybór, który potwierdzisz, jest zapamiętywany dla dokładnie tego
folderu instalacji. Automatyczne dopasowywanie (wbudowana mapa, katalog Ubisoftu na żywo i
reguła dopasowywania tytułów) opisano w [opisie technicznym Uplay R1/R2](../uplay-reference.md).

## Gra, która nigdy nie prosi o osiągnięcie {#a-game-that-never-asks-for-an-achievement}

Niektóre tytuły Ubisoftu najpierw proszą loader o sesję Ubisoftu, a loader odpowiada z pustego
klucza. Te gry odczytują pusty klucz jako wylogowanie i nigdy nie wywołują API osiągnięć. Konfiguracja
wygląda poprawnie i nic nie jest zapisywane. Tak zachowuje się Avatar: Frontiers of Pandora.

Gdy dziennik diagnostyczny Stanu gry to potwierdza, oferuje **Włącz osiągnięcia offline** w kontroli
Konfiguracja emulatora. Dodaje jeden zastępczy klucz sesji obok gry: to nie prawdziwa sesja
Ubisoftu, nie ma w tym żadnego konta, nic nie jest nigdzie wysyłane, to tylko tyle, by przejść to jedno sprawdzenie. Nigdy nie jest
dodawany automatycznie, ponieważ niepoprawny token może zepsuć niektóre gry.

**Uruchom grę raz po jego włączeniu.** Do tego czasu wiersz mówi *Osiągnięcia offline włączone,
uruchom grę raz*. Przycisk obok brzmi wtedy **Wyłącz osiągnięcia offline**, który zabiera
klucz z powrotem.

Dotyczy to tylko loaderów R2; INI loadera R1 niesie niezwiązany klucz. [Przewodnik Goldberg / GBE](emulator-setup.md)
omawia odpowiednik tej naprawy dla Steam.

## Osiągnięcia pozostają na 0% {#achievements-remain-at-0}

- Uruchom ponownie **Diagnozuj konfigurację Uplay R1/R2** po aktualizacji gry, ponieważ aktualizacje często usuwają schemat
  lub zerują licznik odblokowań.
- Przeczytaj `upc_r2.log` (lub `upc_r1.log`) obok biblioteki DLL loadera: zapisuje każdy numer celu, o który
  prosi gra. Zostaw włączony **Dziennik diagnostyczny** w **Ustawienia → Emulatory → Ubisoft / Uplay R1/R2**.
  Stan gry potrzebuje go, aby odróżnić grę, która nigdy o nic nie prosiła, od takiej, która prosi o cel, którego schemat
  nie zawiera. Jest domyślnie włączony, a AW Next przycina log, gdy przekroczy 25 MB.
- Sprawdź `%APPDATA%\Achievement Watcher Next\logs\parser.log`.

## Uwaga o programie antywirusowym {#antivirus-note}

Jeśli oprogramowanie antywirusowe usunie luźną bibliotekę DLL loadera albo w trakcie poddaje kwarantannie archiwum odzyskiwania, Stan
gry zgłasza problem programu antywirusowego i oferuje zezwolenie na folder oraz przywrócenie plików. Nie musisz
szukać zamiennika samodzielnie.

Tożsamość, identyfikatory celów i dziennik loadera opisano w [opisie technicznym Uplay R1/R2](../uplay-reference.md).

<div align="center">

[← Dokumentacja](README.md) · [Rozwiązywanie problemów](troubleshooting.md) · [Strona główna projektu](https://github.com/Shirowwww/Achievement-Watcher-Next)

</div>
