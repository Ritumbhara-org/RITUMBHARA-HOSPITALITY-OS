import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ai } from "@/lib/ai/groq";
import { eventBus } from "@/lib/events/bus";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { messages } = await request.json();
    
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { 
        unit: { include: { property: true } },
        guest: true
      }
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }

    const property = reservation.unit.property;

    const systemPrompt = `You are an AI Guest Assistant for Ritumbhara Hospitality. 
You are speaking with ${reservation.guest.name}, who is staying at ${reservation.unit.name} in ${property.name}.
Check-in: ${new Date(reservation.checkIn).toLocaleString()}
Check-out: ${new Date(reservation.checkOut).toLocaleString()}
Wi-Fi: ${property.wifiNetwork || 'N/A'}, Password: ${property.wifiPassword || 'N/A'}
Address: ${property.address || 'N/A'}
House Rules: Quiet hours 10PM-8AM, No smoking, No outside visitors overnight.

Your job is to answer questions politely and concisely. 
If the guest requests housekeeping (cleaning, new towels, restocking), or reports a maintenance issue (AC broken, plumbing, wifi down), you MUST use the provided tool to create a ticket.
Do NOT just say you will do it—you must actually call the tool.`;

    const groqMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content }))
    ];

    const tools = [
      {
        type: "function",
        function: {
          name: "create_ticket",
          description: "Creates a request or issue ticket for the hospitality team to resolve.",
          parameters: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description: "Category of the ticket: HOUSEKEEPING, MAINTENANCE, or OTHER.",
                enum: ["HOUSEKEEPING", "MAINTENANCE", "OTHER"]
              },
              priority: {
                type: "string",
                description: "Priority: HIGH (urgent issues like AC/water broken), MEDIUM (standard requests like towels), LOW.",
                enum: ["HIGH", "MEDIUM", "LOW"]
              },
              description: {
                type: "string",
                description: "Detailed description of what the guest needs or what the issue is."
              }
            },
            required: ["category", "priority", "description"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "reopen_ticket",
          description: "Reopens the most recently closed or resolved ticket for the guest if they say the issue is not fixed.",
          parameters: {
            type: "object",
            properties: {
              reason: {
                type: "string",
                description: "Reason the guest wants to reopen the issue."
              }
            },
            required: ["reason"]
          }
        }
      }
    ];

    const response = await ai.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: groqMessages as any,
      tools: tools as any,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0]?.message;

    // Handle tool calls
    if (responseMessage?.tool_calls) {
      for (const toolCall of responseMessage.tool_calls) {
        if (toolCall.function.name === "create_ticket") {
          const args = JSON.parse(toolCall.function.arguments);
          
          const slaHours = args.priority === "HIGH" ? 2 : args.priority === "MEDIUM" ? 4 : 24;
          const slaDeadline = new Date();
          slaDeadline.setHours(slaDeadline.getHours() + slaHours);

          const ticket = await prisma.ticket.create({
            data: {
              propertyId: reservation.unit.propertyId,
              unitId: reservation.unitId,
              guestId: reservation.guestId,
              reporterId: reservation.guestId,
              reporterType: "GUEST",
              category: args.category,
              description: args.description,
              priority: args.priority,
              slaDeadline,
              status: "OPEN"
            }
          });

          await prisma.ticketAuditLog.create({
            data: {
              ticketId: ticket.id,
              action: "CREATED_BY_AI",
              actorId: reservation.guestId,
              actorType: "GUEST",
              toStatus: "OPEN"
            }
          });

          eventBus.emit('TICKET_CREATED', {
            ticketId: ticket.id,
            propertyId: ticket.propertyId,
            category: ticket.category,
            priority: ticket.priority,
            description: ticket.description
          });

          // Append tool response and get final answer
          groqMessages.push(responseMessage as any);
          groqMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: "Ticket successfully created and team notified."
          });

          const secondResponse = await ai.chat.completions.create({
            model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
            messages: groqMessages as any,
          });

          return NextResponse.json({ 
            reply: secondResponse.choices[0]?.message?.content || "I have notified the team.",
            ticketCreated: true 
          });
        } else if (toolCall.function.name === "reopen_ticket") {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Find the most recent closed/resolved ticket for this guest
          const recentTicket = await prisma.ticket.findFirst({
            where: {
              guestId: reservation.guestId,
              status: { in: ["RESOLVED", "CLOSED"] }
            },
            orderBy: { updatedAt: 'desc' }
          });

          if (recentTicket) {
            await prisma.ticket.update({
              where: { id: recentTicket.id },
              data: {
                status: "REOPENED",
                resolutionNotes: `Reopened by guest: ${args.reason}`
              }
            });

            await prisma.ticketAuditLog.create({
              data: {
                ticketId: recentTicket.id,
                action: "REOPENED_BY_AI",
                actorId: reservation.guestId,
                actorType: "GUEST",
                toStatus: "REOPENED",
                notes: args.reason
              }
            });

            // Re-assign or just notify team via event bus
            eventBus.emit('TICKET_UPDATED', {
              ticketId: recentTicket.id,
              propertyId: recentTicket.propertyId,
              status: "REOPENED"
            });

            groqMessages.push(responseMessage as any);
            groqMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: "Ticket successfully reopened."
            });
          } else {
            groqMessages.push(responseMessage as any);
            groqMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: toolCall.function.name,
              content: "No recently closed or resolved tickets found to reopen."
            });
          }

          const secondResponse = await ai.chat.completions.create({
            model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
            messages: groqMessages as any,
          });

          return NextResponse.json({ 
            reply: secondResponse.choices[0]?.message?.content || "I've updated the request.",
            ticketCreated: false 
          });
        }
      }
    }

    return NextResponse.json({ 
      reply: responseMessage?.content || "I'm sorry, I couldn't process that.",
      ticketCreated: false
    });

  } catch (error: any) {
    console.error("[AI Chat Error]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
