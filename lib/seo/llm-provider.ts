// LLM provider layer for the Website SEO Audit. SERVER-ONLY.
//
// Same idea as the standalone SEO Agent: every provider implements one method - "send a system prompt and a user
// prompt, get raw text back" - so llm.ts (prompt building, JSON parsing, validation) never needs to know which model
// answered. Switching provider is an environment variable, not a code change:
//
//   SEO_LLM_PROVIDER = gemini (default) | anthropic
//
// Env (none are read at import time; a missing key is reported when an audit actually needs the model):
//   GEMINI_API_KEY      - shared with the rest of the OS (lib/ai/gemini.ts)
//   SEO_GEMINI_MODEL    - default gemini-2.5-flash
//   ANTHROPIC_API_KEY   - only when SEO_LLM_PROVIDER=anthropic
//   SEO_ANTHROPIC_MODEL - default claude-sonnet-5-5
//
// Anthropic is called over HTTPS with fetch (no SDK dependency added to the OS for an optional provider).

import { GoogleGenAI, ThinkingLevel } from "@google/genai"

export type LlmFailureKind = "not_configured" | "rate_limited" | "overloaded" | "auth" | "timeout" | "failed" | "bad_response"

export class LlmError extends Error {
  readonly kind: LlmFailureKind
  constructor(kind: LlmFailureKind, message: string) {
    super(message)
    this.name = "LlmError"
    this.kind = kind
  }
}

export interface LlmCallOptions {
  /** Time allowed for the model call. */
  timeoutMs: number
}

export interface LlmProvider {
  readonly name: string
  /** Sends prompts, returns the raw text response. No parsing or validation here. */
  generateJson(systemPrompt: string, userPrompt: string, options: LlmCallOptions): Promise<string>
}

const MAX_OUTPUT_TOKENS = 8000
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5"
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
const ANTHROPIC_VERSION = "2023-06-01"

function classifyHttpStatus(status: number | undefined): LlmFailureKind {
  if (status === 429) return "rate_limited"
  if (status === 503 || status === 529 || status === 500 || status === 502 || status === 504) return "overloaded"
  if (status === 401 || status === 403) return "auth"
  return "failed"
}

function classifyError(err: unknown, aborted: boolean): LlmError {
  if (err instanceof LlmError) return err
  if (aborted) return new LlmError("timeout", "model call timed out")
  const e = err as { status?: unknown; name?: unknown; message?: unknown } | null
  const status = typeof e?.status === "number" ? e.status : undefined
  if (status !== undefined) return new LlmError(classifyHttpStatus(status), `provider returned HTTP ${status}`)
  const msg = String(e?.message ?? "")
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return new LlmError("timeout", "model call timed out")
  if (/RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg)) return new LlmError("rate_limited", "provider rate limit")
  if (/UNAVAILABLE|overloaded/i.test(msg)) return new LlmError("overloaded", "provider overloaded")
  return new LlmError("failed", "provider call failed")
}

// Gemini 3.x controls reasoning with thinkingLevel; 2.5 Flash with thinkingBudget (0 = off). Thinking tokens come out
// of the same output budget as the JSON, so keep them minimal. Other models: send no thinking config at all.
function geminiThinkingConfig(model: string) {
  if (/^gemini-3/i.test(model)) return { thinkingLevel: ThinkingLevel.MINIMAL }
  if (/^gemini-2\.5-flash/i.test(model)) return { thinkingBudget: 0 }
  return undefined
}

function createGeminiProvider(): LlmProvider {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new LlmError("not_configured", "GEMINI_API_KEY is not set")
  const model = process.env.SEO_GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  const client = new GoogleGenAI({ apiKey })
  return {
    name: "gemini",
    async generateJson(systemPrompt, userPrompt, { timeoutMs }) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const response = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: systemPrompt,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            // Asks the API itself to constrain output to JSON; llm.ts still validates everything it gets back.
            responseMimeType: "application/json",
            abortSignal: ac.signal,
            thinkingConfig: geminiThinkingConfig(model),
          },
        })
        const text = response.text
        if (!text) throw new LlmError("bad_response", "Gemini returned no text")
        return text
      } catch (err) {
        throw classifyError(err, ac.signal.aborted)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

function createAnthropicProvider(): LlmProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new LlmError("not_configured", "ANTHROPIC_API_KEY is not set")
  const model = process.env.SEO_ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL
  return {
    name: "anthropic",
    async generateJson(systemPrompt, userPrompt, { timeoutMs }) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: "POST",
          signal: ac.signal,
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
          body: JSON.stringify({
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
          }),
        })
        // The response body is deliberately never read or logged on errors: it can echo request details.
        if (!res.ok) throw new LlmError(classifyHttpStatus(res.status), `provider returned HTTP ${res.status}`)
        const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> }
        const block = json.content?.find((b) => b.type === "text" && typeof b.text === "string")
        if (!block?.text) throw new LlmError("bad_response", "Anthropic returned no text")
        return block.text
      } catch (err) {
        throw classifyError(err, ac.signal.aborted)
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

/** Returns the configured provider. Throws LlmError("not_configured") when its API key is missing. */
export function getLlmProvider(): LlmProvider {
  const name = (process.env.SEO_LLM_PROVIDER || "gemini").trim().toLowerCase()
  if (name === "gemini") return createGeminiProvider()
  if (name === "anthropic") return createAnthropicProvider()
  throw new LlmError("not_configured", `Unknown SEO_LLM_PROVIDER "${name}"`)
}

/** A short, honest, user-facing reason the AI recommendations are missing. Never includes provider error bodies. */
export function describeLlmFailure(err: unknown): string {
  const kind: LlmFailureKind = err instanceof LlmError ? err.kind : "failed"
  switch (kind) {
    case "not_configured":
      return "AI recommendations aren't set up on this server yet (the AI provider key is missing). The technical audit below is complete."
    case "rate_limited":
      return "The AI provider's rate limit was reached. The technical audit below is complete - try again in a few minutes for AI recommendations."
    case "overloaded":
      return "The AI provider is temporarily overloaded. The technical audit below is complete - try again shortly for AI recommendations."
    case "auth":
      return "The AI provider rejected this server's credentials. The technical audit below is complete; ask an admin to check the AI provider key."
    case "timeout":
      return "The AI provider took too long to respond. The technical audit below is complete - try again for AI recommendations."
    case "bad_response":
      return "The AI model returned a response that couldn't be used. The technical audit below is complete - try again for AI recommendations."
    default:
      return "AI recommendations are unavailable right now. The technical audit below is complete - try again shortly."
  }
}
