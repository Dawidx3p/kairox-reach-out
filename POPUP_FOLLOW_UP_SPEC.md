# Specyfikacja wdrożenia — powiadomienie o follow-upach

## Cel

Użytkownik ma od razu widzieć po otwarciu centrum leadów, że czekają na niego follow-upy oraz ile ich jest.

## Warunek pojawienia

Po załadowaniu listy leadów oblicz liczbę aktywnych follow-upów, których `dueDate` jest dzisiaj albo wcześniejsza.

Uwzględniaj tylko leady ze statusem `sent` lub `replied`, zgodnie z obecną regułą follow-upów. Nie uwzględniaj pustych terminów ani leadów odrzuconych.

Jeżeli liczba wynosi zero, popupu nie pokazuj.

## Treść

Nagłówek:

> Follow-upy do ogarnięcia

Treść powinna zawierać dynamiczną liczbę, np.:

> Masz 3 follow-upy wymagające uwagi.

Dla jednej pozycji użyj liczby pojedynczej: „Masz 1 follow-up wymagający uwagi.”

## Akcje

- **Pokaż follow-upy** — zamyka popup i otwiera filtr „Follow-up”, posortowany od najstarszego terminu.
- **Później** — zamyka popup bez zmiany danych.
- Przycisk zamknięcia `×` ma ten sam efekt co „Później”.

## Zachowanie

- Popup pokazuj najwyżej raz przy jednym załadowaniu aplikacji.
- Po przejściu do innego widoku nie pokazuj go ponownie bez ponownego załadowania aplikacji.
- Popup nie może blokować korzystania z aplikacji ani wymagać potwierdzenia.
- Nie używaj systemowych powiadomień przeglądarki, dźwięku ani powiadomień zewnętrznych.
- Po oznaczeniu follow-upu jako wykonany licznik powinien zostać odświeżony po zapisie.

## Wygląd i dostępność

- Na komputerze: modal lub wyraźny panel nad listą leadów.
- Na telefonie: panel dopasowany do szerokości ekranu, bez poziomego przewijania.
- Fokus klawiatury trafia na główną akcję „Pokaż follow-upy”.
- Popup ma etykietę dla czytnika ekranu i nie opiera komunikatu wyłącznie na kolorze.

## Kryteria akceptacji

- 0 zaległych/dzisiejszych follow-upów: brak popupu.
- 1 follow-up: poprawna forma pojedyncza.
- 3 follow-upy: komunikat pokazuje „3”.
- Follow-up przyszły: nie zwiększa licznika.
- Kliknięcie „Pokaż follow-upy” otwiera właściwy filtr.
- Kliknięcie „Później” nie zmienia danych i nie pokazuje popupu ponownie w tej sesji widoku.
