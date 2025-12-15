## Google Sheets hookup for YelloBricks pre-beta gate

Goal: when a user enters an email in the in-app pre-beta overlay, append it to your Google Sheet:
`https://docs.google.com/spreadsheets/d/1q34f9DWJs4l_q3i-1V1tDRrMDDf7FqOVSxgp7JWJaio/edit?usp=sharing`

### Why we need an Apps Script web app
Google Sheets “anyone with the link can edit” does not automatically allow server-side API writes without OAuth credentials.

The simplest, “no secrets in repo” approach is a Google Apps Script web app that appends a row to the sheet.

### Step 1 - Create Apps Script
1. Open the sheet.
2. Click **Extensions -> Apps Script**.
3. Paste this script:

```javascript
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    var email = String(body.email || '').trim();
    if (!email || email.indexOf('@') === -1) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'Invalid email' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.openById('1q34f9DWJs4l_q3i-1V1tDRrMDDf7FqOVSxgp7JWJaio');
    var sheet = ss.getSheets()[0];
    sheet.appendRow([new Date(), email, body.userAgent || '']);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### Step 2 - Deploy as Web App
1. Click **Deploy -> New deployment**.
2. Select **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone** (or **Anyone with the link**).
5. Click **Deploy** and copy the deployment URL.

### Step 3 - Configure YelloBricks
Add this to `brickmixer/.env.local`:

```bash
PREBETA_APPS_SCRIPT_WEBHOOK_URL="PASTE_YOUR_WEB_APP_URL_HERE"
NEXT_PUBLIC_PREBETA_GATE_DISABLED=false
```

Restart dev server after changing env vars.

### Dev bypass (optional)
If you want to bypass the gate locally:

```bash
NEXT_PUBLIC_PREBETA_GATE_DISABLED=true
```
