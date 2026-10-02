import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, createLead } from "../src/domain.js";
import { readLegacyWorkspace, retireLegacyWorkspace, migrateLegacyWorkspace, LEGACY_STORAGE_KEY } from "../src/legacy-storage.js";

function fixture() {
  const workspace = createWorkspace();
  workspace.leads.push(createLead("Stara firma"));
  const storage = {
    value: JSON.stringify(workspace),
    getItem(key) { assert.equal(key, LEGACY_STORAGE_KEY); return this.value; },
    removeItem(key) { assert.equal(key, LEGACY_STORAGE_KEY); this.value = null; },
  };
  return { workspace, storage, legacy: readLegacyWorkspace(storage), current: { empty: true, etag: '"missing"' } };
}

test("brak starej bazy oraz błędny JSON nie są cichą migracją", () => {
  assert.equal(readLegacyWorkspace({ getItem: () => null }).present, false);
  const damaged = readLegacyWorkspace({ getItem: () => "{bad" });
  assert.equal(damaged.ok, false);
  assert.equal(damaged.raw, "{bad");
});

test("migracja wymaga potwierdzenia i pustego pliku, także ICP jest danymi", async () => {
  const args = fixture();
  let writes = 0;
  const save = async () => { writes++; };
  assert.equal((await migrateLegacyWorkspace({ ...args, save, confirmed: false })).ok, false);
  assert.equal((await migrateLegacyWorkspace({ ...args, current: { empty: false, etag: '"existing"' }, save, confirmed: true })).ok, false);
  assert.equal(writes, 0);
  assert.notEqual(args.storage.value, null);
});

test("migracja zachowuje pełny dokument i usuwa legacy dopiero po zapisie", async () => {
  const args = fixture();
  const result = await migrateLegacyWorkspace({ ...args, confirmed: true, save: async (document, etag) => {
    assert.notEqual(args.storage.value, null);
    assert.deepEqual(document, args.workspace);
    assert.equal(etag, args.current.etag);
    return { ok: true, workspace: document, etag: '"saved"' };
  } });
  assert.equal(result.ok, true);
  assert.equal(args.storage.value, null);
});

for (const code of ["REVISION_CONFLICT", "NETWORK_ERROR", "IO_ERROR"]) {
  test(`błąd migracji ${code} zostawia pełną starą kopię do pobrania`, async () => {
    const args = fixture();
    const previous = args.storage.value;
    const result = await migrateLegacyWorkspace({ ...args, confirmed: true, save: async () => ({ ok: false, code, error: "nie zapisano" }) });
    assert.equal(result.ok, false);
    assert.equal(args.storage.value, previous);
    assert.deepEqual(JSON.parse(args.legacy.raw), args.workspace);
  });
}

test("zmiana starej kopii w innej karcie nie jest usuwana", async () => {
  const args = fixture();
  const result = await migrateLegacyWorkspace({ ...args, confirmed: true, save: async (document) => {
    args.storage.value = "nowsza kopia";
    return { ok: true, workspace: document, etag: '"saved"' };
  } });
  assert.equal(result.ok, true);
  assert.match(result.cleanupWarning, /zmieniła/);
  assert.equal(args.storage.value, "nowsza kopia");
});

test("zablokowany odczyt lub usunięcie legacy zgłasza ostrzeżenie", () => {
  assert.equal(readLegacyWorkspace({ getItem() { throw Error("blocked"); } }).ok, false);
  assert.equal(retireLegacyWorkspace("raw", { getItem: () => "raw", removeItem() { throw Error("blocked"); } }).ok, false);
});
