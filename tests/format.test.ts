import { describe, expect, it } from 'vitest';
import {
  baseName,
  clockStamp,
  deriveOutputName,
  formatBytes,
  normalizeRotation,
  sanitizeFilename,
} from '../src/format';

describe('formatBytes', () => {
  it('formats bytes below 1KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });
  it('scales up units', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3 GB');
  });
  it('handles invalid input', () => {
    expect(formatBytes(-5)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });
});

describe('normalizeRotation', () => {
  it('keeps canonical angles', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(270)).toBe(270);
  });
  it('wraps past 360', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });
  it('handles negatives', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-360)).toBe(0);
  });
  it('snaps near-angles to the nearest 90', () => {
    expect(normalizeRotation(89)).toBe(90);
    expect(normalizeRotation(46)).toBe(90);
  });
});

describe('baseName', () => {
  it('strips .pdf and path', () => {
    expect(baseName('report.pdf')).toBe('report');
    expect(baseName('/tmp/a/b/deck.PDF')).toBe('deck');
    expect(baseName('no-extension')).toBe('no-extension');
  });
});

describe('sanitizeFilename', () => {
  it('removes unsafe characters', () => {
    expect(sanitizeFilename('a/b\\c:d?e')).toBe('a b c d e');
  });
  it('falls back when empty', () => {
    expect(sanitizeFilename('///')).toBe('pagesmith');
    expect(sanitizeFilename('   ')).toBe('pagesmith');
  });
});

describe('deriveOutputName', () => {
  it('names a single edited doc', () => {
    expect(deriveOutputName(['contract.pdf'])).toBe('contract (edited).pdf');
  });
  it('marks a subset', () => {
    expect(deriveOutputName(['contract.pdf'], { subset: true })).toBe(
      'contract (pages).pdf',
    );
  });
  it('names a merge of many', () => {
    expect(deriveOutputName(['a.pdf', 'b.pdf', 'c.pdf'])).toBe('a +2 (merged).pdf');
  });
  it('handles an empty list', () => {
    expect(deriveOutputName([])).toBe('pagesmith.pdf');
  });
});

describe('clockStamp', () => {
  it('zero-pads a fixed time', () => {
    const d = new Date(2026, 6, 12, 4, 5, 9);
    expect(clockStamp(d)).toBe('04:05:09');
  });
});
