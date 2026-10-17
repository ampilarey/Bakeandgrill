import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ sendEmailCheckCode: vi.fn(), verifyEmailCheckCode: vi.fn() }));
vi.mock('../../api', () => api);

import { EmailCheck } from './EmailCheck';
import { LanguageProvider } from '../../context/LanguageContext';

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/* Prove the account's email with a 6-digit code (iruali import plan, feature 2). */
describe('EmailCheck', () => {
  beforeEach(() => vi.clearAllMocks());

  it('says Checked once the email is proven', () => {
    wrap(<EmailCheck email="a@b.mv" verified onVerified={() => {}} />);
    expect(screen.getByTestId('email-check-done').textContent).toContain('Checked');
  });

  it('sends a code, takes six digits and marks the email checked', async () => {
    api.sendEmailCheckCode.mockResolvedValue({ email_verified: false, sent_to: 'a@b.mv', message: '' });
    api.verifyEmailCheckCode.mockResolvedValue({ email_verified: true, message: '' });
    const onVerified = vi.fn();
    wrap(<EmailCheck email="a@b.mv" verified={false} onVerified={onVerified} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    const box = await screen.findByLabelText('6-digit code');
    expect(screen.getByText('We sent a code to a@b.mv.')).toBeTruthy();
    fireEvent.change(box, { target: { value: '12 34ab56' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));

    await waitFor(() => expect(onVerified).toHaveBeenCalled());
    expect(api.verifyEmailCheckCode).toHaveBeenCalledWith('123456');
  });
});
