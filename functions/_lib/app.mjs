import {allowMethod, errorResponse, HttpError, json} from "./http.mjs";
import {beginDiscord, completeDiscord, getSession, isConfigured, logout, requireSession} from "./auth.mjs";
import {finishRun, leaderboards, profile, startRun} from "./arcade.mjs";
import {getCheers, joinCheers} from "./cheers.mjs";

export async function handleRequest(context, options = {}) {
  const {request, env} = context;
  const path = new URL(request.url).pathname;
  try {
    let response;
    if (path === "/api/session") {
      allowMethod(request, ["GET"]);
      const session = isConfigured(env) ? await getSession(request, env) : null;
      response = json({user: session?.user || null, csrfToken: session?.csrfToken || null, configured: isConfigured(env)});
    } else if (path === "/auth/discord") {
      allowMethod(request, ["GET"]); response = await beginDiscord(request, env);
    } else if (path === "/auth/callback") {
      allowMethod(request, ["GET"]); response = await completeDiscord(request, env, options.fetcher);
    } else if (path === "/auth/logout") {
      allowMethod(request, ["POST"]); response = await logout(request, env, await requireSession(request, env));
    } else if (path === "/api/cheers") {
      allowMethod(request, ["GET", "POST"]);
      response = request.method === "GET" ? await getCheers(request, env) : await joinCheers(request, env);
    } else if (path === "/api/profile") {
      allowMethod(request, ["GET"]); response = await profile(request, env);
    } else if (path === "/api/leaderboards") {
      allowMethod(request, ["GET"]); response = await leaderboards(request, env);
    } else if (path === "/api/runs") {
      allowMethod(request, ["POST"]); response = await startRun(request, env);
    } else if (/^\/api\/runs\/[^/]+\/finish$/.test(path)) {
      allowMethod(request, ["POST"]); response = await finishRun(request, env, path.split("/")[3]);
    } else if (path === "/sesh-signal.js" || path === "/arcade-games.js" || path.startsWith("/games/")) {
      allowMethod(request, ["GET", "HEAD"]);
      await requireSession(request, env);
      const asset = await context.next();
      response = new Response(asset.body, asset);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
    } else if (path.startsWith("/api/") || path.startsWith("/auth/")) {
      throw new HttpError(404, "not_found", "That arcade endpoint does not exist.");
    } else {
      return context.next();
    }
    const protectedResponse = new Response(response.body, response);
    protectedResponse.headers.set("X-Content-Type-Options", "nosniff");
    protectedResponse.headers.set("Referrer-Policy", "no-referrer");
    protectedResponse.headers.set("X-Frame-Options", "DENY");
    protectedResponse.headers.set("Cross-Origin-Resource-Policy", "same-origin");
    return protectedResponse;
  } catch (error) { return errorResponse(error); }
}
