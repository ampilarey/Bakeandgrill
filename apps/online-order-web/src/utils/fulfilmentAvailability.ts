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
}): boolean {
  if (!args.serviceAvailable) return true;
  if (args.eligibilityAccepting === false) return true;
  if (args.isOpen === true && !args.deliveryAvailable) return true;
  return false;
}

export function isPickupBlocked(args: {
  /** ServiceStatusContext `online_pickup`. */
  serviceAvailable: boolean;
}): boolean {
  return !args.serviceAvailable;
}
