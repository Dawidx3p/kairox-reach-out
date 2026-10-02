import * as fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createWorkspace } from "../src/domain.js";
import { historyPreserved } from "../src/contact-history.js";
import { validateWorkspace, assertWithinLimits, MAX_BYTES, MAX_LEADS } from "../src/validation.js";

const queues = new Map();
export function storeError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}
const revision = (raw) => `"${createHash("sha256").update(raw).digest("hex")}"`;

function validate(workspace) {
  if (Array.isArray(workspace?.leads) && workspace.leads.length > MAX_LEADS) {
    throw storeError(413, "WORKSPACE_TOO_LARGE", `Limit bazy to ${MAX_LEADS} leadów.`);
  }
  let result;
  try { result = validateWorkspace(workspace); }
  catch { throw storeError(422, "INVALID_WORKSPACE", "Niepoprawne typy pól dokumentu Workspace."); }
  if (!result.ok) throw storeError(422, "INVALID_WORKSPACE", result.errors.join("\n"));
  const limit = assertWithinLimits(workspace);
  if (!limit.ok) throw storeError(413, "WORKSPACE_TOO_LARGE", limit.error);
}

export function isEmptyWorkspace(workspace) {
  // Unknown extension fields are preserved, never silently replaced by migration.
  return workspace.leads.length === 0
    && Object.keys(workspace).every((key) => ["schemaVersion", "updatedAt", "settings", "leads"].includes(key))
    && Object.keys(workspace.settings).every((key) => key === "icp")
    && Object.keys(workspace.settings.icp).every((key) => ["target", "need", "exclude"].includes(key))
    && Object.values(workspace.settings.icp).every((value) => !value.trim());
}

async function syncDirectory(directory) {
  const handle = await fs.open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function durableFile(filename, raw) {
  const handle = await fs.open(filename, "wx", 0o600);
  try { await handle.writeFile(raw); await handle.sync(); }
  finally { await handle.close(); }
}

export function createWorkspaceStore({ dataDir, onStage = async () => {} }) {
  const directory = path.resolve(dataDir);
  const filename = path.join(directory, "workspace.json");

  async function readInternal() {
    let raw;
    try {
      const info = await fs.lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) {
        throw storeError(409, "CORRUPT_WORKSPACE", "Plik bazy nie jest zwykłym plikiem Workspace do 1 MiB. Zachowano go bez zmian.");
      }
      raw = await fs.readFile(filename);
    } catch (error) {
      if (error.code === "ENOENT") return { workspace: createWorkspace(), etag: '"missing"', empty: true, exists: false };
      throw error;
    }
    let workspace;
    try { workspace = JSON.parse(raw.toString("utf8")); validate(workspace); }
    catch {
      throw storeError(409, "CORRUPT_WORKSPACE", "data/workspace.json jest niepoprawny. Nie został nadpisany. Zatrzymaj serwer i przywróć poprawną kopię z data/backups, zachowując uszkodzony plik.");
    }
    return { workspace, etag: revision(raw), empty: isEmptyWorkspace(workspace), exists: true, raw };
  }

  async function read() {
    // Reads wait for the current write, including directory fsync after rename.
    await (queues.get(directory) || Promise.resolve()).catch(() => {});
    const { raw, ...result } = await readInternal();
    return result;
  }

  async function commit(workspace, etag, { replace = false } = {}) {
    if (typeof etag !== "string" || !etag) throw storeError(428, "REVISION_REQUIRED", "Najpierw odczytaj bazę. Zapis wymaga If-Match.");
    validate(workspace);
    const raw = Buffer.from(JSON.stringify(workspace));
    const current = await readInternal();
    if (current.etag !== etag) throw storeError(412, "REVISION_CONFLICT", "Baza zmieniła się od ostatniego odczytu. Pobierz niezapisane dane i wczytaj aktualną bazę.");
    if (!replace && !historyPreserved(current.workspace, workspace)) throw storeError(422, "HISTORY_IMMUTABLE", "Istniejącej historii kontaktu nie można edytować ani usuwać. Pełną kopię można przywrócić przez potwierdzony import JSON.");
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(directory, `.workspace-${randomUUID()}.tmp`);
    try {
      await durableFile(temporary, raw);
      await onStage("temp-synced");
      if (current.exists) {
        const backups = path.join(directory, "backups");
        await fs.mkdir(backups, { recursive: true, mode: 0o700 });
        const backup = path.join(backups, `workspace-${randomUUID()}.json`);
        const backupTemp = `${backup}.tmp`;
        try {
          await durableFile(backupTemp, current.raw);
          await fs.rename(backupTemp, backup);
          await syncDirectory(backups);
          // Persist the backups directory entry before replacing the primary file.
          await syncDirectory(directory);
        } finally { await fs.unlink(backupTemp).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
        await onStage("backup-synced");
      }
      await onStage("before-rename");
      // Recheck external edits before commit as well as queued client revisions.
      if ((await readInternal()).etag !== etag) throw storeError(412, "REVISION_CONFLICT", "Plik został zmieniony podczas zapisu. Zachowano aktualną bazę.");
      await fs.rename(temporary, filename);
      await onStage("after-rename");
      await syncDirectory(directory);
      return { workspace, etag: revision(raw), exists: true, empty: isEmptyWorkspace(workspace) };
    } finally { await fs.unlink(temporary).catch((error) => { if (error.code !== "ENOENT") throw error; }); }
  }

  function write(workspace, etag, options = {}) {
    // Snapshot before queuing; callers cannot change a pending document.
    const snapshot = structuredClone(workspace);
    const replace = options.replace === true;
    const pending = (queues.get(directory) || Promise.resolve()).catch(() => {}).then(() => commit(snapshot, etag, { replace }));
    queues.set(directory, pending);
    void pending.finally(() => { if (queues.get(directory) === pending) queues.delete(directory); }).catch(() => {});
    return pending;
  }
  return { read, write };
}
