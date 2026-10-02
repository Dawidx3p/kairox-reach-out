export function followUpAttentionText(count) {
  if (count === 1) return "Masz 1 follow-up wymagający uwagi.";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `Masz ${count} follow-upy wymagające uwagi.`;
  }
  return `Masz ${count} follow-upów wymagających uwagi.`;
}

export function mountFollowUpPopup(root, { count, onShow }) {
  if (count < 1) return;
  const panel = document.createElement("section");
  panel.className = "follow-up-popup";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "follow-up-popup-title");
  panel.innerHTML = `
    <div class="follow-up-popup-copy">
      <p class="eyebrow">Plan kontaktów</p>
      <h2 id="follow-up-popup-title">Follow-upy do ogarnięcia</h2>
      <p>${followUpAttentionText(count)}</p>
    </div>
    <button type="button" class="icon-button follow-up-popup-close" aria-label="Zamknij powiadomienie">×</button>
    <div class="dialog-actions follow-up-popup-actions">
      <button type="button" class="button button-ghost" data-later>Później</button>
      <button type="button" class="button button-primary" data-show>Pokaż follow-upy</button>
    </div>`;

  const finish = () => panel.remove();
  panel.querySelector("[data-later]").addEventListener("click", finish);
  panel.querySelector(".follow-up-popup-close").addEventListener("click", finish);
  panel.querySelector("[data-show]").addEventListener("click", () => {
    finish();
    onShow();
  });
  root.querySelector(".filter-panel")?.before(panel);
  panel.querySelector("[data-show]").focus();
}
