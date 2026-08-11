/**
 * Close any open owner shift (force if needed) and open a fresh one.
 * Used when count-attempt history on a reused shift would confuse assertions.
 */
import { expect, type APIRequestContext } from '@playwright/test';

import { staffHeaders } from './goLiveApi';

export async function freshOwnerShift(request: APIRequestContext): Promise<number> {
  const headers = await staffHeaders(request);
  const cur = await request.get('/api/shifts/current', { headers });
  if (cur.ok()) {
    const body = (await cur.json()) as { shift?: { id?: number } | null };
    const id = body.shift?.id;
    if (id) {
      const close = await request.post(`/api/shifts/${id}/close`, {
        headers,
        data: {
          cash_count_method: 'plain_total',
          closing_cash: 0,
          notes: 'E2E freshOwnerShift reset',
        },
      });
      if (!close.ok()) {
        const force = await request.post(`/api/shifts/${id}/force-close`, {
          headers,
          data: { notes: 'E2E freshOwnerShift reset' },
        });
        expect(force.ok(), `force-close: ${await force.text()}`).toBeTruthy();
      }
    }
  }
  const open = await request.post('/api/shifts/open', {
    headers,
    data: { opening_cash: 500 },
  });
  expect(open.ok(), `fresh open: ${await open.text()}`).toBeTruthy();
  return (await open.json() as { shift: { id: number } }).shift.id;
}
