import { afterEach, describe, expect, it } from 'vitest';
import { homeSeo, siteUrl, updatePageMetadata } from './metadata';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('page metadata during navigation', () => {
  it('indexes the homepage and clears home metadata on private routes', () => {
    document.head.innerHTML =
      '<meta name="robots" content="noindex, follow"><meta name="description" content="app">';
    updatePageMetadata('/');
    updatePageMetadata('/');
    expect(document.title).toBe(homeSeo.title);
    expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${siteUrl}/`);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    );
    updatePageMetadata('/admin/tournaments');
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, follow',
    );
  });
});
