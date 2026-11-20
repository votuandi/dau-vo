import { describe, expect, it } from 'vitest';
import { checkWebsiteUrl, isSafeWebsiteUrl } from './website-url';

describe('checkWebsiteUrl', () => {
  it('treats a blank field as no link', () => {
    expect(checkWebsiteUrl('   ')).toEqual({ ok: true, value: null });
  });

  it.each([
    ['https://www.nhataitro.vn', 'https://www.nhataitro.vn'],
    ['http://shop.example.com/khuyen-mai?x=1#top', 'http://shop.example.com/khuyen-mai?x=1#top'],
    ['  nhataitro.vn/san-pham  ', 'https://nhataitro.vn/san-pham'],
    ['HTTPS://Example.COM', 'HTTPS://Example.COM'],
  ])('accepts %p', (input, value) => {
    expect(checkWebsiteUrl(input)).toEqual({ ok: true, value });
  });

  it.each([
    'javascript:alert(1)',
    'ftp://files.example.com',
    'mailto:a@example.com',
    'https://localhost',
    'https://example',
    'nha tai tro.vn',
    'https://user:pass@example.com',
    'https://',
    'https://-bad-.com',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('rejects %p', (input) => {
    expect(checkWebsiteUrl(input).ok).toBe(false);
  });
});

describe('isSafeWebsiteUrl', () => {
  it('only allows http and https links', () => {
    expect(isSafeWebsiteUrl('https://example.com')).toBe(true);
    expect(isSafeWebsiteUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeWebsiteUrl(null)).toBe(false);
  });
});
