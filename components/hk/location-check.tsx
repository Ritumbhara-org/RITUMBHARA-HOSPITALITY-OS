"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { getFix } from "./geolocation"

type State =
  | { kind: "checking" }
  | { kind: "good"; m: number }
  | { kind: "ok"; m: number }
  | { kind: "weak"; m: number }
  | { kind: "error"; message: string }

function classify(accuracyM: number): State {
  const m = Math.round(accuracyM)
  return m <= 50 ? { kind: "good", m } : m <= 150 ? { kind: "ok", m } : { kind: "weak", m }
}

// Runs when the housekeeper opens the app, so the phone's location prompt appears now (not at check-in)
// and a weak or approximate reading is explained before it blocks a check-in.
export function LocationCheck() {
  const [state, setState] = useState<State>({ kind: "checking" })

  const retry = () => {
    setState({ kind: "checking" })
    getFix().then(
      (fix) => setState(classify(fix.accuracyM)),
      (e) => setState({ kind: "error", message: e instanceof Error ? e.message : "लोकेशन नहीं मिल सकी।" }),
    )
  }

  useEffect(() => {
    let live = true
    getFix().then(
      (fix) => live && setState(classify(fix.accuracyM)),
      (e) => live && setState({ kind: "error", message: e instanceof Error ? e.message : "लोकेशन नहीं मिल सकी।" }),
    )
    return () => {
      live = false
    }
  }, [])

  if (state.kind === "checking") {
    return <p className="rounded-lg border p-3 text-sm text-muted-foreground">लोकेशन जांच रहे हैं... अगर फ़ोन पूछे तो &quot;अनुमति दें&quot; दबाएं और &quot;सटीक (Precise)&quot; चुनें।</p>
  }
  if (state.kind === "good" || state.kind === "ok") {
    return (
      <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
        ✓ लोकेशन ठीक है (करीब {state.m} मीटर)। आप चेक-इन कर सकते हैं।
      </p>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-medium">
        {state.kind === "weak" ? `लोकेशन साफ़ नहीं है (करीब ${state.m} मीटर का फ़र्क)।` : state.message}
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>फ़ोन में Location (GPS) चालू करें।</li>
        <li>Chrome में ऊपर लॉक आइकन → Permissions → Location → Allow, और &quot;Precise / सटीक&quot; चुनें।</li>
        <li>बाहर खुली जगह या खिड़की के पास जाएं, फिर नीचे दबाएं।</li>
      </ol>
      <Button type="button" variant="outline" onClick={retry}>
        दोबारा जांचें
      </Button>
    </div>
  )
}
