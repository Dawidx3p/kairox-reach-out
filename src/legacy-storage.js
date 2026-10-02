import { parseImport } from "./storage.js";

export const LEGACY_STORAGE_KEY = "kairox-reach-out:v1";

// Read-only until the user confirms migration and the API confirms persistence.
export function readLegacyWorkspace(storage) {
  let raw = null;
  try {
    storage ??= globalThis.localStorage;
    raw = storage.getItem(LEGACY_STORAGE_KEY);
    if (raw === null) return { present: false, ok: true };
    return { present: true, raw, ...parseImport(raw) };
  } catch (error) {
    return { present: true, ok: false, raw, error: `Nie można odczytać starej bazy przeglądarki: ${error.message}` };
  }
}

export function retireLegacyWorkspace(raw, storage) {
  try {
    storage ??= globalThis.localStorage;
    if (storage.getItem(LEGACY_STORAGE_KEY) !== raw) return { ok: false, error: "Stara baza zmieniła się w innej karcie. Pozostawiono ją do pobrania; aktywna baza jest już w pliku." };
    storage.removeItem(LEGACY_STORAGE_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Dane zapisano w pliku, ale nie usunięto starej kopii przeglądarki: ${error.message}` };
  }
}

export async function migrateLegacyWorkspace({ legacy, current, confirmed, save, storage }) {
  if (!confirmed) return { ok: false, error: "Migracja wymaga świadomego potwierdzenia." };
  if (!current?.empty || !current.etag) return { ok: false, error: "Baza plikowa nie jest pusta. Pobierz starą bazę jako JSON; migracja nie scala danych." };
  if (!legacy.ok || !legacy.workspace) return { ok: false, error: "Stara baza nie jest poprawnym dokumentem Workspace." };
  const result = await save(legacy.workspace, current.etag);
  if (!result.ok) return result;
  const retired = retireLegacyWorkspace(legacy.raw, storage);
  return { ...result, cleanupWarning: retired.ok ? null : retired.error };
}
