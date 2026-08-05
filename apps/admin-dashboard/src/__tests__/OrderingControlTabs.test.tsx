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
    renderAt('/online-ordering');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Online', 'Features', 'Slots', 'Pre-order', 'Delivery',
    ]);
  });

  it.each([
    ['/online-ordering', 'Online'],
    ['/online-ordering?section=features', 'Features'],
    ['/online-ordering?section=slots-fees', 'Slots'],
    ['/online-ordering?section=pickup', 'Slots'],
    ['/online-ordering?section=fees', 'Slots'],
    ['/online-ordering?section=events', 'Pre-order'],
    ['/online-ordering?section=gates', 'Online'],
    ['/delivery-settings', 'Delivery'],
  ])('marks the right tab active for %s', (url, expected) => {
    renderAt(url);
    const active = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toBe(expected);
  });

  it('uses the scrollable single-row tab bar class', () => {
    const { container } = renderAt('/online-ordering');
    expect(container.querySelector('.oc-tabbar')).not.toBeNull();
  });
});
