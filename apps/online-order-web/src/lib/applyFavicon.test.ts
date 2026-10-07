import { afterEach, describe, expect, it } from 'vitest';
import { applyFavicon } from './applyFavicon';

describe('applyFavicon', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
  });

  it('updates an existing icon link from settings.favicon', () => {
    const existing = document.createElement('link');
    existing.rel = 'icon';
    existing.href = '/order/favicon-32.png';
    document.head.appendChild(existing);

    applyFavicon('/storage/site/favicon.ico');

    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/storage/site/favicon.ico');
  });

  it('falls back to the flame favicon when favicon is unset', () => {
    applyFavicon(undefined);
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/order/favicon-32.png');

    applyFavicon('   ');
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')!.getAttribute('href')).toBe(
      '/order/favicon-32.png',
    );
  });

  it('updates every icon link, so the .ico cannot win over a custom favicon', () => {
    for (const [href, sizes] of [['/order/favicon.ico', '48x48'], ['/order/favicon-32.png', '32x32']]) {
      const l = document.createElement('link');
      l.rel = 'icon';
      l.href = href;
      l.setAttribute('sizes', sizes);
      document.head.appendChild(l);
    }

    applyFavicon('/storage/site/our-icon.png');

    const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/storage/site/our-icon.png', '/storage/site/our-icon.png']);
    expect(links.every((l) => !l.hasAttribute('sizes'))).toBe(true);
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
