import test from "node:test";
import assert from "node:assert/strict";
import { buildAiLeadPrompt, parseAiLeadText } from "../src/ai-lead.js";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const ID = "33333333-3333-4333-8333-333333333333";

const validAiLead = {
  companyName: "Firma AI",
  website: "https://example.com",
  industry: "Usługi B2B",
  city: "Kraków",
  contact: { name: "Anna", role: "CEO", email: "anna@example.com", linkedinUrl: "", formUrl: "" },
  channel: "email",
  research: {
    summary: "Firma usługowa",
    need: "Rozwija sprzedaż",
    contactReason: "Uruchomiła nową ofertę",
    sources: [{ url: "https://example.com/oferta", note: "Opis nowej oferty" }],
  },
  qualification: { icpFit: true, needIdentified: true, contactSuitable: true, reasonCredible: true },
  draft: { subject: "Krótka rozmowa", body: "Dzień dobry…" },
  notes: "Dane do ręcznego sprawdzenia.",
};

test("prompt zawiera ICP, format i zakaz tworzenia pól systemowych", () => {
  const prompt = buildAiLeadPrompt({ target: "Firmy B2B", need: "Sprzedaż", exclude: "E-commerce" });
  assert.match(prompt, /Firmy B2B/);
  assert.match(prompt, /Zwróć wyłącznie poprawny JSON/);
  assert.match(prompt, /id, statusu ani dat/);
});

test("poprawna odpowiedź AI tworzy nowego leada z polami systemowymi aplikacji", () => {
  const result = parseAiLeadText(JSON.stringify(validAiLead), NOW, ID);
  assert.equal(result.ok, true);
  assert.equal(result.lead.id, ID);
  assert.equal(result.lead.status, "new");
  assert.equal(result.lead.companyName, "Firma AI");
  assert.equal(result.lead.contact.email, "anna@example.com");
  assert.equal(result.lead.createdAt, NOW.toISOString());
});

test("parser przyjmuje cały blok json w ogrodzeniu markdown", () => {
  const result = parseAiLeadText(`\`\`\`json\n${JSON.stringify(validAiLead)}\n\`\`\``, NOW, ID);
  assert.equal(result.ok, true);
});

test("parser odrzuca pola systemowe wygenerowane przez AI", () => {
  const result = parseAiLeadText(JSON.stringify({ ...validAiLead, status: "approved", id: ID }), NOW, ID);
  assert.equal(result.ok, false);
  assert.match(result.error, /pole niedozwolone/);
});

test("parser odrzuca zły kanał i zmyślony protokół URL", () => {
  const result = parseAiLeadText(JSON.stringify({ ...validAiLead, channel: "phone", website: "javascript:alert(1)" }), NOW, ID);
  assert.equal(result.ok, false);
  assert.match(result.error, /nieznany kanał/);
});

test("parser wymaga nazwy firmy i poprawnego JSON", () => {
  assert.equal(parseAiLeadText("to nie json", NOW, ID).ok, false);
  const result = parseAiLeadText(JSON.stringify({ ...validAiLead, companyName: "" }), NOW, ID);
  assert.equal(result.ok, false);
  assert.match(result.error, /nazwa firmy jest wymagana/);
});
