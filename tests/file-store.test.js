import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspace, createLead } from "../src/domain.js";
import { MAX_BYTES } from "../src/validation.js";
import { createWorkspaceStore } from "../server/workspace-store.js";

const T0 = new Date("2026-10-02T10:00:00.000Z");
const T1 = new Date("2026-10-02T11:00:00.000Z");
const FIXTURE = fileURLToPath(new URL("./fixtures/crash-writer.js", import.meta.url));

async function tempDataDir(t) {
  const directory = await mkdtemp(join(tmpdir(), "kairox-store-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function workspaceAt(time = T0, target = "") {
  const workspace = createWorkspace(time);
  workspace.settings.icp.target = target;
  return workspace;
}

async function storedBytes(dataDir) {
  return readFile(join(dataDir, "workspace.json"));
}

async function expectStoreError(promise, status) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.status, status);
    assert.equal(typeof error.code, "string");
    assert.ok(error.code.length > 0);
    assert.equal(typeof error.message, "string");
    assert.ok(error.message.length > 0);
    return true;
  });
}

test("odczyt pustego magazynu nie tworzy pliku", async (t) => {
  const dataDir = await tempDataDir(t);
  const result = await createWorkspaceStore({ dataDir }).read();

  assert.equal(result.exists, false);
  assert.equal(result.empty, true);
  assert.equal(result.etag, '"missing"');
  assert.equal(result.workspace.schemaVersion, 1);
  assert.deepEqual(result.workspace.leads, []);
  await assert.rejects(storedBytes(dataDir), { code: "ENOENT" });
});

test("pierwszy zapis przeżywa utworzenie nowej instancji magazynu", async (t) => {
  const dataDir = await tempDataDir(t);
  const workspace = workspaceAt(T0, "firmy usługowe");
  const first = createWorkspaceStore({ dataDir });

  await first.write(workspace, '"missing"');
  const restarted = await createWorkspaceStore({ dataDir }).read();

  assert.equal(restarted.exists, true);
  assert.equal(restarted.empty, false);
  assert.notEqual(restarted.etag, '"missing"');
  assert.deepEqual(restarted.workspace, workspace);
});

test("empty rozróżnia semantycznie pusty workspace, samo ICP i nieznane pole", async (t) => {
  const emptyDir = await tempDataDir(t);
  const emptyStore = createWorkspaceStore({ dataDir: emptyDir });
  await emptyStore.write(workspaceAt(T0), '"missing"');
  assert.equal((await emptyStore.read()).empty, true);

  const icpDir = await tempDataDir(t);
  const icpStore = createWorkspaceStore({ dataDir: icpDir });
  await icpStore.write(workspaceAt(T0, "firmy usługowe"), '"missing"');
  assert.equal((await icpStore.read()).empty, false);

  const extendedDir = await tempDataDir(t);
  const extendedStore = createWorkspaceStore({ dataDir: extendedDir });
  const extended = workspaceAt(T0);
  extended.extensionData = { retained: true };
  await extendedStore.write(extended, '"missing"');
  assert.equal((await extendedStore.read()).empty, false);
});

test("limit 500 leadów przechodzi, a 501 nie nadpisuje poprzedniego pliku", async (t) => {
  const dataDir = await tempDataDir(t);
  const store = createWorkspaceStore({ dataDir });
  const atLimit = workspaceAt(T0);
  atLimit.leads = Array.from({ length: 500 }, (_, index) => createLead(`Firma ${index + 1}`, T0));

  await store.write(atLimit, '"missing"');
  const before = await storedBytes(dataDir);
  const { etag } = await store.read();
  const overLimit = structuredClone(atLimit);
  overLimit.leads.push(createLead("Firma 501", T0));

  const error = await store.write(overLimit, etag).then(
    () => null,
    (reason) => reason,
  );
  assert.ok(error, "zapis 501 leadów powinien zostać odrzucony");
  assert.deepEqual(await storedBytes(dataDir), before);
  assert.equal((await store.read()).workspace.leads.length, 500);
  assert.equal(error.status, 413);
  assert.equal(typeof error.code, "string");
});

test("kolejny zapis zachowuje dokładne poprzednie bajty w kopii", async (t) => {
  const dataDir = await tempDataDir(t);
  const store = createWorkspaceStore({ dataDir });
  await store.write(workspaceAt(T0, "pierwsza wersja"), '"missing"');
  const previousBytes = await storedBytes(dataDir);
  const { etag } = await store.read();

  await store.write(workspaceAt(T1, "druga wersja"), etag);

  const backupNames = await readdir(join(dataDir, "backups"));
  assert.equal(backupNames.length, 1);
  assert.match(backupNames[0], /^workspace-[0-9a-f-]{36}\.json$/i);
  assert.deepEqual(await readFile(join(dataDir, "backups", backupNames[0])), previousBytes);
});

test("rzeczywista awaria utworzenia katalogu kopii nie podmienia pliku głównego", async (t) => {
  const dataDir = await tempDataDir(t);
  const store = createWorkspaceStore({ dataDir });
  await store.write(workspaceAt(T0, "wersja bezpieczna"), '"missing"');
  const before = await storedBytes(dataDir);
  const { etag } = await store.read();
  await writeFile(join(dataDir, "backups"), "blokada katalogu");

  await assert.rejects(store.write(workspaceAt(T1, "wersja niedokończona"), etag));
  assert.deepEqual(await storedBytes(dataDir), before);
  assert.equal((await store.read()).workspace.settings.icp.target, "wersja bezpieczna");
});

test("brak ETag, konflikt, błędny dokument i przekroczenie limitu nie nadpisują danych", async (t) => {
  const dataDir = await tempDataDir(t);
  const store = createWorkspaceStore({ dataDir });
  await store.write(workspaceAt(T0, "bezpieczna wersja"), '"missing"');
  const before = await storedBytes(dataDir);
  const current = await store.read();

  await expectStoreError(store.write(workspaceAt(T1), undefined), 428);
  await expectStoreError(store.write(workspaceAt(T1), '"nieaktualny"'), 412);
  await expectStoreError(store.write({ schemaVersion: 1 }, current.etag), 422);

  const tooLarge = workspaceAt(T1);
  tooLarge.settings.icp.target = "x".repeat(MAX_BYTES + 1);
  await expectStoreError(store.write(tooLarge, current.etag), 413);

  assert.deepEqual(await storedBytes(dataDir), before);
});

for (const failedStage of ["temp-synced", "backup-synced", "before-rename"]) {
  test(`awaria na etapie ${failedStage} pozostawia poprzedni plik`, async (t) => {
    const dataDir = await tempDataDir(t);
    const initial = createWorkspaceStore({ dataDir });
    await initial.write(workspaceAt(T0, "stara wersja"), '"missing"');
    const before = await storedBytes(dataDir);
    const { etag } = await initial.read();
    const failing = createWorkspaceStore({
      dataDir,
      onStage(stage) {
        if (stage === failedStage) throw new Error(`awaria: ${stage}`);
      },
    });

    await assert.rejects(failing.write(workspaceAt(T1, "nowa wersja"), etag), /awaria/);
    assert.deepEqual(await storedBytes(dataDir), before);
    assert.equal((await createWorkspaceStore({ dataDir }).read()).workspace.settings.icp.target, "stara wersja");
  });
}

test("awaria zgłoszona po rename pozostawia kompletny nowy dokument", async (t) => {
  const dataDir = await tempDataDir(t);
  const initial = createWorkspaceStore({ dataDir });
  await initial.write(workspaceAt(T0, "stara wersja"), '"missing"');
  const { etag } = await initial.read();
  const failing = createWorkspaceStore({
    dataDir,
    onStage(stage) {
      if (stage === "after-rename") throw new Error("wynik zapisu jest niepewny");
    },
  });

  await assert.rejects(failing.write(workspaceAt(T1, "nowa wersja"), etag), /niepewny/);
  const restarted = await createWorkspaceStore({ dataDir }).read();
  assert.equal(restarted.workspace.settings.icp.target, "nowa wersja");
});

test("SIGKILL przed rename nie uszkadza danych, a restart ignoruje plik tymczasowy", async (t) => {
  const dataDir = await tempDataDir(t);
  const store = createWorkspaceStore({ dataDir });
  await store.write(workspaceAt(T0, "wersja utrwalona"), '"missing"');
  const before = await storedBytes(dataDir);
  const { etag } = await store.read();

  const child = fork(FIXTURE, [dataDir, etag], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("fixture nie osiągnął etapu before-rename")), 5000);
    child.once("message", (message) => {
      if (message !== "before-rename") return;
      clearTimeout(timeout);
      resolve();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal !== "SIGKILL") reject(new Error(`fixture zakończył się przed sygnałem: ${code}/${signal}`));
    });
  });
  child.kill("SIGKILL");
  await new Promise((resolve) => child.once("exit", resolve));

  assert.deepEqual(await storedBytes(dataDir), before);
  const restarted = await createWorkspaceStore({ dataDir }).read();
  assert.equal(restarted.workspace.settings.icp.target, "wersja utrwalona");
});

test("dwie instancje serializują zapis z tym samym ETag", async (t) => {
  const dataDir = await tempDataDir(t);
  const seed = createWorkspaceStore({ dataDir });
  await seed.write(workspaceAt(T0, "start"), '"missing"');
  const { etag } = await seed.read();

  const results = await Promise.allSettled([
    createWorkspaceStore({ dataDir }).write(workspaceAt(T1, "A"), etag),
    createWorkspaceStore({ dataDir }).write(workspaceAt(T1, "B"), etag),
  ]);

  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.equal(rejected.reason.status, 412);
  assert.match((await createWorkspaceStore({ dataDir }).read()).workspace.settings.icp.target, /^(A|B)$/);
});

test("uszkodzony istniejący plik blokuje odczyt i zapis bez nadpisania", async (t) => {
  const dataDir = await tempDataDir(t);
  const path = join(dataDir, "workspace.json");
  const malformed = Buffer.from('{"schemaVersion":');
  await writeFile(path, malformed);
  const store = createWorkspaceStore({ dataDir });

  await expectStoreError(store.read(), 409);
  await expectStoreError(store.write(workspaceAt(T0), '"missing"'), 409);
  assert.deepEqual(await readFile(path), malformed);
});

test("pełny dokument z leadem zachowuje wszystkie pola", async (t) => {
  const dataDir = await tempDataDir(t);
  const workspace = workspaceAt(T0, "ICP");
  workspace.leads.push(createLead("Firma", T0, "11111111-1111-4111-8111-111111111111"));
  const store = createWorkspaceStore({ dataDir });

  await store.write(workspace, '"missing"');
  assert.deepEqual((await store.read()).workspace, workspace);
});
