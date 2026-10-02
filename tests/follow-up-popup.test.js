import test from "node:test";
import assert from "node:assert/strict";
import { followUpAttentionText } from "../src/views/follow-up-popup.js";

test("komunikat popupu odmienia liczbę follow-upów", () => {
  assert.equal(followUpAttentionText(1), "Masz 1 follow-up wymagający uwagi.");
  assert.equal(followUpAttentionText(3), "Masz 3 follow-upy wymagające uwagi.");
  assert.equal(followUpAttentionText(5), "Masz 5 follow-upów wymagających uwagi.");
  assert.equal(followUpAttentionText(12), "Masz 12 follow-upów wymagających uwagi.");
});
