import test from "node:test";
import assert from "node:assert/strict";
import { buildContactHistoryText } from "../src/contact-history-text.js";
import { createLead, editLead, transitionLead } from "../src/domain.js";

const T0 = new Date("2026-10-02T10:00:00.000Z");
const T1 = new Date("2026-10-02T11:00:00.000Z");
const ID = "11111111-1111-4111-8111-111111111111";

function repliedLead() {
  let lead = createLead("Firma Testowa", T0, ID);
  lead = transitionLead(lead, "start_research", {}, T0).lead;
  lead = editLead(lead, {
    website: "https://example.com",
    industry: "Usługi B2B",
    city: "Kraków",
    contact: { name: "Anna", role: "CEO", email: "anna@example.com", linkedinUrl: "", formUrl: "" },
    channel: "email",
    research: { summary: "Firma usługowa", need: "Nowe zapytania", contactReason: "Rozwija ofertę", sources: [{ url: "https://example.com", note: "Strona firmy" }] },
    qualification: { icpFit: true, needIdentified: true, contactSuitable: true, reasonCredible: true },
    draft: { subject: "Krótka rozmowa", body: "Pierwsza wiadomość" },
    notes: "Klient preferuje kontakt e-mailowy.",
  }, T0);
  lead = transitionLead(lead, "submit_for_approval", {}, T0).lead;
  lead = transitionLead(lead, "approve", {}, T0).lead;
  lead = transitionLead(lead, "mark_sent", { sentAt: T0.toISOString() }, T0).lead;
  return transitionLead(lead, "mark_replied", {
    body: "Proszę wrócić do tematu w listopadzie.",
    note: "Nie kontaktować się wcześniej.",
    nextStep: "Kontakt 3 listopada",
    channel: "email",
    repliedAt: T1.toISOString(),
  }, T1).lead;
}

test("tekst historii jest czytelny, kompletny i chronologiczny", () => {
  const text = buildContactHistoryText(repliedLead());
  assert.match(text, /Kontekst klienta i historia kontaktu — Firma Testowa/);
  assert.match(text, /Strona: https:\/\/example.com/);
  assert.match(text, /Branża: Usługi B2B/);
  assert.match(text, /Osoba: Anna/);
  assert.match(text, /Rola: CEO/);
  assert.match(text, /E-mail: anna@example.com/);
  assert.match(text, /Podsumowanie: Firma usługowa/);
  assert.match(text, /Zidentyfikowana potrzeba: Nowe zapytania/);
  assert.match(text, /https:\/\/example.com — Strona firmy/);
  assert.match(text, /Dopasowanie do ICP: Tak/);
  assert.match(text, /Klient preferuje kontakt e-mailowy/);
  assert.match(text, /Wykonane: 0 z 2/);
  assert.match(text, /2026-10-02 12:00 — Pierwsza wiadomość/);
  assert.match(text, /2026-10-02 13:00 — Odpowiedź/);
  assert.match(text, /Temat: Krótka rozmowa/);
  assert.match(text, /Treść: Proszę wrócić do tematu w listopadzie/);
  assert.match(text, /Notatka: Nie kontaktować się wcześniej/);
  assert.match(text, /Następny krok: Kontakt 3 listopada/);
  assert.ok(text.indexOf("Pierwsza wiadomość") < text.indexOf("Proszę wrócić do tematu"));
});

test("pusta historia jest opisana wprost", () => {
  assert.match(buildContactHistoryText(createLead("Nowa Firma", T0, ID)), /Brak zapisanej historii kontaktu/);
});
