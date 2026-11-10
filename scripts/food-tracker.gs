/**
 * GrocerySplit food tracker: logs your share of each fully paid grocery trip to this spreadsheet and saves the
 * receipt photos to your receipts folder. Runs as you, so the grocery app never gets access to your Google account.
 *
 * Setup (once):
 *   1. Open the spreadsheet, then Extensions > Apps Script. Paste this file in place of the starter code.
 *   2. Fill in the three settings below and save.
 *   3. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy, and approve access.
 *   4. Copy the web app URL. On the server, set FOOD_TRACKER_URL to it, FOOD_TRACKER_SECRET to the same SECRET
 *      as below, and FOOD_TRACKER_PARTICIPANT to your name in the app. Restart the app.
 * After editing this script, use Deploy > Manage deployments > Edit > New version so the URL keeps working.
 */

// A long random string, also set as FOOD_TRACKER_SECRET on the server. Anyone with it and the URL can add rows.
const SECRET = 'paste-a-long-random-string-here';
// The receipts folder: the long id at the end of its Drive URL.
const FOLDER_ID = 'paste-the-receipts-folder-id-here';
// The tab rows go in. Leave empty to use the first tab.
const SHEET_NAME = '';

// Columns: Date, Store, Receipt file, Receipt total ($), Food ($, pre-tax), Non-food / other ($), Notes, App trip ID.
// The trip ID lets a trip whose shares change after logging update its own row instead of adding another.
const TRIP_ID_COLUMN = 8;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (!body || body.secret !== SECRET) return reply({ ok: false, error: 'Wrong secret' });
    const row = body.row;
    if (!row || typeof row.tripId !== 'string') return reply({ ok: false, error: 'Missing row' });

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const files = savePhotos(body.photos || []);
      upsertRow(row, files);
    } finally {
      lock.releaseLock();
    }
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err && err.message || err) });
  }
}

/** Saves each photo once; a photo already in the folder under the same name is reused. */
function savePhotos(photos) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  return photos.map(function (photo) {
    const existing = folder.getFilesByName(photo.name);
    if (existing.hasNext()) return existing.next();
    const blob = Utilities.newBlob(Utilities.base64Decode(photo.data), photo.mimeType, photo.name);
    return folder.createFile(blob);
  });
}

function upsertRow(row, files) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = (SHEET_NAME && book.getSheetByName(SHEET_NAME)) || book.getSheets()[0];
  if (!sheet.getRange(1, TRIP_ID_COLUMN).getValue()) sheet.getRange(1, TRIP_ID_COLUMN).setValue('App trip ID');

  // Link the receipt when there is one photo; list the names when there are several.
  const fileCell = files.length === 1
    ? '=HYPERLINK("' + files[0].getUrl() + '", "' + row.fileNames[0].replace(/"/g, '""') + '")'
    : (row.fileNames || []).join(', ');
  const values = [row.date, row.store, fileCell, row.shareTotal, row.food, row.nonFood, row.notes, row.tripId];

  const last = sheet.getLastRow();
  if (last >= 2) {
    const ids = sheet.getRange(2, TRIP_ID_COLUMN, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === row.tripId) {
        sheet.getRange(i + 2, 1, 1, values.length).setValues([values]);
        return;
      }
    }
  }
  sheet.appendRow(values);
}

function reply(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
