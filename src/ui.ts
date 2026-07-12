import type { PageItem, SourceDoc } from './types';
import { renderThumbnail } from './pdf';
import { gloss } from './glossary';
import { formatBytes } from './format';

export interface UIHandlers {
  onFiles: (files: File[]) => void;
  onExport: () => void;
  onCancelExport: () => void;
  onClearAll: () => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteSelected: () => void;
  onRotateSelected: (delta: number) => void;
  onPageSelect: (id: string, mods: { shift: boolean; toggle: boolean }) => void;
  onPageRotate: (id: string, delta: number) => void;
  onPageDelete: (id: string) => void;
  onReorder: (movingIds: Set<string>, beforeId: string | null) => void;
}

const THUMB_WIDTH = 150;
const DRAG_MIME = 'application/x-pagesmith';
const THEME_KEY = 'pagesmith.theme';

interface Tile {
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  page: PageItem;
  renderedRotation: number | null;
}

export class UI {
  readonly root: HTMLElement;
  private handlers: UIHandlers;
  private getDoc: (docId: string) => SourceDoc | undefined;

  private grid!: HTMLElement;
  private dropzone!: HTMLElement;
  private workspace!: HTMLElement;
  private fileInput!: HTMLInputElement;
  private toolbarCount!: HTMLElement;
  private exportBtn!: HTMLButtonElement;
  private progressWrap!: HTMLElement;
  private progressBar!: HTMLElement;
  private progressLabel!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;
  private resultPanel!: HTMLElement;
  private errorPanel!: HTMLElement;
  private modalRoot!: HTMLElement;
  private liveRegion!: HTMLElement;

  // event-log drawer parts, exposed for EventLog wiring
  logParts!: {
    drawer: HTMLElement;
    list: HTMLElement;
    count: HTMLElement;
    live: HTMLElement;
  };

  private tiles = new Map<string, Tile>();
  private observer: IntersectionObserver;
  private dragMoving: Set<string> | null = null;

  constructor(
    root: HTMLElement,
    handlers: UIHandlers,
    getDoc: (docId: string) => SourceDoc | undefined,
  ) {
    this.root = root;
    this.handlers = handlers;
    this.getDoc = getDoc;
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.pageId;
            if (id) this.renderTile(id);
          }
        }
      },
      { rootMargin: '400px 0px' },
    );
    this.build();
    this.applyStoredTheme();
  }

  // ─────────────────────────────────────────── build skeleton

  private build(): void {
    this.root.innerHTML = SKELETON;
    this.grid = this.q('#grid');
    this.dropzone = this.q('#dropzone');
    this.workspace = this.q('#workspace');
    this.fileInput = this.q('#file-input');
    this.toolbarCount = this.q('#toolbar-count');
    this.exportBtn = this.q('#export-btn');
    this.progressWrap = this.q('#progress');
    this.progressBar = this.q('#progress-bar');
    this.progressLabel = this.q('#progress-label');
    this.cancelBtn = this.q('#cancel-btn');
    this.resultPanel = this.q('#result');
    this.errorPanel = this.q('#error');
    this.modalRoot = this.q('#modal-root');
    this.liveRegion = this.q('#live');
    this.logParts = {
      drawer: this.q('#log-drawer'),
      list: this.q('#log-list'),
      count: this.q('#log-count'),
      live: this.liveRegion,
    };

    this.wireStaticEvents();
  }

  private q<T extends HTMLElement>(sel: string): T {
    const el = this.root.querySelector<T>(sel) ?? document.querySelector<T>(sel);
    if (!el) throw new Error(`Missing element ${sel}`);
    return el;
  }

  private wireStaticEvents(): void {
    // File input + dropzone
    this.fileInput.addEventListener('change', () => {
      if (this.fileInput.files?.length) {
        this.handlers.onFiles([...this.fileInput.files]);
        this.fileInput.value = '';
      }
    });
    const pick = () => this.fileInput.click();
    this.dropzone.addEventListener('click', pick);
    this.dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pick();
      }
    });
    this.q('#add-files-btn').addEventListener('click', pick);

    // OS file drag/drop onto dropzone and workspace
    for (const zone of [this.dropzone, this.workspace]) {
      zone.addEventListener('dragover', (e) => {
        if (this.isFileDrag(e)) {
          e.preventDefault();
          zone.classList.add('drag-file');
        }
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-file'));
      zone.addEventListener('drop', (e) => {
        zone.classList.remove('drag-file');
        if (this.isFileDrag(e)) {
          e.preventDefault();
          const files = [...(e.dataTransfer?.files ?? [])];
          if (files.length) this.handlers.onFiles(files);
        }
      });
    }

    // Toolbar buttons
    this.q('#select-all-btn').addEventListener('click', () =>
      this.handlers.onSelectAll(true),
    );
    this.q('#deselect-btn').addEventListener('click', () =>
      this.handlers.onSelectAll(false),
    );
    this.q('#rotate-btn').addEventListener('click', () =>
      this.handlers.onRotateSelected(90),
    );
    this.q('#delete-btn').addEventListener('click', () =>
      this.handlers.onDeleteSelected(),
    );
    this.q('#clear-btn').addEventListener('click', () => this.handlers.onClearAll());

    this.exportBtn.addEventListener('click', () => this.handlers.onExport());
    this.cancelBtn.addEventListener('click', () => this.handlers.onCancelExport());

    // Grid-level dragover for reorder insertion point
    this.grid.addEventListener('dragover', (e) => this.onGridDragOver(e));
    this.grid.addEventListener('drop', (e) => this.onGridDrop(e));
    this.grid.addEventListener('dragend', () => this.clearDragState());

    // Header actions -> modals + log
    this.q('#how-btn').addEventListener('click', () => this.openModal('how'));
    this.q('#threat-btn').addEventListener('click', () => this.openModal('threat'));
    this.q('#about-btn').addEventListener('click', () => this.openModal('about'));
    this.q('#theme-btn').addEventListener('click', () => this.toggleTheme());

    // Trust banner opens threat model
    this.q('#trust-banner').addEventListener('click', () => this.openModal('threat'));

    // Modal + global keyboard
    this.modalRoot.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains('modal-overlay') || t.closest('[data-close]')) {
        this.closeModal();
      }
    });
    document.addEventListener('keydown', (e) => this.onGlobalKey(e));
  }

  private isFileDrag(e: DragEvent): boolean {
    return !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  }

  // ─────────────────────────────────────────── grid reconciliation

  /** Reconcile the DOM grid with the given page list (order + selection + rotation). */
  sync(pages: PageItem[]): void {
    const hasPages = pages.length > 0;
    this.dropzone.classList.toggle('has-pages', hasPages);
    this.workspace.hidden = !hasPages;

    const wanted = new Set(pages.map((p) => p.id));
    // Remove tiles that are gone.
    for (const [id, tile] of this.tiles) {
      if (!wanted.has(id)) {
        this.observer.unobserve(tile.el);
        tile.el.remove();
        this.tiles.delete(id);
      }
    }
    // Create / update tiles and set order.
    let prev: HTMLElement | null = null;
    for (const page of pages) {
      let tile = this.tiles.get(page.id);
      if (!tile) {
        tile = this.createTile(page);
        this.tiles.set(page.id, tile);
        this.observer.observe(tile.el);
      } else {
        this.updateTile(tile, page);
      }
      // Ensure DOM order matches list order.
      const expectedNext: Element | null = prev
        ? prev.nextElementSibling
        : this.grid.firstElementChild;
      if (expectedNext !== tile.el) {
        this.grid.insertBefore(tile.el, prev ? prev.nextElementSibling : this.grid.firstChild);
      }
      prev = tile.el;
    }
    this.renumber(pages);
  }

  private renumber(pages: PageItem[]): void {
    pages.forEach((page, i) => {
      const tile = this.tiles.get(page.id);
      if (tile) {
        const num = tile.el.querySelector('.tile-num');
        if (num) num.textContent = String(i + 1);
      }
    });
  }

  private createTile(page: PageItem): Tile {
    const el = document.createElement('figure');
    el.className = 'tile';
    el.dataset.pageId = page.id;
    el.draggable = true;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', page.label);

    const canvas = document.createElement('canvas');
    canvas.className = 'tile-canvas';
    const thumb = document.createElement('div');
    thumb.className = 'tile-thumb';
    thumb.style.aspectRatio = `${page.width} / ${page.height}`;
    thumb.appendChild(canvas);

    const num = document.createElement('span');
    num.className = 'tile-num';

    const controls = document.createElement('div');
    controls.className = 'tile-controls';
    const rot = document.createElement('button');
    rot.type = 'button';
    rot.className = 'tile-btn';
    rot.title = 'Rotate this page 90°';
    rot.setAttribute('aria-label', 'Rotate page');
    rot.innerHTML = ROTATE_ICON;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'tile-btn tile-btn-danger';
    del.title = 'Delete this page';
    del.setAttribute('aria-label', 'Delete page');
    del.innerHTML = TRASH_ICON;
    controls.append(rot, del);

    const check = document.createElement('span');
    check.className = 'tile-check';
    check.setAttribute('aria-hidden', 'true');

    el.append(thumb, num, controls, check);

    const tile: Tile = { el, canvas, page, renderedRotation: null };

    // Selection
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.tile-btn')) return;
      this.handlers.onPageSelect(page.id, {
        shift: e.shiftKey,
        toggle: e.metaKey || e.ctrlKey,
      });
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.handlers.onPageSelect(page.id, { shift: e.shiftKey, toggle: true });
      }
    });
    rot.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onPageRotate(page.id, 90);
    });
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlers.onPageDelete(page.id);
    });

    // Drag to reorder
    el.addEventListener('dragstart', (e) => {
      this.dragMoving = this.computeMovingSet(page.id);
      el.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(DRAG_MIME, page.id);
      }
    });

    this.updateTile(tile, page);
    return tile;
  }

  private updateTile(tile: Tile, page: PageItem): void {
    const rotationChanged = tile.page.rotation !== page.rotation;
    tile.page = page;
    tile.el.classList.toggle('selected', page.selected);
    tile.el.setAttribute('aria-pressed', String(page.selected));
    if (rotationChanged && tile.renderedRotation !== null) {
      // Re-render because orientation changed.
      this.renderTile(page.id);
    }
  }

  private computeMovingSet(pageId: string): Set<string> {
    const selected = new Set<string>();
    for (const [id, t] of this.tiles) if (t.page.selected) selected.add(id);
    if (selected.has(pageId) && selected.size > 0) return selected;
    return new Set([pageId]);
  }

  private async renderTile(id: string): Promise<void> {
    const tile = this.tiles.get(id);
    if (!tile) return;
    if (tile.renderedRotation === tile.page.rotation) return;
    const doc = this.getDoc(tile.page.docId);
    if (!doc) return;
    try {
      await renderThumbnail(doc, tile.page, tile.canvas, THUMB_WIDTH);
      tile.renderedRotation = tile.page.rotation;
      tile.el.classList.add('rendered');
    } catch {
      tile.el.classList.add('render-failed');
    }
  }

  private onGridDragOver(e: DragEvent): void {
    if (!this.dragMoving) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const beforeId = this.insertionBefore(e.clientX, e.clientY);
    this.showInsertion(beforeId);
  }

  private onGridDrop(e: DragEvent): void {
    if (!this.dragMoving) return;
    e.preventDefault();
    const beforeId = this.insertionBefore(e.clientX, e.clientY);
    const moving = this.dragMoving;
    this.clearDragState();
    this.handlers.onReorder(moving, beforeId);
  }

  private clearDragState(): void {
    this.dragMoving = null;
    for (const t of this.tiles.values()) {
      t.el.classList.remove('dragging', 'insert-before');
    }
  }

  /** Which tile id should the moving block be inserted before (null = end)? */
  private insertionBefore(x: number, y: number): string | null {
    const candidates = [...this.tiles.values()].filter(
      (t) => !this.dragMoving?.has(t.page.id),
    );
    let best: { id: string; dist: number; after: boolean } | null = null;
    for (const t of candidates) {
      const r = t.el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = Math.hypot(x - cx, y - cy);
      if (!best || dist < best.dist) {
        const after = y > cy + r.height * 0.25 || (Math.abs(y - cy) <= r.height * 0.25 && x > cx);
        best = { id: t.page.id, dist, after };
      }
    }
    if (!best) return null;
    if (!best.after) return best.id;
    // insert after `best` -> before the following tile in DOM order
    const tile = this.tiles.get(best.id);
    const next = tile?.el.nextElementSibling as HTMLElement | null;
    return next?.dataset.pageId ?? null;
  }

  private showInsertion(beforeId: string | null): void {
    for (const t of this.tiles.values()) t.el.classList.remove('insert-before');
    if (beforeId) this.tiles.get(beforeId)?.el.classList.add('insert-before');
  }

  // ─────────────────────────────────────────── toolbar / progress / result

  updateToolbar(total: number, selected: number, busy: boolean): void {
    const sel = selected > 0 ? ` · ${selected} selected` : '';
    this.toolbarCount.textContent = `${total} page${total === 1 ? '' : 's'}${sel}`;
    const selectionOps = this.root.querySelectorAll<HTMLButtonElement>('[data-needs-selection]');
    selectionOps.forEach((b) => (b.disabled = selected === 0 || busy));
    this.exportBtn.disabled = total === 0 || busy;
    this.exportBtn.textContent =
      selected > 0 ? `Export ${selected} selected page${selected === 1 ? '' : 's'}` : 'Export PDF';
  }

  setProgress(done: number, total: number, label: string): void {
    this.progressWrap.hidden = false;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    this.progressBar.style.width = `${pct}%`;
    this.progressLabel.textContent = `${label} ${done}/${total} (${pct}%)`;
  }

  setBusy(busy: boolean): void {
    this.exportBtn.hidden = busy;
    this.cancelBtn.hidden = !busy;
    if (!busy) {
      this.progressWrap.hidden = true;
      this.progressBar.style.width = '0%';
    }
  }

  clearResult(): void {
    this.resultPanel.hidden = true;
    this.resultPanel.innerHTML = '';
  }

  showResult(opts: {
    name: string;
    size: number;
    url: string;
    onShare?: () => void;
    onCopyLog: () => void;
  }): void {
    this.clearError();
    this.resultPanel.hidden = false;
    this.resultPanel.innerHTML = `
      <div class="result-card">
        <div class="result-tick">✓</div>
        <div class="result-body">
          <h3>Your PDF is ready</h3>
          <p class="result-meta"><strong>${escapeHtml(opts.name)}</strong> · ${formatBytes(opts.size)} · assembled locally</p>
          <div class="result-actions">
            <a class="btn btn-primary" id="download-link" href="${opts.url}" download="${escapeHtml(opts.name)}">Download PDF</a>
            ${opts.onShare ? '<button class="btn" id="share-btn" type="button">Share…</button>' : ''}
            <button class="btn btn-ghost" id="copylog-btn" type="button">Copy event log</button>
          </div>
        </div>
      </div>`;
    if (opts.onShare) {
      this.q('#share-btn').addEventListener('click', opts.onShare);
    }
    this.q('#copylog-btn').addEventListener('click', opts.onCopyLog);
    (this.q('#download-link') as HTMLElement).focus();
  }

  showError(message: string, onRetry?: () => void): void {
    this.errorPanel.hidden = false;
    this.errorPanel.innerHTML = `
      <div class="error-card" role="alert">
        <span class="error-icon">✕</span>
        <span class="error-msg">${escapeHtml(message)}</span>
        ${onRetry ? '<button class="btn btn-ghost" id="retry-btn" type="button">Retry</button>' : ''}
      </div>`;
    if (onRetry) this.q('#retry-btn').addEventListener('click', onRetry);
  }

  clearError(): void {
    this.errorPanel.hidden = true;
    this.errorPanel.innerHTML = '';
  }

  flashBanner(text: string): void {
    this.liveRegion.textContent = text;
  }

  // ─────────────────────────────────────────── modals

  private openModal(kind: 'how' | 'threat' | 'about'): void {
    const content =
      kind === 'how' ? HOW_MODAL : kind === 'threat' ? THREAT_MODAL : ABOUT_MODAL;
    this.modalRoot.innerHTML = `
      <div class="modal-overlay">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${kind}">
          <button class="modal-close" data-close aria-label="Close">✕</button>
          ${content}
        </div>
      </div>`;
    this.modalRoot.hidden = false;
    const closeBtn = this.modalRoot.querySelector<HTMLElement>('.modal-close');
    closeBtn?.focus();
  }

  private closeModal(): void {
    this.modalRoot.hidden = true;
    this.modalRoot.innerHTML = '';
  }

  private onGlobalKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (!this.modalRoot.hidden) {
        this.closeModal();
        return;
      }
    }
    // Ignore shortcuts while typing in a field.
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      if (this.tiles.size > 0) {
        e.preventDefault();
        this.handlers.onSelectAll(true);
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      this.handlers.onDeleteSelected();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this.handlers.onExport();
    }
  }

  // ─────────────────────────────────────────── theme + log toggle

  private toggleTheme(): void {
    const current =
      document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }

  private applyStoredTheme(): void {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === 'dark' || stored === 'light') {
        document.documentElement.dataset.theme = stored;
      }
    } catch {
      /* ignore */
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

// ─────────────────────────────────────────── static markup

const ROTATE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
const TRASH_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

const SKELETON = `
  <header class="site-header">
    <div class="brand">
      <svg class="brand-logo" viewBox="0 0 64 64" width="30" height="30" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--accent-primary)"/>
        <rect x="17" y="14" width="24" height="32" rx="3" fill="#c7d2fe" transform="rotate(-8 29 30)"/>
        <g transform="rotate(6 34 32)"><rect x="23" y="18" width="24" height="32" rx="3" fill="#fff"/>
        <rect x="27" y="24" width="16" height="2.6" rx="1.3" fill="#a5b4fc"/>
        <rect x="27" y="30" width="16" height="2.6" rx="1.3" fill="#a5b4fc"/>
        <rect x="27" y="36" width="11" height="2.6" rx="1.3" fill="#a5b4fc"/></g>
      </svg>
      <div class="brand-text"><span class="brand-name">Pagesmith</span>
      <span class="brand-tag">Private PDF editor</span></div>
    </div>
    <nav class="header-actions" aria-label="Site">
      <button class="linkbtn" id="how-btn" type="button">How it works</button>
      <button class="linkbtn" id="threat-btn" type="button">Threat model</button>
      <button class="linkbtn" id="about-btn" type="button">About</button>
      <button class="iconbtn" id="log-toggle" type="button" title="Event log" aria-label="Toggle event log">
        Log <span class="log-badge" id="log-count">0</span>
      </button>
      <button class="iconbtn" id="theme-btn" type="button" title="Toggle theme" aria-label="Toggle light/dark theme">◐</button>
    </nav>
  </header>

  <main class="main-content">
    <button class="trust-banner" id="trust-banner" type="button">
      <span class="lock">🔒</span>
      <span>Runs entirely in your browser. Your PDFs never leave your device — <u>no uploads, ever</u>.</span>
    </button>

    <section class="stage">
      <div class="dropzone" id="dropzone" tabindex="0" role="button"
           aria-label="Add PDF files — drag and drop or click to browse">
        <input type="file" id="file-input" accept="application/pdf,.pdf" multiple hidden />
        <div class="dz-inner">
          <div class="dz-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/></svg>
          </div>
          <p class="dz-title">Drop PDF files here</p>
          <p class="dz-sub">or <span class="dz-link">click to browse</span> · add as many as you like</p>
        </div>
      </div>

      <div class="workspace" id="workspace" hidden>
        <div class="toolbar">
          <div class="toolbar-count" id="toolbar-count">0 pages</div>
          <div class="toolbar-actions">
            <button class="btn btn-sm" id="rotate-btn" type="button" data-needs-selection>Rotate 90°</button>
            <button class="btn btn-sm btn-danger-ghost" id="delete-btn" type="button" data-needs-selection>Delete</button>
            <span class="toolbar-sep"></span>
            <button class="btn btn-sm btn-ghost" id="select-all-btn" type="button">Select all</button>
            <button class="btn btn-sm btn-ghost" id="deselect-btn" type="button">Clear selection</button>
            <span class="toolbar-sep"></span>
            <button class="btn btn-sm btn-ghost" id="add-files-btn" type="button">Add files</button>
            <button class="btn btn-sm btn-ghost" id="clear-btn" type="button">Remove all</button>
          </div>
        </div>
        <p class="grid-hint">Drag pages to reorder. Select pages to rotate, delete, or export just those.</p>
        <div class="grid" id="grid"></div>

        <div class="export-bar">
          <div class="export-progress" id="progress" hidden>
            <div class="progress-track"><div class="progress-fill" id="progress-bar"></div></div>
            <span class="progress-label" id="progress-label"></span>
          </div>
          <div class="export-actions">
            <button class="btn btn-ghost" id="cancel-btn" type="button" hidden>Cancel</button>
            <button class="btn btn-primary btn-lg" id="export-btn" type="button" disabled>Export PDF</button>
          </div>
        </div>
      </div>

      <div class="result-panel" id="result" hidden></div>
      <div class="error-panel" id="error" hidden></div>
    </section>
  </main>

  <footer class="site-footer">
    <span>Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a> · <a href="https://sites.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a></span>
    <span class="footer-dot">·</span>
    <span>Everything happens on your device</span>
  </footer>

  <aside class="log-drawer" id="log-drawer" aria-hidden="true" aria-label="Event log">
    <div class="log-head"><span>Event log</span><button class="linkbtn" id="log-close" type="button">Close</button></div>
    <div class="log-list" id="log-list"></div>
    <p class="log-foot">This log lives only in this tab. Nothing here is sent anywhere.</p>
  </aside>

  <div class="modal-root" id="modal-root" hidden></div>
  <div class="sr-only" id="live" aria-live="polite" role="status"></div>
`;

const HOW_MODAL = `
  <h2>How Pagesmith works</h2>
  <ol class="steps">
    <li><strong>You drop in PDFs.</strong> Each file is read straight into memory with the browser's File API — it is never uploaded.</li>
    <li><strong>Pages are drawn locally.</strong> ${gloss('pdf.js', 'Mozilla’s pdf.js')} renders a ${gloss('thumbnail')} of every page inside a ${gloss('web worker')}, so the page stays smooth even for big files.</li>
    <li><strong>You organise.</strong> Drag to reorder, rotate, or delete pages. Select a few pages to pull them out into their own file (that's how splitting works).</li>
    <li><strong>You export.</strong> ${gloss('pdf-lib')} stitches your chosen pages into a brand-new PDF, again in a ${gloss('web worker')}, and hands you a download.</li>
    <li><strong>Nothing leaves.</strong> A strict ${gloss('CSP', 'Content Security Policy')} blocks the page from making any network request, so the whole job is provably local.</li>
  </ol>
`;

const THREAT_MODAL = `
  <h2>Threat model</h2>
  <p class="modal-lead">Honesty about what is and isn't protected.</p>
  <h3 class="tm-good">Protected</h3>
  <ul>
    <li>Your PDFs are read and rewritten entirely ${gloss('client-side', 'on your device')}. No page, thumbnail or byte is uploaded.</li>
    <li>No cookies, no fingerprinting, no third-party fonts. Anonymous, cookie-less page-view counts via Cloudflare Web Analytics — no personal data, no cross-site tracking.</li>
    <li>A ${gloss('CSP')} restricts the app to <code>self</code> only — it cannot open a network connection to anywhere, so your files can't be exfiltrated even by accident.</li>
    <li>After the first visit a ${gloss('service worker')} lets Pagesmith run fully offline. Pull your network cable — it still works.</li>
  </ul>
  <h3 class="tm-warn">Not protected</h3>
  <ul>
    <li>Pagesmith works at the <em>page</em> level. Deleting a page removes the whole page, but it does not scrub text or ${gloss('metadata')} hidden elsewhere in the document. For photo EXIF, see metascrub.</li>
    <li>Password-protected PDFs that require a key to decrypt can't be opened. ${gloss('encryption', 'See the glossary on encryption')}.</li>
    <li>The initial page load is served by GitHub Pages, whose CDN sees your IP and the request for the site itself — the same as visiting any website.</li>
  </ul>
  <h3 class="tm-trust">What you have to trust</h3>
  <ul>
    <li>The static site bundle, pinned by the GitHub Pages deploy.</li>
    <li>The TLS connection between you and GitHub Pages.</li>
    <li>That's the whole list — there are no third-party runtime services.</li>
  </ul>
`;

const ABOUT_MODAL = `
  <h2>About Pagesmith</h2>
  <p>Pagesmith is a private, in-browser PDF page editor. Merge files, reorder and rotate pages, delete the ones you don't want, and pull a subset out into a new document — without ever uploading anything.</p>
  <p>It exists because the obvious web search for "merge PDF" or "reorder PDF pages" leads to sites that want you to upload documents that are often the most sensitive things you own: contracts, statements, medical letters, IDs. Pagesmith does the same job with the file never leaving your machine.</p>
  <p>Built by <a href="https://benrichardson.dev/" target="_blank" rel="noopener">benrichardson.dev</a>. Source on <a href="https://github.com/ben-gy/pagesmith" target="_blank" rel="noopener">GitHub</a>.</p>
  <p class="about-stack">Vanilla TypeScript · Vite · pdf.js · pdf-lib · no runtime backend.</p>
`;
