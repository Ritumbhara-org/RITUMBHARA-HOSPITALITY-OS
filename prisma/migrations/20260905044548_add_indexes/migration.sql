-- CreateIndex
CREATE INDEX "Guest_phone_idx" ON "Guest"("phone");

-- CreateIndex
CREATE INDEX "Guest_email_idx" ON "Guest"("email");

-- CreateIndex
CREATE INDEX "HousekeepingTask_propertyId_idx" ON "HousekeepingTask"("propertyId");

-- CreateIndex
CREATE INDEX "HousekeepingTask_unitId_idx" ON "HousekeepingTask"("unitId");

-- CreateIndex
CREATE INDEX "HousekeepingTask_status_idx" ON "HousekeepingTask"("status");

-- CreateIndex
CREATE INDEX "InventoryItem_propertyId_idx" ON "InventoryItem"("propertyId");

-- CreateIndex
CREATE INDEX "Reservation_propertyId_idx" ON "Reservation"("propertyId");

-- CreateIndex
CREATE INDEX "Reservation_guestId_idx" ON "Reservation"("guestId");

-- CreateIndex
CREATE INDEX "Reservation_unitId_idx" ON "Reservation"("unitId");

-- CreateIndex
CREATE INDEX "Reservation_status_idx" ON "Reservation"("status");

-- CreateIndex
CREATE INDEX "Reservation_checkIn_idx" ON "Reservation"("checkIn");

-- CreateIndex
CREATE INDEX "Reservation_checkOut_idx" ON "Reservation"("checkOut");

-- CreateIndex
CREATE INDEX "TeamMember_propertyId_idx" ON "TeamMember"("propertyId");

-- CreateIndex
CREATE INDEX "TeamMember_isActive_idx" ON "TeamMember"("isActive");

-- CreateIndex
CREATE INDEX "Ticket_propertyId_idx" ON "Ticket"("propertyId");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- CreateIndex
CREATE INDEX "Ticket_priority_idx" ON "Ticket"("priority");

-- CreateIndex
CREATE INDEX "Ticket_category_idx" ON "Ticket"("category");

-- CreateIndex
CREATE INDEX "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");

-- CreateIndex
CREATE INDEX "TicketAuditLog_ticketId_idx" ON "TicketAuditLog"("ticketId");

-- CreateIndex
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");

-- CreateIndex
CREATE INDEX "Unit_status_idx" ON "Unit"("status");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_from_idx" ON "WhatsAppMessage"("from");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_to_idx" ON "WhatsAppMessage"("to");
