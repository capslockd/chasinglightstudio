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
3. Copy `gallery-sarah-birthday.html` to `gallery-<session-slug>.html` and update the title/`data-slug`
4. Add a session card to `portfolio.html` (and `index.html` if featured)

## Local preview
```
python3 -m http.server 8000
```

## Deploy
Push to `main`; GitHub Pages serves from the repo root (`.nojekyll` included).
