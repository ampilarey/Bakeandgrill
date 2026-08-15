import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScopeMismatchNotices } from '../components/ScopeMismatchNotices';

describe('ScopeMismatchNotices', () => {
  const rows = [
    {
      key: 'site_tagline',
      label: 'Site Tagline',
      message: 'Business record says Shared · Website says Web · Order app says Order',
    },
    {
      key: 'logo',
      label: 'Logo',
      message: 'Business record says /a.png · Website says /b.png · Order app says /c.png',
    },
  ];

  it('lists drift messages without a sync control', () => {
    render(<ScopeMismatchNotices mismatches={rows} />);
    expect(screen.getByTestId('scope-mismatch-list')).toBeTruthy();
    expect(screen.getByText(/Website says Web/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sync|same|copy/i })).toBeNull();
  });

  it('can scope to a single key', () => {
    render(<ScopeMismatchNotices mismatches={rows} onlyKey="logo" />);
    expect(screen.getByTestId('scope-mismatch-logo')).toBeTruthy();
    expect(screen.queryByTestId('scope-mismatch-item-site_tagline')).toBeNull();
  });

  it('collapses into a summary banner for Content Hub', () => {
    render(<ScopeMismatchNotices mismatches={rows} collapsible />);
    expect(screen.getByTestId('scope-mismatch-list').getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByText(/2 values differ from Business Details/)).toBeTruthy();
    expect(screen.queryByTestId('scope-mismatch-item-site_tagline')).toBeNull();

    fireEvent.click(screen.getByTestId('scope-mismatch-toggle'));
    expect(screen.getByTestId('scope-mismatch-list').getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByTestId('scope-mismatch-item-site_tagline')).toBeTruthy();
  });
});
