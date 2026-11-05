# Booking requests → Google Sheet and email

The booking form on `/pricing` sends each request to a Google Sheet. Two emails then go
out through Brevo, both from moments@chasinglightstudios.com.au:

- **Notification** to moments@, which Cloudflare forwards to your inbox. Press Reply to
  answer the client directly.
- **Receipt** to the client, if they gave an email address. It is a copy of their request
  so they can check it. If they reply, the reply comes to moments@.

If the script can't reach Brevo, the notification comes from your own Gmail instead, so a
request is never missed. The client's receipt is skipped in that case.

Until the form is connected, it opens the visitor's email app with their request filled
in, addressed to moments@chasinglightstudios.com.au.

## 1. Create the sheet

1. Go to <https://sheets.new> while signed in to the Google account that should own the bookings.
2. Name it something like **Chasing Light — Booking requests**.

## 2. Set up Brevo

1. Sign up at <https://www.brevo.com>. The free plan sends 300 emails a day.
2. **Authenticate the domain.** Open **Senders, Domains & Dedicated IPs → Domains → Add a
   domain**, and enter `chasinglightstudios.com.au`. Brevo lists some DNS records.
   - If Brevo offers to set them up through Cloudflare automatically, use that.
   - Otherwise add each record in **Cloudflare → DNS → Records**, exactly as Brevo shows it.
     Set any CNAME records to **DNS only** (grey cloud).
   - **SPF:** Cloudflare Email Routing already has a TXT record starting `v=spf1`. A domain
     can only have one. If Brevo asks for SPF, add `include:spf.brevo.com` inside the
     existing record, before `~all`. Don't create a second one.
   - **DMARC:** if a `_dmarc` record already exists, keep just one.
   - Back in Brevo, press **Authenticate this email domain**. It can take a while to go
     green.
3. **Add the sender.** Open **Senders → Add a sender**. Name: **Chasing Light Studio**.
   Email: **moments@chasinglightstudios.com.au**. Brevo emails a code to moments@, and it
   arrives in your inbox.
4. **Create an API key.** Open **SMTP & API → API keys → Generate a new API key**. Name it
   "Booking form". Copy the key, because Brevo only shows it once.

## 3. Add the script

1. In the sheet: **Extensions → Apps Script**.
2. Delete the placeholder `function myFunction() {}`.
3. Paste in the whole of [`Code.gs`](Code.gs) from this folder, then press **Save** (the disk icon).
4. Add the client's receipt design. Next to **Files**, press **+**, choose **HTML**, and
   name it `Receipt`. Apps Script adds the `.html` itself. Replace its contents with the
   whole of [`Receipt.html`](Receipt.html), then **Save**. Its logo is loaded from the
   website (`assets/img/email/logo-mark.png`).
5. Open **Project Settings** (the gear on the left), go to **Script Properties**, and choose
   **Add script property**. Set:
   - **Property:** `BREVO_API_KEY`
   - **Value:** the key from Brevo

   Then press **Save script properties**. Keep the key here only. Never paste it into
   `Code.gs` or this repository, because they are public.
6. Optional, near the top of `Code.gs`:
   - `NOTIFY = false` turns off your notification email.
   - `SEND_RECEIPT = false` turns off the client's copy.

## 4. Authorise it, and test it once

1. In the function menu at the top of the editor, choose **testSetup**, then press **Run**.
2. Google asks for permission. Choose your account, then **Advanced → Go to … (unsafe)**
   (it says "unsafe" only because you wrote the script, not Google), then **Allow**.
   It asks for four things:
   - to edit this spreadsheet;
   - to connect to an external service (Brevo);
   - to send email as you (the backup notification);
   - to see your email address (where the backup notification goes).
3. Go back to the sheet. There is now a **Booking requests** tab with a header row and
   one test row. Two emails arrive in your inbox: the notification, and the receipt a client
   would get (the test addresses it to moments@). Delete the test row.
4. If the emails don't come, open **Executions** in the Apps Script editor. A line such as
   `Brevo 401` means the API key is wrong. `Brevo 400 … sender` means the sender or domain
   isn't verified yet. `No HTML file named Receipt` means the receipt file in step 3.4 is
   missing or named differently.

## 5. Deploy it as a web app

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

## 6. Connect the website

1. Open `assets/js/pricing.js` and find this line near the top:

   ```js
   const BOOKING_SHEET_URL = "";
   ```

2. Paste the URL between the quotes:

   ```js
   const BOOKING_SHEET_URL = "https://script.google.com/macros/s/AKfy…/exec";
   ```

3. In `pricing.html`, raise the number in `pricing.js?v=5` by one so visitors' browsers
   pick up the new file.
4. Publish the change as usual.

## 7. Try it from the live site

Send a booking request from <https://chasinglightstudios.com.au/pricing#book>. Use an
email address other than your own Gmail, so you see what a client sees. You should see
all of these:

- "your booking request is with me" and "A copy of your request is on its way";
- a new row in the sheet;
- the notification in your inbox;
- the receipt at the address you entered.

## Good to know

- **Changing the script later:** after editing `Code.gs` or `Receipt`, use **Deploy → Manage deployments
  → (pencil) → Version: New version → Deploy**. That keeps the same URL. Choosing *New
  deployment* again creates a *different* URL, and the website would still be sending to
  the old one.
- **Privacy:** the sheet stays private to your Google account. The web app can only add
  rows. It never sends any booking data back to the website. Brevo sees only the content
  of the two emails.
- **Spam:**
  - The form has a hidden field that people never see. Requests that fill it in are
    thrown away.
  - Only the four sessions on the pricing page are accepted.
  - So that nobody can use the form to flood someone's inbox, an address gets at most
    one receipt every 10 minutes, and at most 100 receipts go out a day. Change these
    with `RECEIPT_REPEAT_MINUTES` and `RECEIPTS_PER_DAY`. Every request still reaches
    you and the sheet.
- **If the site says "didn't send":** open the Apps Script editor → **Executions** to see
  the error. The visitor is offered an email link with their details, so the request still
  reaches you.
- **Columns:** Received, Name, Email, Phone, Contact by, Session, Length, Preferred date,
  Suburb / location, Message, Sent from, Status. *Status* is blank for you to use
  (for example "replied", "booked").
