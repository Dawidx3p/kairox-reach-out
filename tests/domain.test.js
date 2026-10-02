import test from "node:test";
import assert from "node:assert/strict";
import { addBusinessDays, countDueFollowUps, countOverdueFollowUps, createWorkspace, createLead, editLead, transitionLead, changeIcp, isFollowUpDue, needsCloseOrDefer, sortLeadsByNextStep } from "../src/domain.js";
import { nextStep } from "../src/statuses.js";

const T0 = new Date("2026-10-02T10:00:00.000Z");
const ID = "11111111-1111-4111-8111-111111111111";

function qualifiedLead() {
  let lead = createLead("Dobra Firma", T0, ID);
  lead = transitionLead(lead, "start_research", {}, T0).lead;
  lead = editLead(lead, {
    contact: { name: "Anna", role: "CEO", email: "anna@example.com", linkedinUrl: "", formUrl: "" },
    channel: "email",
    research: {
      summary: "Firma usługowa",
      need: "Potrzebuje lepszego procesu pozyskiwania klientów",
      contactReason: "Rozwija nową ofertę",
      sources: [{ url: "https://example.com/o-firmie", note: "Opis działalności" }],
    },
    qualification: { icpFit: true, needIdentified: true, contactSuitable: true, reasonCredible: true },
    draft: { subject: "Krótka rozmowa", body: "Dzień dobry, piszę w sprawie…" },
  }, T0);
  return lead;
}

test("nowy lead zawiera kompletny model danych", () => {
  const lead = createLead("  Firma  ", T0, ID);
  assert.equal(lead.companyName, "Firma");
  assert.equal(lead.status, "new");
  assert.equal(lead.qualification.icpFit, null);
  assert.deepEqual(lead.followUpLog, []);
});

test("pełny szkic przechodzi przez research, akceptację i wysłanie", () => {
  let lead = qualifiedLead();
  let result = transitionLead(lead, "submit_for_approval", {}, T0);
  assert.equal(result.ok, true);
  assert.equal(result.lead.status, "draft_ready");
  lead = result.lead;

  result = transitionLead(lead, "approve", {}, new Date("2026-10-02T10:10:00.000Z"));
  assert.equal(result.lead.status, "approved");
  assert.equal(result.lead.approvedAt, "2026-10-02T10:10:00.000Z");
  lead = result.lead;

  result = transitionLead(lead, "mark_sent", { sentAt: "2026-10-02T10:15:00.000Z" }, new Date("2026-10-02T10:15:00.000Z"));
  assert.equal(result.ok, true);
  assert.equal(result.lead.status, "sent");
  assert.equal(result.lead.sentAt, "2026-10-02T10:15:00.000Z");
  assert.equal(result.lead.followUp.dueDate, "2026-10-07");
  assert.match(result.lead.followUp.note, /3 dniach roboczych/);
});

test("dni robocze pomijają sobotę i niedzielę", () => {
  assert.equal(addBusinessDays(new Date(2026, 9, 2), 3), "2026-10-07");
});

test("pierwszy follow-up ustawia okno 5–7 dni roboczych, a drugi wymaga decyzji", () => {
  let lead = transitionLead(qualifiedLead(), "submit_for_approval", {}, T0).lead;
  lead = transitionLead(lead, "approve", {}, T0).lead;
  lead = transitionLead(lead, "mark_sent", { sentAt: T0.toISOString() }, T0).lead;

  let result = transitionLead(lead, "log_followup", {
    note: "Dodałem nowy kontekst.",
    channel: "email",
    completedAt: "2026-10-07T10:00:00.000Z",
  }, new Date("2026-10-07T10:00:00.000Z"));
  assert.equal(result.ok, true);
  assert.equal(result.lead.followUp.dueDate, "2026-10-14");
  assert.match(result.lead.followUp.note, /2026-10-14–2026-10-16/);
  lead = result.lead;

  result = transitionLead(lead, "log_followup", {
    note: "Ostatni kontakt w tej sekwencji.",
    channel: "email",
    completedAt: "2026-10-14T10:00:00.000Z",
  }, new Date("2026-10-14T10:00:00.000Z"));
  assert.equal(result.ok, true);
  assert.equal(result.lead.followUp.dueDate, null);
  assert.equal(needsCloseOrDefer(result.lead), true);
  assert.equal(nextStep(result.lead, "2026-10-14"), "Wymaga decyzji: zamknij lub odłóż");
  lead = result.lead;

  result = transitionLead(lead, "log_followup", {
    note: "Trzeci kontakt.",
    channel: "email",
    completedAt: "2026-10-15T10:00:00.000Z",
  }, new Date("2026-10-15T10:00:00.000Z"));
  assert.equal(result.ok, false);
  assert.match(result.error, /Limit dwóch follow-upów/);
  assert.equal(result.lead.followUpLog.length, 2);
});

test("niekompletny szkic nie trafia do akceptacji", () => {
  const lead = transitionLead(createLead("Firma", T0, ID), "start_research", {}, T0).lead;
  const result = transitionLead(lead, "submit_for_approval", {}, T0);
  assert.equal(result.ok, false);
  assert.match(result.error, /kryteriach kwalifikacji/);
  assert.equal(result.lead.status, "research");
});

test("edycja zatwierdzonej treści unieważnia akceptację", () => {
  let lead = transitionLead(qualifiedLead(), "submit_for_approval", {}, T0).lead;
  lead = transitionLead(lead, "approve", {}, T0).lead;
  lead = editLead(lead, { draft: { ...lead.draft, body: "Nowa treść" } }, new Date("2026-10-02T10:05:00.000Z"));
  assert.equal(lead.status, "research");
  assert.equal(lead.approvedAt, null);
});

test("po wysłaniu treść i odbiorca są zablokowane, ale notatki pozostają edytowalne", () => {
  let lead = transitionLead(qualifiedLead(), "submit_for_approval", {}, T0).lead;
  lead = transitionLead(lead, "approve", {}, T0).lead;
  lead = transitionLead(lead, "mark_sent", { sentAt: T0.toISOString() }, T0).lead;
  const edited = editLead(lead, {
    contact: { ...lead.contact, email: "inna@example.com" },
    draft: { ...lead.draft, body: "Podmieniona treść" },
    notes: "Nowa notatka",
  }, T0);
  assert.equal(edited.contact.email, "anna@example.com");
  assert.equal(edited.draft.body, lead.draft.body);
  assert.equal(edited.notes, "Nowa notatka");
});

test("odpowiedź wymaga chronologii i czyści follow-up", () => {
  let lead = transitionLead(qualifiedLead(), "submit_for_approval", {}, T0).lead;
  lead = transitionLead(lead, "approve", {}, T0).lead;
  lead = transitionLead(lead, "mark_sent", { sentAt: T0.toISOString() }, T0).lead;
  lead.followUp = { dueDate: "2026-10-03", note: "Przypomnieć się" };
  const bad = transitionLead(lead, "mark_replied", { note: "Odpowiedź", repliedAt: "2026-10-02T09:00:00.000Z" }, T0);
  assert.equal(bad.ok, false);
  const good = transitionLead(lead, "mark_replied", { note: "Jest zainteresowanie", repliedAt: T0.toISOString() }, T0);
  assert.equal(good.lead.status, "replied");
  assert.equal(good.lead.followUp.dueDate, null);
  assert.match(good.lead.notes, /Jest zainteresowanie/);
});

test("lista pokazuje zapisany kolejny krok zamiast domyślnej podpowiedzi statusu", () => {
  let lead = transitionLead(qualifiedLead(), "submit_for_approval", {}, T0).lead;
  lead = transitionLead(lead, "approve", {}, T0).lead;
  lead = transitionLead(lead, "mark_sent", { sentAt: T0.toISOString() }, T0).lead;
  lead = transitionLead(lead, "mark_replied", {
    body: "Proszę wrócić z propozycją terminu.",
    channel: "email",
    repliedAt: T0.toISOString(),
  }, T0).lead;
  lead = transitionLead(lead, "add_note", {
    note: "Klient poprosił o propozycję terminu.",
    nextStep: "Zaproponować rozmowę w przyszły wtorek",
  }, T0).lead;

  assert.equal(nextStep(lead, "2026-10-02"), "Zaproponować rozmowę w przyszły wtorek");
});

test("zmiana ICP cofa niewysłaną akceptację, ale nie rusza wysłanej historii", () => {
  const workspace = createWorkspace(T0);
  let approved = transitionLead(qualifiedLead(), "submit_for_approval", {}, T0).lead;
  approved = transitionLead(approved, "approve", {}, T0).lead;
  let sent = structuredClone(approved);
  sent.id = "22222222-2222-4222-8222-222222222222";
  sent = transitionLead(sent, "mark_sent", { sentAt: T0.toISOString() }, T0).lead;
  workspace.leads = [approved, sent];
  const changed = changeIcp(workspace, { target: "Nowy ICP", need: "Potrzeba", exclude: "Brak" }, T0);
  assert.equal(changed.leads[0].status, "research");
  assert.equal(changed.leads[0].qualification.icpFit, null);
  assert.equal(changed.leads[1].status, "sent");
  assert.equal(changed.leads[1].qualification.icpFit, true);
});

test("follow-up jest wymagalny dziś lub po terminie tylko po wysłaniu", () => {
  const lead = qualifiedLead();
  lead.status = "sent";
  lead.followUp.dueDate = "2026-10-02";
  assert.equal(isFollowUpDue(lead, "2026-10-02"), true);
  lead.status = "research";
  assert.equal(isFollowUpDue(lead, "2026-10-03"), false);
});

test("licznik obejmuje tylko dzisiejsze i zaległe aktywne follow-upy", () => {
  const base = qualifiedLead();
  const lead = (id, status, dueDate) => ({
    ...structuredClone(base),
    id,
    status,
    followUp: { dueDate, note: "" },
  });
  const leads = [
    lead("11111111-1111-4111-8111-111111111111", "sent", "2026-10-01"),
    lead("22222222-2222-4222-8222-222222222222", "replied", "2026-10-02"),
    lead("33333333-3333-4333-8333-333333333333", "sent", "2026-10-03"),
    lead("44444444-4444-4444-8444-444444444444", "rejected", "2026-10-01"),
    lead("55555555-5555-4555-8555-555555555555", "sent", null),
  ];
  assert.equal(countDueFollowUps(leads, "2026-10-02"), 2);
  assert.equal(countOverdueFollowUps(leads, "2026-10-02"), 1);
});

test("leady są sortowane: zaległe, dzisiejsze, przyszłe i bez terminu", () => {
  const lead = (id, dueDate, updatedAt = "2026-10-01T10:00:00.000Z", status = "sent") => ({
    id,
    status,
    updatedAt,
    followUp: { dueDate, note: "" },
  });
  const leads = [
    lead("bez-starszy", null, "2026-10-01T10:00:00.000Z"),
    lead("przyszly-pozniejszy", "2026-10-07"),
    lead("dzis", "2026-10-03"),
    lead("zalegly-nowszy", "2026-10-02"),
    lead("bez-nowszy", null, "2026-10-02T10:00:00.000Z"),
    lead("przyszly-blizszy", "2026-10-04"),
    lead("zalegly-starszy", "2026-10-01"),
    lead("nieaktywny-termin", "2026-09-30", "2026-10-03T10:00:00.000Z", "rejected"),
  ];
  assert.deepEqual(
    sortLeadsByNextStep(leads, "2026-10-03").map(({ id }) => id),
    ["zalegly-starszy", "zalegly-nowszy", "dzis", "przyszly-blizszy", "przyszly-pozniejszy", "nieaktywny-termin", "bez-nowszy", "bez-starszy"],
  );
  assert.deepEqual(leads.map(({ id }) => id), ["bez-starszy", "przyszly-pozniejszy", "dzis", "zalegly-nowszy", "bez-nowszy", "przyszly-blizszy", "zalegly-starszy", "nieaktywny-termin"]);
});
