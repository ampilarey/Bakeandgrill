import { useState, type FormEvent } from 'react';
import { submitNotifyMe } from '../api/serviceStatus';
import { ApiRequestError } from '@shared/api';

type Props = {
  serviceKey: string;
  incidentId?: number | null;
  onSuccess?: () => void;
  compact?: boolean;
};

/**
 * Restoration signup form. Backend returns identical generic success for
 * new/duplicate signups so we never leak whether the number was known.
 *
 * The endpoint is added in Stage 6; before that ships this form gracefully
 * degrades to a "not available yet" hint on 404 without breaking the modal.
 */
export function NotifyMeForm({ serviceKey, incidentId, onSuccess, compact = false }: Props) {
  const [mobile, setMobile] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [notReady, setNotReady] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError('Please tap the consent checkbox before we send you an SMS.');
      return;
    }
    if (!/^[+9603679\d\s-]{7,20}$/.test(mobile.trim())) {
      setError('Enter a valid Maldivian mobile (e.g. 7777777).');
      return;
    }
    setBusy(true);
    try {
      await submitNotifyMe({
        service_key: serviceKey,
        mobile: mobile.trim(),
        incident_id: incidentId ?? undefined,
      });
      setDone(true);
      onSuccess?.();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setNotReady(true);
        return;
      }
      const message = err instanceof Error ? err.message : 'Could not sign up. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (notReady) {
    return (
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: 0 }}>
        Notify-me signup isn&apos;t available yet — please check back shortly.
      </p>
    );
  }

  if (done) {
    return (
      <p
        role="status"
        aria-live="polite"
        style={{
          fontSize: '0.9rem',
          color: 'var(--color-success, #166534)',
          margin: 0,
          fontWeight: 600,
        }}
      >
        We&apos;ll text you once this service is back. Thanks!
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} data-testid="notify-me-form" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
        Mobile (Maldives)
        <input
          type="tel"
          inputMode="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="7XXXXXX"
          required
          disabled={busy}
          aria-label="Your Maldivian mobile number"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 4,
            padding: '0.55rem 0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            minHeight: 44,
          }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy}
          style={{ marginTop: 3 }}
        />
        <span>
          I agree to receive one SMS from Bake &amp; Grill when this service is back. Standard SMS rates may apply.
        </span>
      </label>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-danger, #b91c1c)' }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        style={{
          minHeight: 44,
          padding: compact ? '0.55rem 1rem' : '0.75rem 1.25rem',
          border: 'none',
          borderRadius: 10,
          background: busy ? 'var(--color-text-muted)' : 'var(--color-primary)',
          color: 'white',
          fontWeight: 700,
          fontSize: '0.9rem',
          fontFamily: 'inherit',
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Signing up…' : "Notify me when it's back"}
      </button>
    </form>
  );
}
