/**
 * PayMongo's hosted checkout URL arrives from our own backend, but it is still
 * an externally-supplied string that we hand to window.location, so it is
 * validated before use: a malformed value, a javascript:/data: URL, or an
 * unexpected host is refused rather than followed.
 *
 * Hosts are restricted to PayMongo's own domains. Loopback is allowed as well
 * so a locally-stubbed provider can be exercised during development; a real
 * deployment only ever sees the paymongo.com hosts. If PayMongo ever serves
 * checkout from an additional domain, this list is the single place to update.
 */
const ALLOWED_HOST_SUFFIXES = ["paymongo.com"]
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname)
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (isLoopbackHost(host)) return true
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

/** Returns a safe absolute checkout URL, or null when the value cannot be trusted. */
export function resolveCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }

  const isHttps = url.protocol === "https:"
  const isLocalHttp = url.protocol === "http:" && isLoopbackHost(url.hostname.toLowerCase())
  if (!isHttps && !isLocalHttp) return null
  if (!isAllowedHost(url.hostname)) return null

  return url.toString()
}
