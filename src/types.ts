// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** A loaded source PDF. Its bytes are kept for assembly; the proxy is for rendering. */
export interface SourceDoc {
  id: string;
  name: string;
  /** Original file bytes — used by pdf-lib at export time. Never given to pdf.js directly. */
  bytes: ArrayBuffer;
  pageCount: number;
  proxy: PDFDocumentProxy;
}

/** One page tile in the working set. Order in the array is the output order. */
export interface PageItem {
  id: string;
  docId: string;
  /** 0-based page index within the source document. */
  sourceIndex: number;
  /** Extra rotation applied on top of the source page rotation: 0 | 90 | 180 | 270. */
  rotation: number;
  /** Source page dimensions in points (for thumbnail aspect ratio, unrotated). */
  width: number;
  height: number;
  selected: boolean;
  /** Human label, e.g. "contract.pdf · p3". */
  label: string;
}

/** A page to write, resolved to its source doc — the assembly worker's input unit. */
export interface AssemblyPage {
  docId: string;
  sourceIndex: number;
  rotation: number;
}

export interface AssemblyRequest {
  docs: { id: string; bytes: ArrayBuffer }[];
  pages: AssemblyPage[];
}

/** Messages from the assembly worker back to the main thread. */
export type WorkerOut =
  | { type: 'progress'; done: number; total: number }
  | { type: 'done'; bytes: Uint8Array }
  | { type: 'error'; message: string };

export type WorkerIn = { type: 'assemble'; req: AssemblyRequest };
