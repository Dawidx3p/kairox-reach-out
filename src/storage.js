import { assertWithinLimits, validateWorkspace } from "./validation.js";

const API_URL = "/api/workspace";

function failure(error, code, status) {
  return { ok: false, error, code, ...(status === undefined ? {} : { status }) };
}

async function responseJson(response) {
  if (typeof response.text === "function") {
    const text = await response.text();
    if (!text.trim()) return { empty: true };
    return { value: JSON.parse(text) };
  }
  return { value: await response.json() };
}

function responseEtag(response) {
  return response.headers?.get?.("ETag") || response.headers?.get?.("etag") || null;
}

function httpFailure(response, payload) {
  return failure(
    typeof payload?.error === "string" ? payload.error : `Serwer zwrócił błąd HTTP ${response.status}.`,
    typeof payload?.code === "string" ? payload.code : "HTTP_ERROR",
    response.status,
  );
}

function successfulWorkspace(response, payload) {
  const etag = responseEtag(response);
  if (!etag) return failure("Odpowiedź serwera nie zawiera ETag. Odśwież dane i spróbuj ponownie.", "MISSING_ETAG", response.status);
  let validation;
  try {
    validation = validateWorkspace(payload?.workspace);
  } catch {
    return failure("Serwer zwrócił dane o niepoprawnej strukturze.", "INVALID_RESPONSE", response.status);
  }
  if (!validation.ok) return failure(`Serwer zwrócił niepoprawne dane: ${validation.errors.join("\n")}`, "INVALID_RESPONSE", response.status);
  return {
    ok: true,
    workspace: payload.workspace,
    etag,
    empty: Boolean(payload.empty),
    exists: Boolean(payload.exists),
  };
}

export async function loadWorkspace(fetchImpl = fetch) {
  try {
    const response = await fetchImpl(API_URL, { method: "GET", headers: { Accept: "application/json" } });
    let parsed;
    try {
      parsed = await responseJson(response);
    } catch {
      return failure("Serwer zwrócił odpowiedź, której nie można odczytać.", "INVALID_RESPONSE", response.status);
    }
    if (!response.ok) return httpFailure(response, parsed.value);
    if (parsed.empty) return failure("Serwer zwrócił pustą odpowiedź.", "INVALID_RESPONSE", response.status);
    return successfulWorkspace(response, parsed.value);
  } catch (error) {
    return failure(`Nie można połączyć się z serwerem danych: ${error instanceof Error ? error.message : String(error)}`, "NETWORK_ERROR");
  }
}

export async function saveWorkspace(workspace, etag, fetchImpl = fetch, { replace = false } = {}) {
  let validation;
  try {
    validation = validateWorkspace(workspace);
  } catch {
    return failure("Dane do zapisu mają niepoprawną strukturę.", "VALIDATION_ERROR");
  }
  if (!validation.ok) return failure(validation.errors.join("\n"), "VALIDATION_ERROR");
  const limits = assertWithinLimits(workspace);
  if (!limits.ok) return failure(limits.error, "LIMIT_EXCEEDED");

  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (typeof etag === "string" && etag) headers["If-Match"] = etag;
  if (replace) headers["X-Workspace-Mode"] = "import";
  try {
    const response = await fetchImpl(API_URL, { method: "PUT", headers, body: JSON.stringify(workspace) });
    let parsed;
    try {
      parsed = await responseJson(response);
    } catch {
      if (response.ok) return failure("Nie udało się potwierdzić zapisu. Odśwież dane przed kolejną zmianą.", "UNCERTAIN_SAVE", response.status);
      return httpFailure(response, null);
    }
    if (!response.ok) return httpFailure(response, parsed.value);
    if (parsed.empty) return failure("Serwer nie potwierdził zapisu. Odśwież dane przed kolejną zmianą.", "UNCERTAIN_SAVE", response.status);
    return successfulWorkspace(response, parsed.value);
  } catch (error) {
    return failure(`Nie można potwierdzić zapisu z powodu błędu sieci: ${error instanceof Error ? error.message : String(error)}. Odśwież dane przed ponowną próbą.`, "NETWORK_ERROR");
  }
}

export function parseImport(text) {
  let workspace;
  try {
    workspace = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Plik nie zawiera poprawnego JSON: ${error.message}` };
  }
  let validation;
  try {
    validation = validateWorkspace(workspace);
  } catch {
    return { ok: false, error: "Plik ma niepoprawną strukturę danych." };
  }
  if (!validation.ok) return { ok: false, error: validation.errors.join("\n") };
  const limits = assertWithinLimits(workspace);
  if (!limits.ok) return limits;
  return { ok: true, workspace, count: workspace.leads.length, bytes: limits.bytes };
}

function filenameDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}`;
}

export function downloadJson(workspace, date = new Date(), documentRef = document) {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = `kairox-reach-out-${filenameDate(date)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadRaw(raw, documentRef = document) {
  const blob = new Blob([raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = "kairox-reach-out-uszkodzona-kopia.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
