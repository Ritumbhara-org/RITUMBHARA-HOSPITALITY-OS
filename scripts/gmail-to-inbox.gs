/**
 * Ritumbhara OS — Gmail → Unified Inbox bridge (Google Apps Script)
 *
 * Runs inside the Gmail account that receives Airbnb / Booking.com / Agoda guest-message
 * emails, and posts each new one to /api/inbox/inbound-email. No forwarding or DNS needed.
 *
 * Setup (once):
 *  1. Signed in as that Gmail account, open https://script.google.com → New project.
 *  2. Paste this file. Project Settings → Script Properties → add:
 *       INBOX_URL    = https://ritumbhara-hospitality-os-q6er.vercel.app/api/inbox/inbound-email
 *       INBOX_SECRET = (the same value as INBOX_WEBHOOK_SECRET in Vercel)
 *  3. Select `setup` in the toolbar and click Run. Approve the Gmail permission prompt.
 *     It creates a 5-minute trigger and a label "ritumbhara-synced".
 *  4. Optional: run `syncOtaMessages` once to send the last 2 days straight away.
 */

// Senders that carry guest messages. Edit if an OTA uses another address.
var SENDERS = [
  'airbnb.com',
  'guest.booking.com',
  'mchat.booking.com',
  'booking.com',
  'agoda.com',
  'agoda-messaging.com',
  'expedia.com',
  'expediapartnercentral.com',
];

// Account / marketing / payout emails that are not guest conversations.
var SKIP_SUBJECT_WORDS = [
  'sign-in', 'sign in', 'password', 'confirm email', 'account is ready', 'thank you for joining',
  'payout', 'invoice', 'statement', 'commission', 'newsletter', 'tips', 'webinar',
  'review', 'reviewed', 'rating', 'policy update', 'terms', 'off-schedule', 'scheduled message',
];

var LABEL = 'ritumbhara-synced';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncOtaMessages') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncOtaMessages').timeBased().everyMinutes(5).create();
  getLabel_();
  Logger.log('Trigger created. New OTA emails will sync every 5 minutes.');
}

function syncOtaMessages() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('INBOX_URL');
  var secret = props.getProperty('INBOX_SECRET');
  if (!url || !secret) throw new Error('Set INBOX_URL and INBOX_SECRET in Script Properties.');

  var label = getLabel_();
  var query = 'from:(' + SENDERS.join(' OR ') + ') newer_than:2d -label:' + LABEL;
  var threads = GmailApp.search(query, 0, 50);
  var sent = 0, skipped = 0, failed = 0;

  threads.forEach(function (thread) {
    var ok = true;
    thread.getMessages().forEach(function (msg) {
      if (!isOtaSender_(msg.getFrom()) && !isOtaSender_(msg.getReplyTo())) return;
      var subject = msg.getSubject() || '';
      if (shouldSkip_(subject)) { skipped++; return; }

      var payload = {
        from: msg.getFrom(),
        to: msg.getTo(),
        replyTo: msg.getReplyTo(),
        subject: subject,
        text: msg.getPlainBody(),
        html: msg.getBody(),
        messageId: msg.getHeader('Message-ID') || msg.getId(),
        inReplyTo: msg.getHeader('In-Reply-To') || '',
      };
      var res = UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-inbox-secret': secret },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) sent++;
      else { failed++; ok = false; Logger.log('Failed (' + res.getResponseCode() + '): ' + subject + ' → ' + res.getContentText()); }
    });
    // Only mark the thread done when every message went through, so failures retry next run.
    if (ok) thread.addLabel(label);
  });

  Logger.log('Sent ' + sent + ', skipped ' + skipped + ', failed ' + failed + '.');
}

function isOtaSender_(addr) {
  addr = (addr || '').toLowerCase();
  return SENDERS.some(function (d) { return addr.indexOf(d) !== -1; });
}

function shouldSkip_(subject) {
  var s = subject.toLowerCase();
  return SKIP_SUBJECT_WORDS.some(function (w) { return s.indexOf(w) !== -1; });
}

function getLabel_() {
  return GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
}
