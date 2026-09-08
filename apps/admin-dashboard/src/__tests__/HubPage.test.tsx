import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { HubPage, hubGroups, hubPathTab, hubPermissions, type HubTab } from '../components/HubPage';
import { PageHeader, PageShell } from '../components/SharedUI';
import { NAV_GROUPS } from '../components/navConfig';
import { KITCHEN_HUB_PERMISSIONS } from '../pages/KitchenHub';
import { CUSTOMERS_HUB_PERMISSIONS } from '../pages/CustomersHub';
import { PROMOTIONS_HUB_PERMISSIONS } from '../pages/PromotionsHub';
import { FINANCE_HUB_PERMISSIONS } from '../pages/FinanceHub';
import { WHOLESALE_HUB_PERMISSIONS } from '../pages/WholesaleHub';

/*
 * Owner, 2026-09-08: "related tabs together and under same settings". Seven
 * hubs replaced thirty-odd sidebar entries. What matters, for all of them at
 * once: a tab shows only to the permission its old page carried, the URL
 * carries the tab, a bare hub path lands on the first tab the user can see,
 * old paths alias into the right tab, and a page rendered inside a hub
 * drops its own title but keeps its buttons.
 */

let granted: string[] = [];
vi.mock('../hooks/usePermissions', () => ({
  useCurrentUserPermissions: () => ({
    user: null,
    loading: false,
    can: (slug: string) => granted.includes(slug),
  }),
}));
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: () => {} }));

/** A page the way every real one is written: its own shell, its own header. */
function OldPage({ name }: { name: string }) {
  return (
    <PageShell>
      <PageHeader section="Somewhere" title={`${name} title`} subtitle="the old subtitle" action={<button>New {name}</button>} />
      <div data-testid={`tab-${name}`}>{name} content</div>
    </PageShell>
  );
}

const TABS: HubTab[] = [
  { id: 'one', label: 'One', permissions: ['a.view'], desc: 'The first', render: () => <OldPage name="one" /> },
  { id: 'two', label: 'Two', permissions: ['b.view'], desc: 'The second', render: () => <OldPage name="two" /> },
  { id: 'three', label: 'Three', permissions: ['a.view', 'c.view'], render: () => <OldPage name="three" /> },
];

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname}{search}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/hub/*" element={
          <>
            <HubPage base="/hub" section="Test" title="Hub" subtitle="fallback" tabs={TABS} aliases={{ old: 'two' }} />
            <LocationProbe />
          </>
        } />
      </Routes>
    </MemoryRouter>,
  );
}

const loc = () => screen.getByTestId('loc').textContent;

describe('A hub', () => {
  beforeEach(() => {
    granted = ['a.view', 'b.view'];
  });

  it('shows only the tabs the user may see, and reads the tab from the URL', async () => {
    renderAt('/hub/two');

    expect(await screen.findByTestId('tab-two')).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['One', 'Two', 'Three']);
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'true');
    // The hub's title and the tab's description, not the page's own.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hub');
    expect(screen.getByText('The second')).toBeInTheDocument();
    expect(screen.queryByText('two title')).toBeNull();
    // But the page's own button survives.
    expect(screen.getByRole('button', { name: 'New two' })).toBeInTheDocument();
    // On a real class, so the phone stylesheet can close the gap the empty
    // title used to leave above it.
    const leftover = screen.getByRole('button', { name: 'New two' }).closest('.page-header');
    expect(leftover).toHaveClass('page-header--embedded');
    // Nothing empty stacked above the button.
    expect(leftover?.children).toHaveLength(1);
  });

  it('hides a tab from someone without its permission', async () => {
    granted = ['a.view'];
    renderAt('/hub/one');

    await screen.findByTestId('tab-one');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['One', 'Three']);
  });

  it('lands a bare path on the first tab the user can see, keeping the query', async () => {
    granted = ['b.view'];
    renderAt('/hub?customer=5');

    await waitFor(() => expect(loc()).toBe('/hub/two?customer=5'));
    expect(screen.getByTestId('tab-two')).toBeInTheDocument();
  });

  it('sends a tab the user cannot see to one they can', async () => {
    granted = ['a.view'];
    renderAt('/hub/two');

    await waitFor(() => expect(loc()).toBe('/hub/one'));
  });

  it('aliases an old segment onto its new tab', async () => {
    renderAt('/hub/old?x=1');

    await waitFor(() => expect(loc()).toBe('/hub/two?x=1'));
  });

  it('switches tabs by URL when clicked', async () => {
    renderAt('/hub/one');

    await screen.findByTestId('tab-one');
    fireEvent.click(screen.getByRole('tab', { name: 'Three' }));
    await waitFor(() => expect(loc()).toBe('/hub/three'));
    expect(screen.getByTestId('tab-three')).toBeInTheDocument();
    // No description of its own, so the hub's subtitle stands in.
    expect(screen.getByText('fallback')).toBeInTheDocument();
  });

  it('draws no tab strip when only one tab is visible', async () => {
    granted = ['b.view'];
    renderAt('/hub/two');

    await screen.findByTestId('tab-two');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('reads the tab segment from nested paths too', () => {
    expect(hubPathTab('/wholesale', '/wholesale/deliveries/12')).toBe('deliveries');
    expect(hubPathTab('/wholesale', '/wholesale')).toBeNull();
    expect(hubPathTab('/finance', '/finance/expenses?x=1')).toBe('expenses');
    expect(hubPermissions(TABS)).toEqual(['a.view', 'b.view', 'c.view']);
  });

  it('marks itself as a hub so the phone stylesheet can trim its chrome', async () => {
    renderAt('/hub/one');

    await screen.findByTestId('tab-one');
    expect(document.querySelector('.hub-page')).toBeTruthy();
  });
});

/*
 * Grouped tabs. Kitchen has eleven, which on a 360px phone was one long
 * sideways scroll with nothing to say more existed off the right-hand edge.
 */
const GROUPED: HubTab[] = [
  { id: 'plan', group: 'Plan', label: 'Plan', permissions: [], render: () => <div data-testid="tab-plan">plan</div> },
  { id: 'holidays', group: 'Plan', label: 'Holidays', permissions: [], render: () => <div data-testid="tab-holidays">holidays</div> },
  { id: 'today', group: 'Handover', label: 'Today', permissions: [], render: () => <div data-testid="tab-today">today</div> },
  { id: 'batches', group: 'Handover', label: 'Batches', permissions: [], render: () => <div data-testid="tab-batches">batches</div> },
  { id: 'settings', group: 'Settings', label: 'Settings', permissions: ['manage'], render: () => <div data-testid="tab-settings">settings</div> },
];

function renderGrouped(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/hub/*" element={
          <>
            <HubPage base="/hub" section="Test" title="Hub" tabs={GROUPED} />
            <LocationProbe />
          </>
        } />
      </Routes>
    </MemoryRouter>,
  );
}

describe('A hub with grouped tabs', () => {
  beforeEach(() => {
    granted = ['manage'];
  });

  it('shows the groups above, and only the tabs of the group you are in', async () => {
    renderGrouped('/hub/plan');

    await screen.findByTestId('tab-plan');
    // Two short rows rather than one long one.
    expect(screen.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Handover' })).not.toHaveAttribute('aria-current');
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Plan', 'Holidays']);
    expect(screen.queryByRole('tab', { name: 'Batches' })).toBeNull();
  });

  it('opens a group on its first tab', async () => {
    renderGrouped('/hub/plan');

    await screen.findByTestId('tab-plan');
    fireEvent.click(screen.getByRole('button', { name: 'Handover' }));

    await waitFor(() => expect(loc()).toBe('/hub/today'));
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Today', 'Batches']);
  });

  it('draws no second row for a group of one', async () => {
    renderGrouped('/hub/settings');

    await screen.findByTestId('tab-settings');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('drops a group nobody in it may see', async () => {
    granted = [];
    renderGrouped('/hub/plan');

    await screen.findByTestId('tab-plan');
    expect(screen.getByRole('button', { name: 'Handover' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
  });

  it('groups the eleven Kitchen tabs into three short rows', async () => {
    const { kitchenTabs } = await import('../pages/KitchenHub');
    const tabs = kitchenTabs(true);

    expect(tabs).toHaveLength(11);
    expect(hubGroups(tabs)).toEqual(['Plan', 'Handover', 'Settings']);
    // Nothing ungrouped, and no row longer than six.
    expect(tabs.every((t) => !!t.group)).toBe(true);
    for (const g of hubGroups(tabs)) {
      expect(tabs.filter((t) => t.group === g).length).toBeLessThanOrEqual(6);
    }
  });
});

describe('The sidebar and the hubs agree on who may open what', () => {
  const navPermissions = (to: string): string[] => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === to);
    if (!item) throw new Error(`${to} is not in the sidebar`);
    return item.permissions ?? (item.permission ? [item.permission] : []);
  };

  it.each([
    ['/kitchen', KITCHEN_HUB_PERMISSIONS],
    ['/customers', CUSTOMERS_HUB_PERMISSIONS],
    ['/promotions', PROMOTIONS_HUB_PERMISSIONS],
    ['/finance', FINANCE_HUB_PERMISSIONS],
    ['/wholesale', WHOLESALE_HUB_PERMISSIONS],
  ])('%s', (to, hub) => {
    expect([...navPermissions(to)].sort()).toEqual([...hub].sort());
  });
});
