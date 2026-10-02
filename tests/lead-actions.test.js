import test from "node:test";
import assert from "node:assert/strict";
import { createLead } from "../src/domain.js";
import { leadQuickActions } from "../src/lead-actions.js";

const ids = (lead) => leadQuickActions(lead).map((item) => item.id);
const leadAt = (status, followUps = 0) => {
  const lead = createLead("Firma", new Date("2026-10-02T10:00:00.000Z"), "11111111-1111-4111-8111-111111111111");
  lead.status = status;
  lead.followUpLog = Array.from({ length: followUps }, (_, index) => ({ completedAt: `2026-10-0${index + 2}T10:00:00.000Z`, channel: "email", note: "Kontakt" }));
  return lead;
};

test("szybkie akcje zależą od statusu i zawsze pozwalają otworzyć kartę", () => {
  assert.deepEqual(ids(leadAt("new")), ["open", "start_research", "reject"]);
  assert.deepEqual(ids(leadAt("draft_ready")), ["open", "review", "reject"]);
  assert.deepEqual(ids(leadAt("approved")), ["open", "copy", "mark_sent", "reject"]);
  assert.deepEqual(ids(leadAt("sent")), ["open", "mark_replied", "set_followup", "copy", "copy_history", "create_prompt", "reject"]);
  assert.deepEqual(ids(leadAt("replied")), ["open", "add_note", "set_next_step", "copy", "copy_history", "create_prompt", "reject"]);
  assert.deepEqual(ids(leadAt("rejected")), ["open"]);
});

test("po dwóch follow-upach szybka akcja nie pozwala planować trzeciego", () => {
  assert.equal(ids(leadAt("sent", 2)).includes("set_followup"), false);
});
