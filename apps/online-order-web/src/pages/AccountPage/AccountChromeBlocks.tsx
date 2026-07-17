import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { useTheme } from '../../hooks/useTheme';
import { PrayerBar } from '../../components/PrayerBar';
import { SectionCard } from './accountShared';

const TEMP_LINKS = [
  { to: '/pre-order', key: 'account.link_preorder' },
  { to: '/reservations', key: 'account.link_reservations' },
  { to: '/hours', key: 'account.link_hours' },
  { to: '/contact', key: 'account.link_contact' },
  { to: '/about', key: 'account.link_about' },
  { to: '/privacy', key: 'account.link_privacy' },
  { to: '/order-history', key: 'account.link_orders' },
] as const;

const linkRowStyle: CSSProperties = {
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

/**
 * Phase 2 Account chrome: PrayerBar, theme/language, temporary More links
 * (destinations orphaned when the global header/footer were removed).
 */
export function AccountChromeBlocks() {
  const { t, lang, setLang } = useLanguage();
  const { darkMode, setDarkMode } = useTheme();
  const { footerLinks } = useSiteSettingsContext();

  // Privacy is in TEMP_LINKS; fallback legal covers terms/refund only.
  const legalFallback = [
    { label: t('account.link_terms'), url: '/terms' },
    { label: t('account.link_refund'), url: '/refund' },
  ];
  const legal = footerLinks.length > 0 ? footerLinks : legalFallback;

  return (
    <>
      <SectionCard title={t('account.prayer_times')}>
        <div style={{ overflow: 'visible' }}>
          <PrayerBar />
        </div>
      </SectionCard>

      <SectionCard title={t('account.settings')}>
        <div style={{ ...linkRowStyle, borderBottom: '1px solid var(--color-border)' }}>
          <span>{t('account.dark_mode')}</span>
          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            aria-pressed={darkMode}
            aria-label={t('account.dark_mode')}
            style={{
              minWidth: 52,
              minHeight: 32,
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
        <div style={{ ...linkRowStyle, borderBottom: 'none' }}>
          <span>{t('account.language')}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
              style={{
                minHeight: 36,
                padding: '0 0.75rem',
                borderRadius: 8,
                border: `1.5px solid ${lang === 'en' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: lang === 'en' ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: lang === 'en' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t('account.lang_en')}
            </button>
            <button
              type="button"
              onClick={() => setLang('dv')}
              aria-pressed={lang === 'dv'}
              style={{
                minHeight: 36,
                padding: '0 0.75rem',
                borderRadius: 8,
                border: `1.5px solid ${lang === 'dv' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: lang === 'dv' ? 'var(--color-primary-light)' : 'var(--color-surface)',
                color: lang === 'dv' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {t('account.lang_dv')}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('account.more_links')}>
        {TEMP_LINKS.map(({ to, key }, i) => (
          <Link
            key={to}
            to={to}
            style={{
              ...linkRowStyle,
              borderBottom: i === TEMP_LINKS.length - 1 && legal.length === 0
                ? 'none'
                : '1px solid var(--color-border)',
            }}
          >
            <span>{t(key)}</span>
            <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>▸</span>
          </Link>
        ))}
        {legal.map((link, i) => {
          const url = link.url ?? '#';
          const isInternal = url.startsWith('/') && !url.startsWith('//');
          const style = {
            ...linkRowStyle,
            borderBottom: i === legal.length - 1 ? 'none' : '1px solid var(--color-border)',
          };
          if (isInternal) {
            return (
              <Link key={url + i} to={url} style={style}>
                <span>{link.label}</span>
                <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>▸</span>
              </Link>
            );
          }
          return (
            <a key={url + i} href={url} style={style}>
              <span>{link.label}</span>
              <span aria-hidden="true" style={{ color: 'var(--color-text-muted)' }}>▸</span>
            </a>
          );
        })}
      </SectionCard>
    </>
  );
}
