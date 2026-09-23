/**
 * What the TV board needs to know about the page it is running in.
 *
 * Signage audit, 2026-09-23. The board reported a hand-typed `'2.1'` as its
 * build, so a deploy changed nothing on the TVs until somebody walked round
 * with a remote; and it booted inside the whole customer-app provider tree,
 * probing the customer session and fetching the order app's home layout
 * for a screen that will never show either.
 */

/** The placeholder Vite replaces at build time — a dev checkout still carries it. */
const UNSTAMPED = '__SW_BUILD_ID__';

/** True for the TV board routes, however the app is mounted. */
export function isSignagePath(pathname: string): boolean {
  return /^\/order\/tv(\/[^/]*)?\/?$/.test(pathname);
}

/**
 * The build this page was served from: the `app-build` meta stamped into
 * index.html, or null when there is no stamp (dev server, or an old shell).
 */
export function currentBuild(doc: Document | undefined = typeof document !== 'undefined' ? document : undefined): string | null {
  const content = doc?.querySelector('meta[name="app-build"]')?.getAttribute('content')?.trim() ?? '';
  if (content === '' || content === UNSTAMPED) return null;
  return content;
}

/**
 * Whether a board running `mine` should reload to pick up `server`. Either
 * side unknown means "leave it alone": a dev board never reloads, and a
 * server that cannot say what it serves cannot ask for one.
 */
export function boardNeedsReload(mine: string | null | undefined, server: string | null | undefined): boolean {
  if (!mine || !server) return false;
  return mine !== server;
}

/**
 * Reload the board into whatever the server is serving now.
 *
 * The service worker is asked to look for a new version first so the
 * navigation that follows is answered with the fresh shell rather than the
 * one it cached; a worker that has nothing new simply does nothing.
 */
export async function reloadBoard(win: Window = window): Promise<void> {
  try {
    const reg = await win.navigator.serviceWorker?.getRegistration?.('/order/');
    await reg?.update();
  } catch {
    /* no worker, or offline — the plain reload below still applies */
  }
  win.location.reload();
}
