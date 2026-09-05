import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The menu request follows its own pagination, and says which menu it wants.
 *
 * Owner, 2026-09-05: an item was missing from the order app but present in a
 * private window. Signed in with a staff account, this app was served the
 * admin listing — paginated at 25 rather than 100 — and since it read only
 * `data`, it drew the first quarter of the menu and nothing said so. The
 * missing dish was 46th.
 *
 * Two things follow. The app has to declare that it is the customer menu
 * rather than let whoever is signed in decide, and it has to read past page
 * one — otherwise the same silent truncation returns on its own the day the
 * menu passes a hundred dishes.
 */

const request = vi.hoisted(() => vi.fn());

vi.mock('./client', async () => {
  const actual = await vi.importActual<typeof import('./client')>('./client');
  return { ...actual, request };
});

const { fetchItems } = await import('./menu');

function itemsPage(names: string[], lastPage: number) {
  return {
    data: names.map((name, i) => ({
      id: i + 1, name, base_price: '10.00', variants: [], packaging_options: [],
    })),
    last_page: lastPage,
  };
}

function queriesFor(calls: unknown[][]): URLSearchParams[] {
  return calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes('/items'))
    .map((u) => new URLSearchParams(u.split('?')[1] ?? ''));
}

beforeEach(() => {
  request.mockReset();
  localStorage.clear();
});

describe('the menu request', () => {
  it('asks for the customer menu, not whatever the signed-in user would get', async () => {
    request.mockResolvedValue(itemsPage(['Bondibai'], 1));

    await fetchItems('online_pickup');

    expect(queriesFor(request.mock.calls)[0].get('view')).toBe('customer');
  });

  it('carries the channel it was asked for', async () => {
    request.mockResolvedValue(itemsPage(['Bondibai'], 1));

    await fetchItems('online_pickup');

    expect(queriesFor(request.mock.calls)[0].get('channel')).toBe('online_pickup');
  });
});

describe('when the response is paginated', () => {
  it('reads every page, not just the first', async () => {
    // The owner's case: page one held 25 of 50 dishes, and the 46th was the
    // one nobody could find.
    request.mockImplementation((url: string) => {
      if (!url.includes('/items')) return Promise.resolve({ data: [] });
      const page = new URLSearchParams(url.split('?')[1]).get('page');
      return Promise.resolve(
        page === '2' ? itemsPage(['Valhomas (Hanakuri)'], 2) : itemsPage(['Bondibai'], 2),
      );
    });

    const res = await fetchItems('online_pickup');

    expect(res.data.map((i) => i.name)).toEqual(['Bondibai', 'Valhomas (Hanakuri)']);
  });

  it('asks for exactly the pages that exist', async () => {
    request.mockImplementation((url: string) => Promise.resolve(
      url.includes('/items') ? itemsPage(['Dish'], 3) : { data: [] },
    ));

    await fetchItems('online_pickup');

    const pages = queriesFor(request.mock.calls)
      .filter((q) => q.get('channel') === 'online_pickup')
      .map((q) => q.get('page'));
    expect(pages).toEqual(['1', '2', '3']);
  });

  it('stops after one page when there is only one', async () => {
    request.mockResolvedValue(itemsPage(['Bondibai'], 1));

    await fetchItems('online_pickup');

    const pages = queriesFor(request.mock.calls)
      .filter((q) => q.get('channel') === 'online_pickup');
    expect(pages).toHaveLength(1);
  });

  it('does not spin forever on a nonsense page count', async () => {
    // A broken or hostile last_page must not turn the menu into an endless
    // request loop on someone's phone.
    request.mockImplementation((url: string) => Promise.resolve(
      url.includes('/items') ? itemsPage(['Dish'], 999999) : { data: [] },
    ));

    await fetchItems('online_pickup');

    const pages = queriesFor(request.mock.calls)
      .filter((q) => q.get('channel') === 'online_pickup');
    expect(pages.length).toBeLessThanOrEqual(20);
  });

  it('copes with a response that omits last_page entirely', async () => {
    request.mockResolvedValue({ data: [{ id: 1, name: 'Bondibai', base_price: '10.00', variants: [] }] });

    const res = await fetchItems('online_pickup');

    expect(res.data.map((i) => i.name)).toEqual(['Bondibai']);
  });
});
