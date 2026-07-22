// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { AssemblyPage, PageItem } from './types';
import { normalizeRotation } from './format';

/**
 * Move every item whose id is in `ids` so the block lands immediately before
 * the item with id `beforeId`. `beforeId === null` appends the block to the end.
 * Moved items keep their relative order. Pure — returns a new array.
 */
export function moveItems<T extends { id: string }>(
  list: T[],
  ids: Set<string>,
  beforeId: string | null,
): T[] {
  if (ids.size === 0) return list.slice();
  const moving = list.filter((x) => ids.has(x.id));
  const rest = list.filter((x) => !ids.has(x.id));
  if (beforeId === null || ids.has(beforeId)) {
    return [...rest, ...moving];
  }
  const idx = rest.findIndex((x) => x.id === beforeId);
  if (idx < 0) return [...rest, ...moving];
  return [...rest.slice(0, idx), ...moving, ...rest.slice(idx)];
}

/** Remove all selected items. If nothing is selected, returns the list unchanged. */
export function removeSelected(list: PageItem[]): PageItem[] {
  if (!list.some((p) => p.selected)) return list.slice();
  return list.filter((p) => !p.selected);
}

/** Rotate selected items by `delta` degrees (typically ±90). */
export function rotateSelected(list: PageItem[], delta: number): PageItem[] {
  return list.map((p) =>
    p.selected ? { ...p, rotation: normalizeRotation(p.rotation + delta) } : p,
  );
}

/** Rotate a single item by delta. */
export function rotateOne(list: PageItem[], id: string, delta: number): PageItem[] {
  return list.map((p) =>
    p.id === id ? { ...p, rotation: normalizeRotation(p.rotation + delta) } : p,
  );
}

export function setSelected(
  list: PageItem[],
  id: string,
  selected: boolean,
): PageItem[] {
  return list.map((p) => (p.id === id ? { ...p, selected } : p));
}

export function selectAll(list: PageItem[], selected: boolean): PageItem[] {
  return list.map((p) => ({ ...p, selected }));
}

/**
 * Range-select from the last anchor id to `id` (inclusive), like shift-click.
 * Everything in the contiguous index range is selected; other pages keep state
 * unless `exclusive` is true, in which case they are cleared first.
 */
export function selectRange(
  list: PageItem[],
  anchorId: string,
  id: string,
  exclusive = true,
): PageItem[] {
  const a = list.findIndex((p) => p.id === anchorId);
  const b = list.findIndex((p) => p.id === id);
  if (a < 0 || b < 0) return setSelected(list, id, true);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return list.map((p, i) => {
    const inRange = i >= lo && i <= hi;
    if (inRange) return { ...p, selected: true };
    return exclusive ? { ...p, selected: false } : p;
  });
}

export function selectedIds(list: PageItem[]): Set<string> {
  return new Set(list.filter((p) => p.selected).map((p) => p.id));
}

export function countSelected(list: PageItem[]): number {
  let n = 0;
  for (const p of list) if (p.selected) n++;
  return n;
}

/**
 * Build the assembly manifest. If any page is selected, only selected pages are
 * exported (this is how "extract / split" works); otherwise all pages export.
 * Order always follows the list order.
 */
export function buildAssembly(list: PageItem[]): AssemblyPage[] {
  const anySelected = list.some((p) => p.selected);
  const chosen = anySelected ? list.filter((p) => p.selected) : list;
  return chosen.map((p) => ({
    docId: p.docId,
    sourceIndex: p.sourceIndex,
    rotation: normalizeRotation(p.rotation),
  }));
}

/** Distinct source doc ids referenced by the pages that will be exported. */
export function docsInAssembly(list: PageItem[]): string[] {
  const pages = buildAssembly(list);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pages) {
    if (!seen.has(p.docId)) {
      seen.add(p.docId);
      out.push(p.docId);
    }
  }
  return out;
}
