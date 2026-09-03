import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrinterMonitor, offlineNames, type PrinterTarget } from './printers.js';

const printers: PrinterTarget[] = [
  { name: 'kitchen', host: '10.0.0.5', port: 9100 },
  { name: 'counter', host: '10.0.0.6', port: 9100 },
];

test('reports each printer by name only, unreachable ones flagged', async () => {
  const probe = async (host: string) => host === '10.0.0.5';
  const monitor = createPrinterMonitor(printers, { probe });

  const statuses = await monitor.statuses();
  assert.deepEqual(statuses, [
    { name: 'kitchen', reachable: true },
    { name: 'counter', reachable: false },
  ]);
  assert.deepEqual(offlineNames(statuses), ['counter']);
  assert.equal(JSON.stringify(statuses).includes('10.0.0'), false, 'hosts must not leak');
});

test('reuses the last probe inside the cache window and probes again after it', async () => {
  let calls = 0;
  let clock = 1_000;
  const probe = async () => { calls += 1; return true; };
  const monitor = createPrinterMonitor(printers, { probe, cacheMs: 30_000, now: () => clock });

  await monitor.statuses();
  await monitor.statuses();
  clock += 10_000;
  await monitor.statuses();
  assert.equal(calls, 2, 'two printers probed once');

  clock += 25_000;
  await monitor.statuses();
  assert.equal(calls, 4, 'probed again once the window passed');
});

test('concurrent callers share one probe', async () => {
  let calls = 0;
  let release: (() => void) | null = null;
  const probe = () => new Promise<boolean>((resolve) => { calls += 1; release = () => resolve(true); });
  const monitor = createPrinterMonitor([printers[0]], { probe });

  const a = monitor.statuses();
  const b = monitor.statuses();
  assert.equal(calls, 1);
  release!();
  const [ra, rb] = await Promise.all([a, b]);
  assert.deepEqual(ra, rb);
});

test('a probe that throws counts as unreachable', async () => {
  const probe = async () => { throw new Error('ECONNREFUSED'); };
  const monitor = createPrinterMonitor([printers[0]], { probe });
  assert.deepEqual(await monitor.statuses(), [{ name: 'kitchen', reachable: false }]);
});
