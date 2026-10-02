# Plan MVP — KAIROX Reach Out

Dokument opisuje zaimplementowane lokalne MVP. Szczegółowa specyfikacja znajduje się w [SPECYFIKACJA_MVP.md](SPECYFIKACJA_MVP.md).

## Cel

Skrócić drogę od znalezienia firmy do zaakceptowanego szkicu wiadomości, bez automatycznej wysyłki.

## Elementy MVP

1. **Baza leadów** — lista firm, jednej osoby kontaktowej na firmę, źródeł, statusów i terminów follow-upu.
2. **Karta researchu** — opis firmy, potencjalna potrzeba, powód kontaktu i źródła informacji.
3. **Kwalifikacja** — proste kryteria: dopasowanie do ICP, możliwa potrzeba, właściwa osoba i wiarygodny powód kontaktu.
4. **Szkic wiadomości** — jeden krótki, personalizowany szkic pierwszej wiadomości przypisany do konkretnego leada.
5. **Akceptacja** — wyraźny etap ręcznego zatwierdzenia przed wysyłką.
6. **Follow-up** — ręcznie rejestrowana data i notatka oraz filtr; nie jest osobnym statusem.

## Minimalny przepływ

`Nowy (new) → Do researchu (research) → Szkic gotowy (draft_ready) → Zaakceptowany (approved) → Wysłany (sent) → Odpowiedź (replied)`

Dozwolony jest również status **Odrzucony** (`rejected`). Kwalifikacja jest checklistą, a „Do akceptacji” filtrem statusu `draft_ready`.

## Kryteria ukończenia

- można dodać leada i uzupełnić jego research,
- można ocenić dopasowanie leada,
- można przygotować i zapisać szkic wiadomości,
- wiadomość nie jest wysyłana bez ręcznej akceptacji,
- każdy lead ma aktualny status i następny krok,
- projekt nie zawiera sekretów ani automatycznej wysyłki,
- dane są utrwalane w pliku i pozostają po odświeżeniu strony,
- eksportowany JSON można ponownie zaimportować bez utraty danych,
- obowiązuje dokładnie ustalony zestaw statusów,
- edycja zatwierdzonej treści, odbiorcy lub kanału unieważnia akceptację.

## Przekazanie do implementacji

Stack MVP to HTML/CSS/vanilla JavaScript (moduły ES) oraz jeden serwer Node HTTP. Vite działa jako middleware tego samego procesu w trybie deweloperskim; `npm run build`, `npm start` i `npm run preview` obsługują build oraz API przez Node na `127.0.0.1:5173`. Dane są przechowywane w pliku `data/workspace.json` i obsługują import/eksport JSON. Bez logowania, chmury, usług AI, integracji, automatycznego researchu i automatycznej wysyłki.

Plan implementacji: Sol realizuje implementację w ustalonej architekturze, Luna dokumentację i proste zmiany wyglądowe, a Astra przegląda kluczową logikę.
