/**
 * Carries the cookies Overleaf sets during the Socket.IO handshake into the WebSocket upgrade.
 *
 * overleaf.com sits behind a Google Cloud load balancer that pins a client to one backend with
 * a `GCLB` cookie, set on the handshake response. The handshake creates a session id that only
 * the backend which answered it knows, so an upgrade request that lands on a different backend
 * fails as an unknown session. Sending the cookies back is what a browser does on its own, and
 * what keeps the upgrade on the same backend.
 *
 * Only the `name=value` part of each `Set-Cookie` is kept; attributes such as `Path` or
 * `Expires` describe the cookie to a browser and are not sent back.
 */
export function mergeHandshakeCookies(cookieHeader: string, setCookieValues: readonly string[]): string {
  const cookies = new Map<string, string>();
  for (const pair of splitCookiePairs(cookieHeader)) cookies.set(pair.name, pair.value);
  for (const setCookie of setCookieValues) {
    const firstPart = setCookie.split(";")[0] ?? "";
    const [pair] = splitCookiePairs(firstPart);
    // The session cookie is the user's credential. A handshake response has no business
    // replacing it, so only cookies the caller did not already send are taken.
    if (pair && !cookies.has(pair.name)) cookies.set(pair.name, pair.value);
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

function splitCookiePairs(header: string): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name && !/[\r\n\0]/.test(name + value)) pairs.push({ name, value });
  }
  return pairs;
}
