# Dodawanie leada z pomocą AI

Ta funkcja nie łączy aplikacji z żadną usługą AI. Aplikacja kopiuje instrukcję, użytkownik sam przekazuje ją do wybranego narzędzia, a następnie wkleja otrzymany JSON do jednego pola.

## Przepływ

1. Na liście firm wybierz **Dodaj firmę**.
2. W sekcji **Wklej dane przygotowane przez AI** wybierz **Kopiuj instrukcję dla AI**.
3. Wklej instrukcję do wybranego narzędzia AI.
4. W miejscu `DANE ŹRÓDŁOWE` dodaj fakty, adres strony firmy, źródła i własne notatki.
5. Poproś AI o wykonanie instrukcji bez zmiany wymaganego formatu.
6. Skopiuj odpowiedź JSON do pojedynczego pola w aplikacji i wybierz **Dodaj leada z danych AI**.
7. Otwórz utworzoną kartę i ręcznie sprawdź wszystkie dane przed rozpoczęciem workflow.

## Jak przygotować dobre dane źródłowe

Najlepszy materiał wejściowy zawiera:

- dokładną nazwę firmy i jej oficjalną stronę,
- branżę oraz lokalizację, jeśli są istotne,
- imię, rolę i publiczny kanał osoby kontaktowej,
- krótki opis zauważonej potrzeby,
- konkretny, wiarygodny powód kontaktu,
- linki HTTP/HTTPS do stron potwierdzających ustalenia,
- własne ograniczenia, np. „nie twórz szkicu, jeśli brak właściwego kontaktu”.

Nie umieszczaj haseł, tokenów, danych płatniczych ani innych sekretów. Nie proś AI o wymyślanie adresów e-mail, osób lub faktów. Brak informacji powinien pozostać pusty albo mieć wartość `null`.

## Co aplikacja sprawdza

- odpowiedź musi być jednym poprawnym obiektem JSON,
- nazwa firmy jest obowiązkowa,
- dopuszczalne są wyłącznie zdefiniowane pola,
- adresy muszą używać HTTP/HTTPS, a e-mail musi mieć poprawny format,
- kanał może być tylko `email`, `linkedin`, `contact_form` albo `null`,
- kwalifikacja dopuszcza wyłącznie `true`, `false` lub `null`,
- AI nie może ustawić identyfikatora, statusu ani dat systemowych.

Aplikacja zawsze tworzy leada ze statusem **Nowy**. Dane przygotowane przez AI nie omijają researchu, kwalifikacji ani ręcznej akceptacji wiadomości.
