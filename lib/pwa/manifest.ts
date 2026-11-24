import type { MetadataRoute } from "next"

// Lets staff install Ritumbhara OS on their phone or desktop: home-screen icon, opens full screen without the browser bar.
// Served at /ritumbhara-os.webmanifest and linked only from the staff pages (login + OS), not the guest portal or signing page.
export const MANIFEST_PATH = "/ritumbhara-os.webmanifest"

export function osManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ritumbhara OS",
    short_name: "Ritumbhara",
    description: "Ritumbhara Hospitality OS — reservations, long stays, guests, operations and inbox.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#4a0518",
    theme_color: "#5c0a20",
    categories: ["business", "productivity", "travel"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New long stay", url: "/long-stay/new", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Reservations", url: "/reservations", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Inbox", url: "/inbox", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Operations", url: "/operations", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  }
}
