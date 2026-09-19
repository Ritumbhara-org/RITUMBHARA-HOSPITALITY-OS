import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assignTicketRoundRobin } from '@/lib/operations/round-robin';

// Note: To prevent cron-job.org from disabling this endpoint on error,
// we will return 200 OK on failures with a JSON payload explaining the error,
// as done in other cron jobs.
export async function GET(req: Request) {
  try {
    // 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Find all tickets that are ASSIGNED and haven't been updated (accepted) in 10 minutes
    const overdueTickets = await prisma.ticket.findMany({
      where: {
        status: 'ASSIGNED',
        updatedAt: {
          lt: tenMinutesAgo
        },
        assignedToId: {
          not: null
        }
      }
    });

    if (overdueTickets.length === 0) {
      return NextResponse.json({ status: "success", escalatedCount: 0 });
    }

    let escalatedCount = 0;
    const errors = [];

    for (const ticket of overdueTickets) {
      if (ticket.assignedToId) {
        const result = await assignTicketRoundRobin(ticket.id, ticket.assignedToId);
        if (result.success) {
          escalatedCount++;
        } else {
          errors.push(`Ticket ${ticket.id}: ${result.error}`);
        }
      }
    }

    return NextResponse.json({ 
      status: "success", 
      escalatedCount,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('[Ticket Escalation Cron Error]', error);
    // Return 200 OK to keep cron active, but indicate error in payload
    return NextResponse.json({ status: "skipped", reason: error.message }, { status: 200 });
  }
}
