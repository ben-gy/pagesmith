# pagesmith

**Merge, split, reorder, rotate and delete PDF pages — entirely in your browser. No uploads.**

Live: https://pagesmith.benrichardson.dev

---

## what it is

Pagesmith is a private, in-browser PDF page editor. Drop in one or more PDFs and every page appears as a draggable thumbnail. Reorder pages (even across files), rotate them, delete the ones you don't want, and pull a subset out into a brand-new document. When you're done, you export a fresh PDF — and at no point does any file leave your device.

It exists because the obvious search for "merge PDF" or "reorder PDF pages" leads to a wall of sites that all want you to **upload** your document to a server first. Those documents are often the most sensitive things people own: contracts, bank statements, medical letters, passports, tax returns. Pagesmith does the same job with the file staying on your machine the entire time.

It's for anyone at a laptop who just needs to fix up a PDF and is uneasy about handing it to a random web service — a paralegal assembling an exhibit bundle, a job-seeker combining a CV and cover letter, a parent removing one page before emailing a school form.

## how it works

```
 drop PDFs ─▶ pdf.js (Web Worker) renders a thumbnail per page
              │
              ▼
    you organise: drag-reorder · rotate · delete · select a subset
              │
              ▼
   Export ─▶ pdf-lib (Web Worker) copies the chosen pages, in order,
             applying your rotations, into a new PDF ─▶ download / share
```

Two workers are involved: pdf.js runs its own parsing/render worker to draw thumbnails without freezing the UI, and a dedicated `pdf-worker.ts` runs pdf-lib to assemble the output so even a couple-hundred-page export stays smooth. Source bytes are passed to the assembly worker by structured clone (not transfer), so your originals stay intact for further edits.

"Splitting" is just exporting a selection: select the pages you want and the export contains only those, in the order shown. Rotations are additive on top of each page's existing rotation.

## browser APIs used

- **pdf.js (pdfjs-dist) + Web Worker** — parse PDFs and rasterise page thumbnails
- **Canvas 2D** — draw the thumbnails
- **IntersectionObserver** — render thumbnails lazily as they scroll into view (fast for 100+ pages)
- **pdf-lib in a dedicated Web Worker** — assemble the output PDF
- **Transferable ArrayBuffers** — hand the finished PDF back from the worker cheaply
- **HTML5 Drag & Drop** — ingest files and reorder page tiles
- **File / Blob / URL.createObjectURL** — read input, deliver output
- **Web Share API** — share the finished PDF on mobile
- **Clipboard API** — copy the event log
- **Service Worker (PWA)** — full offline use after first load

## security / privacy model

**Protected**
- PDFs are read and rewritten entirely on-device. No page, thumbnail or byte is uploaded.
- No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics — no personal data, no cross-site tracking.
- A strict Content-Security-Policy (`default-src 'self'`, `connect-src 'self'`) means the page cannot open a network connection anywhere — your files can't be exfiltrated even by accident.
- After the first visit a service worker lets Pagesmith run fully offline.

**Not protected**
- Pagesmith works at the page level. Deleting a page removes the whole page but does not scrub text or metadata hidden elsewhere in the document. (For photo EXIF, see [metascrub](https://metascrub.benrichardson.dev).)
- Password-protected PDFs that require a key to decrypt cannot be opened.
- The initial page load is served by GitHub Pages, whose CDN sees your IP and the request for the site itself — the same as visiting any website.

**Trust model**
- The static site bundle, pinned by the GitHub Pages deploy.
- The TLS connection between you and GitHub Pages.
- There are no third-party runtime services.

## stack

- Vite 6 + vanilla TypeScript
- `pdf-lib` (assembly), `pdfjs-dist` (render)
- `vite-plugin-pwa` for offline support
- Vitest for unit tests
- GitHub Pages for hosting, deployed via GitHub Actions

No runtime dependencies beyond pdf-lib and pdf.js. No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics — no personal data, no cross-site tracking.

## local development

```bash
npm install
npm run dev      # vite dev server on :5173
npm test         # run vitest suite
npm run build    # produce dist/ for deploy
npm run preview  # serve dist/ locally
```

## deploying

A push to `main` triggers `.github/workflows/deploy.yml`, which runs tests, builds, and deploys `dist/` to GitHub Pages. The custom domain is set via `public/CNAME` — point a `CNAME` DNS record for `pagesmith.benrichardson.dev` at `ben-gy.github.io`.

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
