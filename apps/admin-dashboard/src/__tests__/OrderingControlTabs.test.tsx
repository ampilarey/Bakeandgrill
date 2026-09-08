import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrderingControlTabs } from '../components/OrderingControlTabs';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <OrderingControlTabs />
    </MemoryRouter>,
  );
}

describe('OrderingControlTabs', () => {
  it('renders one unified bar with all five sections', () => {
    renderAt('/settings/ordering');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Online', 'Features', 'Slots', 'Pre-order', 'Delivery',
    ]);
  });

  it.each([
    ['/settings/ordering', 'Online'],
    ['/settings/ordering?section=features', 'Features'],
    ['/settings/ordering?section=slots-fees', 'Slots'],
    ['/settings/ordering?section=pickup', 'Slots'],
    ['/settings/ordering?section=fees', 'Slots'],
    ['/settings/ordering?section=events', 'Pre-order'],
    ['/settings/ordering?section=gates', 'Online'],
    ['/settings/delivery', 'Delivery'],
  ])('marks the right tab active for %s', (url, expected) => {
    renderAt(url);
    const active = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe(expected);
  });

  it('uses the scrollable single-row tab bar class', () => {
    const { container } = renderAt('/settings/ordering');
    expect(container.querySelector('.oc-tabbar')).not.toBeNull();
  });
});
