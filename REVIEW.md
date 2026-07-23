# Pagesmith — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **GitHub Pages:** https://ben-gy.github.io/pagesmith/ *(redirects to custom domain once DNS is live)*
- **Custom domain:** https://pagesmith.benrichardson.dev *(live after DNS + cert below)*

## What it is

A private, in-browser PDF page editor: merge files, reorder/rotate/delete pages by dragging thumbnails, and pull a subset out into a new PDF — with the file never leaving the device. Complements `pdf-crush` (compression) with a page-organiser in the same family.

## DNS setup (already applied by the pipeline)

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `pagesmith` | `ben-gy.github.io` | DNS only (grey cloud) |

If the cert needs re-triggering:
```bash
gh api repos/ben-gy/pagesmith/pages -X PUT -f cname=""
sleep 3
gh api repos/ben-gy/pagesmith/pages -X PUT -f cname="pagesmith.benrichardson.dev"
```

## Verification done before shipping

- `npm test` — 44 unit tests pass (format helpers, page-list operations, real pdf-lib assembly round-trips incl. reorder/merge/rotate/error paths).
- `npm run build` — clean `tsc` + Vite build.
- Local production preview drive-through: dropped two generated PDFs → 3 page tiles rendered; full merge export produced a valid `%PDF`…`%%EOF` document; subset export produced a valid smaller PDF; rotate, delete, threat-model modal, glossary tooltips and Escape/keyboard all verified; zero console/CSP errors.
- Visual check on desktop (light) and mobile 375px (dark): thumbnails rasterise, layout reflows, footer attribution present.
