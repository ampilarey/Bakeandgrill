import { useNavigate } from 'react-router-dom';
import { useOrderMode } from '../../context/OrderModeContext';
import { useLanguage } from '../../context/LanguageContext';

type ModeKind = 'delivery' | 'pickup';

type CardProps = {
  kind: ModeKind;
  label: string;
  hint: string;
  onClick: () => void;
};

function ModeCard({ kind, label, hint, onClick }: CardProps) {
  const icon = kind === 'delivery' ? '🛵' : '🏪';
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
        }}
      >
        {icon}
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

export function ModeEntryCards() {
  const { setMode } = useOrderMode();
  const navigate = useNavigate();
  const { t } = useLanguage();

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
          hint={t('home.mode_delivery_hint')}
          onClick={() => handleMode('delivery')}
        />
        <ModeCard
          kind="pickup"
          label={t('mode.pickup')}
          hint={t('home.mode_pickup_hint')}
          onClick={() => handleMode('pickup')}
        />
      </div>
    </section>
  );
}
