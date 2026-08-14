import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScopeMismatchNotices } from '../components/ScopeMismatchNotices';

describe('ScopeMismatchNotices', () => {
  const rows = [
    {
      key: 'business_phone',
      label: 'Phone',
      message: 'Business record says 912 0011 · Website says 912 0022 · Order app says 912 0011',
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
    expect(screen.getByText(/912 0022/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sync|same|copy/i })).toBeNull();
  });

  it('can scope to a single key', () => {
    render(<ScopeMismatchNotices mismatches={rows} onlyKey="logo" />);
    expect(screen.getByTestId('scope-mismatch-logo')).toBeTruthy();
    expect(screen.queryByTestId('scope-mismatch-item-business_phone')).toBeNull();
  });

  it('collapses into a summary banner for Content Hub', () => {
    render(<ScopeMismatchNotices mismatches={rows} collapsible />);
    expect(screen.getByTestId('scope-mismatch-list').getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByText(/2 values differ from Business Details/)).toBeTruthy();
    expect(screen.queryByTestId('scope-mismatch-item-business_phone')).toBeNull();

    fireEvent.click(screen.getByTestId('scope-mismatch-toggle'));
    expect(screen.getByTestId('scope-mismatch-list').getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByTestId('scope-mismatch-item-business_phone')).toBeTruthy();
  });
});
