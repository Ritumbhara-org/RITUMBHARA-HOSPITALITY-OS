import { prisma } from "@/lib/prisma"
import { json, readJson, requireMember, sameOrigin } from "@/lib/loyalty/member-api"
import { audit } from "@/lib/loyalty/members"
import { parseDateOnly } from "@/lib/loyalty/rules"

// Members may add their name, birthday and anniversary once; changes after that go through Ritumbhara staff, so
// a date can't be moved around to collect extra bonuses.
export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403)
  const m = await requireMember()
  if (!m) return json({ error: "Please sign in again." }, 401)
  const body = await readJson(request)
  const data: { name?: string; birthday?: Date; anniversary?: Date } = {}
  if (typeof body.name === "string" && body.name.trim()) {
    if (m.name) return json({ error: "Please ask Ritumbhara staff to change your name." }, 400)
    const name = body.name.replace(/\s+/g, " ").trim()
    if (name.length < 2 || name.length > 80) return json({ error: "Please enter your full name." }, 400)
    data.name = name
  }
  for (const k of ["birthday", "anniversary"] as const) {
    if (body[k] === undefined || body[k] === "") continue
    if (m[k]) return json({ error: `Your ${k} is already saved. Please ask Ritumbhara staff to change it.` }, 400)
    const d = parseDateOnly(body[k])
    if (!d) return json({ error: `Please enter a valid ${k}.` }, 400)
    data[k] = d
  }
  if (!Object.keys(data).length) return json({ error: "Nothing to save." }, 400)
  await prisma.membership.update({ where: { id: m.id }, data })
  await audit(prisma, "MEMBER:" + m.id, "PROFILE_UPDATED_BY_MEMBER", m.id, { fields: Object.keys(data) })
  return json({ success: true })
}
