const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function requestForm({ eyebrow = "Potwierdzenie", title, description = "", fields = [], confirmLabel = "Potwierdź", danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "choice-dialog request-dialog";
    dialog.innerHTML = `<form method="dialog">
      <p class="eyebrow">${escapeHtml(eyebrow)}</p>
      <h2>${escapeHtml(title)}</h2>
      ${description ? `<p>${escapeHtml(description)}</p>` : ""}
      <div class="dialog-fields">${fields.map((field) => {
        if (field.options) return `<label>${escapeHtml(field.label)}<select name="${escapeHtml(field.name)}" ${field.required ? "required" : ""}>${field.options.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === field.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}</select></label>`;
        if (field.multiline) return `<label>${escapeHtml(field.label)}<textarea name="${escapeHtml(field.name)}" rows="${Number.isInteger(field.rows) ? Math.min(Math.max(field.rows, 2), 20) : 4}" ${field.required ? "required" : ""}>${escapeHtml(field.value || "")}</textarea></label>`;
        return `<label>${escapeHtml(field.label)}<input name="${escapeHtml(field.name)}" type="${escapeHtml(field.type || "text")}" ${field.type === "datetime-local" ? 'step="0.001"' : ""} value="${escapeHtml(field.value || "")}" ${field.required ? "required" : ""}></label>`;
      }).join("")}</div>
      <div class="dialog-actions"><button type="button" class="button button-ghost" data-cancel>Anuluj</button><button type="submit" class="button ${danger ? "button-danger" : "button-primary"}">${escapeHtml(confirmLabel)}</button></div>
    </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector("form");
    const finish = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      finish(Object.fromEntries(new FormData(form).entries()));
    });
    dialog.showModal();
    dialog.querySelector("input, textarea, select")?.focus();
  });
}

export async function confirmAction(options) {
  return (await requestForm({ ...options, fields: [] })) !== null;
}
