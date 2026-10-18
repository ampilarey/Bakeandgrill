import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshDhivehiFont, versionOf } from '@shared/utils/dhivehiFont';

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';

function page(href: string) {
  document.head.innerHTML = `<link rel="stylesheet" href="${href}">`;
}

describe('refreshDhivehiFont', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the version from the ETag, weak or not', () => {
    expect(versionOf(`W/"${SHA}"`, '')).toBe('abcdef012345');
    expect(versionOf(null, 'x')).toMatch(/^h[0-9a-f]+$/);
  });

  it('swaps a stale link for one carrying the sheet version, past the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('css', { headers: { ETag: `"${SHA}"` } }));
    vi.stubGlobal('fetch', fetchMock);
    page('/css/dhivehi-font.css?app=order_app');
    await refreshDhivehiFont();
    expect(fetchMock).toHaveBeenCalledWith('/css/dhivehi-font.css?app=order_app', expect.objectContaining({ cache: 'no-cache' }));
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    expect(links[links.length - 1].getAttribute('href')).toBe('/css/dhivehi-font.css?app=order_app&v=abcdef012345');
  });

  it('leaves a link that is already current alone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('css', { headers: { ETag: `"${SHA}"` } })));
    page('/css/dhivehi-font.css?app=website&v=abcdef012345');
    await refreshDhivehiFont();
    expect(document.querySelectorAll('link[rel="stylesheet"]').length).toBe(1);
  });
});
