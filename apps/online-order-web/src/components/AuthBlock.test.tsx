import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthBlock, formatPhone, isValidPhone, normalisePhone } from './AuthBlock';
import { checkPhone, forgotPassword, passwordLogin, requestOtp, resetPassword } from '../api';

vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../context/SiteSettingsContext', () => ({
  useSiteSettingsContext: () => ({ settings: { logo: '/logo.png', site_name: 'Bake & Grill' }, text: (_k: string, d: string) => d }),
}));
vi.mock('../utils/guestPhone', () => ({ persistGuestPhone: vi.fn() }));
vi.mock('../api', () => ({
  checkPhone: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  passwordLogin: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  completeProfile: vi.fn(),
  guestSession: vi.fn(),
}));

/*
 * Owner, 2026-10-06: "enhance the login page for desktop and mobile with
 * proper branding and number entry page in login also". The number field
 * now shows the number the Maldivian way, says what is missing before the
 * customer presses Continue, and only lets through what the server accepts.
 */
describe('phone helpers', () => {
  it('keeps the local seven digits from whatever is typed, pasted or autofilled', () => {
    expect(normalisePhone('777-1234')).toBe('7771234');
    expect(normalisePhone('+960 777 1234')).toBe('7771234');
    expect(normalisePhone('00960 7771234')).toBe('7771234');
    expect(normalisePhone('77712345')).toBe('7771234');
    // A local number that starts with 960 is not a country code.
    expect(normalisePhone('9601234')).toBe('9601234');
  });

  it('writes the number as 777 1234', () => {
    expect(formatPhone('777')).toBe('777');
    expect(formatPhone('7771')).toBe('777 1');
    expect(formatPhone('7771234')).toBe('777 1234');
  });

  it('accepts what the server accepts: seven digits starting 3, 6, 7 or 9', () => {
    expect(isValidPhone('7771234')).toBe(true);
    expect(isValidPhone('9123456')).toBe(true);
    expect(isValidPhone('3301234')).toBe(true);
    expect(isValidPhone('777123')).toBe(false);
    expect(isValidPhone('5551234')).toBe(false);
  });
});

describe('AuthBlock number step', () => {
  beforeEach(() => {
    vi.mocked(checkPhone).mockReset();
    vi.mocked(requestOtp).mockReset();
  });

  const field = () => screen.getByLabelText('auth.label_phone_cc') as HTMLInputElement;
  const continueBtn = () => screen.getByRole('button', { name: /auth\.continue/ }) as HTMLButtonElement;

  it('shows the brand and the logo', () => {
    render(<AuthBlock onSuccess={() => {}} />);
    expect(screen.getByText('Bake & Grill')).toBeTruthy();
    expect(screen.getByAltText('Bake & Grill').getAttribute('src')).toBe('/logo.png');
  });

  it('keeps Continue off and counts down until the number is complete', () => {
    render(<AuthBlock onSuccess={() => {}} />);
    expect(continueBtn().disabled).toBe(true);
    expect(screen.getByText('auth.phone_help')).toBeTruthy();

    fireEvent.change(field(), { target: { value: '77712' } });
    expect(field().value).toBe('777 12');
    expect(screen.getByText('auth.phone_left')).toBeTruthy();
    expect(continueBtn().disabled).toBe(true);

    fireEvent.change(field(), { target: { value: '777 123' } });
    expect(screen.getByText('auth.phone_one_left')).toBeTruthy();

    fireEvent.change(field(), { target: { value: '777 1234' } });
    expect(screen.getByText('auth.phone_ok')).toBeTruthy();
    expect(continueBtn().disabled).toBe(false);
  });

  it('says why a number that cannot be a Maldives mobile is refused', () => {
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(field(), { target: { value: '5551234' } });
    expect(screen.getByText('auth.phone_bad_prefix')).toBeTruthy();
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(continueBtn().disabled).toBe(true);
  });

  it('takes a pasted +960 number and clears with one tap', () => {
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(field(), { target: { value: '+960 777-1234' } });
    expect(field().value).toBe('777 1234');
    // A complete number shows the tick, not the clear button; shorten it first.
    fireEvent.change(field(), { target: { value: '777 123' } });
    fireEvent.click(screen.getByRole('button', { name: 'auth.clear_phone' }));
    expect(field().value).toBe('');
  });

  it('Enter does nothing until the number is complete', () => {
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(field(), { target: { value: '777' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(checkPhone).not.toHaveBeenCalled();
  });

  it('sends the plain digits and shows the number on the code step, with a way back', async () => {
    vi.mocked(checkPhone).mockResolvedValue({ exists: false, has_password: false } as never);
    vi.mocked(requestOtp).mockResolvedValue({} as never);
    render(<AuthBlock onSuccess={() => {}} />);

    fireEvent.change(field(), { target: { value: '7771234' } });
    fireEvent.click(continueBtn());

    await waitFor(() => expect(screen.getByText('auth.title_otp')).toBeTruthy());
    expect(checkPhone).toHaveBeenCalledWith('7771234');
    expect(requestOtp).toHaveBeenCalledWith('7771234', 'register');
    expect(screen.getByText('+960 777 1234')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'auth.change' }));
    expect(screen.getByText('auth.title_phone')).toBeTruthy();
  });

  it('fills all six boxes when the phone autofills the code into the first one', async () => {
    vi.mocked(checkPhone).mockResolvedValue({ exists: false, has_password: false } as never);
    vi.mocked(requestOtp).mockResolvedValue({} as never);
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(field(), { target: { value: '7771234' } });
    fireEvent.click(continueBtn());
    await waitFor(() => expect(screen.getByText('auth.title_otp')).toBeTruthy());

    const first = screen.getAllByLabelText('auth.digit_aria')[0] as HTMLInputElement;
    fireEvent.change(first, { target: { value: '482913' } });
    const confirm = screen.getByRole('button', { name: /auth\.confirm/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
  });
});

/*
 * Owner, 2026-10-06: "Why there is no email option in login?" → option 1.
 * The code screen offers the email already on the account, masked, and only
 * when there is one.
 */
describe('AuthBlock email the code instead', () => {
  beforeEach(() => {
    vi.mocked(checkPhone).mockReset();
    vi.mocked(requestOtp).mockReset();
    vi.mocked(forgotPassword).mockReset();
    vi.mocked(passwordLogin).mockReset();
  });

  async function toCodeStep(emailHint?: string) {
    vi.mocked(checkPhone).mockResolvedValue({ exists: true, has_password: false } as never);
    vi.mocked(requestOtp).mockResolvedValueOnce({ channel: 'sms', ...(emailHint ? { email_hint: emailHint } : {}) });
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(screen.getByLabelText('auth.label_phone_cc'), { target: { value: '7771234' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.continue/ }));
    await waitFor(() => expect(screen.getByText('auth.title_otp')).toBeTruthy());
  }

  it('is not offered when the account has no email', async () => {
    await toCodeStep();
    expect(screen.queryByText('auth.email_instead')).toBeNull();
  });

  it('sends the code to the email on the account without ever sending an address', async () => {
    await toCodeStep('a•••@g•••.com');
    expect(screen.getByText('auth.email_instead_to')).toBeTruthy();

    vi.mocked(requestOtp).mockResolvedValueOnce({ channel: 'email', sent_to: 'a•••@g•••.com' });
    fireEvent.click(screen.getByRole('button', { name: /auth\.email_instead/ }));

    await waitFor(() => expect(screen.getByText('auth.emailed_new')).toBeTruthy());
    expect(requestOtp).toHaveBeenLastCalledWith('7771234', 'register', { channel: 'email' });
    // The code line now says where it went, masked.
    expect(screen.getByText('a•••@g•••.com')).toBeTruthy();
    // And the way back to SMS is offered instead.
    expect(screen.queryByText('auth.email_instead')).toBeNull();
    expect(screen.getByRole('button', { name: 'auth.sms_instead' })).toBeTruthy();
  });

  it('shows the server message when the email cannot be sent, and stays on SMS', async () => {
    await toCodeStep('a•••@g•••.com');
    vi.mocked(requestOtp).mockRejectedValueOnce(new Error('We could not send the email just now. Please use the code we texted you.'));
    fireEvent.click(screen.getByRole('button', { name: /auth\.email_instead/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not send the email'));
    expect(screen.getByText('+960 777 1234')).toBeTruthy();
    expect(screen.getByRole('button', { name: /auth\.email_instead/ })).toBeTruthy();
  });

  it('is offered for a password reset code too', async () => {
    vi.mocked(checkPhone).mockResolvedValue({ exists: true, has_password: true } as never);
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(screen.getByLabelText('auth.label_phone_cc'), { target: { value: '7771234' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.continue/ }));
    await waitFor(() => expect(screen.getByText('auth.title_password')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'auth.forgot' }));
    vi.mocked(forgotPassword).mockResolvedValueOnce({ email_hint: 'a•••@g•••.com' });
    fireEvent.click(screen.getByRole('button', { name: /auth\.send_reset/ }));
    await waitFor(() => expect(screen.getByText('auth.title_forgot_otp')).toBeTruthy());

    vi.mocked(requestOtp).mockResolvedValueOnce({ channel: 'email', sent_to: 'a•••@g•••.com' });
    fireEvent.click(screen.getByRole('button', { name: /auth\.email_instead/ }));
    await waitFor(() => expect(requestOtp).toHaveBeenLastCalledWith('7771234', 'reset_password', { channel: 'email' }));
  });
});

/*
 * Owner, 2026-10-06 (screenshot): typed the texted reset code, set a new
 * password, and got "Invalid OTP code" on the password screen with no way
 * to fix the code. A code error now goes back to the code boxes.
 */
describe('AuthBlock reset code error', () => {
  it('takes the customer back to the code boxes with the message', async () => {
    vi.mocked(checkPhone).mockResolvedValue({ exists: true, has_password: true } as never);
    vi.mocked(forgotPassword).mockResolvedValueOnce({});
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(screen.getByLabelText('auth.label_phone_cc'), { target: { value: '7771234' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.continue/ }));
    await waitFor(() => expect(screen.getByText('auth.title_password')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'auth.forgot' }));
    fireEvent.click(screen.getByRole('button', { name: /auth\.send_reset/ }));
    await waitFor(() => expect(screen.getByText('auth.title_forgot_otp')).toBeTruthy());

    fireEvent.change(screen.getAllByLabelText('auth.digit_aria')[0], { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.continue/ }));
    expect(screen.getByText('auth.title_new_pass')).toBeTruthy();

    const err = Object.assign(new Error('That code is not right. 4 tries left.'), {
      status: 422, body: { errors: { otp: ['That code is not right. 4 tries left.'] } },
    });
    vi.mocked(resetPassword).mockRejectedValueOnce(err);
    fireEvent.change(screen.getByLabelText('auth.label_new_password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('auth.label_confirm_password'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.set_password/ }));

    await waitFor(() => expect(screen.getByText('auth.title_forgot_otp')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('4 tries left');
    expect((screen.getAllByLabelText('auth.digit_aria')[0] as HTMLInputElement).value).toBe('');
  });

  it('stays on the password screen for a password problem', async () => {
    vi.mocked(checkPhone).mockResolvedValue({ exists: true, has_password: true } as never);
    vi.mocked(forgotPassword).mockResolvedValueOnce({});
    render(<AuthBlock onSuccess={() => {}} />);
    fireEvent.change(screen.getByLabelText('auth.label_phone_cc'), { target: { value: '7771234' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.continue/ }));
    await waitFor(() => expect(screen.getByText('auth.title_password')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'auth.forgot' }));
    fireEvent.click(screen.getByRole('button', { name: /auth\.send_reset/ }));
    await waitFor(() => expect(screen.getByText('auth.title_forgot_otp')).toBeTruthy());
    fireEvent.change(screen.getAllByLabelText('auth.digit_aria')[0], { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.continue/ }));

    vi.mocked(resetPassword).mockRejectedValueOnce(Object.assign(new Error('The password must be at least 6 characters.'), {
      status: 422, body: { errors: { password: ['The password must be at least 6 characters.'] } },
    }));
    fireEvent.change(screen.getByLabelText('auth.label_new_password'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('auth.label_confirm_password'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /auth\.set_password/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('at least 6'));
    expect(screen.getByText('auth.title_new_pass')).toBeTruthy();
  });
});
