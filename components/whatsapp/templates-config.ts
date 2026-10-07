export type TemplatePart = { type: 'text'; content: string } | { type: 'var'; key: string; label: string };

export interface TwilioTemplate {
  id: string;
  label: string;
  audience: 'GUEST' | 'STAFF';
  parts: TemplatePart[];
}

export const TWILIO_TEMPLATES: TwilioTemplate[] = [
  {
    id: 'post_stay_thank_you',
    label: 'Checkout Instructions (Guest)',
    audience: 'GUEST',
    parts: [
      { type: 'text', content: 'Hi ' },
      { type: 'var', key: '1', label: 'Guest Name' },
      { type: 'text', content: '\n\nWe hope you enjoyed your stay with us! Just a friendly reminder that checkout is today at 11:00 AM.\n\nTo help our cleaning team prepare for the next guest, we would truly appreciate it if you could follow these quick steps before heading out:\n\nLights & AC: Please turn off all lights and the air conditioning.\nTrash: Place any bagged trash in the bin\nDishes: Please leave any used dishes in the sink\nFinal Check: Double-check for any chargers or personal items!\n\nPlease send us a quick message once you have officially checked out so we can give our housekeeping team a head start.' }
    ]
  },
  {
    id: 'ticket_resolved_custom',
    label: 'Ticket Resolved (Guest)',
    audience: 'GUEST',
    parts: [
      { type: 'text', content: 'Hi ' },
      { type: 'var', key: '1', label: 'Guest Name' },
      { type: 'text', content: ', regarding your request "' },
      { type: 'var', key: '2', label: 'Request' },
      { type: 'text', content: '", our team says:\n\n"' },
      { type: 'var', key: '3', label: 'Resolution Note' },
      { type: 'text', content: '"\n\nPlease let us know if you need anything else!' }
    ]
  },
  {
    id: 'ticket_assigned',
    label: 'Ticket Assigned (Staff)',
    audience: 'STAFF',
    parts: [
      { type: 'text', content: 'NEW TICKET\nLocation: ' },
      { type: 'var', key: '1', label: 'Location/Unit' },
      { type: 'text', content: '\nIssue: ' },
      { type: 'var', key: '2', label: 'Issue Description' },
      { type: 'text', content: '\nPriority: ' },
      { type: 'var', key: '3', label: 'Priority' },
      { type: 'text', content: '\n\nReply ACCEPT to acknowledge.' }
    ]
  },
  {
    id: 'sla_breach_alert',
    label: 'SLA Breach Alert (Staff)',
    audience: 'STAFF',
    parts: [
      { type: 'text', content: 'SLA BREACH ALERT\nTicket: ' },
      { type: 'var', key: '1', label: 'Ticket Description' },
      { type: 'text', content: '\nPriority: ' },
      { type: 'var', key: '2', label: 'Priority' },
      { type: 'text', content: '\nLocation: ' },
      { type: 'var', key: '3', label: 'Location' },
      { type: 'text', content: '\nAssigned To: ' },
      { type: 'var', key: '4', label: 'Assignee Name' },
      { type: 'text', content: '\n\nImmediate management intervention required.' }
    ]
  }
];
