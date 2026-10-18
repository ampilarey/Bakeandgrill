import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
const api = vi.hoisted(() => ({
  getPhoneStatus: vi.fn(),
  sendPhoneCode: vi.fn(),
  verifyPhoneCode: vi.fn(),
}));
vi.mock('../api', () => api);

import { VerifyNumberCard } from './VerifyNumberCard';

describe('VerifyNumberCard', () => {
  it('stays hidden for a verified number', async () => {
    api.getPhoneStatus.mockResolvedValue({ phone: '+9607912345', unverified: false, held_orders: 0, held_points: 0 });
    render(<VerifyNumberCard />);
    await waitFor(() => expect(api.getPhoneStatus).toHaveBeenCalled());
    expect(screen.queryByTestId('verify-number-card')).toBeNull();
  });

  it('texts a code, verifies it and says the points were added', async () => {
    api.getPhoneStatus.mockResolvedValue({ phone: '+9607912345', unverified: true, held_orders: 2, held_points: 40 });
    api.sendPhoneCode.mockResolvedValue({ unverified: true, message: 'sent' });
    api.verifyPhoneCode.mockResolvedValue({ unverified: false, points_added: 40, message: 'ok' });
    render(<VerifyNumberCard />);

    expect(await screen.findByTestId('verify-number-card')).toHaveTextContent('verifyNumber.body_points');
    fireEvent.click(screen.getByRole('button', { name: 'verifyNumber.send' }));
    const box = await screen.findByLabelText('verifyNumber.code');
    fireEvent.change(box, { target: { value: '12a3456' } });
    fireEvent.click(screen.getByRole('button', { name: 'verifyNumber.confirm' }));

    await waitFor(() => expect(api.verifyPhoneCode).toHaveBeenCalledWith('123456'));
    expect(await screen.findByTestId('verify-number-done')).toHaveTextContent('verifyNumber.done_points');
  });
});
