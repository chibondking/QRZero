# QRZero website

Plain HTML and CSS, no build step. `pages.yml` publishes this folder to GitHub Pages on every push to main that touches `site/`.

- The newest version number in the buttons is filled in by `app.js` from the GitHub releases API; the download links point at the latest release, so they never go stale.
- Screenshots in `img/` are WebP copies of `docs/screenshots`.
- Custom domain: set it in repo Settings > Pages (the Actions deploy ignores a `CNAME` file).
