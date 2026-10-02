import { escapeHtml } from "./helpers.js";

export function mountSettings(root, { workspace, onBack, onSaveIcp, onExport, onImport }) {
  const affected = workspace.leads.filter((lead) => ["draft_ready", "approved"].includes(lead.status)).length;
  const icp = workspace.settings.icp;
  root.innerHTML = `
    <div class="shell narrow-shell">
      <header class="detail-header"><button class="back-link" id="back">← Lista firm</button><div class="brand-mini">KAIROX / Ustawienia</div></header>
      <main>
        <section class="page-heading"><p class="eyebrow">Ustawienia workspace</p><h1>ICP i kopia danych</h1><p>Jedno miejsce na definicję właściwego klienta i bezpieczną kopię bazy.</p></section>
        <form id="icp-form" class="panel form-panel">
          <div class="section-heading"><div><p class="step-number">01</p><h2>Idealny klient</h2></div><p>Zmiana ICP wymusi ponowną ocenę niewysłanych kontaktów.</p></div>
          <label>Docelowa firma<textarea name="target" rows="3" placeholder="Branża, wielkość, lokalizacja…">${escapeHtml(icp.target)}</textarea></label>
          <label>Potrzeba<textarea name="need" rows="3" placeholder="Jaki problem KAIROX realnie rozwiązuje?">${escapeHtml(icp.need)}</textarea></label>
          <label>Wykluczenia<textarea name="exclude" rows="3" placeholder="Kogo świadomie nie kontaktujemy?">${escapeHtml(icp.exclude)}</textarea></label>
          ${affected ? `<p class="notice warning">Zmiana cofnie ${affected} ${affected === 1 ? "kontakt" : "kontakty"} do etapu researchu i wyzeruje ich ocenę dopasowania do ICP.</p>` : ""}
          <div id="settings-error" class="notice danger" role="alert" hidden></div>
          <div class="form-actions"><button class="button button-primary" type="submit">Zapisz ICP</button></div>
        </form>
        <section class="panel form-panel">
          <div class="section-heading"><div><p class="step-number">02</p><h2>Kopia danych</h2></div><p>Dane są zapisane w pliku <code>data/workspace.json</code>.</p></div>
          <div class="backup-grid">
            <div><h3>Eksport JSON</h3><p>Pobierz pełną bazę: firmy, ICP, notatki i historię kontaktów.</p><button class="button button-secondary" id="export">Pobierz kopię</button></div>
            <div><h3>Import JSON</h3><p>Poprawny plik zastąpi całą obecną bazę po dodatkowym potwierdzeniu.</p><label class="button button-secondary file-button">Wybierz plik<input id="import" type="file" accept="application/json,.json"></label></div>
          </div>
        </section>
      </main>
    </div>`;
  const form = root.querySelector("#icp-form");
  const errorBox = root.querySelector("#settings-error");
  let busy = false;
  const showError = (message) => { errorBox.textContent = message; errorBox.hidden = false; };
  const runBusy = async (callback) => {
    if (busy) return;
    busy = true;
    const controls = [...root.querySelectorAll("button, input, textarea")];
    const disabled = controls.map((control) => control.disabled);
    controls.forEach((control) => { control.disabled = true; });
    try { return await callback(); } finally {
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
      busy = false;
    }
  };

  root.querySelector("#back").addEventListener("click", onBack);
  root.querySelector("#export").addEventListener("click", onExport);
  root.querySelector("#import").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    await runBusy(async () => {
      try {
        const result = await onImport(file);
        if (result?.ok === false) showError(result.error || "Nie udało się zaimportować danych.");
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    });
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await runBusy(async () => {
      try {
        const result = await onSaveIcp({ target: data.get("target"), need: data.get("need"), exclude: data.get("exclude") }, affected);
        if (result?.ok === false) showError(result.error || "Nie udało się zapisać ICP.");
        else errorBox.hidden = true;
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
      }
    });
  });
}
