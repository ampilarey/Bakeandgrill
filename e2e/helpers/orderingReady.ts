/**
 * Restore online ordering gates after specs that toggle them (4.6 / 4.7).
 */
import type { APIRequestContext } from '@playwright/test';

import { artisanTinker, staffHeaders } from './goLiveApi';

export async function ensureOrderingReady(request: APIRequestContext): Promise<void> {
  const headers = await staffHeaders(request);
  await request.post('/api/admin/ordering/toggle', {
    headers,
    data: { enabled: true },
  });
  for (const key of [
    'pickup_ordering',
    'delivery_ordering',
    'dine_in_preorder',
    'order_for_tomorrow',
    'tomorrow_pickup',
    'tomorrow_delivery',
    'tomorrow_dine_in',
  ]) {
    await request
      .put(`/api/admin/ordering/feature-gates/${key}`, {
        headers,
        data: { enabled: true },
      })
      .catch(() => null);
  }
}

/** Clear Laravel cache/rate-limiters between chatty public complaint posts. */
export function clearLocalRateLimiters(): void {
  artisanTinker(`
try { \\Illuminate\\Support\\Facades\\Redis::connection()->flushdb(); } catch (\\Throwable $e) {}
try { \\Illuminate\\Support\\Facades\\DB::table('cache')->delete(); } catch (\\Throwable $e) {}
try { \\Illuminate\\Support\\Facades\\DB::table('cache_locks')->delete(); } catch (\\Throwable $e) {}
\\Illuminate\\Support\\Facades\\Cache::flush();
echo 'ok';
`);
}
