import {allowMethod, errorResponse, HttpError, json} from "./http.mjs";
import {beginDiscord, completeDiscord, claimArcadeSession, claimShieldSession, isArcadeHost, isShieldHost, shieldRole, getSession, isConfigured, logout, requireSession} from "./auth.mjs";
import {finishRun, leaderboards, profile, startRun} from "./arcade.mjs";
import {startArcadeV2Run, finishArcadeV2Run, arcadeV2Leaderboards, ARCADE_V2_RULES} from "./arcade-v2.mjs";
import {getCheers, joinCheers, sparkCheers, cheersPresence} from "./cheers.mjs";
import {handleBumpManager} from "./bump-manager.mjs";
import {readShieldStatus} from "./shield-status.mjs";

export async function handleRequest(context, options = {}) {
  const {request, env} = context;
  const path = new URL(request.url).pathname;
  try {
    let response;
    const shieldHost = isShieldHost(request, env);
    const shieldHome = path === "/" || path === "/index.html" || path === "/shield" || path === "/shield.html";
    const shieldUi = /^\/(?:shield(?:\.(?:html|css|js))?|shield-telemetry\.js|bump-manager(?:\.(?:html|js|css|webmanifest))?|bump-shield\.js)$/.test(path);
    // Prevent direct access to staff UI assets on the public site, even with a guessed URL.
    if (!shieldHost && shieldUi) throw new HttpError(404, "not_found", "Not found.");
    if (shieldHost && (shieldHome || shieldUi || path === "/favicon.svg")) {
      allowMethod(request, ["GET", "HEAD"]);
      if (!isConfigured(env)) throw new HttpError(503, "setup_required", "Shield sign-in is not configured.");
      if (!/^\d{17,20}$/.test(env.BUMP_MANAGER_OWNER_ID || "")) {
        throw new HttpError(503, "owner_setup_required", "Shield access is not configured.");
      }
      const session = await getSession(request, env);
      if (!session) {
        if (!shieldHome) throw new HttpError(401, "sign_in_required", "Sign in to Shield.");
        // This generic sign-in page contains no private dashboard information.
        const login = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Shield Sign In</title><style>body{background:#07110d;color:#f0f5f1;font:16px system-ui;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:390px;padding:28px}a{display:inline-block;margin-top:16px;background:#baff88;color:#07110d;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700}</style><main><h1>SHIELD</h1><p>Private staff operations. Authorized account required.</p><a href="/auth/discord">Sign in with Discord</a></main></html>';
        response = new Response(login, {headers: {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store"}});
      } else {
        if (!shieldRole(env, session.user.id)) throw new HttpError(403, "staff_only", "Shield is private.");
        const page = new URL(shieldHome ? "/shield" : (path === "/bump-manager.html" ? "/bump-manager" : path), request.url);
        const asset = await env.ASSETS.fetch(new Request(page, request));
        response = new Response(asset.body, asset);
        response.headers.set("Cache-Control", "private, no-store");
      }
    } else if (shieldHost && !(
      path === "/auth/discord" || path === "/auth/claim" || path === "/auth/logout" ||
      path === "/api/session" || path === "/api/shield/status" || path === "/api/bump-manager" || path.startsWith("/api/bump-manager/")
    )) {
      throw new HttpError(404, "not_found", "Not found.");
    } else if ((path === "/" || path === "/index.html") && isArcadeHost(request, env)) {
      allowMethod(request, ["GET", "HEAD"]);
      // Same Pages project/assets, distinct default page by *exact* trusted host.
      // Root domain continues to serve the main website unchanged.
      // Pages ASSETS.fetch requires the pretty URL; /arcade.html redirects to /arcade.
      // Fetching that asset directly would redirect the public arcade hostname away from /.
      const page = new URL("/arcade", request.url);
      response = await env.ASSETS.fetch(new Request(page, request));
    } else if (path === "/auth/claim") {
      allowMethod(request, ["GET"]); response = shieldHost ? await claimShieldSession(request, env) : await claimArcadeSession(request, env);
    } else if (path === "/api/session") {
      allowMethod(request, ["GET"]);
      const session = isConfigured(env) ? await getSession(request, env) : null;
      response = json({user: session?.user || null, csrfToken: session?.csrfToken || null, configured: isConfigured(env), ...(shieldHost ? {role: session ? shieldRole(env, session.user.id) : null} : {})});
    } else if (path === "/auth/discord") {
      allowMethod(request, ["GET"]); response = await beginDiscord(request, env);
    } else if (path === "/auth/callback") {
      allowMethod(request, ["GET"]); response = await completeDiscord(request, env, options.fetcher);
    } else if (path === "/auth/logout") {
      allowMethod(request, ["POST"]); response = await logout(request, env, await requireSession(request, env));
    } else if (path === "/api/shield/status") {
      allowMethod(request, ["GET"]);
      response = await readShieldStatus(request, env, options.fetcher);
    } else if (path === "/api/bump-manager" || path.startsWith("/api/bump-manager/")) {
      allowMethod(request, ["GET", "POST"]);
      response = await handleBumpManager(request, env, path);
    } else if (path === "/api/cheers") {
      allowMethod(request, ["GET", "POST"]);
      response = request.method === "GET" ? await getCheers(request, env) : await joinCheers(request, env);
    } else if (path === "/api/cheers/spark") {
      allowMethod(request, ["POST"]);
      response = await sparkCheers(request, env);
    } else if (path === "/api/cheers/presence") {
      allowMethod(request, ["POST"]);
      response = await cheersPresence(request, env);
    } else if (path === "/api/arcade-v2/profile") {
      allowMethod(request, ["GET"]); response = await profile(request, env, ARCADE_V2_RULES);
    } else if (path === "/api/arcade-v2/leaderboards") {
      allowMethod(request, ["GET"]); response = await arcadeV2Leaderboards(request, env);
    } else if (path === "/api/arcade-v2/runs") {
      allowMethod(request, ["POST"]); response = await startArcadeV2Run(request, env);
    } else if (/^\/api\/arcade-v2\/runs\/[^/]+\/finish$/.test(path)) {
      allowMethod(request, ["POST"]); response = await finishArcadeV2Run(request, env, path.split("/")[4]);
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
  } catch (error) { return errorResponse(error, request); }
}
