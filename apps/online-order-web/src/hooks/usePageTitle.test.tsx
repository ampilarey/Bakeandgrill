import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { canonicalUrlFor, usePageTitle } from './usePageTitle';

vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettings: () => ({ site_name: 'Bake & Grill' }),
}));

function Page({ title }: { title: string | null }) {
  usePageTitle(title);
  return <p>page</p>;
}

/*
 * Audit, 2026-09-17: every page declared `https://test.bakeandgrill.mv/order/`
 * as its canonical — the test site, on production, and one URL for all of
 * them. The canonical is the page's own address now.
 */
describe('usePageTitle', () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[rel="canonical"], meta[property="og:url"]').forEach((el) => el.remove());
  });

  it('sets the title, the canonical and og:url to the page it is on, basename included', () => {
    render(
      <MemoryRouter basename="/order" initialEntries={['/order/menu/']}>
        <Routes><Route path="/menu" element={<Page title="Menu" />} /></Routes>
      </MemoryRouter>,
    );

    expect(document.title).toBe('Menu — Bake & Grill');
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe(`${window.location.origin}/order/menu`);
    expect(document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content).toBe(`${window.location.origin}/order/menu`);
  });

  it('reuses the tag already in the head rather than adding a second one', () => {
    const existing = document.createElement('link');
    existing.rel = 'canonical';
    existing.href = 'https://test.bakeandgrill.mv/order/';
    document.head.appendChild(existing);

    render(
      <MemoryRouter basename="/order" initialEntries={['/order/events']}>
        <Routes><Route path="/events" element={<Page title={null} />} /></Routes>
      </MemoryRouter>,
    );

    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(existing.getAttribute('href')).toBe(`${window.location.origin}/order/events`);
    expect(document.title).toBe('Bake & Grill');
  });

  it('keeps the root as a slash and drops trailing slashes elsewhere', () => {
    expect(canonicalUrlFor('https://bakeandgrill.mv', '/')).toBe('https://bakeandgrill.mv/');
    expect(canonicalUrlFor('https://bakeandgrill.mv', '/order/')).toBe('https://bakeandgrill.mv/order');
    expect(canonicalUrlFor('https://bakeandgrill.mv', '/order/menu')).toBe('https://bakeandgrill.mv/order/menu');
  });
});
