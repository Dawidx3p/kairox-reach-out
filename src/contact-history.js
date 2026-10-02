import { STATUS_ORDER } from "./statuses.js";

export const HISTORY_TYPES = ["first_message", "follow_up", "reply", "note", "status_change"];
const CHANNELS = ["email", "linkedin", "contact_form"];
const CONTACT_KEYS = ["name", "role", "email", "linkedinUrl", "formUrl"];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const copy = (value) => structuredClone(value);

function event(fields, at, id = crypto.randomUUID()) {
  return {
    id, type: "note", occurredAt: at, recordedAt: at, channel: null,
    direction: "internal", status: "new", subject: "", body: "", note: "", nextStep: "",
    recipient: null, fromStatus: null, source: "recorded", ...fields,
  };
}

// Legacy projection is deterministic and read-only. Never guess missing reply text.
export function getContactHistory(lead) {
  if (Array.isArray(lead.contactHistory)) return copy(lead.contactHistory);
  const entries = [];
  const add = (id, at, fields) => entries.push(event({ status: lead.status, ...fields, source: "legacy" }, at, `legacy-${id}`));
  if (lead.sentAt) add("first-message", lead.sentAt, {
    type: "first_message", status: "sent", channel: lead.channel, direction: "outbound",
    subject: lead.draft.subject, body: lead.draft.body, recipient: copy(lead.contact),
  });
  for (const [index, item] of lead.followUpLog.entries()) add(`follow-up-${index}`, item.completedAt, {
    type: "follow_up", channel: item.channel, direction: "outbound", note: item.note,
    status: lead.repliedAt && item.completedAt >= lead.repliedAt ? "replied" : "sent",
  });
  if (lead.repliedAt) add("reply", lead.repliedAt, {
    type: "reply", status: "replied", channel: lead.channel, direction: "inbound",
    body: "W starszym zapisie odnotowano odpowiedź. Jej treść nie była przechowywana oddzielnie; sprawdź zachowane notatki.",
  });
  if (lead.notes.trim()) add("notes", lead.updatedAt, { type: "note", note: lead.notes });
  if (lead.status === "rejected") add("rejected", lead.updatedAt, { type: "status_change", note: lead.rejectionReason });
  return entries;
}

export function ensureContactHistory(lead) {
  return { ...copy(lead), contactHistory: getContactHistory(lead) };
}

export function appendContactEvent(lead, fields, now) {
  const at = (now instanceof Date ? now : new Date(now)).toISOString();
  lead.contactHistory ??= getContactHistory(lead);
  const item = event({ status: lead.status, ...fields }, at);
  lead.contactHistory.push(item);
  return item;
}

export function appendStatusChange(lead, fromStatus, now, note = "") {
  if (lead.status === fromStatus) return;
  appendContactEvent(lead, { type: "status_change", fromStatus, channel: lead.channel, note }, now);
}

export function validateContactHistory(lead, path = "lead") {
  if (!object(lead)) return [`${path}: oczekiwano obiektu leada`];
  if (!("contactHistory" in lead)) return []; // schemaVersion 1 backups remain supported.
  const errors = [];
  if (!Array.isArray(lead.contactHistory)) return [`${path}.contactHistory: oczekiwano tablicy`];
  const ids = new Set();
  let firstMessages = 0;
  for (const [index, item] of lead.contactHistory.entries()) {
    const label = `${path}.contactHistory[${index}]`;
    if (!object(item)) { errors.push(`${label}: oczekiwano obiektu`); continue; }
    if (typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)) errors.push(`${label}.id: wymagany unikalny identyfikator`);
    ids.add(item.id);
    if (!HISTORY_TYPES.includes(item.type)) errors.push(`${label}.type: nieznany typ`);
    if (!iso(item.occurredAt) || !iso(item.recordedAt)) errors.push(`${label}.occurredAt/recordedAt: niepoprawna data ISO`);
    if (![null, ...CHANNELS].includes(item.channel)) errors.push(`${label}.channel: nieznany kanał`);
    if (!["inbound", "outbound", "internal"].includes(item.direction)) errors.push(`${label}.direction: nieznany kierunek`);
    if (!STATUS_ORDER.includes(item.status)) errors.push(`${label}.status: nieznany status`);
    if (!(item.fromStatus === null || STATUS_ORDER.includes(item.fromStatus))) errors.push(`${label}.fromStatus: nieznany status`);
    if (!["recorded", "legacy"].includes(item.source)) errors.push(`${label}.source: nieznane pochodzenie`);
    for (const key of ["subject", "body", "note", "nextStep"]) if (typeof item[key] !== "string") errors.push(`${label}.${key}: oczekiwano tekstu`);
    if (!(item.recipient === null || (object(item.recipient) && CONTACT_KEYS.every((key) => typeof item.recipient[key] === "string")))) errors.push(`${label}.recipient: niepoprawny zapis odbiorcy`);
    if (item.source === "recorded" && iso(item.occurredAt) && iso(item.recordedAt) && item.occurredAt > item.recordedAt) errors.push(`${label}: zdarzenie nie może następować po jego zapisaniu`);
    const communication = ["first_message", "follow_up", "reply"].includes(item.type);
    if (communication && item.source !== "legacy" && !CHANNELS.includes(item.channel)) errors.push(`${label}: kontakt wymaga kanału`);
    const expectedDirection = item.type === "reply" ? "inbound" : ["first_message", "follow_up"].includes(item.type) ? "outbound" : "internal";
    if (item.direction !== expectedDirection) errors.push(`${label}: kierunek nie odpowiada typowi zdarzenia`);
    if (item.type === "first_message") {
      firstMessages++;
      if (!object(item.recipient) || item.status !== "sent") errors.push(`${label}: pierwsza wiadomość wymaga odbiorcy i statusu sent`);
      if (item.source !== "legacy" && (typeof item.body !== "string" || !item.body.trim() || (item.channel === "email" && (typeof item.subject !== "string" || !item.subject.trim())))) errors.push(`${label}: wymagana treść i temat e-maila`);
      if (item.occurredAt !== lead.sentAt || item.subject !== lead.draft?.subject || item.body !== lead.draft?.body || item.channel !== lead.channel
        || !CONTACT_KEYS.every((key) => item.recipient?.[key] === lead.contact?.[key])) errors.push(`${label}: wysłana wiadomość nie odpowiada zachowanemu zapisowi wysyłki`);
    }
    if (item.type === "reply" && (item.status !== "replied" || typeof item.body !== "string" || !item.body.trim())) errors.push(`${label}: odpowiedź wymaga treści i statusu replied`);
    if (["follow_up", "note"].includes(item.type) && (typeof item.note !== "string" || !item.note.trim())) errors.push(`${label}: wymagana notatka`);
    if (["reply", "follow_up"].includes(item.type) && iso(lead.sentAt) && iso(item.occurredAt) && item.occurredAt < lead.sentAt) errors.push(`${label}: kontakt poprzedza pierwszą wysyłkę`);
  }
  if (firstMessages > 1) errors.push(`${path}.contactHistory: pierwsza wiadomość może wystąpić tylko raz`);
  return errors;
}

// Normal edits may only append. Restoring an explicit full backup is a separate operation.
export function historyPreserved(previous, next) {
  const nextLeads = new Map(next.leads.map((lead) => [lead.id, lead]));
  for (const lead of previous.leads) {
    const history = lead.contactHistory;
    if (!Array.isArray(history) || history.length === 0) continue;
    const replacement = nextLeads.get(lead.id)?.contactHistory;
    if (!Array.isArray(replacement) || replacement.length < history.length) return false;
    for (let index = 0; index < history.length; index++) {
      // Compare data independent of JSON key order (imports can reorder object keys).
      if (!equal(history[index], replacement[index])) return false;
    }
  }
  return true;
}

function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => equal(item, b[index]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
