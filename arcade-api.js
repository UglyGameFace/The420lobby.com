/* Same-origin arcade requests. Discord credentials are held by the server. */
export class ArcadeError extends Error {
  constructor(message, code = "request_failed", status = 0) {
    super(message);
    this.name = "ArcadeError";
    this.code = code;
    this.status = status;
  }
}

export async function arcadeRequest(path, {body, csrfToken, signal} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, {once: true});
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : {"Content-Type": "application/json"}),
        ...(csrfToken ? {"X-CSRF-Token": csrfToken} : {})
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      signal: controller.signal
    });
    let data;
    try { data = await response.json(); }
    catch (_) { throw new ArcadeError("The arcade server is unavailable. Please try again.", "server_unavailable", response.status); }
    if (!response.ok) {
      throw new ArcadeError(data?.error?.message || "The server could not complete this request.", data?.error?.code, response.status);
    }
    return data;
  } catch (error) {
    if (error instanceof ArcadeError) throw error;
    throw new ArcadeError(signal?.aborted ? "Request cancelled." : "Could not reach the arcade server. Check your connection and try again.", "network_error");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function startAuthenticatedRun(game, signal) {
  const session = await arcadeRequest("/api/session", {signal});
  if (!session.configured) throw new ArcadeError("Discord sign-in is awaiting server setup. Please come back soon.", "not_configured");
  if (!session.user || !session.csrfToken) throw new ArcadeError("Sign in with Discord to play and save your scores.", "login_required", 401);
  const run = await arcadeRequest("/api/runs", {
    body: {game}, csrfToken: session.csrfToken, signal
  });
  if (!run.id || !run.seed || run.game !== game) throw new ArcadeError("The server returned an incomplete round. Please try again.", "invalid_run_response");
  return {session, run};
}

export function saveAuthenticatedRun(run, session, events, elapsedMs, signal) {
  return arcadeRequest("/api/runs/" + encodeURIComponent(run.id) + "/finish", {
    body: {events, elapsedMs}, csrfToken: session.csrfToken, signal
  });
}

export function notifyScoreSaved(result) {
  window.dispatchEvent(new CustomEvent("arcade:score-saved", {detail: result}));
}
