# Chasing Light Studio

Static photography portfolio site, hosted on GitHub Pages.

## Structure
- `index.html`, `portfolio.html`, `about.html`, `contact.html` — site pages
- `gallery-sarah-birthday.html` — session gallery (masonry grid + lightbox)
- `assets/img/<session>/{thumbs,full}/` — optimized WebP images (640px / 1600px)
- `assets/data/<session>.json` — photo manifest used by `assets/js/gallery.js`
- `portfolio/` — original JPGs (gitignored, never pushed)

## Adding a new session
1. Drop original JPGs into `portfolio/<Session Name>/`
2. Run `scripts/optimize.sh "portfolio/<Session Name>" <session-slug>`
3. Copy a public gallery (e.g. `gallery-ben-ola-wedding.html`) to `gallery-<session-slug>.html` and update:
   - `<title>` (pattern: `<Session> | Werribee <Service> Photographer — Chasing Light Studio`), `<meta name="description">`,
     canonical, `og:url` (no `.html`), `og:`/`twitter:` title + description, the `<h1>` and `data-slug`
   - the JSON-LD block and the `<noscript>` image list — both list the highlight photos (from
     `assets/data/<slug>-highlights.json`), so search engines can see images that `gallery.js` loads
   - `og:image`: a 1200×630 JPEG in `assets/img/og/<slug>.jpg` (e.g. `sips -s format jpeg --resampleWidth 1200` then `--cropToHeightWidth 630 1200`)
   - For a password-protected gallery (`data-protect`), leave the photos out of the JSON-LD, `<noscript>`, `og:image` and sitemap.
4. Add a session card to `portfolio.html` (and `index.html` if featured), and a `hasPart` entry to the portfolio JSON-LD
5. Add the page to `sitemap.xml`, with an `<image:image>` line per highlight photo (public galleries only)

## Local preview
```
python3 -m http.server 8000
```

## Deploy
Push to `main`; GitHub Pages serves from the repo root (`.nojekyll` included).
