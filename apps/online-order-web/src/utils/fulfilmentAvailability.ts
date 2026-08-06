/**
 * Shared pickup/delivery availability — MenuPage and CheckoutPage must agree.
 */

export function isDeliveryBlocked(args: {
  /** Shop open flag from online-ordering status. null = unknown. */
  isOpen: boolean | null;
  /** Gate API `delivery_available`. */
  deliveryAvailable: boolean;
  /**
   * `fetchOrderingEligibility().delivery.accepting`.
   * null = not loaded / failed — must not block.
   */
  eligibilityAccepting: boolean | null;
  /** ServiceStatusContext `online_delivery`. */
  serviceAvailable: boolean;
  /**
   * Order is for tomorrow — today's delivery window / accepting state
   * don't apply. Only the service kill-switch and optional per-mode
   * tomorrow gate still block.
   */
  forTomorrow?: boolean;
  /**
   * Per-mode gate from status (`modes.delivery.open` today, or
   * `order_for_tomorrow.modes.delivery.open` tomorrow).
   * null/undefined = older payload — fail open (do not block).
   */
  modeGateOpen?: boolean | null;
}): boolean {
  if (!args.serviceAvailable) return true;
  if (args.modeGateOpen === false) return true;
  if (args.forTomorrow) return false;
  if (args.eligibilityAccepting === false) return true;
  if (args.isOpen === true && !args.deliveryAvailable) return true;
  return false;
}

export function isPickupBlocked(args: {
  /** ServiceStatusContext `online_pickup`. */
  serviceAvailable: boolean;
  /**
   * Per-mode gate from status (`modes.pickup.open` today, or
   * `order_for_tomorrow.modes.pickup.open` tomorrow).
   * null/undefined = older payload — fail open.
   */
  modeGateOpen?: boolean | null;
}): boolean {
  if (!args.serviceAvailable) return true;
  if (args.modeGateOpen === false) return true;
  return false;
}
