import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace, createLead } from "../src/domain.js";
import { loadWorkspace, saveWorkspace } from "../src/storage.js";

const NOW = new Date("2026-10-02T10:00:00.000Z");
const ID = "11111111-1111-4111-8111-111111111111";

function validWorkspace() {
  const workspace = createWorkspace(NOW);
  workspace.leads.push(createLead("Firma", NOW, ID));
  return workspace;
}

function jsonResponse(payload, { status = 200, etag } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...(etag ? { ETag: etag } : {}) },
  });
}

test("odczyt i zapis wykonują roundtrip przez API z ETag", async () => {
  let stored = validWorkspace();
  let etag = '"rev-1"';
  const requests = [];
  const fetchMock = async (url, options) => {
    requests.push({ url, options });
    if (options.method === "GET") return jsonResponse({ workspace: stored, empty: false, exists: true }, { etag });
    assert.equal(options.headers["If-Match"], '"rev-1"');
    stored = JSON.parse(options.body);
    etag = '"rev-2"';
    return jsonResponse({ workspace: stored, empty: false, exists: true }, { etag });
  };

  const loaded = await loadWorkspace(fetchMock);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.etag, '"rev-1"');
  loaded.workspace.settings.icp.target = "Polskie MŚP";
  const saved = await saveWorkspace(loaded.workspace, loaded.etag, fetchMock);

  assert.equal(saved.ok, true);
  assert.equal(saved.etag, '"rev-2"');
  assert.equal(saved.workspace.settings.icp.target, "Polskie MŚP");
  assert.deepEqual(requests.map(({ url, options }) => [url, options.method]), [["/api/workspace", "GET"], ["/api/workspace", "PUT"]]);
});

test("błąd HTTP zachowuje komunikat, kod i status serwera", async () => {
  const result = await loadWorkspace(async () => jsonResponse({ error: "Awaria zapisu", code: "DATA_ERROR" }, { status: 500 }));
  assert.deepEqual(result, { ok: false, error: "Awaria zapisu", code: "DATA_ERROR", status: 500 });
});

test("konflikt ETag 412 nie jest automatycznie ponawiany", async () => {
  let calls = 0;
  const result = await saveWorkspace(validWorkspace(), '"stara"', async () => {
    calls += 1;
    return jsonResponse({ error: "Dane zmieniły się na serwerze.", code: "ETAG_MISMATCH" }, { status: 412 });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { ok: false, error: "Dane zmieniły się na serwerze.", code: "ETAG_MISMATCH", status: 412 });
});

test("brak If-Match zachowuje odpowiedź 428 serwera", async () => {
  const result = await saveWorkspace(validWorkspace(), null, async (_url, options) => {
    assert.equal("If-Match" in options.headers, false);
    return jsonResponse({ error: "Brak nagłówka If-Match.", code: "PRECONDITION_REQUIRED" }, { status: 428 });
  });
  assert.deepEqual(result, { ok: false, error: "Brak nagłówka If-Match.", code: "PRECONDITION_REQUIRED", status: 428 });
});

test("brak ETag w poprawnej odpowiedzi jest błędem", async () => {
  const result = await loadWorkspace(async () => jsonResponse({ workspace: validWorkspace(), empty: false, exists: true }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "MISSING_ETAG");
});

test("błąd sieci ma stabilny kod i nie uruchamia ponowienia", async () => {
  let calls = 0;
  const result = await loadWorkspace(async () => {
    calls += 1;
    throw new TypeError("offline");
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, false);
  assert.equal(result.code, "NETWORK_ERROR");
  assert.match(result.error, /offline/);
});

test("pusta odpowiedź po PUT oznacza niepewny wynik", async () => {
  const result = await saveWorkspace(validWorkspace(), '"rev-1"', async () => new Response(null, { status: 204, headers: { ETag: '"rev-2"' } }));
  assert.equal(result.ok, false);
  assert.equal(result.code, "UNCERTAIN_SAVE");
});
