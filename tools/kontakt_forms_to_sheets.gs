/*
 * Google Apps Script endpoint for the kontakt-2026 forms.
 *
 * How to enable it:
 * 1. Open https://script.google.com and create a new Apps Script project.
 * 2. Paste this file into the editor.
 * 3. Replace SPREADSHEET_ID with the ID of your target Google Sheet.
 * 4. Save, then go to Deploy -> New deployment.
 * 5. Choose type "Web app".
 * 6. Set access so the form pages are allowed to call it.
 *    In most cases this means executing as yourself and allowing access for anyone.
 * 7. Deploy and copy the "Web app URL".
 * 8. Put that URL into scripts/kontakt-forms.js as window.KONTAKT_SHEETS_ENDPOINT
 *    or replace the DEFAULT_SHEETS_ENDPOINT constant there.
 *
 * The frontend sends JSON like:
 * {
 *   form: "kontakt-besucherumfrage",
 *   page: "/kontakt-besucherumfrage.html",
 *   submittedAt: "2026-06-15T12:34:56.000Z",
 *   userAgent: "...",
 *   data: { ...form fields... }
 * }
 */

const SPREADSHEET_ID = "REPLACE_WITH_YOUR_SPREADSHEET_ID";
const BASE_HEADERS = ["submittedAt", "form", "page", "userAgent", "payloadJson"];

function doPost(e) {
  try {
    if (!SPREADSHEET_ID || SPREADSHEET_ID === "REPLACE_WITH_YOUR_SPREADSHEET_ID") {
      throw new Error("Missing SPREADSHEET_ID.");
    }

    const payload = parsePayload_(e);
    const formName = sanitizeSheetName_(payload.form || "kontakt-form");
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ensureSheet_(spreadsheet, formName);
    const flattenedData = flattenData_(payload.data || {});

    syncHeaders_(sheet, flattenedData);
    appendPayloadRow_(sheet, payload, flattenedData);

    return jsonResponse_({ ok: true, sheet: formName });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error && error.message || error) });
  }
}

function doGet() {
  return jsonResponse_({ ok: true, message: "kontakt forms endpoint is running" });
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Missing request body.");
  }

  const payload = JSON.parse(e.postData.contents);

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid JSON payload.");
  }

  return payload;
}

function ensureSheet_(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function flattenData_(data) {
  const flattened = {};
  const keys = Object.keys(data).sort();

  keys.forEach((key) => {
    const value = data[key];

    if (Array.isArray(value)) {
      flattened[key] = value.join(" | ");
      return;
    }

    if (value === null || typeof value === "undefined") {
      flattened[key] = "";
      return;
    }

    if (typeof value === "object") {
      flattened[key] = JSON.stringify(value);
      return;
    }

    flattened[key] = String(value);
  });

  return flattened;
}

function syncHeaders_(sheet, flattenedData) {
  const existingHeaders = getHeaders_(sheet);
  const missingHeaders = Object.keys(flattenedData).filter(function(key) {
    return existingHeaders.indexOf(key) === -1;
  });

  if (!missingHeaders.length) {
    return existingHeaders;
  }

  const nextHeaders = existingHeaders.concat(missingHeaders);
  sheet.getRange(1, 1, 1, nextHeaders.length).setValues([nextHeaders]);
  return nextHeaders;
}

function getHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), BASE_HEADERS.length);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  if (!headers[0]) {
    sheet.getRange(1, 1, 1, BASE_HEADERS.length).setValues([BASE_HEADERS]);
    return BASE_HEADERS.slice();
  }

  return headers.filter(function(header) {
    return header !== "";
  });
}

function appendPayloadRow_(sheet, payload, flattenedData) {
  const headers = getHeaders_(sheet);
  const rowObject = {
    submittedAt: payload.submittedAt || new Date().toISOString(),
    form: payload.form || "",
    page: payload.page || "",
    userAgent: payload.userAgent || "",
    payloadJson: JSON.stringify(payload),
  };

  Object.keys(flattenedData).forEach(function(key) {
    rowObject[key] = flattenedData[key];
  });

  const row = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : "";
  });

  sheet.appendRow(row);
}

function sanitizeSheetName_(name) {
  return String(name)
    .replace(/[\\/?*\[\]:]/g, "-")
    .slice(0, 99) || "kontakt-form";
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
