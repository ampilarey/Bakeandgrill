import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrderingControlTabs } from '../components/OrderingControlTabs';
import { HubContext } from '../components/hubContext';

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
      'Online', 'Features', 'Fees & slots', 'Pre-order', 'Delivery',
    ]);
  });

  it.each([
    ['/settings/ordering', 'Online'],
    ['/settings/ordering?section=features', 'Features'],
    ['/settings/ordering?section=slots-fees', 'Fees & slots'],
    ['/settings/ordering?section=pickup', 'Fees & slots'],
    ['/settings/ordering?section=fees', 'Fees & slots'],
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

  // Nav audit, 2026-10-16: inside Settings the hub already has a Delivery tab.
  describe('inside the Settings hub', () => {
    function renderInHub(url: string) {
      return render(
        <MemoryRouter initialEntries={[url]}>
          <HubContext.Provider value={true}>
            <OrderingControlTabs />
          </HubContext.Provider>
        </MemoryRouter>,
      );
    }

    it('keeps the ordering sections and drops the second Delivery', () => {
      renderInHub('/settings/ordering?section=features');
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
        'Online', 'Features', 'Fees & slots', 'Pre-order',
      ]);
    });

    it('shows no inner row on the Delivery tab', () => {
      const { container } = renderInHub('/settings/delivery');
      expect(container.querySelector('.oc-tabbar')).toBeNull();
    });
  });
});
