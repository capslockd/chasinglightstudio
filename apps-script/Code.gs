const SHEET_NAME = 'Booking requests';

const STUDIO_NAME = 'Chasing Light Studio';
const STUDIO_EMAIL = 'moments@chasinglightstudios.com.au';
const SITE_URL = 'https://chasinglightstudios.com.au';

const NOTIFY = true;
const SEND_RECEIPT = true;
const RECEIPT_REPEAT_MINUTES = 10;
const RECEIPTS_PER_DAY = 100;

const SERVICES = ['Maternity', 'Newborn', 'Special Events', 'Weddings'];

const COLUMNS = [
  ['Received', 'received'],
  ['Name', 'name'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['Contact by', 'contact'],
  ['Session', 'service'],
  ['Length', 'package'],
  ['Preferred date', 'date'],
  ['Suburb / location', 'suburb'],
  ['Message', 'message'],
  ['Sent from', 'page'],
  ['Status', null],
];

function doPost(e) {
  try {
    const data = parseRequest_(e);

    if (clean_(data.website)) return json_({ ok: true });

    const missing = ['name', 'contact', 'service'].filter((k) => !clean_(data[k]));
    if (!clean_(data.email) && !clean_(data.phone)) missing.push('email or phone');
    if (missing.length) return json_({ ok: false, error: 'missing ' + missing.join(', ') });
    if (SERVICES.indexOf(clean_(data.service)) < 0) return json_({ ok: false, error: 'unknown session' });

    let receiptAllowed = false;
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = bookingSheet_();
      sheet.appendRow(COLUMNS.map(([, key]) => {
        if (key === 'received') return new Date();
        if (!key) return '';
        const value = clean_(data[key]);
        return value ? "'" + value : '';
      }));
      receiptAllowed = SEND_RECEIPT && isEmail_(clean_(data.email)) && claimReceipt_(clean_(data.email));
    } finally {
      lock.releaseLock();
    }

    if (NOTIFY) notify_(data);
    const receipt = receiptAllowed && sendReceipt_(data);
    return json_({ ok: true, receipt: receipt });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }
}

function doGet() {
  return json_({ ok: true, service: 'Chasing Light Studio booking requests' });
}

function testSetup() {
  const out = doPost({
    postData: {
      contents: JSON.stringify({
        name: 'Test booking', email: STUDIO_EMAIL, phone: '0400 000 000',
        contact: 'Email', service: 'Maternity', package: '1 hour — $450',
        date: '2030-01-01', suburb: 'Werribee', message: 'Setup test — delete me',
        website: '', page: 'apps-script testSetup',
      }),
    },
  });
  console.log(out.getContent());
}

function parseRequest_(e) {
  if (!e) return {};
  const body = e.postData && e.postData.contents;
  if (body) {
    try { return JSON.parse(body); } catch (_) {}
  }
  return e.parameter || {};
}

function clean_(value) {
  return String(value == null ? '' : value).trim().slice(0, 2000);
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function bookingSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS.map(([heading]) => heading));
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Receipt limits

function claimReceipt_(email) {
  const cache = CacheService.getScriptCache();
  const recent = 'receipt:' + email.toLowerCase();
  if (cache.get(recent)) return false;

  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const count = JSON.parse(props.getProperty('RECEIPT_COUNT') || '{}');
  const sent = count.day === today ? count.sent : 0;
  if (sent >= RECEIPTS_PER_DAY) return false;

  props.setProperty('RECEIPT_COUNT', JSON.stringify({ day: today, sent: sent + 1 }));
  cache.put(recent, '1', RECEIPT_REPEAT_MINUTES * 60);
  return true;
}

// Emails

function details_(data) {
  return [
    ['Session', clean_(data.service)],
    ['Length', clean_(data.package)],
    ['Preferred date', niceDate_(clean_(data.date))],
    ['Suburb or location', clean_(data.suburb)],
    ['Best way to reach you', clean_(data.contact)],
    ['Email', clean_(data.email) || '—'],
    ['Phone', clean_(data.phone) || '—'],
  ];
}

function notify_(data) {
  const name = clean_(data.name);
  const email = clean_(data.email);
  const subject = 'Booking request — ' + clean_(data.service) + ' — ' + name;
  const html =
    '<p>A new booking request from the website.</p>' +
    table_([['Name', name]].concat(details_(data))) +
    message_(data) +
    '<p><a href="' + esc_(SpreadsheetApp.getActiveSpreadsheet().getUrl()) + '">Open the sheet</a></p>';
  const replyTo = isEmail_(email) ? { email: email, name: name } : null;

  try {
    brevo_({ email: STUDIO_EMAIL, name: STUDIO_NAME }, subject, html, replyTo, 'booking-notification');
  } catch (err) {
    console.error(err);
    const options = { htmlBody: html };
    if (replyTo) options.replyTo = email;
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, 'A new booking request from the website.', options);
  }
}

function sendReceipt_(data) {
  const name = clean_(data.name);
  const first = name.split(/\s+/)[0] || name;
  const how = clean_(data.contact) === 'Phone' ? 'phone' : 'email';
  const html =
    '<p>Hi ' + esc_(first) + ',</p>' +
    '<p>Thank you for your booking request. Here is a copy of what you sent, so you can check the details.</p>' +
    table_(details_(data)) +
    message_(data) +
    '<p>This is a request, not a confirmed booking. I\'ll be in touch by ' + how +
    ' to check the date and confirm the details. If anything above is wrong, just reply to this email.</p>' +
    '<p>' + STUDIO_NAME + '<br><a href="' + SITE_URL + '">chasinglightstudios.com.au</a></p>';

  try {
    brevo_({ email: clean_(data.email), name: name },
      'Your booking request — ' + STUDIO_NAME, html, { email: STUDIO_EMAIL, name: STUDIO_NAME }, 'booking-receipt');
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function brevo_(to, subject, html, replyTo, tag) {
  const key = PropertiesService.getScriptProperties().getProperty('BREVO_API_KEY');
  if (!key) throw new Error('BREVO_API_KEY is not set');
  const payload = {
    sender: { email: STUDIO_EMAIL, name: STUDIO_NAME },
    to: [to],
    subject: subject,
    htmlContent: '<div style="font-family:Georgia,serif;font-size:16px;line-height:1.5;color:#222">' + html + '</div>',
    tags: [tag],
  };
  if (replyTo) payload.replyTo = replyTo;
  const res = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'api-key': key, accept: 'application/json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Brevo ' + code + ': ' + res.getContentText());
}

function table_(rows) {
  return '<table cellpadding="6" style="border-collapse:collapse">' + rows.map(([label, value]) =>
    '<tr><td style="color:#777;vertical-align:top">' + esc_(label) + '</td><td>' + esc_(value) + '</td></tr>'
  ).join('') + '</table>';
}

function message_(data) {
  const message = clean_(data.message);
  return message ? '<p style="white-space:pre-wrap">' + esc_(message) + '</p>' : '';
}

function niceDate_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE d MMMM yyyy');
}

function esc_(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
