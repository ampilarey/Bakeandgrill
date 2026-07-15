/** POS-aligned payment method labels for admin UI and reports. */

export const POS_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'qr', label: 'QR' },
  { value: 'bank_transfer', label: 'Transfer' },
] as const;

export const ADMIN_ORDER_PAYMENT_METHODS = [
  ...POS_PAYMENT_METHODS,
  { value: 'bml_pay', label: 'BML Pay' },
  { value: 'other', label: 'Other' },
] as const;

export const ADMIN_EXPENSE_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Transfer' },
  { value: 'bml_pay', label: 'BML Pay' },
  { value: 'other', label: 'Other' },
] as const;

export const ADMIN_INVOICE_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'qr', label: 'QR' },
  { value: 'bank_transfer', label: 'Transfer' },
  { value: 'bml_pay', label: 'BML Pay' },
  { value: 'other', label: 'Other' },
] as const;

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '—';
  const key = method.toLowerCase();
  const known: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    card_pos: 'Card',
    qr: 'QR',
    bank_transfer: 'Transfer',
    digital_wallet: 'Transfer',
    bml_pay: 'BML Pay',
    bml: 'BML Pay',
    bml_connect: 'BML Pay',
    online: 'BML Pay',
    house_account: 'Credit',
    wallet: 'Deposit',
    customer_deposit: 'Deposit',
    gift_card: 'Gift card',
    loyalty: 'Loyalty',
    cheque: 'Cheque',
    other: 'Other',
  };
  return known[key] ?? method.replace(/_/g, ' ');
}
