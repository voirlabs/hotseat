# Landing page

The static site for https://hotseat.voirlabs.io, styled to match voirlabs.io. There's no build step and no dependencies.

- Preview: open `index.html` in a browser, or run `firebase serve --only hosting` from this folder.
- SEO files: `robots.txt`, `sitemap.xml` (bump `lastmod` when the page changes) and `llms.txt`. The JSON-LD in `index.html` links Hotseat to the Voir Labs organization (`https://www.voirlabs.io/#organization`).
- Images: `og.png` is rendered from `../docs/brand/og-image.html` and the PNG favicons from `../docs/brand/icon.html` with headless Chrome (commands are in those files). `assets/screenshot-room.jpg` is a screenshot of the app.
- Deploy: it's served by Firebase Hosting as site `hotseat-voirlabs` in the Voir Labs open-source Firebase project (`open-source-65128`) (`firebase.json`, `.firebaserc`). Pushes to `main` that touch `site/` deploy it through `.github/workflows/site.yml`. To deploy by hand, run `firebase deploy --only hosting` from this folder.
- Shared styles: `styles.css` is shared with the other Voir Labs open-source projects, so don't edit it here. Page-specific CSS goes in the `<style>` block of `index.html`.

`assets/logo.svg` (the Hotseat mark), `assets/voir-mark.svg` and the hero art `assets/hero.webp` are Voir Labs brand assets. They are not covered by this repository's MIT license and may not be reused outside this project.
