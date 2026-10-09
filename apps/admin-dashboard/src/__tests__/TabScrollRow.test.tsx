import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabScrollRow } from '../components/SharedUI';

/*
 * Owner, 2026-10-09: "Still horizontal scrolling is there in many places."
 * A row of tabs used to scroll sideways on a phone, with fades and a chevron
 * for what sat off the edge. It wraps now (the CSS on .tab-scroll-row), and a
 * page's own overflowX on the row is dropped so none can bring the scroll back.
 */

describe('TabScrollRow', () => {
  it('drops a sideways scroll a page asks for, and keeps the rest of its style', () => {
    render(
      <TabScrollRow role="tablist" aria-label="Things" style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'nowrap', padding: 4 }}>
        <button role="tab" aria-selected>One</button>
        <button role="tab">Two</button>
      </TabScrollRow>,
    );
    const row = screen.getByRole('tablist', { name: 'Things' });
    expect(row).toHaveClass('tab-scroll-row');
    expect(row.style.overflowX).toBe('');
    expect(row.style.flexWrap).toBe('');
    expect(row.style.gap).toBe('4px');
    expect(row.style.padding).toBe('4px');
    // No fade cues any more: every tab is in sight.
    expect(row.parentElement).not.toHaveAttribute('data-fade-right');
  });

  it('keeps the row as wide as its tabs only when asked', () => {
    const { rerender } = render(<TabScrollRow aria-label="Row" fit><button>A</button></TabScrollRow>);
    expect(screen.getByLabelText('Row').parentElement).toHaveClass('tab-scroll-wrap--fit');
    rerender(<TabScrollRow aria-label="Row"><button>A</button></TabScrollRow>);
    expect(screen.getByLabelText('Row').parentElement).not.toHaveClass('tab-scroll-wrap--fit');
  });
});
