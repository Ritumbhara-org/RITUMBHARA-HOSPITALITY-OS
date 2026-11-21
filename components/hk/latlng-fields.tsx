"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

// Latitude and longitude inputs with a "use my current location" helper,
// so the admin can stand at the property and capture the pin.
export function LatLngFields() {
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [note, setNote] = useState("")

  function locate() {
    setNote("Getting location...")
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude.toFixed(6))
        setLng(p.coords.longitude.toFixed(6))
        setNote(`Accuracy about ${Math.round(p.coords.accuracy)} m`)
      },
      () => setNote("Could not get location. Type it in or allow location access."),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="latitude">Latitude</Label>
          <Input id="latitude" name="latitude" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="longitude">Longitude</Label>
          <Input id="longitude" name="longitude" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" required />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={locate}>
          Use my current location
        </Button>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
    </div>
  )
}
