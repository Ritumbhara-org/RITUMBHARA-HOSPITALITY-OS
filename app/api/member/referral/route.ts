import { json, readJson, requireMember, sameOrigin } from "@/lib/loyalty/member-api"
import { LoyaltyError } from "@/lib/loyalty/ledger"
import { applyReferral } from "@/lib/loyalty/members"

// A new member (no completed stay yet) can enter the code of the friend who referred them.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, 403)
  const m = await requireMember()
  if (!m) return json({ error: "Please sign in again." }, 401)
  const body = await readJson(request)
  try {
    await applyReferral(m.id, String(body.code ?? ""), "MEMBER:" + m.id)
    return json({ success: true })
  } catch (e) {
    if (e instanceof LoyaltyError) return json({ error: e.message }, 400)
    throw e
  }
}
