import { describe, it, expect, vi, afterEach } from 'vitest';
import { settleFixedBar } from './MobileTabBar';

describe('settleFixedBar', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('nudges the page and leaves the bar showing once nothing is being typed in', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const bar = document.createElement('nav');
    document.body.appendChild(bar);
    settleFixedBar(bar);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(bar.style.display).toBe('');
  });

  it('does nothing while a box still has the keyboard', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    settleFixedBar(null);
    expect(scroll).not.toHaveBeenCalled();
  });
});
