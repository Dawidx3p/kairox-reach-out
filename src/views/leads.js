import { STATUS_ORDER, statusLabel, nextStep } from "../statuses.js";
import { countDueFollowUps, countOverdueFollowUps, isFollowUpDue, sortLeadsByNextStep } from "../domain.js";
import { leadQuickActions } from "../lead-actions.js";
import { escapeHtml } from "./helpers.js";

function contactLabel(lead) {
  const person = lead.contact.name || lead.contact.email || "Brak kontaktu";
  const channels = { email: "E-mail", linkedin: "LinkedIn", contact_form: "Formularz" };
  return `${person}${lead.channel ? ` · ${channels[lead.channel]}` : ""}`;
}

function actionsMarkup(lead) {
  return leadQuickActions(lead).map(({ id, label, tone }) => `<button type="button" class="button button-small button-${tone}${tone === "danger" ? " danger-text" : ""}" data-lead-action="${id}" data-id="${lead.id}">${escapeHtml(label)}</button>`).join("");
}

export function mountLeads(root, { workspace, filters, today, onFilter, onAdd, onOpen, onQuickAction, onSettings }) {
  const dueCount = countDueFollowUps(workspace.leads, today);
  const overdueCount = countOverdueFollowUps(workspace.leads, today);
  const query = filters.query.toLocaleLowerCase("pl");
  let leads = workspace.leads.filter((lead) => {
    const haystack = [lead.companyName, lead.contact.name, lead.contact.email].join(" ").toLocaleLowerCase("pl");
    if (query && !haystack.includes(query)) return false;
    if (filters.quick === "approval") return lead.status === "draft_ready";
    if (filters.quick === "followup") return isFollowUpDue(lead, today);
    if (filters.status) return lead.status === filters.status;
    return true;
  });
  leads = sortLeadsByNextStep(leads, today);

  const rows = leads.map((lead) => `
    <article class="lead-row" aria-label="Firma ${escapeHtml(lead.companyName)}">
      <span class="lead-company"><strong>${escapeHtml(lead.companyName)}</strong><small>${escapeHtml(lead.industry || lead.city || "Bez opisu")}</small></span>
      <button type="button" class="lead-contact-trigger" data-lead-toggle="${lead.id}" aria-expanded="false" aria-controls="lead-actions-${lead.id}"><span>${escapeHtml(contactLabel(lead))}</span><small data-toggle-label>Pokaż akcje</small></button>
      <span><span class="status status-${lead.status}">${escapeHtml(statusLabel(lead.status))}</span></span>
      <span>${escapeHtml(nextStep(lead, today))}</span>
      <span class="followup ${lead.followUp.dueDate < today ? "is-overdue" : lead.followUp.dueDate === today ? "is-today" : ""}">${escapeHtml(lead.followUp.dueDate || "—")}</span>
      <div class="lead-quick-actions" id="lead-actions-${lead.id}" aria-label="Akcje dla ${escapeHtml(lead.companyName)}" hidden>${actionsMarkup(lead)}</div>
    </article>`).join("");

  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="#/leads" aria-label="KAIROX Reach Out, lista firm"><span>K</span><strong>KAIROX</strong><small>Reach Out</small></a>
        <div class="topbar-actions"><button class="button button-ghost" id="settings-button">Ustawienia</button><button class="button button-primary" id="add-button">Dodaj firmę</button></div>
      </header>
      <main>
        <section class="hero compact-hero">
          <div><p class="eyebrow">Lokalny workspace</p><h1>Kontakty, które mają sens.</h1><p>Research, szkic i ręczna akceptacja w jednym spokojnym przepływie.</p></div>
          <div class="metric"><strong>${workspace.leads.length}</strong><span>${workspace.leads.length === 1 ? "firma" : "firm"} w bazie</span></div>
        </section>
        <section class="panel filter-panel" aria-label="Filtry firm">
          <label class="search-field"><span class="sr-only">Szukaj</span><input id="search" type="search" placeholder="Szukaj firmy, osoby lub e-maila…" value="${escapeHtml(filters.query)}"></label>
          <select id="status-filter" aria-label="Filtr statusu">
            <option value="">Wszystkie statusy</option>
            ${STATUS_ORDER.map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
          </select>
          <div class="quick-filters" role="group" aria-label="Szybkie filtry">
            <button data-quick="all" class="chip ${filters.quick === "all" ? "active" : ""}">Wszystkie</button>
            <button data-quick="approval" class="chip ${filters.quick === "approval" ? "active" : ""}">Do akceptacji</button>
            <button data-quick="followup" class="chip ${filters.quick === "followup" ? "active" : ""}">Follow-up <span class="chip-count" aria-label="${dueCount} wymagających uwagi">${dueCount}</span><span class="overdue-count ${overdueCount ? "has-overdue" : ""}" aria-label="${overdueCount} zaległych follow-upów">Zaległe ${overdueCount}</span></button>
          </div>
        </section>
        <section class="lead-list" aria-label="Lista firm">
          <div class="lead-header"><span>Firma</span><span>Kontakt / kanał</span><span>Status</span><span>Następny krok</span><span>Follow-up</span></div>
          ${rows || `<div class="empty-state"><div class="empty-mark">K</div><h2>${workspace.leads.length ? "Brak wyników" : "Pierwszy dobry kontakt zaczyna się tutaj"}</h2><p>${workspace.leads.length ? "Zmień wyszukiwanie lub filtry." : "Dodaj firmę, zbierz kontekst i przygotuj wiadomość do ręcznej akceptacji."}</p>${workspace.leads.length ? "" : '<button class="button button-primary" id="empty-add">Dodaj pierwszą firmę</button>'}</div>`}
        </section>
      </main>
    </div>`;

  root.querySelector("#settings-button").addEventListener("click", onSettings);
  root.querySelector("#add-button").addEventListener("click", onAdd);
  root.querySelector("#empty-add")?.addEventListener("click", onAdd);
  const toggles = [...root.querySelectorAll("[data-lead-toggle]")];
  const setExpanded = (toggle, expanded) => {
    const row = toggle.closest(".lead-row");
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.querySelector("[data-toggle-label]").textContent = expanded ? "Ukryj akcje" : "Pokaż akcje";
    row.classList.toggle("is-expanded", expanded);
    row.querySelector(".lead-quick-actions").hidden = !expanded;
  };
  const toggleActions = (toggle) => {
    const shouldOpen = toggle.getAttribute("aria-expanded") !== "true";
    toggles.forEach((item) => setExpanded(item, false));
    if (!shouldOpen) return;
    setExpanded(toggle, true);
  };
  toggles.forEach((toggle) => {
    const row = toggle.closest(".lead-row");
    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleActions(toggle);
    });
    row.addEventListener("click", (event) => {
      if (event.target.closest(".lead-quick-actions")) return;
      toggleActions(toggle);
    });
  });
  root.querySelectorAll("[data-lead-action]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.leadAction === "open") onOpen(button.dataset.id);
    else onQuickAction(button.dataset.id, button.dataset.leadAction);
  }));
  root.querySelector("#search").addEventListener("input", (event) => onFilter({ ...filters, query: event.target.value }));
  root.querySelector("#status-filter").addEventListener("change", (event) => onFilter({ query: filters.query, status: event.target.value, quick: "all" }));
  root.querySelectorAll("[data-quick]").forEach((button) => button.addEventListener("click", () => onFilter({ query: filters.query, status: "", quick: button.dataset.quick })));
}
