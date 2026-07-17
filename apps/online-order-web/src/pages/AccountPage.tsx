import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import {
  getLoyaltyAccount,
  getMyReservations, cancelMyReservation, getMyFavourites,
  getMyPreOrders, getMyReviews, submitReview, fetchCustomerOrders,
  getMyReferralCode,
  getCustomerCredit,
  getCustomerDepositLedger,
  updateCustomerCreditPreferences,
} from '../api';
import type {
  CustomerReservation, FavouriteItem,
  CustomerPreOrder, CustomerReview, Order,
  CustomerCreditSummary, CustomerCreditInvoice,
  CustomerDepositSummary, CustomerDepositTransaction,
} from '../api';
import type { LoyaltyAccount, LoyaltyTierProgress } from '@shared/types';
import { AuthBlock } from '../components/AuthBlock';
import { AddressesSection } from './AccountPage/AddressesSection';
import { ProfileSection } from './AccountPage/ProfileSection';
import {
  SectionCard, TIER_COLOR, btnStyle, inputStyle, statusBadge, tabStyle,
} from './AccountPage/accountShared';
import { useAccountAddresses } from './AccountPage/useAccountAddresses';
import { useAccountProfile } from './AccountPage/useAccountProfile';
import { AccountChromeBlocks } from './AccountPage/AccountChromeBlocks';

export function AccountPage() {
  usePageTitle('My Account');
  const navigate = useNavigate();
  const { isAuthenticated, authReady, setAuth, clearAuth, customerName } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'addresses' | 'reservations' | 'favourites' | 'preorders' | 'reviews' | 'loyalty' | 'referrals' | 'credit' | 'deposit'>('profile');

  const profile = useAccountProfile(isAuthenticated, authReady);
  const addresses = useAccountAddresses(isAuthenticated, authReady, activeTab, profile.customer, customerName);
  const { customer } = profile;

  const [loyalty, setLoyalty] = useState<LoyaltyAccount | null>(null);
  const [loyaltyTierProgress, setLoyaltyTierProgress] = useState<LoyaltyTierProgress | null>(null);
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
  const [reviewsPage, setReviewsPage] = useState(1);
  const [reviewsTotalPages, setReviewsTotalPages] = useState(1);

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

  // Credit account
  const [credit, setCredit] = useState<(CustomerCreditSummary & { open_invoices: CustomerCreditInvoice[] }) | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState('');
  const [creditLoaded, setCreditLoaded] = useState(false);
  const [reminderSaving, setReminderSaving] = useState(false);

  // Deposit account
  const [deposit, setDeposit] = useState<CustomerDepositSummary | null>(null);
  const [depositTransactions, setDepositTransactions] = useState<CustomerDepositTransaction[]>([]);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState('');
  const [depositLoaded, setDepositLoaded] = useState(false);

  useEffect(() => {
    if (!authReady || !isAuthenticated) return;
    getLoyaltyAccount()
      .then(({ account, tier_progress }) => {
        setLoyalty(account);
        if (tier_progress) setLoyaltyTierProgress(tier_progress);
      })
      .catch((e: Error) => setLoyaltyError(e.message || 'Failed to load loyalty account.'));
  }, [isAuthenticated, authReady]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'reservations' || reservations.length > 0) return;
    setReservationsLoading(true);
    getMyReservations()
      .then((res) => setReservations(res.data ?? []))
      .catch((e: Error) => setReservationsError(e.message || 'Failed to load reservations.'))
      .finally(() => setReservationsLoading(false));
  }, [isAuthenticated, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'favourites') return;
    setFavouritesLoading(true);
    getMyFavourites()
      .then((res) => setFavourites(res.data ?? []))
      .catch((e: Error) => setFavouritesError(e.message || 'Failed to load favourites.'))
      .finally(() => setFavouritesLoading(false));
  }, [isAuthenticated, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'preorders' || preOrders.length > 0) return;
    setPreOrdersLoading(true);
    getMyPreOrders()
      .then((res) => setPreOrders(res.data ?? []))
      .catch((e: Error) => setPreOrdersError(e.message || 'Failed to load pre-orders.'))
      .finally(() => setPreOrdersLoading(false));
  }, [isAuthenticated, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'reviews') return;
    setReviewsLoading(true);
    Promise.all([
      getMyReviews({ page: reviewsPage, per_page: 20 }),
      fetchCustomerOrders(),
    ])
      .then(([reviewRes, orderRes]) => {
        const myReviews = reviewRes.data ?? [];
        setReviews(myReviews);
        setReviewsTotalPages(reviewRes.meta?.last_page ?? 1);
        const reviewedOrderIds = new Set(myReviews.map((r) => r.order?.id).filter(Boolean));
        const completed = (Array.isArray(orderRes) ? orderRes : (orderRes as { data: Order[] }).data ?? [])
          .filter((o: Order) => o.status === 'completed' && !reviewedOrderIds.has(o.id));
        setReviewableOrders(completed.slice(0, 10));
      })
      .catch((e: Error) => setReviewsError(e.message || 'Failed to load reviews.'))
      .finally(() => setReviewsLoading(false));
  }, [isAuthenticated, authReady, activeTab, reviewsPage]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'referrals' || referralCode !== null) return;
    setReferralLoading(true);
    getMyReferralCode()
      .then((r) => { setReferralCode(r.code); setReferralUses(r.uses_count); setReferralDiscount(r.referee_discount_mvr); })
      .catch((e: Error) => setReferralError(e.message || 'Failed to load referral code.'))
      .finally(() => setReferralLoading(false));
  }, [isAuthenticated, authReady, activeTab]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'credit' || creditLoaded) return;
    setCreditLoading(true);
    getCustomerCredit()
      .then((res) => { setCredit(res.credit); setCreditLoaded(true); })
      .catch((e: Error) => setCreditError(e.message || 'Failed to load credit account.'))
      .finally(() => setCreditLoading(false));
  }, [isAuthenticated, authReady, activeTab, creditLoaded]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || activeTab !== 'deposit' || depositLoaded) return;
    setDepositLoading(true);
    getCustomerDepositLedger()
      .then((res) => {
        setDeposit(res.deposit);
        setDepositTransactions(res.transactions ?? []);
        setDepositLoaded(true);
      })
      .catch((e: Error) => setDepositError(e.message || 'Failed to load deposit account.'))
      .finally(() => setDepositLoading(false));
  }, [isAuthenticated, authReady, activeTab, depositLoaded]);

  const handleAuthSuccess = (name: string) => setAuth(name);

  const handleCancelReservation = async (id: number) => {
    if (!isAuthenticated) return;
    setCancellingId(id);
    try {
      await cancelMyReservation(id);
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: 'cancelled' } : r));
    } catch (e) {
      setReservationsError((e as Error).message || 'Could not cancel reservation.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  if (!authReady) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem var(--page-gutter)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '2rem var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>My Account</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.375rem 0 0' }}>
            Log in to view and manage your account.
          </p>
        </div>
        <AuthBlock onSuccess={handleAuthSuccess} />
        {/* Hard gate: theme/language + temp links survive header removal for signed-out users */}
        <AccountChromeBlocks />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '2rem var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-dark)', margin: 0 }}>My Account</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: '0.375rem 0 0' }}>
          Hi, {customerName ?? customer?.name ?? 'there'}
        </p>
      </div>

      <AccountChromeBlocks />

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
        {([
          { id: 'profile',      label: '👤 Profile'       },
          { id: 'addresses',    label: '📍 Addresses'     },
          { id: 'loyalty',      label: '⭐ Loyalty'       },
          { id: 'credit',       label: '💳 Credit'        },
          { id: 'deposit',      label: '💰 Deposit'       },
          { id: 'referrals',    label: '🎁 Referrals'     },
          { id: 'reservations', label: '🗓 Reservations'  },
          { id: 'favourites',   label: '❤️ Favourites'    },
          { id: 'preorders',    label: '📦 Pre-orders'    },
          { id: 'reviews',      label: '✍️ Reviews'       },
        ] as const).map(({ id, label }) => (
          <button key={id} style={tabStyle(activeTab === id)} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <ProfileSection
          profile={profile}
          loyalty={loyalty}
          loyaltyError={loyaltyError}
          onLogout={handleLogout}
        />
      )}

      {activeTab === 'addresses' && (
        <AddressesSection addresses={addresses} />
      )}

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
                    if (!isAuthenticated || !reviewOrderId) return;
                    setSubmittingReview(true); setReviewSubmitError('');
                    try {
                      await submitReview({ order_id: reviewOrderId, rating: reviewRating, comment: reviewComment, is_anonymous: reviewAnon });
                      setShowReviewForm(false);
                      setReviewableOrders((rs) => rs.filter((o) => o.id !== reviewOrderId));
                      // Force refresh reviews list
                      setReviews([]);
                      setReviewsLoading(true);
                      getMyReviews({ page: 1, per_page: 20 }).then((res) => {
                        setReviews(res.data);
                        setReviewsTotalPages(res.meta?.last_page ?? 1);
                        setReviewsPage(1);
                      }).finally(() => setReviewsLoading(false));
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
                {reviewsTotalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8 }}>
                    <button
                      onClick={() => setReviewsPage((p) => Math.max(1, p - 1))}
                      disabled={reviewsPage <= 1}
                      style={{ ...btnStyle, padding: '6px 14px', fontSize: 12, opacity: reviewsPage <= 1 ? 0.5 : 1, background: '#E5E7EB', color: '#1F2937' }}
                    >‹ Prev</button>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Page {reviewsPage} of {reviewsTotalPages}
                    </span>
                    <button
                      onClick={() => setReviewsPage((p) => Math.min(reviewsTotalPages, p + 1))}
                      disabled={reviewsPage >= reviewsTotalPages}
                      style={{ ...btnStyle, padding: '6px 14px', fontSize: 12, opacity: reviewsPage >= reviewsTotalPages ? 0.5 : 1, background: '#E5E7EB', color: '#1F2937' }}
                    >Next ›</button>
                  </div>
                )}
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
                if (loyaltyTierProgress?.enabled) {
                  if (loyaltyTierProgress.at_max_tier) {
                    return (
                      <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--color-surface-alt)', borderRadius: 12, fontSize: 13, color: 'var(--tier-platinum-text)', fontWeight: 600 }}>
                        💎 You&apos;ve reached {loyaltyTierProgress.current_tier_name} — the highest tier!
                      </div>
                    );
                  }
                  if (loyaltyTierProgress.next_tier_name) {
                    const progress = (loyaltyTierProgress.progress_percent ?? 0) / 100;
                    const ptsLeft = loyaltyTierProgress.points_to_next ?? 0;
                    return (
                      <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{loyaltyTierProgress.current_tier_name}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: TIER_COLOR[loyaltyTierProgress.next_tier ?? '']?.text ?? '#92400E' }}>
                            {loyaltyTierProgress.next_tier_name}
                          </span>
                        </div>
                        <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                          <div style={{ height: '100%', width: `${(progress * 100).toFixed(1)}%`, background: TIER_COLOR[loyalty.tier]?.border ?? '#FCD34D', borderRadius: 999, transition: 'width 0.4s ease' }} />
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0, textAlign: 'center' }}>
                          {ptsLeft > 0 ? <><strong>{ptsLeft.toLocaleString()} pts</strong> to reach {loyaltyTierProgress.next_tier_name}</> : `You've reached ${loyaltyTierProgress.next_tier_name}!`}
                        </p>
                      </div>
                    );
                  }
                }

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

      {/* ── Credit tab ── */}
      {activeTab === 'credit' && (
        <>
          {creditError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{creditError}</p>}
          {creditLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>Loading…</div>
          ) : !credit ? (
            <SectionCard title="Credit Account">
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>💳</p>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
                  You do not have an approved credit account. Ask the restaurant if you need to pay on account.
                </p>
              </div>
            </SectionCard>
          ) : (
            <>
              <div style={{
                background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
                border: '2px solid #BFDBFE',
                borderRadius: 18,
                padding: '24px 20px',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1D4ED8', margin: '0 0 12px' }}>
                  Credit Account · {credit.status.replace('_', ' ')}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#1E40AF', margin: '0 0 4px', fontWeight: 700 }}>Balance owed</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#1E3A8A', margin: 0 }}>MVR {credit.balance_mvr.toFixed(2)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#1E40AF', margin: '0 0 4px', fontWeight: 700 }}>Credit limit</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#1E3A8A', margin: 0 }}>MVR {credit.limit_mvr.toFixed(2)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#1E40AF', margin: '0 0 4px', fontWeight: 700 }}>Available</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#15803D', margin: 0 }}>MVR {credit.available_mvr.toFixed(2)}</p>
                  </div>
                </div>
                <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: '#1E40AF' }}>
                  <span><strong>Payment terms:</strong> Net {credit.payment_terms_days} days</span>
                  {credit.next_payment_due_date && (
                    <span><strong>Next payment due:</strong> {new Date(`${credit.next_payment_due_date}T00:00:00`).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              <SectionCard title="SMS Payment Reminders">
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={credit.reminder_sms_enabled}
                    disabled={reminderSaving || !isAuthenticated}
                    onChange={(e) => {
                      if (!isAuthenticated) return;
                      const enabled = e.target.checked;
                      setReminderSaving(true);
                      setCreditError('');
                      updateCustomerCreditPreferences({ credit_reminder_sms: enabled })
                        .then((res) => setCredit(res.credit))
                        .catch((err: Error) => setCreditError(err.message || 'Failed to update reminder preference.'))
                        .finally(() => setReminderSaving(false));
                    }}
                  />
                  Send SMS reminders before and on payment due dates
                </label>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                  Reminders are on by default. Turn off if you prefer email or in-app only.
                </p>
              </SectionCard>

              <SectionCard title="Open Invoices">
                {credit.open_invoices.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>No open invoices — your account is clear.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {credit.open_invoices.map((inv) => {
                      const overdue = inv.due_date
                        ? new Date(`${inv.due_date}T00:00:00`) < new Date(new Date().toDateString())
                        : false;
                      return (
                      <div key={inv.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>{inv.invoice_number}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                            {inv.issue_date ? `Issued ${inv.issue_date}` : 'On credit account'}
                            {inv.order_id ? ` · Order #${inv.order_id}` : ''}
                          </p>
                          {inv.due_date && (
                            <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: overdue ? '#B45309' : 'var(--color-text-muted)' }}>
                              {overdue ? 'Overdue — ' : 'Due '}{new Date(`${inv.due_date}T00:00:00`).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#B45309' }}>MVR {inv.balance_due_mvr.toFixed(2)} due</p>
                          {inv.view_url && (
                            <a href={inv.view_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600 }}>
                              View invoice →
                            </a>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </>
      )}

      {/* ── Deposit tab ── */}
      {activeTab === 'deposit' && (
        <>
          {depositError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{depositError}</p>}
          {depositLoading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>Loading…</div>
          ) : !deposit ? (
            <SectionCard title="Deposit Balance">
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ fontSize: 32, margin: '0 0 8px' }}>💰</p>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
                  You do not have a prepaid deposit balance. Ask the restaurant if you would like to prepay for faster checkout in-store.
                </p>
              </div>
            </SectionCard>
          ) : (
            <>
              <div style={{
                background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)',
                border: '2px solid #A7F3D0',
                borderRadius: 18,
                padding: '24px 20px',
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#047857', margin: '0 0 12px' }}>
                  Deposit Balance · {deposit.status}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#065F46', margin: '0 0 4px', fontWeight: 700 }}>Available balance</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#047857', margin: 0 }}>MVR {deposit.balance_mvr.toFixed(2)}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#065F46', margin: '0 0 4px', fontWeight: 700 }}>In-store use</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: deposit.can_use ? '#15803D' : '#9CA3AF', margin: 0 }}>
                      {deposit.can_use ? 'Available' : 'Unavailable'}
                    </p>
                  </div>
                </div>
                {deposit.status !== 'active' && (
                  <p style={{ margin: '12px 0 0', fontSize: 13, color: '#B45309' }}>
                    Your deposit account is {deposit.status}. Contact the restaurant for assistance.
                  </p>
                )}
              </div>

              <SectionCard title="Recent Activity">
                {depositTransactions.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>No deposit transactions yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {depositTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        style={{
                          border: '1px solid var(--color-border)',
                          borderRadius: 12,
                          padding: '12px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>{tx.label}</p>
                          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                            {tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}
                            {tx.order_id ? ` · Order #${tx.order_id}` : ''}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{
                            margin: 0,
                            fontWeight: 800,
                            fontSize: 15,
                            color: tx.direction === 'credit' ? '#15803D' : '#1E3A8A',
                          }}>
                            {tx.direction === 'credit' ? '+' : '−'}MVR {tx.amount_mvr.toFixed(2)}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--color-text-muted)' }}>
                            Bal MVR {tx.balance_after_mvr.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </>
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
                    value={`${window.location.origin}/order/?ref=${referralCode}`}
                    style={{ ...inputStyle, flex: 1, fontSize: 12, color: 'var(--color-text-muted)' }}
                  />
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/order/?ref=${referralCode}`);
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
