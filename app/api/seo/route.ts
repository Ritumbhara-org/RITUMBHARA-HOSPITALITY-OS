import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const SeoInputSchema = z.object({
  propertyName: z.string().min(1, "Property name is required"),
  location: z.string().min(1, "Location is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().default(""),
  country: z.string().default("India"),
  amenities: z.array(z.string()).min(1, "At least one amenity is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  propertyType: z.enum(["hotel", "resort", "villa", "boutique hotel", "serviced apartment", "guesthouse"]).default("hotel"),
  starRating: z.number().int().min(1).max(5).optional(),
  priceRange: z.string().optional(), // e.g. "₹2000 - ₹8000"
})

// Generates SEO metadata without an external AI API — rule-based, production-quality
function generateSEOPackage(input: z.infer<typeof SeoInputSchema>) {
  const {
    propertyName,
    location,
    city,
    state,
    country,
    amenities,
    description,
    propertyType,
    starRating,
    priceRange,
  } = input

  const stateStr = state ? `, ${state}` : ""
  const locationFull = `${city}${stateStr}, ${country}`
  const starStr = starRating ? `${starRating}-Star ` : ""
  const amenityStr = amenities.slice(0, 3).join(", ")
  const topAmenity = amenities[0] || "premium amenities"
  const typeCapitalized = propertyType.charAt(0).toUpperCase() + propertyType.slice(1)

  // Meta Title (50–60 chars ideal)
  const metaTitle = `${propertyName} | ${starStr}${typeCapitalized} in ${city} | ${topAmenity}`

  // Meta Description (150–160 chars ideal)
  const metaDescription = `Discover ${propertyName}, a premier ${starStr}${propertyType} in ${location}, ${city}. Enjoy ${amenityStr} and more. Book your stay today${priceRange ? ` from ${priceRange}` : ""}.`

  // H1
  const h1 = `${propertyName} — ${starStr}${typeCapitalized} in ${location}, ${city}`

  // H2 Set
  const h2s = [
    `Why Choose ${propertyName}?`,
    `Amenities & Facilities`,
    `Our Location in ${city}`,
    `Rooms & Accommodation`,
    `Frequently Asked Questions`,
    `How to Book`,
  ]

  // Image ALT texts
  const imageAlts = [
    `${propertyName} exterior view in ${city}`,
    `${propertyName} lobby and reception area`,
    `${propertyName} deluxe room interior`,
    `${propertyName} ${amenities[0] || "amenities"} — ${city}`,
    `Aerial view of ${propertyName} in ${location}`,
    `${propertyName} dining experience`,
  ]

  // FAQs
  const faqs = [
    {
      question: `Where is ${propertyName} located?`,
      answer: `${propertyName} is located in ${location}, ${locationFull}. It is conveniently situated near major attractions and transport links.`
    },
    {
      question: `What amenities does ${propertyName} offer?`,
      answer: `${propertyName} offers a range of premium amenities including ${amenities.join(", ")}.`
    },
    {
      question: `What is the check-in and check-out time at ${propertyName}?`,
      answer: `Standard check-in time is 2:00 PM and check-out is 11:00 AM. Early check-in and late check-out may be available on request.`
    },
    {
      question: `Is ${propertyName} pet-friendly?`,
      answer: `Please contact ${propertyName} directly to inquire about pet-friendly accommodation options.`
    },
    {
      question: `How do I book a room at ${propertyName}?`,
      answer: `You can book directly through our website, call us, or reserve via major OTA platforms like Booking.com and MakeMyTrip.`
    },
    {
      question: `Does ${propertyName} offer airport transfers?`,
      answer: `Yes, ${propertyName} offers airport transfer services. Please contact the front desk to arrange pick-up in advance.`
    },
  ]

  // Internal links
  const internalLinks = [
    { anchor: `Rooms at ${propertyName}`, href: "/rooms" },
    { anchor: "Check Availability", href: "/booking" },
    { anchor: "Dining & Restaurant", href: "/dining" },
    { anchor: "Spa & Wellness", href: "/spa" },
    { anchor: "Contact Us", href: "/contact" },
    { anchor: "Gallery", href: "/gallery" },
  ]

  // Location keywords
  const locationKeywords = [
    `${propertyType} in ${city}`,
    `${starStr}${propertyType} ${city}`,
    `best ${propertyType} in ${location}`,
    `${location} ${propertyType}`,
    `${city} accommodation`,
    `luxury stay in ${city}`,
    `${city} ${country} hotel`,
    `${propertyName} ${city}`,
    `${propertyType} near ${location}`,
    `book ${propertyType} ${city}`,
  ]

  // Schema Markup (JSON-LD)
  const schemaMarkup = {
    "@context": "https://schema.org",
    "@type": "Hotel",
    "name": propertyName,
    "description": description,
    "url": "",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": location,
      "addressLocality": city,
      "addressRegion": state,
      "addressCountry": country === "India" ? "IN" : country,
    },
    "starRating": starRating ? {
      "@type": "Rating",
      "ratingValue": starRating
    } : undefined,
    "amenityFeature": amenities.map(a => ({
      "@type": "LocationFeatureSpecification",
      "name": a,
      "value": true
    })),
    "priceRange": priceRange || "Contact for pricing",
    "makesOffer": faqs.map(faq => ({
      "@type": "FAQPage",
      "mainEntity": {
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }
    }))
  }

  return {
    metaTitle,
    metaDescription,
    h1,
    h2s,
    imageAlts,
    faqs,
    internalLinks,
    locationKeywords,
    schemaMarkup,
  }
}

// POST /api/seo — generate SEO package for a property
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = SeoInputSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const seoPackage = generateSEOPackage(parsed.data)

    return NextResponse.json({
      success: true,
      input: parsed.data,
      data: seoPackage,
      meta: {
        generatedAt: new Date().toISOString(),
        charCount: {
          metaTitle: seoPackage.metaTitle.length,
          metaDescription: seoPackage.metaDescription.length,
        }
      }
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

// GET /api/seo — describe the SEO API
export async function GET() {
  return NextResponse.json({
    success: true,
    description: "SEO Automation API for Ritumbhara Hospitality OS",
    usage: "POST /api/seo with property details to generate a complete structured SEO package",
    inputs: {
      propertyName: "string (required)",
      location: "string — street/area name (required)",
      city: "string (required)",
      state: "string (optional)",
      country: "string, default: India",
      amenities: "string[] — list of amenities (required)",
      description: "string — property description (required)",
      propertyType: "hotel | resort | villa | boutique hotel | serviced apartment | guesthouse",
      starRating: "number 1-5 (optional)",
      priceRange: "string e.g. ₹2000 - ₹8000 (optional)",
    },
    outputs: [
      "metaTitle",
      "metaDescription",
      "h1",
      "h2s",
      "imageAlts",
      "faqs",
      "internalLinks",
      "locationKeywords",
      "schemaMarkup (JSON-LD)",
    ]
  })
}
