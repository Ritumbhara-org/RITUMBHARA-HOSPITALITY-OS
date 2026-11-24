"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { GUEST_MESSAGE_ID_PATTERN, type MarkGuestMessageSentResult } from "@/lib/guest-messages/types"
import { getGuestMessageStatusConfig, markGuestMessageSent } from "@/lib/guest-messages/service"
import { getAdminSession } from "@/lib/auth/guard"

const MarkSentInput = z.object({ messageId: z.string().regex(GUEST_MESSAGE_ID_PATTERN) })

// Records that a team member has sent a READY Week 7 guest message BY HAND on WhatsApp. This sends nothing: it asks the
// website's Apps Script (the owner of the Guest Messages queue) to set that one message to SENT.
export async function markGuestMessageSentAction(input: unknown): Promise<MarkGuestMessageSentResult> {
  // Admin only. Checked before anything else, so an unauthenticated call never reaches the Apps Script.
  if (!(await getAdminSession())) {
    return { success: false, code: "unauthorized", error: "Your session has ended. Please sign in again." }
  }
  const parsed = MarkSentInput.safeParse(input)
  if (!parsed.success) return { success: false, code: "invalid_input", error: "That message ID is not valid." }

  const cfg = getGuestMessageStatusConfig()
  if (!cfg.ok) {
    return { success: false, code: "not_configured", error: "Marking messages as sent from the OS is not connected yet (" + cfg.missing.join(", ") + "). Set Status to SENT in the Sheet instead." }
  }

  const result = await markGuestMessageSent(cfg.config, parsed.data.messageId)
  if ((result.success && !result.unchanged) || (!result.success && (result.code === "conflict" || result.code === "not_found"))) {
    revalidatePath("/leads")
  }
  if (!result.success && result.code === "save_failed") console.error("[guest-messages] mark sent failed")
  return result
}
