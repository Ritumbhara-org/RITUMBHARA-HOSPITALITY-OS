"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { LEAD_ID_PATTERN, LEAD_STATUSES, type UpdateLeadStatusResult } from "@/lib/leads/types"
import { getLeadsConfig, LeadUpdateError, sheetsApiFromConfig, updateLeadStatus } from "@/lib/leads/service"
import { SheetsRequestError } from "@/lib/leads/google-sheets"
import { getAdminSession } from "@/lib/auth/guard"

const UpdateInput = z.object({
  kind: z.enum(["qualified", "handoff"]),
  id: z.string().regex(LEAD_ID_PATTERN),
  status: z.enum(LEAD_STATUSES),
  expectedStatus: z.string().max(200).optional(),
})

// Changes one lead's status in the leads Google Sheet (the source of truth) and refreshes the Leads page.
export async function updateLeadStatusAction(input: unknown): Promise<UpdateLeadStatusResult> {
  // Admin only. Checked before anything else, so an unauthenticated call never reaches the Sheet.
  if (!(await getAdminSession())) {
    return { success: false, code: "unauthorized", error: "Your session has ended. Please sign in again." }
  }
  const parsed = UpdateInput.safeParse(input)
  if (!parsed.success) return { success: false, code: "invalid_input", error: "That status change is not valid." }

  const cfg = getLeadsConfig()
  if (!cfg.ok) {
    return { success: false, code: "not_configured", error: "Leads are not connected to the Google Sheet yet (" + cfg.missing.join(", ") + ")." }
  }

  try {
    const result = await updateLeadStatus(sheetsApiFromConfig(cfg.config), parsed.data)
    if (!result.unchanged) revalidatePath("/leads")
    return result
  } catch (err) {
    if (err instanceof LeadUpdateError) {
      if (err.code === "conflict") revalidatePath("/leads")
      return { success: false, code: err.code, error: err.message, currentStatus: err.currentStatus }
    }
    const status = err instanceof SheetsRequestError ? err.status : undefined
    console.error("[leads] status update failed", { status })
    const error = err instanceof SheetsRequestError && err.auth
      ? err.message
      : status === 403 || status === 404
      ? "The OS is not allowed to edit the leads Sheet. Check that it is shared with the service account as an Editor."
      : "The status could not be confirmed as saved in the Google Sheet. Refresh the page to check it, then try again if needed."
    return { success: false, code: "save_failed", error }
  }
}
