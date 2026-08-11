/**
 * Go-live checklist items that CANNOT be automated trustworthily.
 * Explicit skips so the owner sees "not covered" vs "passing".
 *
 * Checklist contract: docs/GO_LIVE_TEST_CHECKLIST.md
 */
import { test } from '@playwright/test';

import { assertLocalOnlyBaseUrl } from '../../helpers/localOnly';

test.beforeAll(({ baseURL }) => {
  assertLocalOnlyBaseUrl(baseURL);
});

test.describe('Part 0 — server-side (HUMAN ONLY)', () => {
  test('0.x server commands stay human @checklist-0', async () => {
    test.skip(
      true,
      'HUMAN ONLY: Part 0 is server-side ssh/artisan/cron work on sg-s2 — not an HTTP app journey.',
    );
  });
});

test.describe('Part 1 — real card / bank (HUMAN ONLY)', () => {
  test('1.1 real card payment @checklist-1.1', async () => {
    test.skip(true, 'HUMAN ONLY: requires a real BML card entry in the bank UI; no sandbox mock in Playwright.');
  });

  test('1.3 real bank redirect return path @checklist-1.3', async () => {
    test.skip(true, 'HUMAN ONLY: depends on a live BML redirect + return URL round-trip.');
  });

  test('1.4 real bank webhook / production signature path @checklist-1.4', async () => {
    test.skip(true, 'HUMAN ONLY: production webhook + BML_ENFORCE_SIGNATURE cannot be faked safely here.');
  });
});

test.describe('Part 5 — hardware (HUMAN ONLY)', () => {
  test('5.5 real printer @checklist-5.5', async () => {
    test.skip(true, 'HUMAN ONLY: needs a physical receipt printer / print-proxy device on the LAN.');
  });
});

test.describe('Part 9 — backups (HUMAN ONLY)', () => {
  test('9.1 backup restore on the server @checklist-9.1', async () => {
    test.skip(true, 'HUMAN ONLY: mysqldump/restore on sg-s2 — not an app UI path.');
  });
});

test.describe('Part 10 — real people / devices (HUMAN ONLY)', () => {
  test('10.1 real device @checklist-10.1', async () => {
    test.skip(true, 'HUMAN ONLY: real phone/tablet in a staff member\'s hands.');
  });

  test('10.2 real staff walkthrough @checklist-10.2', async () => {
    test.skip(true, 'HUMAN ONLY: observed staff rehearsal, not automatable.');
  });

  test('10.3 real stranger / mystery shopper @checklist-10.3', async () => {
    test.skip(true, 'HUMAN ONLY: unscripted stranger UX — automation would fake confidence.');
  });
});

test.describe('SMS handset delivery (HUMAN ONLY)', () => {
  test('real SMS arriving on a handset @checklist-sms-handset', async () => {
    test.skip(
      true,
      'HUMAN ONLY: local runs suppress SMS (kill switch + SMS_LIVE=false). Carrier delivery to a real phone must be checked by a human.',
    );
  });
});
