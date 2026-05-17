import { describe, expect, it } from 'vitest';
import { normalizeBarcode } from '@/lib/products/barcode-lookup';
import { parseDataImageUrl } from '@/lib/products/visual-search';

describe('parseDataImageUrl', () => {
  it('parses a small webp data URL', () => {
    const pixel =
      'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA=';
    const parsed = parseDataImageUrl(pixel);
    expect(parsed).not.toBeNull();
    expect(parsed?.mimeType).toBe('image/webp');
    expect(parsed?.buffer.byteLength).toBeGreaterThan(0);
  });

  it('rejects invalid data URLs', () => {
    expect(parseDataImageUrl('https://example.com/x.jpg')).toBeNull();
    expect(parseDataImageUrl('data:text/plain,hello')).toBeNull();
  });
});

describe('normalizeBarcode', () => {
  it('strips non-digits and accepts valid lengths', () => {
    expect(normalizeBarcode('0 12345 67890 5')).toBe('012345678905');
  });

  it('rejects too short codes', () => {
    expect(normalizeBarcode('1234567')).toBeNull();
  });
});
