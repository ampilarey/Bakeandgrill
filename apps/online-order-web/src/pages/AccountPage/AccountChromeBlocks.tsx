import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useTheme } from '../../hooks/useTheme';
import { PrayerBar } from '../../components/PrayerBar';
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

const MORE_LINKS = [
  { to: '/hours',    key: 'account.link_hours' },
  { to: '/contact',  key: 'account.link_contact' },
  { to: '/about',    key: 'account.link_about' },
  { to: '/privacy',  key: 'account.link_privacy' },
] as const;

type PushProps = {
  supported: boolean;
  subscribed: boolean;
  loading: boolean;
  onToggle: () => void;
};

/** Settings group: dark mode, optional push notifications row. */
export function AccountSettingsBlock({ push }: { push?: PushProps }) {
  const { t } = useLanguage();
  const { darkMode, setDarkMode } = useTheme();

  return (
    <SectionCard title={t('account.settings')}>
      <div
        style={{
          ...linkRowStyle,
          borderBottom: push?.supported ? '1px solid var(--color-border)' : 'none',
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

      {push?.supported && (
        <div style={{ ...linkRowStyle, borderBottom: 'none' }}>
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
    </SectionCard>
  );
}

/** More links group: Hours, Contact, About, Privacy, legal links, WhatsApp, Viber. */
export function AccountMoreBlock() {
  const { t } = useLanguage();
  const { settings, footerLinks } = useSiteSettingsContext();

  const legalFallback = [
    { label: t('account.link_terms'),  url: '/terms' },
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

  const allLinks = [
    ...MORE_LINKS.map(({ to, key }) => ({ label: t(key), url: to, external: false })),
    ...legal.map((l) => ({ label: l.label ?? '', url: l.url ?? '#', external: false })),
    ...contactLinks.map((l) => ({ label: l.label, url: l.href, external: true })),
  ];

  return (
    <SectionCard title={t('account.more_links')}>
      {allLinks.map(({ label, url, external }, i) => {
        const style: CSSProperties = {
          ...linkRowStyle,
          borderBottom: i === allLinks.length - 1 ? 'none' : '1px solid var(--color-border)',
        };
        const chevron = (
          <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>▸</span>
        );
        const isInternal = !external && url.startsWith('/') && !url.startsWith('//');

        if (isInternal) {
          return (
            <Link key={url + i} to={url} style={style}>
              <span>{label}</span>
              {chevron}
            </Link>
          );
        }
        return (
          <a key={url + i} href={url} style={style} target="_blank" rel="noopener noreferrer">
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
