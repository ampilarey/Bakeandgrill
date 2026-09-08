import { lazy } from 'react';
import { HubPage, hubPermissions, type HubTab } from '../components/HubPage';

/*
 * Promotions — the money-off family. Offers, gift cards and discount cards
 * were three entries, and the POS discount controls that govern them a
 * fourth; the controls are this page's settings.
 */

const PromotionsPage = lazy(() => import('./PromotionsPage').then((m) => ({ default: m.PromotionsPage })));
const GiftCardsPage = lazy(() => import('./GiftCardsPage'));
const DiscountCardsPage = lazy(() => import('./DiscountCardsPage'));
const DiscountControlsPage = lazy(() => import('./DiscountControlsPage'));

export const PROMOTIONS_TABS: HubTab[] = [
  { id: 'offers', label: 'Offers', permissions: ['promotions.manage'], desc: 'Discounts, offers and promo codes', render: () => <PromotionsPage /> },
  { id: 'gift-cards', label: 'Gift cards', permissions: ['promotions.manage'], desc: 'Issue and manage gift cards', render: () => <GiftCardsPage /> },
  { id: 'discount-cards', label: 'Discount cards', permissions: ['promotions.discount_cards'], desc: 'Owner-issued percentage and fixed cards', render: () => <DiscountCardsPage /> },
  { id: 'controls', label: 'Controls', permissions: ['discounts.settings.manage'], desc: 'POS discount caps, reasons and SMS approval', render: () => <DiscountControlsPage /> },
];

export const PROMOTIONS_HUB_PERMISSIONS = hubPermissions(PROMOTIONS_TABS);

export function PromotionsHub() {
  return <HubPage base="/promotions" section="Customers & Marketing" title="Promotions" tabs={PROMOTIONS_TABS} />;
}
