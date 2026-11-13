// Thin Channex HTTP client: `user-api-key` header, JSON, unwraps the { data } envelope, normalizes errors,
// retries transient failures. The transport (fetch) is injectable so tests never touch the network.

import type { AvailabilityValue, ChannexConfig, ChannexErrorBody, RestrictionValue } from "./types"

export class ChannexError extends Error {
  constructor(public status: number, public body: ChannexErrorBody, message?: string) {
    super(message ?? `Channex ${status}: ${body.title || body.code || "error"}${formatDetails(body.details)}`)
    this.name = "ChannexError"
  }
}

function formatDetails(d: unknown): string {
  if (d === undefined || d === null) return ""
  return " (" + (typeof d === "string" ? d : JSON.stringify(d)) + ")"
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>

export interface ClientOptions {
  fetch?: FetchLike
  retries?: number
  retryDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): ChannexConfig | null {
  const apiKey = (env.CHANNEX_API_KEY || "").trim()
  if (!apiKey) return null
  const baseUrl = (env.CHANNEX_BASE_URL || "https://staging.channex.io/api/v1").trim().replace(/\/+$/, "")
  return { apiKey, baseUrl }
}

export class ChannexClient {
  private fetchImpl: FetchLike
  private retries: number
  private retryDelayMs: number
  private sleep: (ms: number) => Promise<void>

  constructor(private config: ChannexConfig, opts: ClientOptions = {}) {
    this.fetchImpl = opts.fetch ?? ((url, init) => fetch(url, init))
    this.retries = opts.retries ?? 2
    this.retryDelayMs = opts.retryDelayMs ?? 500
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  get isProduction(): boolean {
    return !/staging\./.test(this.config.baseUrl)
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<{ data: T; meta?: Record<string, unknown> }> {
    const qs = query
      ? "?" + Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")
      : ""
    const url = this.config.baseUrl + path + (qs === "?" ? "" : qs)
    let lastErr: unknown
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: { "user-api-key": this.config.apiKey, "content-type": "application/json", accept: "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
        const text = await res.text()
        let json: any = {}
        try { json = text ? JSON.parse(text) : {} } catch { json = {} }
        if (res.status >= 200 && res.status < 300) return { data: json.data as T, meta: json.meta }
        const err = new ChannexError(res.status, json.errors ?? { title: text.slice(0, 200) })
        // 429 and 5xx are transient; everything else (400/401/404/422) is a real answer and is not retried.
        if ((res.status === 429 || res.status >= 500) && attempt < this.retries) { lastErr = err; await this.sleep(this.retryDelayMs * (attempt + 1)); continue }
        throw err
      } catch (e) {
        if (e instanceof ChannexError) throw e
        lastErr = e
        if (attempt < this.retries) { await this.sleep(this.retryDelayMs * (attempt + 1)); continue }
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Channex request failed")
  }

  // --- content ---
  createProperty(attrs: Record<string, unknown>) { return this.request<{ id: string }>("POST", "/properties", { property: attrs }) }
  updateProperty(id: string, attrs: Record<string, unknown>) { return this.request("PUT", `/properties/${id}`, { property: attrs }) }
  listProperties() { return this.request<{ id: string; attributes: Record<string, unknown> }[]>("GET", "/properties") }
  createRoomType(attrs: Record<string, unknown>) { return this.request<{ id: string }>("POST", "/room_types", { room_type: attrs }) }
  updateRoomType(id: string, attrs: Record<string, unknown>) { return this.request("PUT", `/room_types/${id}`, { room_type: attrs }) }
  listRoomTypes(propertyId: string) { return this.request<{ id: string; attributes: Record<string, unknown> }[]>("GET", "/room_types", undefined, { "filter[property_id]": propertyId }) }
  createRatePlan(attrs: Record<string, unknown>) { return this.request<{ id: string }>("POST", "/rate_plans", { rate_plan: attrs }) }
  updateRatePlan(id: string, attrs: Record<string, unknown>) { return this.request("PUT", `/rate_plans/${id}`, { rate_plan: attrs }) }
  listRatePlans(propertyId: string) { return this.request<{ id: string; attributes: Record<string, unknown> }[]>("GET", "/rate_plans", undefined, { "filter[property_id]": propertyId }) }

  // --- ARI (availability and restrictions are always separate messages) ---
  pushAvailability(values: AvailabilityValue[]) { return this.request("POST", "/availability", { values }) }
  pushRestrictions(values: RestrictionValue[]) { return this.request("POST", "/restrictions", { values }) }
  readAvailability(propertyId: string, from: string, to: string) {
    return this.request<Record<string, Record<string, number>>>("GET", "/availability", undefined, { "filter[property_id]": propertyId, "filter[date][gte]": from, "filter[date][lte]": to })
  }
  readRestrictions(propertyId: string, from: string, to: string, fields = "rate,min_stay_arrival,stop_sell") {
    // filter[restrictions] is REQUIRED on reads; without it the API answers 400.
    return this.request<Record<string, Record<string, Record<string, unknown>>>>("GET", "/restrictions", undefined, { "filter[property_id]": propertyId, "filter[date][gte]": from, "filter[date][lte]": to, "filter[restrictions]": fields })
  }

  // --- bookings ---
  // The page size param name is not verified against staging yet, so none is sent by default (the feed defaults to 10).
  feed(query?: Record<string, string | number | undefined>) { return this.request<{ id: string; attributes: Record<string, any> }[]>("GET", "/booking_revisions/feed", undefined, query) }
  getRevision(id: string) { return this.request<{ id: string; attributes: Record<string, any> }>("GET", `/booking_revisions/${id}`) }
  ackRevision(id: string) { return this.request("POST", `/booking_revisions/${id}/ack`, {}) }
  listBookings(query: Record<string, string | number | undefined>) { return this.request<{ id: string; attributes: Record<string, any> }[]>("GET", "/bookings", undefined, query) }
  createWebhook(attrs: Record<string, unknown>) { return this.request<{ id: string }>("POST", "/webhooks", { webhook: attrs }) }
  listWebhooks() { return this.request<{ id: string; attributes: Record<string, any> }[]>("GET", "/webhooks") }

  // --- channels (needs Channel API access on the account; the first test_connection call tells you) ---
  listGroups() { return this.request<{ id: string; attributes: Record<string, any>; relationships?: Record<string, any> }[]>("GET", "/groups") }
  listChannels() { return this.request<{ id: string; attributes: Record<string, any> }[]>("GET", "/channels") }
  testConnection(channel: string, hotelId: string) { return this.request("POST", "/channels/test_connection", { channel, settings: { hotel_id: hotelId } }) }
  mappingDetails(channel: string, hotelId: string) { return this.request<{ rooms?: any[] }>("POST", "/channels/mapping_details", { channel, settings: { hotel_id: hotelId } }) }
  createChannel(attrs: Record<string, unknown>) { return this.request<{ id: string }>("POST", "/channels", { channel: attrs }) }
  activateChannel(id: string) { return this.request("POST", `/channels/${id}/activate`, {}) }
  deactivateChannel(id: string) { return this.request("POST", `/channels/${id}/deactivate`, {}) }
  deleteChannel(id: string) { return this.request("DELETE", `/channels/${id}`) }
}
