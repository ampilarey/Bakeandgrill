import { describe, expect, it } from 'vitest';
import { printProxyLabel, printProxySub } from '../pages/SystemHealthPage';

/** The print card names the printer that is unplugged, not just "reachable". */
describe('print proxy card copy', () => {
  it('says which printers the proxy cannot reach', () => {
    expect(printProxyLabel('printers_offline', true, ['kitchen'])).toBe('1 printer offline');
    expect(printProxySub('printers_offline', ['kitchen'])).toBe('kitchen');
    expect(printProxyLabel('printers_offline', true, ['kitchen', 'counter'])).toBe('2 printers offline');
    expect(printProxySub('printers_offline', ['kitchen', 'counter'])).toBe('kitchen, counter');
  });

  it('keeps the old wording for the other states', () => {
    expect(printProxyLabel('ok', true)).toBe('Reachable');
    expect(printProxySub('ok')).toBe('proxy and printers answering');
    expect(printProxyLabel('unreachable', false)).toBe('Unreachable');
    expect(printProxySub('unreachable')).toBe('unreachable');
    expect(printProxyLabel('not_configured', null)).toBe('Not configured');
  });
});
