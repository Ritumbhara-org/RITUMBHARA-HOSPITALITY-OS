// Private Vercel Blob storage for Long Stays files (ID copies, photos/videos, signatures, signed PDFs). SERVER-ONLY.
// One small seam so tests can swap in an in-memory store.

export { del, get, put } from "@vercel/blob"
