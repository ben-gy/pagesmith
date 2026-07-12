# Tool Plan: Pagesmith

## Overview
- **Name:** Pagesmith
- **Repo name:** pagesmith
- **Tagline:** Merge, split, reorder, rotate and delete PDF pages — entirely in your browser.

## Problem It Solves
Someone has a stack of PDFs — a signed contract split across three scans, a bank statement with pages in the wrong order, a medical record where page 4 has someone else's data that must be removed, a 40-page report they need to send as two separate files. They Google "merge PDF" or "reorder PDF pages" and land on a wall of free sites that all want them to **upload the document to a server**. These are exactly the documents people are most nervous handing to a random web service: contracts, payslips, passports, tax returns, medical letters. Pagesmith does the whole job in the browser — the file is opened, re-ordered, and re-saved locally and never touches a network.

## Why This Must Be Client-Side
- **Sensitive-data handling** — the whole point is that legal/medical/financial PDFs never leave the device.
- **No-account friction** — no sign-up, no watermark, no "3 free operations then pay" wall.
- **Speed/offline** — after first load it works with the network cable pulled; assembling a PDF is instant, no round-trip.

## Browser APIs / Libraries Used
| API / Library | What it does for us | Fallback if unsupported |
|---------------|----------------------|-------------------------|
| pdf.js (pdfjs-dist) + its Web Worker | Parse PDFs and render every page to a thumbnail | N/A — hard requirement; worker degrades to main thread |
| Canvas 2D (drawImage from pdf.js) | Rasterise page thumbnails | N/A |
| IntersectionObserver | Lazily render only on-screen thumbnails (fast for 100+ pages) | Falls back to eager render |
| pdf-lib (in a dedicated Web Worker) | Assemble the output PDF: copy/reorder/rotate/drop pages | N/A |
| Web Workers + Transferable ArrayBuffers | Keep the UI responsive during parse + assembly | Main-thread fallback |
| Drag and Drop (HTML5) | Reorder page tiles, ingest files | Buttons/keyboard as fallback |
| File API / Blob / URL.createObjectURL | Read input, deliver output | N/A |
| Web Share API | Share the finished PDF (mobile) | Download link |
| Clipboard API | Copy page count / status | Silent no-op |
| Service Worker (PWA) | Offline capability after first load | Works online without it |

## Workflow (input → process → output)
1. User drops one or more PDF files (or taps to pick). Every page is added to a thumbnail grid.
2. User organises: drag to reorder (pages flow across source files), click to select, delete selected, rotate selected 90°, add more files to append. Live thumbnails via pdf.js.
3. User clicks **Export** — pdf-lib assembles the current ordered/rotated/pruned page list into a new PDF in a worker, with determinate progress. Output is downloaded / shared. "Export selected" produces a subset (this is how split/extract works).

## Non-Goals
- No OCR, no text editing, no form filling, no redaction of page *content* (page-level delete only) — v1.
- No image-to-PDF or Office-to-PDF conversion (PDFs in, PDF out).
- No cloud sync, no accounts, ever.
- No compression (that's the sibling tool `pdf-crush`).

## Target Audience
Anyone at a laptop who just needs to fix up a PDF and is uneasy about uploading it: a paralegal at 11pm assembling an exhibit bundle, a job-seeker combining a CV and cover letter, a parent removing a page with a child's medical detail before emailing a form to school. Non-technical, stressed, wants it done in three clicks and wants to be sure nothing leaked.

## Style Direction
**Tone:** professional, calm, reassuring.
**Colour palette:** light, spacious, warm-white surfaces with a single confident indigo accent and slate text — reads as "trustworthy document tool", not "hacker utility". Sensitive-document users want to feel safe.
**UI density:** balanced-to-spacious. Big drop zone, generous page grid, restrained toolbar.
**Dark/light theme:** light default (consumer/business), with a system-aware dark variant so it's not blinding at night.
**Reference tools for feel:** Smallpdf / iLovePDF (the clean consumer PDF-tool look) — but private.

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite. No React — the page grid is a single list with drag-reorder, no deep component tree.
- **Key libraries:** `pdf-lib` (assembly), `pdfjs-dist` (render).
- **Worker strategy:** two workers — pdf.js's own parsing worker (bundled by Vite) for rendering, plus one dedicated `pdf-worker.ts` running pdf-lib for the final assembly so a 200-page export never freezes the UI.
- **Storage:** none for documents. localStorage only for UI prefs (theme, last export mode).

## Privacy & Trust Model
**Protected**
- Every PDF is read with `FileReader`/`ArrayBuffer` and processed by pdf.js and pdf-lib **locally**. No page, no thumbnail, no byte is uploaded.
- No analytics, no cookies, no third-party fonts, no telemetry. CSP forbids all network egress (`connect-src 'self'`).

**Not protected**
- Page-level operations only — deleting a page removes the whole page, it does not scrub text hidden elsewhere in the document, and it does not strip document metadata beyond what pdf-lib rewrites on save. (Pointed at `metascrub` for image EXIF; a note in the Threat Model modal.)
- The initial page load is served by GitHub Pages' CDN, which sees your IP and the request for the site itself (standard for any website).

**Trust surface**
- The static site bundle (hash-pinned by the GitHub Pages deploy).
- The TLS chain between the user and GitHub Pages.
- No third-party runtime services at all — the CSP is `default-src 'self'`.

## UX Required Surfaces
- Drop zone (drag-drop, tap-to-pick, appends on subsequent drops).
- Thumbnail grid with drag-reorder, multi-select, per-page rotate/delete.
- Determinate progress for parse (pages rendered / total) and export (pages written / total).
- Event log drawer (Dropwell pattern).
- How-It-Works modal (illustrated steps).
- Threat Model modal (Protected / Not protected / Trust surface).
- About modal with benrichardson.dev attribution + source link.
- Output: download + Web Share + copy status.
- Keyboard: Escape closes modals, Delete removes selected, Cmd/Ctrl+A select all, Enter exports.
- Sticky footer "Built by benrichardson.dev".
