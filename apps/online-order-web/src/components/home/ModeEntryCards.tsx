import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchOnlineOrderingStatus, type OnlineOrderingStatus } from '../../api';
import { useOrderMode } from '../../context/OrderModeContext';
import { useLanguage } from '../../context/LanguageContext';
import { useSiteSettingsContext } from '../../context/SiteSettingsContext';
import { Sheet } from '../ui/Sheet';

type ModeKind = 'delivery' | 'pickup' | 'dine_in';

const MODE_IMAGES: Record<ModeKind, string> = {
  delivery: `${import.meta.env.BASE_URL}images/mode-delivery.jpg`,
  pickup: `${import.meta.env.BASE_URL}images/mode-pickup.jpg`,
  dine_in: `${import.meta.env.BASE_URL}images/mode-dinein.jpg`,
};

const DEFAULT_INFO: Record<ModeKind, string> = {
  delivery: 'We bring your order to your door. Choose your address at checkout and track it on the way.',
  pickup: 'Order online, then collect from our shop when it is ready. No need to wait in a queue to order.',
  dine_in: 'Order and pay online, and your table is held for you. Food is ready when you arrive — no prepaid jargon, just a seat waiting.',
};

const DEFAULT_HINTS: Record<ModeKind, string> = {
  delivery: 'Delivered to your door',
  pickup: 'Collect from our shop',
  dine_in: 'Order and pay online — your table is held for you and food is ready when you arrive.',
};

type ModeState = {
  available: boolean;
  /** Owner kill-switch off — never invent a reopening time. */
  ownerDisabled: boolean;
  nextOpenIso: string | null;
};

type CardProps = {
  kind: ModeKind;
  label: string;
  hint: string;
  statusLine: string | null;
  available: boolean;
  cta: string;
  onClick: () => void;
};

function formatWindowTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const timeStr = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? timeStr : `${timeStr} ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
  } catch {
    return '';
  }
}

function ModeCard({ kind, label, hint, statusLine, available, cta, onClick }: CardProps) {
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
      data-testid={`mode-entry-${kind}`}
      data-available={available ? 'true' : 'false'}
      aria-label={statusLine ? `${label}. ${statusLine}` : label}
      style={{
        flex: '1 1 0',
        minWidth: 0,
        border: available
          ? '1.5px solid var(--color-border)'
          : '1.5px solid var(--color-border-strong, var(--color-border))',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
        background: 'var(--color-surface)',
        cursor: 'pointer',
        padding: 0,
        textAlign: 'left',
        fontFamily: 'inherit',
        minHeight: 44,
        opacity: available ? 1 : 0.88,
        boxShadow: available ? undefined : 'inset 0 0 0 1px rgba(0,0,0,0.04)',
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
          filter: available ? undefined : 'grayscale(0.35)',
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
        {!available && statusLine && (
          <span
            data-testid={`mode-status-chip-${kind}`}
            style={{
              position: 'absolute',
              left: 10,
              bottom: 10,
              background: 'rgba(28, 20, 8, 0.82)',
              color: '#fff',
              fontSize: '0.6875rem',
              fontWeight: 700,
              padding: '0.3rem 0.55rem',
              borderRadius: 999,
              letterSpacing: '0.01em',
              maxWidth: 'calc(100% - 20px)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {statusLine}
          </span>
        )}
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
          {available ? hint : (statusLine ?? hint)}
        </p>
        <div
          style={{
            marginTop: '0.625rem',
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: available ? 'var(--color-primary)' : 'var(--color-text-secondary, var(--color-text-muted))',
          }}
        >
          {cta}
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
  return i18nFallback || DEFAULT_HINTS.delivery;
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
  return i18nFallback || DEFAULT_HINTS.pickup;
}

function resolveModeStates(gate: OnlineOrderingStatus): Record<ModeKind, ModeState> {
  const shopOpen = gate.open === true;
  const pickupEnabled = gate.modes?.pickup?.enabled ?? true;
  const deliveryEnabled = gate.modes?.delivery?.enabled ?? true;
  const dineInEnabled = gate.modes?.dine_in?.enabled
    ?? (gate.dine_in_preorder?.enabled ?? false);

  const pickupOpen = gate.modes?.pickup?.open ?? shopOpen;
  const deliveryOpen = gate.modes?.delivery?.open ?? (gate.delivery_available !== false);
  const dineInOpen = gate.modes?.dine_in?.open
    ?? ((gate.dine_in_preorder?.open ?? gate.dine_in_preorder?.enabled) === true && shopOpen);

  return {
    pickup: {
      available: pickupOpen,
      ownerDisabled: pickupEnabled === false,
      nextOpenIso: pickupOpen ? null : (gate.next_open_window ?? null),
    },
    delivery: {
      available: deliveryOpen,
      ownerDisabled: deliveryEnabled === false,
      nextOpenIso: deliveryOpen
        ? null
        : (gate.next_delivery_window ?? gate.next_open_window ?? null),
    },
    dine_in: {
      available: dineInOpen,
      ownerDisabled: dineInEnabled === false,
      nextOpenIso: dineInOpen ? null : (gate.next_open_window ?? null),
    },
  };
}

export function ModeEntryCards() {
  const { setMode } = useOrderMode();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { settings, text } = useSiteSettingsContext();
  const [modeStates, setModeStates] = useState<Record<ModeKind, ModeState>>({
    pickup: { available: true, ownerDisabled: false, nextOpenIso: null },
    delivery: { available: true, ownerDisabled: false, nextOpenIso: null },
    dine_in: { available: false, ownerDisabled: false, nextOpenIso: null },
  });
  const [infoMode, setInfoMode] = useState<ModeKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOnlineOrderingStatus()
      .then((gate) => {
        if (cancelled) return;
        setModeStates(resolveModeStates(gate));
      })
      .catch(() => { /* keep optimistic defaults */ });
    return () => { cancelled = true; };
  }, []);

  const statusAvailable = text('order_mode_status_available', 'Available now');
  const statusUnavailable = text('order_mode_status_unavailable', t('home.mode_unavailable') || 'Unavailable right now');
  const statusUnavailableOpens = text('order_mode_status_unavailable_opens', 'Closed until {time}');
  const learnMore = text('order_mode_learn_more', 'Learn more');

  const statusFor = (state: ModeState): string => {
    if (state.available) return statusAvailable;
    if (state.ownerDisabled) return statusUnavailable;
    const time = formatWindowTime(state.nextOpenIso);
    if (time) return statusUnavailableOpens.replace('{time}', time);
    return statusUnavailable;
  };

  const deliveryHint = buildDeliveryHint(text, settings, t('home.mode_delivery_hint'));
  const pickupHint = buildPickupHint(text, settings, t('home.mode_pickup_hint'));
  const dineInHint = (text('order_mode_dine_in_hint', '') || '').trim() || DEFAULT_HINTS.dine_in;

  const labels: Record<ModeKind, string> = {
    delivery: t('mode.delivery'),
    pickup: t('mode.pickup'),
    dine_in: t('mode.eat_here'),
  };

  const hints: Record<ModeKind, string> = {
    delivery: deliveryHint,
    pickup: pickupHint,
    dine_in: dineInHint,
  };

  const infoCopy = useMemo(() => ({
    delivery: text('order_mode_delivery_info', DEFAULT_INFO.delivery),
    pickup: text('order_mode_pickup_info', DEFAULT_INFO.pickup),
    dine_in: text('order_mode_dine_in_info', DEFAULT_INFO.dine_in),
  }), [text]);

  const startOrder = (mode: ModeKind) => {
    setMode(mode);
    void navigate('/menu');
  };

  const handleCard = (mode: ModeKind) => {
    if (modeStates[mode].available) {
      startOrder(mode);
      return;
    }
    setInfoMode(mode);
  };

  const infoState = infoMode ? modeStates[infoMode] : null;

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
        {(['delivery', 'pickup', 'dine_in'] as ModeKind[]).map((kind) => {
          const state = modeStates[kind];
          const statusLine = state.available ? null : statusFor(state);
          return (
            <ModeCard
              key={kind}
              kind={kind}
              label={labels[kind]}
              hint={hints[kind]}
              statusLine={statusLine}
              available={state.available}
              cta={state.available ? `${labels[kind]} →` : `${learnMore} →`}
              onClick={() => handleCard(kind)}
            />
          );
        })}
      </div>

      <Sheet
        open={infoMode !== null}
        onClose={() => setInfoMode(null)}
        title={infoMode ? labels[infoMode] : undefined}
      >
        {infoMode && infoState && (
          <div data-testid={`mode-info-${infoMode}`} style={{ padding: '0 var(--page-gutter) 1.25rem' }}>
            <p
              data-testid="mode-info-status"
              style={{
                margin: '0 0 0.875rem',
                display: 'inline-block',
                fontSize: '0.8125rem',
                fontWeight: 700,
                padding: '0.35rem 0.7rem',
                borderRadius: 999,
                background: infoState.available
                  ? 'var(--color-success-bg, #ECFDF5)'
                  : 'var(--color-surface-alt)',
                color: infoState.available
                  ? 'var(--color-success, #15803D)'
                  : 'var(--color-text)',
              }}
            >
              {statusFor(infoState)}
            </p>
            <p
              data-testid="mode-info-body"
              style={{
                margin: 0,
                fontSize: '0.9375rem',
                lineHeight: 1.55,
                color: 'var(--color-text)',
              }}
            >
              {infoCopy[infoMode]}
            </p>
            {/* No order / checkout path while unavailable. */}
            <button
              type="button"
              onClick={() => setInfoMode(null)}
              style={{
                marginTop: '1.25rem',
                width: '100%',
                minHeight: 44,
                border: '1.5px solid var(--color-border)',
                borderRadius: 12,
                background: 'var(--color-surface)',
                fontWeight: 700,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--color-text)',
              }}
            >
              {t('sheet.close')}
            </button>
          </div>
        )}
      </Sheet>
    </section>
  );
}
