# Booking requests → Google Sheet

The booking form on `/pricing` can send each request straight into a Google Sheet.
Until it is connected, the form opens the visitor's email app with their request filled
in, addressed to moments@chasinglightstudios.com.au. Nothing is lost in the meantime.

Setting it up takes about ten minutes, and you only do it once.

## 1. Create the sheet

1. Go to <https://sheets.new> while signed in to the Google account that should own the bookings.
2. Name it something like **Chasing Light — Booking requests**.

## 2. Add the script

1. In the sheet: **Extensions → Apps Script**.
2. Delete the placeholder `function myFunction() {}`.
3. Paste in the whole of [`Code.gs`](Code.gs) from this folder, then press **Save** (the disk icon).
4. Optional: near the top, `NOTIFY_EMAIL` is the address that gets an email for every new
   request. It is set to moments@chasinglightstudios.com.au. Change it, or set it to `''`
   to turn the emails off.

## 3. Authorise it, and test it once

1. In the function menu at the top of the editor, choose **testSetup**, then press **Run**.
2. Google asks for permission. Choose your account, then **Advanced → Go to … (unsafe)**
   (it says "unsafe" only because you wrote the script, not Google), then **Allow**.
   It asks to edit this spreadsheet and to send email as you (for the notification email).
3. Go back to the sheet. There is now a **Booking requests** tab with a header row and
   one test row, and the notification email has arrived. Delete the test row.

## 4. Deploy it as a web app

1. In the Apps Script editor: **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set:
   - **Description:** Booking form
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**. It must be *Anyone*. "Anyone with a Google account"
     makes visitors sign in, and the form can't send.
4. Press **Deploy** and copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfy…/exec`.
5. Check it: open that URL in a browser. You should see
   `{"ok":true,"service":"Chasing Light Studio booking requests"}`.

## 5. Connect the website

1. Open `assets/js/pricing.js` and find this line near the top:

   ```js
   const BOOKING_SHEET_URL = "";
   ```

2. Paste the URL between the quotes:

   ```js
   const BOOKING_SHEET_URL = "https://script.google.com/macros/s/AKfy…/exec";
   ```

3. In `pricing.html`, change `pricing.js?v=3` to `pricing.js?v=4` so visitors' browsers
   pick up the new file.
4. Publish the change as usual.

## 6. Try it from the live site

Send yourself a booking request from <https://chasinglightstudios.com.au/pricing#book>.
You should see "your booking request is with me", a new row in the sheet, and the
notification email.

## Good to know

- **Changing the script later:** after editing `Code.gs`, use **Deploy → Manage deployments
  → (pencil) → Version: New version → Deploy**. That keeps the same URL. Choosing *New
  deployment* again creates a *different* URL, and the website would still be sending to
  the old one.
- **Privacy:** the sheet stays private to your Google account. The web app can only add
  rows. It never sends any booking data back to the website.
- **Spam:** the form has a hidden field that people never see. Requests that fill it in
  are thrown away.
- **If the site says "didn't send":** open the Apps Script editor → **Executions** to see
  the error. The visitor is offered an email link with their details, so the request still
  reaches you.
- **Columns:** Received, Name, Email, Phone, Contact by, Session, Length, Preferred date,
  Suburb / location, Message, Sent from, Status. *Status* is blank for you to use
  (for example "replied", "booked").
