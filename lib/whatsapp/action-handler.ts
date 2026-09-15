import { prisma } from "@/lib/prisma";

export async function handleWhatsAppAction(senderPhone: string, messageText: string): Promise<string> {
  try {
    // 1. Identify the Team Member by their WhatsApp number
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        whatsappNumber: senderPhone,
        isActive: true,
      },
    });

    if (!teamMember) {
      return "You are not registered as an active team member in Ritumbhara OS.";
    }

    // 2. Find their most recent pending or in-progress Housekeeping Task
    const activeTask = await prisma.housekeepingTask.findFirst({
      where: {
        OR: [
          { status: "PENDING" },
          { status: "IN_PROGRESS", assignedToId: teamMember.id }
        ]
      },
      orderBy: { createdAt: 'asc' },
      include: { unit: true }
    });

    if (!activeTask) {
      return `Hello ${teamMember.name}! You currently have no active tasks. Enjoy your break!`;
    }

    // 3. Process the action based on keywords
    if (messageText.includes("ACCEPT")) {
      if (activeTask.status !== "PENDING") {
        return `Task for Room ${activeTask.unit.number} is already accepted. Send START when you begin cleaning.`;
      }
      
      await prisma.housekeepingTask.update({
        where: { id: activeTask.id },
        data: {
          status: "IN_PROGRESS",
          assignedToId: teamMember.id
        }
      });
      
      return `✅ Task Accepted! You are now assigned to clean Room ${activeTask.unit.number}. Send COMPLETE when finished.`;
    } 
    
    if (messageText.includes("COMPLETE")) {
      if (activeTask.status === "PENDING") {
        return `Please ACCEPT the task for Room ${activeTask.unit.number} first before completing it.`;
      }

      // Mark task as completed
      await prisma.housekeepingTask.update({
        where: { id: activeTask.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date()
        }
      });

      // Automatically update the physical room status to READY
      await prisma.unit.update({
        where: { id: activeTask.unitId },
        data: { status: "READY" }
      });

      return `🌟 Amazing work, ${teamMember.name}! Room ${activeTask.unit.number} is now marked as READY in the system.`;
    }

    // Default Fallback
    return `Hello ${teamMember.name}! You have a pending task for Room ${activeTask.unit.number}.\nReply ACCEPT to assign it to yourself.\nReply COMPLETE when finished.`;

  } catch (error) {
    console.error("[Action Handler Error]", error);
    return "An error occurred while processing your request. Please contact the front desk.";
  }
}
