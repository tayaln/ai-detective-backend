/**
 * Attempt log appender — a Google Apps Script web app bound to the client's sheet.
 * Kept here for reference; the live copy is deployed in Google (task 212).
 *
 * Deploy:
 *   1. In the sheet: Extensions > Apps Script, paste this file.
 *   2. Project Settings > Script properties: add SHARED_KEY with a long random value.
 *   3. Deploy > New deployment > Web app; Execute as: Me; Who has access: Anyone.
 *   4. In the backend .env:
 *        GOOGLE_SCRIPT_URL=<web app URL>?key=<SHARED_KEY>
 *        GOOGLE_SHEET_URL=<the sheet's URL>
 *
 * The web app URL alone lets anyone write, so the key means a leaked URL
 * without it is refused. The URL with the key is a credential: .env only.
 *
 * Apps Script cannot set an HTTP status, so the reply body says whether the
 * row was written: {"ok":true} or {"ok":false,"error":"..."}.
 */

var SHEET_NAME = 'Attempts';
var HEADERS = [
  'Timestamp (IST)',
  'Learner',
  'Mission',
  'Step',
  'Type',
  'Attempt number',
  'Correct',
  'Score',
  'Submitted answer',
];

function doPost(e) {
  var key = PropertiesService.getScriptProperties().getProperty('SHARED_KEY');
  if (!key || !e || !e.parameter || e.parameter.key !== key) {
    return reply({ ok: false, error: 'forbidden' });
  }

  var data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'invalid JSON' });
  }

  var row = [
    data.timestamp,
    data.learner,
    data.mission,
    data.step,
    data.type,
    data.attemptNumber,
    data.correct ? 'Yes' : 'No',
    data.score === null || data.score === undefined ? '' : data.score,
    data.submittedAnswer,
  ];

  // Two attempts arriving together must not write to the same row.
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = attemptsSheet();
    var range = sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length);
    // Plain text, so a learner's code or name starting with "=" is never run
    // as a formula and every value lands exactly as sent.
    range.setNumberFormat('@');
    range.setValues([row]);
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

function attemptsSheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
