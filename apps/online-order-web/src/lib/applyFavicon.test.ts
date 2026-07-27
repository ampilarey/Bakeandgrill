import { afterEach, describe, expect, it } from 'vitest';
import { applyFavicon } from './applyFavicon';

describe('applyFavicon', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
  });

  it('updates an existing icon link from settings.favicon', () => {
    const existing = document.createElement('link');
    existing.rel = 'icon';
    existing.href = '/logo.png';
    document.head.appendChild(existing);

    applyFavicon('/storage/site/favicon.ico');

    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/storage/site/favicon.ico');
  });

  it('falls back to /logo.png when favicon is unset', () => {
    applyFavicon(undefined);
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/logo.png');

    applyFavicon('   ');
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!.getAttribute('href')).toBe(
      '/logo.png',
    );
  });

  it('creates a link element when none exists', () => {
    expect(document.head.querySelector('link[rel="icon"]')).toBeNull();
    applyFavicon('/custom-icon.png');
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).toBeTruthy();
    expect(link!.rel).toBe('icon');
    expect(link!.getAttribute('href')).toBe('/custom-icon.png');
  });
});
