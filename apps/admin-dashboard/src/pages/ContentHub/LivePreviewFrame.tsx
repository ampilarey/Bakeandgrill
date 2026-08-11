import { useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

type Device = 'desktop' | 'mobile';

type Props = {
  url: string | null;
  loading?: boolean;
};

const WIDTHS: Record<Device, number> = {
  desktop: 1280,
  mobile: 390,
};

/** Iframe of the real page with Desktop / Mobile width toggle. */
export function LivePreviewFrame({ url, loading }: Props) {
  const [device, setDevice] = useState<Device>('desktop');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setTick((t) => t + 1);
  }, [url]);

  return (
    <div data-testid="live-preview-frame" style={{
      background: 'var(--color-text)', borderRadius: 14, border: '1px solid var(--color-border)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', minHeight: 420,
    }}>
      <div style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center', borderBottom: '1px solid #3a2f24' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
          Live preview
        </span>
        {(['desktop', 'mobile'] as const).map((d) => (
          <button
            key={d}
            type="button"
            data-testid={`preview-device-${d}`}
            onClick={() => setDevice(d)}
            style={{
              height: 32, padding: '0 10px', borderRadius: 8,
              background: device === d ? 'var(--color-primary)' : '#2a2118', color: '#fff',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {d === 'desktop' ? <Monitor size={14} /> : <Smartphone size={14} />}
            {d === 'desktop' ? 'Desktop' : 'Mobile'}
          </button>
        ))}
      </div>
      <div style={{
        flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'stretch',
        padding: 12, background: '#2a2118', overflow: 'auto',
      }}>
        {loading || !url ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13, alignSelf: 'center' }}>
            {loading
              ? 'Refreshing preview…'
              : 'Preview updates as you edit. Publish to make live for customers.'}
          </p>
        ) : (
          <iframe
            key={`${url}-${tick}-${device}`}
            title="Content preview"
            src={url}
            style={{
              width: WIDTHS[device],
              maxWidth: '100%',
              height: 560,
              border: 'none',
              borderRadius: 10,
              background: 'var(--color-surface)',
            }}
          />
        )}
      </div>
    </div>
  );
}
