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

/**
 * Compact marketing footer — shared mobile design with the Website site_footer.
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
        <div className="brand-footer__brand">
          {logoSrc ? (
            <a
              href={MAIN_WEBSITE_HREF}
              aria-label={t('header.website_aria').replace('{name}', name)}
              className="brand-footer__logo-link"
            >
              <img src={logoSrc} alt="" className="brand-footer__logo" />
            </a>
          ) : null}
          <p className="brand-footer__name">{name}</p>
          {blurbLine !== '' ? (
            <p className="brand-footer__blurb">{blurbLine}</p>
          ) : null}
          <p className="brand-footer__thanks">{thanks}</p>
        </div>

        <div className="brand-footer__chat">
          {chat ? (
            <p className="brand-footer__chat-label">{chat}</p>
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
