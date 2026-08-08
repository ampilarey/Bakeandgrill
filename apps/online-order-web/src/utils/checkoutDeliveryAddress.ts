/**
 * Checkout delivery-address UI helpers.
 * Pure functions so save-tick / destination confirmation behaviour is unit-tested
 * without mounting the full CheckoutPage + useCheckout graph.
 */

export type AddressPickId = number | 'new';

export function shouldShowSaveAddressOption(
  isAuthenticated: boolean,
  selectedAddressId: AddressPickId,
): boolean {
  return isAuthenticated && selectedAddressId === 'new';
}

/** Payload fields for createDeliveryOrder — omit save when unticked. */
export function saveAddressRequestFields(
  saveAddress: boolean,
  addressLabel: string,
): { save_address?: boolean; address_label?: string } {
  if (!saveAddress) return {};
  const label = addressLabel.trim();
  return {
    save_address: true,
    ...(label ? { address_label: label } : {}),
  };
}

/**
 * After saved addresses load for a logged-in customer:
 * pick default (or first), never offer save for a saved pick;
 * empty list → new address with save ticked.
 */
export function addressLoadSelection(list: Array<{ id: number; is_default: boolean }>): {
  selectedId: AddressPickId;
  saveAddress: boolean;
  usingAutoDefault: boolean;
  defaultAddrId: number | null;
} {
  const defaultAddr = list.find((a) => a.is_default) ?? list[0] ?? null;
  if (!defaultAddr) {
    return {
      selectedId: 'new',
      saveAddress: true,
      usingAutoDefault: false,
      defaultAddrId: null,
    };
  }
  return {
    selectedId: defaultAddr.id,
    saveAddress: false,
    usingAutoDefault: list.length > 1,
    defaultAddrId: defaultAddr.id,
  };
}

/** Dropdown / mark-as-new transitions clear the auto-default note. */
export function addressSelectionTransition(id: AddressPickId): {
  saveAddress: boolean;
  usingAutoDefault: boolean;
} {
  if (id === 'new') {
    return { saveAddress: true, usingAutoDefault: false };
  }
  return { saveAddress: false, usingAutoDefault: false };
}

export function shouldShowDeliveryDestination(
  orderType: string,
  addressLine1: string,
): boolean {
  return orderType === 'delivery' && addressLine1.trim().length > 0;
}

export function shouldShowUsingDefaultNote(
  usingAutoDefault: boolean,
  savedAddressCount: number,
): boolean {
  return usingAutoDefault && savedAddressCount > 1;
}

export function formatDeliveryDestination(opts: {
  label?: string | null;
  addressLine1: string;
  island?: string | null;
}): string {
  const place = [opts.addressLine1.trim(), opts.island?.trim()]
    .filter((p): p is string => Boolean(p && p.length > 0))
    .join(', ');
  const label = opts.label?.trim();
  return label ? `${label} — ${place}` : place;
}

export function resolveDestinationLabel(
  selectedAddressId: AddressPickId,
  savedAddresses: Array<{ id: number; label: string | null }>,
  addressLabel: string,
): string | null {
  if (typeof selectedAddressId === 'number') {
    return savedAddresses.find((a) => a.id === selectedAddressId)?.label ?? null;
  }
  const typed = addressLabel.trim();
  return typed || null;
}
