import { Link } from 'react-router-dom';
import { plain, safeHtml, safeUrl, str, type GenericBlockSettings } from './blockTypes';

/** `/order/menu` on the website is just `/menu` inside the order app. */
function orderAppHref(url: string): string {
  const trimmed = url.trim();
  if (trimmed === '/order' || trimmed === '/order/') return '/';
  if (trimmed.startsWith('/order/')) return trimmed.slice('/order'.length) || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function BandButton({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary: boolean;
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '0 1.1rem',
    borderRadius: 12,
    fontWeight: 700,
    fontSize: '0.9rem',
    textDecoration: 'none',
    background: primary ? 'var(--color-primary)' : 'transparent',
    color: primary ? '#fff' : 'var(--color-dark)',
    border: primary ? 'none' : '1px solid var(--color-border)',
  };

  if (/^(https?:|mailto:)/i.test(href)) {
    return (
      <a href={href} style={style} rel="noopener noreferrer">
        {label}
      </a>
    );
  }
  return (
    <Link to={orderAppHref(href)} style={style}>
      {label}
    </Link>
  );
}

/** A line of text with up to two buttons. */
export function ButtonBandBlock({ settings }: { settings: GenericBlockSettings }) {
  const text = str(settings, 'text');
  const hasText = plain(text) !== '';
  const label1 = plain(str(settings, 'button1_label'));
  const label2 = plain(str(settings, 'button2_label'));
  const url1 = safeUrl(str(settings, 'button1_url')) || '/';
  const url2 = safeUrl(str(settings, 'button2_url')) || '/menu';

  if (!hasText && label1 === '' && label2 === '') return null;

  return (
    <section
      data-home-block="button_band"
      style={{
        padding: '1.25rem var(--page-gutter)',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
        width: '100%',
        textAlign: 'center',
      }}
    >
      {hasText && (
        <div
          style={{
            fontSize: '0.95rem',
            lineHeight: 1.6,
            color: 'var(--color-dark)',
            marginBottom: '0.75rem',
          }}
          dangerouslySetInnerHTML={{ __html: safeHtml(text) }}
        />
      )}
      {(label1 !== '' || label2 !== '') && (
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {label1 !== '' && <BandButton href={url1} label={label1} primary />}
          {label2 !== '' && <BandButton href={url2} label={label2} primary={false} />}
        </div>
      )}
    </section>
  );
}
