"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/guard";
import * as inbox from "@/lib/inbox/service";
import type { ActionResult, InboxConversationSummary, InboxThread } from "@/lib/inbox/types";

async function currentTeamMemberId(): Promise<string | null> {
  const token = (await cookies()).get("auth-token")?.value;
  if (!token) return null;
  const member = await prisma.teamMember.findUnique({ where: { id: token }, select: { id: true } });
  return member?.id ?? null;
}

function fail(err: unknown): { success: false; error: string } {
  console.error("[Inbox action]", err);
  return { success: false, error: err instanceof Error ? err.message : "Something went wrong" };
}

export async function getInboxConversations(propertyId: string): Promise<InboxConversationSummary[]> {
  await requireAdmin();
  return inbox.listConversations(propertyId);
}

export async function getInboxThread(key: string): Promise<InboxThread | null> {
  await requireAdmin();
  return inbox.getThread(key);
}

export async function sendInboxReply(key: string, body: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const result = await inbox.sendReply(key, body, await currentTeamMemberId());
    if (result.success) revalidatePath("/inbox");
    return result;
  } catch (err) {
    return fail(err);
  }
}

export async function assignInboxConversation(key: string, teamMemberId: string | null): Promise<ActionResult> {
  await requireAdmin();
  try {
    return await inbox.assignConversation(key, teamMemberId);
  } catch (err) {
    return fail(err);
  }
}

export async function setInboxConversationStatus(key: string, status: "OPEN" | "CLOSED"): Promise<ActionResult> {
  await requireAdmin();
  try {
    return await inbox.setConversationStatus(key, status);
  } catch (err) {
    return fail(err);
  }
}

export async function markInboxConversationRead(key: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    return await inbox.markConversationRead(key);
  } catch (err) {
    return fail(err);
  }
}

export async function linkInboxReservation(key: string, reservationId: string | null): Promise<ActionResult> {
  await requireAdmin();
  try {
    return await inbox.linkReservation(key, reservationId);
  } catch (err) {
    return fail(err);
  }
}

export async function searchInboxReservations(query: string) {
  await requireAdmin();
  return inbox.searchReservations(query);
}

export async function draftInboxReply(key: string): Promise<ActionResult<{ draft: string }>> {
  await requireAdmin();
  try {
    return await inbox.draftReply(key);
  } catch (err) {
    return fail(err);
  }
}
