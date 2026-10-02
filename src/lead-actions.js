import { MAX_FOLLOW_UPS } from "./domain.js";

const action = (id, label, tone = "ghost") => ({ id, label, tone });

export function leadQuickActions(lead) {
  const actions = [action("open", "Otwórz kartę")];

  if (lead.status === "new") actions.push(action("start_research", "Rozpocznij research", "primary"));
  if (lead.status === "research") actions.push(action("continue_research", "Kontynuuj research", "primary"));
  if (lead.status === "draft_ready") actions.push(action("review", "Przejdź do akceptacji", "primary"));
  if (lead.status === "approved") {
    actions.push(action("copy", "Kopiuj wiadomość", "secondary"));
    actions.push(action("mark_sent", "Oznacz jako wysłane", "primary"));
  }
  if (lead.status === "sent") {
    actions.push(action("mark_replied", "Dodaj odpowiedź", "primary"));
    if (lead.followUpLog.length < MAX_FOLLOW_UPS) actions.push(action("set_followup", "Ustaw follow-up", "secondary"));
    actions.push(action("copy", "Kopiuj wiadomość"));
    actions.push(action("copy_history", "Kopiuj historię"));
    actions.push(action("create_prompt", "Stwórz prompt"));
  }
  if (lead.status === "replied") {
    actions.push(action("add_note", "Dodaj notatkę", "secondary"));
    actions.push(action("set_next_step", "Ustaw kolejny krok", "primary"));
    actions.push(action("copy", "Kopiuj wiadomość"));
    actions.push(action("copy_history", "Kopiuj historię"));
    actions.push(action("create_prompt", "Stwórz prompt"));
  }
  if (lead.status !== "rejected") actions.push(action("reject", "Odrzuć kontakt", "danger"));
  return actions;
}
