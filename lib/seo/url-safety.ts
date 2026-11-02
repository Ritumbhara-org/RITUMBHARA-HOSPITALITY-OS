// SSRF protection for the Website SEO Audit. SERVER-ONLY, pure functions (no I/O).
//
// The audit fetches user-supplied URLs from the server, so every address it touches must be a public web address.
// Two layers use this file:
//   1. validateTargetUrl() - rejects bad schemes, credentials, odd ports, localhost-style names and IP literals in
//      private/special ranges BEFORE any request is made (and again for every redirect hop).
//   2. isPublicIp() - used by safe-fetch.ts at connect time, on the addresses DNS actually returned, so a public
//      looking hostname that resolves to a private IP (or is re-pointed between check and connect) is still refused.

import { isIP } from "node:net"
import { SeoAuditError } from "./errors"

const MAX_URL_LENGTH = 2048
const ALLOWED_PORTS = new Set(["", "80", "443"])

// Name suffixes that are never public web hosts.
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".private",
  ".corp",
  ".home",
  ".lan",
  ".arpa",
]

// ---------- IP classification ----------

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".")
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n
}

// [network, prefix length] - IPv4 ranges that are not public unicast.
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
]

function isPublicIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip)
  if (n === null) return false
  for (const [base, bits] of BLOCKED_V4) {
    const b = ipv4ToInt(base) as number
    const size = 2 ** (32 - bits)
    if (n >= b && n < b + size) return false
  }
  return true
}

// Expands an IPv6 literal to eight 16-bit groups. Returns null when it cannot be parsed.
function parseIPv6(ip: string): number[] | null {
  if (ip.includes("%")) return null // zone ids are never valid for a public host
  let s = ip.toLowerCase()
  // Embedded IPv4 tail (::ffff:1.2.3.4) -> two hex groups.
  const tail = s.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (tail) {
    const v4 = ipv4ToInt(tail[1])
    if (v4 === null) return null
    const hi = ((v4 >>> 16) & 0xffff).toString(16)
    const lo = (v4 & 0xffff).toString(16)
    s = s.slice(0, s.length - tail[1].length) + hi + ":" + lo
  }
  const halves = s.split("::")
  if (halves.length > 2) return null
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"))
  const head = toGroups(halves[0])
  const rest = halves.length === 2 ? toGroups(halves[1]) : []
  let groups: string[]
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length
    if (missing < 1) return null
    groups = [...head, ...Array(missing).fill("0"), ...rest]
  } else {
    groups = head
  }
  if (groups.length !== 8) return null
  const out: number[] = []
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null
    out.push(parseInt(g, 16))
  }
  return out
}

function isPublicIPv6(ip: string): boolean {
  const g = parseIPv6(ip)
  if (!g) return false
  // Only global unicast 2000::/3 can be a public web host. That alone excludes ::, ::1, ::ffff:0:0/96 (IPv4-mapped),
  // 64:ff9b::/96 (NAT64), fc00::/7 (unique local), fe80::/10 (link-local), fec0::/10 and ff00::/8 (multicast).
  if ((g[0] & 0xe000) !== 0x2000) return false
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false // documentation
  if (g[0] === 0x2001 && g[1] === 0x0000) return false // Teredo
  if (g[0] === 0x2002) return false // 6to4 (embeds an arbitrary IPv4 address)
  return true
}

/** True only for a syntactically valid, publicly routable IPv4/IPv6 address. Anything unparseable is NOT public. */
export function isPublicIp(ip: string): boolean {
  const family = isIP(ip)
  if (family === 4) return isPublicIPv4(ip)
  if (family === 6) return isPublicIPv6(ip)
  return false
}

// ---------- URL validation ----------

/**
 * Accepts what a person types ("example.com", "https://example.com/stays") and returns a candidate URL string.
 * Does not make any judgment about safety; validateTargetUrl() does that.
 */
export function normalizeInputUrl(raw: string): string {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return ""
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  // Anything with another scheme (javascript:, file:, data:, mailto:) is passed through so it is rejected, not "fixed".
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[^/]*:\d+(\/|$)/.test(trimmed)) return trimmed
  return "https://" + trimmed
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
}

/**
 * Validates that `raw` is a public http(s) web address and returns the parsed URL (fragment removed).
 * Throws SeoAuditError("invalid_url") for malformed input and SeoAuditError("blocked_url") for addresses that point
 * at local or internal resources.
 */
export function validateTargetUrl(raw: string): URL {
  const input = (raw ?? "").trim()
  if (!input || input.length > MAX_URL_LENGTH) {
    throw new SeoAuditError("invalid_url", "Please enter a valid website address, for example https://www.example.com.")
  }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new SeoAuditError("invalid_url", "Please enter a valid website address, for example https://www.example.com.")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SeoAuditError("invalid_url", "Only http:// and https:// website addresses can be audited.")
  }
  if (url.username || url.password) {
    throw new SeoAuditError("invalid_url", "Website addresses that contain a username or password can't be audited.")
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SeoAuditError("blocked_url", "Only standard web ports (80 and 443) can be audited.")
  }

  const host = stripBrackets(url.hostname.toLowerCase()).replace(/\.$/, "")
  const blocked = () =>
    new SeoAuditError("blocked_url", "That address points to a private or internal network and can't be audited. Use a public website address.")

  if (!host) throw new SeoAuditError("invalid_url", "Please enter a valid website address, for example https://www.example.com.")

  if (isIP(host)) {
    if (!isPublicIp(host)) throw blocked()
  } else {
    if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) throw blocked()
    // Single-label names ("intranet", "metadata") resolve through the host's search domains - never a public site.
    if (!host.includes(".")) throw blocked()
    // The URL parser turns decimal/hex/octal IPv4 spellings into dotted form; anything numeric left here is bogus.
    if (/^[0-9.]+$/.test(host)) throw blocked()
  }

  url.hash = ""
  return url
}

/** "www.example.com" and "example.com" are the same site for crawling purposes. */
export function siteKey(hostname: string): string {
  return stripBrackets(hostname.toLowerCase()).replace(/\.$/, "").replace(/^www\./, "")
}

export function isSameSite(a: string | URL, b: string | URL): boolean {
  try {
    const ua = typeof a === "string" ? new URL(a) : a
    const ub = typeof b === "string" ? new URL(b) : b
    return siteKey(ua.hostname) === siteKey(ub.hostname)
  } catch {
    return false
  }
}
