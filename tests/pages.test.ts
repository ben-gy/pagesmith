import { describe, expect, it } from 'vitest';
import type { PageItem } from '../src/types';
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
  selectedIds,
  setSelected,
} from '../src/pages';

function mk(
  id: string,
  docId = 'd1',
  sourceIndex = 0,
  extra: Partial<PageItem> = {},
): PageItem {
  return {
    id,
    docId,
    sourceIndex,
    rotation: 0,
    width: 100,
    height: 140,
    selected: false,
    label: `${docId} · p${sourceIndex + 1}`,
    ...extra,
  };
}

const ids = (list: PageItem[]) => list.map((p) => p.id).join(',');

describe('moveItems', () => {
  const list = [mk('a'), mk('b'), mk('c'), mk('d')];

  it('moves a single item before another', () => {
    const out = moveItems(list, new Set(['d']), 'b');
    expect(ids(out)).toBe('a,d,b,c');
  });
  it('appends when beforeId is null', () => {
    const out = moveItems(list, new Set(['a']), null);
    expect(ids(out)).toBe('b,c,d,a');
  });
  it('moves a multi-selection preserving relative order', () => {
    const out = moveItems(list, new Set(['a', 'c']), 'b');
    expect(ids(out)).toBe('a,c,b,d');
  });
  it('appends when dropping onto a member of the moving set', () => {
    const out = moveItems(list, new Set(['a', 'b']), 'a');
    expect(ids(out)).toBe('c,d,a,b');
  });
  it('returns a copy when nothing moves', () => {
    const out = moveItems(list, new Set(), 'b');
    expect(ids(out)).toBe('a,b,c,d');
    expect(out).not.toBe(list);
  });
  it('appends when beforeId is unknown', () => {
    const out = moveItems(list, new Set(['b']), 'zzz');
    expect(ids(out)).toBe('a,c,d,b');
  });
});

describe('selection', () => {
  it('setSelected toggles one page', () => {
    const list = [mk('a'), mk('b')];
    const out = setSelected(list, 'b', true);
    expect(out[1].selected).toBe(true);
    expect(out[0].selected).toBe(false);
  });
  it('selectAll sets everything', () => {
    const list = [mk('a'), mk('b', 'd1', 1)];
    expect(selectAll(list, true).every((p) => p.selected)).toBe(true);
    expect(selectAll(list, false).some((p) => p.selected)).toBe(false);
  });
  it('countSelected + selectedIds agree', () => {
    const list = selectAll([mk('a'), mk('b'), mk('c')], true);
    const partial = setSelected(list, 'b', false);
    expect(countSelected(partial)).toBe(2);
    expect(selectedIds(partial)).toEqual(new Set(['a', 'c']));
  });
});

describe('selectRange', () => {
  const list = [mk('a'), mk('b'), mk('c'), mk('d')];
  it('selects an inclusive forward range exclusively', () => {
    const out = selectRange(list, 'b', 'd', true);
    expect(out.filter((p) => p.selected).map((p) => p.id)).toEqual(['b', 'c', 'd']);
  });
  it('works backwards', () => {
    const out = selectRange(list, 'd', 'b', true);
    expect(out.filter((p) => p.selected).map((p) => p.id)).toEqual(['b', 'c', 'd']);
  });
  it('falls back to single select for unknown anchor', () => {
    const out = selectRange(list, 'zzz', 'c', true);
    expect(out.filter((p) => p.selected).map((p) => p.id)).toEqual(['c']);
  });
});

describe('rotation', () => {
  it('rotates only selected pages', () => {
    const list = [mk('a', 'd1', 0, { selected: true }), mk('b')];
    const out = rotateSelected(list, 90);
    expect(out[0].rotation).toBe(90);
    expect(out[1].rotation).toBe(0);
  });
  it('rotateOne wraps around', () => {
    const list = [mk('a', 'd1', 0, { rotation: 270 })];
    expect(rotateOne(list, 'a', 90)[0].rotation).toBe(0);
  });
});

describe('removeSelected', () => {
  it('drops selected pages', () => {
    const list = [mk('a', 'd1', 0, { selected: true }), mk('b'), mk('c', 'd1', 2, { selected: true })];
    expect(ids(removeSelected(list))).toBe('b');
  });
  it('no-ops with a copy when nothing selected', () => {
    const list = [mk('a'), mk('b')];
    const out = removeSelected(list);
    expect(ids(out)).toBe('a,b');
    expect(out).not.toBe(list);
  });
});

describe('buildAssembly', () => {
  it('exports all pages in order when none selected', () => {
    const list = [mk('a', 'd1', 0), mk('b', 'd2', 4, { rotation: 90 })];
    const asm = buildAssembly(list);
    expect(asm).toEqual([
      { docId: 'd1', sourceIndex: 0, rotation: 0 },
      { docId: 'd2', sourceIndex: 4, rotation: 90 },
    ]);
  });
  it('exports only the selected subset', () => {
    const list = [mk('a'), mk('b', 'd1', 1, { selected: true }), mk('c', 'd1', 2, { selected: true })];
    expect(buildAssembly(list)).toEqual([
      { docId: 'd1', sourceIndex: 1, rotation: 0 },
      { docId: 'd1', sourceIndex: 2, rotation: 0 },
    ]);
  });
  it('normalises rotation', () => {
    const list = [mk('a', 'd1', 0, { rotation: 450 })];
    expect(buildAssembly(list)[0].rotation).toBe(90);
  });
});

describe('docsInAssembly', () => {
  it('returns distinct doc ids in first-use order', () => {
    const list = [mk('a', 'd2'), mk('b', 'd1'), mk('c', 'd2')];
    expect(docsInAssembly(list)).toEqual(['d2', 'd1']);
  });
  it('reflects only the selected subset', () => {
    const list = [mk('a', 'd1'), mk('b', 'd2', 0, { selected: true })];
    expect(docsInAssembly(list)).toEqual(['d2']);
  });
});
