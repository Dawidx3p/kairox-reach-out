import { statusLabel } from "../statuses.js";
import { MAX_FOLLOW_UPS, needsCloseOrDefer } from "../domain.js";
import { escapeHtml, localDateTime, toDateTimeLocal } from "./helpers.js";
import { renderContactHistory } from "./contact-history.js";

const qOptions = (value) => `
  <option value="" ${value === null ? "selected" : ""}>Nieocenione</option>
  <option value="true" ${value === true ? "selected" : ""}>Tak</option>
  <option value="false" ${value === false ? "selected" : ""}>Nie</option>`;

function actionMarkup(lead) {
  if (lead.status === "new") return '<button type="button" class="button button-primary" data-action="start_research">Rozpocznij research</button>';
  if (lead.status === "research") return '<button type="button" class="button button-primary" data-action="submit_for_approval">Przekaż do akceptacji</button>';
  if (lead.status === "draft_ready") return '<button type="button" class="button button-primary" data-action="approve">Zatwierdź wiadomość</button>';
  if (lead.status === "approved") return '<button type="button" class="button button-secondary" data-action="copy">Kopiuj wiadomość</button><button type="button" class="button button-primary" data-action="mark_sent">Oznacz jako wysłane</button>';
  if (["sent", "replied"].includes(lead.status)) return '<button type="button" class="button button-secondary" data-action="copy">Kopiuj wysłaną wiadomość</button>';
  return "";
}

function sourceRow(source = { url: "", note: "" }) {
  return `<div class="source-row"><label>URL źródła<input name="sourceUrl" type="url" placeholder="https://…" value="${escapeHtml(source.url)}"></label><label>Notatka<input name="sourceNote" placeholder="Co potwierdza źródło?" value="${escapeHtml(source.note)}"></label><button class="icon-button remove-source" type="button" aria-label="Usuń źródło">×</button></div>`;
}

function collect(form) {
  const value = (name) => form.elements.namedItem(name)?.value ?? "";
  const choice = (name) => value(name) === "" ? null : value(name) === "true";
  const urls = [...form.querySelectorAll('[name="sourceUrl"]')];
  const notes = [...form.querySelectorAll('[name="sourceNote"]')];
  const sources = urls.map((input, index) => ({ url: input.value.trim(), note: notes[index].value.trim() })).filter((source) => source.url || source.note);
  return {
    companyName: String(value("companyName")).trim(),
    website: String(value("website")).trim(),
    industry: String(value("industry")).trim(),
    city: String(value("city")).trim(),
    contact: {
      name: String(value("contactName")).trim(),
      role: String(value("contactRole")).trim(),
      email: String(value("contactEmail")).trim(),
      linkedinUrl: String(value("linkedinUrl")).trim(),
      formUrl: String(value("formUrl")).trim(),
    },
    channel: value("channel") || null,
    research: {
      summary: String(value("summary")).trim(),
      need: String(value("need")).trim(),
      contactReason: String(value("contactReason")).trim(),
      sources,
    },
    qualification: {
      icpFit: choice("icpFit"),
      needIdentified: choice("needIdentified"),
      contactSuitable: choice("contactSuitable"),
      reasonCredible: choice("reasonCredible"),
    },
    draft: {
      subject: String(value("subject")).trim(),
      body: String(value("body")).trim(),
    },
    notes: String(value("notes")).trim(),
    followUp: {
      dueDate: value("followUpDate") || null,
      note: String(value("followUpNote")).trim(),
    },
  };
}

export function mountLeadDetail(root, { lead, icp, onBack, onSave, onAction, onCopy, onExportDraft, dialogs }) {
  const locked = ["sent", "replied", "rejected"].includes(lead.status);
  const followupCount = lead.followUpLog.length;
  const followupEnabled = ["sent", "replied"].includes(lead.status) && followupCount < MAX_FOLLOW_UPS;
  const decisionRequired = needsCloseOrDefer(lead);
  const sources = lead.research.sources.length ? lead.research.sources : [{ url: "", note: "" }];
  root.innerHTML = `
    <div class="shell narrow-shell">
      <header class="detail-header"><button class="back-link" id="back">← Lista firm</button><div class="unsaved" id="unsaved" hidden>● Niezapisane zmiany</div></header>
      <main>
        <section class="detail-title"><div><p class="eyebrow">Karta firmy</p><h1>${escapeHtml(lead.companyName)}</h1></div><span class="status status-${lead.status}">${escapeHtml(statusLabel(lead.status))}</span></section>
        ${lead.status === "rejected" ? `<div class="notice danger"><strong>Kontakt zamknięty.</strong> ${escapeHtml(lead.rejectionReason)}</div>` : ""}
        ${decisionRequired ? '<div class="notice warning"><strong>Wykonano dwa follow-upy bez odpowiedzi.</strong> Ten lead wymaga decyzji: zamknij kontakt albo odłóż go, zapisując decyzję i termin w notatkach.</div>' : ""}
        <form id="lead-form" novalidate>
          <section class="panel form-panel">
            <div class="section-heading"><div><p class="step-number">01</p><h2>Firma i kontakt</h2></div><p>Minimum konkretów potrzebnych do świadomego kontaktu.</p></div>
            <div class="form-grid two-cols">
              <label>Nazwa firmy *<input name="companyName" required value="${escapeHtml(lead.companyName)}"></label>
              <label>Strona WWW<input name="website" type="url" placeholder="https://…" value="${escapeHtml(lead.website)}"></label>
              <label>Branża<input name="industry" value="${escapeHtml(lead.industry)}"></label>
              <label>Miasto<input name="city" value="${escapeHtml(lead.city)}"></label>
            </div>
            <div class="form-grid two-cols divider-top">
              <label>Osoba kontaktowa<input name="contactName" ${locked ? "disabled" : ""} value="${escapeHtml(lead.contact.name)}"></label>
              <label>Rola<input name="contactRole" ${locked ? "disabled" : ""} value="${escapeHtml(lead.contact.role)}"></label>
              <label>E-mail<input name="contactEmail" type="email" ${locked ? "disabled" : ""} value="${escapeHtml(lead.contact.email)}"></label>
              <label>Profil LinkedIn<input name="linkedinUrl" type="url" ${locked ? "disabled" : ""} value="${escapeHtml(lead.contact.linkedinUrl)}"></label>
              <label>Formularz kontaktowy<input name="formUrl" type="url" ${locked ? "disabled" : ""} value="${escapeHtml(lead.contact.formUrl)}"></label>
              <label>Kanał<select name="channel" ${locked ? "disabled" : ""}><option value="">Wybierz</option><option value="email" ${lead.channel === "email" ? "selected" : ""}>E-mail</option><option value="linkedin" ${lead.channel === "linkedin" ? "selected" : ""}>LinkedIn</option><option value="contact_form" ${lead.channel === "contact_form" ? "selected" : ""}>Formularz</option></select></label>
            </div>
          </section>
          <section class="panel form-panel">
            <div class="section-heading"><div><p class="step-number">02</p><h2>Research</h2></div><p>Fakty, nie założenia. Źródła zostają przy leadzie.</p></div>
            <label>Krótki opis firmy<textarea name="summary" rows="3">${escapeHtml(lead.research.summary)}</textarea></label>
            <div class="form-grid two-cols"><label>Potencjalna potrzeba<textarea name="need" rows="4">${escapeHtml(lead.research.need)}</textarea></label><label>Powód kontaktu<textarea name="contactReason" rows="4">${escapeHtml(lead.research.contactReason)}</textarea></label></div>
            <div id="sources" class="sources"><div class="label-row"><strong>Źródła</strong><button type="button" id="add-source" class="text-button">+ Dodaj źródło</button></div>${sources.map(sourceRow).join("")}</div>
          </section>
          <section class="panel form-panel">
            <div class="section-heading"><div><p class="step-number">03</p><h2>Kwalifikacja</h2></div><p>Każde kryterium musi mieć „Tak”, zanim szkic trafi do akceptacji.</p></div>
            <div class="qualification-grid">
              <label>Pasuje do ICP<select name="icpFit" ${locked ? "disabled" : ""}>${qOptions(lead.qualification.icpFit)}</select></label>
              <label>Potrzeba rozpoznana<select name="needIdentified" ${locked ? "disabled" : ""}>${qOptions(lead.qualification.needIdentified)}</select></label>
              <label>Kontakt jest właściwy<select name="contactSuitable" ${locked ? "disabled" : ""}>${qOptions(lead.qualification.contactSuitable)}</select></label>
              <label>Powód jest wiarygodny<select name="reasonCredible" ${locked ? "disabled" : ""}>${qOptions(lead.qualification.reasonCredible)}</select></label>
            </div>
            <details class="icp-reference"><summary>Aktualny ICP</summary><dl><div><dt>Firma</dt><dd>${escapeHtml(icp.target || "Nieuzupełnione")}</dd></div><div><dt>Potrzeba</dt><dd>${escapeHtml(icp.need || "Nieuzupełnione")}</dd></div><div><dt>Wykluczenia</dt><dd>${escapeHtml(icp.exclude || "Nieuzupełnione")}</dd></div></dl></details>
          </section>
          <section class="panel form-panel message-panel">
            <div class="section-heading"><div><p class="step-number">04</p><h2>Wiadomość</h2></div><p>${locked ? "Historyczna treść po ręcznym wysłaniu." : "Jedna wiadomość dla konkretnego odbiorcy."}</p></div>
            <label id="subject-wrap" ${lead.channel && lead.channel !== "email" ? "hidden" : ""}>Temat e-maila<input name="subject" ${locked ? "disabled" : ""} value="${escapeHtml(lead.draft.subject)}"></label>
            <label>Treść<textarea name="body" rows="10" ${locked ? "disabled" : ""} placeholder="Krótko, konkretnie i na podstawie researchu…">${escapeHtml(lead.draft.body)}</textarea></label>
            ${lead.approvedAt ? `<p class="meta-line">Zaakceptowano: ${localDateTime(lead.approvedAt)}</p>` : ""}
            ${lead.sentAt ? `<p class="meta-line">Wysłano ręcznie: ${localDateTime(lead.sentAt)}</p>` : ""}
            ${lead.repliedAt ? `<p class="meta-line">Odpowiedź: ${localDateTime(lead.repliedAt)}</p>` : ""}
          </section>
          <section class="panel form-panel contact-history-section">
            <div class="section-heading contact-history-heading"><div><p class="step-number">05</p><h2>Historia kontaktu</h2></div><div class="contact-history-actions">${["sent", "replied"].includes(lead.status) ? '<button type="button" class="button button-secondary" data-action="mark_replied">Dodaj odpowiedź</button>' : ""}<button type="button" class="button button-ghost" data-action="add_note">Dodaj notatkę do historii</button></div></div>
            ${renderContactHistory(lead)}
          </section>
          <section class="panel form-panel">
            <div class="section-heading"><div><p class="step-number">06</p><h2>Notatki i follow-up</h2></div><p>Follow-up jest dostępny po pierwszym wysłaniu; limit: 2 (${followupCount}/2).</p></div>
            <label>Notatki<textarea name="notes" rows="5">${escapeHtml(lead.notes)}</textarea></label>
            <div class="form-grid two-cols"><label>Termin follow-upu<input name="followUpDate" type="date" ${followupEnabled ? "" : "disabled"} value="${escapeHtml(lead.followUp.dueDate || "")}"></label><label>Notatka do follow-upu<input name="followUpNote" ${followupEnabled ? "" : "disabled"} value="${escapeHtml(lead.followUp.note)}"></label></div>
            ${followupEnabled ? '<button type="button" class="button button-secondary" data-action="log_followup">Zapisz wykonany follow-up</button>' : ""}
          </section>
          <div id="form-error" class="notice danger" role="alert" hidden></div>
          <button type="button" id="export-draft" class="button button-secondary" hidden>Pobierz niezapisane dane</button>
          <div class="sticky-actions"><div><button type="button" class="button button-ghost danger-text" id="reject" ${lead.status === "rejected" ? "hidden" : ""}>Odrzuć kontakt</button></div><div><button type="submit" class="button button-secondary">Zapisz zmiany</button>${actionMarkup(lead)}</div></div>
        </form>
      </main>
    </div>`;

  const form = root.querySelector("#lead-form");
  const unsaved = root.querySelector("#unsaved");
  const errorBox = root.querySelector("#form-error");
  const exportDraft = root.querySelector("#export-draft");
  let dirty = false;
  let busy = false;
  let disabledState = [];
  const actionDrafts = Object.create(null);
  const setDirty = (value) => { dirty = value; unsaved.hidden = !value; };
  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    exportDraft.hidden = typeof onExportDraft !== "function";
    errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const setBusy = (value) => {
    busy = value;
    form.setAttribute("aria-busy", String(value));
    if (value) {
      disabledState = [...form.querySelectorAll("button, input, textarea, select")].map((control) => [control, control.disabled]);
      disabledState.forEach(([control]) => { control.disabled = true; });
    } else {
      disabledState.forEach(([control, wasDisabled]) => { control.disabled = wasDisabled; });
      disabledState = [];
    }
  };
  const runBusy = async (callback) => {
    if (busy) return undefined;
    setBusy(true);
    try { return await callback(); } finally { setBusy(false); }
  };
  const save = async () => {
    if (busy) return false;
    if (!form.reportValidity()) return false;
    const edits = collect(form);
    const result = await runBusy(async () => {
      try { return await onSave(edits); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    });
    if (!result?.ok) { showError(result?.error || "Nie udało się zapisać zmian."); return false; }
    errorBox.hidden = true;
    exportDraft.hidden = true;
    setDirty(false);
    return true;
  };
  const callAction = async (action, payload) => {
    const result = await runBusy(async () => {
      try { return await onAction(action, payload); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    });
    if (!result?.ok) {
      showError(result?.error || "Nie udało się wykonać akcji.");
      return false;
    }
    return true;
  };
  const asIso = (value, fieldLabel) => {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) {
      showError(`Pole „${fieldLabel}” zawiera nieprawidłową datę i czas.`);
      return null;
    }
    return date.toISOString();
  };

  form.addEventListener("input", (event) => {
    setDirty(true);
    if (event.target.name === "channel") root.querySelector("#subject-wrap").hidden = event.target.value && event.target.value !== "email";
  });
  form.addEventListener("submit", async (event) => { event.preventDefault(); if (await save()) await callAction("refresh"); });
  root.querySelector("#back").addEventListener("click", () => onBack({ dirty, save }));
  exportDraft.addEventListener("click", () => onExportDraft?.(collect(form)));
  root.querySelector("#add-source").addEventListener("click", () => {
    root.querySelector("#sources").insertAdjacentHTML("beforeend", sourceRow());
    setDirty(true);
  });
  root.addEventListener("click", (event) => {
    const remove = event.target.closest(".remove-source");
    if (remove) { remove.closest(".source-row").remove(); setDirty(true); }
  });

  root.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.action;
    if (action === "copy") { await onCopy(lead); return; }
    if (!await save()) return;
    if (action === "mark_sent") {
      const recipient = lead.channel === "email" ? lead.contact.email : lead.channel === "linkedin" ? lead.contact.linkedinUrl : lead.contact.formUrl;
      const answer = await dialogs.requestForm({ eyebrow: "Ręczne wysłanie", title: "Potwierdź zapis wysłania", description: `Odbiorca: ${recipient}. Kanał: ${lead.channel}. Aplikacja nie wysyła wiadomości.`, fields: [{ name: "sentAt", label: "Data i czas wysłania", type: "datetime-local", value: toDateTimeLocal(), required: true }], confirmLabel: "Zapisz jako wysłane" });
      if (!answer) return;
      const sentAt = asIso(answer.sentAt, "Data i czas wysłania");
      if (!sentAt) return;
      await callAction(action, { sentAt });
      return;
    }
    if (action === "mark_replied") {
      const draft = actionDrafts.mark_replied || {};
      const answer = await dialogs.requestForm({ eyebrow: "Odpowiedź", title: "Zapisz otrzymaną odpowiedź", fields: [{ name: "body", label: "Treść lub krótkie streszczenie", multiline: true, value: draft.body, required: true }, { name: "repliedAt", label: "Data i czas odpowiedzi", type: "datetime-local", value: draft.repliedAt || toDateTimeLocal(), required: true }, { name: "channel", label: "Kanał", value: draft.channel || lead.channel || "email", required: true, options: [{ value: "email", label: "E-mail" }, { value: "linkedin", label: "LinkedIn" }, { value: "contact_form", label: "Formularz" }] }, { name: "note", label: "Dodatkowa notatka", multiline: true, value: draft.note }, { name: "nextStep", label: "Następny krok", multiline: true, value: draft.nextStep }], confirmLabel: "Dodaj odpowiedź" });
      if (!answer) return;
      actionDrafts.mark_replied = answer;
      const repliedAt = asIso(answer.repliedAt, "Data i czas odpowiedzi");
      if (!repliedAt) return;
      const saved = await callAction(action, { body: answer.body, repliedAt, channel: answer.channel, note: answer.note, nextStep: answer.nextStep });
      if (saved) delete actionDrafts.mark_replied;
      return;
    }
    if (action === "add_note") {
      const draft = actionDrafts.add_note || {};
      const answer = await dialogs.requestForm({ eyebrow: "Historia kontaktu", title: "Dodaj notatkę", fields: [{ name: "note", label: "Notatka", multiline: true, value: draft.note, required: true }, { name: "occurredAt", label: "Data i czas", type: "datetime-local", value: draft.occurredAt || toDateTimeLocal(), required: true }, { name: "channel", label: "Kanał (opcjonalnie)", value: draft.channel || "", options: [{ value: "", label: "Nie dotyczy" }, { value: "email", label: "E-mail" }, { value: "linkedin", label: "LinkedIn" }, { value: "contact_form", label: "Formularz" }] }], confirmLabel: "Dodaj notatkę" });
      if (!answer) return;
      actionDrafts.add_note = answer;
      const occurredAt = asIso(answer.occurredAt, "Data i czas");
      if (!occurredAt) return;
      const saved = await callAction(action, { note: answer.note, channel: answer.channel || null, occurredAt });
      if (saved) delete actionDrafts.add_note;
      return;
    }
    if (action === "log_followup") {
      const draft = actionDrafts.log_followup || {};
      const answer = await dialogs.requestForm({ eyebrow: "Follow-up", title: "Zapisz wykonany kontakt", fields: [{ name: "note", label: "Co zostało zrobione?", multiline: true, value: draft.note, required: true }, { name: "channel", label: "Kanał", value: draft.channel || lead.channel || "email", required: true, options: [{ value: "email", label: "E-mail" }, { value: "linkedin", label: "LinkedIn" }, { value: "contact_form", label: "Formularz" }] }, { name: "completedAt", label: "Data i czas wykonania", type: "datetime-local", value: draft.completedAt || toDateTimeLocal(), required: true }], confirmLabel: "Zapisz follow-up" });
      if (!answer) return;
      actionDrafts.log_followup = answer;
      const completedAt = asIso(answer.completedAt, "Data i czas wykonania");
      if (!completedAt) return;
      if (await callAction(action, { note: answer.note, channel: answer.channel, completedAt })) delete actionDrafts.log_followup;
      return;
    }
    await callAction(action);
  }));
  root.querySelector("#reject")?.addEventListener("click", async () => {
    const answer = await dialogs.requestForm({ eyebrow: "Zamknięcie kontaktu", title: "Odrzucić ten kontakt?", description: "Kontakt zostanie zamknięty bez możliwości przywrócenia w MVP.", fields: [{ name: "reason", label: "Powód odrzucenia", multiline: true, required: true }], confirmLabel: "Odrzuć kontakt", danger: true });
    if (answer && await save()) await callAction("reject", { reason: answer.reason });
  });
}
