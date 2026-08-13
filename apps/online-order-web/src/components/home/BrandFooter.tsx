import { Link } from 'react-router-dom';
import { WhatsAppIcon, ViberIcon } from '../icons';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';
import { isExternalHref, shouldLeaveOrderApp, toOrderSpaPath } from '../../utils/footerNav';
import { safePublicUrl } from '../../utils/safePublicUrl';
import { FOOTER_THANKS_DEFAULT, normalizeFooterBlurb } from '../../utils/footerBlurb';

type Props = {
  whatsappLink: string;
  viberLink: string;
  logoSrc?: string;
  siteName?: string;
  /** Short brand blurb (CMS footer_text) — not copyright. */
  blurb?: string;
  /** Thanks line (CMS footer_thanks). */
  thanks?: string;
  chatLabel?: string;
};

type NavItem = { label: string; url: string; external?: boolean };

function FooterNavLink({ item }: { item: NavItem }) {
  const url = safePublicUrl(item.url) ?? '#';
  const label = (item.label ?? '').trim() || url;
  const className = 'brand-footer__link';

  if (url === '#') {
    return <a href="#" className={className}>{label}</a>;
  }
  if (item.external || isExternalHref(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }
  if (shouldLeaveOrderApp(url)) {
    return <a href={url} className={className}>{label}</a>;
  }
  return <Link to={toOrderSpaPath(url)} className={className}>{label}</Link>;
}

/**
 * Enhanced marketing footer for Order App (all viewports) and Website mobile twin.
 * Desktop website multi-column footer stays in layout.blade.php `.footer-desktop`.
 * Keep markup/CSS classes in sync with layout.blade.php `.brand-footer--website`.
 */
export function BrandFooter({
  whatsappLink,
  viberLink,
  logoSrc,
  siteName,
  blurb,
  thanks: thanksProp,
  chatLabel,
}: Props) {
  const { t } = useLanguage();
  const { footerLinks, text } = useSiteSettingsContext();
  const name = siteName || text('site_name', 'Bake & Grill');
  const rights = text('footer_rights_suffix', 'All rights reserved.');
  const tagline = text('site_tagline', '');
  const thanks = (thanksProp ?? '').trim() || FOOTER_THANKS_DEFAULT || t('home.footer_thanks');
  const blurbLine = normalizeFooterBlurb(blurb ?? '', tagline);
  const chat = (chatLabel ?? '').trim() || text('home_chat_label', 'Chat with us');
  const year = new Date().getFullYear();
  const safeWhatsappLink = safePublicUrl(whatsappLink) ?? 'https://wa.me/9609120011';
  const safeViberLink = safePublicUrl(viberLink);

  const phone = text('business_phone', '+960 912 0011').trim();
  const email = text('business_email', 'admin@bakeandgrill.mv').trim();
  const address = text('business_address', 'Kalaafaanu Hingun, Malé, Maldives').trim();
  const landmark = text('business_landmark', '').trim();
  const mapsUrl = safePublicUrl(text('business_maps_url', ''))
    ?? 'https://maps.google.com/?q=Kalaafaanu+Hingun+Male+Maldives';
  const phoneTel = `tel:${phone.replace(/[^\d+]/g, '')}`;
  const payments = text('footer_payments_text', 'BML · Cards · Cash · MVR').trim();
  const delivery = text('footer_delivery_text', 'Delivery across Malé & Hulhumalé').trim();
  const exploreHeading = text('footer_quick_links_heading', 'Explore');
  const visitHeading = text('footer_location_heading', 'Visit');
  const showSocialRaw = text('show_social_links', 'true').toLowerCase();
  const showSocial = showSocialRaw !== 'false' && showSocialRaw !== '0';
  const socialInstagram = showSocial ? (safePublicUrl(text('social_instagram', '')) ?? '') : '';
  const socialFacebook = showSocial ? (safePublicUrl(text('social_facebook', '')) ?? '') : '';
  const socialTiktok = showSocial ? (safePublicUrl(text('social_tiktok', '')) ?? '') : '';

  const explore: NavItem[] = [
    { label: t('nav.menu'), url: '/menu' },
    { label: t('nav.orders'), url: '/orders' },
    { label: t('about.opening_hours'), url: '/hours' },
    { label: t('account.link_contact'), url: '/contact' },
    { label: 'Main website', url: MAIN_WEBSITE_HREF, external: true },
  ];

  const legal = footerLinks.length > 0
    ? footerLinks
    : [
        { label: t('account.link_privacy'), url: '/privacy' },
        { label: t('account.link_terms'), url: '/terms' },
        { label: t('account.link_refund'), url: '/refund' },
      ];

  return (
    <footer className="brand-footer" data-testid="brand-footer">
      <div className="brand-footer__inner">
        <div className="brand-footer__grid">
          <div className="brand-footer__brand">
            {logoSrc ? (
              <a
                href={MAIN_WEBSITE_HREF}
                aria-label={t('header.website_aria').replace('{name}', name)}
                className="brand-footer__logo-link"
              >
                <img src={logoSrc} alt="" className="brand-footer__logo" />
                <span className="brand-footer__name">{name}</span>
              </a>
            ) : (
              <p className="brand-footer__name">{name}</p>
            )}
            {blurbLine !== '' ? (
              <p className="brand-footer__blurb">{blurbLine}</p>
            ) : null}
            <p className="brand-footer__thanks">{thanks}</p>
            <div className="brand-footer__chat">
              {chat ? (
                <p className="brand-footer__chat-label">{chat}</p>
              ) : null}
              <div className="brand-footer__chat-row">
                {socialInstagram ? (
                  <a href={socialInstagram} target="_blank" rel="noopener noreferrer" className="brand-footer__social" aria-label="Instagram" data-social="instagram">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 01-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 017.8 2m-.2 2A3.6 3.6 0 004 7.6v8.8A3.6 3.6 0 007.6 20h8.8a3.6 3.6 0 003.6-3.6V7.6A3.6 3.6 0 0016.4 4H7.6m9.65 1.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5M12 7a5 5 0 110 10 5 5 0 010-10m0 2a3 3 0 100 6 3 3 0 000-6z"/></svg>
                  </a>
                ) : null}
                {socialFacebook ? (
                  <a href={socialFacebook} target="_blank" rel="noopener noreferrer" className="brand-footer__social" aria-label="Facebook" data-social="facebook">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 10-11.5 9.9v-7H8v-3h2.5V9.5c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.5V12H17l-.4 3h-2.7v7A10 10 0 0022 12z"/></svg>
                  </a>
                ) : null}
                {socialTiktok ? (
                  <a href={socialTiktok} target="_blank" rel="noopener noreferrer" className="brand-footer__social" aria-label="TikTok" data-social="tiktok">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M21 8.5a7.4 7.4 0 01-4.3-1.4v7.1a5.9 5.9 0 11-5.9-5.9c.3 0 .6 0 .9.1v2.9a3 3 0 100 5.9 3 3 0 003-3.1V2h2.9a4.5 4.5 0 003.4 3.5V8.5z"/></svg>
                  </a>
                ) : null}
                <a
                  href={safeWhatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t('home.footer_whatsapp')}
                  className="brand-footer__wa"
                >
                  <WhatsAppIcon />
                  {t('home.footer_whatsapp')}
                </a>
                {safeViberLink ? (
                  <a
                    href={safeViberLink}
                    aria-label={t('home.footer_viber')}
                    className="brand-footer__viber"
                  >
                    <ViberIcon />
                    {t('home.footer_viber')}
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="brand-footer__col">
            <h4 className="brand-footer__heading">{exploreHeading}</h4>
            {explore.map((item) => (
              <FooterNavLink key={item.url} item={item} />
            ))}
          </div>

          <div className="brand-footer__col">
            <h4 className="brand-footer__heading">{visitHeading}</h4>
            {address ? <p className="brand-footer__meta">{address}</p> : null}
            {landmark ? <p className="brand-footer__meta brand-footer__meta--muted">{landmark}</p> : null}
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="brand-footer__link">
              Get directions
            </a>
            {phone ? (
              <a href={phoneTel} className="brand-footer__link">{phone}</a>
            ) : null}
            {email ? (
              <a href={`mailto:${email}`} className="brand-footer__link">{email}</a>
            ) : null}
          </div>
        </div>

        {(payments || delivery) ? (
          <div className="brand-footer__trust" data-footer-trust>
            {payments ? <span>{payments}</span> : null}
            {delivery ? <span>{delivery}</span> : null}
          </div>
        ) : null}

        <nav className="brand-footer__legal" aria-label="Legal">
          {legal.map((item, i) => {
            const url = safePublicUrl(item.url) ?? '#';
            const label = (item.label ?? '').trim() || url;
            const key = `${url}-${i}`;

            if (url === '#') {
              return (
                <a key={key} href="#" className="brand-footer__legal-link">
                  {label}
                </a>
              );
            }
            if (isExternalHref(url)) {
              return (
                <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="brand-footer__legal-link">
                  {label}
                </a>
              );
            }
            if (shouldLeaveOrderApp(url)) {
              return (
                <a key={key} href={url} className="brand-footer__legal-link">
                  {label}
                </a>
              );
            }
            return (
              <Link key={key} to={toOrderSpaPath(url)} className="brand-footer__legal-link">
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="brand-footer__bottom">
          <span>© {year} {name}. {rights}</span>
          <span>Malé, Maldives</span>
        </div>
      </div>
    </footer>
  );
}
