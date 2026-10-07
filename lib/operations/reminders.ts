import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/client";

export async function processTeamReminders() {
  console.log("[Reminders] Checking for pending/unresolved tickets and tasks...");
  
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

  // 1. Remind Housekeeping Tasks
  // Find tasks that are PENDING (not accepted) or IN_PROGRESS (not completed)
  // and were last updated more than 10 minutes ago
  const tasks = await prisma.housekeepingTask.findMany({
    where: {
      status: { in: ['PENDING', 'IN_PROGRESS'] },
      updatedAt: { lte: tenMinutesAgo },
      assignedToId: { not: null }
    },
    include: { property: true, unit: true, assignedTo: true }
  });

  for (const task of tasks) {
    if (!task.assignedTo?.whatsappNumber) continue;

    console.log(`[Reminders] Reminding ${task.assignedTo.name} about Task ${task.id}`);
    
    // We reuse the exact template to ensure delivery even outside 24h window
    const messageContent = `🔔 *REMINDER*\nProperty: ${task.property.name}\nUnit: ${task.unit.name}\nPriority: HIGH\n\nYou have an unresolved task. Please reply ACCEPT or COMPLETE.`;
    
    await sendWhatsAppMessage(
      task.assignedTo.whatsappNumber,
      'template',
      messageContent,
      'team_new_task',
      'task',
      task.id,
      {
        '1': task.property.name,
        '2': task.unit.name,
        '3': 'HIGH (REMINDER)'
      }
    );

    // Update the updatedAt timestamp so it will wait another 10 minutes before reminding again.
    await prisma.housekeepingTask.update({
      where: { id: task.id },
      data: { updatedAt: new Date() } // touch the record
    });
  }

  // 2. Remind General Tickets
  const tickets = await prisma.ticket.findMany({
    where: {
      status: { in: ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS'] },
      updatedAt: { lte: tenMinutesAgo },
      assignedToId: { not: null }
    },
    include: { property: true, unit: true, assignedTo: true }
  });

  for (const ticket of tickets) {
    if (!ticket.assignedTo?.whatsappNumber) continue;

    console.log(`[Reminders] Reminding ${ticket.assignedTo.name} about Ticket ${ticket.id}`);

    const messageContent = `🔔 *REMINDER*\nLocation: ${ticket.unit?.name || ticket.property.name}\nIssue: ${ticket.description}\nPriority: ${ticket.priority}\n\nYou have an unresolved ticket. Please reply.`;
    
    await sendWhatsAppMessage(
      ticket.assignedTo.whatsappNumber,
      'template',
      messageContent,
      'ticket_assigned',
      'Ticket',
      ticket.id,
      {
        '1': ticket.unit?.name || ticket.property.name,
        '2': "REMINDER: " + ticket.description,
        '3': ticket.priority
      }
    );

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() } // touch the record
    });
  }

  return { success: true, remindedTasks: tasks.length, remindedTickets: tickets.length };
}
