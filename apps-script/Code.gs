const SHEET_NAME = 'Booking requests';

const NOTIFY = true;

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
    } finally {
      lock.releaseLock();
    }

    if (NOTIFY) notify_(data);
    return json_({ ok: true });
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
        name: 'Test booking', email: 'test@example.com', phone: '0400 000 000',
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

function notify_(data) {
  const lines = [
    'A new booking request from the website.',
    '',
    'Name: ' + clean_(data.name),
    'Email: ' + (clean_(data.email) || '—'),
    'Phone: ' + (clean_(data.phone) || '—'),
    'Contact by: ' + clean_(data.contact),
    'Session: ' + clean_(data.service),
    'Length: ' + clean_(data.package),
    'Preferred date: ' + clean_(data.date),
    'Suburb / location: ' + clean_(data.suburb),
    '',
    clean_(data.message),
    '',
    'It is also in your sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ];
  const email = clean_(data.email);
  const options = {};
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) options.replyTo = email;
  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    'Booking request — ' + clean_(data.service) + ' — ' + clean_(data.name),
    lines.join('\n'),
    options
  );
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
