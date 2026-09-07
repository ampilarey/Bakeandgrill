import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import type { StaffUser } from '../api';

/*
 * Owner, 2026-09-07, from a phone: the four header icons crowd the page title
 * down to a few letters. On a narrow phone the theme and sound toggles leave
 * the header (CSS hides them under 430px) and live in the section sheet
 * beside Log Out, so they are still one tap away.
 */

vi.mock('../api', () => ({
  fetchLowStockItems: vi.fn().mockResolvedValue({ data: [] }),
}));

const owner: StaffUser = { id: 1, name: 'Owner', email: 'o@test.com', role: 'owner', permissions: [] };

function renderMobile() {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
  window.dispatchEvent(new Event('resize'));
  return render(
    <MemoryRouter initialEntries={['/orders']}>
      <AppShell user={owner} onLogout={() => {}}>
        <div>Page</div>
      </AppShell>
    </MemoryRouter>,
  );
}

describe('Mobile section sheet preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('offers the theme and sound toggles in the sheet, and the theme one works', () => {
    renderMobile();
    fireEvent.click(screen.getByLabelText('Monitor'));

    // Inside the sheet — the header keeps its own copies for wider phones.
    const sheet = within(screen.getByRole('dialog', { name: /Monitor pages/i }));
    const dark = sheet.getByRole('button', { name: 'Dark mode' });
    expect(sheet.getByRole('button', { name: /Sound alerts/ })).toBeInTheDocument();

    fireEvent.click(dark);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(sheet.getByRole('button', { name: 'Light mode' })).toBeInTheDocument();
  });

  it('marks the header theme and sound buttons as secondary so a narrow header can hide them', () => {
    renderMobile();
    const header = document.querySelector('header')!;
    expect(header.querySelectorAll('.admin-shell-icon-btn--secondary')).toHaveLength(2);
    // The bell never leaves the header.
    expect(header.querySelector('button[aria-label="Notifications"]')).not.toHaveClass('admin-shell-icon-btn--secondary');
  });
});
