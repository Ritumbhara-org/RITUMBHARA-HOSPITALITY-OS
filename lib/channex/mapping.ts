// Local id <-> Channex UUID mapping. Persisted in the OS database so content sync is idempotent (POST once, PUT after)
// and the `booking` kind can dedupe inbound revisions and find a booking to cancel.

import type { ChannexEntityKind } from "./types"

export interface MappingStore {
  get(kind: ChannexEntityKind, localId: string): Promise<string | null>
  getLocal(kind: ChannexEntityKind, channexId: string): Promise<string | null>
  set(kind: ChannexEntityKind, localId: string, channexId: string): Promise<void>
}

/** In-memory store for tests and for dry runs. */
export class MemoryMappingStore implements MappingStore {
  private byLocal = new Map<string, string>()
  private byChannex = new Map<string, string>()
  async get(kind: ChannexEntityKind, localId: string) { return this.byLocal.get(`${kind}:${localId}`) ?? null }
  async getLocal(kind: ChannexEntityKind, channexId: string) { return this.byChannex.get(`${kind}:${channexId}`) ?? null }
  async set(kind: ChannexEntityKind, localId: string, channexId: string) {
    this.byLocal.set(`${kind}:${localId}`, channexId)
    this.byChannex.set(`${kind}:${channexId}`, localId)
  }
}
