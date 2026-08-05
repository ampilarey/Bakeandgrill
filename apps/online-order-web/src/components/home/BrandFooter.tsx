import { Link } from 'react-router-dom';
import { WhatsAppIcon, ViberIcon } from '../icons';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { MAIN_WEBSITE_HREF } from '../../utils/mainWebsite';
import { isExternalHref, shouldLeaveOrderApp, toOrderSpaPath } from '../../utils/footerNav';

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
  const thanks = (thanksProp ?? '').trim() || t('home.footer_thanks');
  const blurbLine = (blurb ?? '').trim();
  const chat = (chatLabel ?? '').trim();
  const year = new Date().getFullYear();

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
          {logoSrc && (
            <a
              href={MAIN_WEBSITE_HREF}
              aria-label={t('header.website_aria').replace('{name}', name)}
              className="brand-footer__logo-link"
            >
              <img src={logoSrc} alt="" className="brand-footer__logo" />
            </a>
          )}
          {blurbLine !== '' && (
            <p className="brand-footer__blurb">{blurbLine}</p>
          )}
          <p className="brand-footer__thanks">{thanks}</p>
        </div>

        <div className="brand-footer__chat">
          {chat && (
            <p className="brand-footer__chat-label">{chat}</p>
          )}
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('home.footer_whatsapp')}
            className="brand-footer__wa"
          >
            <WhatsAppIcon />
            {t('home.footer_whatsapp')}
          </a>
          <a
            href={viberLink}
            aria-label={t('home.footer_viber')}
            className="brand-footer__viber"
          >
            <ViberIcon />
            {t('home.footer_viber')}
          </a>
        </div>

        <nav className="brand-footer__legal" aria-label="Legal">
          {legal.map((item, i) => {
            const url = (item.url ?? '#').trim() || '#';
            const label = (item.label ?? '').trim() || url;
            const key = `${url}-${i}`;

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
