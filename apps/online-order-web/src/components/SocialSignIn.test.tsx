import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getSocialSignIn: vi.fn(), socialSignInUrl: (p: string, r: string) => `/auth/social/${p}?return=${encodeURIComponent(r)}` }));
vi.mock('../api', () => api);

import { LanguageProvider } from '../context/LanguageContext';
import { resetSocialSignIn, SocialPendingNote, SocialSignIn } from './SocialSignIn';

const wrap = (ui: React.ReactElement) => render(<LanguageProvider>{ui}</LanguageProvider>);

/* Sign in with Google, Facebook or Apple (iruali import plan, feature 1). */
describe('SocialSignIn', () => {
  beforeEach(() => {
    resetSocialSignIn();
    vi.clearAllMocks();
  });

  it('offers a button for each provider whose keys are set, coming back to this page', async () => {
    api.getSocialSignIn.mockResolvedValue({ providers: [{ provider: 'google', label: 'Google' }], pending: null });
    wrap(<SocialSignIn />);
    const link = await screen.findByTestId('social-google');
    expect(link.textContent).toBe('Continue with Google');
    expect(link.getAttribute('href')).toBe('/auth/social/google?return=%2F');
  });

  it('says Almost done while a sign-in waits for the phone, and hides the buttons', async () => {
    api.getSocialSignIn.mockResolvedValue({ providers: [{ provider: 'google', label: 'Google' }], pending: { provider: 'google', label: 'Google', name: null, email: null } });
    wrap(<><SocialPendingNote /><SocialSignIn /></>);
    expect((await screen.findByTestId('social-pending')).textContent).toContain('finish signing in with Google');
    expect(screen.queryByTestId('social-google')).toBeNull();
    expect(api.getSocialSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when no provider is set up', async () => {
    api.getSocialSignIn.mockResolvedValue({ providers: [], pending: null });
    const { container } = wrap(<SocialSignIn />);
    await Promise.resolve();
    expect(container.textContent).toBe('');
  });
});
