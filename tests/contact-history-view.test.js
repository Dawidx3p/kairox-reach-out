import test from "node:test";
import assert from "node:assert/strict";
import { createLead, transitionLead } from "../src/domain.js";
import { renderContactHistory } from "../src/views/contact-history.js";

test("oś czasu sortuje według daty wydarzenia i wyświetla treści jako tekst", () => {
  let lead = createLead("Firma", new Date("2026-10-01T08:00:00Z"));
  lead = transitionLead(lead, "add_note", { note: "Nowsza <img src=x onerror=alert(1)>" }, new Date("2026-10-01T10:00:00Z")).lead;
  lead = transitionLead(lead, "add_note", { note: "Starsza", occurredAt: "2026-10-01T09:00:00.000Z" }, new Date("2026-10-01T11:00:00Z")).lead;
  const html = renderContactHistory(lead);
  assert.ok(html.indexOf("Nowsza") < html.indexOf("Starsza"));
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;img/);
  assert.match(html, /Wewnętrzne/);
  assert.match(html, /Nie dotyczy/);
  assert.match(html, /2026-10-01 \d{2}:\d{2}/);
});

test("widok odróżnia wpisy odtworzone ze starej bazy", () => {
  const lead = createLead("Firma");
  delete lead.contactHistory;
  lead.notes = "Dawna notatka";
  assert.match(renderContactHistory(lead), /Odtworzone ze starszych danych/);
});
