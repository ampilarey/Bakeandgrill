import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { clearAll, pushNotification } from '../utils/notifications';
import type { StaffUser } from '../api';

/*
 * Owner, 2026-09-07, from a phone: "There is problem with mobile view. Check
 * notifications. Not only this page."
 *
 * The panel was an absolutely-positioned child of the mobile header, which
 * carries `overflow-x: clip` so wide chrome cannot widen the document.
 * Chromium leaves the other axis visible; Safari and older Android browsers
 * clip both, which cut the panel off at the header's 56px edge — an 8px
 * sliver of its top border was all that showed, on every admin page.
 *
 * The invariant that keeps it safe in every browser: the panel is not inside
 * the header. Nothing an ancestor does to overflow can reach it.
 */

vi.mock('../api', () => ({
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
}));

const owner: StaffUser = { id: 1, name: 'Owner', email: 'o@test.com', role: 'owner', permissions: [] };

function renderShell(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
  return render(
    <MemoryRouter initialEntries={['/orders']}>
      <AppShell user={owner} onLogout={() => {}}>
        <div>Page</div>
      </AppShell>
    </MemoryRouter>,
  );
}

describe('Notifications panel', () => {
  beforeEach(() => {
    clearAll();
    localStorage.clear();
  });

  it('opens outside the mobile header, so a clipping ancestor cannot cut it off', () => {
    renderShell(390);
    fireEvent.click(screen.getByLabelText('Notifications'));

    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel).toBeInTheDocument();
    expect(panel.closest('header')).toBeNull();
    expect(panel.parentElement).toBe(document.body);
  });

  it('is placed within the viewport on a narrow phone', () => {
    renderShell(360);
    fireEvent.click(screen.getByLabelText('Notifications'));

    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    const left = parseFloat(panel.style.left);
    const width = parseFloat(panel.style.width);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + width).toBeLessThanOrEqual(360);
    // Below the bell, never behind it.
    expect(parseFloat(panel.style.top)).toBeGreaterThan(0);
  });

  it('stays open while its own controls are used, and closes on Escape', () => {
    pushNotification({ type: 'order', title: 'New order', body: 'Order 12 is in' });
    renderShell(390);
    fireEvent.click(screen.getByLabelText('Notifications'));

    expect(screen.getByText('New order')).toBeInTheDocument();

    // A click inside the panel is not an outside click, even though the panel
    // is no longer a DOM descendant of the bell.
    fireEvent.mouseDown(screen.getByText('Clear all'));
    fireEvent.click(screen.getByText('Clear all'));
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByText('No notifications yet')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('also opens outside the header on desktop', () => {
    renderShell(1280);
    fireEvent.click(screen.getByLabelText('Notifications'));

    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel.closest('header')).toBeNull();
    expect(panel.parentElement).toBe(document.body);
  });
});
