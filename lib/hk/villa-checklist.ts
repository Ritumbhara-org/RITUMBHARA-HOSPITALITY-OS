// Airbnb-style turnover checklist for villas. One area per zone. Each area's
// "instructions" is the tick list the housekeeper follows; the photo count and
// video flag are the proof the app collects before the turnover can be submitted.

export type VillaArea = {
  title: string
  instructions: string
  minPhotos: number
  requiresVideo: boolean
}

export const VILLA_TEMPLATE_TITLE = "Villa turnover"
export const VILLA_UNIT_TYPE = "Villa"

const lines = (...items: string[]) => items.map((i) => `• ${i}`).join("\n")

export const VILLA_AREAS: VillaArea[] = [
  {
    title: "Genset and diesel",
    instructions: lines(
      "Photo 1: diesel gauge or dipstick, clearly readable. Refill if below 1/4.",
      "Photo 2: spare diesel cans in the store (count them).",
      "Photo 3: genset panel while running.",
      "Check engine oil, coolant, battery terminals, no leaks.",
      "Start, run 5 minutes, check auto changeover, switch off."
    ),
    minPhotos: 3,
    requiresVideo: false,
  },
  {
    title: "Meters, water and power",
    instructions: lines(
      "Photo 1: electricity meter display.",
      "Photo 2: water tank level indicator (overhead and underground).",
      "Photo 3: gas cylinder and regulator.",
      "Inverter or UPS: battery OK, no alarm.",
      "Wi-Fi router lights on, run a speed test.",
      "CCTV and DVR: all cameras live and recording.",
      "Geysers and AC units work; no leaks."
    ),
    minPhotos: 3,
    requiresVideo: false,
  },
  {
    title: "Bedrooms (every bedroom)",
    instructions: lines(
      "Open curtains and windows. Check for guest items and log them.",
      "Strip all bedding. Check mattress and pillows for stains or damage.",
      "Make bed with fresh sheets, duvet cover and pillow covers; no creases.",
      "Extra blanket and pillows in the wardrobe.",
      "Dust headboard, bedside tables, lamps, shelves, frames, window sills.",
      "Wipe switches, handles and remotes. Clean mirrors and glass.",
      "Wardrobe wiped, 6 hangers, safe works.",
      "Check under the bed and behind furniture.",
      "Empty bins, fit new liner.",
      "AC and fan tested, set to 24 C. Lights and charging points work.",
      "Vacuum, then mop.",
      "Photos: full room from the door, one per bedroom."
    ),
    minPhotos: 3,
    requiresVideo: true,
  },
  {
    title: "Bathrooms (every bathroom)",
    instructions: lines(
      "Wear gloves. Use separate cloths for the toilet and other surfaces.",
      "Remove used towels and mats. Empty bin, fit new liner.",
      "Toilet: scrub bowl, under the rim, seat, lid, base. Flush. Disinfect handle.",
      "Shower: scrub walls, floor and glass. Clear the drain of hair.",
      "Basin and counter: scrub, wipe taps, drain flows.",
      "Mirror and glass: no streaks.",
      "Check for leaks under the basin, taps and geyser.",
      "Wipe switches, handle, towel rods, exhaust fan cover.",
      "Restock per guest: 2 bath towels, 2 hand towels, 1 bath mat. Toilet paper (2 spare rolls), soap, shampoo, body wash.",
      "Hot water runs within a minute.",
      "Squeegee and mop; no standing water; no odour.",
      "Photos: toilet, shower and basin, one set per bathroom."
    ),
    minPhotos: 3,
    requiresVideo: true,
  },
  {
    title: "Living, dining and entrance",
    instructions: lines(
      "Clear trash, bottles, glasses and guest items.",
      "Dust surfaces, decor, TV unit, ceiling fans.",
      "Vacuum sofas and check under cushions. Spot-clean stains.",
      "Wipe dining table and chairs.",
      "Clean TV screen and remotes. TV, music system and streaming login work.",
      "Clean glass doors, windows and tracks.",
      "Wipe switches, handles, railings. Sweep and mop stairs and landing.",
      "Entrance and shoe rack tidy.",
      "Main door lock or key box works; keys in place.",
      "Vacuum floors and rugs, then mop. Lights, AC and fans set."
    ),
    minPhotos: 2,
    requiresVideo: true,
  },
  {
    title: "Kitchen",
    instructions: lines(
      "Remove guest food. Bin anything open or expired.",
      "Fridge: empty, wipe shelves and seals, no smell. Photo of inside.",
      "Freezer checked, no ice build-up.",
      "Hob: degrease burners and drip areas; gas works.",
      "Oven and microwave clean inside and out.",
      "Chimney wiped, filter checked.",
      "Sink scrubbed, taps polished, strainer clear, drain flows.",
      "All dishes washed, dried and stored.",
      "Inventory check: plates, bowls, glasses, cups, cutlery, pots, pans, knives, chopping board, kettle, toaster.",
      "Wipe counters, backsplash, appliances, handles.",
      "Restock: dish soap, sponge, cloth, hand soap, garbage bags, paper towels, salt, sugar, tea, coffee, oil.",
      "Empty bins, new liner. Sweep and mop.",
      "Photos: fridge inside, counters and sink, stove."
    ),
    minPhotos: 3,
    requiresVideo: true,
  },
  {
    title: "Garden and outdoor",
    instructions: lines(
      "Walk the full perimeter first. Note damage, fallen branches, pests.",
      "Pick up litter, bottles, cigarette butts and guest items.",
      "Sweep paths, patio and steps. Wash if dirty.",
      "Lawn: mow and trim if overgrown. Clear clippings.",
      "Water plants, prune dead leaves, remove weeds.",
      "Clear leaves from drains and the pool deck.",
      "Wipe outdoor tables, chairs, loungers and cushions; set neatly.",
      "BBQ and fire pit: scrape, clear ash, check gas or charcoal.",
      "Outdoor lights and gate light work.",
      "Hose and taps: no leaks.",
      "Gate and boundary locked and secure.",
      "Tip out stagnant water (mosquito spots). Empty and rinse outdoor bins.",
      "Parking area swept.",
      "Photos: garden from the entrance, seating area, BBQ."
    ),
    minPhotos: 3,
    requiresVideo: true,
  },
  {
    title: "Pool",
    instructions: lines(
      "Check for damage, cracks, loose tiles or objects in the pool.",
      "Skim the surface. Empty skimmer and pump baskets.",
      "Brush walls, steps and waterline. Vacuum the floor.",
      "Test water: chlorine 1 to 3 ppm, pH 7.2 to 7.6. Photo of the result.",
      "Add chemicals only if needed. Never mix chemicals. Wait before guest use.",
      "Water level at mid-skimmer. Photo of the level.",
      "Pump and filter running; pressure gauge normal. Photo of the gauge.",
      "Water clear; bottom drain visible.",
      "Sweep and wash the deck; remove slippery algae.",
      "Loungers and umbrellas wiped and arranged. Pool towels fresh, one set per guest.",
      "Pool lights work.",
      "Safety: gate latches, lifebuoy and rope in place, rules sign visible. Photo of safety gear.",
      "Outdoor shower and pool-side toilet cleaned. Chemical store locked."
    ),
    minPhotos: 5,
    requiresVideo: true,
  },
  {
    title: "Final walkthrough",
    instructions: lines(
      "Walk the villa as a guest would. Every room smells fresh.",
      "All lights, fans and AC tested; unused lights off.",
      "Welcome items placed: Wi-Fi card, house rules, emergency numbers, caretaker contact.",
      "Damage, missing items and maintenance issues logged with photos.",
      "Linen count matches the list; soiled linen sent for wash.",
      "Consumables restocked; low stock list sent.",
      "All windows and doors locked; keys or lock code set.",
      "Genset diesel above 1/4."
    ),
    minPhotos: 1,
    requiresVideo: false,
  },
]
