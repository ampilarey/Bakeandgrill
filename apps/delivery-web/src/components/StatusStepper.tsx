import type { DeliveryStatus } from '../types';

const STEPS: { status: DeliveryStatus; label: string; icon: string }[] = [
  { status: 'out_for_delivery', label: 'Assigned',   icon: '📦' },
  { status: 'picked_up',        label: 'Picked Up',  icon: '✅' },
  { status: 'on_the_way',       label: 'On the Way', icon: '🏃' },
  { status: 'delivered',        label: 'Delivered',  icon: '🎉' },
];

const NEXT_ACTION: Partial<Record<DeliveryStatus, { next: DeliveryStatus; label: string }>> = {
  out_for_delivery: { next: 'picked_up',  label: 'Mark as Picked Up'  },
  picked_up:        { next: 'on_the_way', label: 'Start Driving'       },
  on_the_way:       { next: 'delivered',  label: 'Mark as Delivered'   },
};

interface Props {
  status: DeliveryStatus;
  onUpdate: (next: DeliveryStatus) => void;
  loading?: boolean;
}

export default function StatusStepper({ status, onUpdate, loading }: Props) {
  const currentIndex = STEPS.findIndex(s => s.status === status);
  const nextAction = NEXT_ACTION[status];

  return (
    <div>
      {/* Steps */}
      <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', padding: '0 0.25rem', marginBottom: 20 }}>
        {/* Background line */}
        <div style={{
          position: 'absolute', top: 14, left: '1rem', right: '1rem',
          height: 2, background: 'var(--color-border)', zIndex: 0,
        }} />
        {/* Progress line */}
        {currentIndex > 0 && (
          <div style={{
            position: 'absolute', top: 14, left: '1rem',
            height: 2, background: 'var(--color-primary)', zIndex: 0,
            width: `calc(${(currentIndex / (STEPS.length - 1)) * 100}% - 2rem)`,
            transition: 'width 0.4s ease',
          }} />
        )}

        {STEPS.map((step, i) => {
          const done   = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={step.status} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', zIndex: 1 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: (done || active) ? 'var(--color-primary)' : 'var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', transition: 'all 0.3s',
                boxShadow: active ? '0 0 0 5px var(--color-primary-glow)' : 'none',
                transform: active ? 'scale(1.15)' : 'scale(1)',
              }}>
                {step.icon}
              </div>
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, marginTop: 6,
                textAlign: 'center', lineHeight: 1.2, whiteSpace: 'nowrap',
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: (done || active) ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Action button */}
      {nextAction && (
        <button
          onClick={() => onUpdate(nextAction.next)}
          disabled={loading}
          style={{
            width: '100%', height: 48,
            background: loading ? '#9ca3af' : 'var(--color-primary)',
            color: 'white', border: 'none',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.9375rem', fontWeight: 700,
            fontFamily: 'inherit',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            boxShadow: loading ? 'none' : '0 4px 12px var(--color-primary-glow)',
          }}
        >
          {loading ? 'Updating…' : nextAction.label}
        </button>
      )}

      {status === 'delivered' && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.9375rem' }}>
            ✅ Delivery Complete!
          </span>
        </div>
      )}
    </div>
  );
}
