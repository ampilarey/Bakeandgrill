export const POS_ORDER_TYPES = ["Dine-in", "Takeaway", "Pickup", "Delivery"] as const;
export type PosOrderType = (typeof POS_ORDER_TYPES)[number];

export type PosDeliveryDetails = {
  addressLine1: string;
  addressLine2: string;
  island: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  locationLink: string;
};

export const EMPTY_DELIVERY_DETAILS: PosDeliveryDetails = {
  addressLine1: "",
  addressLine2: "",
  island: "Male",
  contactName: "",
  contactPhone: "",
  notes: "",
  locationLink: "",
};

export { estimateDeliveryFeeMvr } from "@shared/utils/deliveryFeeEstimate";

export function normalizeMvPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("960") && digits.length === 10) return `+${digits}`;
  if (digits.length === 7) return `+960${digits}`;
  return phone.trim();
}

/** Matches backend MaldivesPhone: local mobiles starting with 3, 6, 7, or 9. */
export function isValidMvMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("960") && digits.length === 10) {
    return /^960[3679]\d{6}$/.test(digits);
  }
  if (digits.length === 7) {
    return /^[3679]\d{6}$/.test(digits);
  }
  return false;
}

type DeliveryContactFallback = {
  name?: string | null;
  phone?: string | null;
};

/** Fill empty delivery contact fields from the attached customer record. */
export function resolveDeliveryDetails(
  d: PosDeliveryDetails,
  customer?: DeliveryContactFallback | null,
): PosDeliveryDetails {
  if (!customer) return d;
  return {
    ...d,
    contactName: d.contactName.trim() || customer.name?.trim() || "",
    contactPhone: d.contactPhone.trim() || customer.phone?.trim() || "",
  };
}

type SavedAddressShape = {
  address_line1: string;
  address_line2?: string | null;
  island: string;
  contact_name: string;
  contact_phone: string;
  notes?: string | null;
  location_link?: string | null;
};

export function savedAddressToDeliveryDetails(
  address: SavedAddressShape,
  customer?: DeliveryContactFallback | null,
): PosDeliveryDetails {
  return resolveDeliveryDetails({
    addressLine1: address.address_line1,
    addressLine2: address.address_line2 ?? "",
    island: address.island,
    contactName: address.contact_name,
    contactPhone: address.contact_phone,
    notes: address.notes ?? "",
    locationLink: address.location_link ?? "",
  }, customer);
}

export function validateDeliveryDetails(
  d: PosDeliveryDetails,
  customer?: DeliveryContactFallback | null,
): string | null {
  const resolved = resolveDeliveryDetails(d, customer);
  if (!resolved.addressLine1.trim()) return "Enter the delivery address.";
  if (!resolved.island.trim()) return "Enter the delivery island/area.";
  if (!resolved.contactName.trim()) return "Enter the contact name.";
  if (!resolved.contactPhone.trim()) return "Enter the contact phone.";
  if (!isValidMvMobile(resolved.contactPhone)) {
    return "Enter a valid 7-digit Maldivian mobile number.";
  }
  return null;
}
