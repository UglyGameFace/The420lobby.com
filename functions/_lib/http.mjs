export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }
  });
}

export function errorResponse(error) {
  if (error instanceof HttpError) return json({error: {code: error.code, message: error.message}}, error.status);
  // Do not return SQL, OAuth responses, cookie values, or stack traces to browsers.
  console.error("Arcade request failed", error?.name || "Error");
  return json({error: {code: "service_unavailable", message: "The arcade is temporarily unavailable. Please try again."}}, 503);
}

export async function readJson(request, maxBytes = 65536) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "json_required", "Send this request as JSON.");
  }
  const advertised = Number(request.headers.get("content-length"));
  if (advertised > maxBytes) throw new HttpError(413, "payload_too_large", "The run transcript is too large.");
  if (!request.body) throw new HttpError(400, "invalid_json", "A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, "payload_too_large", "The run transcript is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error();
    return value;
  } catch { throw new HttpError(400, "invalid_json", "The request body must be a JSON object."); }
}

export function allowMethod(request, methods) {
  if (!methods.includes(request.method)) throw new HttpError(405, "method_not_allowed", "This request method is not supported.");
}

export function exactFields(object, fields) {
  if (Object.keys(object).some(key => !fields.includes(key))) throw new HttpError(400, "unexpected_field", "The request contains an unsupported field.");
}

export function redirect(location, cookies = []) {
  const headers = new Headers({Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"});
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, {status: 302, headers});
}
