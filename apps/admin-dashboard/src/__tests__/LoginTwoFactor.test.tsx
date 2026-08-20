import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The second step of an admin sign-in.
 *
 * The failure that matters here is silent: if the page treats the challenge
 * response as a successful login, `onLogin` is called with `res.user` — which
 * is undefined — and the app tries to boot a session that does not exist. The
 * user sees a broken dashboard rather than a code prompt, and nothing throws.
 */

const phoneLogin = vi.fn();
const pinLogin = vi.fn();
const twoFactorChallenge = vi.fn();

vi.mock('../api', () => ({
  phoneLogin: (...a: unknown[]) => phoneLogin(...a),
  pinLogin: (...a: unknown[]) => pinLogin(...a),
  twoFactorChallenge: (...a: unknown[]) => twoFactorChallenge(...a),
  staffPasswordResetRequest: vi.fn(),
  staffPasswordResetVerify: vi.fn(),
  needsTwoFactor: (r: { two_factor_required?: boolean }) => r.two_factor_required === true,
}));

// Imported after the mock so the page picks it up.
const { LoginPage } = await import('../pages/LoginPage');

const USER = { id: 1, name: 'Owner', role: 'owner', permissions: [] };

function renderLogin(onLogin = vi.fn()) {
  render(
    <MemoryRouter>
      <LoginPage onLogin={onLogin} />
    </MemoryRouter>,
  );
  return onLogin;
}

const type = (el: HTMLElement, value: string) =>
  fireEvent.change(el, { target: { value } });

function signIn() {
  type(screen.getByPlaceholderText(/7820288/), '7811111');
  type(screen.getByPlaceholderText(/Your admin password/), 'correct-horse');
  fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
}

describe('admin login — second factor', () => {
  beforeEach(() => {
    phoneLogin.mockReset();
    pinLogin.mockReset();
    twoFactorChallenge.mockReset();
  });

  it('does not sign in when the password step comes back asking for a code', async () => {
    phoneLogin.mockResolvedValue({ two_factor_required: true, challenge: 'ch-1' });

    const onLogin = renderLogin();
    signIn();

    // The whole point: a challenge is not a login.
    await screen.findByText(/Two-Factor Code/i);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('completes the sign-in with the code and the challenge it was given', async () => {
    phoneLogin.mockResolvedValue({ two_factor_required: true, challenge: 'ch-1' });
    twoFactorChallenge.mockResolvedValue({ user: USER, message: 'Login successful' });

    const onLogin = renderLogin();
    signIn();
    await screen.findByText(/Two-Factor Code/i);

    type(screen.getByPlaceholderText('000000'), '123456');
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));

    await waitFor(() => {
      // The challenge has to be carried across from the first step, or the
      // server has no idea which half-finished sign-in this is.
      expect(twoFactorChallenge).toHaveBeenCalledWith('ch-1', '123456');
    });
    expect(onLogin).toHaveBeenCalledWith(USER, undefined);
  });

  it('keeps an ordinary login working untouched', async () => {
    // Most accounts will not have enrolled. They must not meet a code prompt.
    phoneLogin.mockResolvedValue({ user: USER });

    const onLogin = renderLogin();
    signIn();

    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(USER, undefined));
    expect(screen.queryByText(/Two-Factor Code/i)).toBeNull();
  });

  it('shows a wrong code as an error and stays on the step', async () => {
    phoneLogin.mockResolvedValue({ two_factor_required: true, challenge: 'ch-1' });
    twoFactorChallenge.mockRejectedValue(new Error('That code is not right.'));

    const onLogin = renderLogin();
    signIn();
    await screen.findByText(/Two-Factor Code/i);

    type(screen.getByPlaceholderText('000000'), '000000');
    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));

    await screen.findByText(/That code is not right/i);
    expect(onLogin).not.toHaveBeenCalled();
    // Cleared, so the next attempt is not typed onto the end of the last one.
    expect(screen.getByPlaceholderText('000000')).toHaveValue('');
  });

  it('offers the recovery path for a lost phone', async () => {
    phoneLogin.mockResolvedValue({ two_factor_required: true, challenge: 'ch-1' });
    twoFactorChallenge.mockResolvedValue({ user: USER, message: 'ok' });

    renderLogin();
    signIn();
    await screen.findByText(/Two-Factor Code/i);

    fireEvent.click(screen.getByRole('button', { name: /Lost your phone/i }));

    // A recovery code is letters and digits, so the numeric-only filter that
    // suits a TOTP would silently eat most of it.
    const field = screen.getByPlaceholderText('XXXXX-XXXXX');
    type(field, 'ab2cd-3ef4g');
    expect(field).toHaveValue('AB2CD-3EF4G');

    fireEvent.click(screen.getByRole('button', { name: /Verify/i }));
    await waitFor(() => expect(twoFactorChallenge).toHaveBeenCalledWith('ch-1', 'AB2CD-3EF4G'));
  });

  it('gates the PIN route into the admin panel too', async () => {
    // A second door into the same room is not a second factor.
    pinLogin.mockResolvedValue({ two_factor_required: true, challenge: 'ch-pin' });

    const onLogin = renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'PIN' }));
    type(screen.getByPlaceholderText(/7820288/), '7811111');
    type(screen.getByPlaceholderText(/staff PIN/), '8351');
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    await screen.findByText(/Two-Factor Code/i);
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('goes back to a clean password form', async () => {
    // The challenge is spent either way; leaving the old password in the box
    // invites a retry against a dead challenge.
    phoneLogin.mockResolvedValue({ two_factor_required: true, challenge: 'ch-1' });

    renderLogin();
    signIn();
    await screen.findByText(/Two-Factor Code/i);

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    await screen.findByText(/Admin Sign In/i);
    expect(screen.getByPlaceholderText(/Your admin password/)).toHaveValue('');
  });
});
