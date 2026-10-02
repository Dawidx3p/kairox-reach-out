import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, createLead } from "../src/domain.js";
import { validateWorkspace } from "../src/validation.js";
import { parseImport } from "../src/storage.js";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const ID = "11111111-1111-4111-8111-111111111111";

function validWorkspace() {
  const workspace = createWorkspace(NOW);
  workspace.leads.push(createLead("Firma", NOW, ID));
  return workspace;
}

test("poprawny pełny dokument przechodzi walidację", () => {
  assert.deepEqual(validateWorkspace(validWorkspace()), { ok: true, errors: [] });
});

test("import odrzuca błędny JSON i nieznany status", () => {
  assert.equal(parseImport("{błąd").ok, false);
  const workspace = validWorkspace();
  workspace.leads[0].status = "unknown";
  const result = parseImport(JSON.stringify(workspace));
  assert.equal(result.ok, false);
  assert.match(result.error, /nieznany status/);
});

test("import odrzuca powielone identyfikatory", () => {
  const workspace = validWorkspace();
  workspace.leads.push(createLead("Druga", NOW, ID));
  const result = parseImport(JSON.stringify(workspace));
  assert.equal(result.ok, false);
  assert.match(result.error, /nie są unikalne/);
});

test("walidacja odrzuca niespójną chronologię", () => {
  const workspace = validWorkspace();
  const lead = workspace.leads[0];
  lead.status = "sent";
  lead.approvedAt = "2026-10-02T11:00:00.000Z";
  lead.sentAt = "2026-10-02T10:00:00.000Z";
  const result = validateWorkspace(workspace);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /wysłanie poprzedza akceptację/);
});

test("walidacja odrzuca trzeci follow-up i nowy termin po drugim", () => {
  const workspace = validWorkspace();
  const lead = workspace.leads[0];
  lead.status = "sent";
  lead.approvedAt = "2026-10-02T09:00:00.000Z";
  lead.sentAt = "2026-10-02T10:00:00.000Z";
  lead.followUp.dueDate = "2026-10-30";
  lead.followUpLog = [0, 1, 2].map((day) => ({
    completedAt: `2026-10-0${3 + day}T10:00:00.000Z`,
    channel: "email",
    note: `Follow-up ${day + 1}`,
  }));
  const result = validateWorkspace(workspace);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /maksymalnie dwa follow-upy/);
  assert.match(result.errors.join(" "), /nie można planować kolejnego/);
});

test("import dziwnie typowanych pól zwraca błąd zamiast rzucać wyjątek", () => {
  const workspace = validWorkspace();
  workspace.settings = "nie-obiekt";
  const result = parseImport(JSON.stringify(workspace));
  assert.equal(result.ok, false);
  assert.match(result.error, /settings\.icp|strukturę/);
});
