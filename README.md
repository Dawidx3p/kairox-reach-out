# KAIROX Reach Out

Projekt dotyczący przygotowania i organizacji działań reach out dla firmy KAIROX.

Lokalne MVP jest zaimplementowane. Szczegółowe decyzje opisuje [SPECYFIKACJA_MVP.md](SPECYFIKACJA_MVP.md).

## Cel

Przygotowywanie uporządkowanych, trafnych i personalizowanych działań reach out dla KAIROX — od wyboru właściwych firm, przez research, po gotowe wiadomości do ręcznej akceptacji.

## Zakres pierwszej wersji (MVP)

- zdefiniowanie profilu idealnego klienta (ICP),
- lista potencjalnych firm i podstawowe dane researchowe,
- kwalifikacja kontaktów według prostych kryteriów,
- przygotowywanie personalizowanych szkiców wiadomości,
- rejestr statusów leada: **Nowy** (`new`), **Do researchu** (`research`), **Szkic gotowy** (`draft_ready`), **Zaakceptowany** (`approved`), **Wysłany** (`sent`), **Odpowiedź** (`replied`), **Odrzucony** (`rejected`),
- historia kontaktu leada na jednej osi czasu: pierwsza wiadomość, follow-upy, odpowiedzi, notatki i zmiany statusu,
- automatyczny termin pierwszego follow-upu po 3 dniach roboczych oraz drugiego w oknie 5–7 dni roboczych,
- limit dwóch follow-upów i oznaczenie leadów wymagających zamknięcia albo odłożenia,
- ręczna akceptacja każdej wiadomości przed wysyłką.

## Proponowane kanały

- e-mail,
- LinkedIn,
- formularz kontaktowy — tylko gdy pasuje do danej firmy.

Kanał i treść dobieramy do odbiorcy. Nie wysyłamy masowych, identycznych wiadomości.

## Workflow

1. Wybór firmy zgodnej z ICP.
2. Research firmy i osoby kontaktowej.
3. Ocena, czy KAIROX ma realny powód do kontaktu.
4. Przygotowanie krótkiej, spersonalizowanej wiadomości.
5. Akceptacja przez użytkownika.
6. Ręczne wysłanie.
7. Zapisanie statusu i ewentualnego terminu follow-upu.

Kwalifikacja jest checklistą, a „Do akceptacji” jest filtrem leadów ze statusem `draft_ready`. Follow-up oznacza datę lub notatkę i filtr, nie osobny status.

## Zasady zarządzania leadami

- Po pierwszej wysyłce ustawiamy follow-up na **3 dni robocze**.
- Jeśli nie ma odpowiedzi, wykonujemy drugi follow-up po kolejnych **5–7 dniach roboczych**.
- Po dwóch bezskutecznych follow-upach nie ponawiamy kontaktu w tej samej sekwencji; lead odkładamy albo zamykamy z notatką.
- Każdy follow-up musi wnosić nowy kontekst, informację lub konkretny powód kontaktu — nie wysyłamy pustego „czy wiadomość dotarła?”.
- Odpowiedź, odmowę, brak dopasowania i prośbę o kontakt później zapisujemy w historii leada.
- Prośbę o kontakt w późniejszym terminie zamieniamy na konkretną datę, zamiast ponawiać ją według standardowej sekwencji.
- Follow-upy są ręczne i wymagają sprawdzenia kontekstu przed wysłaniem.
- Historia kontaktu jest nieedytowalnym, tekstowym zapisem przebiegu. Odpowiedź można dodać wielokrotnie po `sent` lub `replied`; każda odpowiedź tworzy nowy wpis, ustawia `replied`, czyści aktywny follow-up i aktualizuje `repliedAt`.

## Historia kontaktu

Opcjonalne `Lead.contactHistory[]` działa przy `schemaVersion: 1`. Brak pola w starszym leadzie jest czytelny: UI pokazuje odtworzoną projekcję istniejących `sentAt` i draft/contact, `followUpLog`, `repliedAt`, `notes` oraz `rejectionReason` ze źródłem `legacy`, bez zgadywania treści odpowiedzi ani dokładnych dat notatek. Projekcja utrwala się przy kolejnym zapisie leada z backupem; `GET` nie nadpisuje bazy.

Historia jest jedną osią czasu na karcie, od najnowszych zdarzeń, bez edycji/usuwania wpisów i bez HTML. Snapshot wysłania zachowuje pełny temat, body, odbiorcę i kanał niezależnie od późniejszych notatek. Odpowiedź może być dodana wielokrotnie dla `sent`/`replied`, każda tworzy nowy wpis inbound, ustawia `replied`, czyści follow-up i aktualizuje `repliedAt`. Limit dwóch follow-upów oraz harmonogram 3 dni, potem 5–7 dni roboczych pozostają bez zmian.

## Poza zakresem pierwszej wersji

- automatyczne wysyłanie wiadomości,
- masowe kampanie i spam,
- pobieranie kontaktów bez ustalenia źródła i zasad legalnego użycia,
- przechowywanie haseł, tokenów i kluczy API w repozytorium,
- automatyczne podejmowanie decyzji o wysyłce,
- logowanie, usługi AI, integracje i automatyczny research.

Aplikacja może przyjąć pojedynczego leada przygotowanego przez zewnętrzne AI, ale sama nie wysyła do niego danych i nie przechowuje kluczy API.

## Kryterium gotowości MVP

Projekt powinien umożliwiać przygotowanie kompletnej listy kontaktów, zrozumienie powodu kontaktu, stworzenie szkicu wiadomości i ręczne zatwierdzenie go przed wysyłką.

Zakres techniczny lokalnego MVP to HTML/CSS/vanilla JavaScript w modułach ES oraz jeden serwer Node HTTP używany do aplikacji i API. Vite działa jako middleware tego samego procesu w trybie deweloperskim, a build jest serwowany przez Node. Dane są przechowywane w pliku `data/workspace.json`, z importem i eksportem JSON. Widoki obejmują listę firm (z filtrami „Do akceptacji” i „Follow-up”), kartę firmy oraz Ustawienia z ICP i kopią JSON. Jeden lead to jedna firma, jedna osoba kontaktowa i jeden szkic pierwszej wiadomości. Edycja zatwierdzonej treści, odbiorcy lub kanału unieważnia akceptację. Kopiowanie szkicu nie oznacza wysłania; status „Wysłany” ustawia się dopiero po osobnym ręcznym potwierdzeniu wysyłki wykonanej poza aplikacją, a wysłany szkic jest tylko do odczytu.

## Szybki grafik pracy

Zamiast rozciągać jeden kontakt na cały tydzień, pracujemy krótkimi cyklami tego samego dnia:

- **Blok 1 — 30–45 min:** znaleźć i zakwalifikować kilka firm.
- **Blok 2 — 30–45 min:** zrobić research i przygotować personalizowane szkice.
- **Blok 3 — 15 min:** wspólnie przejrzeć i zatwierdzić wiadomości.
- **Blok 4 — 15–30 min:** ręcznie wysłać zaakceptowane wiadomości i zapisać statusy.
- **Blok 5 — 10 min dziennie:** sprawdzić odpowiedzi i ustawić follow-upy.

Cel operacyjny: pierwsze gotowe kontakty jeszcze tego samego dnia, bez czekania do kolejnego tygodnia. Tempo zwiększamy przez krótkie bloki i gotowe szablony, ale każda wiadomość nadal wymaga ręcznej akceptacji.

Na tym etapie nie tworzymy automatycznych wysyłek. Przypomnienia można dodać później, gdy ustalimy konkretne godziny i strefę czasową.

## Status

Lokalne MVP jest zaimplementowane. Nie zawiera kontaktów produkcyjnych, sekretów ani funkcji wysyłania wiadomości.

## Uruchomienie lokalne

Wymagany jest Node.js zgodny z wymaganiami zapisanej wersji Vite (projekt był sprawdzany na Node 22.12.0).

```bash
npm install
npm run dev
```

Aplikacja działa pod stałym adresem `http://127.0.0.1:5173`; `npm run dev` uruchamia `node server/start.js --dev`. Jest to jeden proces Node obsługujący UI i `GET/PUT /api/workspace`; nie uruchamiaj drugiego procesu ani nie edytuj pliku podczas pracy. Dane są zapisane w `data/workspace.json` (katalog i pliki mają ograniczone uprawnienia). Uruchamianie pliku `index.html` bez serwera nie jest wspierane.

Pozostałe polecenia:

```bash
npm test
npm run build
npm start
npm run preview
```

`npm start` albo `npm run preview` (uruchamiaj jedną z tych komend, nie obie naraz) serwuje build oraz API przez Node na tym samym stałym porcie. `data/**` nie jest śledzone przez Git ani serwowane HTTP.

## Migracja starej bazy

Przy pierwszym uruchomieniu aplikacja może wykryć nieaktywną kopię pod kluczem `localStorage` `kairox-reach-out:v1`. Migracja wymaga świadomego potwierdzenia i jest proponowana tylko wtedy, gdy plikowa baza nie ma leadów, ma pusty ICP i nie zawiera dodatkowych nieznanych pól. Jeżeli stary klucz pochodzi z innego originu lub profilu przeglądarki, otwórz stary origin/profil, wykonaj ręczny eksport JSON, a następnie zaimportuj plik pod `http://127.0.0.1:5173`. Niepusta baza plikowa nie jest scalana: zachowaj starą bazę przez pobranie kopii.

## Kopie i odzyskiwanie

Przed zastąpieniem pliku aplikacja tworzy kopię w `data/backups/`; kopie nie są automatycznie usuwane. Jeśli baza jest uszkodzona, zatrzymaj serwer, zachowaj uszkodzony `data/workspace.json`, wybierz poprawną kopię z `data/backups/` i ręcznie zastąp nią plik, a potem uruchom jedną instancję ponownie. Po błędzie zapisu nie wykonuj automatycznego retry: pobierz niezapisane dane i odczytaj bazę ponownie.

## Zaimplementowany zakres

- lista firm, wyszukiwanie i filtry statusu, akceptacji oraz follow-upów,
- kontekstowe szybkie akcje na każdym wierszu, bez automatycznej wysyłki wiadomości,
- generator edytowalnego promptu dla zewnętrznego AI na podstawie danych leada i pełnej historii kontaktu, kopiowany ręcznie bez integracji,
- kopiowanie pełnego kontekstu klienta wraz z czytelną, chronologiczną historią kontaktu jednym przyciskiem,
- jednorazowy, nieblokujący panel informujący po otwarciu listy o dzisiejszych i zaległych follow-upach,
- dodawanie leada z jednego pola JSON przygotowanego przez AI oraz generator bezpiecznej instrukcji,
- jedna karta firmy z researchem, źródłami, kwalifikacją i szkicem,
- kontrolowane przejścia siedmiu statusów,
- ręczna akceptacja i jej unieważnianie po istotnej edycji,
- potwierdzenie wysłania bez wykonywania wysyłki,
- automatyczne terminy sekwencji, rejestr odpowiedzi i maksymalnie dwóch wykonanych follow-upów,
- nieedytowalna historia kontaktu z projekcją starszych leadów i jawnym zapisem odpowiedzi/notatek,
- ustawienia ICP z ponowną oceną niewysłanych kontaktów,
- pełny import i eksport JSON,
- plikowa baza z ETag/If-Match, kolejką zapisów, kopiami zapasowymi i ochroną przed nadpisaniem uszkodzonego zapisu,
- migracja starego klucza `localStorage` tylko po świadomym potwierdzeniu,
- testy logiki domenowej i walidacji importu.

Szczegółowe reguły pozostają opisane w `SPECYFIKACJA_MVP.md`.

Instrukcja przygotowania danych i pracy z AI znajduje się w [INSTRUKCJA_AI_LEAD.md](INSTRUKCJA_AI_LEAD.md).
