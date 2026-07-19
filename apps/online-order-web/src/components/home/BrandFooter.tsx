import { Link } from 'react-router-dom';
import { WhatsAppIcon, ViberIcon } from '../icons';
import { useLanguage } from '../../context/LanguageContext';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';

type Props = {
  whatsappLink: string;
  viberLink: string;
  logoSrc?: string;
  siteName?: string;
  /** CMS footer_text / site_tagline */
  tagline?: string;
  chatLabel?: string;
};

export function BrandFooter({
  whatsappLink,
  viberLink,
  logoSrc,
  siteName,
  tagline,
  chatLabel,
}: Props) {
  const { t } = useLanguage();
  const thanks = (tagline ?? '').trim() || t('home.footer_thanks');
  const chat = (chatLabel ?? '').trim();

  return (
    <footer
      style={{
        background: 'var(--color-footer-bg)',
        padding: '2rem var(--page-gutter) calc(2.5rem + var(--safe-bottom))',
      }}
    >
      <div style={{ maxWidth: 'var(--layout-max)', margin: '0 auto' }}>
        {/* Logo + thanks */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          {logoSrc && (
            <a
              href={MAIN_WEBSITE_HREF}
              aria-label={t('header.website_aria').replace('{name}', siteName ?? 'Bake & Grill')}
              style={{ display: 'block', margin: '0 auto 0.875rem', width: 'fit-content' }}
            >
              <img
                src={logoSrc}
                alt=""
                style={{
                  height: 40,
                  objectFit: 'contain',
                  opacity: 0.9,
                  filter: 'brightness(1.4)',
                  display: 'block',
                }}
              />
            </a>
          )}
          <p
            style={{
              fontSize: '0.9375rem',
              color: 'rgba(255,255,255,0.6)',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            {thanks}
          </p>
        </div>

        {/* Chat CTAs */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            marginBottom: '1.75rem',
            flexWrap: 'wrap',
          }}
        >
          {chat && (
            <p
              style={{
                width: '100%',
                textAlign: 'center',
                margin: '0 0 0.25rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              {chat}
            </p>
          )}
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-full)',
              background: '#25D366',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.875rem',
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            <WhatsAppIcon />
            {t('home.footer_whatsapp')}
          </a>
          <a
            href={viberLink}
            aria-label="Chat on Viber"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.625rem 1.25rem',
              borderRadius: 'var(--radius-full)',
              background: '#7360F2',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.875rem',
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            <ViberIcon />
            {t('home.footer_viber')}
          </a>
        </div>

        {/* Legal links */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1.25rem',
            flexWrap: 'wrap',
          }}
        >
          <Link
            to="/privacy"
            style={{
              fontSize: '0.8125rem',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
            }}
          >
            {t('account.link_privacy')}
          </Link>
          <Link
            to="/terms"
            style={{
              fontSize: '0.8125rem',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
            }}
          >
            {t('account.link_terms')}
          </Link>
          <Link
            to="/refund"
            style={{
              fontSize: '0.8125rem',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
            }}
          >
            {t('account.link_refund')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
