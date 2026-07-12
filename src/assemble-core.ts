import { PDFDocument, degrees } from 'pdf-lib';
import type { AssemblyRequest } from './types';

export type ProgressFn = (done: number, total: number) => void;

/**
 * Pure assembly: given source doc bytes and an ordered page manifest, produce a
 * new PDF. Runs in a worker in production, but has no worker/DOM dependency so
 * it can be unit-tested directly under Node/jsdom.
 */
export async function assembleCore(
  req: AssemblyRequest,
  onProgress?: ProgressFn,
): Promise<Uint8Array> {
  const total = req.pages.length;
  if (total === 0) throw new Error('No pages to export.');

  const out = await PDFDocument.create();
  out.setProducer('Pagesmith');
  out.setCreator('Pagesmith (pagesmith.benrichardson.dev)');

  const loaded = new Map<string, PDFDocument>();
  for (const doc of req.docs) {
    loaded.set(doc.id, await PDFDocument.load(doc.bytes, { ignoreEncryption: true }));
  }

  let done = 0;
  for (const page of req.pages) {
    const src = loaded.get(page.docId);
    if (!src) throw new Error('Missing source document for a page.');
    if (page.sourceIndex < 0 || page.sourceIndex >= src.getPageCount()) {
      throw new Error('Page index out of range in a source document.');
    }
    const [copied] = await out.copyPages(src, [page.sourceIndex]);
    if (page.rotation % 360 !== 0) {
      const existing = copied.getRotation().angle;
      copied.setRotation(degrees((existing + page.rotation) % 360));
    }
    out.addPage(copied);
    done++;
    onProgress?.(done, total);
  }

  return out.save();
}
