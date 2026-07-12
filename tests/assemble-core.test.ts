import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { assembleCore } from '../src/assemble-core';
import type { AssemblyRequest } from '../src/types';

/** Build a PDF whose page widths encode their identity, so order is checkable. */
async function makeDoc(widths: number[]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 400]);
  const bytes = await doc.save();
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

async function widthsOf(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => Math.round(p.getSize().width));
}

describe('assembleCore', () => {
  it('reorders pages across the requested manifest', async () => {
    const d1 = await makeDoc([100, 200, 300]);
    const req: AssemblyRequest = {
      docs: [{ id: 'd1', bytes: d1 }],
      pages: [
        { docId: 'd1', sourceIndex: 2, rotation: 0 },
        { docId: 'd1', sourceIndex: 0, rotation: 0 },
      ],
    };
    const out = await assembleCore(req);
    expect(await widthsOf(out)).toEqual([300, 100]);
  });

  it('merges two source documents in order', async () => {
    const d1 = await makeDoc([100]);
    const d2 = await makeDoc([250]);
    const req: AssemblyRequest = {
      docs: [
        { id: 'd1', bytes: d1 },
        { id: 'd2', bytes: d2 },
      ],
      pages: [
        { docId: 'd2', sourceIndex: 0, rotation: 0 },
        { docId: 'd1', sourceIndex: 0, rotation: 0 },
      ],
    };
    expect(await widthsOf(await assembleCore(req))).toEqual([250, 100]);
  });

  it('applies rotation to the copied page', async () => {
    const d1 = await makeDoc([100, 100]);
    const req: AssemblyRequest = {
      docs: [{ id: 'd1', bytes: d1 }],
      pages: [{ docId: 'd1', sourceIndex: 1, rotation: 90 }],
    };
    const out = await assembleCore(req);
    const doc = await PDFDocument.load(out);
    expect(doc.getPages()[0].getRotation().angle).toBe(90);
  });

  it('reports determinate progress for every page', async () => {
    const d1 = await makeDoc([100, 100, 100]);
    const req: AssemblyRequest = {
      docs: [{ id: 'd1', bytes: d1 }],
      pages: [0, 1, 2].map((i) => ({ docId: 'd1', sourceIndex: i, rotation: 0 })),
    };
    const seen: Array<[number, number]> = [];
    await assembleCore(req, (done, total) => seen.push([done, total]));
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('rejects an empty manifest', async () => {
    const req: AssemblyRequest = { docs: [], pages: [] };
    await expect(assembleCore(req)).rejects.toThrow(/No pages/);
  });

  it('rejects an out-of-range page index', async () => {
    const d1 = await makeDoc([100]);
    const req: AssemblyRequest = {
      docs: [{ id: 'd1', bytes: d1 }],
      pages: [{ docId: 'd1', sourceIndex: 5, rotation: 0 }],
    };
    await expect(assembleCore(req)).rejects.toThrow(/out of range/);
  });

  it('rejects a page referencing a missing document', async () => {
    const req: AssemblyRequest = {
      docs: [],
      pages: [{ docId: 'ghost', sourceIndex: 0, rotation: 0 }],
    };
    await expect(assembleCore(req)).rejects.toThrow(/Missing source/);
  });

  it('produces a valid, re-openable PDF', async () => {
    const d1 = await makeDoc([120, 340]);
    const out = await assembleCore({
      docs: [{ id: 'd1', bytes: d1 }],
      pages: [{ docId: 'd1', sourceIndex: 0, rotation: 0 }],
    });
    expect(out.slice(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]));
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
