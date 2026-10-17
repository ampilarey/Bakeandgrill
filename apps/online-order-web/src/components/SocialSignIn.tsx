import { useEffect, useState } from 'react';
import { getSocialSignIn, socialSignInUrl, type SocialSignIn as SocialSignInData } from '../api';
import { useLanguage } from '../context/LanguageContext';

/**
 * "Continue with Google / Facebook / Apple" under the phone step, for the
 * providers whose keys are set (iruali import plan, feature 1). After one,
 * when the account still needs the phone, the same step says "Almost done".
 */
let shared: Promise<SocialSignInData> | null = null;

/** One request per page load for both parts. */
function useSocialSignIn(): SocialSignInData | null {
  const [data, setData] = useState<SocialSignInData | null>(null);
  useEffect(() => {
    let cancelled = false;
    shared ??= (() => {
      try {
        return getSocialSignIn().catch(() => ({ providers: [], pending: null }));
      } catch {
        return Promise.resolve({ providers: [], pending: null });
      }
    })();
    shared.then((d) => { if (!cancelled) setData(d); });
    return () => { cancelled = true; };
  }, []);

  return data;
}

/** For tests: forget the shared answer. */
export function resetSocialSignIn(): void {
  shared = null;
}

/** Above the phone box while a sign-in waits for the phone: "Almost done". */
export function SocialPendingNote() {
  const { t } = useLanguage();
  const data = useSocialSignIn();
  if (!data?.pending) return null;

  return (
    <p className="auth__social-pending" role="status" data-testid="social-pending" style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--color-primary)' }}>
      {t('auth.social_pending').replace('{provider}', data.pending.label)}
    </p>
  );
}

export function SocialSignIn() {
  const { t } = useLanguage();
  const data = useSocialSignIn();
  if (!data || data.pending || data.providers.length === 0) return null;

  const here = typeof window === 'undefined' ? '/order/account' : window.location.pathname;
  return (
    <div className="auth__social" data-testid="social-sign-in" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="auth__social-or" style={{ textAlign: 'center', margin: '4px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>{t('auth.social_or')}</p>
      {data.providers.map((p) => (
        <a
          key={p.provider}
          href={socialSignInUrl(p.provider, here)}
          className="auth__btn auth__btn--outline"
          data-testid={`social-${p.provider}`}
          style={{ textAlign: 'center', textDecoration: 'none' }}
        >
          {t('auth.social_continue').replace('{provider}', p.label)}
        </a>
      ))}
    </div>
  );
}

/** The message a failed social sign-in came back with (?social=error), once. */
export function socialErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  return q.get('social') === 'error' ? q.get('social_message') : null;
}
