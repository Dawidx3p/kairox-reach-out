# Specyfikacja — historia kontaktu leada

## Cel

Na karcie każdego leada ma być jedno miejsce pokazujące pełny przebieg kontaktu: wysłane wiadomości, odpowiedzi, follow-upy i decyzje.

## Widok historii

Historia jest osią czasu sortowaną od najnowszego wpisu. Każdy wpis pokazuje:

- typ: pierwsza wiadomość, follow-up, odpowiedź, notatka lub zmiana statusu,
- datę i godzinę,
- kanał kontaktu,
- kierunek: KAIROX → firma albo firma → KAIROX,
- treść lub notatkę,
- status powiązany z wydarzeniem.

Wysłana wiadomość musi zachować dokładną treść, temat, odbiorcę i kanał z momentu potwierdzenia wysyłki. Nie wolno jej później nadpisywać.

## Wprowadzanie odpowiedzi

Na karcie leada dostępna jest akcja **„Dodaj odpowiedź”**. Formularz zawiera:

- treść lub krótkie streszczenie odpowiedzi,
- datę i godzinę otrzymania,
- kanał,
- opcjonalną notatkę i następny krok.

Po zapisaniu odpowiedzi:

- lead otrzymuje status `replied`,
- odpowiedź pojawia się na osi czasu,
- aktywny follow-up zostaje wyczyszczony,
- użytkownik może ustawić nowy termin kolejnego kontaktu.

## Wprowadzanie kolejnego kontaktu

Akcja **„Zapisz wykonany follow-up”** dodaje wpis do historii bez nadpisywania wcześniejszych wiadomości. Wymaga kanału, daty i notatki opisującej, co faktycznie zrobiono.

## Zasady bezpieczeństwa danych

- Historia jest lokalna i nie pobiera automatycznie treści ze skrzynki.
- Nie wysyłamy wiadomości z aplikacji.
- Treści wyświetlamy jako tekst, nigdy jako HTML.
- Usunięcie lub edycja historii nie jest częścią pierwszej wersji — wpisy powinny być zachowywane jako zapis przebiegu kontaktu.

## Kryteria akceptacji

- po potwierdzeniu wysyłki w historii pojawia się pełna treść wiadomości,
- można dodać odpowiedź bez utraty pierwszej wiadomości,
- można dodać kilka follow-upów w kolejności chronologicznej,
- każda pozycja ma datę, kanał i kierunek,
- odpowiedź aktualizuje status i pozwala zaplanować następny krok,
- odświeżenie aplikacji zachowuje całą historię.
