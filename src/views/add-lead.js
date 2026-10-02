import { buildAiLeadPrompt, parseAiLeadText } from "../ai-lead.js";
import { createLead } from "../domain.js";

export function openAddLeadDialog({ icp, onNotice }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "choice-dialog add-lead-dialog";
    dialog.innerHTML = `<div>
      <div class="dialog-title-row"><div><p class="eyebrow">Nowy lead</p><h2>Dodaj firmę</h2></div><button type="button" class="icon-button" data-close aria-label="Zamknij">×</button></div>
      <section class="add-method">
        <h3>Szybko, ręcznie</h3>
        <p>Podaj nazwę firmy. Pozostałe dane uzupełnisz na jej karcie.</p>
        <form id="manual-lead-form" class="inline-add-form"><label>Nazwa firmy<input name="companyName" required autocomplete="organization"></label><button class="button button-primary" type="submit">Dodaj firmę</button></form>
      </section>
      <div class="add-divider"><span>lub</span></div>
      <section class="add-method ai-add-method">
        <div class="method-heading"><div><h3>Wklej dane przygotowane przez AI</h3><p>Bez integracji i bez klucza API. Ty kopiujesz instrukcję i wklejasz gotowy JSON.</p></div><button class="button button-secondary" type="button" id="copy-ai-prompt">Kopiuj instrukcję dla AI</button></div>
        <form id="ai-lead-form">
          <label>Jedno pole z odpowiedzią AI<textarea name="aiLead" rows="9" required placeholder='Wklej tutaj obiekt JSON zaczynający się od { "companyName": ... }'></textarea></label>
          <div id="ai-lead-error" class="notice danger" role="alert" hidden></div>
          <details class="ai-instructions"><summary>Jak przygotować dane dla AI?</summary><ol><li>Skopiuj instrukcję przyciskiem powyżej.</li><li>Wklej ją do wybranego narzędzia AI i zastąp blok „DANE ŹRÓDŁOWE” faktami oraz linkami.</li><li>Nie proś AI o zgadywanie danych kontaktowych. Braki mają pozostać puste.</li><li>Wklej tutaj wyłącznie otrzymany JSON i sprawdź kartę firmy przed dalszym workflow.</li></ol></details>
          <div class="dialog-actions"><button class="button button-primary" type="submit">Dodaj leada z danych AI</button></div>
        </form>
      </section>
    </div>`;
    document.body.append(dialog);
    const finish = (value) => { dialog.close(); dialog.remove(); resolve(value); };
    dialog.querySelector("[data-close]").addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
    dialog.querySelector("#manual-lead-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      finish({ lead: createLead(new FormData(event.currentTarget).get("companyName")), mode: "manual" });
    });
    dialog.querySelector("#copy-ai-prompt").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(buildAiLeadPrompt(icp));
        onNotice("Skopiowano instrukcję. Wklej ją do wybranego AI.");
      } catch {
        onNotice("Nie udało się skopiować. Spróbuj ponownie po zezwoleniu przeglądarki.", "error");
      }
    });
    dialog.querySelector("#ai-lead-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const parsed = parseAiLeadText(new FormData(event.currentTarget).get("aiLead"));
      const error = dialog.querySelector("#ai-lead-error");
      if (!parsed.ok) { error.textContent = parsed.error; error.hidden = false; return; }
      finish({ lead: parsed.lead, mode: "ai" });
    });
    dialog.showModal();
    dialog.querySelector('[name="companyName"]').focus();
  });
}
