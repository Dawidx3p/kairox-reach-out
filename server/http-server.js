import http from "node:http";
import * as fs from "node:fs/promises";
import path from "node:path";
import { MAX_BYTES } from "../src/validation.js";
import { storeError } from "./workspace-store.js";

function sendJson(response, status, body, etag) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(etag ? { ETag: etag } : {}) });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const parts = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) throw storeError(413, "WORKSPACE_TOO_LARGE", "Dokument przekracza limit 1 MiB.");
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw storeError(400, "INVALID_JSON", "Treść żądania nie jest poprawnym JSON."); }
}

export function createAppServer({ store, distDir, devMiddleware } = {}) {
  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    try {
      const host = `127.0.0.1:${server.address().port}`;
      const origin = `http://${host}`;
      if (request.headers.host !== host || (request.headers.origin && request.headers.origin !== origin)
        || request.headers["sec-fetch-site"] === "cross-site") {
        throw storeError(403, "LOCAL_ORIGIN_REQUIRED", "Dozwolony jest tylko lokalny adres aplikacji 127.0.0.1.");
      }
      const url = new URL(request.url, origin);
      if (url.pathname === "/api/workspace") {
        if (request.method === "GET") {
          const { etag, ...body } = await store.read();
          sendJson(response, 200, body, etag);
          return;
        }
        if (request.method === "PUT") {
          if (request.headers.origin !== origin) throw storeError(403, "LOCAL_ORIGIN_REQUIRED", "Zapis wymaga Origin lokalnej aplikacji.");
          if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") throw storeError(415, "JSON_REQUIRED", "Wymagany Content-Type: application/json.");
          if (!request.headers["if-match"]) throw storeError(428, "REVISION_REQUIRED", "Zapis wymaga If-Match.");
          if (Number(request.headers["content-length"]) > MAX_BYTES) throw storeError(413, "WORKSPACE_TOO_LARGE", "Dokument przekracza limit 1 MiB.");
          const workspace = await readBody(request);
          const mode = request.headers["x-workspace-mode"];
          if (mode !== undefined && mode !== "import") throw storeError(400, "INVALID_MODE", "Nieznany tryb zapisu.");
          const { etag, ...body } = await store.write(workspace, request.headers["if-match"], { replace: mode === "import" });
          sendJson(response, 200, body, etag);
          return;
        }
        response.setHeader("Allow", "GET, PUT");
        throw storeError(405, "METHOD_NOT_ALLOWED", "Dozwolone metody: GET, PUT.");
      }
      if (!["GET", "HEAD"].includes(request.method)) throw storeError(405, "METHOD_NOT_ALLOWED", "Niedozwolona metoda.");
      const pathname = decodeURIComponent(url.pathname);
      if (/^\/(?:api|data|server|tests|\.git)(?:\/|$)/.test(pathname)) throw storeError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      if (devMiddleware) { devMiddleware(request, response, () => sendJson(response, 404, { error: "Nie znaleziono zasobu." })); return; }
      if (!distDir || !(pathname === "/" || pathname === "/index.html" || pathname.startsWith("/assets/"))) throw storeError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      const root = await fs.realpath(distDir);
      const file = await fs.realpath(path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`));
      if (!file.startsWith(`${root}${path.sep}`)) throw storeError(404, "NOT_FOUND", "Nie znaleziono zasobu.");
      const contents = await fs.readFile(file);
      const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
      response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      response.end(request.method === "HEAD" ? undefined : contents);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      const status = error.status || (error.code === "ENOENT" ? 404 : 500);
      sendJson(response, status, { code: error.status ? error.code : "IO_ERROR", error: error.status ? error.message : "Nie udało się odczytać lub utrwalić danych. Zachowaj niezapisane dane i odczytaj ponownie bazę przed kolejnym zapisem." });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
