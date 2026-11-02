// SSRF-hardened HTTP fetch for the Website SEO Audit. SERVER-ONLY.
//
// Why not plain fetch(): it follows redirects blindly, has no size limit and gives no hook between "DNS answered" and
// "socket connected". This module:
//   - validates the URL up front and again for EVERY redirect hop (redirects are followed manually, max 3, and must
//     stay on the same site, so an open redirect cannot be used to reach another host),
//   - checks the addresses DNS returned at CONNECT time (custom `lookup`), so a hostname that resolves to a private,
//     loopback, link-local or metadata address - or is re-pointed between check and connect - is refused,
//   - allows only ports 80/443,
//   - enforces one overall time limit for the whole request (including redirects),
//   - reads at most `maxBytes` of the DECODED body (gzip/deflate/br are decoded with the same cap, so a compression
//     bomb cannot blow up memory), then stops reading,
//   - never puts raw network error text into the messages it throws (those can contain internal IPs).

import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import zlib from "node:zlib"
import type { Readable } from "node:stream"
import type { LookupFunction } from "node:net"
import { SeoAuditError } from "./errors"
import { isPublicIp, isSameSite, validateTargetUrl } from "./url-safety"

export const DEFAULT_TIMEOUT_MS = 8_000
export const DEFAULT_MAX_BYTES = 1_500_000
export const DEFAULT_MAX_REDIRECTS = 3
const USER_AGENT = "RitumbharaOS-SEOAudit/1.0 (+website SEO audit; admin-initiated)"

export interface SafeFetchOptions {
  /** Total time allowed for this request, redirects included. */
  timeoutMs?: number
  /** Maximum decoded body size kept, in bytes. Reading stops here and the response is flagged `truncated`. */
  maxBytes?: number
  maxRedirects?: number
  accept?: string
  /** Absolute deadline (epoch ms) shared by several requests; the earlier of this and timeoutMs wins. */
  deadline?: number
  /** Test seam only: replaces dns.lookup. The public-address check still runs on whatever it returns. */
  resolver?: typeof dns.lookup
}

export interface SafeFetchResponse {
  /** Final URL after redirects. */
  url: string
  status: number
  contentType: string
  body: string
  truncated: boolean
}

interface Hop {
  status: number
  headers: http.IncomingHttpHeaders
  body: Buffer
  truncated: boolean
}

class BlockedAddressError extends Error {
  code = "ESEO_BLOCKED"
}

function guardedLookup(resolver: typeof dns.lookup): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, "", 0)
      const list = addresses as dns.LookupAddress[]
      // One bad answer poisons the lot: an attacker-controlled name can return public and private records together.
      if (list.length === 0 || list.some((a) => !isPublicIp(a.address))) {
        return callback(new BlockedAddressError("blocked address"), "", 0)
      }
      if (options && (options as { all?: boolean }).all) {
        return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list)
      }
      return callback(null, list[0].address, list[0].family)
    })
  }
}

function mapNetworkError(err: unknown, aborted: boolean): SeoAuditError {
  if (aborted) return new SeoAuditError("timeout", "The website took too long to respond.")
  if (err instanceof SeoAuditError) return err
  const code = String((err as { code?: unknown } | null)?.code ?? "")
  if (code === "ESEO_BLOCKED") {
    return new SeoAuditError("blocked_url", "That address points to a private or internal network and can't be audited. Use a public website address.")
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NODATA") {
    return new SeoAuditError("unreachable", "We couldn't find that website. Check the address and try again.")
  }
  if (code === "ETIMEDOUT" || code === "ABORT_ERR" || (err as { name?: string } | null)?.name === "AbortError") {
    return new SeoAuditError("timeout", "The website took too long to respond.")
  }
  if (/CERT|TLS|SSL|ERR_TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)) {
    return new SeoAuditError("unreachable", "We couldn't make a secure connection to that website (its HTTPS certificate may be invalid).")
  }
  return new SeoAuditError("unreachable", "We couldn't reach that website. Check that it's online and publicly accessible.")
}

function decodeBody(buf: Buffer, contentType: string): string {
  const m = /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)
  const label = m?.[1] ?? "utf-8"
  try {
    return new TextDecoder(label).decode(buf)
  } catch {
    return new TextDecoder("utf-8").decode(buf)
  }
}

type HopOptions = Required<Pick<SafeFetchOptions, "maxBytes" | "accept">> & { deadline: number; resolver: typeof dns.lookup }

// Anything that escapes hopOnceRaw (e.g. http.request() throwing synchronously on an invalid header) is mapped too,
// so callers only ever see SeoAuditError and no raw error text.
function hopOnce(url: URL, opts: HopOptions): Promise<Hop> {
  return hopOnceRaw(url, opts).catch((err) => {
    throw mapNetworkError(err, false)
  })
}

function hopOnceRaw(url: URL, opts: HopOptions): Promise<Hop> {
  return new Promise<Hop>((resolve, reject) => {
    const remaining = opts.deadline - Date.now()
    if (remaining <= 0) return reject(new SeoAuditError("timeout", "The website took too long to respond."))

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), remaining)
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const fail = (err: unknown) => finish(() => reject(mapNetworkError(err, ac.signal.aborted)))

    const transport = url.protocol === "https:" ? https : http
    const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        path: url.pathname + url.search,
        method: "GET",
        agent: false,
        lookup: guardedLookup(opts.resolver),
        signal: ac.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: opts.accept,
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase().trim()

        // Redirects: the caller follows them (after re-validating); there is no body worth reading.
        if (status >= 300 && status < 400) {
          res.resume()
          return finish(() => resolve({ status, headers: res.headers, body: Buffer.alloc(0), truncated: false }))
        }

        let stream: Readable = res
        if (encoding === "gzip" || encoding === "x-gzip") stream = res.pipe(zlib.createGunzip())
        else if (encoding === "deflate") stream = res.pipe(zlib.createInflate())
        else if (encoding === "br") stream = res.pipe(zlib.createBrotliDecompress())
        else if (encoding && encoding !== "identity") {
          res.destroy()
          return fail(new Error("unsupported content-encoding"))
        }
        if (stream !== res) res.on("error", fail)

        const chunks: Buffer[] = []
        let total = 0
        let truncated = false
        const done = () => {
          if (stream !== res) stream.destroy()
          res.destroy()
          finish(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated }))
        }
        stream.on("data", (chunk: Buffer) => {
          if (settled) return
          const room = opts.maxBytes - total
          if (chunk.length >= room) {
            chunks.push(chunk.subarray(0, room))
            total += room
            truncated = true
            return done()
          }
          chunks.push(chunk)
          total += chunk.length
        })
        stream.on("end", () => {
          if (!settled) finish(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks), truncated }))
        })
        stream.on("error", fail)
        res.on("aborted", () => fail(Object.assign(new Error("aborted"), { code: "ECONNRESET" })))
      }
    )
    req.on("error", fail)
    req.end()
  })
}

/**
 * Fetches a public web page/file safely. Returns the response for ANY HTTP status (the caller decides what a 404
 * means). Throws SeoAuditError for invalid/blocked addresses, timeouts and connection failures.
 */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const deadline = Math.min(options.deadline ?? Infinity, Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS))
  const resolver = options.resolver ?? dns.lookup
  const accept = options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const start = validateTargetUrl(rawUrl)
  let current = start
  for (let hops = 0; ; hops++) {
    const hop = await hopOnce(current, { maxBytes, accept, deadline, resolver })

    if (hop.status >= 300 && hop.status < 400 && hop.headers.location) {
      if (hops >= maxRedirects) throw new SeoAuditError("unreachable", "That website redirects too many times.")
      let next: URL
      try {
        next = new URL(String(hop.headers.location), current)
      } catch {
        throw new SeoAuditError("unreachable", "That website sent an invalid redirect.")
      }
      // Re-validate every hop exactly like the first address (scheme, port, local/private names and IP literals).
      next = validateTargetUrl(next.href)
      if (!isSameSite(start, next)) {
        throw new SeoAuditError(
          "unreachable",
          "That address redirects to a different website. Enter the final address of the site you want to audit."
        )
      }
      current = next
      continue
    }

    const contentType = String(hop.headers["content-type"] ?? "")
    return {
      url: current.toString(),
      status: hop.status,
      contentType,
      body: decodeBody(hop.body, contentType),
      truncated: hop.truncated,
    }
  }
}
