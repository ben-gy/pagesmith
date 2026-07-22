// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageItem, SourceDoc } from './types';

// Bundle pdf.js's worker as a same-origin module (CSP-friendly, no CDN).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${uid++}`;

export const MAX_FILE_BYTES = 300 * 1024 * 1024; // 300 MB guard

export interface LoadedFile {
  doc: SourceDoc;
  pages: PageItem[];
}

/** Read a File into an ArrayBuffer, guarding against absurd sizes. */
async function readBytes(file: File): Promise<ArrayBuffer> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than 300 MB.`);
  }
  return file.arrayBuffer();
}

/** True if the bytes start with the %PDF- magic marker. */
export function looksLikePdf(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes.slice(0, 5));
  return (
    head[0] === 0x25 && // %
    head[1] === 0x50 && // P
    head[2] === 0x44 && // D
    head[3] === 0x46 && // F
    head[4] === 0x2d // -
  );
}

/**
 * Load a PDF file: keep the raw bytes for pdf-lib, and open a pdf.js proxy
 * (from a *copy*, because pdf.js detaches the buffer it is handed) for rendering.
 */
export async function loadPdf(file: File): Promise<LoadedFile> {
  const bytes = await readBytes(file);
  if (!looksLikePdf(bytes)) {
    throw new Error(`"${file.name}" doesn't look like a PDF.`);
  }

  const proxy: PDFDocumentProxy = await pdfjs.getDocument({
    data: new Uint8Array(bytes.slice(0)),
    // Keep everything local — no external cmaps/fonts fetched.
    isEvalSupported: false,
  }).promise;

  const docId = nextId('doc');
  const doc: SourceDoc = {
    id: docId,
    name: file.name,
    bytes,
    pageCount: proxy.numPages,
    proxy,
  };

  const pages: PageItem[] = [];
  const label = file.name;
  for (let i = 0; i < proxy.numPages; i++) {
    const page = await proxy.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    pages.push({
      id: nextId('pg'),
      docId,
      sourceIndex: i,
      rotation: 0,
      width: vp.width,
      height: vp.height,
      selected: false,
      label: `${label} · p${i + 1}`,
    });
  }
  return { doc, pages };
}

/**
 * Render a page thumbnail into a canvas. `boxWidth` is the target CSS width in
 * px; the height follows the page aspect ratio and any extra rotation.
 */
export async function renderThumbnail(
  doc: SourceDoc,
  page: PageItem,
  canvas: HTMLCanvasElement,
  boxWidth: number,
): Promise<void> {
  const pdfPage = await doc.proxy.getPage(page.sourceIndex + 1);
  const totalRotation = (pdfPage.rotate + page.rotation) % 360;
  const base = pdfPage.getViewport({ scale: 1, rotation: totalRotation });
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const scale = (boxWidth / base.width) * dpr;
  const viewport = pdfPage.getViewport({ scale, rotation: totalRotation });

  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  canvas.style.width = `${boxWidth}px`;
  canvas.style.height = `${boxWidth * (viewport.height / viewport.width)}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available.');
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
}

/** Release pdf.js resources for a document. */
export function destroyDoc(doc: SourceDoc): void {
  void doc.proxy.destroy();
}
