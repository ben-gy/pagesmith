/** Jargon → plain-English definitions, surfaced as click-to-define tooltips. */
export const GLOSSARY: Record<string, string> = {
  'client-side':
    'Everything runs inside your own web browser using your device’s CPU. No file or page is ever sent to a server.',
  'pdf.js':
    'An open-source PDF engine from Mozilla that reads and renders PDF pages. Pagesmith uses it to draw the thumbnails you see.',
  'pdf-lib':
    'A pure-JavaScript library that builds and edits PDF files. Pagesmith uses it to assemble your reordered, rotated and pruned pages into a new PDF.',
  'web worker':
    'A background thread in the browser. Heavy work (like writing a big PDF) runs here so the page never freezes.',
  'thumbnail':
    'A small preview image of a page, rendered locally so you can see what you are rearranging.',
  csp: 'Content Security Policy — a browser rule set that Pagesmith uses to forbid the page from making any network connection, so your documents cannot be uploaded even by accident.',
  metadata:
    'Extra data stored inside a document, such as the author name or the software that created it. Pagesmith rewrites this when it saves, but does not deeply scrub every field.',
  'service worker':
    'A special worker that caches the app so it keeps working with no internet connection after the first visit.',
  encryption:
    'Password-protection applied to a PDF. Pagesmith can open many protected PDFs to read them, but cannot open ones that require a password to decrypt.',
};

let tooltipEl: HTMLDivElement | null = null;

function ensureTooltip(): HTMLDivElement {
  if (tooltipEl) return tooltipEl;
  const el = document.createElement('div');
  el.className = 'glossary-tooltip';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  document.body.appendChild(el);
  tooltipEl = el;
  return el;
}

function hide() {
  if (tooltipEl) tooltipEl.hidden = true;
}

/** Wire up click-to-define behaviour for any `.glossary-link[data-term]` span. */
export function initGlossary(): void {
  const tip = ensureTooltip();

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLElement>('.glossary-link[data-term]');
    if (!link) {
      if (!target.closest('.glossary-tooltip')) hide();
      return;
    }
    e.preventDefault();
    const term = (link.dataset.term ?? '').toLowerCase();
    const def = GLOSSARY[term];
    if (!def) return;
    tip.textContent = def;
    tip.hidden = false;
    const r = link.getBoundingClientRect();
    const top = r.bottom + window.scrollY + 8;
    const left = Math.min(
      r.left + window.scrollX,
      window.scrollX + document.documentElement.clientWidth - tip.offsetWidth - 12,
    );
    tip.style.top = `${top}px`;
    tip.style.left = `${Math.max(12, left)}px`;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
  window.addEventListener('scroll', hide, { passive: true });
}

/** Build a glossary link span as an HTML string. */
export function gloss(term: string, label?: string): string {
  const key = term.toLowerCase();
  return `<span class="glossary-link" data-term="${key}" tabindex="0" role="button">${label ?? term}</span>`;
}
