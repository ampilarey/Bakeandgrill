import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Layout } from '../components/Layout';
import type { StaffUser } from '../api';

vi.mock('../api', () => ({
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
}));

const owner: StaffUser = {
  id: 1,
  name: 'Owner',
  email: 'o@test.com',
  role: 'owner',
  permissions: [],
};

function mockDesktopWidth() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
  window.dispatchEvent(new Event('resize'));
}

function groupHeader(label: string) {
  const headers = screen.getAllByRole('button').filter((btn) =>
    btn.classList.contains('admin-nav-group-header') &&
    btn.querySelector('.admin-nav-group-label')?.textContent === label,
  );
  return headers[0] ?? null;
}

function isGroupOpen(label: string): boolean {
  const header = groupHeader(label);
  if (!header) return false;
  return !header.querySelector('.admin-nav-group-chevron--closed');
}

function renderLayout(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout user={owner} onLogout={() => {}}>
        <div>Page</div>
      </Layout>
    </MemoryRouter>,
  );
}

describe('Layout desktop sidebar groups', () => {
  beforeEach(() => {
    mockDesktopWidth();
    localStorage.clear();
    localStorage.setItem('bg_nav_open_groups', JSON.stringify(['monitor', 'customers-marketing']));
  });

  it('collapses an open group containing the active route when the header is clicked', () => {
    renderLayout('/delivery');
    expect(isGroupOpen('Monitor')).toBe(true);

    fireEvent.click(groupHeader('Monitor')!);
    expect(isGroupOpen('Monitor')).toBe(false);

    // Effect must not immediately re-open on the same route
    expect(isGroupOpen('Monitor')).toBe(false);
  });

  it('does not mark Monitor active on /delivery-settings', () => {
    renderLayout('/delivery-settings');
    const monitorHeader = groupHeader('Monitor');
    expect(monitorHeader).toBeTruthy();
    expect(monitorHeader!.classList.contains('admin-nav-group-header--active')).toBe(false);
  });

  it('auto-opens the group for the current route after navigation', () => {
    localStorage.setItem('bg_nav_open_groups', JSON.stringify(['monitor', 'customers-marketing']));

    function LayoutAt({ path }: { path: string }) {
      return (
        <MemoryRouter initialEntries={[path]} key={path}>
          <Layout user={owner} onLogout={() => {}}>
            <div>Page</div>
          </Layout>
        </MemoryRouter>
      );
    }

    const { rerender } = render(<LayoutAt path="/dashboard" />);
    expect(isGroupOpen('Analyze')).toBe(false);

    rerender(<LayoutAt path="/reports" />);
    expect(isGroupOpen('Analyze')).toBe(true);
  });

  it('persists manual desktop collapse across re-render and remount', () => {
    const { rerender, unmount } = renderLayout('/dashboard');

    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    expect(screen.getByLabelText('Expand sidebar')).toBeTruthy();
    expect(localStorage.getItem('bg_sidebar_collapsed')).toBe('true');

    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Layout user={owner} onLogout={() => {}}>
          <div>Page</div>
        </Layout>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Expand sidebar')).toBeTruthy();

    unmount();
    renderLayout('/dashboard');
    expect(screen.getByLabelText('Expand sidebar')).toBeTruthy();
  });
});
