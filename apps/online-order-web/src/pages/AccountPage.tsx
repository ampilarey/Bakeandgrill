import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
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
import { PrayerBar } from '../components/PrayerBar';
import { PageHeader } from '../components/shell/PageHeader';
import { AddressesSection } from './AccountPage/AddressesSection';
import { ProfileSection } from './AccountPage/ProfileSection';
import { OrderHistorySection } from './AccountPage/OrderHistorySection';
import { AccountSettingsBlock, AccountMoreBlock } from './AccountPage/AccountChromeBlocks';
import {
  SectionCard, TIER_COLOR, btnStyle, inputStyle, statusBadge,
} from './AccountPage/accountShared';
import { useAccountAddresses } from './AccountPage/useAccountAddresses';
import { useAccountProfile } from './AccountPage/useAccountProfile';

type PanelId =
  | 'profile'
  | 'addresses'
  | 'reservations'
  | 'favourites'
  | 'preorders'
  | 'reviews'
  | 'loyalty'
  | 'referrals'
  | 'credit'
  | 'deposit';

export function AccountPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  usePageTitle(t('account.title'));
  const { isAuthenticated, authReady, setAuth, clearAuth, customerName } = useAuth();

  const [panel, setPanel] = useState<PanelId | null>(null);

  const profile = useAccountProfile(isAuthenticated, authReady);
  const addresses = useAccountAddresses(isAuthenticated, authReady, panel ?? '', profile.customer, customerName);
  const { customer } = profile;

  const push = usePushNotifications(isAuthenticated);

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
      .catch((e: Error) => setLoyaltyError(e.message || t('account.err_loyalty')));
  }, [isAuthenticated, authReady]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || panel !== 'reservations' || reservations.length > 0) return;
    setReservationsLoading(true);
    getMyReservations()
      .then((res) => setReservations(res.data ?? []))
      .catch((e: Error) => setReservationsError(e.message || t('account.err_reservations')))
      .finally(() => setReservationsLoading(false));
  }, [isAuthenticated, authReady, panel]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || panel !== 'favourites') return;
    setFavouritesLoading(true);
    getMyFavourites()
      .then((res) => setFavourites(res.data ?? []))
      .catch((e: Error) => setFavouritesError(e.message || t('account.err_favourites')))
      .finally(() => setFavouritesLoading(false));
  }, [isAuthenticated, authReady, panel]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || panel !== 'preorders' || preOrders.length > 0) return;
    setPreOrdersLoading(true);
    getMyPreOrders()
      .then((res) => setPreOrders(res.data ?? []))
      .catch((e: Error) => setPreOrdersError(e.message || t('account.err_preorders')))
      .finally(() => setPreOrdersLoading(false));
  }, [isAuthenticated, authReady, panel]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || panel !== 'reviews') return;
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
      .catch((e: Error) => setReviewsError(e.message || t('account.err_reviews')))
      .finally(() => setReviewsLoading(false));
  }, [isAuthenticated, authReady, panel, reviewsPage]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || panel !== 'referrals' || referralCode !== null) return;
    setReferralLoading(true);
    getMyReferralCode()
      .then((r) => { setReferralCode(r.code); setReferralUses(r.uses_count); setReferralDiscount(r.referee_discount_mvr); })
      .catch((e: Error) => setReferralError(e.message || t('account.err_referral')))
      .finally(() => setReferralLoading(false));
  }, [isAuthenticated, authReady, panel]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || panel !== 'credit' || creditLoaded) return;
    setCreditLoading(true);
    getCustomerCredit()
      .then((res) => { setCredit(res.credit); setCreditLoaded(true); })
      .catch((e: Error) => setCreditError(e.message || t('account.err_credit')))
      .finally(() => setCreditLoading(false));
  }, [isAuthenticated, authReady, panel, creditLoaded]);

  useEffect(() => {
    if (!authReady || !isAuthenticated || panel !== 'deposit' || depositLoaded) return;
    setDepositLoading(true);
    getCustomerDepositLedger()
      .then((res) => {
        setDeposit(res.deposit);
        setDepositTransactions(res.transactions ?? []);
        setDepositLoaded(true);
      })
      .catch((e: Error) => setDepositError(e.message || t('account.err_deposit')))
      .finally(() => setDepositLoading(false));
  }, [isAuthenticated, authReady, panel, depositLoaded]);

  const handleAuthSuccess = (name: string) => setAuth(name);

  const handleCancelReservation = async (id: number) => {
    if (!isAuthenticated) return;
    setCancellingId(id);
    try {
      await cancelMyReservation(id);
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: 'cancelled' } : r));
    } catch (e) {
      setReservationsError((e as Error).message || t('account.err_cancel_rsv'));
    } finally {
      setCancellingId(null);
    }
  };

  const handleLogout = () => {
    if (!window.confirm(t('account.logout_confirm'))) return;
    clearAuth();
    navigate('/');
  };

  const pushToggle = push.supported
    ? {
        supported: push.supported,
        subscribed: push.subscribed,
        loading: push.loading,
        onToggle: () => void (push.subscribed ? push.unsubscribe() : push.subscribe()),
      }
    : undefined;

  if (!authReady) {
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '3rem var(--page-gutter)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
        {t('account.loading')}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader title={t('account.title')} />
        <div style={{ padding: '0 var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <AuthBlock onSuccess={handleAuthSuccess} />
          <SectionCard title={t('account.prayer_times')}>
            <div style={{ overflow: 'visible' }}>
              <PrayerBar />
            </div>
          </SectionCard>
          <AccountSettingsBlock />
          <AccountMoreBlock />
        </div>
      </div>
    );
  }

  // ── Drill-in panel ──────────────────────────────────────────────────────────
  if (panel !== null) {
    const panelTitles: Record<PanelId, string> = {
      profile:      t('account.profile'),
      addresses:    t('account.addresses'),
      reservations: t('account.link_reservations'),
      favourites:   t('account.favourites'),
      preorders:    t('account.preorders'),
      reviews:      t('account.reviews'),
      loyalty:      t('account.loyalty'),
      referrals:    t('account.referrals'),
      credit:       t('account.credit'),
      deposit:      t('account.deposit'),
    };

    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHeader title={panelTitles[panel]} onBack={() => setPanel(null)} />
        <div style={{ padding: '0 var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {panel === 'profile' && (
            <ProfileSection
              profile={profile}
              loyalty={loyalty}
              loyaltyError={loyaltyError}
            />
          )}

          {panel === 'addresses' && (
            <AddressesSection addresses={addresses} />
          )}

          {panel === 'reservations' && (
            <SectionCard title={t('account.rsv_title')}>
              {reservationsLoading ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('account.loading')}</p>
              ) : reservationsError ? (
                <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{reservationsError}</p>
              ) : reservations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>🗓</p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.rsv_empty')}</p>
                  <Link to="/reservations" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, color: 'var(--color-primary)', fontWeight: 700 }}>
                    {t('account.rsv_book')}
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {reservations.map((r) => (
                    <div key={r.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>
                            {new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} {t('account.rsv_at')} {r.time_slot?.slice(0, 5) ?? ''}
                          </span>
                          {statusBadge(r.status)}
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                          {t('account.rsv_party').replace('{n}', String(r.party_size))}{r.notes ? ` · ${r.notes}` : ''}
                        </span>
                      </div>
                      {['confirmed', 'pending'].includes(r.status) && (
                        <button
                          onClick={() => void handleCancelReservation(r.id)}
                          disabled={cancellingId === r.id}
                          style={{ padding: '6px 14px', border: '1px solid var(--color-error, #dc2626)', borderRadius: 8, background: 'transparent', color: 'var(--color-error, #dc2626)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', opacity: cancellingId === r.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
                        >
                          {cancellingId === r.id ? t('account.cancelling') : t('account.cancel')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {panel === 'favourites' && (
            <SectionCard title={t('account.fav_title')}>
              {favouritesLoading ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('account.loading')}</p>
              ) : favouritesError ? (
                <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{favouritesError}</p>
              ) : favourites.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>❤️</p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.fav_empty')}</p>
                  <Link to="/menu" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, color: 'var(--color-primary)', fontWeight: 700 }}>
                    {t('account.fav_browse')}
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
                        {!item.is_available && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>{t('account.unavailable')}</p>}
                      </div>
                    </div>
                  ))}
                  <Link to="/menu" style={{ textAlign: 'center', display: 'block', marginTop: 8, fontSize: 13, color: 'var(--color-primary)', fontWeight: 600 }}>
                    {t('account.fav_add_more')}
                  </Link>
                </div>
              )}
            </SectionCard>
          )}

          {panel === 'preorders' && (
            <SectionCard title={t('account.po_title')}>
              {preOrdersLoading ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('account.loading')}</p>
              ) : preOrdersError ? (
                <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{preOrdersError}</p>
              ) : preOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <p style={{ fontSize: 32, margin: '0 0 8px' }}>📦</p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.po_empty')}</p>
                  <Link to="/catering" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, color: 'var(--color-primary)', fontWeight: 700 }}>
                    {t('account.po_place')}
                  </Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {preOrders.map((po) => (
                    <div key={po.id} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-dark)' }}>
                            {po.event_name ?? t('account.po_fallback').replace('{n}', String(po.order_number))}
                          </span>
                          {statusBadge(po.status)}
                        </div>
                        {po.event_date && (
                          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                            {t('account.po_event').replace('{name}', new Date(po.event_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {t('account.po_ordered').replace('{date}', new Date(po.created_at).toLocaleDateString())}
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

          {panel === 'reviews' && (
            <>
              {reviewableOrders.length > 0 && !showReviewForm && (
                <SectionCard title={t('account.rv_leave')}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                    {t('account.rv_waiting').replace('{n}', String(reviewableOrders.length))}
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
                          ⭐ {t('account.rv_cta')}
                        </button>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {showReviewForm && (
                <SectionCard title={t('account.rv_write')}>
                  {reviewSubmitError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{reviewSubmitError}</p>}
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-dark)', margin: '0 0 8px' }}>{t('account.rv_rating')}</p>
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
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-dark)', margin: '0 0 6px' }}>{t('account.rv_comment')}</p>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder={t('account.rv_ph')}
                      style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16, cursor: 'pointer' }}>
                    <input type="checkbox" checked={reviewAnon} onChange={(e) => setReviewAnon(e.target.checked)} />
                    {t('account.rv_anon')}
                  </label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => setShowReviewForm(false)}
                      style={{ flex: 1, padding: '10px', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text-muted)' }}
                    >
                      {t('account.cancel')}
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
                          setReviews([]);
                          setReviewsLoading(true);
                          getMyReviews({ page: 1, per_page: 20 }).then((res) => {
                            setReviews(res.data);
                            setReviewsTotalPages(res.meta?.last_page ?? 1);
                            setReviewsPage(1);
                          }).finally(() => setReviewsLoading(false));
                        } catch (e: unknown) { setReviewSubmitError((e as Error).message || t('account.err_submit_review')); }
                        finally { setSubmittingReview(false); }
                      }}
                      style={{ flex: 2, padding: '10px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: submittingReview ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submittingReview ? 0.7 : 1 }}
                    >
                      {submittingReview ? t('account.rv_submitting') : t('account.rv_submit')}
                    </button>
                  </div>
                </SectionCard>
              )}

              <SectionCard title={t('account.rv_mine')}>
                {reviewsLoading ? (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>{t('account.loading')}</p>
                ) : reviewsError ? (
                  <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{reviewsError}</p>
                ) : reviews.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <p style={{ fontSize: 32, margin: '0 0 8px' }}>⭐</p>
                    <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.rv_empty')}</p>
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
                        {rv.is_anonymous && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9ca3af' }}>{t('account.rv_posted_anon')}</p>}
                      </div>
                    ))}
                    {reviewsTotalPages > 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8 }}>
                        <button
                          onClick={() => setReviewsPage((p) => Math.max(1, p - 1))}
                          disabled={reviewsPage <= 1}
                          style={{ ...btnStyle, padding: '6px 14px', fontSize: 12, opacity: reviewsPage <= 1 ? 0.5 : 1, background: '#E5E7EB', color: '#1F2937' }}
                        >{t('account.rv_prev')}</button>
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                          {t('account.rv_page').replace('{n}', String(reviewsPage)).replace('{m}', String(reviewsTotalPages))}
                        </span>
                        <button
                          onClick={() => setReviewsPage((p) => Math.min(reviewsTotalPages, p + 1))}
                          disabled={reviewsPage >= reviewsTotalPages}
                          style={{ ...btnStyle, padding: '6px 14px', fontSize: 12, opacity: reviewsPage >= reviewsTotalPages ? 0.5 : 1, background: '#E5E7EB', color: '#1F2937' }}
                        >{t('account.rv_next')}</button>
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            </>
          )}

          {panel === 'loyalty' && (
            <>
              {loyaltyError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{loyaltyError}</p>}
              {loyalty ? (
                <>
                  <div style={{
                    background: TIER_COLOR[loyalty.tier]?.bg ?? '#FEF3E2',
                    border: `2px solid ${TIER_COLOR[loyalty.tier]?.border ?? '#FCD34D'}`,
                    borderRadius: 18, padding: '24px 20px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>
                      {loyalty.tier === 'gold' ? '🥇' : loyalty.tier === 'silver' ? '🥈' : loyalty.tier === 'platinum' ? '💎' : '🥉'}
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', margin: '0 0 4px' }}>
                      {t('account.loyalty_member').replace('{tier}', loyalty.tier)}
                    </p>
                    <p style={{ fontSize: 36, fontWeight: 900, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', margin: '0 0 4px' }}>
                      {t('account.loyalty_pts').replace('{n}', loyalty.points_balance.toLocaleString())}
                    </p>
                    <p style={{ fontSize: 13, color: TIER_COLOR[loyalty.tier]?.text ?? '#92400E', opacity: 0.7, margin: 0 }}>
                      {loyalty.lifetime_points != null ? t('account.loyalty_lifetime').replace('{n}', loyalty.lifetime_points.toLocaleString()) : ''}
                    </p>
                  </div>

                  {(() => {
                    if (loyaltyTierProgress?.enabled) {
                      if (loyaltyTierProgress.at_max_tier) {
                        return (
                          <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--color-surface-alt)', borderRadius: 12, fontSize: 13, color: 'var(--tier-platinum-text)', fontWeight: 600 }}>
                            💎 {t('account.loyalty_top').replace('{tier}', loyaltyTierProgress.current_tier_name)}
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
                              {ptsLeft > 0
                                ? t('account.loyalty_to_reach').replace('{n}', ptsLeft.toLocaleString()).replace('{tier}', loyaltyTierProgress.next_tier_name)
                                : t('account.loyalty_top').replace('{tier}', loyaltyTierProgress.next_tier_name)}
                            </p>
                          </div>
                        );
                      }
                    }

                    const TIERS = [
                      { key: 'bronze',   label: t('account.tier.bronze'),   threshold: 0,     next: 1000,  icon: '🥉' },
                      { key: 'silver',   label: t('account.tier.silver'),   threshold: 1000,  next: 5000,  icon: '🥈' },
                      { key: 'gold',     label: t('account.tier.gold'),     threshold: 5000,  next: 15000, icon: '🥇' },
                      { key: 'platinum', label: t('account.tier.platinum'), threshold: 15000, next: null,  icon: '💎' },
                    ];
                    const lifePoints = loyalty.lifetime_points ?? 0;
                    const currentIdx = TIERS.findIndex((tier) => tier.key === loyalty.tier);
                    const current = TIERS[currentIdx] ?? TIERS[0];
                    const nextTier = TIERS[currentIdx + 1];
                    if (!nextTier) {
                      return (
                        <div style={{ textAlign: 'center', padding: '0.75rem', background: 'var(--color-surface-alt)', borderRadius: 12, fontSize: 13, color: 'var(--tier-platinum-text)', fontWeight: 600 }}>
                          💎 {t('account.loyalty_top').replace('{tier}', t('account.tier.platinum'))}
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
                          {ptsLeft > 0
                            ? t('account.loyalty_to_reach').replace('{n}', ptsLeft.toLocaleString()).replace('{tier}', nextTier.label)
                            : t('account.loyalty_top').replace('{tier}', nextTier.label)}
                        </p>
                      </div>
                    );
                  })()}

                  <SectionCard title={t('account.loyalty_earn_title')}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[
                        { icon: '🛒', label: t('account.loyalty_earn_spend'), detail: t('account.loyalty_earn_spend_d') },
                        { icon: '🎂', label: t('account.loyalty_earn_bday'), detail: t('account.loyalty_earn_bday_d') },
                        { icon: '🎁', label: t('account.loyalty_earn_ref'), detail: t('account.loyalty_earn_ref_d') },
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

                  <SectionCard title={t('account.loyalty_redeem_title')}>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
                      {t('account.loyalty_redeem_blurb').replace('{rate}', t('account.loyalty_redeem_rate'))}
                    </p>
                    {loyalty.points_balance >= 100 && (
                      <div style={{ background: 'var(--color-success-bg, #DCFCE7)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--color-success, #15803D)', fontWeight: 600 }}>
                        🎉 {t('account.loyalty_redeem_up_to').replace('{amount}', Math.floor(loyalty.points_balance / 100).toFixed(2))}
                      </div>
                    )}
                  </SectionCard>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <p style={{ fontSize: 36, margin: '0 0 8px' }}>⭐</p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.loyalty_empty')}</p>
                </div>
              )}
            </>
          )}

          {panel === 'credit' && (
            <>
              {creditError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{creditError}</p>}
              {creditLoading ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>{t('account.loading')}</div>
              ) : !credit ? (
                <SectionCard title={t('account.credit')}>
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <p style={{ fontSize: 32, margin: '0 0 8px' }}>💳</p>
                    <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
                      {t('account.credit_none')}
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
                        <p style={{ fontSize: 11, color: '#1E40AF', margin: '0 0 4px', fontWeight: 700 }}>{t('account.credit_owed')}</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#1E3A8A', margin: 0 }}>MVR {credit.balance_mvr.toFixed(2)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: '#1E40AF', margin: '0 0 4px', fontWeight: 700 }}>{t('account.credit_limit')}</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#1E3A8A', margin: 0 }}>MVR {credit.limit_mvr.toFixed(2)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: '#1E40AF', margin: '0 0 4px', fontWeight: 700 }}>{t('account.credit_available')}</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#15803D', margin: 0 }}>MVR {credit.available_mvr.toFixed(2)}</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: '#1E40AF' }}>
                      <span>{t('account.credit_terms').replace('{n}', String(credit.payment_terms_days))}</span>
                      {credit.next_payment_due_date && (
                        <span>{t('account.credit_due').replace('{date}', new Date(`${credit.next_payment_due_date}T00:00:00`).toLocaleDateString())}</span>
                      )}
                    </div>
                  </div>

                  <SectionCard title={t('account.credit_sms_title')}>
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
                            .catch((err: Error) => setCreditError(err.message || t('account.err_credit_pref')))
                            .finally(() => setReminderSaving(false));
                        }}
                      />
                      {t('account.credit_sms_label')}
                    </label>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {t('account.credit_sms_hint')}
                    </p>
                  </SectionCard>

                  <SectionCard title={t('account.credit_invoices')}>
                    {credit.open_invoices.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.credit_invoices_empty')}</p>
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
                                {inv.issue_date ? t('account.credit_issued').replace('{date}', inv.issue_date) : t('account.credit_on_account')}
                                {inv.order_id ? ` · Order #${inv.order_id}` : ''}
                              </p>
                              {inv.due_date && (
                                <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: overdue ? '#B45309' : 'var(--color-text-muted)' }}>
                                  {(overdue ? t('account.credit_overdue') : t('account.credit_due_short')).replace('{date}', new Date(`${inv.due_date}T00:00:00`).toLocaleDateString())}
                                </p>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#B45309' }}>{t('account.credit_mvr_due').replace('{amount}', inv.balance_due_mvr.toFixed(2))}</p>
                              {inv.view_url && (
                                <a href={inv.view_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--color-primary)', fontWeight: 600 }}>
                                  {t('account.credit_view')}
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

          {panel === 'deposit' && (
            <>
              {depositError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{depositError}</p>}
              {depositLoading ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>{t('account.loading')}</div>
              ) : !deposit ? (
                <SectionCard title={t('account.deposit')}>
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <p style={{ fontSize: 32, margin: '0 0 8px' }}>💰</p>
                    <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
                      {t('account.deposit_empty')}
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
                        <p style={{ fontSize: 11, color: '#065F46', margin: '0 0 4px', fontWeight: 700 }}>{t('account.deposit_balance')}</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: '#047857', margin: 0 }}>MVR {deposit.balance_mvr.toFixed(2)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, color: '#065F46', margin: '0 0 4px', fontWeight: 700 }}>{t('account.deposit_instore')}</p>
                        <p style={{ fontSize: 22, fontWeight: 900, color: deposit.can_use ? '#15803D' : '#9CA3AF', margin: 0 }}>
                          {deposit.can_use ? t('account.deposit_available') : t('account.deposit_unavailable')}
                        </p>
                      </div>
                    </div>
                    {deposit.status !== 'active' && (
                      <p style={{ margin: '12px 0 0', fontSize: 13, color: '#B45309' }}>
                        {t('account.deposit_status_note').replace('{status}', deposit.status)}
                      </p>
                    )}
                  </div>

                  <SectionCard title={t('account.deposit_activity')}>
                    {depositTransactions.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.deposit_activity_empty')}</p>
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
                                {t('account.deposit_bal').replace('{amount}', tx.balance_after_mvr.toFixed(2))}
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

          {panel === 'referrals' && (
            <>
              {referralError && <p style={{ color: 'var(--color-error, #dc2626)', fontSize: 13 }}>{referralError}</p>}
              {referralLoading ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-text-muted)' }}>{t('account.loading')}</div>
              ) : referralCode ? (
                <>
                  <div style={{
                    background: 'linear-gradient(135deg, #FEF3E2 0%, #FDE68A 100%)',
                    border: '2px solid #FCD34D', borderRadius: 18, padding: '28px 20px', textAlign: 'center',
                  }}>
                    <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#92400E', margin: '0 0 10px' }}>
                      {t('account.ref_code_title')}
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
                      {referralCopied ? t('account.ref_copied') : t('account.ref_copy')}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 32, fontWeight: 900, color: 'var(--color-primary)', margin: '0 0 4px' }}>{referralUses}</p>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.ref_friends')}</p>
                    </div>
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: 32, fontWeight: 900, color: '#15803D', margin: '0 0 4px' }}>MVR {referralDiscount.toFixed(2)}</p>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.ref_discount')}</p>
                    </div>
                  </div>

                  <SectionCard title={t('account.ref_how')}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {[
                        { step: '1', text: t('account.ref_step1').replace('{code}', referralCode ?? '') },
                        { step: '2', text: t('account.ref_step2') },
                        { step: '3', text: t('account.ref_step3').replace('{amount}', referralDiscount.toFixed(2)) },
                        { step: '4', text: t('account.ref_step4') },
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

                  <SectionCard title={t('account.ref_share_title')}>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                      {t('account.ref_share_hint')}
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
                        {referralCopied ? '✓' : t('account.ref_copy_short')}
                      </button>
                    </div>
                  </SectionCard>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <p style={{ fontSize: 36, margin: '0 0 8px' }}>🎁</p>
                  <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>{t('account.ref_empty')}</p>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    );
  }

  // ── Hub ──────────────────────────────────────────────────────────────────────
  const displayName = customerName ?? customer?.name ?? t('account.greeting_fallback');

  const hubRow = (
    icon: string,
    label: string,
    onClick: () => void,
    last = false,
  ) => (
    <button
      key={label}
      type="button"
      className="account-row"
      onClick={onClick}
      style={{ borderBottom: last ? 'none' : undefined }}
    >
      <span className="account-row__icon">{icon}</span>
      <span className="account-row__label">{label}</span>
      <span className="account-row__chevron" aria-hidden="true">›</span>
    </button>
  );

  const hubLinkRow = (
    icon: string,
    label: string,
    to: string,
    last = false,
  ) => (
    <Link
      key={to}
      to={to}
      className="account-row"
      style={{ borderBottom: last ? 'none' : undefined }}
    >
      <span className="account-row__icon">{icon}</span>
      <span className="account-row__label">{label}</span>
      <span className="account-row__chevron" aria-hidden="true">›</span>
    </Link>
  );

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 3rem', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <PageHeader title={t('account.title')} />

      <div style={{ padding: '0 var(--page-gutter)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Greeting */}
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0 }}>
          {t('account.greeting').replace('{name}', displayName)}
        </p>

        {/* Profile */}
        <SectionCard title={t('account.profile')}>
          {hubRow('👤', t('account.profile'), () => setPanel('profile'), true)}
        </SectionCard>

        {/* Prayer times — single mount */}
        <SectionCard title={t('account.prayer_times')}>
          <div style={{ overflow: 'visible' }}>
            <PrayerBar />
          </div>
        </SectionCard>

        {/* Addresses */}
        <SectionCard title={t('account.addresses')}>
          {hubRow('📍', t('account.addresses'), () => setPanel('addresses'), true)}
        </SectionCard>

        {/* Orders — link + recent list (§21.4) */}
        <SectionCard title={t('account.orders')}>
          {hubLinkRow('🧾', t('account.link_orders'), '/order-history')}
          <div style={{ padding: '4px 4px 8px' }}>
            <OrderHistorySection />
          </div>
        </SectionCard>

        {/* Bookings */}
        <SectionCard title={t('account.bookings')}>
          {hubLinkRow('📦', t('account.link_preorder'), '/catering')}
          {hubRow('🗓', t('account.link_reservations'), () => setPanel('reservations'), true)}
        </SectionCard>

        {/* Account extras */}
        <SectionCard title={t('account.extras')}>
          {hubRow('⭐', t('account.loyalty'),    () => setPanel('loyalty'))}
          {hubRow('🎁', t('account.referrals'),  () => setPanel('referrals'))}
          {hubRow('💳', t('account.credit'),     () => setPanel('credit'))}
          {hubRow('💰', t('account.deposit'),    () => setPanel('deposit'))}
          {hubRow('❤️', t('account.favourites'), () => setPanel('favourites'))}
          {hubRow('📦', t('account.preorders'),  () => setPanel('preorders'))}
          {hubRow('✍️', t('account.reviews'),    () => setPanel('reviews'), true)}
        </SectionCard>

        {/* Settings */}
        <AccountSettingsBlock push={pushToggle} />

        {/* More */}
        <AccountMoreBlock />

        {/* Log out */}
        <div style={{ paddingTop: 4 }}>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '14px',
              background: 'transparent',
              border: '1.5px solid var(--color-error, #dc2626)',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              color: 'var(--color-error, #dc2626)',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {t('account.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountPage;
