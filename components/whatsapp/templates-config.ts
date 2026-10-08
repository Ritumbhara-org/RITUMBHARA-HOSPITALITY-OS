export type TemplatePart = { type: 'text'; content: string } | { type: 'var'; key: string; label: string };

export interface TwilioTemplate {
  id: string;
  label: string;
  audience: 'GUEST' | 'STAFF';
  parts: TemplatePart[];
}

export const TWILIO_TEMPLATES: TwilioTemplate[] = [
  {
    id: 'booking_confirmation',
    label: 'Booking Confirmation (Guest)',
    audience: 'GUEST',
    parts: [
      { type: 'text', content: 'Hi [Guest Name],\n\nThanks for booking [Property Name]! We are thrilled to host you and aim to deliver a seamless 5-star experience.\n\nQuick Details:\nCheck-in: After 1PM  [Check In Date]\nCheck-out: Before 11AM [Check Out Date]\n\nDirections: [Google Maps URL]\nAddress: [Address]\n\nAction Required: To ensure an uninterrupted check-in, please fill out our Guest Form here: https://forms.gle/NnCHqpCz1aj6c9T26\n\nManage Your Stay:\nAccess your directions, Wi-Fi password, AI support, and housekeeping requests at your personalized Guest Portal:\n[Guest Portal URL]\n\nIf you have any questions or need recommendations, just send us a message. We\'re here to help!\n\nBest, Ritumbhara Hospitality' }
    ]
  },
  {
    id: 'pre_arrival_instructions',
    label: 'Pre-Arrival / Reminder (Guest)',
    audience: 'GUEST',
    parts: [
      { type: 'text', content: 'Hi [Guest Name],\n\nYour stay at [Property Name] is coming up! Check-in: anytime after 1PM on [Check In Date].\n\nLocation:\nAddress: [Address]\nMap: [Google Maps URL]\n\nWifi:\nNetwork: [Wifi Network]\nPassword: [Wifi Password]\n\nAction Required: Please share photos of IDs for all guests in this chat. This is required by local regulations to complete your registration.\n\nManage Your Stay:\nAccess your personalized Guest Portal here: [Guest Portal URL]\n\nGood to know:\nHousekeeping: Complimentary, available in designated time slot on request.\n\nFriendly House Rules:\n- Quiet Hours: 10PM - 8AM\n- Smoking: Strictly NO smoking indoors\n- Energy: Please turn off AC/lights when leaving\n- Visitors: Only registered guests allowed overnight\n- Delivery: For safety, delivery persons are not allowed inside. Please self-pick up orders from the Gate.\n\nSupport: If you need anything, message us or use the call button!\n\nBest, Ritumbhara Hospitality' }
    ]
  },
  {
    id: 'checkout_instructions',
    label: 'Checkout Instructions (Guest)',
    audience: 'GUEST',
    parts: [
      { type: 'text', content: 'Hi [Guest Name],\n\nWe hope you enjoyed your stay with us! Just a friendly reminder that checkout is today at 11:00 AM.\n\nTo help our cleaning team prepare for the next guest, we would truly appreciate it if you could follow these quick steps before heading out:\n\nLights & AC: Please turn off all lights and the air conditioning.\nTrash: Place any bagged trash in the bin\nDishes: Please leave any used dishes in the sink\nFinal Check: Double-check for any chargers or personal items!\n\nPlease send us a quick message once you have officially checked out so we can give our housekeeping team a head start.\n\nSafe travels, and we hope to see you again soon!\n\nBest,\nRitumbhara Hospitality' }
    ]
  },
  {
    id: 'post_stay_thank_you',
    label: 'Post Stay Thank You (Guest)',
    audience: 'GUEST',
    parts: [
      { type: 'text', content: 'Thank you for staying with us, [Guest Name]! We hope you had a wonderful time. Please let us know how we did. Have a safe journey home!' }
    ]
  }
];
