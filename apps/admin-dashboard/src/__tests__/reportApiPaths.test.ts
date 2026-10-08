import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLoyaltyReport, getPromotionReport } from '../api/finance';

// Reports → Customers → Loyalty and Promotions asked /api/reports/loyalty and
// /api/reports/promotions, which do not exist (both routes are under /admin),
// so the tabs only ever showed "could not be found" or a spinner.
describe('report API paths', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const stubFetch = (body: unknown) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const urlOf = (fetchMock: ReturnType<typeof stubFetch>) => String((fetchMock.mock.calls[0] as unknown[])[0]);

  it('loyalty asks the admin route', async () => {
    const fetchMock = stubFetch({ report: { total_accounts: 0 } });
    await getLoyaltyReport({ from: '2026-10-01', to: '2026-10-08' });
    expect(urlOf(fetchMock)).toContain('/admin/reports/loyalty?from=2026-10-01&to=2026-10-08');
  });

  it('promotions asks the admin route', async () => {
    const fetchMock = stubFetch({ report: [] });
    await getPromotionReport({ from: '2026-10-01', to: '2026-10-08' });
    expect(urlOf(fetchMock)).toContain('/admin/reports/promotions?from=2026-10-01&to=2026-10-08');
  });
});
