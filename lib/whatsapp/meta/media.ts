import type { MetaSendConfig } from "./config";

// Inbound media (staff photo evidence). Twilio gave a URL; Meta gives a media id that must be resolved and
// downloaded with the access token within a short time. The file is copied into the OS's private Vercel Blob
// store and that URL is what the ticket / housekeeping task stores. SERVER-ONLY.

const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const TIMEOUT_MS = 10000;

export interface MediaDeps {
  fetchImpl?: typeof fetch;
  store?: (path: string, data: Buffer, contentType: string) => Promise<string>; // returns the stored URL
}

async function defaultStore(path: string, data: Buffer, contentType: string): Promise<string> {
  const { put } = await import("@vercel/blob");
  const blob = await put(path, data, { access: "private", contentType, addRandomSuffix: true });
  return blob.url;
}

async function timed(doFetch: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await doFetch(url, Object.assign({}, init, { signal: controller.signal, cache: "no-store" as RequestCache }));
  } finally {
    clearTimeout(timer);
  }
}

// Returns a stored URL, or "meta-media:<id>" when the file could not be copied (the action still completes and the
// id is kept for follow-up), or null when there is no media.
export async function fetchMetaMedia(cfg: MetaSendConfig, mediaId: string | null, deps: MediaDeps = {}): Promise<string | null> {
  if (!mediaId || !/^\d{5,30}$/.test(mediaId)) return null;
  const doFetch = deps.fetchImpl || fetch;
  const auth = { Authorization: "Bearer " + cfg.accessToken };
  try {
    const metaRes = await timed(doFetch, `https://graph.facebook.com/${cfg.graphApiVersion}/${mediaId}`, { headers: auth });
    if (metaRes.status !== 200) throw new Error("media_lookup_" + metaRes.status);
    const info: any = await metaRes.json();
    const url = typeof info?.url === "string" ? info.url : "";
    const declared = Number(info?.file_size || 0);
    if (!url.startsWith("https://") || declared > MAX_MEDIA_BYTES) throw new Error("media_unusable");
    const fileRes = await timed(doFetch, url, { headers: auth });
    if (fileRes.status !== 200) throw new Error("media_download_" + fileRes.status);
    const data = Buffer.from(await fileRes.arrayBuffer());
    if (data.length === 0 || data.length > MAX_MEDIA_BYTES) throw new Error("media_size");
    const contentType = typeof info?.mime_type === "string" ? info.mime_type : "application/octet-stream";
    const ext = (contentType.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
    return await (deps.store || defaultStore)(`whatsapp-media/${mediaId}.${ext}`, data, contentType);
  } catch (err) {
    console.error("[Meta media] could not copy media:", err instanceof Error ? err.message : "unknown");
    return "meta-media:" + mediaId;
  }
}
