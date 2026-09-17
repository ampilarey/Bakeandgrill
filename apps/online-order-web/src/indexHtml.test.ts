import { describe, it, expect } from 'vitest';
import html from '../index.html?raw';
import main from './main.tsx?raw';

/*
 * Audit, 2026-09-17. Two things the shell got wrong for a long time without
 * anything noticing: an inline script the page's own CSP refused (so the
 * service worker never installed), and the TEST hostname hardcoded as the
 * canonical of the production site.
 */
describe('index.html', () => {
  it('has no inline script the CSP would refuse — only src= and JSON-LD', () => {
    const inline = [...html.matchAll(/<script\b([^>]*)>/g)]
      .map((m) => m[1])
      .filter((attrs) => !/\bsrc=/.test(attrs) && !/application\/ld\+json/.test(attrs));
    expect(inline).toEqual([]);
  });

  it('never names the test site', () => {
    expect(html).not.toMatch(/test\.bakeandgrill\.mv/);
  });

  it('registers the service worker from the bundle instead', () => {
    expect(main).toMatch(/registerServiceWorker\(\)/);
  });
});
