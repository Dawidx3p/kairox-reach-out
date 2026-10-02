import { ensureContactHistory, appendContactEvent, appendStatusChange } from "./contact-history.js";
const CHANNELS = ["email", "linkedin", "contact_form"];
const EDITABLE_BEFORE_SEND = ["contact", "channel", "research", "qualification", "draft"];
export const MAX_FOLLOW_UPS = 2;

const clone = (value) => structuredClone(value);
const nowIso = (now) => (now instanceof Date ? now : new Date(now)).toISOString();

const localDate = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const toDateOnly = (date) => {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function addBusinessDays(value, numberOfDays) {
  const date = localDate(value);
  let remaining = numberOfDays;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    if (![0, 6].includes(date.getDay())) remaining -= 1;
  }
  return toDateOnly(date);
}

export function needsCloseOrDefer(lead) {
  return lead.status === "sent" && !lead.repliedAt && lead.followUpLog.length >= MAX_FOLLOW_UPS;
}

export function createWorkspace(now = new Date()) {
  return {
    schemaVersion: 1,
    updatedAt: nowIso(now),
    settings: { icp: { target: "", need: "", exclude: "" } },
    leads: [],
  };
}

export function createLead(companyName, now = new Date(), id = crypto.randomUUID()) {
  const stamp = nowIso(now);
  return {
    id,
    companyName: companyName.trim(),
    website: "",
    industry: "",
    city: "",
    contact: { name: "", role: "", email: "", linkedinUrl: "", formUrl: "" },
    channel: null,
    status: "new",
    research: { summary: "", need: "", contactReason: "", sources: [] },
    qualification: {
      icpFit: null,
      needIdentified: null,
      contactSuitable: null,
      reasonCredible: null,
    },
    draft: { subject: "", body: "" },
    approvedAt: null,
    sentAt: null,
    repliedAt: null,
    rejectionReason: "",
    notes: "",
    followUp: { dueDate: null, note: "" },
    followUpLog: [],
    contactHistory: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function editLead(existing, edits, now = new Date()) {
  const next = ensureContactHistory(existing);
  const locked = ["sent", "replied", "rejected"].includes(existing.status);
  const alwaysEditable = ["companyName", "website", "industry", "city", "research", "notes", "followUp"];
  const beforeSend = ["contact", "channel", "qualification", "draft"];

  for (const key of alwaysEditable) {
    if (key in edits) next[key] = clone(edits[key]);
  }
  if (!locked) {
    for (const key of beforeSend) {
      if (key in edits) next[key] = clone(edits[key]);
    }
  }

  const approvalChanged = EDITABLE_BEFORE_SEND.some((key) => !same(existing[key], next[key]));
  const researchChanged = !same(existing.research, next.research);
  if (["draft_ready", "approved"].includes(existing.status) && (approvalChanged || researchChanged)) {
    next.status = "research";
    next.approvedAt = null;
  }
  appendStatusChange(next, existing.status, now, "Zmiana danych wymaga ponownej akceptacji.");
  next.updatedAt = nowIso(now);
  return next;
}

export function draftRequirements(lead) {
  const errors = [];
  const q = lead.qualification;
  if (Object.values(q).some((value) => value !== true)) errors.push("Zaznacz Tak przy wszystkich kryteriach kwalifikacji.");
  if (!lead.research.need.trim()) errors.push("Opisz potencjalną potrzebę firmy.");
  if (!lead.research.contactReason.trim()) errors.push("Opisz wiarygodny powód kontaktu.");
  if (!lead.research.sources.some((source) => source.url.trim())) errors.push("Dodaj co najmniej jedno źródło URL.");
  if (!CHANNELS.includes(lead.channel)) errors.push("Wybierz kanał kontaktu.");
  if (lead.channel === "email" && !lead.contact.email.trim()) errors.push("Podaj adres e-mail odbiorcy.");
  if (lead.channel === "linkedin" && !lead.contact.linkedinUrl.trim()) errors.push("Podaj adres profilu LinkedIn.");
  if (lead.channel === "contact_form" && !lead.contact.formUrl.trim()) errors.push("Podaj adres formularza kontaktowego.");
  if (!lead.draft.body.trim()) errors.push("Wpisz treść wiadomości.");
  if (lead.channel === "email" && !lead.draft.subject.trim()) errors.push("Wpisz temat e-maila.");
  return errors;
}

export function transitionLead(lead, action, payload = {}, now = new Date()) {
  const next = ensureContactHistory(lead);
  const stamp = nowIso(now);
  const fail = (message) => ({ ok: false, error: message, lead });
  const success = () => {
    appendStatusChange(next, lead.status, now, action === "reject" ? next.rejectionReason : "");
    next.updatedAt = stamp;
    return { ok: true, lead: next };
  };

  if (action === "start_research" && lead.status === "new") {
    next.status = "research";
    return success();
  }
  if (action === "submit_for_approval" && lead.status === "research") {
    const errors = draftRequirements(lead);
    if (errors.length) return fail(errors.join(" "));
    next.status = "draft_ready";
    return success();
  }
  if (action === "approve" && lead.status === "draft_ready") {
    const errors = draftRequirements(lead);
    if (errors.length) return fail(errors.join(" "));
    next.status = "approved";
    next.approvedAt = stamp;
    return success();
  }
  if (action === "mark_sent" && lead.status === "approved") {
    const sentAt = payload.sentAt || stamp;
    if (!Number.isFinite(Date.parse(sentAt))) return fail("Podaj poprawną datę wysłania.");
    if (new Date(sentAt) > new Date(now)) return fail("Czas wysłania nie może być przyszły.");
    if (!lead.approvedAt || new Date(sentAt) < new Date(lead.approvedAt)) return fail("Czas wysłania nie może być wcześniejszy od akceptacji.");
    next.status = "sent";
    next.sentAt = new Date(sentAt).toISOString();
    appendContactEvent(next, { type: "first_message", occurredAt: next.sentAt, channel: lead.channel,
      direction: "outbound", subject: lead.draft.subject, body: lead.draft.body,
      recipient: clone(lead.contact) }, now);
    next.followUp = {
      dueDate: addBusinessDays(sentAt, 3),
      note: "Pierwszy follow-up po 3 dniach roboczych.",
    };
    return success();
  }
  if (action === "mark_replied" && ["sent", "replied"].includes(lead.status)) {
    const legacyPayload = payload.body === undefined;
    const body = String(legacyPayload ? (payload.note || "") : payload.body).trim();
    const note = legacyPayload ? "" : String(payload.note || "").trim();
    const nextStep = String(payload.nextStep || "").trim();
    const channel = legacyPayload ? (payload.channel || lead.channel) : payload.channel;
    const repliedAt = payload.repliedAt || stamp;
    if (!body) return fail("Dodaj treść lub streszczenie odpowiedzi.");
    if (!CHANNELS.includes(channel)) return fail("Wybierz kanał odpowiedzi.");
    if (!Number.isFinite(Date.parse(repliedAt))) return fail("Podaj poprawną datę odpowiedzi.");
    if (new Date(repliedAt) > new Date(now)) return fail("Czas odpowiedzi nie może być przyszły.");
    if (!lead.sentAt || new Date(repliedAt) < new Date(lead.sentAt)) return fail("Odpowiedź nie może poprzedzać wysłania.");
    const occurredAt = new Date(repliedAt).toISOString();
    next.status = "replied";
    next.repliedAt = lead.repliedAt && lead.repliedAt > occurredAt ? lead.repliedAt : occurredAt;
    appendContactEvent(next, { type: "reply", occurredAt, channel, direction: "inbound", body, note, nextStep }, now);
    // Keep the old note-only API compatible without duplicating new reply forms in notes.
    if (legacyPayload) next.notes = [next.notes.trim(), `Odpowiedź (${new Date(repliedAt).toLocaleString("pl-PL")}): ${body}`].filter(Boolean).join("\n\n");
    next.followUp = { dueDate: null, note: "" };
    return success();
  }
  if (action === "add_note") {
    const note = String(payload.note || "").trim();
    const nextStep = String(payload.nextStep || "").trim();
    const channel = payload.channel || null;
    const occurredAt = payload.occurredAt || stamp;
    if (!note) return fail("Wpisz notatkę.");
    if (channel !== null && !CHANNELS.includes(channel)) return fail("Wybierz poprawny kanał notatki.");
    if (!Number.isFinite(Date.parse(occurredAt)) || new Date(occurredAt) > new Date(now)) return fail("Podaj poprawną, nieprzyszłą datę notatki.");
    appendContactEvent(next, { type: "note", note, nextStep, channel, occurredAt: new Date(occurredAt).toISOString() }, now);
    return success();
  }
  if (action === "reject" && lead.status !== "rejected") {
    const reason = String(payload.reason || "").trim();
    if (!reason) return fail("Podaj powód odrzucenia.");
    next.status = "rejected";
    next.rejectionReason = reason;
    next.followUp = { dueDate: null, note: "" };
    if (!lead.sentAt) next.approvedAt = null;
    return success();
  }
  if (action === "log_followup" && ["sent", "replied"].includes(lead.status)) {
    if (lead.followUpLog.length >= MAX_FOLLOW_UPS) return fail("Limit dwóch follow-upów został osiągnięty. Zamknij lead albo odłóż go z notatką.");
    const note = String(payload.note || "").trim();
    const completedAt = payload.completedAt || stamp;
    if (!Number.isFinite(Date.parse(completedAt))) return fail("Podaj poprawną datę follow-upu.");
    if (!note) return fail("Dodaj notatkę o wykonanym follow-upie.");
    if (!CHANNELS.includes(payload.channel)) return fail("Wybierz kanał follow-upu.");
    if (new Date(completedAt) > new Date(now)) return fail("Follow-up nie może być przyszły.");
    if (!lead.sentAt || new Date(completedAt) < new Date(lead.sentAt)) return fail("Follow-up nie może poprzedzać pierwszego wysłania.");
    next.followUpLog.push({ completedAt: new Date(completedAt).toISOString(), channel: payload.channel, note });
    appendContactEvent(next, { type: "follow_up", occurredAt: new Date(completedAt).toISOString(),
      channel: payload.channel, direction: "outbound", note }, now);
    if (next.followUpLog.length === 1) {
      const windowStart = addBusinessDays(completedAt, 5);
      const windowEnd = addBusinessDays(completedAt, 7);
      next.followUp = {
        dueDate: windowStart,
        note: `Drugi follow-up: zalecane okno ${windowStart}–${windowEnd} (5–7 dni roboczych).`,
      };
    } else {
      next.followUp = { dueDate: null, note: "" };
    }
    return success();
  }
  return fail("Ta akcja nie jest dostępna dla bieżącego statusu.");
}

export function changeIcp(workspace, icp, now = new Date()) {
  const next = clone(workspace);
  next.settings.icp = { target: icp.target.trim(), need: icp.need.trim(), exclude: icp.exclude.trim() };
  for (let index = 0; index < next.leads.length; index++) {
    const lead = next.leads[index];
    const previousStatus = lead.status;
    if (!["sent", "replied", "rejected"].includes(lead.status)) {
      lead.qualification.icpFit = null;
      if (["draft_ready", "approved"].includes(lead.status)) {
        lead.contactHistory = ensureContactHistory(lead).contactHistory;
        lead.status = "research";
        lead.approvedAt = null;
      }
      appendStatusChange(lead, previousStatus, now, "Zmiana ICP wymaga ponownej oceny.");
      lead.updatedAt = nowIso(now);
    }
  }
  next.updatedAt = nowIso(now);
  return next;
}

export function isFollowUpDue(lead, today) {
  return ["sent", "replied"].includes(lead.status) && Boolean(lead.followUp.dueDate) && lead.followUp.dueDate <= today;
}

export function isFollowUpOverdue(lead, today) {
  return ["sent", "replied"].includes(lead.status) && Boolean(lead.followUp.dueDate) && lead.followUp.dueDate < today;
}

export function countDueFollowUps(leads, today) {
  return leads.filter((lead) => isFollowUpDue(lead, today)).length;
}

export function countOverdueFollowUps(leads, today) {
  return leads.filter((lead) => isFollowUpOverdue(lead, today)).length;
}

export function sortLeadsByNextStep(leads, today) {
  const activeDate = (lead) => ["sent", "replied"].includes(lead.status) ? lead.followUp.dueDate : null;
  const group = (lead) => {
    const dueDate = activeDate(lead);
    if (!dueDate) return 3;
    if (dueDate < today) return 0;
    if (dueDate === today) return 1;
    return 2;
  };
  return [...leads].sort((a, b) => {
    const groupDifference = group(a) - group(b);
    if (groupDifference) return groupDifference;
    const aDate = activeDate(a);
    const bDate = activeDate(b);
    if (aDate && bDate) {
      const dateDifference = aDate.localeCompare(bDate);
      if (dateDifference) return dateDifference;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
