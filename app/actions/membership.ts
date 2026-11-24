"use server";

// Guest portal (/stay/<reservationId>) membership action. Public by design: it can only enrol the guest of that one
// reservation (by their booking mobile number) and optionally attach a referral code. It never credits or redeems
// points — points come only from completed stays and bonuses, and redemption needs staff plus the member's OTP.

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { LoyaltyError } from "@/lib/loyalty/ledger";
import { applyReferral, ensureMembership } from "@/lib/loyalty/members";

export async function joinMembership(reservationId: string, referralCode?: string) {
  try {
    if (typeof reservationId !== "string" || !/^[a-z0-9]{10,40}$/i.test(reservationId)) return { success: false, error: "Booking not found." };
    const reservation = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { guest: true } });
    if (!reservation) return { success: false, error: "Booking not found." };
    const existed = await prisma.membership.findFirst({ where: { OR: [{ phone: reservation.guest.phone }, { guestId: reservation.guestId }] } });
    const membership = existed ?? (await ensureMembership({ phone: reservation.guest.phone, name: reservation.guest.name, guestId: reservation.guestId }));
    if (!membership) return { success: false, error: "Your booking has no valid mobile number. Please ask the front desk to update it." };
    let warning: string | undefined;
    if (referralCode && referralCode.trim()) {
      try {
        await applyReferral(membership.id, referralCode, "GUEST_PORTAL");
      } catch (e) {
        if (!(e instanceof LoyaltyError)) throw e;
        if (existed) return { success: false, error: e.message };
        warning = e.message; // joined, but the code couldn't be used
      }
    } else if (existed) {
      return { success: false, error: "Already a member." };
    }
    revalidatePath(`/stay/${reservationId}`);
    return { success: true, membershipNumber: membership.membershipNumber, warning };
  } catch (error) {
    console.error("[Join Membership Error]", error);
    return { success: false, error: "Failed to join membership." };
  }
}
