import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/shell/PageHeader';
import { AuthBlock } from '../components/AuthBlock';
import { Skeleton } from '../components/ui/Skeleton';
import { MenuThumb } from '../components/menu/MenuThumb';
import { getLoyaltyAccount, getMyReferralCode } from '../api/promotions';
import { fetchActiveSpecials, API_ORIGIN } from '../api';
import type { DailySpecial } from '../api/menu';
import type { LoyaltyMeResponse } from '@shared/types';
import {
  loyaltyAvailablePoints,
  pointsValueMvr,
  ratesFromApi,
} from '../utils/loyalty';
import { TIER_COLOR } from './AccountPage/accountShared';

// ── helpers ───────────────────────────────────────────────────────────────────

function resolveImgSrc(raw: string | null, origin: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('http')) return raw;
  return `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

// ── Points hero ───────────────────────────────────────────────────────────────

function PointsHero({
  loyalty,
  t,
}: {
  loyalty: LoyaltyMeResponse;
  t: (k: string) => string;
}) {
  const { account } = loyalty;
  const tp = loyalty.tier_progress ?? null;
  const rates = ratesFromApi(loyalty.rates);
  const available = loyaltyAvailablePoints(account);
  const mvrStr = pointsValueMvr(available, rates);
  const tierKey = account.tier.toLowerCase();
  const tierColors = TIER_COLOR[tierKey] ?? {
    bg: 'var(--color-surface-alt)',
    text: 'var(--color-text)',
    border: 'var(--color-border)',
  };
  const tierName = account.tier.charAt(0).toUpperCase() + account.tier.slice(1);

  const progressPct = tp?.progress_percent ?? null;
  const nextTierName = tp?.next_tier_name ?? null;
  const pointsToNext = tp?.points_to_next ?? null;
  const atMax = tp?.at_max_tier ?? false;

  return (
    <div
      style={{
        background: tierColors.bg,
        border: `1px solid ${tierColors.border}`,
        borderRadius: 20,
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: tierColors.text,
          }}
        >
          {t('rewards.tier_member').replace('{tier}', tierName)}
        </span>
        <span aria-hidden="true" style={{ fontSize: 22 }}>⭐</span>
      </div>

      <div>
        <div
          style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            lineHeight: 1,
            color: tierColors.text,
          }}
        >
          {available.toLocaleString()}
        </div>
        <div
          style={{
            fontSize: '0.875rem',
            color: tierColors.text,
            opacity: 0.75,
            marginTop: 3,
          }}
        >
          {t('rewards.points_available')}
        </div>
      </div>

      <div
        style={{
          fontSize: '0.9rem',
          fontWeight: 600,
          color: tierColors.text,
          opacity: 0.85,
        }}
      >
        {t('rewards.approx_mvr').replace('{value}', mvrStr)}
      </div>

      {tp?.enabled && !atMax && progressPct != null && (
        <div>
          <div
            style={{
              height: 6,
              borderRadius: 99,
              background: 'rgba(0,0,0,0.12)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.min(100, Math.max(0, progressPct))}%`,
                background: tierColors.text,
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          {nextTierName != null && pointsToNext != null && (
            <p
              style={{
                fontSize: '0.75rem',
                color: tierColors.text,
                opacity: 0.75,
                margin: '4px 0 0',
              }}
            >
              {t('rewards.progress_to_next')
                .replace('{n}', pointsToNext.toLocaleString())
                .replace('{tier}', nextTierName)}
            </p>
          )}
        </div>
      )}
      {tp?.enabled && atMax && (
        <p style={{ fontSize: '0.75rem', color: tierColors.text, opacity: 0.75, margin: 0 }}>
          {t('rewards.at_max_tier')}
        </p>
      )}

      <Link
        to="/checkout"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '0.25rem',
          padding: '0.75rem 1rem',
          borderRadius: 12,
          background: 'var(--color-primary)',
          color: '#fff',
          fontWeight: 700,
          fontSize: '0.9rem',
          textDecoration: 'none',
          minHeight: 44,
        }}
      >
        {t('rewards.use_at_checkout')}
      </Link>
    </div>
  );
}

// ── Referral card ─────────────────────────────────────────────────────────────

function ReferralCard({
  code,
  usesCount,
  t,
}: {
  code: string;
  usesCount: number;
  t: (k: string) => string;
}) {
  const [copied, setCopied] = useState(false);

  const doCopy = () => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleShare = () => {
    const data = {
      title: 'Bake & Grill',
      text: `Use my referral code ${code} for a discount on your first order at Bake & Grill!`,
      url: 'https://bakeandgrill.mv',
    };
    if (typeof navigator.share === 'function') {
      navigator.share(data).catch(() => {});
    } else {
      doCopy();
    }
  };

  const usesLabel =
    usesCount === 1
      ? t('rewards.referral_uses_one')
      : t('rewards.referral_uses_many').replace('{n}', String(usesCount));

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div>
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 800,
            color: 'var(--color-dark)',
            margin: '0 0 4px',
          }}
        >
          {t('rewards.referral_title')}
        </h2>
        <p
          style={{
            fontSize: '0.875rem',
            color: 'var(--color-text-muted)',
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          {t('rewards.referral_body')}
        </p>
      </div>

      <div
        style={{
          background: 'var(--color-surface-alt)',
          borderRadius: 12,
          padding: '0.875rem 1rem',
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: '1.375rem',
          fontWeight: 900,
          letterSpacing: '0.12em',
          color: 'var(--color-primary)',
          border: '1.5px dashed var(--color-border)',
          userSelect: 'all',
        }}
        aria-label={`${t('rewards.referral_title')}: ${code}`}
      >
        {code}
      </div>

      {usesCount > 0 && (
        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--color-text-muted)',
            margin: 0,
            textAlign: 'center',
          }}
        >
          {usesLabel}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={doCopy}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 12,
            background: copied ? 'var(--color-success, #16a34a)' : 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.18s',
          }}
        >
          {copied ? t('rewards.referral_copied') : t('rewards.referral_copy')}
        </button>
        <button
          type="button"
          onClick={handleShare}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 12,
            background: 'transparent',
            color: 'var(--color-primary)',
            border: '1.5px solid var(--color-primary)',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t('rewards.referral_share')}
        </button>
      </div>
    </div>
  );
}

// ── Today's specials ──────────────────────────────────────────────────────────

function SpecialsSection({
  specials,
  t,
}: {
  specials: DailySpecial[];
  t: (k: string) => string;
}) {
  if (specials.length === 0) return null;

  return (
    <section
      aria-label={t('home.specials_title')}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.125rem',
            fontWeight: 800,
            color: 'var(--color-dark)',
            margin: 0,
          }}
        >
          {t('home.specials_title')}
        </h2>
        <Link
          to="/menu"
          style={{
            fontSize: '0.875rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            textDecoration: 'none',
          }}
        >
          {t('home.see_all')}
        </Link>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.875rem',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          paddingBottom: 4,
        }}
      >
        {specials.map((sp) => {
          const key = sp.variant_id ? `${sp.id}-${sp.variant_id}` : String(sp.id);
          const src = resolveImgSrc(sp.item_image, API_ORIGIN);
          const price = Number(sp.effective_price ?? 0);
          const wasPrice =
            sp.original_price != null && Number(sp.original_price) > price
              ? Number(sp.original_price)
              : null;
          const badge =
            sp.badge_label ?? (sp.discount_pct ? `${sp.discount_pct}% OFF` : 'Special');

          return (
            <Link
              key={key}
              to={`/menu?item=${sp.item_id}`}
              style={{
                flexShrink: 0,
                width: 150,
                borderRadius: 'var(--radius-2xl)',
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                overflow: 'hidden',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ height: 100, position: 'relative', overflow: 'hidden' }}>
                <MenuThumb src={src} alt={sp.item_name ?? ''} height={100} fontSize={26} />
                {badge && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 6,
                      left: 6,
                      background: 'var(--color-primary)',
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '2px 7px',
                      borderRadius: 99,
                      lineHeight: 1.3,
                    }}
                    aria-hidden="true"
                  >
                    {badge}
                  </div>
                )}
              </div>
              <div style={{ padding: '0.6rem 0.7rem', flex: 1 }}>
                <p
                  style={{
                    margin: '0 0 3px',
                    fontWeight: 700,
                    fontSize: 12,
                    color: 'var(--color-dark)',
                    lineHeight: 1.3,
                  }}
                >
                  {sp.item_name}
                </p>
                {sp.variant_name && (
                  <p
                    style={{
                      margin: '0 0 3px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {sp.variant_name}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: 'var(--color-primary)',
                    }}
                  >
                    MVR {price.toFixed(2)}
                  </span>
                  {wasPrice != null && (
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--color-text-muted)',
                        textDecoration: 'line-through',
                      }}
                    >
                      MVR {wasPrice.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ── How points work ───────────────────────────────────────────────────────────

function HowItWorksCard({
  loyalty,
  t,
}: {
  loyalty: LoyaltyMeResponse | null;
  t: (k: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const rates = ratesFromApi(loyalty?.rates);
  const program = loyalty?.program;
  const earnRate = program?.earn_per_mvr ?? 1;

  const bullets = [
    t('rewards.how_earn').replace('{rate}', String(earnRate)),
    t('rewards.how_redeem').replace('{rate}', String(rates.redeemRatePointsPerMvr)),
    t('rewards.how_min').replace('{min}', String(rates.minRedeemPoints)),
    t('rewards.how_max_pct').replace('{pct}', String(rates.maxRedeemPercent)),
  ];

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          padding: '1.125rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--color-dark)',
          }}
        >
          {t('rewards.how_title')}
        </span>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            color: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {expanded ? t('rewards.how_collapse') : t('rewards.how_expand')}
          <span>{expanded ? '▴' : '▾'}</span>
        </span>
      </button>

      {expanded && (
        <div
          style={{
            padding: '0 1.5rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
          }}
        >
          {program?.customer_message ? (
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text)',
                lineHeight: 1.6,
                margin: '0 0 0.25rem',
              }}
            >
              {program.customer_message}
            </p>
          ) : null}
          {bullets.map((line) => (
            <div
              key={line}
              style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}
            >
              <span
                style={{
                  color: 'var(--color-primary)',
                  fontSize: '1rem',
                  lineHeight: 1.5,
                  flexShrink: 0,
                }}
                aria-hidden="true"
              >
                •
              </span>
              <p
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--color-text)',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {line}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function RewardsSkeleton({ t }: { t: (k: string) => string }) {
  const label = t('common.loading');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <Skeleton width="40%" height="0.875rem" label={label} />
        <Skeleton width="55%" height="2.5rem" label={label} />
        <Skeleton width="45%" height="0.875rem" label={label} />
        <Skeleton width="100%" height={6} radius="99px" label={label} />
        <Skeleton width="100%" height={44} radius="12px" label={label} />
      </div>
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <Skeleton width="50%" height="1.125rem" label={label} />
        <Skeleton width="80%" height="0.875rem" label={label} />
        <Skeleton width="100%" height="3rem" radius="12px" label={label} />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Skeleton width="50%" height={44} radius="12px" label={label} />
          <Skeleton width="50%" height={44} radius="12px" label={label} />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function RewardsPage() {
  const { t } = useLanguage();
  const { isAuthenticated, authReady, setAuth } = useAuth();
  usePageTitle(t('rewards.title'));

  const [loading, setLoading] = useState(true);
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyMeResponse | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralUses, setReferralUses] = useState(0);
  const [specials, setSpecials] = useState<DailySpecial[]>([]);

  useEffect(() => {
    if (!authReady) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.allSettled([
      getLoyaltyAccount(),
      getMyReferralCode(),
      fetchActiveSpecials(),
    ]).then(([loyaltyRes, referralRes, specialsRes]) => {
      if (loyaltyRes.status === 'fulfilled') setLoyaltyData(loyaltyRes.value);
      if (referralRes.status === 'fulfilled') {
        setReferralCode(referralRes.value.code);
        setReferralUses(referralRes.value.uses_count);
      }
      if (specialsRes.status === 'fulfilled') {
        setSpecials(specialsRes.value.specials ?? []);
      }
      setLoading(false);
    });
  }, [isAuthenticated, authReady]);

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <PageHeader title={t('rewards.title')} />
      <div
        style={{
          padding: '1.25rem var(--page-gutter)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {!isAuthenticated ? (
          <>
            <div
              style={{
                background: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 16,
                padding: '1rem 1.25rem',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  margin: 0,
                }}
              >
                ⭐ {t('rewards.sign_in_teaser')}
              </p>
            </div>
            <AuthBlock onSuccess={(name) => setAuth(name)} />
          </>
        ) : loading ? (
          <RewardsSkeleton t={t} />
        ) : (
          <>
            {loyaltyData && <PointsHero loyalty={loyaltyData} t={t} />}
            <Link
              to="/gift-cards"
              style={{
                display: 'block',
                textAlign: 'center',
                padding: '14px 16px',
                borderRadius: 16,
                border: '1.5px solid var(--color-border)',
                background: 'var(--color-surface-alt)',
                color: 'var(--color-text)',
                fontWeight: 700,
                textDecoration: 'none',
                fontSize: '0.95rem',
              }}
            >
              {t('account.link_gift_cards')} →
            </Link>
            {referralCode && (
              <ReferralCard code={referralCode} usesCount={referralUses} t={t} />
            )}
            <SpecialsSection specials={specials} t={t} />
            <HowItWorksCard loyalty={loyaltyData} t={t} />
          </>
        )}
      </div>
    </div>
  );
}
