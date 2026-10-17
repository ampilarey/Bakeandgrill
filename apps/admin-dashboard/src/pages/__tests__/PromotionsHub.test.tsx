import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ElsewhereNote } from '../PromotionsHub';

/*
 * Owner, 2026-10-17: "all of this are managed in one place?" Promotions says
 * where the other money-off pages live, naming only the ones the reader opens.
 */
describe('Promotions: the pages kept elsewhere', () => {
  it('links Daily Specials, Loyalty points and Referrals', () => {
    render(<MemoryRouter><ElsewhereNote can={() => true} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Daily Specials' }).getAttribute('href')).toBe('/specials');
    expect(screen.getByRole('link', { name: 'Loyalty points' }).getAttribute('href')).toBe('/loyalty');
    expect(screen.getByRole('link', { name: 'Referrals' }).getAttribute('href')).toBe('/customers/referrals');
    expect(screen.getByTestId('promotions-elsewhere').textContent).toContain('Controls says which wins');
  });

  it('names only what the reader can open', () => {
    render(<MemoryRouter><ElsewhereNote can={(p) => p === 'loyalty.manage'} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Loyalty points' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Daily Specials' })).toBeNull();
    expect(screen.getByTestId('promotions-elsewhere').textContent).not.toContain('Controls');
  });
});
