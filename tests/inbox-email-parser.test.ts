import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanBody,
  detectChannel,
  extractGuestName,
  extractReservationCode,
  parseAddress,
  parseAgoda,
  parseAirbnb,
  parseAirbnbDigest,
  parseInboundEmail,
  stripNoise,
  unwrapForward,
} from "../lib/inbox/email-parser";

test("parseAddress handles display names and bare addresses", () => {
  assert.deepEqual(parseAddress('"Rahul Sharma" <Rahul@Example.com>'), { name: "Rahul Sharma", email: "rahul@example.com" });
  assert.deepEqual(parseAddress("guest@example.com"), { name: null, email: "guest@example.com" });
});

test("detectChannel recognises OTA domains", () => {
  assert.equal(detectChannel(["abc123@reply.airbnb.com"]), "AIRBNB");
  assert.equal(detectChannel(["rsharma.123456@guest.booking.com"]), "BOOKING_COM");
  assert.equal(detectChannel(["no-reply@agoda-messaging.com"]), "AGODA");
  assert.equal(detectChannel(["someone@gmail.com"]), "EMAIL");
});

test("extractGuestName reads 'via' display names and common subjects", () => {
  assert.equal(extractGuestName("RE: Reservation at Studio 4", "Priya via Airbnb", "AIRBNB"), "Priya");
  assert.equal(extractGuestName("New message from guest Arjun Mehta", null, "BOOKING_COM"), "Arjun Mehta");
  assert.equal(extractGuestName("Rahul sent you a message", null, "AGODA"), "Rahul");
  assert.equal(extractGuestName("Hello", "Walk-in Guest", "EMAIL"), "Walk-in Guest");
});

test("extractReservationCode finds Airbnb and labelled codes", () => {
  assert.equal(extractReservationCode("Your reservation HMABCD1234 is confirmed", "AIRBNB"), "HMABCD1234");
  assert.equal(extractReservationCode("Booking number: 4521098734", "BOOKING_COM"), "4521098734");
  assert.equal(extractReservationCode("Booking ID #98765432", "AGODA"), "98765432");
  assert.equal(extractReservationCode("No code here", "AGODA"), null);
});

test("cleanBody drops quoted history and footers", () => {
  const text = "Can we check in at 11am?\nThanks\n\nOn Mon, 12 Oct 2026 at 10:00, Ritumbhara wrote:\n> Hi there";
  assert.equal(cleanBody(text), "Can we check in at 11am?\nThanks");
});

test("unwrapForward pulls the original sender out of a manual forward", () => {
  const fwd = "FYI\n\n---------- Forwarded message ---------\nFrom: Priya via Airbnb <express@airbnb.com>\nDate: Mon, 12 Oct 2026\nSubject: RE: Reservation at Studio 4\nTo: host@example.com\n\nIs parking available?";
  const out = unwrapForward(fwd);
  assert.ok(out);
  assert.equal(out!.from, "Priya via Airbnb <express@airbnb.com>");
  assert.equal(out!.inner, "Is parking available?");
});

test("parseInboundEmail: Postmark-shaped Airbnb notification", () => {
  const parsed = parseInboundEmail({
    From: "Priya via Airbnb <express@airbnb.com>",
    FromFull: { Email: "express@airbnb.com", Name: "Priya via Airbnb" },
    To: "inbox@ritumbhara.com",
    ReplyTo: "4abc-relay@reply.airbnb.com",
    Subject: "RE: Reservation at Studio 4 for 20 – 22 Oct",
    TextBody: "Hi! Is early check-in possible?\n\nReservation code HMQX12AB34\n\n-- \nAirbnb, Inc.",
    MessageID: "<msg-1@airbnb.com>",
  });
  assert.equal(parsed.channel, "AIRBNB");
  assert.equal(parsed.guestName, "Priya");
  assert.equal(parsed.reservationCode, "HMQX12AB34");
  assert.equal(parsed.replyTo, "4abc-relay@reply.airbnb.com");
  assert.equal(parsed.threadKey, "res:HMQX12AB34");
  assert.equal(parsed.messageId, "msg-1@airbnb.com");
  assert.match(parsed.body, /early check-in/);
});

test("parseInboundEmail: plain guest email groups by sender", () => {
  const parsed = parseInboundEmail({
    from: "Arjun <arjun@example.com>",
    to: "inbox@ritumbhara.com",
    subject: "Re: Airport pickup",
    text: "Can you arrange a cab?",
  });
  assert.equal(parsed.channel, "EMAIL");
  assert.equal(parsed.replyTo, "arjun@example.com");
  assert.equal(parsed.guestName, "Arjun");
  assert.equal(parsed.threadKey, "mail:arjun@example.com:");
});

// Same layout as a real Airbnb "host initial inquiry" email (name, ids and listing changed).
const AIRBNB_INQUIRY_TEXT = `[image: Airbnb]
<https://www.airbnb.co.in/?c=.pi80.abc&euid=1>

Respond to Ravi’s inquiry

Ravi
<https://www.airbnb.co.in/hosting/thread/1234567890?thread_type=home_booking&c=.pi80.abc>

On Airbnb since 2026

society name ??
Pre-approve / DeclinePre-approve / Decline
<https://www.airbnb.co.in/hosting/thread/1234567890?thread_type=home_booking>
[image: Test Studio|Near Hospital|100MbpsWiFi]
<https://www.airbnb.co.in/rooms/111?c=x>

Test Studio|Near Hospital|100MbpsWiFi

Check-in

Tue, Oct 20

1:00 PM
You have 24 hours to respond

Frequently Asked Questions
[image:
Google Play]`;

test("parseAirbnb reads thread id, guest name and the guest's message", () => {
  const out = parseAirbnb(AIRBNB_INQUIRY_TEXT);
  assert.equal(out.threadId, "1234567890");
  assert.equal(out.guestName, "Ravi");
  assert.equal(out.message, "society name ??");
});

test("parseInboundEmail: Airbnb inquiry sent by the Gmail bridge", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <automated@airbnb.com>",
    to: "studios.jaipur@gmail.com",
    replyTo: "automated@airbnb.com",
    subject: "Inquiry for Test Studio|Near Hospital|100MbpsWiFi for Oct 20 – 22, 2026",
    text: AIRBNB_INQUIRY_TEXT,
    messageId: "<abc@airbnb.com>",
  });
  assert.equal(parsed.channel, "AIRBNB");
  assert.equal(parsed.threadKey, "airbnb:1234567890");
  assert.equal(parsed.guestName, "Ravi");
  assert.equal(parsed.body, "society name ??");
  assert.equal(parsed.replyTo, null, "automated@ addresses can't take replies");
});

test("parseInboundEmail: manually forwarded Airbnb inquiry with a wrapped subject", () => {
  const parsed = parseInboundEmail({
    from: "Studios <studios.jaipur@gmail.com>",
    to: "inbox@ritumbhara.com",
    subject: "Fwd: Inquiry for Test Studio|Near Hospital|100MbpsWiFi for Oct 20 – 22, 2026",
    text:
      "---------- Forwarded message ---------\nFrom: Airbnb <automated@airbnb.com>\nDate: Fri, 16 Oct 2026 at 12:36\n" +
      "Subject: Inquiry for Test Studio|Near Hospital|100MbpsWiFi for\nOct 20 – 22, 2026\nTo: <studios.jaipur@gmail.com>\n\n" +
      AIRBNB_INQUIRY_TEXT,
  });
  assert.equal(parsed.channel, "AIRBNB");
  assert.equal(parsed.subject, "Inquiry for Test Studio|Near Hospital|100MbpsWiFi for Oct 20 – 22, 2026");
  assert.equal(parsed.threadKey, "airbnb:1234567890");
  assert.equal(parsed.guestName, "Ravi");
  assert.equal(parsed.body, "society name ??");
});

// Same layout as a real Agoda guest-message email (name, ids and property changed).
const AGODA_TEXT = `[image: Agoda.com]
<http://tracking.agoda.com/click?cid=1&memberID=2&linkType=logo&messageId=99&conversationId=1,071,348,000,000,000,111&messageType=Message%20&templateName=>

Hi, Test Studios
This traveler has an upcoming booking at your property.

New *inquiry* from Neha Sharma

  Neha Sharma Aug 01, 11:21 AM ICT
  Booking ID: 0

Message : Price for today?
Did you know?
Prompt replies to guests result in fewer cancellations and can improve
review scores.
Replying to this email, will be sent directly to the guest.

REPLY IN YCS APP
<https://go.onelink.me/Vq0Z?af_dp=ycsapp%3A%2F%2Fagoda%2Fdashboard%3FhotelId%3D2%26conversationId%3D1071348000000000111>
------------------------------
Test Studios Aug 1, 2026 - Aug 2, 2026`;

test("parseAgoda reads the conversation id and the guest's message", () => {
  const out = parseAgoda(AGODA_TEXT);
  assert.equal(out.conversationId, "1071348000000000111");
  assert.equal(out.message, "Price for today?");
});

test("parseInboundEmail: Agoda message via the Gmail bridge can be replied to", () => {
  const parsed = parseInboundEmail({
    from: "Neha Sharma <notifications@agoda-messaging.com>",
    to: "studios.jaipur@gmail.com",
    replyTo: "",
    subject: "Reply from Neha Sharma (Aug 1-2, 2026)",
    text: AGODA_TEXT,
    messageId: "<m1@agoda-messaging.com>",
  });
  assert.equal(parsed.channel, "AGODA");
  assert.equal(parsed.threadKey, "agoda:1071348000000000111");
  assert.equal(parsed.guestName, "Neha Sharma");
  assert.equal(parsed.body, "Price for today?");
  assert.equal(parsed.reservationCode, null, "Booking ID 0 is an inquiry, not a booking");
  assert.equal(parsed.replyTo, "notifications@agoda-messaging.com");
});

test("parseInboundEmail: Airbnb notice with no guest text shows its subject", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <automated@airbnb.com>",
    subject: "Reservation confirmed - Ravi Kumar arrives Oct 17",
    text: "[image: Airbnb]\nNew booking confirmed! Ravi arrives Oct 17.\n<https://www.airbnb.co.in/hosting/thread/555?x=1>\nGet the Airbnb app",
  });
  assert.equal(parsed.channel, "AIRBNB");
  assert.equal(parsed.threadKey, "airbnb:555");
  assert.equal(parsed.body, "Reservation confirmed - Ravi Kumar arrives Oct 17");
});

// Same layout as a real Airbnb "new message" digest (Gmail plain text; names and ids changed).
const AIRBNB_DIGEST_TEXT = `%opentrack%
https://www.airbnb.co.in/?c=.pi80.pkTUVT&euid=e73b

PRE-APPROVAL FOR TEST FLAT, OCT 24 – 25

For your protection and safety, always communicate through Airbnb
[https://www.airbnb.co.in/help/article/209?c=.pi80.pkTUVT&euid=e73b].

PAKHI

Booker

Error is there

ASHA

Co-host

Please try it has been approved

PAKHI

Booker

It's still coming.

Automatically translated from original message:

Abhi bhi same aarhaa hai

Reply
[https://www.airbnb.co.in/hosting/thread/2700845867?thread_type=home_booking&inbox_type=host&c=x]

You can also respond by replying directly to this email.

https://www.airbnb.co.in/rooms/1790000997137527092?c=x

TEST FLAT

Get the app.`;

test("parseAirbnbDigest reads guest and co-host messages", () => {
  const out = parseAirbnbDigest(stripNoise(AIRBNB_DIGEST_TEXT));
  assert.ok(out);
  assert.equal(out!.guestName, "Pakhi");
  assert.equal(
    out!.message,
    "Pakhi: Error is there\nAsha (co-host): Please try it has been approved\nPakhi: It's still coming.\nAutomatically translated from original message:\nAbhi bhi same aarhaa hai"
  );
});

test("parseInboundEmail: Airbnb digest is grouped by thread and keeps the relay for replies", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <express@airbnb.com>",
    replyTo: "6syl2x1nbae89g7wbf@reply.airbnb.com",
    subject: "RE: Pre-approval for Test Flat, Oct 24 – 25",
    text: AIRBNB_DIGEST_TEXT,
  });
  assert.equal(parsed.channel, "AIRBNB");
  assert.equal(parsed.threadKey, "airbnb:2700845867");
  assert.equal(parsed.guestName, "Pakhi");
  assert.equal(parsed.replyTo, "6syl2x1nbae89g7wbf@reply.airbnb.com");
  assert.equal(parsed.ignore, false);
  assert.ok(!parsed.body.includes("http"));
});

test("parseInboundEmail: Airbnb reservation notice takes the guest name from the subject", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <automated@airbnb.com>",
    subject: "Reservation confirmed - Ravi Kumar arrives Oct 17",
    text: "Send Ravi Kumar a MessageSend Ravi Kumar a Message [https://www.airbnb.co.in/hosting/thread/2700876466?thread_type=home_booking]",
  });
  assert.equal(parsed.guestName, "Ravi Kumar");
  assert.equal(parsed.threadKey, "airbnb:2700876466");
  assert.equal(parsed.ignore, false);
});

test("parseInboundEmail: Airbnb booking notice from express@ reads the name without the repeated button text", () => {
  const filler = "Your guest's trip details and house rules are below. ".repeat(10);
  const parsed = parseInboundEmail({
    from: "Airbnb <express@airbnb.com>",
    subject: "Booking confirmed for Studio 1210, Oct 20 – 22",
    text: `${filler}\nSend Madhusudan a MessageSend Madhusudan a Message [https://www.airbnb.co.in/hosting/thread/2701111111?x=1]\n${filler}`,
  });
  assert.equal(parsed.guestName, "Madhusudan");
  assert.equal(parsed.threadKey, "airbnb:2701111111");
  assert.equal(parsed.body, "Booking confirmed for Studio 1210, Oct 20 – 22");
});

test("parseInboundEmail: short Airbnb booking notice shows its subject, not the button text", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <express@airbnb.com>",
    subject: "Reservation confirmed - Madhusudan arrives Oct 20",
    text: "Send Madhusudan a MessageSend Madhusudan a Message [https://www.airbnb.co.in/hosting/thread/2701111112?x=1]",
  });
  assert.equal(parsed.guestName, "Madhusudan");
  assert.equal(parsed.body, "Reservation confirmed - Madhusudan arrives Oct 20");
});

test("parseInboundEmail: Airbnb reservation confirmed shows its subject, not the listing after the profile", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <automated@airbnb.com>",
    subject: "Reservation confirmed - Riya Mehta arrives Oct 13",
    text: [
      "New booking confirmed! Riya arrives Oct 13.",
      "Send a message to confirm check-in details or welcome Riya.",
      "Riya Mehta",
      "Identity verified",
      "On Airbnb since 2026",
      "Send Riya a MessageSend Riya a Message [https://www.airbnb.co.in/hosting/thread/2701111113?x=1]",
      "Sun Drenched Studio | Juliet Balcony 100Mbps WiFi",
      "Entire home/apt",
      "Check-in",
      "Tue, Oct 13",
      "Confirmation code",
      "HMAAAAAAAA",
    ].join("\n"),
  });
  assert.equal(parsed.body, "Reservation confirmed - Riya Mehta arrives Oct 13");
  assert.equal(parsed.threadKey, "airbnb:2701111113");
});

test("parseInboundEmail: Airbnb inquiry drops the guest's home town and the button text", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <express@airbnb.com>",
    subject: "Respond to Vikram’s inquiry",
    text: [
      "Respond to Vikram’s inquiry",
      "Vikram",
      "On Airbnb since 2024",
      "New Delhi, India",
      "Reaching Jaipur by 8 am, can I check in early?",
      "Send Vikram a MessageSend Vikram a Message [https://www.airbnb.co.in/hosting/thread/2701111114?x=1]",
      "Chic Couple Studio",
    ].join("\n"),
  });
  assert.equal(parsed.guestName, "Vikram");
  assert.equal(parsed.body, "Reaching Jaipur by 8 am, can I check in early?");
});

test("parseInboundEmail: Airbnb account notices are ignored", () => {
  const parsed = parseInboundEmail({
    from: "Airbnb <automated@airbnb.com>",
    subject: "Here’s your Airbnb code",
    text: "%opentrack% https://www.airbnb.co.in/?c=.pi80.x\nHERE’S YOUR AIRBNB CODE\nNever share this code.",
  });
  assert.equal(parsed.ignore, true);
});

test("parseInboundEmail: HTML-only Booking.com email uses relay as thread key", () => {
  const parsed = parseInboundEmail({
    from: "Booking.com <noreply@booking.com>",
    replyTo: "asharma.884422@guest.booking.com",
    subject: "New message from guest Arjun Sharma",
    html: "<p>Do you have a <b>baby cot</b>?</p><p>Reply above this line</p>",
  });
  assert.equal(parsed.channel, "BOOKING_COM");
  assert.equal(parsed.guestName, "Arjun Sharma");
  assert.equal(parsed.threadKey, "relay:asharma.884422@guest.booking.com");
  assert.equal(parsed.body, "Do you have a baby cot?");
});

test("parseInboundEmail: keeps the email's own date, ignoring bad or future ones", () => {
  const base = { from: "Airbnb <express@airbnb.com>", subject: "Respond to Vikram’s inquiry", text: "hi" };
  assert.equal(parseInboundEmail({ ...base, date: "2026-10-13T10:31:00.000Z" }).receivedAt?.toISOString(), "2026-10-13T10:31:00.000Z");
  assert.equal(parseInboundEmail({ ...base, date: "not a date" }).receivedAt, null);
  assert.equal(parseInboundEmail({ ...base, date: new Date(Date.now() + 864e5).toISOString() }).receivedAt, null);
  assert.equal(parseInboundEmail(base).receivedAt, null);
});

test("detectChannel recognises MakeMyTrip and Goibibo", () => {
  assert.equal(detectChannel(["hotelsupport@makemytrip.com"]), "MAKEMYTRIP");
  assert.equal(detectChannel(["noreply@goibibo.com"]), "MAKEMYTRIP");
  assert.equal(detectChannel(["partner@go-mmt.com"]), "MAKEMYTRIP");
});
