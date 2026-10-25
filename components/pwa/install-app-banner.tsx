"use client"

import { useEffect, useState } from "react"
import { Download, Share, SquarePlus, X } from "lucide-react"

// Offers to install the OS as an app. Android/desktop Chrome: one tap (browser install prompt).
// iPhone/iPad Safari has no prompt, so it shows the two steps instead. Hidden once installed or dismissed.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "ritumbhara-os-install-dismissed"

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1"
  } catch {
    return false
  }
}

export function InstallAppBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden")
  const [showSteps, setShowSteps] = useState(false)

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
      setMode("prompt")
    }
    const onInstalled = () => setMode("hidden")
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    // Safari on iPhone/iPad never fires beforeinstallprompt. Only show there on small screens, where it matters.
    const t = setTimeout(() => {
      if (isIos() && window.matchMedia("(max-width: 1024px)").matches) setMode((m) => (m === "hidden" ? "ios" : m))
    }, 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1")
    } catch {
      // private mode: just hide for now
    }
    setMode("hidden")
  }

  async function install() {
    if (mode === "ios") {
      setShowSteps((s) => !s)
      return
    }
    if (!promptEvent) return
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    setPromptEvent(null)
    if (outcome === "accepted") setMode("hidden")
  }

  if (mode === "hidden") return null

  return (
    <div className="mx-4 sm:mx-6 rounded-2xl border border-rose-500/15 bg-gradient-to-r from-[#5c0a20] to-[#7a0f2c] text-white shadow-sm">
      <div className="flex items-center gap-3 p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Ritumbhara OS</p>
          <p className="text-xs text-white/75">Open it from your home screen, full screen like an app.</p>
        </div>
        <button type="button" onClick={install} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-[#5c0a20] hover:bg-white/90">
          <Download className="h-4 w-4" /> Install
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      {mode === "ios" && showSteps && (
        <ol className="space-y-2 border-t border-white/10 px-4 py-3 text-sm">
          <li className="flex items-center gap-2">
            <span className="font-semibold">1.</span> Tap <Share className="h-4 w-4" aria-label="Share" /> <span className="font-semibold">Share</span> in Safari&apos;s toolbar.
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold">2.</span> Choose <SquarePlus className="h-4 w-4" aria-hidden /> <span className="font-semibold">Add to Home Screen</span>, then <span className="font-semibold">Add</span>.
          </li>
        </ol>
      )}
    </div>
  )
}
