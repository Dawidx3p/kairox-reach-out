import test from "node:test";
import assert from "node:assert/strict";
import { createLead, createWorkspace, editLead, transitionLead, changeIcp } from "../src/domain.js";
import { ensureContactHistory, getContactHistory, validateContactHistory } from "../src/contact-history.js";
import { validateLead } from "../src/validation.js";

const ID = "11111111-1111-4111-8111-111111111111";
const T0 = new Date("2026-10-01T08:00:00.000Z");
const T1 = new Date("2026-10-01T09:00:00.000Z");
const T2 = new Date("2026-10-01T10:00:00.000Z");
const T3 = new Date("2026-10-01T11:00:00.000Z");
const T4 = new Date("2026-10-01T12:00:00.000Z");

function qualifiedLead() {
  let lead = createLead("Firma Testowa", T0, ID);
  lead = transitionLead(lead, "start_research", {}, T0).lead;
  lead = editLead(lead, {
    contact: {
      name: "Anna Nowak",
      role: "CEO",
      email: "anna@example.com",
      linkedinUrl: "https://linkedin.com/in/anna",
      formUrl: "https://example.com/kontakt",
    },
    channel: "email",
    research: {
      summary: "Firma usługowa",
      need: "Lepszy proces pozyskiwania klientów",
      contactReason: "Rozwija nową ofertę",
      sources: [{ url: "https://example.com/o-firmie", note: "Opis działalności" }],
    },
    qualification: { icpFit: true, needIdentified: true, contactSuitable: true, reasonCredible: true },
    draft: { subject: "Krótka rozmowa", body: "Dzień dobry, piszę w sprawie współpracy." },
  }, T0);
  lead = transitionLead(lead, "submit_for_approval", {}, T0).lead;
  return transitionLead(lead, "approve", {}, T0).lead;
}

function sentLead() {
  return transitionLead(qualifiedLead(), "mark_sent", { sentAt: T1.toISOString() }, T1).lead;
}

function byType(lead, type) {
  return lead.contactHistory.filter((event) => event.type === type);
}

test("nowy lead zaczyna z pustą historią kontaktu", () => {
  const lead = createLead("Firma", T0, ID);
  assert.deepEqual(lead.contactHistory, []);
  assert.deepEqual(validateLead(lead), []);
});

test("mark_sent zachowuje dokładny temat, treść, kanał i pełny snapshot odbiorcy", () => {
  const approved = qualifiedLead();
  const result = transitionLead(approved, "mark_sent", { sentAt: T1.toISOString() }, T1);
  assert.equal(result.ok, true);

  const messages = byType(result.lead, "first_message");
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], {
    id: messages[0].id,
    type: "first_message",
    occurredAt: T1.toISOString(),
    recordedAt: T1.toISOString(),
    channel: "email",
    direction: "outbound",
    status: "sent",
    subject: "Krótka rozmowa",
    body: "Dzień dobry, piszę w sprawie współpracy.",
    note: "",
    nextStep: "",
    recipient: approved.contact,
    fromStatus: null,
    source: "recorded",
  });
  assert.match(messages[0].id, /^[0-9a-f-]{36}$/i);
  assert.equal(byType(result.lead, "status_change").some((event) => event.fromStatus === "approved" && event.status === "sent"), true);

  const edited = editLead(result.lead, {
    contact: { ...result.lead.contact, email: "inna@example.com" },
    draft: { subject: "Inny temat", body: "Inna treść" },
  }, T2);
  assert.deepEqual(byType(edited, "first_message")[0], messages[0]);
});

test("odpowiedzi można dopisywać wielokrotnie, a repliedAt wskazuje najpóźniejszą odpowiedź", () => {
  let lead = sentLead();
  lead.followUp = { dueDate: "2026-10-03", note: "Aktywny follow-up" };

  let result = transitionLead(lead, "mark_replied", {
    body: "Proszę wrócić z propozycją w przyszłym tygodniu.",
    channel: "linkedin",
    repliedAt: T2.toISOString(),
    note: "Rozmowa jest otwarta.",
    nextStep: "Przygotować propozycję.",
  }, T2);
  assert.equal(result.ok, true);
  assert.equal(result.lead.status, "replied");
  assert.deepEqual(result.lead.followUp, { dueDate: null, note: "" });
  assert.equal(result.lead.repliedAt, T2.toISOString());
  assert.equal(byType(result.lead, "first_message").length, 1);
  assert.deepEqual(byType(result.lead, "reply")[0], {
    id: byType(result.lead, "reply")[0].id,
    type: "reply",
    occurredAt: T2.toISOString(),
    recordedAt: T2.toISOString(),
    channel: "linkedin",
    direction: "inbound",
    status: "replied",
    subject: "",
    body: "Proszę wrócić z propozycją w przyszłym tygodniu.",
    note: "Rozmowa jest otwarta.",
    nextStep: "Przygotować propozycję.",
    recipient: null,
    fromStatus: null,
    source: "recorded",
  });

  lead = result.lead;
  result = transitionLead(lead, "mark_replied", {
    body: "Termin pasuje.",
    channel: "email",
    repliedAt: T4.toISOString(),
  }, T4);
  assert.equal(result.ok, true);
  assert.equal(byType(result.lead, "reply").length, 2);
  assert.equal(result.lead.repliedAt, T4.toISOString());

  result = transitionLead(result.lead, "mark_replied", {
    body: "Starsza odpowiedź dopisana później.",
    channel: "email",
    repliedAt: T3.toISOString(),
  }, T4);
  assert.equal(result.ok, true);
  assert.equal(byType(result.lead, "reply").length, 3);
  assert.equal(result.lead.repliedAt, T4.toISOString());
});

test("mark_replied wspiera stary payload note-only jako treść i domyślny kanał leada", () => {
  const lead = sentLead();
  const result = transitionLead(lead, "mark_replied", { note: "Jest zainteresowanie", repliedAt: T2.toISOString() }, T2);
  assert.equal(result.ok, true);
  const reply = byType(result.lead, "reply")[0];
  assert.equal(reply.body, "Jest zainteresowanie");
  assert.equal(reply.channel, "email");
});

test("odpowiedź wymaga treści, a follow-up zachowuje limit i chronologię także w historii", () => {
  let lead = sentLead();
  assert.equal(transitionLead(lead, "mark_replied", { body: "  ", repliedAt: T2.toISOString() }, T2).ok, false);
  assert.equal(transitionLead(lead, "mark_replied", { body: "Za wcześnie", repliedAt: T0.toISOString() }, T2).ok, false);

  for (const [index, at] of [T2, T3].entries()) {
    const result = transitionLead(lead, "log_followup", {
      note: `Follow-up ${index + 1}`,
      channel: "email",
      completedAt: at.toISOString(),
    }, at);
    assert.equal(result.ok, true);
    lead = result.lead;
  }
  assert.equal(lead.followUpLog.length, 2);
  assert.deepEqual(byType(lead, "follow_up").map(({ occurredAt, body, channel }) => ({ occurredAt, body, channel })), [
    { occurredAt: T2.toISOString(), body: "", channel: "email" },
    { occurredAt: T3.toISOString(), body: "", channel: "email" },
  ]);
  assert.equal(transitionLead(lead, "log_followup", { note: "Trzeci", channel: "email", completedAt: T4.toISOString() }, T4).ok, false);
  assert.equal(transitionLead(sentLead(), "log_followup", { note: "Za wcześnie", channel: "email", completedAt: T0.toISOString() }, T2).ok, false);
});

test("add_note dopisuje wewnętrzne zdarzenie bez zmiany statusu", () => {
  const lead = sentLead();
  const result = transitionLead(lead, "add_note", {
    note: "Ustalenie po rozmowie zespołu.",
    channel: null,
    occurredAt: T2.toISOString(),
  }, T2);
  assert.equal(result.ok, true);
  assert.equal(result.lead.status, "sent");
  const note = byType(result.lead, "note")[0];
  assert.equal(note.note, "Ustalenie po rozmowie zespołu.");
  assert.equal(note.channel, null);
  assert.equal(note.direction, "internal");
  assert.equal(note.occurredAt, T2.toISOString());
});

test("kolejny krok wymaga notatki i zapisuje oba pola w historii", () => {
  const lead = sentLead();
  const missingNote = transitionLead(lead, "add_note", { nextStep: "Zadzwonić w przyszłym tygodniu" }, T3);
  assert.equal(missingNote.ok, false);
  assert.match(missingNote.error, /Wpisz notatkę/);

  const result = transitionLead(lead, "add_note", {
    note: "Klient poprosił o kontakt w przyszłym tygodniu.",
    nextStep: "Zadzwonić w przyszłym tygodniu",
  }, T3);
  assert.equal(result.ok, true);
  const entry = byType(result.lead, "note").at(-1);
  assert.equal(entry.note, "Klient poprosił o kontakt w przyszłym tygodniu.");
  assert.equal(entry.nextStep, "Zadzwonić w przyszłym tygodniu");
  assert.equal(entry.direction, "internal");
  assert.deepEqual(validateContactHistory(result.lead), []);
});

test("zmiany statusu są rejestrowane także po cofnięciu akceptacji i zmianie ICP", () => {
  const approved = qualifiedLead();
  const edited = editLead(approved, { draft: { ...approved.draft, body: "Zmieniona treść" } }, T1);
  assert.equal(edited.status, "research");
  assert.equal(byType(edited, "status_change").some((event) => event.fromStatus === "approved" && event.status === "research"), true);

  const workspace = createWorkspace(T0);
  workspace.leads = [approved];
  const changed = changeIcp(workspace, { target: "Nowy ICP", need: "Potrzeba", exclude: "Brak" }, T1);
  assert.equal(changed.leads[0].status, "research");
  assert.equal(byType(changed.leads[0], "status_change").some((event) => event.fromStatus === "approved" && event.status === "research"), true);
});

test("legacy projection jest deterministyczna i nie mutuje wejścia", () => {
  const legacy = createLead("Stary lead", T0, ID);
  delete legacy.contactHistory;
  legacy.status = "rejected";
  legacy.channel = "email";
  legacy.contact = { name: "Jan", role: "CEO", email: "jan@example.com", linkedinUrl: "", formUrl: "" };
  legacy.draft = { subject: "Temat", body: "Pierwsza wiadomość" };
  legacy.approvedAt = T0.toISOString();
  legacy.sentAt = T1.toISOString();
  legacy.repliedAt = T4.toISOString();
  legacy.followUpLog = [
    { completedAt: T2.toISOString(), channel: "email", note: "Pierwszy follow-up" },
    { completedAt: T3.toISOString(), channel: "linkedin", note: "Drugi follow-up" },
  ];
  legacy.notes = "Stara notatka";
  legacy.rejectionReason = "Brak budżetu";
  const before = structuredClone(legacy);

  const first = getContactHistory(legacy);
  const second = getContactHistory(legacy);
  assert.deepEqual(first, second);
  assert.deepEqual(legacy, before);
  assert.equal(first.every((event) => event.id.startsWith("legacy-")), true);
  assert.equal(first.every((event) => event.source === "legacy"), true);
  assert.equal(first.some((event) => event.type === "first_message" && event.body === "Pierwsza wiadomość"), true);
  assert.equal(first.filter((event) => event.type === "follow_up").length, 2);
  assert.equal(first.some((event) => event.type === "note" && event.note === "Stara notatka"), true);
  assert.equal(first.some((event) => event.type === "reply" && event.body.includes("nie była przechowywana oddzielnie")), true);
  assert.equal(first.some((event) => event.status === "rejected" && event.note === "Brak budżetu"), true);
});

test("ensureContactHistory zwraca klon i materializuje legacy dokładnie raz", () => {
  const legacy = sentLead();
  delete legacy.contactHistory;
  const before = structuredClone(legacy);
  const ensured = ensureContactHistory(legacy);
  assert.notEqual(ensured, legacy);
  assert.deepEqual(legacy, before);
  assert.ok(ensured.contactHistory.length > 0);
  assert.deepEqual(ensureContactHistory(ensured).contactHistory, ensured.contactHistory);

  const explicit = { ...legacy, contactHistory: [] };
  assert.deepEqual(getContactHistory(explicit), []);
});

test("walidacja historii akceptuje brak pola w legacy i raportuje błędne typy bez wyjątku", () => {
  const legacy = createLead("Legacy", T0, ID);
  delete legacy.contactHistory;
  assert.deepEqual(validateLead(legacy), []);

  for (const malformed of [null, {}, "tekst", [null]]) {
    assert.doesNotThrow(() => validateContactHistory({ ...legacy, contactHistory: malformed }));
    assert.ok(validateContactHistory({ ...legacy, contactHistory: malformed }).length > 0);
  }
});

test("walidacja historii sprawdza unikalność, enumy, ISO, kanały komunikacji i pełnego odbiorcę", () => {
  const lead = sentLead();
  const message = byType(lead, "first_message")[0];
  const invalid = [
    message,
    { ...message },
    {
      ...message,
      id: "22222222-2222-4222-8222-222222222222",
      type: "unknown",
      occurredAt: "wczoraj",
      recordedAt: "jutro",
      channel: "unknown",
      direction: "sideways",
      status: "unknown",
      recipient: { name: "bez pozostałych pól" },
      fromStatus: "unknown",
      source: "unknown",
    },
  ];
  const errors = validateContactHistory({ ...lead, contactHistory: invalid });
  assert.ok(errors.length >= 8);
  assert.match(errors.join("\n"), /unikal|powtór|id/i);
  assert.match(errors.join("\n"), /occurredAt|recordedAt/);
  assert.match(errors.join("\n"), /channel|kanał/i);
  assert.match(errors.join("\n"), /recipient|odbior/i);
});
