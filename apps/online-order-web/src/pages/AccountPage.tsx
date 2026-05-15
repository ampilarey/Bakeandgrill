import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import {
  getCustomerMe, updateCustomerProfile, changeCustomerPassword,
  revokeCustomerToken, logoutCustomerWebSession, getLoyaltyAccount,
  getMyReservations, cancelMyReservation, getMyFavourites,
  getMyPreOrders, getMyReviews, submitReview, fetchCustomerOrders,
  getMyReferralCode,
} from '../api';
import type {
  AuthCustomer, CustomerReservation, FavouriteItem,
  CustomerPreOrder, CustomerReview, Order,
} from '../api';
import type { LoyaltyAccount } from '@shared/types';
import { AuthBlock } from '../components/AuthBlock';

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: '1.5px solid var(--color-border)',
  borderRadius: 10,
  fontSize: 14,
  fontFamily: 'inherit',
  outline: 'none',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  width: '100%',
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  height: 42, padding: '0 20px',
  background: 'var(--color-primary)', color: '#fff',
  border: 'none', borderRadius: 10,
  fontSize: 14, fontWeight: 700,
  fontFamily: 'inherit', cursor: 'pointer',
};

const alertStyle = (type: 'error' | 'success'): React.CSSProperties => ({
  padding: '10px 14px',
  borderRadius: 10,
  fontSize: 13,
  background: type === 'error' ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
  color: type === 'error' ? 'var(--color-error)' : 'var(--color-success)',
  border: `1px solid ${type === 'error' ? 'var(--color-error)' : 'var(--color-success)'}`,
});

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      padding: '20px 24px',
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-dark)', margin: '0 0 18px' }}>{title}</h2>
      {children}
    </div>
  );
}

const TIER_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  bronze:   { bg: 'var(--tier-bronze-bg)',   text: 'var(--tier-bronze-text)',   border: 'var(--tier-bronze-border)' },
  silver:   { bg: 'var(--tier-silver-bg)',   text: 'var(--tier-silver-text)',   border: 'var(--tier-silver-border)' },
  gold:     { bg: 'var(--tier-gold-bg)',     text: 'var(--tier-gold-text)',     border: 'var(--tier-gold-border)' },
  platinum: { bg: 'var(--tier-platinum-bg)', text: 'var(--tier-platinum-text)', border: 'var(--tier-platinum-border)' },
};

export function AccountPage() {
  usePageTitle('My Account');
  const navigate = useNavigate();
  const { token, authReady, setAuth, clearAuth, customerName } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'reservations' | 'favourites' | 'preorders' | 'reviews' | 'loyalty' | 'referrals'>('profile');

  const [customer, setCustomer] = useState<AuthCustomer | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loyalty, setLoyalty] = useState<LoyaltyAccount | null>(null);
  const [loyaltyError, setLoyaltyError] = useState('');

  // Reservations
  const [reservations, setReservations] = useState<CustomerReservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(false);
  const [reservationsError, setReservationsError] = useState('');
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  // Favourites
  const [favourites, setFavourites] = useState<FavouriteItem[]>([]);
  const [favouritesLoading, setFavouritesLoading] = useState(false);
  const [favouritesError, setFavouritesError] = useState('');

  // Pre-orders
  const [preOrders, setPreOrders] = useState<CustomerPreOrder[]>([]);
  const [preOrdersLoading, setPreOrdersLoading] = useState(false);
  const [preOrdersError, setPreOrdersError] = useState('');

  // Reviews
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');

  // Write review state
  const [reviewableOrders, setReviewableOrders] = useState<Order[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewOrderId, setReviewOrderId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewAnon, setReviewAnon] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitError, setReviewSubmitError] = useState('');

  // Referrals
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralUses, setReferralUses] = useState(0);
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState('');
  const [referralCopied, setReferralCopied] = useState(false);

  // Profile edit state
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Password change state
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!authReady || !token) return;
    setLoadingProfile(true);
    getCustomerMe(token)
      .then((res) => {
        setCustomer(res.customer as AuthCustomer);
        setProfileForm({ name: res.customer.name ?? '', email: (res.customer as AuthCustomer).email ?? '' });
      })
      .catch((e: Error) => setProfileMsg({ type: 'error', text: e.message || 'Failed to load profile.' }))
      .finally(() => setLoadingProfile(false));
    getLoyaltyAccount(token)
      .then(({ account }) => setLoyalty(account))
      .catch((e: Error) => setLoyaltyError(e.message || 'Failed to load loyalty account.'));
  }, [token, authReady]);

  useEffect(() => {
    if (!authReady || !token || activeTab !== 'reservations' || reservations.length > 0) return;
    setReservationsLoading(true);
    getMyReservations(token)
      .then((res) => setReservations(res.data ?? []))
      .catch((e: Error) => setReservationsError(e.message || 'Failed to load reservations.'))
      .finally(() => setReservationsLoading(false));
  }, [token, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !token || activeTab !== 'favourites') return;
    setFavouritesLoading(true);
    getMyFavourites(token)
      .then((res) => setFavourites(res.data ?? []))
      .catch((e: Error) => setFavouritesError(e.message || 'Failed to load favourites.'))
      .finally(() => setFavouritesLoading(false));
  }, [token, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !token || activeTab !== 'preorders' || preOrders.length > 0) return;
    setPreOrdersLoading(true);
    getMyPreOrders(token)
      .then((res) => setPreOrders(res.data ?? []))
      .catch((e: Error) => setPreOrdersError(e.message || 'Failed to load pre-orders.'))
      .finally(() => setPreOrdersLoading(false));
  }, [token, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !token || activeTab !== 'reviews') return;
    setReviewsLoading(true);
    Promise.all([
      getMyReviews(token),
      fetchCustomerOrders(token),
    ])
      .then(([reviewRes, orderRes]) => {
        const myReviews = reviewRes.data ?? [];
        setReviews(myReviews);
        // Completed orders that haven't been reviewed yet
        const reviewedOrderIds = new Set(myReviews.map((r) => r.order?.id).filter(Boolean));
        const completed = (Array.isArray(orderRes) ? orderRes : (orderRes as { data: Order[] }).data ?? [])
          .filter((o: Order) => o.status === 'completed' && !reviewedOrderIds.has(o.id));
        setReviewableOrders(completed.slice(0, 10));
      })
      .catch((e: Error) => setReviewsError(e.message || 'Failed to load reviews.'))
      .finally(() => setReviewsLoading(false));
  }, [token, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !token || activeTab !== 'referrals' || referralCode !== null) return;
    setReferralLoading(true);
    getMyReferralCode(token)
      .then((r) => { setReferralCode(r.code); setReferralUses(r.uses_count); setReferralDiscount(r.referee_discount_mvr); })
      .catch((e: Error) => setReferralError(e.message || 'Failed to load referral code.'))
      .finally(() => setReferralLoading(false));
  }, [token, authReady, activeTab]);

  const handleAuthSuccess = (tok: string, name: string) => setAuth(tok, name);

  const handleCancelReservation = async (id: number) => {
    if (!token) return;
    setCancellingId(id);
    try {
      await cancelMyReservation(token, id);
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: 'cancelled' } : r));
    } catch (e) {
      setReservationsError((e as Error).message || 'Could not cancel reservation.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleLogout = async () => {
    const currentToken = token;
    clearAuth();
    navigate('/');
    try {
      if (currentToken) await revokeCustomerToken(currentToken);
      await logoutCustomerWebSession();
    } catch {
      /* ignore — local state already cleared */
    }
  };

  const handleSaveProfile = async () => {
    if (!token) return;
    setSavingProfile(true); setProfileMsg(null);
    try {
      const res = await updateCustomerProfile(token, {
        name: profileForm.name || undefined,
        email: profileForm.email || undefined,
      });
      setCustomer(res.customer);
      setProfileMsg({ type: 'success', text: 'Profile updated.' });
    } catch (e) {
      setProfileMsg({ type: 'error', text: (e as Error).message || 'Could not save changes.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!token) return;
    if (!pwForm.current_password || !pwForm.new_password) {
      setPwMsg({ type: 'error', text: 'Please fill in all password fields.' });
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (pwForm.new_password.length < 8) {
      setPwMsg({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }
    setSavingPw(true); setPwMsg(null);
    try {
      await changeCustomerPassword(token, {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
    } catch (e) {
      setPwMsg({ type: 'error', text: (e as Error).message || 'Could not change password. Check your current password.' });
    } finally {
      setSavingPw(false);
    }
  };

  if (!authReady) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem var(--page-gutter)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '2rem var(--page-gutter)' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>My Account</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.375rem 0 0' }}>
            Log in to view and manage your account.
          </p>
        </div>
        <AuthBlock onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 20, border: 'none',
    background: active ? 'var(--color-primary)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text-muted)',
    fontSize: 13, fontWeight: active ? 700 : 500,
    fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  });

  const statusBadge = (s: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      confirmed: { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
      pending:   { bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' },
      cancelled: { bg: 'var(--color-error-bg)',   color: 'var(--color-error)' },
      no_show:   { bg: 'var(--color-surface-alt)', color: 'var(--color-text-muted)' },
      completed: { bg: 'var(--color-primary-light)', color: 'var(--color-primary)' },
    };
    const c = colors[s] ?? { bg: '#F3F4F6', color: '#374151' };
    return (
      <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, textTransform: 'capitalize' }}>
        {s.split('_').join(' ')}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>My Account</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.375rem 0 0' }}>
          Hi, {customerName ?? customer?.name ?? 'there'}
        </p>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
        {([
          { id: 'profile',      label: '👤 Profile'       },
          { id: 'loyalty',      label: '⭐ Loyalty'       },
          { id: 'referrals',    label: '🎁 Referrals'     },
          { id: 'reservations', label: '🗓 Reservations'  },
          { id: 'favourites',   label: '❤️ Favourites'    },
          { id: 'preorders',    label: '📦 Pre-orders'    },
          { id: 'reviews',      label: '✍️ Reviews'       },
        ] as const).map(({ id, label }) => (
          <button key={id} style={tabStyle(activeTab === id)} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      {/* Quick links — show only on profile tab */}
      {activeTab === 'profile' && (<>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Link
          to="/order-history"
          style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: '16px 18px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            textDecoration: 'none',
          }}
        >
          <span style={{ fontSize: 22 }}>🧾</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)' }}>Order History</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>View past orders</span>
        </Link>

        {loyalty ? (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: '16px 18px',
            background: TIER_COLOR[loyalty.tier]?.bg ?? '#FEF3E2',
            border: `1px solid ${TIER_COLOR[loyalty.tier]?.border ?? '#FCD34D'}`,
            borderRadius: 14,
          }}>
            <span style={{ fontSize: 22 }}>⭐</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E' }}>
              {loyalty.points_balance.toLocaleString()} pts
            </span>
            <span style={{ fontSize: 12, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', opacity: 0.75, textTransform: 'capitalize' }}>
              {loyalty.tier} member
              {loyalty.lifetime_points != null ? ` · ${loyalty.lifetime_points.toLocaleString()} lifetime` : ''}
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: '16px 18px',
            background: loyaltyError ? '#FEF2F2' : 'var(--color-surface)',
            border: loyaltyError ? '1px solid #FECACA' : '1px solid var(--color-border)',
            borderRadius: 14,
          }}>
            <span style={{ fontSize: 22 }}>⭐</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)' }}>Loyalty Points</span>
            {loyaltyError && <span style={{ fontSize: 12, color: '#DC2626' }}>{loyaltyError}</span>}
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Earn 1 pt per MVR 1</span>
          </div>
        )}
      </div>

      {/* Profile section */}
      <SectionCard title="Profile">
        {loadingProfile ? (
          <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {profileMsg && <div style={alertStyle(profileMsg.type)}>{profileMsg.text}</div>}

            <FieldRow label="Phone">
              <input
                style={{ ...inputStyle, background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', cursor: 'not-allowed' }}
                value={customer?.phone ?? ''}
                readOnly
              />
            </FieldRow>

            <FieldRow label="Name">
              <input
                style={inputStyle}
                value={profileForm.name}
                onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
              />
            </FieldRow>

            <FieldRow label="Email">
              <input
                type="email"
                style={inputStyle}
                value={profileForm.email}
                onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </FieldRow>

            <button
              style={{ ...btnStyle, opacity: savingProfile ? 0.6 : 1, cursor: savingProfile ? 'not-allowed' : 'pointer' }}
              onClick={() => void handleSaveProfile()}
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </SectionCard>

      {/* Password section */}
      <SectionCard title="Change Password">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {pwMsg && <div style={alertStyle(pwMsg.type)}>{pwMsg.text}</div>}

          <FieldRow label="Current Password">
            <input
              type="password"
              style={inputStyle}
              value={pwForm.current_password}
              onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
              autoComplete="current-password"
            />
          </FieldRow>

          <FieldRow label="New Password">
            <input
              type="password"
              style={inputStyle}
              value={pwForm.new_password}
              onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
              autoComplete="new-password"
            />
          </FieldRow>

          <FieldRow label="Confirm New Password">
            <input
              type="password"
              style={inputStyle}
              value={pwForm.confirm_password}
              onChange={(e) => setPwForm((f) => ({ ...f, confirm_password: e.target.value }))}
              autoComplete="new-password"
            />
          </FieldRow>

          <button
            style={{ ...btnStyle, opacity: savingPw ? 0.6 : 1, cursor: savingPw ? 'not-allowed' : 'pointer' }}
            onClick={() => void handleChangePassword()}
            disabled={savingPw}
          >
            {savingPw ? 'Changing…' : 'Change Password'}
          </button>
        </div>
      </SectionCard>

      {/* Sign out */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => void handleLogout()}
          style={{
            padding: '10px 20px',
            background: 'transparent',
            border: '1.5px solid var(--color-error, #dc2626)',
            borderRadius: 10,
            fontSize: 14, fontWeight: 600,
            color: 'var(--color-error, #dc2626)',
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </div>
      </>)}

      {/* ── Reservations tab ── */}
      {activeTab === 'reservations' && (
        <SectionCard title="My Reservations">
          {reservationsLoading ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
          ) : reservationsError ? (
            <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{reservationsError}</p>
          ) : reservations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 32, margin: '0 0 8px' }}>🗓</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No reservations yet.</p>
              <Link to="/reservations" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, color: 'var(--color-primary)', fontWeight: 700 }}>
                Book a table →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reservations.map((r) => (
                <div key={r.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>
                        {new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {r.time_slot?.slice(0, 5) ?? ''}
                      </span>
                      {statusBadge(r.status)}
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      Party of {r.party_size}{r.notes ? ` · ${r.notes}` : ''}
                    </span>
                  </div>
                  {['confirmed', 'pending'].includes(r.status) && (
                    <button
                      onClick={() => void handleCancelReservation(r.id)}
                      disabled={cancellingId === r.id}
                      style={{ padding: '6px 14px', border: '1px solid var(--color-error, #dc2626)', borderRadius: 8, background: 'transparent', color: 'var(--color-error, #dc2626)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: cancellingId === r.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                    >
                      {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Favourites tab ── */}
      {activeTab === 'favourites' && (
        <SectionCard title="My Favourites">
          {favouritesLoading ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
          ) : favouritesError ? (
            <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{favouritesError}</p>
          ) : favourites.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 32, margin: '0 0 8px' }}>❤️</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No favourites yet.</p>
              <Link to="/menu" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, color: 'var(--color-primary)', fontWeight: 700 }}>
                Browse the menu →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {favourites.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, border: '1px solid var(--color-border)', borderRadius: 12, padding: '12px 14px' }}>
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>{item.name}</p>
                    {item.category && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{item.category}</p>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-primary)' }}>MVR {Number(item.base_price).toFixed(2)}</p>
                    {!item.is_available && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>Unavailable</p>}
                  </div>
                </div>
              ))}
              <Link to="/menu" style={{ textAlign: 'center', display: 'block', marginTop: 8, fontSize: 13, color: 'var(--color-primary)', fontWeight: 600 }}>
                Add more from the menu →
              </Link>
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Pre-orders tab ── */}
      {activeTab === 'preorders' && (
        <SectionCard title="My Pre-orders & Catering">
          {preOrdersLoading ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
          ) : preOrdersError ? (
            <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{preOrdersError}</p>
          ) : preOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 32, margin: '0 0 8px' }}>📦</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No pre-orders yet.</p>
              <Link to="/pre-order" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, color: 'var(--color-primary)', fontWeight: 700 }}>
                Place a pre-order →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {preOrders.map((po) => (
                <div key={po.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>
                        {po.event_name ?? `Pre-order #${po.order_number}`}
                      </span>
                      {statusBadge(po.status)}
                    </div>
                    {po.event_date && (
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                        Event: {new Date(po.event_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Ordered {new Date(po.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                    MVR {Number(po.total ?? 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* ── Reviews tab ── */}
      {activeTab === 'reviews' && (
        <>
          {/* Write a review */}
          {reviewableOrders.length > 0 && !showReviewForm && (
            <SectionCard title="Leave a Review">
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                You have {reviewableOrders.length} completed order{reviewableOrders.length !== 1 ? 's' : ''} waiting for a review.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reviewableOrders.map((o) => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', background: 'var(--color-surface-alt)', borderRadius: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-dark)' }}>
                      #{o.order_number ?? o.id} · MVR {Number(o.total).toFixed(2)}
                    </span>
                    <button
                      onClick={() => { setReviewOrderId(o.id); setReviewRating(5); setReviewComment(''); setReviewAnon(false); setReviewSubmitError(''); setShowReviewForm(true); }}
                      style={{ fontSize: 12, fontWeight: 700, padding: '6px 14px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      ⭐ Review
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Review form */}
          {showReviewForm && (
            <SectionCard title="Write a Review">
              {reviewSubmitError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{reviewSubmitError}</p>}
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-dark)', margin: '0 0 8px' }}>Your Rating</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1,2,3,4,5].map((star) => (
                    <button key={star} onClick={() => setReviewRating(star)}
                      style={{ fontSize: 28, background: 'none', border: 'none', cursor: 'pointer', color: star <= reviewRating ? '#F59E0B' : '#D1D5DB', padding: 0, lineHeight: 1 }}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-dark)', margin: '0 0 6px' }}>Comment (optional)</p>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Tell us about your experience…"
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16, cursor: 'pointer' }}>
                <input type="checkbox" checked={reviewAnon} onChange={(e) => setReviewAnon(e.target.checked)} />
                Post anonymously
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowReviewForm(false)}
                  style={{ flex: 1, padding: '10px', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  disabled={submittingReview}
                  onClick={async () => {
                    if (!token || !reviewOrderId) return;
                    setSubmittingReview(true); setReviewSubmitError('');
                    try {
                      await submitReview(token, { order_id: reviewOrderId, rating: reviewRating, comment: reviewComment, is_anonymous: reviewAnon });
                      setShowReviewForm(false);
                      setReviewableOrders((rs) => rs.filter((o) => o.id !== reviewOrderId));
                      // Force refresh reviews list
                      setReviews([]);
                      setReviewsLoading(true);
                      getMyReviews(token).then((res) => setReviews(res.data)).finally(() => setReviewsLoading(false));
                    } catch (e: unknown) { setReviewSubmitError((e as Error).message || 'Failed to submit review.'); }
                    finally { setSubmittingReview(false); }
                  }}
                  style={{ flex: 2, padding: '10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: submittingReview ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submittingReview ? 0.7 : 1 }}
                >
                  {submittingReview ? 'Submitting…' : 'Submit Review'}
                </button>
              </div>
            </SectionCard>
          )}

          <SectionCard title="My Reviews">
            {reviewsLoading ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>Loading…</p>
            ) : reviewsError ? (
              <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{reviewsError}</p>
            ) : reviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>⭐</p>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>No reviews yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {reviews.map((rv) => (
                  <div key={rv.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} style={{ fontSize: 14, color: i < rv.rating ? '#F59E0B' : '#D1D5DB' }}>★</span>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {statusBadge(rv.status)}
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                          {new Date(rv.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {rv.item && <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--color-dark)' }}>{rv.item.name}</p>}
                    {rv.comment && <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-muted)' }}>{rv.comment}</p>}
                    {rv.is_anonymous && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>Posted anonymously</p>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* ── Loyalty tab ── */}
      {activeTab === 'loyalty' && (
        <>
          {loyaltyError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{loyaltyError}</p>}
          {loyalty ? (
            <>
              {/* Tier hero card */}
              <div style={{
                background: TIER_COLOR[loyalty.tier]?.bg ?? '#FEF3E2',
                border: `2px solid ${TIER_COLOR[loyalty.tier]?.border ?? '#FCD34D'}`,
                borderRadius: 18, padding: '24px 20px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>
                  {loyalty.tier === 'gold' ? '🥇' : loyalty.tier === 'silver' ? '🥈' : loyalty.tier === 'platinum' ? '💎' : '🥉'}
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', margin: '0 0 4px' }}>
                  {loyalty.tier} Member
                </p>
                <p style={{ fontSize: 36, fontWeight: 900, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', margin: '0 0 4px' }}>
                  {loyalty.points_balance.toLocaleString()} pts
                </p>
                <p style={{ fontSize: 13, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', opacity: 0.7, margin: 0 }}>
                  {loyalty.lifetime_points != null ? `${loyalty.lifetime_points.toLocaleString()} lifetime points earned` : ''}
                </p>
              </div>

              {/* Tier progress bar */}
              {(() => {
                const TIERS = [
                  { key: 'bronze',   label: 'Bronze',   threshold: 0,     next: 1000,  icon: '🥉' },
                  { key: 'silver',   label: 'Silver',   threshold: 1000,  next: 5000,  icon: '🥈' },
                  { key: 'gold',     label: 'Gold',     threshold: 5000,  next: 15000, icon: '🥇' },
                  { key: 'platinum', label: 'Platinum', threshold: 15000, next: null,  icon: '💎' },
                ];
                const lifePoints = loyalty.lifetime_points ?? 0;
                const currentIdx = TIERS.findIndex((t) => t.key === loyalty.tier);
                const current = TIERS[currentIdx] ?? TIERS[0];
                const nextTier = TIERS[currentIdx + 1];
                if (!nextTier) {
                  return (
                    <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--color-surface-alt)', borderRadius: 12, fontSize: 13, color: 'var(--tier-platinum-text)', fontWeight: 600 }}>
                      💎 You've reached Platinum — the highest tier!
                    </div>
                  );
                }
                const progress = Math.min(1, Math.max(0, (lifePoints - current.threshold) / (nextTier.threshold - current.threshold)));
                const ptsLeft = nextTier.threshold - lifePoints;
                return (
                  <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{current.icon} {current.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: TIER_COLOR[nextTier.key]?.text ?? '#92400E' }}>{nextTier.icon} {nextTier.label}</span>
                    </div>
                    <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${(progress * 100).toFixed(1)}%`, background: TIER_COLOR[loyalty.tier]?.border ?? '#FCD34D', borderRadius: 999, transition: 'width 0.4s ease' }} />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, textAlign: 'center' }}>
                      {ptsLeft > 0 ? <><strong>{ptsLeft.toLocaleString()} pts</strong> to reach {nextTier.label}</> : `You've reached ${nextTier.label}!`}
                    </p>
                  </div>
                );
              })()}

              {/* How to earn */}
              <SectionCard title="How to Earn Points">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { icon: '🛒', label: 'Every MVR 1 spent', detail: 'Earn 1 point on every order' },
                    { icon: '🎂', label: 'Birthday bonus', detail: 'Extra points on your birthday month' },
                    { icon: '🎁', label: 'Refer a friend', detail: `Earn bonus points when friends join` },
                  ].map((row) => (
                    <div key={row.label} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <span style={{ fontSize: 26, flexShrink: 0 }}>{row.icon}</span>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-dark)', margin: '0 0 2px' }}>{row.label}</p>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{row.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* How to redeem */}
              <SectionCard title="Redeeming Points">
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
                  Apply your points at checkout to get a discount on your next order. Every <strong>100 points = MVR 1</strong> off.
                </p>
                {loyalty.points_balance >= 100 && (
                  <div style={{ background: 'var(--color-success-bg, #DCFCE7)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--color-success, #15803D)', fontWeight: 600 }}>
                    🎉 You can redeem up to MVR {Math.floor(loyalty.points_balance / 100).toFixed(2)} on your next order!
                  </div>
                )}
              </SectionCard>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: 36, margin: '0 0 8px' }}>⭐</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>Place your first order to start earning loyalty points.</p>
            </div>
          )}
        </>
      )}

      {/* ── Referrals tab ── */}
      {activeTab === 'referrals' && (
        <>
          {referralError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{referralError}</p>}
          {referralLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>Loading…</div>
          ) : referralCode ? (
            <>
              {/* Code card */}
              <div style={{
                background: 'linear-gradient(135deg, #FEF3E2 0%, #FDE68A 100%)',
                border: '2px solid #FCD34D', borderRadius: 18, padding: '28px 20px', textAlign: 'center',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92400E', margin: '0 0 10px' }}>
                  Your Referral Code
                </p>
                <p style={{ fontSize: 34, fontWeight: 900, letterSpacing: '0.15em', color: '#78350F', margin: '0 0 16px', fontFamily: 'monospace' }}>
                  {referralCode}
                </p>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(referralCode);
                    setReferralCopied(true);
                    setTimeout(() => setReferralCopied(false), 2000);
                  }}
                  style={{ ...btnStyle, background: referralCopied ? '#15803D' : '#D97706', fontSize: 13, height: 40, padding: '0 24px' }}
                >
                  {referralCopied ? '✓ Copied!' : '📋 Copy Code'}
                </button>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-primary)', margin: '0 0 4px' }}>{referralUses}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Friends joined</p>
                </div>
                <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: 32, fontWeight: 900, color: '#15803D', margin: '0 0 4px' }}>MVR {referralDiscount.toFixed(2)}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>Discount per referral</p>
                </div>
              </div>

              {/* How it works */}
              <SectionCard title="How Referrals Work">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { step: '1', text: `Share your code "${referralCode}" with friends` },
                    { step: '2', text: 'They enter your code during checkout' },
                    { step: '3', text: `They get MVR ${referralDiscount.toFixed(2)} off their first order` },
                    { step: '4', text: 'You earn bonus loyalty points once they order' },
                  ].map(({ step, text }) => (
                    <div key={step} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        {step}
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{text}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Share link */}
              <SectionCard title="Share Your Link">
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                  Send this link to friends — the referral code is pre-filled for them.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    readOnly
                    value={`${window.location.origin}/?ref=${referralCode}`}
                    style={{ ...inputStyle, flex: 1, fontSize: 12, color: 'var(--color-text-muted)' }}
                  />
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/?ref=${referralCode}`);
                      setReferralCopied(true);
                      setTimeout(() => setReferralCopied(false), 2000);
                    }}
                    style={{ ...btnStyle, padding: '0 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                  >
                    {referralCopied ? '✓' : 'Copy'}
                  </button>
                </div>
              </SectionCard>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: 36, margin: '0 0 8px' }}>🎁</p>
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>Place your first order to unlock your referral code.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AccountPage;
