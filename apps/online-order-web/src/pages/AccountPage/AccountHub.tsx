import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { LoyaltyAccount, LoyaltyTierProgress } from '@shared/types';
import { useLanguage } from '../../context/LanguageContext';
import { loyaltyAvailablePoints } from '../../utils/loyalty';
import './AccountHub.css';

/*
 * The signed-in My Account hub (owner, 2026-10-06, screenshot of the old
 * one: "Enhance the customer my acc page after login"). A branded card with
 * the customer's name, number, tier and points; the counter code a tap away
 * from full screen; shortcuts; and the rest grouped with real icons instead
 * of emoji. Every panel and link the old hub had is still here.
 */

// ── Icons ────────────────────────────────────────────────────────────────────

const PATHS: Record<string, ReactNode> = {
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  heart: <path d="M12 20s-7.5-4.6-9.2-9.3C1.7 7.6 3.8 4.5 7 4.5c2 0 3.3 1.1 5 3 1.7-1.9 3-3 5-3 3.2 0 5.3 3.1 4.2 6.2C19.5 15.4 12 20 12 20z" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  gift: <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><path d="M5 12.5v8h14v-8M12 8.5v12M12 8.5c-1.5-3.5-5.5-4-5.5-1.5S10 8.5 12 8.5zM12 8.5c1.5-3.5 5.5-4 5.5-1.5S14 8.5 12 8.5z" /></>,
  card: <><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6.5 14.5h4" /></>,
  wallet: <><path d="M4 7.5h14.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2H16" /><path d="M16 13.5h2" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  party: <><path d="M4 20l5-13 8 8z" /><path d="M14 4.5c.5 1 .5 2-.5 3M19.5 10c-1-.5-2-.5-3 .5M17 3.5v1.5M20.5 7H19" /></>,
  list: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  box: <><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  repeat: <><path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" /><path d="M20 3.5v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15.5" /><path d="M4 20.5v-5h5" /></>,
  table: <><path d="M3 9h18M5 9v11M19 9v11M8 9V5h8v4" /></>,
  users: <><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.4c2.2.7 3.5 2.8 3.5 5.6" /></>,
  flag: <><path d="M5 21V4" /><path d="M5 4.5c4-2 6 2 10 0s4 0 4 0v9s-1-2-4 0-6-2-10 0" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.5 6l8.5 7 8.5-7" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="acct-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PHONE_ONLY = /^\+?[\d\s-]+$/;

/** A real name, never the phone digits sign-in sometimes stores as the name. */
export function realName(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const v = (c ?? '').trim();
    if (v !== '' && !PHONE_ONLY.test(v)) return v;
  }
  return null;
}

/** "+9607820288" → "+960 782 0288". */
export function prettyPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  const local = digits.length > 7 && digits.startsWith('960') ? digits.slice(3) : digits;
  return local.length === 7 ? `+960 ${local.slice(0, 3)} ${local.slice(3)}` : (phone ?? '');
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

const TIER_NAMES: Record<string, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum' };

// ── Hero ─────────────────────────────────────────────────────────────────────

export function AccountHero({
  name,
  phone,
  loyalty,
  tierProgress,
  onEdit,
}: {
  name: string | null;
  phone: string | null | undefined;
  loyalty: LoyaltyAccount | null;
  tierProgress: LoyaltyTierProgress | null;
  onEdit: () => void;
}) {
  const { t } = useLanguage();
  const tierKey = (loyalty?.tier ?? '').toLowerCase();
  const tierName = tierProgress?.current_tier_name || TIER_NAMES[tierKey] || (loyalty?.tier ?? '');
  const points = loyalty ? loyaltyAvailablePoints(loyalty) : null;
  const pct = tierProgress?.enabled && !tierProgress.at_max_tier ? tierProgress.progress_percent ?? null : null;

  return (
    <section className="acct-hero" aria-label={t('account.title')} data-testid="account-hero">
      <div className="acct-hero__top">
        <div className="acct-hero__avatar" aria-hidden="true">
          {name ? initials(name) : <Icon name="user" size={26} />}
        </div>
        <div className="acct-hero__who">
          <p className="acct-hero__hello">{name ? t('account.hero_hello') : t('account.hero_welcome')}</p>
          <h2 className="acct-hero__name">{name ?? t('account.hero_no_name')}</h2>
          {phone && <p className="acct-hero__phone">{prettyPhone(phone)}</p>}
        </div>
        <button type="button" className="acct-hero__edit" onClick={onEdit} aria-label={t('account.edit_profile')}>
          <Icon name="edit" size={18} />
          <span>{t('account.edit')}</span>
        </button>
      </div>

      {loyalty && (
        <Link to="/rewards" className="acct-hero__stats" data-testid="account-hero-points">
          <span className="acct-hero__stat">
            <span className="acct-hero__stat-value">{(points ?? 0).toLocaleString()}</span>
            <span className="acct-hero__stat-label">{t('account.hero_points')}</span>
          </span>
          {tierName && (
            <span className="acct-hero__stat">
              <span className={`acct-hero__tier acct-hero__tier--${tierKey || 'none'}`}>
                <Icon name="star" size={14} /> {tierName}
              </span>
              <span className="acct-hero__stat-label">{t('account.hero_tier')}</span>
            </span>
          )}
          <span className="acct-hero__stats-go" aria-hidden="true"><Icon name="chevron" size={18} /></span>
        </Link>
      )}

      {pct !== null && tierProgress?.next_tier_name && (
        <div className="acct-hero__progress">
          <div className="acct-hero__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <span style={{ width: `${Math.max(4, Math.min(100, pct))}%` }} />
          </div>
          <p className="acct-hero__progress-text">
            {t('account.hero_to_next')
              .replace('{n}', String(tierProgress.points_to_next ?? 0))
              .replace('{tier}', tierProgress.next_tier_name)}
          </p>
        </div>
      )}
    </section>
  );
}

// ── Profile nudge ────────────────────────────────────────────────────────────

export function ProfileNudge({ missingName, missingEmail, onAdd }: { missingName: boolean; missingEmail: boolean; onAdd: () => void }) {
  const { t } = useLanguage();
  if (!missingName && !missingEmail) return null;
  const key = missingName && missingEmail ? 'both' : missingName ? 'name' : 'email';

  return (
    <div className="acct-nudge" data-testid="account-profile-nudge">
      <span className="acct-nudge__icon"><Icon name={key === 'name' ? 'user' : 'mail'} /></span>
      <span className="acct-nudge__text">
        <strong>{t(`account.nudge_title_${key}`)}</strong>
        <span>{t(`account.nudge_body_${key}`)}</span>
      </span>
      <button type="button" className="acct-nudge__btn" onClick={onAdd}>{t('account.nudge_cta')}</button>
    </div>
  );
}

// ── My code ──────────────────────────────────────────────────────────────────

/**
 * The till scans this to attach the account to a counter order (owner,
 * 2026-09-02). Full screen puts it big and on white so the scanner reads it
 * first time, even in dark mode or with the phone dimmed.
 */
export function MyCodeCard({ phone, name }: { phone: string; name: string | null }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const value = `BG-C-${phone}`;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <section className="acct-card acct-code" data-testid="account-my-code">
      <button type="button" className="acct-code__qr" onClick={() => setOpen(true)} aria-label={t('account.code_full')}>
        <QRCodeSVG value={value} size={104} />
      </button>
      <div className="acct-code__body">
        <h2 className="acct-card__title">{t('account.my_code')}</h2>
        <p className="acct-code__hint">{t('account.my_code_hint')}</p>
        <button type="button" className="acct-btn acct-btn--soft" onClick={() => setOpen(true)} data-testid="account-my-code-open">
          <Icon name="expand" size={16} /> {t('account.code_full')}
        </button>
      </div>

      {open && (
        <div className="acct-modal" role="dialog" aria-modal="true" aria-label={t('account.my_code')}>
          <button type="button" className="acct-modal__backdrop" tabIndex={-1} aria-label={t('account.code_close')} onClick={() => setOpen(false)} />
          <div className="acct-modal__sheet">
            <button ref={closeRef} type="button" className="acct-modal__close" onClick={() => setOpen(false)} aria-label={t('account.code_close')}>
              <Icon name="close" />
            </button>
            <p className="acct-modal__eyebrow">{t('account.my_code')}</p>
            {name && <p className="acct-modal__name">{name}</p>}
            <p className="acct-modal__phone">{prettyPhone(phone)}</p>
            <div className="acct-modal__qr" data-testid="account-my-code-full">
              <QRCodeSVG value={value} size={240} marginSize={1} />
            </div>
            <p className="acct-modal__hint">{t('account.code_full_hint')}</p>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Quick actions ────────────────────────────────────────────────────────────

export type QuickAction = { icon: IconName; label: string; to?: string; onClick?: () => void; testId?: string };

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <nav className="acct-quick" aria-label="Shortcuts">
      {actions.map((a) => {
        const inner = (
          <>
            <span className="acct-quick__icon"><Icon name={a.icon} size={22} /></span>
            <span className="acct-quick__label">{a.label}</span>
          </>
        );
        return a.to ? (
          <Link key={a.label} to={a.to} className="acct-quick__item" data-testid={a.testId}>{inner}</Link>
        ) : (
          <button key={a.label} type="button" className="acct-quick__item" onClick={a.onClick} data-testid={a.testId}>{inner}</button>
        );
      })}
    </nav>
  );
}

// ── Grouped rows ─────────────────────────────────────────────────────────────

export type MenuItem = {
  icon: IconName;
  label: string;
  hint?: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  testId?: string;
};

export function MenuGroup({ title, items, testId }: { title: string; items: MenuItem[]; testId?: string }) {
  return (
    <section className="acct-group" data-testid={testId}>
      <h2 className="acct-group__title">{title}</h2>
      <div className="acct-group__list">
        {items.map((item) => {
          const inner = (
            <>
              <span className="acct-row__icon"><Icon name={item.icon} /></span>
              <span className="acct-row__text">
                <span className="acct-row__label">{item.label}</span>
                {item.hint && <span className="acct-row__hint">{item.hint}</span>}
              </span>
              <span className="acct-row__chevron"><Icon name="chevron" size={16} /></span>
            </>
          );
          if (item.to) {
            return <Link key={item.label} to={item.to} className="acct-row" data-testid={item.testId}>{inner}</Link>;
          }
          if (item.href) {
            return <a key={item.label} href={item.href} className="acct-row" data-testid={item.testId}>{inner}</a>;
          }
          return <button key={item.label} type="button" className="acct-row" onClick={item.onClick} data-testid={item.testId}>{inner}</button>;
        })}
      </div>
    </section>
  );
}
