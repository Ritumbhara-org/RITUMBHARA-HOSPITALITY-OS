"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function joinMembership(guestId: string, referralCode?: string) {
  try {
    // Check if already a member
    const existing = await prisma.membership.findUnique({ where: { guestId } });
    if (existing) {
      return { success: false, error: "Already a member." };
    }

    let referredByCode = null;
    let referrerMembership = null;

    // Validate referral code if provided
    if (referralCode && referralCode.trim() !== "") {
      referrerMembership = await prisma.membership.findUnique({
        where: { referralCode: referralCode.trim() }
      });

      if (!referrerMembership) {
        return { success: false, error: "Invalid referral code." };
      }
      if (referrerMembership.guestId === guestId) {
        return { success: false, error: "You cannot refer yourself." };
      }
      referredByCode = referrerMembership.referralCode;
    }

    // Determine initial points: 100 base + 10 if referred
    const joinBonus = 100;
    const refereeBonus = referredByCode ? 10 : 0;
    const totalStartingPoints = joinBonus + refereeBonus;

    // Create the membership
    const membership = await prisma.membership.create({
      data: {
        guestId,
        points: totalStartingPoints,
        referredBy: referredByCode,
        transactions: {
          create: [
            {
              amount: joinBonus,
              type: "JOIN_BONUS",
              description: "Welcome to Ritumbhara Rewards!"
            },
            ...(refereeBonus > 0 ? [{
              amount: refereeBonus,
              type: "REFERRAL_BONUS",
              description: "Bonus for using a referral code!"
            }] : [])
          ]
        }
      }
    });

    // If referred, give referrer 20 points
    if (referrerMembership) {
      await prisma.membership.update({
        where: { id: referrerMembership.id },
        data: {
          points: { increment: 20 },
          transactions: {
            create: {
              amount: 20,
              type: "REFERRAL_BONUS",
              description: `Referral bonus for inviting a new member!`
            }
          }
        }
      });
    }

    revalidatePath(`/stay`);
    return { success: true, membership };
  } catch (error: any) {
    console.error("[Join Membership Error]", error);
    return { success: false, error: error.message || "Failed to join membership." };
  }
}

export async function redeemPoints(reservationId: string, pointsToRedeem: number) {
  try {
    if (pointsToRedeem <= 0) {
      return { success: false, error: "Points must be greater than zero." };
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { guest: { include: { membership: true } }, unit: { include: { property: true } } }
    });

    if (!reservation) {
      return { success: false, error: "Reservation not found." };
    }

    if (reservation.source === "OTA" || reservation.source === "INTELLISTAY") {
      // NOTE: Intellistay defaults to Walk-In or OTA now based on sync logic.
      // If the source explicitly string-matches 'OTA', block it.
      if (reservation.source.toUpperCase().includes("OTA")) {
         return { success: false, error: "Points can only be redeemed for Walk-In bookings." };
      }
    }

    const membership = reservation.guest.membership;
    if (!membership) {
      return { success: false, error: "Not a member." };
    }

    if (membership.points < pointsToRedeem) {
      return { success: false, error: "Insufficient points balance." };
    }

    // Max redeem logic: 10% of totalAmount. (2 Points = 1 Rupee)
    const maxRupees = reservation.totalAmount * 0.10;
    const maxPoints = maxRupees * 2;

    if (pointsToRedeem > maxPoints) {
      return { success: false, error: `You can only redeem up to ${Math.floor(maxPoints)} points (10% of booking amount).` };
    }

    const rupeeDiscount = pointsToRedeem / 2;

    // Deduct points
    await prisma.membership.update({
      where: { id: membership.id },
      data: {
        points: { decrement: pointsToRedeem },
        transactions: {
          create: {
            amount: -pointsToRedeem,
            type: "REDEMPTION",
            description: `Redeemed ₹${rupeeDiscount} for Booking #${reservation.id.slice(-6).toUpperCase()}`
          }
        }
      }
    });

    // Notify Front Desk via WhatsApp (simulated using event bus or direct twilio API)
    // We will emit an event or create a ticket for Front Desk so they deduct it.
    // For now, we will create a High priority ticket for the front desk.
    
    await prisma.ticket.create({
      data: {
        propertyId: reservation.propertyId,
        unitId: reservation.unitId,
        guestId: reservation.guestId,
        reporterId: reservation.guestId,
        reporterType: "GUEST",
        category: "GUEST_REQUEST",
        subcategory: "POINTS_REDEMPTION",
        description: `URGENT: Guest ${reservation.guest.name} has redeemed ${pointsToRedeem} points (₹${rupeeDiscount} value).\nPlease deduct ₹${rupeeDiscount} from their total walk-in booking amount.`,
        priority: "HIGH",
        status: "OPEN",
        slaDeadline: new Date(Date.now() + 1000 * 60 * 60) // 1 hour
      }
    });

    // Notify Front Desk via WhatsApp
    const { eventBus } = await import('@/lib/events/bus');
    await eventBus.emit('POINTS_REDEEMED', {
      guestId: reservation.guestId,
      propertyId: reservation.propertyId,
      reservationId: reservation.id,
      pointsRedeemed: pointsToRedeem,
      rupeeDiscount: rupeeDiscount
    });

    revalidatePath(`/stay`);
    return { success: true, discount: rupeeDiscount };
  } catch (error: any) {
    console.error("[Redeem Points Error]", error);
    return { success: false, error: error.message || "Failed to redeem points." };
  }
}
