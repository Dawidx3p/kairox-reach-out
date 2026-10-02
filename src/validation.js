import { STATUS_ORDER } from "./statuses.js";
import { validateContactHistory } from "./contact-history.js";

export const MAX_LEADS = 500;
export const MAX_BYTES = 1024 * 1024;
const CHANNELS = ["email", "linkedin", "contact_form"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isString = (value) => typeof value === "string";
const isNullableString = (value) => value === null || isString(value);
const isBooleanChoice = (value) => value === null || typeof value === "boolean";
const isIso = (value) => isString(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const isUuid = (value) => isString(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isDateOnly = (value) => value === null || (isString(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));

export function isHttpUrl(value, allowEmpty = true) {
  if (allowEmpty && value === "") return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function isEmail(value, allowEmpty = true) {
  if (allowEmpty && value === "") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function requireKeys(object, keys, path, errors) {
  for (const key of keys) {
    if (!(key in object)) errors.push(`${path}.${key}: brak pola`);
  }
}

export function validateLead(lead, path = "lead") {
  const errors = [];
  if (!isObject(lead)) return [`${path}: oczekiwano obiektu`];
  const keys = ["id", "companyName", "website", "industry", "city", "contact", "channel", "status", "research", "qualification", "draft", "approvedAt", "sentAt", "repliedAt", "rejectionReason", "notes", "followUp", "followUpLog", "createdAt", "updatedAt"];
  requireKeys(lead, keys, path, errors);
  if (!isUuid(lead.id)) errors.push(`${path}.id: niepoprawny UUID`);
  if (!isString(lead.companyName) || !lead.companyName.trim()) errors.push(`${path}.companyName: wymagana nazwa`);
  for (const key of ["website", "industry", "city", "rejectionReason", "notes"]) if (!isString(lead[key])) errors.push(`${path}.${key}: oczekiwano tekstu`);
  if (isString(lead.website) && !isHttpUrl(lead.website)) errors.push(`${path}.website: wymagany URL HTTP/HTTPS`);
  if (!STATUS_ORDER.includes(lead.status)) errors.push(`${path}.status: nieznany status`);
  if (!(lead.channel === null || CHANNELS.includes(lead.channel))) errors.push(`${path}.channel: nieznany kanał`);

  if (!isObject(lead.contact)) errors.push(`${path}.contact: oczekiwano obiektu`);
  else {
    const contactKeys = ["name", "role", "email", "linkedinUrl", "formUrl"];
    requireKeys(lead.contact, contactKeys, `${path}.contact`, errors);
    for (const key of contactKeys) if (!isString(lead.contact[key])) errors.push(`${path}.contact.${key}: oczekiwano tekstu`);
    if (isString(lead.contact.email) && !isEmail(lead.contact.email)) errors.push(`${path}.contact.email: niepoprawny e-mail`);
    for (const key of ["linkedinUrl", "formUrl"]) if (isString(lead.contact[key]) && !isHttpUrl(lead.contact[key])) errors.push(`${path}.contact.${key}: wymagany URL HTTP/HTTPS`);
  }

  if (!isObject(lead.research)) errors.push(`${path}.research: oczekiwano obiektu`);
  else {
    requireKeys(lead.research, ["summary", "need", "contactReason", "sources"], `${path}.research`, errors);
    for (const key of ["summary", "need", "contactReason"]) if (!isString(lead.research[key])) errors.push(`${path}.research.${key}: oczekiwano tekstu`);
    if (!Array.isArray(lead.research.sources)) errors.push(`${path}.research.sources: oczekiwano tablicy`);
    else lead.research.sources.forEach((source, index) => {
      if (!isObject(source) || !isString(source.url) || !isString(source.note) || !isHttpUrl(source.url, false)) errors.push(`${path}.research.sources[${index}]: niepoprawne źródło`);
    });
  }

  if (!isObject(lead.qualification)) errors.push(`${path}.qualification: oczekiwano obiektu`);
  else {
    const qKeys = ["icpFit", "needIdentified", "contactSuitable", "reasonCredible"];
    requireKeys(lead.qualification, qKeys, `${path}.qualification`, errors);
    for (const key of qKeys) if (!isBooleanChoice(lead.qualification[key])) errors.push(`${path}.qualification.${key}: oczekiwano true, false lub null`);
  }

  if (!isObject(lead.draft) || !isString(lead.draft.subject) || !isString(lead.draft.body)) errors.push(`${path}.draft: niepoprawny szkic`);
  for (const key of ["approvedAt", "sentAt", "repliedAt"]) if (!(lead[key] === null || isIso(lead[key]))) errors.push(`${path}.${key}: niepoprawna data ISO`);
  for (const key of ["createdAt", "updatedAt"]) if (!isIso(lead[key])) errors.push(`${path}.${key}: niepoprawna data ISO`);

  if (!isObject(lead.followUp) || !isDateOnly(lead.followUp?.dueDate) || !isString(lead.followUp?.note)) errors.push(`${path}.followUp: niepoprawny follow-up`);
  if (!Array.isArray(lead.followUpLog)) errors.push(`${path}.followUpLog: oczekiwano tablicy`);
  else {
    if (lead.followUpLog.length > 2) errors.push(`${path}.followUpLog: dozwolone są maksymalnie dwa follow-upy`);
    lead.followUpLog.forEach((entry, index) => {
      if (!isObject(entry) || !isIso(entry.completedAt) || !CHANNELS.includes(entry.channel) || !isString(entry.note) || !entry.note.trim()) errors.push(`${path}.followUpLog[${index}]: niepoprawny wpis`);
    });
  }

  if (lead.status === "approved" && !lead.approvedAt) errors.push(`${path}: status approved wymaga approvedAt`);
  if (lead.status === "sent" && (!lead.approvedAt || !lead.sentAt)) errors.push(`${path}: status sent wymaga approvedAt i sentAt`);
  if (lead.status === "replied" && (!lead.approvedAt || !lead.sentAt || !lead.repliedAt)) errors.push(`${path}: status replied wymaga pełnej historii dat`);
  if (!["sent", "replied", "rejected"].includes(lead.status) && (lead.sentAt || lead.repliedAt)) errors.push(`${path}: niewysłany lead nie może mieć sentAt/repliedAt`);
  if (lead.status === "rejected" && !isString(lead.rejectionReason)) errors.push(`${path}: odrzucenie wymaga powodu`);
  if (lead.status === "rejected" && (typeof lead.rejectionReason !== "string" || !lead.rejectionReason.trim())) errors.push(`${path}: odrzucenie wymaga niepustego powodu`);
  if (lead.sentAt && lead.approvedAt && new Date(lead.sentAt) < new Date(lead.approvedAt)) errors.push(`${path}: wysłanie poprzedza akceptację`);
  if (lead.repliedAt && lead.sentAt && new Date(lead.repliedAt) < new Date(lead.sentAt)) errors.push(`${path}: odpowiedź poprzedza wysłanie`);
  if (lead.followUp?.dueDate && !["sent", "replied"].includes(lead.status)) errors.push(`${path}: follow-up dozwolony tylko po wysłaniu`);
  if (lead.followUp?.dueDate && lead.followUpLog?.length >= 2) errors.push(`${path}: po dwóch follow-upach nie można planować kolejnego`);
  errors.push(...validateContactHistory(lead, path));
  return errors;
}

export function validateWorkspace(workspace) {
  const errors = [];
  if (!isObject(workspace)) return { ok: false, errors: ["Dokument nie jest obiektem."] };
  requireKeys(workspace, ["schemaVersion", "updatedAt", "settings", "leads"], "workspace", errors);
  if (workspace.schemaVersion !== 1) errors.push("Nieobsługiwana wersja schematu.");
  if (!isIso(workspace.updatedAt)) errors.push("workspace.updatedAt: niepoprawna data ISO");
  if (!isObject(workspace.settings) || !isObject(workspace.settings.icp)) errors.push("workspace.settings.icp: oczekiwano obiektu");
  else {
    requireKeys(workspace.settings.icp, ["target", "need", "exclude"], "workspace.settings.icp", errors);
    for (const key of ["target", "need", "exclude"]) if (!isString(workspace.settings.icp[key])) errors.push(`workspace.settings.icp.${key}: oczekiwano tekstu`);
  }
  if (!Array.isArray(workspace.leads)) errors.push("workspace.leads: oczekiwano tablicy");
  else {
    if (workspace.leads.length > MAX_LEADS) errors.push(`Baza przekracza limit ${MAX_LEADS} leadów.`);
    workspace.leads.forEach((lead, index) => errors.push(...validateLead(lead, `workspace.leads[${index}]`)));
    const ids = workspace.leads.map((lead) => lead?.id);
    if (new Set(ids).size !== ids.length) errors.push("Identyfikatory leadów nie są unikalne.");
  }
  return { ok: errors.length === 0, errors };
}

export function serializedSize(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function assertWithinLimits(workspace) {
  if (workspace.leads.length > MAX_LEADS) return { ok: false, error: `Limit bazy to ${MAX_LEADS} leadów.` };
  const bytes = serializedSize(workspace);
  if (bytes > MAX_BYTES) return { ok: false, error: "Baza przekracza limit 1 MiB." };
  return { ok: true, bytes };
}
