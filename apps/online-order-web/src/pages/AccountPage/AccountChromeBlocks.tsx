import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { isLanguageSwitcherEnabled } from '../../components/LanguageSwitcherGate';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useTheme } from '../../hooks/useTheme';
import { PrayerBar } from '../../components/PrayerBar';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';
import { isExternalHref, shouldLeaveOrderApp, toOrderSpaPath } from '../../utils/footerNav';
import { SectionCard } from './accountShared';

export const linkRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 56,
  padding: '0 0.25rem',
  borderBottom: '1px solid var(--color-border)',
  textDecoration: 'none',
  color: 'var(--color-text)',
  fontWeight: 600,
  fontSize: '0.9375rem',
};

/** In-app pages — Privacy comes from footer_links to avoid duplicates. */
const MORE_LINKS = [
  { to: '/rewards', key: 'account.link_rewards' },
  { to: '/gift-cards', key: 'account.link_gift_cards' },
  { to: '/hours', key: 'account.link_hours' },
  { to: '/contact', key: 'account.link_contact' },
  { to: '/about', key: 'account.link_about' },
] as const;

function normalizePath(url: string): string {
  const path = (url.split(/[?#]/)[0] || '/');
  return toOrderSpaPath(path);
}

type PushProps = {
  supported: boolean;
  subscribed: boolean;
  loading: boolean;
  onToggle: () => void;
};

type PromoSmsProps = {
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
};

/** Settings group: dark mode, optional push notifications row, promotional SMS. */
export function AccountSettingsBlock({ push, promoSms }: { push?: PushProps; promoSms?: PromoSmsProps }) {
  const { t, lang, setLang } = useLanguage();
  const { settings } = useSiteSettingsContext();
  const { darkMode, setDarkMode } = useTheme();
  const languageSwitcherEnabled = isLanguageSwitcherEnabled(settings);

  return (
    <SectionCard title={t('account.settings')}>
      <div
        style={{
          ...linkRowStyle,
          borderBottom: languageSwitcherEnabled || push?.supported || promoSms
            ? '1px solid var(--color-border)'
            : 'none',
        }}
      >
        <span>{t('account.dark_mode')}</span>
        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          aria-pressed={darkMode}
          aria-label={t('account.dark_mode')}
          style={{
            minWidth: 52,
            minHeight: 44,
            borderRadius: 999,
            border: '1.5px solid var(--color-border)',
            background: darkMode ? 'var(--color-primary)' : 'var(--color-surface-alt)',
            color: darkMode ? '#fff' : 'var(--color-text-muted)',
            fontWeight: 700,
            fontSize: '0.75rem',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {darkMode ? t('common.on') : t('common.off')}
        </button>
      </div>

      {languageSwitcherEnabled ? (
        <div
          style={{
            ...linkRowStyle,
            borderBottom: push?.supported || promoSms ? '1px solid var(--color-border)' : 'none',
          }}
        >
          <span>{t('account.language')}</span>
          <div
            role="group"
            aria-label={t('account.language')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: 3,
              borderRadius: 999,
              border: '1.5px solid var(--color-border)',
              background: 'var(--color-surface-alt)',
            }}
          >
            {(['en', 'dv'] as const).map((option) => {
              const active = lang === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLang(option)}
                  aria-pressed={active}
                  data-testid={`account-lang-${option}`}
                  style={{
                    minWidth: 42,
                    minHeight: 38,
                    padding: '0 0.75rem',
                    borderRadius: 999,
                    border: 'none',
                    background: active ? 'var(--color-primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--color-text-muted)',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {option === 'en' ? 'EN' : 'ދވ'}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {push?.supported && (
        <div style={{ ...linkRowStyle, borderBottom: promoSms ? '1px solid var(--color-border)' : 'none' }}>
          <span>{t('account.push_notifications')}</span>
          <button
            type="button"
            onClick={push.onToggle}
            disabled={push.loading}
            aria-pressed={push.subscribed}
            style={{
              minWidth: 52,
              minHeight: 44,
              borderRadius: 999,
              border: '1.5px solid var(--color-border)',
              background: push.subscribed ? 'var(--color-primary)' : 'var(--color-surface-alt)',
              color: push.subscribed ? '#fff' : 'var(--color-text-muted)',
              fontWeight: 700,
              fontSize: '0.75rem',
              cursor: push.loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: push.loading ? 0.6 : 1,
            }}
          >
            {push.subscribed ? t('common.on') : t('common.off')}
          </button>
        </div>
      )}
      {promoSms && (
        <div style={{ ...linkRowStyle, borderBottom: 'none' }}>
          <span>
            {t('account.promo_sms')}
            <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>{t('account.promo_sms_hint')}</span>
          </span>
          <button
            type="button"
            onClick={promoSms.onToggle}
            disabled={promoSms.saving}
            aria-pressed={promoSms.enabled}
            aria-label={t('account.promo_sms')}
            data-testid="promo-sms-toggle"
            style={{
              minWidth: 52,
              minHeight: 44,
              borderRadius: 999,
              border: '1.5px solid var(--color-border)',
              background: promoSms.enabled ? 'var(--color-primary)' : 'var(--color-surface-alt)',
              color: promoSms.enabled ? '#fff' : 'var(--color-text-muted)',
              fontWeight: 700,
              fontSize: '0.75rem',
              cursor: promoSms.saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              opacity: promoSms.saving ? 0.6 : 1,
            }}
          >
            {promoSms.enabled ? t('common.on') : t('common.off')}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

/** More links group: Hours, Contact, About, legal links, WhatsApp, Viber. */
export function AccountMoreBlock() {
  const { t } = useLanguage();
  const { settings, footerLinks } = useSiteSettingsContext();

  const legalFallback = [
    { label: t('account.link_privacy'), url: '/privacy' },
    { label: t('account.link_terms'), url: '/terms' },
    { label: t('account.link_refund'), url: '/refund' },
  ];
  const legal = footerLinks.length > 0 ? footerLinks : legalFallback;

  const contactLinks: { label: string; href: string }[] = [];
  if (settings.business_whatsapp) {
    contactLinks.push({ label: t('account.link_whatsapp'), href: settings.business_whatsapp });
  }
  if (settings.business_viber) {
    contactLinks.push({ label: t('account.link_viber'), href: settings.business_viber });
  }

  const seen = new Set<string>();
  const allLinks: {
    label: string;
    url: string;
    kind: 'leave' | 'spa' | 'external';
  }[] = [];

  const pushLink = (label: string, url: string, kind: 'leave' | 'spa' | 'external') => {
    const dedupeKey = kind === 'external' ? url : normalizePath(url);
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    allLinks.push({ label, url, kind });
  };

  pushLink(t('account.link_website'), MAIN_WEBSITE_HREF, 'leave');
  for (const { to, key } of MORE_LINKS) {
    pushLink(t(key), to, 'spa');
  }
  // The unsubscribe page lives on the website (SMS audit, 2026-09-24).
  pushLink(t('account.link_sms_prefs'), '/sms/preferences', 'leave');
  for (const l of legal) {
    const url = (l.url ?? '#').trim() || '#';
    const label = (l.label ?? '').trim() || url;
    if (isExternalHref(url)) {
      pushLink(label, url, 'external');
    } else if (shouldLeaveOrderApp(url)) {
      pushLink(label, url, 'leave');
    } else {
      pushLink(label, toOrderSpaPath(url), 'spa');
    }
  }
  for (const l of contactLinks) {
    pushLink(l.label, l.href, 'external');
  }

  return (
    <SectionCard title={t('account.more_links')}>
      {allLinks.map(({ label, url, kind }, i) => {
        const style: CSSProperties = {
          ...linkRowStyle,
          borderBottom: i === allLinks.length - 1 ? 'none' : '1px solid var(--color-border)',
        };
        const chevron = (
          <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>▸</span>
        );

        if (kind === 'leave') {
          return (
            <a key={`${url}-${i}`} href={url} style={style} data-testid={`account-link-leave-${normalizePath(url)}`}>
              <span>{label}</span>
              {chevron}
            </a>
          );
        }
        if (kind === 'spa') {
          return (
            <Link key={`${url}-${i}`} to={url} style={style}>
              <span>{label}</span>
              {chevron}
            </Link>
          );
        }
        return (
          <a key={`${url}-${i}`} href={url} style={style} target="_blank" rel="noopener noreferrer">
            <span>{label}</span>
            {chevron}
          </a>
        );
      })}
    </SectionCard>
  );
}

/**
 * Legacy composite block (PrayerBar + Settings + More). Kept for historical
 * callers; new code should use AccountSettingsBlock / AccountMoreBlock directly.
 */
export function AccountChromeBlocks() {
  const { t } = useLanguage();
  return (
    <>
      <SectionCard title={t('account.prayer_times')}>
        <div style={{ overflow: 'visible' }}>
          <PrayerBar />
        </div>
      </SectionCard>
      <AccountSettingsBlock />
      <AccountMoreBlock />
    </>
  );
}
