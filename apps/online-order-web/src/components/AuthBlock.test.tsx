import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthBlock, formatPhone, isValidPhone, normalisePhone } from './AuthBlock';
import { checkPhone, requestOtp } from '../api';

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
