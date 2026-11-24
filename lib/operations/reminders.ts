/**
 * Periodic reminders to staff for pending tasks and tickets have been disabled.
 * Staff members receive the initial notification when a task or ticket is assigned,
 * but no repeated reminders are sent.
 */
export async function processTeamReminders() {
  return { success: true, remindedTasks: 0, remindedTickets: 0 };
}
