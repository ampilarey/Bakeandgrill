import { Fragment, lazy } from 'react';
import { Link } from 'react-router-dom';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';
import { useCurrentUserPermissions } from '../hooks/usePermissions';

/*
 * Promotions — the money-off family. Offers, gift cards and discount cards
 * were three entries, and the POS discount controls that govern them a
 * fourth; the controls are this page's settings.
 */

const PromotionsPage = lazy(() => import('./PromotionsPage').then((m) => ({ default: m.PromotionsPage })));
const GiftCardsPage = lazy(() => import('./GiftCardsPage'));
const DiscountCardsPage = lazy(() => import('./DiscountCardsPage'));
const DiscountControlsPage = lazy(() => import('./DiscountControlsPage'));
const PrintedCardsPage = lazy(() => import('./PrintedCardsPage'));

export const PROMOTIONS_TABS: HubTab[] = [
  { id: 'offers', label: 'Offers', permissions: ['promotions.manage'], desc: 'Discounts, offers and promo codes', render: () => <PromotionsPage /> },
  { id: 'gift-cards', label: 'Gift cards', permissions: ['promotions.manage'], desc: 'Issue and manage gift cards', render: () => <GiftCardsPage /> },
  { id: 'discount-cards', label: 'Discount cards', permissions: ['promotions.discount_cards'], desc: 'Owner-issued percentage and fixed cards', render: () => <DiscountCardsPage /> },
  { id: 'cards', label: 'Printed cards', permissions: ['promotions.manage'], desc: 'Design and print discount, gift and stamp cards on a card printer or A4', render: () => <PrintedCardsPage /> },
  { id: 'controls', label: 'Controls', permissions: ['discounts.settings.manage'], desc: 'POS discount caps, reasons and SMS approval', render: () => <DiscountControlsPage /> },
];

export const PROMOTIONS_HUB_PERMISSIONS = hubPermissions(PROMOTIONS_TABS);

/**
 * The money-off pages that live elsewhere (owner, 2026-10-17: "all of this
 * are managed in one place?"): each stays beside the job it belongs to, and
 * this line says where. Only the ones the reader can open are named.
 */
export const ELSEWHERE_LINKS: { to: string; label: string; where: string; permission: string }[] = [
  { to: '/specials', label: 'Daily Specials', where: 'Manage', permission: 'menu.manage' },
  { to: '/loyalty', label: 'Loyalty points', where: 'Customers & Marketing', permission: 'loyalty.manage' },
  { to: '/customers/referrals', label: 'Referrals', where: 'Customers', permission: 'customers.manage' },
];

export function ElsewhereNote({ can }: { can: (permission: string) => boolean }) {
  const links = ELSEWHERE_LINKS.filter((l) => can(l.permission));
  return (
    <span data-testid="promotions-elsewhere">
      Also money off, kept elsewhere:{' '}
      {links.map((l, i) => (
        <Fragment key={l.to}>
          {i > 0 && (i === links.length - 1 ? ' and ' : ', ')}
          <Link to={l.to} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{l.label}</Link> ({l.where})
        </Fragment>
      ))}
      .{can('discounts.settings.manage') && ' When two offers fit one order, Controls says which wins.'}
    </span>
  );
}

export function PromotionsHub() {
  const { can } = useCurrentUserPermissions();
  const note = ELSEWHERE_LINKS.some((l) => can(l.permission)) ? <ElsewhereNote can={can} /> : undefined;
  return <HubPage base="/promotions" section="Customers & Marketing" title="Promotions" tabs={PROMOTIONS_TABS} note={note} />;
}
