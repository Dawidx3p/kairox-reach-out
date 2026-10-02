import { getContactHistory } from "../contact-history.js";
import { statusLabel } from "../statuses.js";
import { escapeHtml, localDateTime } from "./helpers.js";

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

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function formatDateTime(value) {
  const parsed = timestamp(value);
  if (!Number.isFinite(parsed)) return escapeHtml(value || "—");
  return localDateTime(value);
}

function textField(label, value) {
  if (!String(value || "").trim()) return "";
  return `<div class="contact-history-field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function recipientMarkup(recipient = {}) {
  return `<div class="contact-history-recipient">
    <h4>Odbiorca w chwili wysłania</h4>
    <dl>
      <div><dt>Imię i nazwisko</dt><dd>${escapeHtml(recipient.name || "—")}</dd></div>
      <div><dt>Rola</dt><dd>${escapeHtml(recipient.role || "—")}</dd></div>
      <div><dt>E-mail</dt><dd>${escapeHtml(recipient.email || "—")}</dd></div>
      <div><dt>LinkedIn</dt><dd>${escapeHtml(recipient.linkedinUrl || "—")}</dd></div>
      <div><dt>Formularz</dt><dd>${escapeHtml(recipient.formUrl || "—")}</dd></div>
    </dl>
  </div>`;
}

function historyEntry(event) {
  const channel = event.channel === null ? "Nie dotyczy" : (CHANNEL_LABELS[event.channel] || event.channel || "Nie dotyczy");
  const direction = DIRECTION_LABELS[event.direction] || event.direction || "—";
  const type = TYPE_LABELS[event.type] || event.type || "Wpis";
  const previousStatus = event.fromStatus ? `<span>Poprzedni status: <strong>${escapeHtml(statusLabel(event.fromStatus))}</strong></span>` : "";
  return `<article class="contact-history-entry">
    <div class="contact-history-marker" aria-hidden="true"></div>
    <div class="contact-history-card">
      <header class="contact-history-entry-header">
        <div><p class="contact-history-type">${escapeHtml(type)}</p><time datetime="${escapeHtml(event.occurredAt || "")}">${formatDateTime(event.occurredAt)}</time></div>
        <span class="status">${escapeHtml(statusLabel(event.status))}</span>
      </header>
      <div class="contact-history-meta">
        <span>Kanał: <strong>${escapeHtml(channel)}</strong></span>
        <span>Kierunek: <strong>${escapeHtml(direction)}</strong></span>
        ${previousStatus}
      </div>
      <dl class="contact-history-content">
        ${textField("Temat", event.subject)}
        ${textField("Treść", event.body)}
        ${textField("Notatka", event.note)}
        ${textField("Następny krok", event.nextStep)}
      </dl>
      ${event.type === "first_message" ? recipientMarkup(event.recipient) : ""}
      ${event.source === "legacy" ? '<p class="contact-history-legacy">Odtworzone ze starszych danych; data/kanał według dostępnego zapisu.</p>' : ""}
    </div>
  </article>`;
}

export function renderContactHistory(lead) {
  const events = getContactHistory(lead)
    .map((event, index) => ({ event, index }))
    .sort((left, right) => (
      timestamp(right.event.occurredAt) - timestamp(left.event.occurredAt)
      || timestamp(right.event.recordedAt) - timestamp(left.event.recordedAt)
      || right.index - left.index
    ))
    .map(({ event }) => event);

  if (!events.length) return '<p class="contact-history-empty">Brak zapisanych zdarzeń kontaktu.</p>';
  return `<div class="contact-history-list">${events.map(historyEntry).join("")}</div>`;
}
