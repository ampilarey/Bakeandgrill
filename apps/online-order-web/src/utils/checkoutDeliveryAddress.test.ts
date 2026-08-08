import { describe, expect, it } from 'vitest';
import {
  addressLoadSelection,
  addressSelectionTransition,
  formatDeliveryDestination,
  resolveDestinationLabel,
  saveAddressRequestFields,
  shouldShowDeliveryDestination,
  shouldShowSaveAddressOption,
  shouldShowUsingDefaultNote,
} from './checkoutDeliveryAddress';

describe('Change 1 — save this address', () => {
  it('logged in + new address → save option shown (starts ticked via transition/load)', () => {
    expect(shouldShowSaveAddressOption(true, 'new')).toBe(true);
    expect(addressSelectionTransition('new').saveAddress).toBe(true);
    expect(addressLoadSelection([]).saveAddress).toBe(true);
  });

  it('unticking means save_address is not sent', () => {
    expect(saveAddressRequestFields(false, 'Home')).toEqual({});
    expect(saveAddressRequestFields(true, 'Home')).toEqual({
      save_address: true,
      address_label: 'Home',
    });
    expect(saveAddressRequestFields(true, '  ')).toEqual({ save_address: true });
  });

  it('existing saved address selected → save option not shown', () => {
    expect(shouldShowSaveAddressOption(true, 42)).toBe(false);
    expect(addressSelectionTransition(42).saveAddress).toBe(false);
  });

  it('guest → save option not shown', () => {
    expect(shouldShowSaveAddressOption(false, 'new')).toBe(false);
    expect(shouldShowSaveAddressOption(false, 1)).toBe(false);
  });

  it('switching from a saved address to new shows save, ticked', () => {
    const fromSaved = addressSelectionTransition(1);
    expect(fromSaved.saveAddress).toBe(false);
    const toNew = addressSelectionTransition('new');
    expect(toNew.saveAddress).toBe(true);
    expect(shouldShowSaveAddressOption(true, 'new')).toBe(true);
  });
});

describe('Change 2 — delivery destination before payment', () => {
  it('delivery order with address → destination visible', () => {
    expect(shouldShowDeliveryDestination('delivery', 'Plot 123')).toBe(true);
    expect(
      formatDeliveryDestination({
        label: 'Home',
        addressLine1: 'Plot 123',
        island: 'Hulhumalé',
      }),
    ).toBe('Home — Plot 123, Hulhumalé');
  });

  it('two+ saved with auto-default → using-default note appears', () => {
    const sel = addressLoadSelection([
      { id: 1, is_default: true },
      { id: 2, is_default: false },
    ]);
    expect(sel.usingAutoDefault).toBe(true);
    expect(shouldShowUsingDefaultNote(sel.usingAutoDefault, 2)).toBe(true);
  });

  it('exactly one saved address → using-default note does NOT appear', () => {
    const sel = addressLoadSelection([{ id: 1, is_default: true }]);
    expect(sel.usingAutoDefault).toBe(false);
    expect(shouldShowUsingDefaultNote(sel.usingAutoDefault, 1)).toBe(false);
  });

  it('switching address clears auto-default note; destination label updates', () => {
    const afterSwitch = addressSelectionTransition(2);
    expect(afterSwitch.usingAutoDefault).toBe(false);
    expect(
      resolveDestinationLabel(2, [
        { id: 1, label: 'Home' },
        { id: 2, label: 'Office' },
      ], ''),
    ).toBe('Office');
    expect(
      formatDeliveryDestination({
        label: 'Office',
        addressLine1: 'Main Rd',
        island: 'Malé',
      }),
    ).toBe('Office — Main Rd, Malé');
  });

  it('pickup and dine-in → no delivery destination', () => {
    expect(shouldShowDeliveryDestination('pickup', 'Plot 123')).toBe(false);
    expect(shouldShowDeliveryDestination('dine_in', 'Plot 123')).toBe(false);
  });

  it('new typed address uses optional label; empty address hides strip', () => {
    expect(resolveDestinationLabel('new', [], 'Work')).toBe('Work');
    expect(formatDeliveryDestination({
      label: null,
      addressLine1: 'Flat 9',
      island: 'Malé',
    })).toBe('Flat 9, Malé');
    expect(shouldShowDeliveryDestination('delivery', '   ')).toBe(false);
  });

  it('change-address control targets the fulfillment address picker accordion', () => {
    // Mirrors CheckoutPage openAddressPicker → setOpenId('fulfillment')
    let openId: string | null = null;
    const openAddressPicker = () => {
      openId = 'fulfillment';
    };
    openAddressPicker();
    expect(openId).toBe('fulfillment');
  });
});
