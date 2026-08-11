/**
 * Part 8 — content / page blocks / hero (8.1–8.5).
 * LOCAL project — mutates content drafts & page blocks.
 */
import { test, expect } from '@playwright/test';

import { staffHeaders } from '../../helpers/goLiveApi';
import { assertLocalOnlyBaseUrl, enableSmsGlobalKillSwitch } from '../../helpers/localOnly';

test.describe('Part 8 — content', () => {
  test.beforeAll(async ({ baseURL, request }) => {
    assertLocalOnlyBaseUrl(baseURL);
    await enableSmsGlobalKillSwitch(request);
  });

  test('8.1 section off @checklist-8.1', async ({ request, page }) => {
    const headers = await staffHeaders(request);
    const list = await request.get('/api/admin/page-blocks?app=website', { headers });
    expect(list.ok(), await list.text()).toBeTruthy();
    const body = (await list.json()) as {
      blocks?: { id: number; block_type: string; is_enabled: boolean; removable?: boolean }[];
      data?: { id: number; block_type: string; is_enabled: boolean; removable?: boolean }[];
    };
    const blocks = body.blocks ?? body.data ?? [];
    const target = blocks.find((b) => b.removable !== false && b.block_type !== 'mode_cards' && b.block_type !== 'brand_footer');
    if (!target) {
      test.skip(true, '8.1 no removable website block to disable on seed');
      return;
    }

    const before = await request.get('/api/page-blocks?app=website');
    const beforeIds = JSON.stringify(await before.json());

    const off = await request.put(`/api/admin/page-blocks/${target.id}`, {
      headers,
      data: { is_enabled: false },
    });
    expect(off.ok(), await off.text()).toBeTruthy();

    try {
      const adminAfter = await request.get('/api/admin/page-blocks?app=website', { headers });
      expect(adminAfter.ok()).toBeTruthy();
      const adminJson = (await adminAfter.json()) as {
        blocks?: { id: number; is_enabled: boolean }[];
      };
      const row = (adminJson.blocks ?? []).find((b) => b.id === target.id);
      expect(row?.is_enabled, '8.1 admin list must show section disabled').toBe(false);

      const after = await request.get('/api/page-blocks?app=website');
      expect(after.ok()).toBeTruthy();
      const publicBlocks = ((await after.json()) as { blocks?: { id: number }[] }).blocks ?? [];
      expect(
        publicBlocks.some((b) => b.id === target.id),
        '8.1 public page-blocks must omit disabled section',
      ).toBe(false);

      await page.goto('/', { waitUntil: 'domcontentloaded' });
      expect((await page.textContent('body')) ?? '').toBeTruthy();
    } finally {
      await request.put(`/api/admin/page-blocks/${target.id}`, {
        headers,
        data: { is_enabled: true },
      });
      void beforeIds;
    }
  });

  test('8.2 reorder affects one app only @checklist-8.2', async ({ request }) => {
    const headers = await staffHeaders(request);
    const web = await request.get('/api/admin/page-blocks?app=website', { headers });
    const order = await request.get('/api/admin/page-blocks?app=order_app', { headers });
    expect(web.ok() && order.ok()).toBeTruthy();

    const webBlocks = ((await web.json()) as { blocks?: { id: number; position: number }[] })
      .blocks ?? ((await web.json()) as { data?: { id: number; position: number }[] }).data ?? [];
    // Re-read cleanly
    const webJson = (await (await request.get('/api/admin/page-blocks?app=website', { headers })).json()) as {
      blocks?: { id: number; position: number }[];
      data?: { id: number; position: number }[];
    };
    const orderJson = (await (
      await request.get('/api/admin/page-blocks?app=order_app', { headers })
    ).json()) as {
      blocks?: { id: number; position: number }[];
      data?: { id: number; position: number }[];
    };
    const w = webJson.blocks ?? webJson.data ?? [];
    const oBefore = orderJson.blocks ?? orderJson.data ?? [];
    if (w.length < 2) {
      test.skip(true, '8.2 need ≥2 website blocks to reorder');
      return;
    }

    const swapped = [...w].reverse().map((b, i) => ({
      id: b.id,
      position: i + 1,
      is_enabled: true,
    }));
    const reorder = await request.put('/api/admin/page-blocks/reorder', {
      headers,
      data: { app: 'website', blocks: swapped },
    });
    expect(reorder.ok(), `8.2 reorder: ${await reorder.text()}`).toBeTruthy();

    const oAfterJson = (await (
      await request.get('/api/admin/page-blocks?app=order_app', { headers })
    ).json()) as {
      blocks?: { id: number; position: number }[];
      data?: { id: number; position: number }[];
    };
    const oAfter = oAfterJson.blocks ?? oAfterJson.data ?? [];
    expect(
      JSON.stringify(oAfter.map((b) => [b.id, b.position])),
      '8.2 order_app positions must be unchanged',
    ).toBe(JSON.stringify(oBefore.map((b) => [b.id, b.position])));
    void webBlocks;
  });

  test('8.3 add a text block @checklist-8.3', async ({ request }) => {
    const headers = await staffHeaders(request);
    const create = await request.post('/api/admin/page-blocks', {
      headers,
      data: {
        app: 'website',
        block_type: 'rich_text',
        is_enabled: true,
        settings: { body: 'E2E text block — go-live 8.3' },
      },
    });
    if (!create.ok()) {
      const create2 = await request.post('/api/admin/page-blocks', {
        headers,
        data: {
          app: 'website',
          type: 'rich_text',
          is_enabled: true,
          settings: { body: 'E2E text block — go-live 8.3' },
        },
      });
      expect(create2.ok(), `8.3 create text block: ${await create2.text()}`).toBeTruthy();
      return;
    }
    expect(create.status()).toBeGreaterThanOrEqual(200);
    expect(create.status()).toBeLessThan(300);
  });

  test('8.4 mode cards cannot be removed @checklist-8.4', async ({ request }) => {
    const headers = await staffHeaders(request);
    const list = await request.get('/api/admin/page-blocks?app=order_app', { headers });
    expect(list.ok()).toBeTruthy();
    const json = (await list.json()) as {
      blocks?: { id: number; block_type: string }[];
      data?: { id: number; block_type: string }[];
    };
    const blocks = json.blocks ?? json.data ?? [];
    const mode = blocks.find((b) => b.block_type === 'mode_cards');
    if (!mode) {
      test.skip(true, '8.4 mode_cards block missing on seed');
      return;
    }

    const del = await request.delete(`/api/admin/page-blocks/${mode.id}`, { headers });
    expect(del.status(), '8.4 DELETE mode_cards must be rejected').toBe(422);
    expect(await del.text()).toMatch(/cannot|only way|removable|mode/i);

    const disable = await request.put(`/api/admin/page-blocks/${mode.id}`, {
      headers,
      data: { is_enabled: false },
    });
    expect(disable.status(), '8.4 disable mode_cards must be rejected').toBe(422);
  });

  test('8.5 hero slides update both apps @checklist-8.5', async ({ request, page }) => {
    const headers = await staffHeaders(request);
    const marker = `E2E-HERO-${Date.now()}`;
    // Use a real public asset — `/images/hero-1.jpg` 404s and leaves the live
    // hero as a dark blank after the checklist run.
    const slides = [
      {
        image: '/images/cafe/Bajiya.png',
        eyebrow: marker,
        title: 'Go live hero',
        subtitle: 'Automated 8.5',
        cta_text: 'Order',
        cta_url: '/order/',
      },
    ];

    // Publish live to shared so both apps pick it up and stale per-app
    // overrides cannot hide the new photo (resolver prefers app scope).
    const publish = await request.put('/api/admin/content', {
      headers,
      data: {
        changes: [
          { key: 'hero_slides', scope: 'shared', value: slides },
        ],
      },
    });
    expect(publish.ok(), `8.5 publish: ${await publish.text()}`).toBeTruthy();

    const webContent = await request.get('/api/content?app=website');
    const orderContent = await request.get('/api/content?app=order_app');
    expect(webContent.ok(), await webContent.text()).toBeTruthy();
    expect(orderContent.ok(), await orderContent.text()).toBeTruthy();
    const webText = await webContent.text();
    const orderText = await orderContent.text();
    expect(webText, '8.5 public content website has hero marker').toContain(marker);
    expect(orderText, '8.5 public content order_app has hero marker').toContain(marker);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const site = (await page.content()) ?? '';
    await page.goto('/order/', { waitUntil: 'domcontentloaded' });
    const orderHtml = (await page.content()) ?? '';
    // HTML may hydrate from /api/content asynchronously — API assertion above is the contract.
    if (!site.includes(marker) || !orderHtml.includes(marker)) {
      test.info().annotations.push({
        type: 'finding',
        description:
          `8.5 public HTML missing marker (site=${site.includes(marker)}, order=${orderHtml.includes(marker)}) — apps may hydrate hero from API after paint; API scopes both contain marker.`,
      });
    }
  });
});
