import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchOnlineOrderingStatus } from '../../api';
import { useOrderMode } from '../../context/OrderModeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';

type ModeKind = 'delivery' | 'pickup' | 'dine_in';

const MODE_IMAGES: Record<ModeKind, string> = {
  delivery: `${import.meta.env.BASE_URL}images/mode-delivery.jpg`,
  pickup: `${import.meta.env.BASE_URL}images/mode-pickup.jpg`,
  dine_in: `${import.meta.env.BASE_URL}images/mode-dinein.jpg`,
};

type CardProps = {
  kind: ModeKind;
  label: string;
  hint: string;
  onClick: () => void;
};

function ModeCard({ kind, label, hint, onClick }: CardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const icon = kind === 'delivery' ? '🛵' : kind === 'dine_in' ? '🍽️' : '🏪';
  const gradient =
    kind === 'delivery'
      ? 'linear-gradient(145deg, var(--color-primary-light) 0%, var(--color-surface-alt) 100%)'
      : 'linear-gradient(145deg, var(--color-surface-alt) 0%, var(--color-primary-light) 100%)';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: '1 1 0',
        minWidth: 0,
        border: '1.5px solid var(--color-border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
        background: 'var(--color-surface)',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        fontFamily: 'inherit',
        minHeight: 44,
      }}
    >
      <div
        aria-hidden
        style={{
          height: 120,
          overflow: 'hidden',
          background: gradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          position: 'relative',
        }}
      >
        {!imgFailed && (
          <img
            src={MODE_IMAGES[kind]}
            alt=""
            onError={() => setImgFailed(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        {imgFailed && icon}
      </div>
      <div style={{ padding: '0.875rem 1rem 1rem' }}>
        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--color-dark)' }}>
          {label}
        </p>
        <p
          style={{
            margin: '0.25rem 0 0',
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)',
            lineHeight: 1.4,
          }}
        >
          {hint}
        </p>
        <div
          style={{
            marginTop: '0.625rem',
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
          }}
        >
          {label} →
        </div>
      </div>
    </button>
  );
}

function buildDeliveryHint(
  text: (key: string, fallback: string) => string,
  settings: { delivery_time?: string; delivery_eta?: string; delivery_threshold?: string; home_delivery_tagline?: string },
  i18nFallback: string,
): string {
  const custom = text('order_mode_delivery_hint', '');
  if (custom.trim()) return custom.trim();

  const eta = (settings.delivery_time || settings.delivery_eta || '').trim();
  const threshold = (settings.delivery_threshold || '').trim();
  const tagline = (settings.home_delivery_tagline || '').trim();

  if (eta && threshold) return `${eta} · Free above ${threshold}`;
  if (eta) return `Delivered to your door in ${eta}`;
  if (tagline) return tagline;
  return i18nFallback;
}

function buildPickupHint(
  text: (key: string, fallback: string) => string,
  settings: { business_address?: string; business_landmark?: string },
  i18nFallback: string,
): string {
  const custom = text('order_mode_pickup_hint', '');
  if (custom.trim()) return custom.trim();

  const address = (settings.business_address || '').trim();
  const landmark = (settings.business_landmark || '').trim();
  if (address && landmark) return `Pick up at ${address} (${landmark})`;
  if (address) return `Pick up at ${address}`;
  return i18nFallback;
}

export function ModeEntryCards() {
  const { setMode } = useOrderMode();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { settings, text } = useSiteSettingsContext();
  const [dineInAvailable, setDineInAvailable] = useState(false);

  // "Eat here" appears only when the owner enabled prepaid dine-in and the
  // shop is open (arrival is always today).
  useEffect(() => {
    let cancelled = false;
    fetchOnlineOrderingStatus()
      .then((gate) => {
        if (cancelled) return;
        setDineInAvailable(gate.dine_in_preorder?.enabled === true && gate.open === true);
      })
      .catch(() => { /* keep hidden */ });
    return () => { cancelled = true; };
  }, []);

  const deliveryHint = buildDeliveryHint(text, settings, t('home.mode_delivery_hint'));
  const pickupHint = buildPickupHint(text, settings, t('home.mode_pickup_hint'));
  const dineInHint = (text('order_mode_dine_in_hint', '') || '').trim()
    || 'Order and pay now — your table is reserved and food is ready when you arrive.';

  const handleMode = (mode: ModeKind) => {
    setMode(mode);
    void navigate('/menu');
  };

  return (
    <section
      aria-label={t('home.mode_region')}
      style={{
        padding: '1rem var(--page-gutter) 1.25rem',
        maxWidth: 'var(--layout-max)',
        margin: '0 auto',
      }}
    >
      <div
        className="mode-entry-cards"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem' }}
      >
        <ModeCard
          kind="delivery"
          label={t('mode.delivery')}
          hint={deliveryHint}
          onClick={() => handleMode('delivery')}
        />
        <ModeCard
          kind="pickup"
          label={t('mode.pickup')}
          hint={pickupHint}
          onClick={() => handleMode('pickup')}
        />
        {dineInAvailable && (
          <ModeCard
            kind="dine_in"
            label="Eat here"
            hint={dineInHint}
            onClick={() => handleMode('dine_in')}
          />
        )}
      </div>
    </section>
  );
}
