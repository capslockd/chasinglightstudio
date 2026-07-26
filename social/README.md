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
