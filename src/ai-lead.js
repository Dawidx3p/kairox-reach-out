import { createLead, editLead } from "./domain.js";
import { validateLead } from "./validation.js";

const TOP_LEVEL_FIELDS = ["companyName", "website", "industry", "city", "contact", "channel", "research", "qualification", "draft", "notes"];
const CONTACT_FIELDS = ["name", "role", "email", "linkedinUrl", "formUrl"];
const RESEARCH_FIELDS = ["summary", "need", "contactReason", "sources"];
const QUALIFICATION_FIELDS = ["icpFit", "needIdentified", "contactSuitable", "reasonCredible"];
const DRAFT_FIELDS = ["subject", "body"];
const CHANNELS = [null, "email", "linkedin", "contact_form"];

function unknownFields(object, allowed, path) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return [`${path}: oczekiwano obiektu`];
  return Object.keys(object).filter((key) => !allowed.includes(key)).map((key) => `${path}.${key}: pole niedozwolone`);
}

function text(value, path, errors) {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    errors.push(`${path}: oczekiwano tekstu`);
    return "";
  }
  return value.trim();
}

function stripFence(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

export function buildAiLeadPrompt(icp = { target: "", need: "", exclude: "" }) {
  return `Jesteś asystentem researchu dla KAIROX. Na podstawie DANYCH ŹRÓDŁOWYCH przygotuj jeden obiekt JSON opisujący jednego leada.

Zasady:
1. Zwróć wyłącznie poprawny JSON — bez markdownu, komentarzy i objaśnień.
2. Nie zgaduj. Gdy informacji brakuje, użyj pustego tekstu, pustej tablicy albo null.
3. Nie twórz danych osobowych ani adresów. Używaj tylko informacji obecnych w danych źródłowych.
4. Źródła muszą być rzeczywistymi adresami HTTP/HTTPS obecnymi w danych źródłowych.
5. qualification ustaw na true lub false tylko wtedy, gdy wynika to wprost ze źródeł; w przeciwnym razie null.
6. channel może mieć wyłącznie wartość null, "email", "linkedin" albo "contact_form".
7. Nie dodawaj żadnych innych pól, szczególnie id, statusu ani dat — aplikacja nada je samodzielnie.

Aktualny ICP KAIROX:
- docelowa firma: ${icp.target || "nieustalone"}
- potrzeba: ${icp.need || "nieustalona"}
- wykluczenia: ${icp.exclude || "brak zdefiniowanych"}

Wymagany format:
{
  "companyName": "",
  "website": "",
  "industry": "",
  "city": "",
  "contact": {
    "name": "",
    "role": "",
    "email": "",
    "linkedinUrl": "",
    "formUrl": ""
  },
  "channel": null,
  "research": {
    "summary": "",
    "need": "",
    "contactReason": "",
    "sources": [{ "url": "https://...", "note": "co potwierdza źródło" }]
  },
  "qualification": {
    "icpFit": null,
    "needIdentified": null,
    "contactSuitable": null,
    "reasonCredible": null
  },
  "draft": {
    "subject": "",
    "body": ""
  },
  "notes": ""
}

DANE ŹRÓDŁOWE:
[Wklej tutaj nazwę firmy, adres strony, linki do źródeł, informacje o kontakcie i własne notatki.]`;
}

export function parseAiLeadText(input, now = new Date(), id) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "Wklej odpowiedź JSON przygotowaną przez AI." };
  let data;
  try {
    data = JSON.parse(stripFence(raw));
  } catch (error) {
    return { ok: false, error: `Niepoprawny JSON: ${error.message}` };
  }

  const errors = unknownFields(data, TOP_LEVEL_FIELDS, "lead");
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, error: errors.join("\n") };
  const companyName = text(data.companyName, "lead.companyName", errors);
  if (!companyName) errors.push("lead.companyName: nazwa firmy jest wymagana");

  const contact = data.contact ?? {};
  errors.push(...unknownFields(contact, CONTACT_FIELDS, "lead.contact"));
  const research = data.research ?? {};
  errors.push(...unknownFields(research, RESEARCH_FIELDS, "lead.research"));
  const qualification = data.qualification ?? {};
  errors.push(...unknownFields(qualification, QUALIFICATION_FIELDS, "lead.qualification"));
  const draft = data.draft ?? {};
  errors.push(...unknownFields(draft, DRAFT_FIELDS, "lead.draft"));

  if (!CHANNELS.includes(data.channel ?? null)) errors.push("lead.channel: nieznany kanał");
  const sources = research.sources ?? [];
  if (!Array.isArray(sources)) errors.push("lead.research.sources: oczekiwano tablicy");
  const normalizedSources = Array.isArray(sources) ? sources.map((source, index) => {
    errors.push(...unknownFields(source, ["url", "note"], `lead.research.sources[${index}]`));
    return { url: text(source?.url, `lead.research.sources[${index}].url`, errors), note: text(source?.note, `lead.research.sources[${index}].note`, errors) };
  }).filter((source) => source.url || source.note) : [];

  const q = {};
  for (const key of QUALIFICATION_FIELDS) {
    const value = qualification[key] ?? null;
    if (!(value === null || typeof value === "boolean")) errors.push(`lead.qualification.${key}: oczekiwano true, false lub null`);
    q[key] = value;
  }
  if (errors.length) return { ok: false, error: errors.join("\n") };

  const lead = createLead(companyName, now, id);
  const enriched = editLead(lead, {
    website: text(data.website, "lead.website", errors),
    industry: text(data.industry, "lead.industry", errors),
    city: text(data.city, "lead.city", errors),
    contact: {
      name: text(contact.name, "lead.contact.name", errors),
      role: text(contact.role, "lead.contact.role", errors),
      email: text(contact.email, "lead.contact.email", errors),
      linkedinUrl: text(contact.linkedinUrl, "lead.contact.linkedinUrl", errors),
      formUrl: text(contact.formUrl, "lead.contact.formUrl", errors),
    },
    channel: data.channel ?? null,
    research: {
      summary: text(research.summary, "lead.research.summary", errors),
      need: text(research.need, "lead.research.need", errors),
      contactReason: text(research.contactReason, "lead.research.contactReason", errors),
      sources: normalizedSources,
    },
    qualification: q,
    draft: {
      subject: text(draft.subject, "lead.draft.subject", errors),
      body: text(draft.body, "lead.draft.body", errors),
    },
    notes: text(data.notes, "lead.notes", errors),
  }, now);
  if (errors.length) return { ok: false, error: errors.join("\n") };
  const validationErrors = validateLead(enriched, "lead");
  if (validationErrors.length) return { ok: false, error: validationErrors.join("\n") };
  return { ok: true, lead: enriched };
}
