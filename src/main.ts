// feedback:begin (managed by hub/scripts/feedback/backfill.mjs)
import { mountFeedback } from './feedback';
mountFeedback();
// feedback:end

import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import type { PageItem, SourceDoc } from './types';
import { destroyDoc, loadPdf } from './pdf';
import { UI, type UIHandlers } from './ui';
import { EventLog } from './eventlog';
import { initGlossary } from './glossary';
import { assemblePdf } from './assemble';
import {
  buildAssembly,
  countSelected,
  docsInAssembly,
  moveItems,
  removeSelected,
  rotateOne,
  rotateSelected,
  selectAll,
  selectRange,
  setSelected,
} from './pages';
import { deriveOutputName } from './format';

class App {
  private docs = new Map<string, SourceDoc>();
  private pages: PageItem[] = [];
  private anchor: string | null = null;
  private busy = false;
  private resultUrl: string | null = null;
  private abort: AbortController | null = null;

  private ui: UI;
  private log: EventLog;

  constructor(root: HTMLElement) {
    const handlers: UIHandlers = {
      onFiles: (files) => void this.addFiles(files),
      onExport: () => void this.exportPdf(),
      onCancelExport: () => this.cancelExport(),
      onClearAll: () => this.clearAll(),
      onSelectAll: (sel) => this.select(sel),
      onDeleteSelected: () => this.deleteSelected(),
      onRotateSelected: (delta) => this.rotateSelectedPages(delta),
      onPageSelect: (id, mods) => this.selectPage(id, mods),
      onPageRotate: (id, delta) => this.rotatePage(id, delta),
      onPageDelete: (id) => this.deletePage(id),
      onReorder: (moving, before) => this.reorder(moving, before),
    };
    this.ui = new UI(root, handlers, (id) => this.docs.get(id));
    this.log = new EventLog(this.ui.logParts);

    document.getElementById('log-toggle')?.addEventListener('click', () =>
      this.log.toggle(),
    );
    document.getElementById('log-close')?.addEventListener('click', () =>
      this.log.toggle(false),
    );

    this.log.add('Ready. Everything runs locally in your browser.', 'good');
    this.refresh();
  }

  // ─────────────────────────────────────────── state → view

  private refresh(): void {
    this.ui.sync(this.pages);
    this.ui.updateToolbar(this.pages.length, countSelected(this.pages), this.busy);
  }

  // ─────────────────────────────────────────── file ingest

  private async addFiles(files: File[]): Promise<void> {
    this.ui.clearError();
    const pdfs = files.filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
    );
    const skipped = files.length - pdfs.length;
    if (skipped > 0) {
      this.log.add(`Ignored ${skipped} non-PDF file${skipped === 1 ? '' : 's'}.`, 'warn');
    }
    for (const file of pdfs) {
      try {
        this.log.add(`Reading "${file.name}"…`);
        const { doc, pages } = await loadPdf(file);
        this.docs.set(doc.id, doc);
        this.pages = [...this.pages, ...pages];
        this.log.add(
          `Added "${doc.name}" — ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'}.`,
          'good',
        );
        this.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : `Couldn't read "${file.name}".`;
        this.log.add(msg, 'bad');
        this.ui.showError(msg);
      }
    }
  }

  // ─────────────────────────────────────────── selection

  private selectPage(id: string, mods: { shift: boolean; toggle: boolean }): void {
    if (mods.shift && this.anchor) {
      this.pages = selectRange(this.pages, this.anchor, id, true);
    } else {
      const cur = this.pages.find((p) => p.id === id);
      this.pages = setSelected(this.pages, id, !cur?.selected);
      this.anchor = id;
    }
    this.refresh();
  }

  private select(selected: boolean): void {
    this.pages = selectAll(this.pages, selected);
    if (!selected) this.anchor = null;
    this.refresh();
  }

  // ─────────────────────────────────────────── edits

  private rotatePage(id: string, delta: number): void {
    this.pages = rotateOne(this.pages, id, delta);
    this.refresh();
  }

  private rotateSelectedPages(delta: number): void {
    const n = countSelected(this.pages);
    if (n === 0) return;
    this.pages = rotateSelected(this.pages, delta);
    this.log.add(`Rotated ${n} page${n === 1 ? '' : 's'} ${delta > 0 ? '↻' : '↺'} 90°.`);
    this.refresh();
  }

  private deletePage(id: string): void {
    this.pages = this.pages.filter((p) => p.id !== id);
    this.log.add('Removed 1 page.');
    this.pruneDocs();
    this.refresh();
  }

  private deleteSelected(): void {
    const n = countSelected(this.pages);
    if (n === 0) return;
    this.pages = removeSelected(this.pages);
    this.anchor = null;
    this.log.add(`Removed ${n} page${n === 1 ? '' : 's'}.`);
    this.pruneDocs();
    this.refresh();
  }

  private reorder(moving: Set<string>, before: string | null): void {
    this.pages = moveItems(this.pages, moving, before);
    this.log.add(`Reordered ${moving.size} page${moving.size === 1 ? '' : 's'}.`);
    this.refresh();
  }

  private clearAll(): void {
    for (const doc of this.docs.values()) destroyDoc(doc);
    this.docs.clear();
    this.pages = [];
    this.anchor = null;
    this.revokeResult();
    this.ui.clearResult();
    this.ui.clearError();
    this.log.add('Cleared all pages.');
    this.refresh();
  }

  /** Drop pdf.js docs no longer referenced by any page to free memory. */
  private pruneDocs(): void {
    const used = new Set(this.pages.map((p) => p.docId));
    for (const [id, doc] of this.docs) {
      if (!used.has(id)) {
        destroyDoc(doc);
        this.docs.delete(id);
      }
    }
  }

  // ─────────────────────────────────────────── export

  private async exportPdf(): Promise<void> {
    if (this.busy || this.pages.length === 0) return;
    const manifest = buildAssembly(this.pages);
    if (manifest.length === 0) return;

    const usedDocIds = docsInAssembly(this.pages);
    const req = {
      docs: usedDocIds.map((id) => {
        const doc = this.docs.get(id)!;
        return { id, bytes: doc.bytes };
      }),
      pages: manifest,
    };

    const subset = countSelected(this.pages) > 0;
    const name = deriveOutputName(
      usedDocIds.map((id) => this.docs.get(id)?.name ?? 'document.pdf'),
      { subset },
    );

    this.busy = true;
    this.revokeResult();
    this.ui.clearResult();
    this.ui.clearError();
    this.ui.setBusy(true);
    this.abort = new AbortController();
    this.log.add(`Assembling ${manifest.length} page${manifest.length === 1 ? '' : 's'}…`);

    try {
      const bytes = await assemblePdf(req, {
        signal: this.abort.signal,
        onProgress: (done, total) => this.ui.setProgress(done, total, 'Writing page'),
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      this.resultUrl = URL.createObjectURL(blob);
      this.log.add(`Done — ${name} (${blob.size} bytes).`, 'good');

      const shareFile = new File([blob], name, { type: 'application/pdf' });
      const canShare =
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [shareFile] });

      this.ui.showResult({
        name,
        size: blob.size,
        url: this.resultUrl,
        onCopyLog: () => void this.copyLog(),
        onShare: canShare
          ? () => void this.shareFile(shareFile)
          : undefined,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        this.log.add('Export cancelled.', 'warn');
      } else {
        const msg = err instanceof Error ? err.message : 'Export failed.';
        this.log.add(msg, 'bad');
        this.ui.showError(msg, () => void this.exportPdf());
      }
    } finally {
      this.busy = false;
      this.abort = null;
      this.ui.setBusy(false);
      this.refresh();
    }
  }

  private cancelExport(): void {
    this.abort?.abort();
  }

  private async shareFile(file: File): Promise<void> {
    try {
      await navigator.share({ files: [file], title: file.name });
      this.log.add('Shared via the system share sheet.', 'good');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        this.log.add('Share was not completed.', 'warn');
      }
    }
  }

  private async copyLog(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.log.toText());
      this.log.add('Event log copied to clipboard.', 'good');
    } catch {
      this.log.add('Could not access the clipboard.', 'warn');
    }
  }

  private revokeResult(): void {
    if (this.resultUrl) {
      URL.revokeObjectURL(this.resultUrl);
      this.resultUrl = null;
    }
  }
}

// ─────────────────────────────────────────── bootstrap

const root = document.getElementById('app');
if (root) {
  initGlossary();
  new App(root);
  try {
    registerSW({ immediate: true });
  } catch {
    /* offline support is optional */
  }
}
