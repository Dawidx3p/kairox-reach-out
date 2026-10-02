import { getContactHistory } from "./contact-history.js";
import { statusLabel } from "./statuses.js";

const TYPE_LABELS = Object.freeze({
  first_message: "Pierwsza wiadomość",
  follow_up: "Follow-up",
  reply: "Odpowiedź",
  note: "Notatka",
  status_change: "Zmiana statusu",
});

const CHANNEL_LABELS = Object.freeze({
  email: "E-mail",
  linkedin: "LinkedIn",
  contact_form: "Formularz kontaktowy",
});

const DIRECTION_LABELS = Object.freeze({
  outbound: "KAIROX → firma",
  inbound: "firma → KAIROX",
  internal: "Wewnętrzne",
});

const dateTime = (value) => new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Warsaw",
}).format(new Date(value));

const chronologicalHistory = (lead) => getContactHistory(lead)
  .map((event, index) => ({ event, index }))
  .sort((left, right) => (
    Date.parse(left.event.occurredAt) - Date.parse(right.event.occurredAt)
    || Date.parse(left.event.recordedAt) - Date.parse(right.event.recordedAt)
    || left.index - right.index
  ))
  .map(({ event }) => event);

const addField = (lines, label, value) => {
  if (String(value || "").trim()) lines.push(`${label}: ${String(value).trim()}`);
};

const valueOrDash = (value) => String(value || "").trim() || "—";
const choice = (value) => value === true ? "Tak" : value === false ? "Nie" : "Nieustalone";

export function buildContactHistoryText(lead) {
  const lines = [
    `Kontekst klienta i historia kontaktu — ${lead.companyName}`,
    "",
    "FIRMA",
    `Nazwa: ${lead.companyName}`,
    `Strona: ${valueOrDash(lead.website)}`,
    `Branża: ${valueOrDash(lead.industry)}`,
    `Miasto: ${valueOrDash(lead.city)}`,
    "",
    "KONTAKT",
    `Osoba: ${valueOrDash(lead.contact.name)}`,
    `Rola: ${valueOrDash(lead.contact.role)}`,
    `E-mail: ${valueOrDash(lead.contact.email)}`,
    `LinkedIn: ${valueOrDash(lead.contact.linkedinUrl)}`,
    `Formularz: ${valueOrDash(lead.contact.formUrl)}`,
    `Status: ${statusLabel(lead.status)}`,
    `Kanał: ${CHANNEL_LABELS[lead.channel] || "nieustalony"}`,
    "",
    "RESEARCH",
    `Podsumowanie: ${valueOrDash(lead.research.summary)}`,
    `Zidentyfikowana potrzeba: ${valueOrDash(lead.research.need)}`,
    `Powód kontaktu: ${valueOrDash(lead.research.contactReason)}`,
    "Źródła:",
    ...(lead.research.sources.length
      ? lead.research.sources.map((source, index) => `${index + 1}. ${source.url}${source.note ? ` — ${source.note}` : ""}`)
      : ["Brak zapisanych źródeł."]),
    "",
    "KWALIFIKACJA",
    `Dopasowanie do ICP: ${choice(lead.qualification.icpFit)}`,
    `Potrzeba zidentyfikowana: ${choice(lead.qualification.needIdentified)}`,
    `Właściwy kontakt: ${choice(lead.qualification.contactSuitable)}`,
    `Wiarygodny powód kontaktu: ${choice(lead.qualification.reasonCredible)}`,
    "",
    "AKTUALNY SZKIC WIADOMOŚCI",
    `Temat: ${valueOrDash(lead.draft.subject)}`,
    `Treść: ${valueOrDash(lead.draft.body)}`,
    "",
    "NOTATKI WEWNĘTRZNE",
    valueOrDash(lead.notes),
    "",
    "FOLLOW-UP",
    `Wykonane: ${lead.followUpLog.length} z 2`,
    `Aktywny termin: ${valueOrDash(lead.followUp.dueDate)}`,
    `Notatka do terminu: ${valueOrDash(lead.followUp.note)}`,
    "",
    "HISTORIA KONTAKTU",
  ];
  const history = chronologicalHistory(lead);
  if (!history.length) return `${lines.join("\n")}\nBrak zapisanej historii kontaktu.`;

  history.forEach((event, index) => {
    lines.push("", `${index + 1}. ${dateTime(event.occurredAt)} — ${TYPE_LABELS[event.type] || "Wpis"}`);
    lines.push(`Kierunek: ${DIRECTION_LABELS[event.direction] || "—"} | Kanał: ${CHANNEL_LABELS[event.channel] || "Nie dotyczy"}`);
    if (event.fromStatus) lines.push(`Zmiana statusu: ${statusLabel(event.fromStatus)} → ${statusLabel(event.status)}`);
    addField(lines, "Temat", event.subject);
    addField(lines, "Treść", event.body);
    addField(lines, "Notatka", event.note);
    addField(lines, "Następny krok", event.nextStep);
  });
  return lines.join("\n");
}
