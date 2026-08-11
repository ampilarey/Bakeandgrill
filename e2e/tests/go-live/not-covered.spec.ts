/**
 * Explicit skips for checklist rows that remain NOT COVERED — each names the blocker.
 * Owner can see these in the Playwright report as skipped-with-reason, not silent gaps.
 */
import { test } from '@playwright/test';

import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

test.describe('NOT COVERED — written reasons', () => {
  test.beforeAll(({ baseURL }) => {
    assertLocalOnlyBaseUrl(baseURL);
  });

  test('1.5 second order while first payment still open @checklist-1.5', async () => {
    test.skip(
      true,
      'Needs two live bank/card payment sessions to assert no crossed charges; no trustworthy local BML mock.',
    );
  });

  test('1.6 cash order increases physical drawer total @checklist-1.6', async () => {
    test.skip(
      true,
      'Requires observing a physical cash drawer float after a cash tender — not verifiable in software alone.',
    );
  });

  test('1.7 give change on a cash order @checklist-1.7', async () => {
    test.skip(
      true,
      'Requires physical change-making and counted drawer totals at the till.',
    );
  });

  test('1.8 part cash, part card @checklist-1.8', async () => {
    test.skip(
      true,
      'Requires a real card terminal tender alongside cash; no card sandbox in local e2e.',
    );
  });

  test('2.6 refund online card order @checklist-2.6', async () => {
    test.skip(
      true,
      'Card refund settlement and customer notification need bank/card + handset SMS.',
    );
  });

  test('6.7 admin reply closes case — customer SMS + receipt @checklist-6.7', async () => {
    test.skip(
      true,
      'Checklist requires the customer to receive the reply by SMS on a handset; receipt-only checks would under-verify.',
    );
  });
});
