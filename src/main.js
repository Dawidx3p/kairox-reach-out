import "./styles.css";
import { countDueFollowUps, editLead, transitionLead, changeIcp } from "./domain.js";
import { loadWorkspace, saveWorkspace, parseImport, downloadJson, downloadRaw } from "./storage.js";
import { readLegacyWorkspace, migrateLegacyWorkspace } from "./legacy-storage.js";
import { escapeHtml, toDateTimeLocal } from "./views/helpers.js";
import { mountLeads } from "./views/leads.js";
import { mountLeadDetail } from "./views/lead-detail.js";
import { mountSettings } from "./views/settings.js";
import { requestForm, confirmAction } from "./dialogs.js";
import { openAddLeadDialog } from "./views/add-lead.js";
import { mountFollowUpPopup } from "./views/follow-up-popup.js";
import { buildAiContactPrompt } from "./ai-contact-prompt.js";
import { buildContactHistoryText } from "./contact-history-text.js";

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const choiceDialog = document.querySelector("#choice-dialog");
const filters = { query: "", status: "", quick: "all" };
let stale = false;
let loadError = null;

let workspace = null;
let etag = null;
let loaded = null;
let saving = false;
let pendingWorkspace = null;
let legacy = readLegacyWorkspace();
let migrationPending = false;
let legacyDismissed = false;
let followUpPopupChecked = false;
const legacyRegion = document.createElement("div");
app.before(legacyRegion);

async function initialize() {
  app.textContent = "Wczytywanie lokalnej bazy…";
  loaded = await loadWorkspace();
  if (!loaded.ok) { loadError = loaded; render(); return; }
  loadError = null;
  workspace = loaded.workspace;
  etag = loaded.etag;
  stale = false;
  pendingWorkspace = null;
  migrationPending = loaded.empty && legacy.ok && Boolean(legacy.workspace);
  render();
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toast(message, kind = "success") {
  const node = document.createElement("div");
  node.className = `toast toast-${kind}`;
  node.textContent = message;
  toastRegion.append(node);
  setTimeout(() => node.remove(), 4200);
}

async function persist(next, successMessage = "Zapisano zmiany.", options = {}) {
  if (saving) return { ok: false, error: "Zapis już trwa. Poczekaj na wynik." };
  if (stale) return { ok: false, error: "Baza mogła się zmienić. Pobierz niezapisane dane, a następnie wczytaj aktualną bazę." };
  next.updatedAt = new Date().toISOString();
  pendingWorkspace = structuredClone(next);
  saving = true;
  const result = await saveWorkspace(next, etag, fetch, options);
  saving = false;
  if (!result.ok) {
    // A lost HTTP response can hide a successful commit. Never retry blindly.
    if (result.status === 412 || result.status >= 500 || ["NETWORK_ERROR", "UNCERTAIN_SAVE", "MISSING_ETAG", "INVALID_RESPONSE"].includes(result.code)) stale = true;
    showPendingRecovery(result.error);
    return result;
  }
  workspace = result.workspace || next;
  etag = result.etag;
  pendingWorkspace = null;
  document.querySelector("#pending-recovery")?.remove();
  if (successMessage) toast(successMessage);
  return result;
}

function showPendingRecovery(message) {
  document.querySelector("#pending-recovery")?.remove();
  const panel = document.createElement("div");
  panel.id = "pending-recovery";
  panel.className = "notice warning";
  const text = document.createElement("p");
  text.textContent = message;
  const backup = document.createElement("button");
  backup.className = "button button-secondary";
  backup.textContent = "Pobierz niezapisane dane";
  backup.onclick = () => downloadJson(pendingWorkspace || workspace);
  const reload = document.createElement("button");
  reload.className = "button button-secondary";
  reload.textContent = "Wczytaj aktualną bazę";
  reload.onclick = async () => {
    if (await confirmAction({ title: "Wczytać aktualny plik?", description: "Najpierw pobierz niezapisane dane. Wczytanie zastąpi bieżący formularz.", confirmLabel: "Wczytaj plik" })) {
      panel.remove(); await initialize();
    }
  };
  panel.append(text, backup, reload);
  app.before(panel);
}

function renderLegacyNotice() {
  legacyRegion.replaceChildren();
  if (!legacy.present || legacyDismissed || migrationPending) return;
  legacyRegion.className = "notice warning legacy-notice";
  const text = document.createElement("p");
  text.textContent = legacy.ok
    ? "Znaleziono starą kopię przeglądarki. Aktywne dane pochodzą wyłącznie z pliku. Możesz pobrać starą kopię jako JSON; nie scalamy jej automatycznie."
    : `Stara baza przeglądarki wymaga uwagi: ${legacy.error}`;
  legacyRegion.append(text);
  if (legacy.raw != null) {
    const backup = document.createElement("button");
    backup.className = "button button-secondary";
    backup.textContent = "Pobierz starą bazę JSON";
    backup.onclick = () => legacy.ok ? downloadJson(legacy.workspace) : downloadRaw(legacy.raw);
    legacyRegion.append(backup);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "button button-ghost";
  dismiss.textContent = "Ukryj komunikat";
  dismiss.onclick = () => { legacyDismissed = true; renderLegacyNotice(); };
  legacyRegion.append(dismiss);
}

function renderMigration() {
  app.innerHTML = `<main class="recovery"><section class="panel"><p class="eyebrow">Przeniesienie starej bazy</p><h1>Znaleziono dane w tej przeglądarce.</h1><p>Baza plikowa jest pusta. Stara kopia zawiera ${legacy.workspace.leads.length} firm oraz ustawienia ICP. Przeniesienie wymaga Twojego potwierdzenia. Po udanym zapisie data/workspace.json będzie jedyną aktywną bazą, a niezmieniona stara kopia zostanie usunięta z localStorage.</p><div class="form-actions"><button id="migrate" class="button button-primary">Przenieś dane do pliku</button><button id="legacy-export" class="button button-secondary">Pobierz starą bazę JSON</button><button id="skip-migration" class="button button-ghost">Używaj pliku bez migracji</button></div><p id="migration-error" role="alert"></p></section></main>`;
  app.querySelector("#legacy-export").onclick = () => downloadJson(legacy.workspace);
  app.querySelector("#skip-migration").onclick = async () => {
    if (await confirmAction({ title: "Kontynuować bez przeniesienia?", description: "Stare dane pozostaną w przeglądarce jako nieaktywna kopia. Nowe zmiany będą zapisywane tylko w pliku.", confirmLabel: "Używaj pliku" })) { migrationPending = false; render(); }
  };
  app.querySelector("#migrate").onclick = async () => {
    const confirmed = await confirmAction({ title: "Przenieść starą bazę do pliku?", description: "Zapiszemy pełny dokument wraz z ICP i historią. Najpierw możesz pobrać starą bazę jako JSON.", confirmLabel: "Potwierdzam przeniesienie" });
    if (!confirmed) return;
    const buttons = [...app.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    const result = await migrateLegacyWorkspace({ legacy, current: loaded, confirmed, save: saveWorkspace });
    if (!result.ok) {
      buttons.forEach((button) => { button.disabled = false; });
      app.querySelector("#migration-error").textContent = `${result.error} Stara kopia pozostała w przeglądarce. Pobierz ją przed odświeżeniem i ponownym odczytem bazy.`;
      // An uncertain response is resolved by reading the file, not another PUT.
      app.querySelector("#migrate").disabled = true;
      return;
    }
    workspace = result.workspace || legacy.workspace;
    etag = result.etag;
    migrationPending = false;
    legacy = readLegacyWorkspace();
    if (result.cleanupWarning) toast(result.cleanupWarning, "error");
    else toast("Przeniesiono dane do pliku projektu.");
    render();
  };
}

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function parseRoute() {
  const hash = location.hash || "#/leads";
  if (hash === "#/settings") return { name: "settings" };
  const match = hash.match(/^#\/leads\/([^/]+)$/);
  if (match) return { name: "detail", id: decodeURIComponent(match[1]) };
  return { name: "leads" };
}

function replaceLead(nextLead, message) {
  const next = structuredClone(workspace);
  const index = next.leads.findIndex((item) => item.id === nextLead.id);
  if (index < 0) return { ok: false, error: "Nie znaleziono firmy." };
  next.leads[index] = nextLead;
  return persist(next, message);
}

async function askBeforeLeaving({ dirty, save }) {
  if (!dirty) { navigate("#/leads"); return; }
  choiceDialog.showModal();
  const result = await new Promise((resolve) => choiceDialog.addEventListener("close", () => resolve(choiceDialog.returnValue), { once: true }));
  if (result === "save") {
    if (await save()) navigate("#/leads");
  } else if (result === "discard") navigate("#/leads");
}

async function addLead() {
  const added = await openAddLeadDialog({ icp: workspace.settings.icp, onNotice: toast });
  if (!added) return;
  const { lead } = added;
  const next = structuredClone(workspace);
  next.leads.unshift(lead);
  const result = await persist(next, added.mode === "ai" ? "Dodano leada z danych przygotowanych przez AI." : "Dodano firmę.");
  if (!result.ok) { toast(result.error, "error"); return; }
  navigate(`#/leads/${lead.id}`);
}

function leadRecipient(lead) {
  if (lead.channel === "email") return lead.contact.email;
  if (lead.channel === "linkedin") return lead.contact.linkedinUrl;
  return lead.contact.formUrl;
}

async function copyLeadMessage(lead) {
  const text = lead.channel === "email" && lead.draft.subject ? `${lead.draft.subject}\n\n${lead.draft.body}` : lead.draft.body;
  try { await navigator.clipboard.writeText(text); toast("Skopiowano wiadomość. Nic nie zostało wysłane."); }
  catch { toast("Przeglądarka nie pozwoliła skopiować wiadomości.", "error"); }
}

async function copyContactHistory(lead) {
  try {
    await navigator.clipboard.writeText(buildContactHistoryText(lead));
    toast("Skopiowano historię kontaktu. Nic nie zostało wysłane.");
  } catch {
    toast("Przeglądarka nie pozwoliła skopiować historii kontaktu.", "error");
  }
}

async function createContactPrompt(lead) {
  const answer = await requestForm({
    eyebrow: "Asystent AI",
    title: "Prompt na podstawie historii kontaktu",
    description: "Sprawdź treść przed skopiowaniem. Aplikacja nie wysyła danych do AI ani wiadomości do leada.",
    fields: [{ name: "prompt", label: "Gotowy prompt", multiline: true, rows: 16, value: buildAiContactPrompt(lead), required: true }],
    confirmLabel: "Kopiuj prompt",
  });
  if (!answer) return;
  try {
    await navigator.clipboard.writeText(answer.prompt);
    toast("Skopiowano prompt. Nic nie zostało wysłane.");
  } catch {
    toast("Przeglądarka nie pozwoliła skopiować promptu.", "error");
  }
}

function localInputToIso(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    toast(`Pole „${label}” zawiera nieprawidłową datę i czas.`, "error");
    return null;
  }
  return date.toISOString();
}

async function quickTransition(lead, action, payload, message) {
  const current = workspace.leads.find((item) => item.id === lead.id);
  const transition = transitionLead(current, action, payload);
  if (!transition.ok) { toast(transition.error, "error"); return transition; }
  const result = await replaceLead(transition.lead, message);
  if (!result.ok) toast(result.error, "error");
  else render();
  return result;
}

async function handleQuickAction(id, action) {
  const lead = workspace.leads.find((item) => item.id === id);
  if (!lead) { toast("Nie znaleziono firmy.", "error"); return; }
  if (["continue_research", "review"].includes(action)) { navigate(`#/leads/${id}`); return; }
  if (action === "copy") { await copyLeadMessage(lead); return; }
  if (action === "copy_history") { await copyContactHistory(lead); return; }
  if (action === "create_prompt") { await createContactPrompt(lead); return; }
  if (action === "start_research") { await quickTransition(lead, action, {}, "Rozpoczęto research."); return; }
  if (action === "mark_sent") {
    const answer = await requestForm({
      eyebrow: "Ręczne wysłanie",
      title: "Oznacz wiadomość jako wysłaną",
      description: `Odbiorca: ${leadRecipient(lead)}. Aplikacja tylko zapisze zdarzenie — nie wysyła wiadomości.`,
      fields: [{ name: "sentAt", label: "Data i czas ręcznego wysłania", type: "datetime-local", value: toDateTimeLocal(), required: true }],
      confirmLabel: "Zapisz jako wysłane",
    });
    if (!answer) return;
    const sentAt = localInputToIso(answer.sentAt, "Data i czas ręcznego wysłania");
    if (sentAt) await quickTransition(lead, action, { sentAt }, "Zapisano ręczne wysłanie. Aplikacja niczego nie wysłała.");
    return;
  }
  if (action === "mark_replied") {
    const answer = await requestForm({
      eyebrow: "Odpowiedź",
      title: "Dodaj odpowiedź",
      description: "Zapisujesz odpowiedź otrzymaną poza aplikacją.",
      fields: [
        { name: "body", label: "Treść lub krótkie streszczenie", multiline: true, required: true },
        { name: "repliedAt", label: "Data i czas odpowiedzi", type: "datetime-local", value: toDateTimeLocal(), required: true },
        { name: "channel", label: "Kanał", value: lead.channel || "email", required: true, options: [{ value: "email", label: "E-mail" }, { value: "linkedin", label: "LinkedIn" }, { value: "contact_form", label: "Formularz" }] },
        { name: "note", label: "Dodatkowa notatka", multiline: true },
        { name: "nextStep", label: "Następny krok", multiline: true },
      ],
      confirmLabel: "Dodaj odpowiedź",
    });
    if (!answer) return;
    const repliedAt = localInputToIso(answer.repliedAt, "Data i czas odpowiedzi");
    if (repliedAt) await quickTransition(lead, action, { ...answer, repliedAt }, "Dodano odpowiedź do historii.");
    return;
  }
  if (action === "set_followup") {
    const answer = await requestForm({
      eyebrow: "Plan kontaktu",
      title: "Ustaw follow-up",
      description: "To tylko lokalne przypomnienie. Aplikacja nie wyśle wiadomości automatycznie.",
      fields: [
        { name: "dueDate", label: "Termin", type: "date", value: lead.followUp.dueDate || "", required: true },
        { name: "note", label: "Notatka", multiline: true, value: lead.followUp.note },
      ],
      confirmLabel: "Ustaw follow-up",
    });
    if (!answer) return;
    const updated = editLead(lead, { followUp: { dueDate: answer.dueDate, note: answer.note.trim() } });
    const result = await replaceLead(updated, "Ustawiono lokalny termin follow-upu.");
    if (!result.ok) toast(result.error, "error"); else render();
    return;
  }
  if (action === "add_note") {
    const answer = await requestForm({ eyebrow: "Historia kontaktu", title: "Dodaj notatkę", fields: [{ name: "note", label: "Notatka", multiline: true, required: true }, { name: "occurredAt", label: "Data i czas", type: "datetime-local", value: toDateTimeLocal(), required: true }], confirmLabel: "Dodaj notatkę" });
    if (!answer) return;
    const occurredAt = localInputToIso(answer.occurredAt, "Data i czas");
    if (occurredAt) await quickTransition(lead, action, { note: answer.note, occurredAt }, "Dodano notatkę do historii.");
    return;
  }
  if (action === "set_next_step") {
    const answer = await requestForm({ eyebrow: "Dalsze działanie", title: "Ustaw kolejny krok", fields: [{ name: "nextStep", label: "Co robimy dalej?", multiline: true, required: true }, { name: "note", label: "Notatka do historii", multiline: true, required: true }], confirmLabel: "Zapisz kolejny krok" });
    if (!answer) return;
    await quickTransition(lead, "add_note", { note: answer.note, nextStep: answer.nextStep }, "Zapisano kolejny krok w historii.");
    return;
  }
  if (action === "reject") {
    const answer = await requestForm({ eyebrow: "Zamknięcie kontaktu", title: "Odrzucić ten kontakt?", description: "Kontakt zostanie zamknięty, ale jego historia pozostanie zachowana.", fields: [{ name: "reason", label: "Powód odrzucenia", multiline: true, required: true }], confirmLabel: "Odrzuć kontakt", danger: true });
    if (answer) await quickTransition(lead, action, { reason: answer.reason }, "Kontakt został odrzucony.");
  }
}

function renderRecovery() {
  app.innerHTML = `<main class="recovery"><div class="panel"><p class="eyebrow">Błąd lokalnej bazy</p><h1>Nie nadpisaliśmy Twoich danych.</h1><p>Sprawdź, czy działa lokalny serwer Node. Gdy plik jest uszkodzony, zatrzymaj serwer i zachowaj uszkodzony data/workspace.json, a następnie przywróć poprawną kopię z data/backups. Nie zastępuj go pustą bazą.</p><pre>${escapeHtml(loadError.error)}</pre><button class="button button-primary" id="retry">Spróbuj ponownie</button></div></main>`;
  app.querySelector("#retry").onclick = initialize;
}

function render() {
  renderLegacyNotice();
  if (loadError) { renderRecovery(); return; }
  if (!workspace) return;
  if (migrationPending) { renderMigration(); return; }
  const route = parseRoute();
  if (route.name === "leads") {
    const today = localToday();
    mountLeads(app, {
      workspace,
      filters,
      today,
      onFilter: (next) => { Object.assign(filters, next); render(); },
      onAdd: addLead,
      onOpen: (id) => navigate(`#/leads/${id}`),
      onQuickAction: handleQuickAction,
      onSettings: () => navigate("#/settings"),
    });
    if (!followUpPopupChecked) {
      followUpPopupChecked = true;
      mountFollowUpPopup(app, {
        count: countDueFollowUps(workspace.leads, today),
        onShow: () => {
          Object.assign(filters, { query: "", status: "", quick: "followup" });
          render();
        },
      });
    }
    return;
  }
  if (route.name === "settings") {
    mountSettings(app, {
      workspace,
      onBack: () => navigate("#/leads"),
      onSaveIcp: async (icp, affected) => {
        if (affected && !await confirmAction({ eyebrow: "Zmiana ICP", title: "Ponownie ocenić kontakty?", description: `Zmiana cofnie ${affected} kontakt(y) do researchu i wyzeruje dopasowanie do ICP.`, confirmLabel: "Zmień ICP" })) return;
        const result = await persist(changeIcp(workspace, icp), "Zapisano ICP i zaktualizowano kwalifikację.");
        if (!result.ok) toast(result.error, "error");
        else render();
        return result;
      },
      onExport: () => downloadJson(workspace),
      onImport: async (file) => {
        if (!file) return;
        const parsed = parseImport(await file.text());
        if (!parsed.ok) { toast(parsed.error, "error"); return; }
        const proceed = await confirmAction({ eyebrow: "Import kopii", title: `Zastąpić bazę ${parsed.count} rekordami?`, description: "Import nie scala danych. Obecna baza zostanie zastąpiona w całości.", confirmLabel: "Przejdź dalej" });
        if (!proceed) return;
        if (workspace.leads.length) {
          const backup = await confirmAction({ eyebrow: "Kopia bezpieczeństwa", title: "Pobrać obecną bazę przed importem?", description: "Możesz pobrać dodatkową kopię. Serwer zachowa również poprzednią poprawną wersję lokalnie.", confirmLabel: "Pobierz kopię" });
          if (backup) downloadJson(workspace);
        }
        if (!await confirmAction({ eyebrow: "Ostatnie potwierdzenie", title: "Zastąpić całą lokalną bazę?", description: "Serwer utworzy kopię poprzedniej poprawnej wersji przed zastąpieniem.", confirmLabel: "Zastąp bazę", danger: true })) return;
        const result = await persist(parsed.workspace, "Zaimportowano pełną kopię bazy.", { replace: true });
        if (!result.ok) toast(result.error, "error");
        else navigate("#/leads");
        return result;
      },
    });
    return;
  }

  const lead = workspace.leads.find((item) => item.id === route.id);
  if (!lead) {
    app.innerHTML = '<main class="recovery"><div class="panel"><p class="eyebrow">Nieznany kontakt</p><h1>Nie znaleziono tej firmy.</h1><button class="button button-primary" id="home">Wróć do listy</button></div></main>';
    app.querySelector("#home").addEventListener("click", () => navigate("#/leads"));
    return;
  }
  mountLeadDetail(app, {
    lead,
    icp: workspace.settings.icp,
    onBack: askBeforeLeaving,
    onSave: (edits) => {
      if (!edits.companyName) return { ok: false, error: "Nazwa firmy jest wymagana." };
      const current = workspace.leads.find((item) => item.id === lead.id);
      return replaceLead(editLead(current, edits), "Zapisano kartę firmy.");
    },
    onAction: async (action, payload) => {
      if (action === "refresh") { render(); return { ok: true }; }
      const current = workspace.leads.find((item) => item.id === lead.id);
      const transition = transitionLead(current, action, payload);
      if (!transition.ok) { toast(transition.error, "error"); return transition; }
      const result = await replaceLead(transition.lead, "Zapisano zmianę etapu.");
      if (!result.ok) toast(result.error, "error");
      else render();
      return result;
    },
    onExportDraft: (edits) => {
      const next = structuredClone(workspace);
      const index = next.leads.findIndex((item) => item.id === lead.id);
      next.leads[index] = editLead(next.leads[index], edits);
      downloadJson(next);
    },
    onCopy: async () => copyLeadMessage(workspace.leads.find((item) => item.id === lead.id)),
    dialogs: { requestForm, confirmAction },
  });
}

window.addEventListener("hashchange", render);
window.addEventListener("beforeunload", (event) => {
  if (saving || pendingWorkspace) { event.preventDefault(); event.returnValue = ""; }
});

if (!location.hash) location.hash = "#/leads";
await initialize();
