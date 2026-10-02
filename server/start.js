import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspaceStore } from "./workspace-store.js";
import { createAppServer } from "./http-server.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const development = process.argv.includes("--dev");
const store = createWorkspaceStore({ dataDir: path.join(projectRoot, "data") });
let vite;
const server = createAppServer({ store, distDir: path.join(projectRoot, "dist"),
  ...(development ? { devMiddleware: (req, res, next) => vite.middlewares(req, res, next) } : {}) });

// The fixed exclusive port also prevents running two application writers at once.
// Never honour HOST/PORT environment overrides.
server.on("error", (error) => {
  console.error(error.code === "EADDRINUSE" ? "Port 5173 jest zajęty. Zatrzymaj poprzednią aplikację; nie uruchamiaj drugiego serwera dla tej bazy." : error.message);
  process.exitCode = 1;
});
try {
  if (development) {
    const { createServer } = await import("vite");
    vite = await createServer({ root: projectRoot, server: { middlewareMode: true, ws: { server } } });
  }
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(5173, "127.0.0.1", resolve); });
  console.log(`KAIROX Reach Out: http://127.0.0.1:5173 (${development ? "dev" : "lokalny build"})`);
} catch (error) {
  await vite?.close();
  console.error(`Nie uruchomiono aplikacji: ${error.message}`);
  process.exitCode = 1;
}

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await vite?.close();
  server.close();
  server.closeIdleConnections();
}
process.once("SIGINT", close);
process.once("SIGTERM", close);
