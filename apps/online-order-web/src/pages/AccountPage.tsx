import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import {
  getCustomerMe, updateCustomerProfile, changeCustomerPassword,
  revokeCustomerToken, logoutCustomerWebSession, getLoyaltyAccount,
  getMyReservations, cancelMyReservation, getMyFavourites,
  getMyPreOrders, getMyReviews, submitReview, fetchCustomerOrders,
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
  bronze:   { bg: '#FEF3E2', text: '#92400E', border: '#FCD34D' },
  silver:   { bg: '#F1F5F9', text: '#475569', border: '#CBD5E1' },
  gold:     { bg: '#FFFBEB', text: '#92400E', border: '#FCD34D' },
  platinum: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
};

export function AccountPage() {
  usePageTitle('My Account');
  const navigate = useNavigate();
  const { token, authReady, setAuth, clearAuth, customerName } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'reservations' | 'favourites' | 'preorders' | 'reviews'>('profile');

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
      confirmed: { bg: '#DCFCE7', color: '#15803D' },
      pending:   { bg: '#FEF3C7', color: '#92400E' },
      cancelled: { bg: '#FEE2E2', color: '#991B1B' },
      no_show:   { bg: '#F3F4F6', color: '#6B7280' },
      completed: { bg: '#EFF6FF', color: '#1D4ED8' },
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
          { id: 'reservations', label: '🗓 Reservations'  },
          { id: 'favourites',   label: '❤️ Favourites'    },
          { id: 'preorders',    label: '📦 Pre-orders'    },
          { id: 'reviews',      label: '⭐ My Reviews'    },
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
    </div>
  );
}

export default AccountPage;
