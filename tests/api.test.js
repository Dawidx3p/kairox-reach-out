import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace, createLead, transitionLead } from "../src/domain.js";
import { MAX_BYTES } from "../src/validation.js";
import { createWorkspaceStore } from "../server/workspace-store.js";
import { createAppServer } from "../server/http-server.js";

const T0 = new Date("2026-10-02T10:00:00.000Z");

async function fixtureDirs(t) {
  const root = await mkdtemp(join(tmpdir(), "kairox-api-test-"));
  const dataDir = join(root, "data");
  const distDir = join(root, "dist");
  await mkdir(join(distDir, "assets"), { recursive: true });
  await writeFile(join(distDir, "index.html"), "<!doctype html><title>KAIROX test</title>");
  await writeFile(join(distDir, "assets", "app.js"), "globalThis.__KAIROX_TEST__ = true;\n");
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, dataDir, distDir };
}

async function startServer(store, distDir) {
  const server = createAppServer({ store, distDir });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    server,
    port,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function request(app, path, { method = "GET", headers = {}, body } = {}) {
  const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port: app.port,
      path,
      method,
      headers: {
        ...(payload ? { "content-length": payload.byteLength } : {}),
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString("utf8");
        let json;
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
        resolve({ status: response.statusCode, headers: response.headers, buffer, text, json });
      });
    });
    req.once("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function workspaceAt(time = T0, target = "") {
  const workspace = createWorkspace(time);
  workspace.settings.icp.target = target;
  return workspace;
}

async function putWorkspace(app, workspace, etag, extraHeaders = {}) {
  return request(app, "/api/workspace", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "if-match": etag,
      origin: app.origin,
      ...extraHeaders,
    },
    body: JSON.stringify(workspace),
  });
}

test("GET pustego workspace zwraca ETag i nie tworzy pliku", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const app = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(app.close);

  const response = await request(app, "/api/workspace");

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^application\/json\b/);
  assert.equal(response.headers.etag, '"missing"');
  assert.equal(response.json.exists, false);
  assert.equal(response.json.empty, true);
  assert.equal(response.json.workspace.schemaVersion, 1);
  await assert.rejects(readFile(join(dataDir, "workspace.json")), { code: "ENOENT" });
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("PUT importuje pełny dokument, a GET zwraca go bez utraty pól", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const app = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(app.close);
  const workspace = workspaceAt(T0, "firmy B2B");
  workspace.leads.push(createLead("Pełna Firma", T0, "11111111-1111-4111-8111-111111111111"));

  const saved = await putWorkspace(app, workspace, '"missing"');

  assert.equal(saved.status, 200);
  assert.equal(saved.json.exists, true);
  assert.equal(saved.json.empty, false);
  assert.deepEqual(saved.json.workspace, workspace);
  assert.notEqual(saved.headers.etag, '"missing"');
  const loaded = await request(app, "/api/workspace");
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.etag, saved.headers.etag);
  assert.deepEqual(loaded.json.workspace, workspace);
  assert.equal(saved.headers["access-control-allow-origin"], undefined);
});

test("PUT wymaga zgodnego ETag, JSON content type i poprawnego JSON", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const app = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(app.close);
  const body = JSON.stringify(workspaceAt());

  const noEtag = await request(app, "/api/workspace", {
    method: "PUT",
    headers: { "content-type": "application/json", origin: app.origin },
    body,
  });
  assert.equal(noEtag.status, 428);

  const wrongType = await request(app, "/api/workspace", {
    method: "PUT",
    headers: { "content-type": "text/plain", "if-match": '"missing"', origin: app.origin },
    body,
  });
  assert.equal(wrongType.status, 415);

  const badJson = await request(app, "/api/workspace", {
    method: "PUT",
    headers: { "content-type": "application/json", "if-match": '"missing"', origin: app.origin },
    body: '{"schemaVersion":',
  });
  assert.equal(badJson.status, 400);
});

test("PUT mapuje błędy walidacji, limitu i konfliktu na 422, 413 i 412", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const app = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(app.close);

  const invalid = await putWorkspace(app, { schemaVersion: 1 }, '"missing"');
  assert.equal(invalid.status, 422);
  assert.equal(typeof invalid.json.code, "string");

  const tooLarge = workspaceAt();
  tooLarge.settings.icp.target = "x".repeat(MAX_BYTES + 1);
  const oversized = await putWorkspace(app, tooLarge, '"missing"');
  assert.equal(oversized.status, 413);

  const saved = await putWorkspace(app, workspaceAt(T0, "pierwsza"), '"missing"');
  assert.equal(saved.status, 200);
  const conflict = await putWorkspace(app, workspaceAt(T0, "druga"), '"missing"');
  assert.equal(conflict.status, 412);
  assert.equal((await request(app, "/api/workspace")).json.workspace.settings.icp.target, "pierwsza");
});

test("wszystkie endpointy odrzucają obcy Host i Origin, a PUT także brak Origin", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const app = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(app.close);

  assert.equal((await request(app, "/api/workspace", { headers: { host: `localhost:${app.port}` } })).status, 403);
  assert.equal((await request(app, "/", { headers: { origin: "https://attacker.example" } })).status, 403);
  assert.equal((await request(app, "/api/workspace", { headers: { origin: "https://attacker.example" } })).status, 403);

  const missingOrigin = await request(app, "/api/workspace", {
    method: "PUT",
    headers: { "content-type": "application/json", "if-match": '"missing"' },
    body: JSON.stringify(workspaceAt()),
  });
  assert.equal(missingOrigin.status, 403);

  const foreignOrigin = await putWorkspace(app, workspaceAt(), '"missing"', { origin: "http://127.0.0.1:9999" });
  assert.equal(foreignOrigin.status, 403);
  await assert.rejects(readFile(join(dataDir, "workspace.json")), { code: "ENOENT" });
});

test("serwer statyczny udostępnia tylko index i assets", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const app = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(app.close);

  const index = await request(app, "/");
  assert.equal(index.status, 200);
  assert.match(index.text, /KAIROX test/);
  const asset = await request(app, "/assets/app.js");
  assert.equal(asset.status, 200);
  assert.match(asset.text, /__KAIROX_TEST__/);

  for (const path of ["/data/workspace.json", "/src/main.js", "/server/http-server.js", "/.git/config", "/package.json"]) {
    assert.equal((await request(app, path)).status, 404, path);
  }
});

test("restart serwera HTTP zachowuje zapisany workspace", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const workspace = workspaceAt(T0, "dane po restarcie");
  const first = await startServer(createWorkspaceStore({ dataDir }), distDir);
  assert.equal((await putWorkspace(first, workspace, '"missing"')).status, 200);
  await first.close();

  const restarted = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(restarted.close);
  const response = await request(restarted, "/api/workspace");
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.workspace, workspace);
});


test("API chroni istniejącą historię, a jawny import może odtworzyć starszą kopię", async (t) => {
  const { dataDir, distDir } = await fixtureDirs(t);
  const app = await startServer(createWorkspaceStore({ dataDir }), distDir);
  t.after(app.close);
  const workspace = workspaceAt();
  workspace.leads = [transitionLead(createLead("Historia", T0), "add_note", { note: "Zachowaj tę notatkę" }, T0).lead];
  const saved = await putWorkspace(app, workspace, '\"missing\"');
  assert.equal(saved.status, 200);
  const changed = structuredClone(workspace);
  changed.leads[0].contactHistory = [];
  const blocked = await putWorkspace(app, changed, saved.headers.etag);
  assert.equal(blocked.status, 422);
  assert.equal(blocked.json.code, "HISTORY_IMMUTABLE");
  assert.deepEqual((await request(app, "/api/workspace")).json.workspace, workspace);
  assert.equal((await putWorkspace(app, changed, saved.headers.etag, { "x-workspace-mode": "typo" })).status, 400);
  const restored = await putWorkspace(app, changed, saved.headers.etag, { "x-workspace-mode": "import" });
  assert.equal(restored.status, 200);
  assert.deepEqual((await request(app, "/api/workspace")).json.workspace, changed);
});
