// "Tell me when it's back" / "Tell me when it's on sale" under a dish that
// cannot be ordered now (iruali import plan, feature 8). The shop texts the
// customer once when the dish can be ordered again, while it is open.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing } from 'lucide-react';
import { getItemAlerts, setItemAlert } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

/** Reasons a waiting customer can be told about; closed hours and channels are not. */
const ALERTABLE = ['out_of_stock', 'snoozed', 'item_unavailable'];

export function canAskForItemAlert(item: { coming_soon_until?: string | null; unavailable_reason?: string | null }): boolean {
  return Boolean(item.coming_soon_until) || ALERTABLE.includes(item.unavailable_reason ?? '');
}

export function ItemAlertButton({ itemId, comingSoon }: { itemId: number; comingSoon: boolean }) {
  const { isAuthenticated, authReady } = useAuth();
  const { t } = useLanguage();
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    let live = true;
    getItemAlerts()
      .then((res) => { if (live) setWaiting(res.item_ids.includes(itemId)); })
      .catch(() => {});
    return () => { live = false; };
  }, [authReady, isAuthenticated, itemId]);

  if (!authReady) return null;

  if (!isAuthenticated) {
    return (
      <Link
        to="/account"
        data-testid="item-alert-sign-in"
        style={{ display: 'block', marginTop: 10, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}
      >
        {t('itemAlert.sign_in')}
      </Link>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await setItemAlert(itemId, !waiting);
      setWaiting(res.waiting);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const label = waiting
    ? t(comingSoon ? 'itemAlert.waiting_launch' : 'itemAlert.waiting_back')
    : t(comingSoon ? 'itemAlert.launch' : 'itemAlert.back');
  const Icon = waiting ? BellRing : Bell;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={waiting}
        data-testid="item-alert"
        style={{
          width: '100%', marginTop: 10, padding: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: waiting ? 'var(--color-surface-alt)' : 'var(--color-surface)',
          color: 'var(--color-primary)', border: '1.5px solid var(--color-primary)', borderRadius: 14,
          fontSize: 14, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit',
        }}
      >
        <Icon size={16} aria-hidden />
        {label}
      </button>
      {error && (
        <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, textAlign: 'center', color: 'var(--color-danger)' }}>
          {t('itemAlert.error')}
        </p>
      )}
    </>
  );
}
