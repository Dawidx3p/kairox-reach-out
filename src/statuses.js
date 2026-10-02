export const STATUS_ORDER = [
  "new",
  "research",
  "draft_ready",
  "approved",
  "sent",
  "replied",
  "rejected",
];

export const STATUSES = Object.freeze({
  new: { label: "Nowy", next: "Rozpocznij research" },
  research: { label: "Do researchu", next: "Uzupełnij research i szkic" },
  draft_ready: { label: "Szkic gotowy", next: "Zatwierdź wiadomość" },
  approved: { label: "Zaakceptowany", next: "Wyślij ręcznie i potwierdź" },
  sent: { label: "Wysłany", next: "Zapisz odpowiedź lub follow-up" },
  replied: { label: "Odpowiedź", next: "Ustal następny krok" },
  rejected: { label: "Odrzucony", next: "Kontakt zamknięty" },
});

export function statusLabel(status) {
  return STATUSES[status]?.label ?? status;
}

export function nextStep(lead, today) {
  if (lead.status === "sent" && !lead.repliedAt && lead.followUpLog.length >= 2) {
    return "Wymaga decyzji: zamknij lub odłóż";
  }
  if (
    lead.followUp?.dueDate &&
    ["sent", "replied"].includes(lead.status) &&
    lead.followUp.dueDate <= today
  ) {
    return lead.followUp.dueDate < today ? "Zaległy follow-up" : "Follow-up na dziś";
  }
  const savedNextStep = Array.isArray(lead.contactHistory)
    ? lead.contactHistory.findLast((event) => typeof event.nextStep === "string" && event.nextStep.trim())?.nextStep.trim()
    : "";
  if (savedNextStep) return savedNextStep;
  return STATUSES[lead.status]?.next ?? "Sprawdź kontakt";
}
