import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLead, createWorkspace, editLead, transitionLead } from "../src/domain.js";
import { ensureContactHistory } from "../src/contact-history.js";
import { createWorkspaceStore } from "../server/workspace-store.js";

const ID = "11111111-1111-4111-8111-111111111111";
const T0 = new Date("2026-10-01T08:00:00.000Z");
const T1 = new Date("2026-10-01T09:00:00.000Z");
const T2 = new Date("2026-10-01T10:00:00.000Z");

async function tempDataDir(t) {
  const directory = await mkdtemp(join(tmpdir(), "kairox-contact-history-store-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function workspaceWithLead(lead, at = T0) {
  const workspace = createWorkspace(at);
  workspace.leads = [lead];
  return workspace;
}

function qualifiedLead() {
  let lead = createLead("Firma", T0, ID);
  lead = transitionLead(lead, "start_research", {}, T0).lead;
  lead = editLead(lead, {
    contact: { name: "Anna", role: "CEO", email: "anna@example.com", linkedinUrl: "", formUrl: "" },
    channel: "email",
    research: {
      summary: "Firma usługowa",
      need: "Potrzeba",
      contactReason: "Wiarygodny powód",
      sources: [{ url: "https://example.com", note: "Źródło" }],
    },
    qualification: { icpFit: true, needIdentified: true, contactSuitable: true, reasonCredible: true },
    draft: { subject: "Temat", body: "Pierwsza wiadomość" },
  }, T0);
  lead = transitionLead(lead, "submit_for_approval", {}, T0).lead;
  return transitionLead(lead, "approve", {}, T0).lead;
}

function recordedLead() {
  return transitionLead(qualifiedLead(), "mark_sent", { sentAt: T1.toISOString() }, T1).lead;
}

async function expectImmutable(promise) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, "HISTORY_IMMUTABLE");
    return true;
  });
}

test("pierwszy zapis zachowuje pełną historię leada", async (t) => {
  const store = createWorkspaceStore({ dataDir: await tempDataDir(t) });
  const workspace = workspaceWithLead(recordedLead());
  await store.write(workspace, '"missing"');
  assert.deepEqual((await store.read()).workspace, workspace);
});

test("stare dane bez pola historii można zapisać i jednokrotnie zmaterializować", async (t) => {
  const store = createWorkspaceStore({ dataDir: await tempDataDir(t) });
  const legacyLead = recordedLead();
  delete legacyLead.contactHistory;
  const legacyWorkspace = workspaceWithLead(legacyLead);
  await store.write(legacyWorkspace, '"missing"');
  const first = await store.read();

  const upgraded = structuredClone(first.workspace);
  upgraded.leads[0] = ensureContactHistory(upgraded.leads[0]);
  await store.write(upgraded, first.etag);
  const afterUpgrade = await store.read();
  assert.ok(afterUpgrade.workspace.leads[0].contactHistory.length > 0);

  await store.write(structuredClone(afterUpgrade.workspace), afterUpgrade.etag);
  const afterSecondSave = await store.read();
  assert.deepEqual(afterSecondSave.workspace.leads[0].contactHistory, afterUpgrade.workspace.leads[0].contactHistory);
});

test("zwykły zapis pozwala wyłącznie dopisywać zdarzenia na końcu", async (t) => {
  const store = createWorkspaceStore({ dataDir: await tempDataDir(t) });
  const initial = workspaceWithLead(recordedLead(), T1);
  await store.write(initial, '"missing"', { replace: true });
  const saved = await store.read();

  const appended = structuredClone(saved.workspace);
  appended.leads[0] = transitionLead(appended.leads[0], "add_note", {
    note: "Nowa notatka",
    occurredAt: T2.toISOString(),
  }, T2).lead;
  appended.updatedAt = T2.toISOString();
  await store.write(appended, saved.etag);
  const current = await store.read();
  assert.equal(current.workspace.leads[0].contactHistory.length, saved.workspace.leads[0].contactHistory.length + 1);
  assert.deepEqual(
    current.workspace.leads[0].contactHistory.slice(0, saved.workspace.leads[0].contactHistory.length),
    saved.workspace.leads[0].contactHistory,
  );

  const changed = structuredClone(current.workspace);
  changed.leads[0].contactHistory[0].body = "Podmieniona treść";
  await expectImmutable(store.write(changed, current.etag));

  const removed = structuredClone(current.workspace);
  removed.leads[0].contactHistory.shift();
  await expectImmutable(store.write(removed, current.etag));

  const reordered = structuredClone(current.workspace);
  reordered.leads[0].contactHistory.reverse();
  await expectImmutable(store.write(reordered, current.etag));
  assert.deepEqual((await store.read()).workspace, current.workspace);
});

test("normalny zapis blokuje zniknięcie leada z historią", async (t) => {
  const store = createWorkspaceStore({ dataDir: await tempDataDir(t) });
  await store.write(workspaceWithLead(recordedLead()), '"missing"', { replace: true });
  const current = await store.read();
  const withoutLead = structuredClone(current.workspace);
  withoutLead.leads = [];
  await expectImmutable(store.write(withoutLead, current.etag));
  assert.equal((await store.read()).workspace.leads.length, 1);
});

test("jawny pełny import może zastąpić historię i nadal tworzy backup oraz nowy ETag", async (t) => {
  const dataDir = await tempDataDir(t);
  const store = createWorkspaceStore({ dataDir });
  const original = workspaceWithLead(recordedLead(), T1);
  await store.write(original, '"missing"', { replace: true });
  const before = await store.read();
  const previousBytes = await readFile(join(dataDir, "workspace.json"));

  const imported = structuredClone(before.workspace);
  imported.leads[0].contactHistory = [];
  imported.updatedAt = T2.toISOString();
  const result = await store.write(imported, before.etag, { replace: true });
  assert.notEqual(result.etag, before.etag);
  assert.deepEqual((await store.read()).workspace, imported);

  const backupNames = await readdir(join(dataDir, "backups"));
  assert.equal(backupNames.length, 1);
  assert.deepEqual(await readFile(join(dataDir, "backups", backupNames[0])), previousBytes);
});

test("tryb pełnego importu nadal wymaga aktualnego ETag", async (t) => {
  const store = createWorkspaceStore({ dataDir: await tempDataDir(t) });
  const workspace = workspaceWithLead(recordedLead());
  await assert.rejects(store.write(workspace, undefined, { replace: true }), (error) => error.status === 428);
  await store.write(workspace, '"missing"', { replace: true });
  await assert.rejects(store.write(workspace, '"nieaktualny"', { replace: true }), (error) => error.status === 412);
});
