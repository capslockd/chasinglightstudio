# Social posting

Publishes a photo + caption to the Chasing Light Studio Facebook Page and Instagram account.

## One-time setup

1. Create a Meta App at developers.facebook.com, add the **Facebook Login** and **Instagram Graph API** products.
2. Make sure your Instagram account is a **Business or Creator** account linked to your Facebook Page.
3. Generate a long-lived Page Access Token with `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish` scopes (Graph API Explorer, then exchange for a long-lived token).
4. Find your `FB_PAGE_ID` (Page Settings) and `IG_USER_ID` (`GET /me/accounts` then `GET /{page-id}?fields=instagram_business_account`).
5. `cp social/.env.example social/.env` and fill in the values.

## Manual usage (one specific photo)

```
node social/post.mjs to-post/your-photo.jpg --caption "Golden hour with the loveliest couple 💛"
```

Options:
- `--caption-file path` — read the caption from a text file instead of `--caption`.
- `--fb-only` / `--ig-only` — post to just one platform.
- `--dry-run` — resize the image and print what would happen, without pushing or posting.
- `--no-push` — skip the git commit/push step (use if the image is already live).

The script resizes the photo into `assets/img/social/`, commits + pushes it so GitHub Pages serves it publicly (Graph API needs a public URL), waits for it to go live, then posts to Facebook and Instagram via the Graph API.

Every run pushes to `main` and publishes live to your real social accounts — treat it accordingly.

## Automated daily posting

```
node social/daily-post.mjs
```

This picks the oldest photo (by file modified time) across every gallery listed in `social/galleries.json` that isn't yet recorded in `social/posted.json`, builds a caption naming that gallery and linking to its page on the site, and runs it through `post.mjs`. On success it appends the photo to `social/posted.json` and commits/pushes that file so the next run (even from a fresh checkout, e.g. a scheduled agent) knows what's already gone out.

- Add `--dry-run` to preview the pick + caption without posting or writing to `posted.json`.
- Add `--fb-only` / `--ig-only` to restrict the platform, same as `post.mjs`.
- Add a new gallery by adding an entry to `social/galleries.json` (slug must match the folder name under `assets/img/`) — no code changes needed.
- Once every photo in every configured gallery has been posted, the script exits with an error rather than repeating — add photos to a gallery or a new gallery entry to keep the cycle going.

This is the script a scheduled daily routine should invoke.

## Scheduling (launchd)

The daily run is a per-user `launchd` LaunchAgent (macOS's cron equivalent), not a cron job:

- Plist: `~/Library/LaunchAgents/com.chasinglightstudio.dailypost.plist`
- Runs `node social/daily-post.mjs` once a day (see `<StartCalendarInterval>` in the plist for the
  exact hour).
- Logs (stdout **and** stderr, combined): `social/daily-post.log` — this file just keeps growing,
  it's never rotated automatically.

### Checking status

```
launchctl list | grep chasinglightstudio
```

The middle column is the **last exit code**. `0` = last run succeeded. Anything else means the
last run failed — check the tail of `social/daily-post.log` for what happened.

### Triggering a run right now (don't wait for the schedule)

```
launchctl kickstart -k gui/$(id -u)/com.chasinglightstudio.dailypost
```

Or just run it directly (recommended while debugging, since you see output live and can pass
`--dry-run`):

```
cd /Users/bren/Documents/Workspace/chasinglightstudio
node social/daily-post.mjs --dry-run
```

### Restarting after editing the plist

launchd caches the loaded job definition — editing the `.plist` file alone does nothing until you
reload it:

```
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.chasinglightstudio.dailypost.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.chasinglightstudio.dailypost.plist
```

### If the job is failing

1. **Read the log first**: `tail -n 60 social/daily-post.log`. The script fails loudly — the
   failing command and its error get printed.
2. **`Not logged in · Please run /login`** from the `claude -p` step: the `claude` CLI reads its
   stored credentials from the macOS login keychain, and that lookup needs the `USER` (and
   `LOGNAME`/`HOME`) environment variable to be set — a bare `launchd` job doesn't always inherit
   these the way an interactive shell does. Confirm the plist's `EnvironmentVariables` dict
   includes `PATH`, `USER`, `LOGNAME`, and `HOME`, not just `PATH`. If it's genuinely logged out
   (rare — check by running `claude -p "hi"` in a normal terminal), run `claude /login` once
   interactively; the credential it stores in the keychain is what the background job reuses.
3. **Instagram/Facebook API errors** (from the `post.mjs` step, e.g. media container timeouts):
   usually transient — the script exits non-zero and does **not** mark the photo as posted, so the
   next scheduled run (or a manual rerun) retries the same photo automatically. No cleanup needed.
4. **Stuck repeatedly failing on the same photo**: since `social/posted.json` is only updated
   after a fully successful post, a genuinely broken photo (corrupt file, API rejecting the
   content) will retry forever and block every photo after it. To skip it, manually add its path
   to `social/posted.json` and commit — the picker will move on to the next unposted photo.
5. **Sanity-check the exact environment the job runs in** (catches env-var issues like #2 without
   waiting for the schedule):
   ```
   env -i PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Users/bren/.local/bin" \
     USER="$USER" LOGNAME="$LOGNAME" HOME="$HOME" \
     node social/daily-post.mjs --dry-run
   ```
