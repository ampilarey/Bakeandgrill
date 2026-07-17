import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrderMode } from '../../context/OrderModeContext';
import { useLanguage } from '../../context/LanguageContext';

type CardProps = {
  label: string;
  hint: string;
  imgSrc: string;
  onClick: () => void;
};

function ModeCard({ label, hint, imgSrc, onClick }: CardProps) {
  const [imgFailed, setImgFailed] = useState(false);

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
      }}
    >
      <div
        style={{
          height: 120,
          overflow: 'hidden',
          background: 'var(--color-surface-alt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!imgFailed ? (
          <img
            src={imgSrc}
            alt=""
            onError={() => setImgFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(145deg, #F7F0E4 0%, #EDE4D4 100%)',
            }}
          />
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

  const handleMode = (mode: 'delivery' | 'pickup') => {
    setMode(mode);
    void navigate('/menu');
  };

  return (
    <section
      aria-label="Choose order mode"
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
          label={t('mode.delivery')}
          hint={t('home.mode_delivery_hint')}
          imgSrc="/images/mode-delivery.jpg"
          onClick={() => handleMode('delivery')}
        />
        <ModeCard
          label={t('mode.pickup')}
          hint={t('home.mode_pickup_hint')}
          imgSrc="/images/mode-pickup.jpg"
          onClick={() => handleMode('pickup')}
        />
      </div>
    </section>
  );
}
